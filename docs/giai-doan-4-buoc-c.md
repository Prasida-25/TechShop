# Giai đoạn 4 — Bước C: Checkout và đặt COD

Triển khai theo bốn phương án đã duyệt, không thêm thư viện hoặc sửa schema.
Chưa xây trang lịch sử/chi tiết đầy đủ thuộc Bước D, hủy đơn hoặc quản trị.

## Chức năng

- GET /checkout: giỏ hiện tại, chọn địa chỉ thuộc người dùng, phí và tổng tiền.
- POST /checkout: xác nhận giá/địa chỉ bằng token phía server, tạo đơn và trừ kho.
- GET /checkout/success/:orderId: xác nhận đơn đã ghi nhận, chỉ chủ đơn được xem.
- Thiếu địa chỉ: hướng dẫn tạo ở /account/addresses, không cho xác nhận đặt hàng.
- Giỏ trống, giá không dương, sai cấu hình biến thể, hết/vượt kho: từ chối đặt.
- Địa chỉ quận/huyện bỏ trống giữ chuỗi rỗng theo Giai đoạn 3 đã duyệt.
- Tiền hàng từ 300.000đ miễn phí, dưới ngưỡng thu 30.000đ. Tính bằng BigInt theo
  phần trăm đồng, kiểm tra giới hạn DECIMAL(12,2); không nhận giá/tổng từ frontend.
- Mới tạo: pending, cod, unpaid. Không ghi đã thu tiền hoặc đã thanh toán.

## Giá và chống lặp

Mỗi GET checkout tạo token ngẫu nhiên, buộc với user và bản đối chiếu giá, giỏ,
địa chỉ phía server. Thời hạn 20 phút; tối đa 10 bản chưa gửi/người, toàn bộ tối
đa 2.000 token còn hiệu lực trong mỗi instance ứng dụng. Token chỉ gửi trong
form POST; CSRF vẫn độc lập và bắt buộc. Không lưu giá làm nguồn chính thức vào
session. Không theo dõi giá từ lúc thêm giỏ vì schema chưa hỗ trợ, như đã duyệt.

Khi xác nhận, transaction đọc lại toàn bộ dữ liệu MySQL. Nếu giá, tên/SKU,
số lượng, dòng giỏ hoặc địa chỉ khác bản khách đã duyệt, rollback và yêu cầu tải
checkout để xác nhận lại. Thay đổi kho chỉ được chấp nhận nếu vẫn đủ số lượng.

Token chuyển pending trước await. Gửi cùng token trong khi xử lý trả 409; gửi
lại token đã thành công trả lại cùng mã đơn. Nhiều token cùng giỏ vẫn phải khóa
dòng user trong DB; token sau thấy giỏ rỗng/khác sẽ không tạo đơn mới. Checkbox
xác nhận và address_id phải khớp bản đã duyệt. Frontend chặn bấm liên tục chỉ là
hỗ trợ trải nghiệm, không phải cơ chế bảo vệ chính.

Giới hạn đã duyệt: token nằm trong bộ nhớ một tiến trình demo local; không phải
idempotency bền vững qua restart hoặc nhiều instance. Không tự retry sau lỗi
commit không rõ kết quả. Muốn bảo đảm mạnh hơn cần duyệt khóa UNIQUE trong DB.

## Transaction và lịch sử

Cùng một connection: begin → khóa users → đọc/khóa cart_items → khóa variants
theo ID tăng dần → kiểm tra địa chỉ có sở hữu bằng FOR UPDATE → tính lại/đối
chiếu dữ liệu → UPDATE stock với điều kiện stock >= quantity, kiểm tra affectedRows
→ INSERT orders → INSERT toàn bộ order_items → DELETE giỏ đúng user → commit.
Mọi lỗi rollback và release connection; không retry tự động. Không trừ kho trong
GET. Kiểm tra lại tất cả các điều kiện quan trọng ở server trong transaction.

orders lưu bản sao người nhận, điện thoại và địa chỉ. order_items lưu tên sản
phẩm/biến thể, SKU, quantity và unit_price tại lúc mua. Thay đổi dữ liệu catalog
hay địa chỉ sau này không sửa snapshot đã lưu.

orders.total_amount là tổng thanh toán cuối. Tiền hàng lịch sử là tổng
quantity × unit_price từ order_items; phí lịch sử = total_amount − tiền hàng.
Không tính lại phí đơn cũ theo quy tắc phí hiện hành. Quy ước này chưa phục vụ
giảm giá/thuế hay nhiều loại phụ phí; cần thiết kế lại khi mở rộng ngoài MVP.

## File tạo

