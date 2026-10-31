# Giai đoạn 4 — Bước D: Lịch sử và chi tiết đơn hàng

## Phạm vi và route

- GET /orders: lịch sử của người dùng đã đăng nhập, 10 đơn/trang; query page.
- GET /orders/:orderId: chi tiết của người dùng đã đăng nhập.
- Header và menu tài khoản có Đơn mua; trang xác nhận checkout dẫn đến lịch sử
  và chi tiết đơn vừa tạo. Chưa đăng nhập chuyển /login?returnTo=/orders.
- Chưa xây hủy đơn, hoàn tiền, quản trị, lọc trạng thái hoặc đổi trạng thái.

## Quyền và dữ liệu lịch sử

Lấy user_id từ req.user sau middleware xác thực session; không dùng user_id hay
role trong URL/form. SQL lịch sử, đếm, header chi tiết và các dòng đều lọc chủ
sở hữu. Đơn người khác/không tồn tại/ID sai định dạng trả cùng thông báo 404;
không truy vấn các dòng khi chưa tìm được header thuộc người dùng.

Lịch sử sắp xếp created_at DESC, order_id DESC. Page sai quay về 1; vượt giới
hạn về trang cuối; trạng thái rỗng không hiển thị 1/0. OFFSET chỉ nối từ số
nguyên đã tính nội bộ, không nối trực tiếp dữ liệu query vào SQL.

Chi tiết chỉ đọc orders và order_items. Tên sản phẩm/biến thể, SKU, unit_price,
quantity và địa chỉ nhận hàng đều là bản đã lưu; không JOIN products,
product_variants hay user_addresses. FK trở thành NULL không làm mất thông tin
hiển thị nếu snapshot còn đủ. Không dùng giá/kho hiện tại để tính lại đơn cũ.

Tính tiền hàng và thành tiền bằng BigInt theo phần trăm đồng. Tổng thanh toán
hiển thị đúng total_amount đã lưu; phí giao hàng = total_amount − tiền hàng,
theo quy ước Bước C được duyệt. Không lấy mức 30.000đ hoặc ngưỡng 300.000đ hiện
tại để tính lại phí lịch sử. Thiếu chi tiết/giá không hợp lệ/tổng không khớp:
cảnh báo và ghi Không xác định cho phí, không tự sửa database hay tạo phí giả.

Ngày đặt dùng DATE_FORMAT trên DATETIME đã lưu. Trạng thái đơn/phương thức và
trạng thái thanh toán được chuyển nhãn tiếng Việt từ enum thực tế; không tự
đánh dấu đã thanh toán. Không tạo thao tác hoàn tiền khi hiển thị enum refund.

## File đã đọc

AGENTS.md, package.json, README.md, app/session/xác thực, các module giỏ/checkout,
utils tính tiền/kiểm tra dữ liệu, EJS header/footer/account/checkout, CSS hiện
có, test helper và database/techshop.sql. Đã đối chiếu cột orders/order_items
trong MySQL thực tế bằng metadata, không đọc hoặc in dữ liệu khách hàng.

## File tạo

- src/repositories/order-repository.js
- src/services/order-service.js
- src/controllers/order-controller.js
- src/routes/orders.js
- src/views/orders/index.ejs
- src/views/orders/detail.ejs
- src/views/orders/message.ejs
- public/css/orders.css
- tests/orders.test.js
- tests/helpers/order-database.cjs
- docs/giai-doan-4-buoc-d.md

## File sửa

- src/app.js: router và tiêm repository cho test.
- src/utils/account-validation.js: cho quay về /orders sau đăng nhập.
- src/views/account/partials/start.ejs: menu Đơn mua.
- src/views/catalog/partials/header.ejs: liên kết Đơn mua khi đăng nhập.
- src/views/checkout/success.ejs: liên kết lịch sử/chi tiết.
- tests/helpers/account-client.cjs: tiêm order repository giả lập.
- README.md: cách sử dụng và phạm vi.

Không cài thư viện mới; không sửa frontend-static/, database/, .env, dependencies
hoặc lockfile. Không tạo tài khoản/địa chỉ/đơn thử trong MySQL thật.

## Kiểm thử thực tế

- npm test: 44/44 đạt, gồm 6 nhóm mới và toàn bộ 38 nhóm cũ.
- Giả lập qua repository/service: quyền sở hữu, page sai/vượt giới hạn, dữ liệu
  rỗng, snapshot với FK NULL, tính tiền chính xác và phí lịch sử 45.000đ dù
  mức hiện tại là 30.000đ. Thiếu/không khớp chi tiết không hiển thị phí giả.
- HTTP/EJS giả lập: session, returnTo, không thể đổi chủ đơn bằng query user_id,
  404 chung, escape HTML, liên kết menu, CSS, rỗng và lỗi 500 không lộ SQL.
- MySQL thật: 4 SELECT PREPARE thành công; count/list/đơn không tồn tại đọc
  thành công. Database thật có 0 orders và 0 order_items; tổng stock 865 không
  đổi. Không kết luận đã hiển thị một đơn thật khi dữ liệu vẫn rỗng.
- Khởi động src/server.js với MySQL thật thành công: GET / trả 200;
  /orders và /orders/1 chưa đăng nhập trả 303; /css/orders.css trả 200.
- Hash 5.863 file frontend-static/, database/, .env, package.json và lockfile
  không đổi. Không có thao tác ghi dữ liệu/schema trong Bước D.

Test giả lập không thay thế kiểm tra một đơn có thật hoặc transaction InnoDB.
Chưa kiểm tra trực quan trên trình duyệt/mobile; EJS/CSS đã đi qua HTTP test.
Môi trường MySQL test riêng vẫn cần được duyệt trước khi kiểm thử ghi/trừ kho.

## Cách chạy

```powershell
npm start
npm test
```

Đăng nhập tài khoản của bạn và mở /orders. Database chưa có đơn sẽ hiển thị
Bạn chưa có đơn hàng nào. Nếu đã có đơn do bạn chủ động đặt, mở Xem chi tiết
để kiểm tra thông tin đã lưu. Các trang Bước D chỉ đọc, không tạo đơn hoặc trừ
kho; không cần đặt đơn thật chỉ để chạy test. Dừng sau Bước D, chưa tự triển
khai bước tiếp theo hoặc kết luận toàn bộ Giai đoạn 4 đã kiểm thử trên MySQL.
