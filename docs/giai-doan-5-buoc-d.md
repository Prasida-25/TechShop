# Giai đoạn 5 – Bước D: Quản lý đơn hàng

## Quyết định đã được người dùng xác nhận

- Chỉ chuyển tuần tự pending → confirmed → shipping → delivered; không bỏ bước/quay lùi.
- Admin chỉ hủy đơn pending, hoàn kho đúng một lần.
- Triển khai tự hủy đơn pending sau 72 giờ trong bước này.

Phạm vi MVP là COD. Đọc trạng thái thanh toán có sẵn nhưng không xây chức năng
ghi nhận thu tiền, chuyển khoản hoặc hoàn tiền. Không cập nhật payment_status khi
xem trang hay khi chuyển trạng thái giao hàng. Đơn đã thanh toán không được hủy
trong bước này vì chưa có nghiệp vụ hoàn tiền.

## Khảo sát và cách tích hợp

Đã đọc AGENTS, SQL, app/router/admin guard, checkout, repository/service/views
đơn khách và tài liệu các phần trước; đối chiếu metadata MySQL hiện tại.

Checkout khóa và trừ stock trong cùng transaction tạo orders/order_items và xóa
giỏ; đơn mới pending/cod/unpaid. orders có snapshot người nhận/địa chỉ/tổng;
order_items có tên/biến thể/SKU/quantity/unit_price. FK product/variant/address
có thể SET NULL. Không cần thay schema cho các chức năng đã triển khai.

Tái sử dụng guard admin và CSRF. Tách thêm repository/service/controller admin.
Tách hàm định dạng chi tiết snapshot trong order-service hiện có để dùng chung
cho khách/admin; giữ nguyên truy vấn giới hạn chủ đơn và hành vi trang khách.

## Chức năng

### Danh sách và chi tiết

