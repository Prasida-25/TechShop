# Báo cáo Giai đoạn 3 — Tài khoản TechZone

Đã triển khai mã nguồn và kiểm thử bằng database giả lập riêng. MySQL thực tế
được kiểm tra metadata, cú pháp SQL và các route không ghi. Chưa kiểm thử thao
tác ghi tài khoản/địa chỉ trên MySQL thực tế vì không được phép tạo dữ liệu tài
khoản thử. Không kết luận những thao tác ghi đó đã chạy thành công trên MySQL.

## 1. Chức năng

- Đăng ký họ tên, số điện thoại, mật khẩu, xác nhận; Argon2id; UNIQUE; vai trò user.
- Đăng nhập bằng số điện thoại/mật khẩu, lỗi chung, session phía server và giới
  hạn thử sai tạm thời. Đăng ký xong chuyển đến đăng nhập, không tự đăng nhập.
- Đăng xuất chỉ POST, destroy session và xóa cookie.
- Hồ sơ chỉ có họ tên/số điện thoại; không lấy danh tính từ form hoặc URL.
- Thêm/sửa/xóa địa chỉ, xác nhận xóa và chuyển mặc định trong transaction khóa
  theo người dùng. Quận/Huyện tùy chọn, lưu chuỗi rỗng khi bỏ trống.
- Đổi mật khẩu yêu cầu mật khẩu cũ, không dùng lại mật khẩu, thu hồi các phiên
  cũ, buộc đăng nhập lại. Phiên có HMAC phiên bản để chống dùng phiên cũ còn sót.
- CSRF cho mọi POST; form EJS, lỗi gần trường, trạng thái rỗng/thành công và CSS
  kế thừa account.html. Header Catalog đổi theo trạng thái đăng nhập.

## 2. File tạo mới

```text
src/config/session.js
src/utils/account-validation.js
src/repositories/user-repository.js
src/repositories/address-repository.js
src/services/account-service.js
src/middleware/account-auth.js
src/middleware/csrf.js
src/middleware/login-limits.js
src/controllers/auth-controller.js
src/controllers/account-controller.js
src/routes/account.js
src/views/account/login.ejs
src/views/account/register.ejs
src/views/account/profile.ejs
src/views/account/password.ejs
src/views/account/addresses.ejs
src/views/account/message.ejs
src/views/account/partials/start.ejs
src/views/account/partials/end.ejs
src/views/account/partials/field.ejs
public/css/account.css                 # Sao chép nguyên bản từ frontend-static
public/css/account-extra.css
public/js/account-forms.js
tests/account.test.js
tests/helpers/account-database.cjs
tests/helpers/account-client.cjs
scripts/check-account.cjs
docs/giai-doan-3.md
```

## 3. File chỉnh sửa

```text
src/app.js                            # Body parser, session, xác thực, CSRF, route
src/middleware/error-handler.js        # Lỗi form, 403 CSRF, lỗi nghiệp vụ an toàn
src/views/catalog/partials/header.ejs   # Đăng nhập/đăng ký hoặc tài khoản/POST logout
src/views/catalog/partials/head.ejs     # CSS dùng chung và CSS tài khoản có điều kiện
src/controllers/catalog-controller.js  # Cache ảnh private để tránh cache cookie dùng chung
tests/catalog.test.js                  # Kiểm tra cache ảnh tương ứng
package.json                          # Dependencies và lệnh account:check
package-lock.json
README.md
```

Không sửa frontend-static, file SQL gốc hoặc .env. Hash của cả ba khớp trước/sau.

## 4. Route

```text
GET/POST /register
GET/POST /login
POST     /logout
GET      /account
POST     /account/profile
GET      /account/addresses
GET      /account/addresses?edit=ID
POST     /account/addresses
POST     /account/addresses/:addressId/update
POST     /account/addresses/:addressId/delete
POST     /account/addresses/:addressId/default
GET/POST /account/change-password
```

## 5. Database

- `users`: user_id, full_name, phone, password, role. Database tự cấp ID, phone
  có UNIQUE. SQL đăng ký gán role='user', SQL hồ sơ không sửa role/password.
- `user_addresses`: address_id, user_id, receiver_name, phone, address_detail,
  ward, district, province, is_default. Mọi thao tác địa chỉ dùng user_id đã
  xác thực và kiểm tra quyền sở hữu. Mọi thao tác ghi địa chỉ khóa dòng users
  trong transaction để tuần tự hóa các thao tác của cùng người dùng.
- `orders`: chỉ đối chiếu metadata khóa ngoại. Không có câu SQL sửa/xóa đơn.
  `address_id` SET NULL khi xóa địa chỉ; các trường bản sao nhận hàng giữ nguyên.
- Không thay đổi bảng/cột/ràng buộc, không tạo bảng session hoặc chạy dump.

## 6. Thư viện và cấu hình

