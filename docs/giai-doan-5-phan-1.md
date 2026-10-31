# Giai đoạn 5 – Phần 1: Phân quyền và nền quản trị

## Phạm vi và kết quả khảo sát

Đã đọc schema SQL và metadata MySQL hiện tại bằng SELECT information_schema.
Không chạy dump hoặc câu lệnh ghi dữ liệu. Các bảng/cột và liên kết cần cho khảo
sát khớp schema đã đọc:

- `users`: `user_id`, `full_name`, `phone`, `password`, `role`, `created_at`;
  `role` là enum user/admin, mặc định user. Điện thoại UNIQUE.
- `products`: tên, danh mục, thương hiệu, mô tả, BLOB/MIME; chưa có trạng thái
  ẩn/ngừng bán. `product_variants`: product_id, SKU UNIQUE, tên, price, stock,
  ảnh; CHECK giá và tồn kho không âm. Có các bảng options/values/liên kết biến thể.
- `orders`: trạng thái pending/confirmed/shipping/delivered/cancelled;
  payment_method cod/bank, payment_status paid/unpaid/refund. MVP chỉ tạo COD
  pending/unpaid. Không có bảng payment riêng trong schema.
- `order_items` giữ tên, biến thể, SKU, quantity, unit_price tại lúc mua.
  FK product/variant và FK địa chỉ orders dùng SET NULL; orders có snapshot địa chỉ.
- `reviews` đã có user_id, product_id, order_item_id, rating, comment, created_at;
  UNIQUE(user_id, product_id), UNIQUE(order_item_id), CHECK rating 1–5. Có FK tới
  users/products/order_items. Các FK này chưa tự chứng minh user mua đúng sản phẩm;
  phần đánh giá sau phải kiểm tra bằng backend và trạng thái delivered.

Chưa có module quản trị, middleware admin hoặc module đánh giá trong code.
Session hiện tại chỉ giữ userId/authVersion; loadUser gọi sessionUser đọc lại user
từ repository mỗi request, kiểm tra role hợp lệ và HMAC của hash mật khẩu.
Đăng ký luôn lưu role user; cập nhật hồ sơ không cập nhật role. Đây là nền xác
thực được tái sử dụng, không tạo một hệ đăng nhập admin thứ hai.

**Phần 1 không cần thay đổi schema.** Thiếu trạng thái ngừng bán/vô hiệu hóa là
vấn đề cho các phần sau, không phải lý do tự thêm cột ở phần này. Chưa quyết định
hoặc triển khai chuyển trạng thái đơn, ghi nhận COD, hủy/hoàn kho, upload ảnh hay review.

## Đã triển khai

- `GET /admin`: trang nền quản trị EJS, hiển thị tên người đang đăng nhập từ server.
- Guard toàn bộ prefix `/admin`, mọi HTTP method: requireAuth rồi requireAdmin.
  Khách chưa đăng nhập chuyển về login; user thường nhận 403; chỉ role chính xác
  admin từ req.user được đi tiếp. Guard mặc định từ chối role thiếu/sai kiểu.
- Chỉ cho phép returnTo chính xác `/admin` trong allowlist sẵn có; không nhận URL
  ngoài hoặc chuỗi đường dẫn tùy ý. requireAuth dùng baseUrl khi được mount tại
  prefix, để GET /admin quay lại đúng trang sau login thay vì /account.
- URL/hành động quản trị chưa tồn tại trả 404 sau khi đã kiểm tra quyền. Ví dụ
  GET/POST /admin/products hiện chưa là chức năng quản lý sản phẩm.
- Giữ middleware CSRF chung trước router admin, không miễn trừ admin khỏi CSRF.
  Unsafe request thiếu/sai CSRF có thể bị 403 trước kiểm tra role; request có
  CSRF đúng vẫn phải qua cả xác thực và role.
- Layout admin riêng, header/footer dùng chung cho trang nền và thông báo; dùng
  font/màu/button base.css hiện có. CSS admin chỉ tải trong layout admin. Có
  điều hướng Tổng quan, Xem cửa hàng, Tài khoản và form POST đăng xuất có CSRF.
- Không có menu dẫn tới chức năng chưa triển khai; không thống kê giả, không có
  thao tác cập nhật dữ liệu admin. CSS có breakpoint 640px, focus và skip link.
- Giữ no-store trên response có phiên đăng nhập; EJS escape tên hiển thị.

Các route admin mới trong phần sau phải đặt **sau guard và trước handler 404**
trong `src/routes/admin.js`; không mount handler thay đổi dữ liệu bên ngoài guard.

## File tạo/sửa

Tạo:

- src/middleware/admin-auth.js: kiểm tra role admin từ user đã xác thực.
- src/routes/admin.js: guard prefix, GET trang nền và fallback quản trị.
- src/controllers/admin-controller.js: render trang nền/thông báo 404.
- src/views/admin/index.ejs và message.ejs.
- src/views/admin/partials/start.ejs và end.ejs: layout riêng.
- public/css/admin.css: style phạm vi admin, dùng base.css.
- tests/admin.test.js: unit và HTTP trên database giả lập.
- docs/giai-doan-5-phan-1.md: tài liệu phần này.