- /admin/orders: tìm theo mã (có thể nhập #123), người nhận, điện thoại giao hàng
  hoặc tên tài khoản; lọc trạng thái; phân trang thật 20 đơn/trang.
- Input được kiểm tra, keyword escape LIKE và dùng parameterized query; ORDER BY
  cố định created_at/order_id giảm dần, OFFSET từ số nguyên backend.
- Danh sách hiển thị mã/ngày, tên khách/người nhận, tổng số lượng, tổng tiền,
  trạng thái đơn và thanh toán. Không hiển thị hash/mật khẩu hoặc dữ liệu phiên.
- Chi tiết dùng orders và order_items đã lưu để hiển thị địa chỉ, tên sản phẩm,
  biến thể, SKU, số lượng, giá mua và thành tiền. Không JOIN products/variants hoặc
  user_addresses để ghi đè lịch sử. Tên tài khoản người mua là thông tin tài khoản
  hiện tại; tên/địa chỉ người nhận vẫn lấy snapshot.
- Phí giao hàng suy ra từ tổng đã lưu trừ tổng dòng đã lưu như trang khách hiện có,
  không tính lại bằng quy tắc phí hiện tại. Nếu thiếu/lệch dữ liệu thì báo không xác
  định, không tạo phí giả. Có trạng thái rỗng, ID sai/không tồn tại và lỗi server an toàn.

### Chuyển trạng thái và hủy

- POST cần CSRF, role admin và checkbox xác nhận ở backend, không chỉ frontend.
- Form gửi expected_status để phát hiện form cũ; trạng thái chính thức luôn đọc
  lại dưới SELECT FOR UPDATE. Backend kiểm tra cả trạng thái hiện tại và bước tiếp.
- Đơn COD có payment_status unpaid/paid có thể đi theo chuỗi hợp lệ. Trạng thái
  khác/phương thức bank chỉ đọc trong MVP này, không tự suy diễn cách xử lý tiền.
- Pending hết 72 giờ không thể xác nhận. Thời hạn đọc lại bằng thời gian MySQL
  sau khi đã có khóa, tránh thời gian bắt đầu SELECT cũ khi phải chờ khóa.
- Chỉ pending/cod/unpaid được hủy. Đơn đã confirmed/shipping/delivered/cancelled
  hoặc đã thu tiền không được hủy/hoàn tiền trong bước này.

Một transaction hủy: khóa order → kiểm tra điều kiện → khóa order_items → gộp
quantity theo variant → khóa các variant theo ID tăng dần → cộng kho có điều kiện
không vượt INT → đổi status pending thành cancelled có điều kiện → commit.
Lỗi ở bất kỳ bước nào rollback cả kho và trạng thái; release connection.

Hai request cùng hủy, admin cạnh tranh tự hủy hoặc xác nhận cạnh tranh hủy đều
được tuần tự hóa bằng khóa order. Sau lần thành công, trạng thái không còn pending
nên không cộng kho lần hai; request thủ công cũ nhận 409, tác vụ tự hủy bỏ qua.
Không thay giá, địa chỉ, payment_status hoặc xóa order_items khi hủy.

### Tự hủy 72 giờ

Khi chạy **npm start**, server khởi động tác vụ quét ngay sau khi listen thành công,
rồi quét mỗi **60 giây**. Đây là tác vụ có ghi dữ liệu cho các đơn đủ điều kiện,
không phải chỉ bật trang đọc dữ liệu.

- Chỉ chọn pending/cod/unpaid với created_at <= CURRENT_TIMESTAMP - INTERVAL 72 HOUR.
- Mỗi lượt tối đa 50 đơn, có cursor để đi tiếp qua các batch; mỗi đơn có transaction
  riêng và kiểm tra lại điều kiện dưới khóa. Một đơn lỗi không rollback các đơn khác.
- Không chạy chồng tick trong cùng tiến trình. Nếu nhiều tiến trình cùng quét,
  khóa/trạng thái database vẫn ngăn hoàn kho lặp; chưa coi đây là scheduler production.
- Dừng server sẽ dừng timer, chờ lượt đang xử lý trước khi đóng pool. Khi server tắt
  không có tác vụ nền chạy độc lập; lúc khởi động lại sẽ quét các đơn quá hạn.
- Không đảm bảo đúng từng giây ở mốc 72 giờ: thường xử lý ở lượt quét kế tiếp;
  backlog nhiều đơn cần nhiều lượt. Không thêm cron, dependency hoặc cấu hình env.
- Log chỉ thông báo số đơn hủy/lỗi, không in SQL, cấu hình hoặc dữ liệu người mua.

## Routes mới

| Method | URL | Chức năng |
| --- | --- | --- |
| GET | /admin/orders | Danh sách, q/status/page |
| GET | /admin/orders/:orderId | Chi tiết snapshot và thao tác hợp lệ |
| POST | /admin/orders/:orderId/status | Chuyển trạng thái hợp lệ |
| POST | /admin/orders/:orderId/cancel | Hủy pending và hoàn kho |

Tất cả sau requireAuth/requireAdmin và trước fallback 404 trong router admin.
Không có route sửa user_id/tổng tiền/payment hoặc hủy bằng GET. Chưa thêm nút
hủy cho khách ở frontend khách hàng; yêu cầu bước này là quản trị.

## File tạo/sửa

Tạo:

- src/utils/admin-order-rules.js
- src/repositories/admin-order-repository.js
- src/services/admin-order-service.js
- src/services/order-expiry.js
- src/controllers/admin-order-controller.js
- src/views/admin/orders/index.ejs
- src/views/admin/orders/detail.ejs
- tests/helpers/admin-order-database.cjs
- tests/admin-orders.test.js
- scripts/check-admin-orders.cjs
- docs/giai-doan-5-buoc-d.md

Sửa:

- src/app.js: inject adminOrderRepository phục vụ test, đăng ký router.
- src/routes/admin.js: gắn các route đơn hàng dưới guard hiện có.
- src/server.js: khởi động/dừng tác vụ tự hủy cùng lifecycle server.
- src/services/order-service.js: dùng chung summary/formatOrderDetail, không đổi nghiệp vụ khách.
- src/views/admin/partials/start.ejs: menu Đơn hàng.
- src/views/admin/index.ejs: cập nhật các chức năng thực sự đã triển khai.
- tests/helpers/account-client.cjs: inject repository đơn admin giả lập.
- tests/admin.test.js: cập nhật kỳ vọng menu/URL chưa triển khai.

Không sửa schema/SQL gốc, .env, dependency, frontend-static, checkout/cart hoặc
giá/phí vận chuyển. Không tạo tài khoản admin, không chạy job trên database demo
trong quá trình kiểm thử.

## Kiểm thử thực tế

| Phạm vi | Lệnh | Kết quả |
| --- | --- | --- |
| Đơn admin, worker, HTTP giả lập | node --test tests/admin-orders.test.js | 8/8 nhóm đạt trong regression |
| Regression toàn dự án | npm test | 79/79 PASS |
| Tích hợp InnoDB trên instance test riêng | node scripts/check-admin-orders.cjs --run | 9/9 PASS; cleanup từng nhóm PASS |

Unit/HTTP kiểm tra: input/tìm/lọc/phân trang, snapshot và dữ liệu thiếu; chuỗi trạng
thái hợp lệ/sai, confirmation, CSRF và quyền; hủy lặp; gộp cùng variant; rollback,
thiếu variant và overflow; batch lỗi một đơn; worker start/tick/stop và log an toàn.
Database mock có mutex không được dùng để chứng minh khóa InnoDB.

9 nhóm MySQL thật dùng đúng pool test qua guard datadir/cổng/database và quyền:

1. Đặt đơn fixture qua checkout thật, chuyển pending→confirmed→shipping→delivered;
   không bỏ bước; snapshot/tổng tiền giữ nguyên, payment_status vẫn unpaid.
2. Hai connection khác nhau cùng hủy một đơn: một thành công, một 409, stock 9→10
   đúng một lần; gửi lại vẫn 409, không tăng kho tiếp.
3. Admin hủy cạnh tranh expireBatch trên đơn 73 giờ: chỉ hoàn kho một lần; xác nhận
   đơn quá hạn bị 409.
4. Mốc 73/72/71 giờ và các loại trừ: hai đơn 73/72 giờ bị hủy, 71 giờ không hủy;
   confirmed, paid hoặc bank không bị tác vụ tự hủy xử lý.
5. Fault injection trả affectedRows=0 ở lần hoàn variant thứ hai; cập nhật đầu tiên
   đã chạy trên MySQL thật nhưng rollback toàn bộ, status vẫn pending.
6. Fault injection lỗi ngay bước cập nhật status sau hoàn kho; rollback hoàn toàn.
7. Stock INT_MAX hoặc variant_id NULL: không hủy một phần, không đoán variant;
   expireBatch ghi nhận thất bại, order vẫn pending và dữ liệu giữ nguyên.
8. Xác nhận cạnh tranh hủy trên hai connection: chỉ một bên thắng; nếu confirmed
   kho vẫn 9, nếu cancelled kho 10; không có trạng thái/kho không nhất quán.
9. Worker chạy thật với interval ngắn trong test: từ đơn chưa hết hạn sang fixture
   hết hạn, lượt quét sau đổi cancelled và stock 9→10; sau đó dừng worker.

Các case rollback 5/6 là adapter test gây lỗi quanh transaction InnoDB thật,
không sửa production/constraint để tạo lỗi; không tuyên bố đó là lỗi MySQL tự phát.
Các ca service/worker MySQL không phải toàn bộ HTTP admin/MySQL end-to-end.

Runner chỉ tạo khách hàng thường và dữ liệu nhân tạo trên test, không tạo admin.
Candidate tự hủy trong runner được giới hạn vào order IDs mới để không xử lý các
đơn test cũ. Cleanup theo IDs/user mới trong transaction sau từng nhóm; hash nội
dung toàn bộ 12 bảng test trước/sau khớp. Không reset AUTO_INCREMENT. Pool đã đóng
và instance test đã dừng. Evidence: .test-runtime/admin-orders-results.json.

## Chạy và giới hạn còn lại

Chạy npm start, đăng nhập admin hợp lệ, mở /admin/orders. Lưu ý tác vụ tự hủy bắt
đầu cùng server như mô tả trên. Chọn đơn, xem snapshot, chọn xác nhận rồi chuyển
bước hoặc hủy. Form cũ trả 409: tải lại chi tiết để biết trạng thái hiện tại.

Để chạy test an toàn với instance test đã có, giữ terminal đầu chạy
node scripts/test-mysql-instance.cjs --start. Terminal khác chạy lần lượt:

~~~powershell
node scripts/check-admin-orders.cjs --run
node scripts/test-mysql-instance.cjs --stop
npm test
~~~

Không dùng npm start để chạy job kiểm thử vì nó đọc .env database demo.

Các giới hạn:

- Nếu FK lịch sử đã NULL, không còn variant, số lượng không hợp lệ hoặc hoàn kho
  sẽ vượt INT, đơn không tự chuyển cancelled; rollback và báo cần kiểm tra dữ liệu.
  Không tự sửa dữ liệu legacy, thêm cột hoặc phục dựng biến thể từ SKU/tên snapshot.
- Hoàn kho dựa trên invariant checkout hiện tại đã trừ kho khi tạo đơn. Schema
  không có sổ kho để chứng minh số lượng từng đơn legacy nhập từ hệ thống khác;
  dữ liệu nhập ngoài luồng này cần được đối chiếu riêng, không suy ra từ snapshot giá.
- Không ghi nhận người thao tác/lý do hủy bằng trường mới; không thêm audit schema.
- Đơn đã thu tiền và các phương thức ngoài COD chỉ đọc trong bước này. Chưa có
  chức năng xác nhận thu COD, hoàn tiền hoặc trả hàng; chưa chuyển sang bước E/F.
- Chưa kiểm thử visual desktop/mobile hoặc HTTP với tài khoản admin MySQL thật.
  Chưa chạy server.js trỏ database demo hoặc ngắt tiến trình giữa commit để thử lỗi.
- Scheduler chạy khi tiến trình local bật; chưa có vận hành độc lập ngoài ứng dụng.

Trong phạm vi đã kiểm thử, không còn lỗi nghiêm trọng được tái hiện. Bước D đã
triển khai theo ba quyết định được xác nhận; phần tiếp theo đề xuất là quản lý COD
với quy tắc xác nhận thu tiền được duyệt riêng, không tự gán paid khi giao thành công.
