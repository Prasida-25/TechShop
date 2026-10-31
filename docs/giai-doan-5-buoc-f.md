# Giai đoạn 5 – Bước F: Đánh giá sản phẩm theo đơn hàng

## Khảo sát và quy tắc

Đã đọc AGENTS.md, package.json, app/middleware/router hiện có, luồng và giao diện
đơn mua, partial account/catalog, CSS, SQL gốc và các test/runner đang có.
Đối chiếu metadata database hiện tại bằng SELECT information_schema, không đọc
thông tin tài khoản hoặc ghi dữ liệu demo.

Schema reviews thực tế khớp SQL:

- review_id INT là khóa chính.
- user_id → users, product_id → products, order_item_id → order_items.
- UNIQUE(user_id, product_id), UNIQUE(order_item_id).
- rating TINYINT, CHECK từ 1 đến 5.
- comment TEXT nullable, created_at DATETIME mặc định CURRENT_TIMESTAMP.
- Các FK reviews có ON DELETE CASCADE. Không thêm/xóa/sửa khóa hoặc schema.

Điều kiện theo quyết định đã chốt: người dùng có sản phẩm trong đơn của chính
mình, status delivered, tối đa một đánh giá mỗi sản phẩm (kể cả mua nhiều lần
hoặc nhiều biến thể). Không yêu cầu payment_status paid: giao thành công và xác
nhận thu COD là hai nghiệp vụ riêng; quy tắc đánh giá đã chốt là sau khi giao.

Rating bắt buộc 1–5 nguyên. Nhận xét tùy chọn, tối đa 2.000 ký tự, không chứa ký
tự điều khiển ngoài xuống dòng/tab hợp lệ. Nội dung được escape khi render EJS.

## Luồng và bảo vệ

1. Đơn mua đã giao có liên kết Đánh giá / Xem đánh giá của bạn cho từng dòng.
2. Backend nhận orderId và itemId, kiểm tra dạng ID và tìm bằng JOIN orders,
   order_items, products, đồng thời lọc orders.user_id theo phiên đăng nhập.
3. Sản phẩm/chi tiết không tồn tại, FK sản phẩm NULL hoặc không thuộc người dùng
   nhận 404, không tiết lộ dữ liệu của tài khoản khác. Chưa delivered nhận 409.
4. Form có label, select điểm bắt buộc, textarea maxlength và lỗi gần trường.
   Backend vẫn validate độc lập; POST phải có CSRF và phiên đăng nhập hợp lệ.
5. Trong transaction, SELECT FOR UPDATE khóa dữ liệu gốc; xác minh lại trạng thái
   và quyền sở hữu rồi lấy product_id từ dòng đơn, không lấy từ body.
6. Kiểm tra đánh giá hiện có, INSERT có tham số. UNIQUE bảo vệ request đồng thời;
   lỗi trùng chuyển thành 409, lock timeout/deadlock thông báo an toàn. Lỗi rollback
   và release connection. Không thay đổi đơn hàng, giá, thanh toán hoặc tồn kho.
7. Thành công redirect 303 về trang đọc đánh giá đã lưu, không hiển thị lại form.
   Truy cập từ đơn khác cùng sản phẩm cũng hiển thị đánh giá hiện có.

GET trang sản phẩm có liên kết đến trang đọc đánh giá công khai, lấy dữ liệu thật
từ reviews, phân trang 20 bản ghi, sắp xếp created_at/review_id giảm dần ổn định.
Không hiển thị số điện thoại, user_id, tên tài khoản hoặc dữ liệu đơn hàng của
người đánh giá; nhãn chung là Khách đã mua hàng. Có trạng thái chưa có đánh giá,
không có sản phẩm và lỗi tải an toàn. Không tạo sao hay số liệu giả trong catalog.

Tái sử dụng layout, màu và component account/catalog hiện có; chỉ thêm liên kết
đánh giá trong chi tiết đơn/sản phẩm, không thiết kế lại trang khách. Không có
menu quản trị đánh giá giả hoặc form chưa hoạt động. Tổng quan admin cập nhật mô
tả chức năng đã triển khai; chưa có hệ thống kiểm duyệt.

## Route

