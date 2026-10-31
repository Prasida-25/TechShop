# Giai đoạn 5 – Bước E: Quản lý thanh toán COD

## Quy tắc đã được duyệt

Người dùng xác nhận: admin chỉ được ghi nhận đã thu COD khi đơn có status
`delivered`, payment_method `cod` và payment_status `unpaid`. Thao tác riêng
chuyển payment_status sang `paid`, sau khi admin xác nhận đã nhận đủ tiền.

Đây là ghi nhận thủ công, không phải thu tiền trực tuyến hoặc xác minh giao dịch
với đơn vị vận chuyển. Không bổ sung bank, hoàn tiền, webhook hay trạng thái mới.

## Khảo sát và triển khai

Đã đọc AGENTS.md, SQL gốc, repository/service/controller/router đơn admin,
template chi tiết/tổng quan, test helper, bộ test đơn và runner MySQL riêng.

Schema hiện có đủ payment_method/payment_status trong orders; không có bảng
payment riêng. Enum chứa bank/refund nhưng MVP không triển khai thao tác cho
những giá trị này. Tiếp tục hiển thị dữ liệu đã lưu trên danh sách/chi tiết.

Route mới: **POST /admin/orders/:orderId/confirm-cod**.

- Dùng guard đăng nhập/admin hiện có; quyền đọc lại từ tài khoản server mỗi request.
- CSRF và checkbox confirm=1 bắt buộc; ID kiểm tra ở backend.
- Không nhận số tiền, trạng thái đích, role hoặc user_id từ form làm nguồn quyết định.
- Transaction: SELECT order FOR UPDATE → kiểm tra điều kiện → UPDATE có điều kiện
  delivered/cod/unpaid thành paid → commit; lỗi rollback và release connection.
- Đơn delivered/cod đã paid: trả thành công nhưng không chạy UPDATE lần nữa.
  Hai request đồng thời được tuần tự hóa bằng khóa row trên MySQL.
- Các trường hợp chưa giao/đã hủy/bank/refund/giá trị không biết bị từ chối 409;
  ID sai/không tồn tại 404, thiếu xác nhận 422, thiếu quyền/CSRF bị chặn.
- Không đổi status giao hàng, tổng tiền, order_items, địa chỉ hoặc tồn kho.
- Không thêm route GET xác nhận thanh toán. GET chi tiết và chuyển trạng thái
  giao hàng tiếp tục không cập nhật payment_status.
- Chỉ hiển thị form ở đơn đủ điều kiện, cùng tổng thanh toán đã lưu trong đơn.
  Thông báo thu COD sau redirect chỉ hiển thị nếu dữ liệu đọc lại thực sự đã paid/cod.
- Sử dụng layout/CSS admin hiện có, không sửa giao diện khách hàng.

## File thay đổi

Tạo:

- tests/admin-payments.test.js: 5 nhóm test service/repository/HTTP/EJS bằng fixture bộ nhớ.
- docs/giai-doan-5-buoc-e.md: tài liệu này.

Sửa:

- src/repositories/admin-order-repository.js: transaction xác nhận COD và câu UPDATE có điều kiện.
- src/services/admin-order-service.js: validate xác nhận, điều kiện hiển thị và xử lý lock timeout an toàn.
- src/controllers/admin-order-controller.js: POST xác nhận, redirect và thông báo theo dữ liệu đã lưu.
- src/routes/admin.js: gắn route POST dưới guard hiện có.
- src/views/admin/orders/detail.ejs: form xác nhận đã nhận đủ COD cho đơn đủ điều kiện.
- src/views/admin/index.ejs: mô tả chức năng thanh toán COD đã có.
- tests/helpers/admin-order-database.cjs: mô phỏng câu UPDATE cho test.
- scripts/check-admin-orders.cjs: thêm 3 nhóm COD trên MySQL test và adapter gây lỗi trước commit.

Không sửa .env, dependency/lockfile, SQL/schema, frontend-static, checkout/cart
hoặc quy tắc giá/phí vận chuyển. Không tạo tài khoản admin trong MySQL.

## Kiểm thử đã chạy

| Kiểm tra | Lệnh | Kết quả |
| --- | --- | --- |
| Regression trước triển khai | npm test | 79/79 PASS |
| Regression sau triển khai, gồm 5 nhóm COD | npm test | 84/84 PASS |
| Transaction/cạnh tranh thực tế InnoDB | node scripts/check-admin-orders.cjs --run | 12/12 PASS, gồm 9 nhóm bước D và 3 nhóm COD |

