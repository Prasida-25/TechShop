# Giai đoạn 4 — Bước B: Giỏ hàng

Chỉ triển khai giỏ hàng. Không triển khai checkout, phí giao hàng, tạo đơn,
trừ kho, hủy đơn hoặc quản trị. Không cài thư viện mới.

## Chức năng và route

| Route | Chức năng |
| --- | --- |
| GET /cart | Giỏ của người dùng hiện tại, số lượng, giá hiện tại, thành tiền/tổng |
| POST /cart/items | Thêm biến thể; gộp số lượng nếu đã có |
| POST /cart/items/:cartItemId/update | Đặt lại số lượng để tăng/giảm |
| POST /cart/items/:cartItemId/delete | Xóa dòng thuộc người dùng hiện tại |
| POST /cart/clear | Xóa toàn bộ giỏ của người dùng hiện tại |

- Yêu cầu đăng nhập, CSRF cho POST; chỉ lấy user_id từ phiên đã xác thực.
- ID/số lượng phải là chuỗi số nguyên dương; số lượng 1–99, không vượt kho.
- Sản phẩm/biến thể phải tồn tại, cấu hình thuộc tính hợp lệ và giá dương.
- Cùng biến thể có một dòng; các thay đổi khóa dòng users trong transaction,
  sau đó đọc/khóa dòng giỏ và biến thể trước khi cập nhật. Dùng UNIQUE hiện có.
- Mỗi lần xem đọc lại giá và kho, không tải BLOB trong truy vấn danh sách.
- Tính tiền từ chuỗi DECIMAL bằng BigInt theo phần trăm đồng, không dùng giá,
  tổng tiền hoặc user_id do trình duyệt gửi. Không lưu giá chính thức vào session.
- Kho giảm hoặc giá không hợp lệ: báo tại dòng, không tự xóa giỏ. Khi có lỗi,
  tổng được ghi rõ là tạm tính các dòng có giá. Giỏ chưa giữ hàng hoặc trừ kho.
- Trang chi tiết có form thêm đúng biến thể đang chọn; không hiện form mua khi
  hết hàng/giá không dương. Header dẫn đến giỏ, không hiển thị số lượng giả.

## File tạo

- src/utils/cart-validation.js
- src/repositories/cart-repository.js
- src/services/cart-service.js
- src/controllers/cart-controller.js
- src/routes/cart.js
- src/views/cart/index.ejs
- public/css/cart.css
- tests/cart.test.js
- tests/helpers/cart-database.cjs
- docs/giai-doan-4-buoc-b.md

## File sửa

- src/app.js: đăng ký router và hỗ trợ repository giả lập cho test.
- src/repositories/catalog-repository.js: xuất điều kiện biến thể hợp lệ để dùng chung.
- src/utils/account-validation.js: cho phép quay về /cart sau đăng nhập.
- src/views/catalog/partials/header.ejs: liên kết giỏ, bỏ thông báo rỗng cố định.
- src/views/catalog/detail.ejs: form thêm biến thể và số lượng, có CSRF.
- tests/helpers/account-client.cjs: tiêm repository giỏ giả lập cho kiểm thử HTTP.
- tests/catalog.test.js: kiểm tra form thêm theo biến thể và trạng thái hết hàng.
- README.md: cách sử dụng và giới hạn.

Giữ nguyên frontend-static/, database/, .env, dependencies và lockfile.

## Giới hạn cần quyết định trước Bước C

1. cart_items chỉ có ID, user_id, variant_id, quantity. Không có mốc giá/thời
   điểm thêm; chưa thể biết giá đổi so với lúc thêm, không giả vờ cảnh báo được.
   Phương án không sửa schema: yêu cầu khách duyệt giá hiện tại ở mỗi checkout,
   nhưng không thể bảo đảm chỉ rõ thay đổi từ lúc thêm. Nếu cần theo dõi bền
   vững, đề xuất cột giá tham chiếu và cập nhật mốc khi khách xác nhận; cần duyệt
   schema riêng, không thực hiện ở bước này. Mốc tham chiếu không quyết định giá bán.
2. Phí giao hàng chờ duyệt lại theo yêu cầu mới nhất. Chưa tính hoặc lưu phí.
3. Chống đơn trùng và transaction kho chưa triển khai; cần chốt phương án trước
   Bước C. Không coi việc khóa giỏ là đã chống tạo đơn trùng.
4. Không có trạng thái ngừng bán; chỉ kiểm tra tồn tại, cấu hình, giá và kho.
5. Tồn kho có thể đổi ngay sau khi xem giỏ; phải kiểm tra lại trong transaction
   đặt hàng sau này. Không cam kết giữ kho ở Bước B.

## Kiểm tra và cách chạy

```powershell
npm start
# Chạy kiểm thử giả lập, không ghi database:
npm test
```

Mở /products, chọn sản phẩm/biến thể còn hàng rồi thêm giỏ. Nếu chưa đăng nhập,
đăng nhập và quay về giỏ; thao tác thêm chưa được tự thực hiện lại. Có thể quay
lại sản phẩm để thêm. Mở /cart để nhập số lượng mới và bấm Cập nhật; thử xóa
dòng hoặc toàn giỏ. Những thao tác do bạn thực hiện trên ứng dụng sẽ ghi giỏ
của bạn vào MySQL đang cấu hình, không tạo đơn hoặc thay đổi kho.

## Kết quả thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| npm test | 29/29 đạt: 7 nhóm giỏ, 12 tài khoản, 7 catalog, 3 nền tảng |
| Giỏ giả lập | Gộp/tách biến thể, số lượng, tồn kho, giá dương, giả mạo ID/giá, quyền sở hữu, xóa, tổng tiền chính xác |
| Giá/kho đổi | Lần xem sau lấy dữ liệu mới; báo vượt kho/hết hàng/không hợp lệ, giữ dòng giỏ |
| Đồng thời và lỗi giả lập | 10 lần thêm cùng biến thể ra một dòng; rollback và release khi cập nhật/commit lỗi |
| HTTP giả lập | Session, CSRF, EJS, escape HTML, CSS, 404/422 và lỗi 500 không lộ lỗi gốc |
| SQL trên MySQL thật | 9 câu PREPARE thành công; không EXECUTE câu ghi |
| SELECT giỏ MySQL thật | Thành công, 0 dòng; cart_items/orders/order_items vẫn 0/0/0 |
| HTTP dùng dữ liệu thật, chỉ GET | Trang chủ/chi tiết/foundation/CSS trả 200; /cart chưa đăng nhập trả 303; route không tồn tại trả 404; chi tiết có form thêm đúng biến thể |
| Bảo toàn file | So hash 5.861 file trong frontend-static/, database/ và .env: không đổi |

Không chạy thêm/sửa/xóa giỏ trên MySQL thật; chưa kiểm thử thao tác ghi và khóa
đồng thời của giỏ trên InnoDB. Bộ test giả lập không thay thế kiểm thử này trên
database test riêng. Chưa kiểm tra trực quan trên trình duyệt/mobile; EJS/CSS
được kiểm tra qua HTTP tự động. Không tự tạo database test hoặc nạp dữ liệu thật.

Dừng sau Bước B, chờ duyệt riêng trước checkout và tạo đơn.