| Method | URL | Chức năng |
| --- | --- | --- |
| GET | /orders/:orderId/items/:itemId/review | Form hoặc đánh giá hiện có; yêu cầu đăng nhập, sở hữu và delivered |
| POST | /orders/:orderId/items/:itemId/review | Gửi đánh giá; kiểm tra lại toàn bộ điều kiện và CSRF |
| GET | /products/:productId/reviews | Đọc đánh giá công khai, hỗ trợ page |

Không có route sửa/xóa, ẩn hoặc kiểm duyệt. Những nghiệp vụ này chưa được duyệt.

## File tạo/sửa

Tạo:

- src/utils/review-validation.js
- src/repositories/review-repository.js
- src/services/review-service.js
- src/controllers/review-controller.js
- src/routes/reviews.js
- src/views/reviews/form.ejs
- src/views/reviews/index.ejs
- tests/helpers/review-database.cjs
- tests/reviews.test.js
- docs/giai-doan-5-buoc-f.md

Sửa:

- src/app.js: đăng ký router, inject reviewRepository phục vụ test.
- src/views/orders/detail.ejs: liên kết gửi/xem đánh giá sau giao hàng.
- src/views/catalog/detail.ejs: liên kết đọc đánh giá công khai.
- src/views/admin/index.ejs: mô tả chức năng đã có.
- public/css/orders.css: hiển thị xuống dòng nhận xét, textarea không tràn chiều rộng.
- tests/helpers/account-client.cjs: inject reviewRepository giả lập.
- scripts/check-admin-orders.cjs: thêm 4 nhóm kiểm thử reviews InnoDB, dùng harness fixture/cleanup đã có.

Không sửa .env, dependency/lockfile, frontend-static, SQL/schema hoặc nghiệp vụ
checkout/giá/phí/stock/thanh toán. Không tạo tài khoản admin hoặc dữ liệu demo thật.

## Kiểm thử đã chạy

| Lệnh/phạm vi | Kết quả thực tế |
| --- | --- |
| node --test tests/reviews.test.js | 7/7 nhóm PASS, fixture bộ nhớ và Express HTTP thật với repository giả lập |
| npm test | 91/91 PASS, gồm regression tài khoản/catalog/cart/checkout/admin/COD và reviews |
| node scripts/check-admin-orders.cjs --run | 16/16 nhóm PASS trên MySQL InnoDB riêng; 12 nhóm cũ + 4 nhóm reviews |

Các nhóm reviews unit/HTTP: dữ liệu hợp lệ; bỏ qua user_id/product_id/role giả;
khách chưa mua/chủ đơn khác/dòng không thuộc đơn; pending/confirmed/shipping/
cancelled/unknown; FK sản phẩm NULL; đánh giá trùng ở cùng và khác đơn; điểm
0/6/âm/thập phân/mảng, ID không hợp lệ, nội dung rỗng/quá dài/ký tự điều khiển;
biên điểm 1/5, nội dung 2.000 ký tự; kiểm tra lại trạng thái sau GET; rollback
insert/commit; UNIQUE và lock timeout thành 409; gửi đồng thời bằng mock; CSRF;
escape HTML ở form và trang công khai; phân trang/rỗng; không lộ SQL; link chỉ
hiện ở đơn đã giao; không có endpoint xóa.

Các nhóm MySQL reviews thực sự đã chạy:

1. Fixture checkout thật → chuyển tuần tự tới delivered → INSERT review thật;
   SELECT đối chiếu đúng user/product/order_item/rating/comment. Body giả không
   thay danh tính/sản phẩm. Giá/stock/order_items/địa chỉ/payment giữ nguyên.
   Form đọc lại và danh sách công khai trả đánh giá đã lưu; gửi lại bị 409.
2. Từ chối pending, yêu cầu giả danh chủ đơn khác, dòng thuộc
   đơn khác, điểm không hợp lệ, và dòng có product_id đã SET NULL. Không tạo review
   hoặc làm thay đổi tồn kho. Đây là fixture FK NULL, không xóa sản phẩm thật.
3. Hai connection độc lập, hai đơn đã giao của cùng khách/cùng sản phẩm gửi đồng
   thời: một thành công, một 409, SELECT có đúng một review. Thử INSERT trùng trực
   tiếp trên fixture test cũng bị MySQL ER_DUP_ENTRY, không chỉ dựa vào service.