- src/utils/checkout.js
- src/repositories/checkout-repository.js
- src/services/checkout-service.js
- src/controllers/checkout-controller.js
- src/routes/checkout.js
- src/views/checkout/index.ejs
- src/views/checkout/message.ejs
- src/views/checkout/success.ejs
- public/js/checkout.js
- tests/checkout.test.js
- tests/helpers/checkout-database.cjs
- docs/giai-doan-4-buoc-c.md

## File sửa

- src/app.js: router checkout, hỗ trợ repository giả lập.
- src/utils/account-validation.js: cho phép quay về /checkout sau đăng nhập.
- src/views/cart/index.ejs: liên kết checkout khi giỏ hợp lệ.
- public/css/cart.css: bố cục form chọn địa chỉ và xác nhận theo CSS hiện có.
- tests/helpers/account-client.cjs: tiêm repository checkout cho test HTTP.
- README.md: cách chạy và phạm vi mới.

## Chạy thử

```powershell
npm start
npm test
```

Đăng nhập → thêm hàng vào giỏ → tạo địa chỉ của bạn nếu chưa có → từ /cart đến
/checkout → chọn và Áp dụng địa chỉ → kiểm tra giá/tổng → đánh dấu xác nhận →
đặt COD. Đặt hàng qua ứng dụng sẽ ghi orders/order_items, trừ stock và xóa giỏ
trên database đang cấu hình; chỉ thực hiện với dữ liệu mà bạn muốn đặt thật.
Không có dữ liệu khách hàng/địa chỉ/đơn thử được tự thêm vào MySQL thật.

## Kiểm thử và giới hạn

Test tự động dùng database giả lập riêng, đi qua repository và transaction giả
lập; HTTP test dùng session, CSRF, EJS thật. Giả lập tuần tự hóa transaction để
kiểm tra thuật toán, không chứng minh khóa, deadlock hoặc isolation của InnoDB.
Không chạy đặt đơn/trừ kho trên MySQL thật. PREPARE chỉ kiểm tra SQL, không
EXECUTE câu ghi.

| Kiểm tra thực tế | Kết quả |
| --- | --- |
| npm test | 38/38 đạt, gồm 9 nhóm checkout mới và 29 nhóm giỏ/tài khoản/catalog/nền tảng |
| Transaction giả lập | Tạo đơn/snapshot thành công; lỗi kho biến thể thứ hai, INSERT đơn/chi tiết, xóa giỏ hoặc commit đều rollback |
| Giá/địa chỉ/kho | Thay đổi giá, giỏ, địa chỉ, địa chỉ mất, biến thể sai/hết hàng bị từ chối; khách duyệt lại giá mới rồi đặt được |
| Gửi lặp giả lập | Cùng token, nhiều token cho cùng giỏ, hai khách tranh một hàng: không tạo thêm đơn ngoài ý muốn hoặc kho âm |
| HTTP giả lập | Session/CSRF, EJS, thoát HTML, thiếu địa chỉ, thành công, quyền xem xác nhận và lỗi DB an toàn đạt |
| SQL MySQL thật | PREPARE 7 câu SQL mới đạt, không EXECUTE câu ghi; SELECT preview thành công, giỏ/địa chỉ trống |
| Khởi động thật | src/server.js kết nối MySQL và mở HTTP được; GET trang chủ 200, checkout/success chưa đăng nhập 303, CSS/JS 200 |
| Database thật trước/sau | orders=0, cart_items=0, tổng stock=865, không đổi; không chạy đặt đơn thử |
| Bảo toàn file | 5.863 file frontend-static/, database/, .env, package.json và lockfile có hash không đổi |

Chưa kiểm thử transaction/ghi đơn/trừ kho thật trên MySQL; không kết luận các
test tranh kho giả lập đã xác minh khóa hoặc isolation thực tế của InnoDB.

Đề xuất môi trường test MySQL, chưa tạo: database riêng như techshop_test, tài
khoản chỉ có quyền trên database đó; dựng schema rỗng đã đối chiếu, chỉ nạp fixture
nhân tạo (không sao chép users/địa chỉ/đơn thật). Cấu hình test riêng ngoài Git,
script phải kiểm tra DB_NAME kết thúc bằng _test trước thao tác ghi. Chạy thử
hai connection đồng thời tranh kho và kiểm tra rollback trong database test.
Việc tạo database, quyền và nạp fixture cần người dùng duyệt riêng trước khi chạy;
không dùng dump chứa DROP làm script khởi động hoặc chạy trên DB hiện tại.

Chưa kiểm tra trực quan trên trình duyệt/mobile; CSS kế thừa breakpoint hiện có.
Dừng sau Bước C, chờ duyệt Bước D và môi trường kiểm thử MySQL riêng.
