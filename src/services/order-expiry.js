function startOrderExpiry(service, { intervalMs = 60000, log = console } = {}) {
  let running = false, stopped = false, active = Promise.resolve();
  async function tick() {
    if (stopped || running) return;
    running = true;
    active = (async () => {
      try {
        const result = await service.expireBatch();
        if (result.cancelled) log.info(`[Tự hủy đơn] Đã hủy ${result.cancelled} đơn quá 72 giờ và hoàn kho.`);
        if (result.failed) log.error(`[Tự hủy đơn] Có ${result.failed} đơn chưa xử lý được; cần kiểm tra chi tiết đơn và biến thể.`);
      } catch { log.error('[Tự hủy đơn] Chưa quét được đơn hết hạn. Sẽ thử lại ở lượt tiếp theo.'); }
      finally { running = false; }
    })();
    await active;
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return { tick, async stop() { stopped = true; clearInterval(timer); await active; } };
}
module.exports = { startOrderExpiry };