4. INSERT chạy trên InnoDB thật, adapter test cố ý ném lỗi trước commit. Rollback
   xóa toàn bộ review vừa chèn; dữ liệu đơn và kho khớp trước test. Đây là fault
   injection ở adapter, không sửa code production/constraint để gây lỗi.

Môi trường: instance MySQL test độc lập, database techshop_test, tài khoản test
chỉ có quyền DML trong database test. openTestPool kiểm tra tên database/tài khoản
khác nguồn, datadir/cổng và grants trước khi ghi. 12 bảng InnoDB. Không chạy setup
schema, migration hoặc server.js/job tự hủy trỏ database demo.

Mỗi nhóm tạo fixture riêng, ghi ID, chỉ cleanup fixture lần chạy đó. Hash nội
dung toàn bộ 12 bảng trước/sau bằng nhau, tất cả cleanup PASS. Review fixture được
xóa theo FK CASCADE khi cleanup khách thử của chính nhóm. Không reset auto increment
và không xóa dữ liệu test có sẵn. Instance test đã dừng, pool đã đóng.

Bằng chứng nội bộ: .test-runtime/admin-orders-results.json,
runId `4c552c472c2210dd`, 16 nhóm PASS, cleanup PASS. Log HTTP lỗi trong npm test là
tình huống cố ý gây lỗi để xác minh thông báo an toàn, không phải test thất bại.

## Cách chạy

`npm start` → đăng nhập khách có đơn delivered → Đơn mua → Chi tiết đơn →
Đánh giá / Xem đánh giá của bạn → chọn 1–5 điểm và nhập nhận xét nếu muốn → Gửi.
Trang sau redirect hiển thị đánh giá đã lưu. Vào chi tiết sản phẩm → Đánh giá từ
khách đã mua để đọc công khai. Chưa có dữ liệu thì hiển thị trạng thái rỗng.

Không tạo đơn hay chuyển trạng thái trên database thật chỉ để thử đánh giá.
Lưu ý npm start vẫn khởi động tác vụ tự hủy pending 72 giờ đã được duyệt ở bước D.

Test an toàn bằng `npm test`. Khi cần InnoDB và môi trường test cũ còn tồn tại,
mở terminal chạy `node scripts/test-mysql-instance.cjs --start`, terminal khác chạy
`node scripts/check-admin-orders.cjs --run`, rồi dừng bằng
`node scripts/test-mysql-instance.cjs --stop`. Runner từ chối ghi nếu guard không
xác minh được database test riêng.

## Giới hạn và kết luận

- Chưa kiểm thử visual trên trình duyệt desktop/mobile hoặc HTTP/MySQL đầu cuối
  bằng tài khoản thật; HTTP dùng mock và transaction dùng MySQL test thật là hai
  lớp bằng chứng riêng. Không khẳng định đã kiểm thử thủ công giao diện.
- Khóa JOIN FOR UPDATE cũng khóa product hiện có khi tạo review; cách đơn giản
  bảo đảm dữ liệu gốc không bị sửa/xóa trong transaction nhưng có thể tuần tự hóa
  các đánh giá cùng sản phẩm. Phù hợp demo local; timeout/deadlock trả 409 để kiểm
  tra lại, không âm thầm tự INSERT lại.
- Nếu sản phẩm lịch sử đã mất/FK NULL, backend không đoán sản phẩm từ tên/SKU và
  không tạo đánh giá cho sản phẩm khác; trả 404 giải thích không còn sản phẩm.
- FK CASCADE của schema hiện tại có thể làm mất reviews nếu xóa cứng user/product/
  order_item ngoài ứng dụng. Chính sách giữ lịch sử và không xóa sản phẩm đã giao
  dịch vẫn áp dụng; không tự đổi constraint trong nhiệm vụ này.
- Chưa bổ sung sửa/xóa/kiểm duyệt đánh giá hoặc đánh giá riêng mỗi biến thể.
  Đánh giá gắn sản phẩm, một lần mỗi khách đúng quy tắc được duyệt.
- Trong phạm vi kiểm thử, không có lỗi nghiêm trọng được tái hiện. Bước F đã được
  triển khai; không mở rộng sang các chức năng ngoài yêu cầu.
