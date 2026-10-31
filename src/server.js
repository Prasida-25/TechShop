const http = require("node:http");
const { readPort } = require("./config/environment");
const {
  checkConnection,
  closePool,
  describeDatabaseError,
} = require("./config/database");
const app = require("./app");
const {
  createAdminOrderRepository,
} = require("./repositories/admin-order-repository");
const { createAdminOrderService } = require("./services/admin-order-service");
const { startOrderExpiry } = require("./services/order-expiry");

let server;
let stopping = false;
let orderExpiry;

async function stop() {
  if (stopping) return;
  stopping = true;
  // Giới hạn thời gian dừng để không giữ tiến trình khi còn kết nối HTTP.
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (orderExpiry) await orderExpiry.stop();
    await closePool();
  } catch {
    console.error("[Server] Không thể đóng toàn bộ kết nối.");
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

async function start() {
  let port;
  try {
    port = readPort("PORT", 3000);
  } catch {
    console.error("[Server] PORT phải là số nguyên từ 1 đến 65535.");
    process.exitCode = 1;
    return;
  }

  try {
    await checkConnection();
    console.log("[MySQL] Kết nối thành công.");
  } catch (error) {
    console.error(`[MySQL] ${describeDatabaseError(error)}`);
    process.exitCode = 1;
    await closePool();
    return;
  }

  server = http.createServer(app);
  server.on("error", async (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "[Server] Cổng đang được sử dụng. Chọn PORT khác hoặc dừng tiến trình đang dùng cổng."
        : "[Server] Không thể mở cổng HTTP. Kiểm tra PORT và quyền chạy ứng dụng.",
    );
    process.exitCode = 1;
    await stop();
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Demo local: chỉ lắng nghe trên máy hiện tại.
  server.listen(port, "127.0.0.1", () => {
    orderExpiry = startOrderExpiry(
      createAdminOrderService(createAdminOrderRepository()),
    );
    console.log(`[Server] TechZone: http://127.0.0.1:${port}/`);
  });
}

start().catch(async () => {
  console.error(
    "[Server] Không thể khởi động ứng dụng. Không in chi tiết nhạy cảm.",
  );
  process.exitCode = 1;
  await stop();
});