Sửa:

- src/app.js: đăng ký router admin sau loadUser/CSRF, trước các router khách hàng.
- src/middleware/account-auth.js: lấy baseUrl khi xác định returnTo tại middleware
  mount theo prefix; giữ nguyên kiểm tra xác thực và no-store.
- src/utils/account-validation.js: thêm chính xác /admin vào allowlist returnTo.

Không sửa frontend-static, SQL, .env, package/dependency hoặc repository/service
nghiệp vụ Giai đoạn 1–4. Không tạo hay nâng quyền tài khoản trên MySQL.

## Kiểm thử thực tế

| Kiểm tra | Cách chạy | Kết quả |
| --- | --- | --- |
| 6 nhóm quyền quản trị | node --test tests/admin.test.js | 6/6 PASS |
| Regression Giai đoạn 1–4 và admin | npm test | 64/64 PASS, bao gồm 8 test con fixture thanh toán |
| Schema có role admin/liên kết liên quan | SELECT information_schema.COLUMNS và KEY_COLUMN_USAGE | Khớp SQL đã đọc; không đọc mật khẩu người dùng |

6 nhóm test admin bao gồm:

1. Khách chưa đăng nhập, cookie sai, redirect login và allowlist returnTo.
2. User thường bị chặn GET/POST/PUT/PATCH/DELETE kể cả gửi role/is_admin/user_id
   qua form, query, header hoặc thêm field role tùy ý trong session store giả lập.
3. Admin fixture render trang nền, escape tên chứa HTML; CSS/font được phục vụ,
   link chưa triển khai không xuất hiện; route không có trả 404; request không
   tạo thêm câu lệnh ghi qua repository.
4. Thiếu CSRF hoặc token của session khác bị chặn cho các unsafe methods;
   logout cần CSRF; logout thành công khiến cookie cũ không truy cập admin được.
5. Role trong repository đổi admin→user được áp dụng ngay request kế tiếp;
   thay hash hoặc xóa user fixture khiến session cũ bị từ chối.
6. Unit guard fail-closed với user thiếu, role sai chữ hoa hoặc sai kiểu.

Fixture admin chỉ là role trong **database giả lập trong bộ nhớ của test**;
không phải tài khoản admin được tạo trong MySQL. Chạy test không cần tài khoản
admin thật và không truy vấn database thật để tạo user.

Trong lần phát triển có một test phát hiện redirect dùng req.path sau mount
prefix quay về /account. Đã sửa cách lấy baseUrl, chạy lại 6/6 và 64/64 đạt.

Chưa kiểm thử:

- Login bằng tài khoản admin MySQL thực: chưa dùng hoặc tạo tài khoản admin trên
  database demo, không tự chọn mật khẩu hay nâng role.
- Phân quyền với session/admin fixture trên MySQL test: chưa chạy ở phần này;
  không lấy kết quả mock làm bằng chứng tích hợp MySQL.
- QA trực quan bằng trình duyệt desktop/mobile: chưa thực hiện. HTTP kiểm tra
  render và tài nguyên, CSS responsive đã viết, chưa coi đó là chứng nhận hình ảnh.
- Tạo/sửa sản phẩm, tồn kho, trạng thái đơn, COD, hủy/hoàn kho và đánh giá: chưa
  triển khai nên không gắn PASS cho các chức năng này.

## Chạy và kiểm tra trên máy

1. Chạy `npm start` như hiện tại.
2. Mở `/admin` khi chưa đăng nhập: chuyển tới `/login?returnTo=%2Fadmin`.
3. Đăng nhập bằng tài khoản thường: `/admin` trả 403; Catalog/Account vẫn hoạt động.
4. Nếu đã có tài khoản được quản lý hợp lệ với role admin, dùng login số điện thoại
   và mật khẩu hiện có rồi mở `/admin`. Trang nền hiện tên người đó và menu nêu trên.
5. Dùng form đăng xuất; truy cập lại `/admin` phải yêu cầu đăng nhập.

Không có tài khoản admin mặc định, không có mật khẩu mẫu trong code production,
không có API đổi role. Nếu máy chưa có tài khoản admin, cần người dùng quyết định
riêng việc cấp quyền; không cung cấp hoặc tự chạy câu lệnh nâng quyền trong phần này.

## Các quyết định trước phần tiếp theo

Phần 1 đã hoàn thành trong phạm vi test nêu trên, không có lỗi nghiêm trọng còn
mở qua các test đã chạy. Dừng tại đây, chưa triển khai Phần 2.

Trước quản lý sản phẩm cần chốt chính sách ẩn/ngừng bán và xóa vật lý. Schema
chưa có trạng thái; có thể làm danh sách/thêm/sửa bằng schema hiện tại, còn chức
năng ngừng bán cần duyệt phương án riêng. Không được dùng hết hàng làm ngừng bán
hoặc xóa sản phẩm có giao dịch chỉ vì FK cho phép SET NULL. Khi triển khai đơn và
COD phải chốt các chuyển đổi hợp lệ, thời điểm xác nhận thu tiền, điều kiện hủy
và hoàn kho đúng một lần; không suy diễn từ các enum cho phép mọi chuyển đổi.