Unit/HTTP kiểm tra xác nhận thành công, gửi lại, gửi đồng thời bằng mock, giả mạo
trạng thái/tổng/user_id, thiếu xác nhận, ID sai/không tồn tại, đơn chưa giao/đã hủy,
bank/refund/trạng thái không biết, rollback lỗi ghi/affectedRows=0/lỗi trước commit,
lock timeout/deadlock trả thông báo an toàn, quyền admin và CSRF. Test HTTP dùng
Express thật với session/tài khoản/repository giả lập; không phải HTTP/MySQL đầu cuối.

Ba nhóm COD MySQL thật:

1. Tạo fixture qua checkout hiện có, chuyển tuần tự tới delivered. Đọc chi tiết
   không thay dữ liệu. Hai connection độc lập cùng xác nhận: một trả true, một
   false; payment_status paid, gửi lại không ghi thêm. Snapshot giá/địa chỉ/items,
   trạng thái giao hàng và stock không đổi.
2. Từ chối pending/confirmed/shipping/cancelled, bank và refund; SELECT sau từng
   lần cho thấy dữ liệu không thay đổi.
3. UPDATE thực sự chạy trên MySQL trong transaction, adapter test ném lỗi trước
   commit; SELECT sau rollback cho thấy payment_status còn unpaid và dữ liệu khác
   giữ nguyên. Đây là fault injection ở adapter test, không sửa code production.

Database techshop_test nằm trên instance riêng được openTestPool kiểm tra datadir,
cổng, tên database và quyền tài khoản chỉ DML trên test. Các bảng là InnoDB; không
chạy setup schema. Mỗi nhóm chỉ cleanup fixture IDs tạo trong lần chạy; hash nội
dung 12 bảng trước/sau khớp, cleanup PASS. Instance đã dừng, dữ liệu test có sẵn
được giữ lại. Evidence tại .test-runtime/admin-orders-results.json,
runId `6b5027246ab5d008` (file nội bộ bị Git ignore).

Không chạy server.js/job tự hủy trên database demo và không ghi database demo.
Các dòng log lỗi HTTP trong regression đến từ test cố ý gây lỗi, không phải
test bị thất bại. Hai lần chạy test COD ban đầu phát hiện kỳ vọng sai của test
về response headers và CSRF sau logout; đã sửa test theo helper/middleware hiện
có, không thay đổi nghiệp vụ hoặc hạ bảo vệ CSRF.

## Cách chạy và kiểm tra

Chạy `npm start`, đăng nhập tài khoản admin hiện có, mở `/admin/orders`, chọn đơn
delivered/cod/unpaid. Kiểm tra tổng tiền, chỉ khi thực sự đã nhận đủ tiền mới chọn
checkbox và bấm **Xác nhận đã thu COD**. Trang tải lại hiển thị đã thanh toán và
không còn form xác nhận. Gửi lại POST cùng đơn không thay dữ liệu lần nữa.

Lưu ý npm start vẫn khởi động tác vụ tự hủy pending 72 giờ đã duyệt ở bước D.
Để chỉ chạy kiểm thử an toàn, dùng `npm test`; không dùng server demo để đặt đơn thử.

Với môi trường MySQL test riêng đã có, giữ terminal đầu chạy
`node scripts/test-mysql-instance.cjs --start`, terminal khác chạy
`node scripts/check-admin-orders.cjs --run`, sau đó
`node scripts/test-mysql-instance.cjs --stop`. Runner dừng trước thao tác ghi nếu
không xác minh được môi trường test độc lập.

## Giới hạn và bước tiếp theo

- Schema chưa có paid_at hoặc received_by/audit log. Chỉ có payment_status và
  updated_at dùng chung; không coi updated_at là thời điểm thu tiền cố định.
  Muốn lưu người xác nhận/thời điểm/lịch sử thu tiền cần đề xuất và duyệt riêng.
- Chưa kiểm thử visual desktop/mobile hoặc đăng nhập admin MySQL thật rồi thao tác
  HTTP đầu cuối. Không tạo admin thử trên database đang dùng.
- Không kiểm chứng mất kết nối đúng thời điểm commit hoặc server crash; có kiểm thử
  gửi lại và khóa row thật, không suy ra đã chứng minh mọi lỗi mạng.
- Không có hoàn tiền hoặc đảo paid về unpaid; bank/refund chỉ đọc.
- Bước E hoàn thành trong phạm vi đã kiểm thử. Chưa triển khai Bước F – Đánh giá.