Thêm express-session 1.19.0, argon2 0.45.1, csrf-sync 4.2.1,
express-rate-limit 8.7.1. Chức năng và lý do được mô tả trong README.

Session demo local dùng MemoryStore tường minh, cookie HttpOnly/SameSite=Lax,
Secure theo HTTPS, 2 giờ không hoạt động. Đăng nhập regenerate, đăng xuất destroy.
Không lưu mật khẩu hoặc hash mật khẩu trong session. Secret ngẫu nhiên chỉ trong
bộ nhớ nếu chưa có SESSION_SECRET trong môi trường; không sửa .env để thêm secret.
Production bị từ chối khởi động cho tới khi store phù hợp được duyệt. Khởi động
lại ứng dụng local làm mất session và reset bộ giới hạn đăng nhập trong bộ nhớ.

Giới hạn đăng nhập: 5 lần sai/IP+số, tối đa 30 lần sai/IP trong 15 phút; không
khóa tài khoản vĩnh viễn và không ghi cột khóa vào database. Đăng ký 10 yêu cầu/IP
trong 15 phút. HTML động không cache; ảnh vẫn có cache riêng 60 giây và ETag.

## 7. Cách chạy và kiểm tra thủ công

```powershell
npm ci
npm start
npm test
npm run account:check
npm run catalog:check
```

Mở http://127.0.0.1:3000/register. Tự đăng ký thông tin của bạn, sau đó đăng nhập
để xem `/account`, sửa hồ sơ, thêm địa chỉ và thử đổi mật khẩu. Các thao tác này
sẽ ghi vào MySQL đang cấu hình. Không có tài khoản thử hoặc mật khẩu thử nào được
tạo sẵn trong MySQL. Nếu đang chạy tiến trình cũ, dừng bằng Ctrl+C rồi chạy lại.

Số điện thoại chấp nhận dạng di động Việt Nam 10 số hoặc +84/84; chuẩn hóa về 0.
Mật khẩu 8–128 ký tự, có chữ cái Latin và chữ số. Chưa có OTP hoặc quên mật khẩu.

## 8. Kết quả thực tế

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| npm test | 22/22 nhóm đạt, gồm 12 nhóm tài khoản, 7 Catalog, 3 nền tảng |
| Tài khoản giả lập | Đi qua HTTP/controller/service/repository; Argon2 thật, session/CSRF thật, dữ liệu trong bộ nhớ |
| Trùng số đồng thời | Một đăng ký thành công, một 409; không có 500 hoặc ghi đè |
| Giả mạo ID/role | Không tạo admin, không sửa hồ sơ/mật khẩu/địa chỉ người khác |
| Địa chỉ mặc định | Hai thêm đồng thời vẫn một mặc định; lỗi giữa chừng được rollback |
| Lịch sử đơn | Kiểm thử bản sao đơn bằng dữ liệu giả lập; metadata FK MySQL xác nhận SET NULL |
| Session/CSRF | Regenerate, logout POST, chống CSRF, giới hạn 429, hủy các phiên sau đổi mật khẩu đạt |
| account:check | 13 SQL PREPARE thành công trên MySQL; câu ghi không EXECUTE |
| MySQL thật qua HTTP | Catalog/đăng nhập/đăng ký trả 200; route tài khoản khi chưa đăng nhập trả 303; đăng ký dữ liệu sai trả 422 và không ghi |
| catalog:check | 7 nhóm đạt, 83 SELECT với CTE giả lập trên MySQL; không ghi dữ liệu |
| Trình duyệt | Đăng nhập và thêm địa chỉ khi bỏ trống district thành công trên database giả lập; bố cục đã xem trên desktop |
| Cú pháp | 35 file JavaScript hợp lệ |
| Dữ liệu thật sau kiểm tra | users=0, user_addresses=0, products=24; không thêm tài khoản/địa chỉ thử |
| Bảo toàn file | Frontend gốc 5.859 file, SQL và .env có hash không đổi |

## 9. Hạn chế và phần chưa xác nhận

- Chưa kiểm thử INSERT/UPDATE/DELETE tài khoản, địa chỉ hoặc lịch sử đơn có thật
  trên MySQL. PREPARE và mock test không thay thế kiểm thử ghi MySQL thực tế.
- MemoryStore và giới hạn thử sai chỉ phù hợp demo local một tiến trình.
- Số điện thoại được kiểm tra định dạng, không xác minh chủ sở hữu bằng OTP.
- Có CSS responsive cơ bản; lượt kiểm tra trình duyệt này xác nhận bố cục desktop,
  chưa thực hiện kiểm tra tương tác đầy đủ trên điện thoại thật.

## 10. Phạm vi dừng

Không triển khai giỏ hàng, checkout, thanh toán, quản trị, đánh giá, OTP, khôi
phục mật khẩu hoặc xóa tài khoản. Dừng sau Giai đoạn 3 và chờ yêu cầu tiếp theo.
