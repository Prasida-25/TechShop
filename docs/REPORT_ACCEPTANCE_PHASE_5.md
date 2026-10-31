# BÁO CÁO NGHIỆM THU GIAI ĐOẠN 5 – TECHSHOP

Ngày đánh giá: 23/10/2026, múi giờ UTC+7. Thương hiệu giao diện: TechZone.

## A. Tổng quan

**Kết luận: CHƯA ĐỦ BẰNG CHỨNG để ký nghiệm thu đầy đủ trong lần đánh giá này.**

Các chức năng chính đã được triển khai. Lần này chạy thành công **91/91 test an
toàn** và kiểm tra đọc dữ liệu MySQL thực tế. Không tái hiện lỗi Critical/High.
Tuy nhiên, còn tiêu chí quan trọng BLOCKED do nhiệm vụ cấm test ghi database,
cùng các kiểm tra giao diện và vận hành chưa thực hiện. Không coi mock là bằng
chứng mới cho transaction InnoDB hoặc nâng BLOCKED thành PASS.

### A.1. Kết quả theo loại bằng chứng

| Phạm vi | Kết quả | Ý nghĩa |
| --- | --- | --- |
| Test chạy trong lần này | 91 PASS, 0 FAIL, 0 skipped/cancelled | node:test, gồm test thành phần và HTTP Express/EJS với repository giả lập |
| Bảng nghiệm thu bên dưới | 73 tiêu chí: 55 PASS, 0 FAIL, 13 BLOCKED, 5 NOT TESTED | PASS có giới hạn tầng kiểm tra được ghi ở từng dòng; không phải 73 bài test độc lập |
| MySQL hiện tại, chỉ đọc | PASS cho các phép SELECT được mô tả ở A.4 | Không chứng minh thao tác ghi/transaction/concurrency |
| Bằng chứng MySQL sản phẩm từ lần trước | 7/7 PASS, cleanup PASS | Đã đọc artifact và runner; không chạy lại trong nhiệm vụ này |
| Bằng chứng MySQL đơn/COD/review từ lần trước | 16/16 PASS, cleanup PASS | Đã đọc artifact và runner; không chạy lại trong nhiệm vụ này |

BLOCKED trong báo cáo **không có nghĩa test đã thất bại hoặc không có database
test**. Môi trường test và runner đã tồn tại; lần này không được phép chạy thao
tác ghi nên chỉ đọc bằng chứng cũ. Phân quyền, trạng thái và điều kiện đánh giá
đều đã được kiểm tra runtime ở tầng HTTP/mock hoặc service/mock; đường đi đầy đủ
HTTP → session/tài khoản MySQL → transaction MySQL chưa được xác minh lần này.

### A.2. Chức năng đã có

- Guard toàn bộ khu vực /admin; danh tính từ session được xác minh lại qua user
  repository mỗi request, role từ database, không từ request hoặc menu.
- Danh sách/tìm kiếm/phân trang sản phẩm; thêm/sửa sản phẩm, ảnh BLOB và biến thể
  mặc định; thêm/sửa biến thể, SKU, giá, stock và lựa chọn thuộc tính hiện có.
- Kiểm tra stock dưới khóa và expected_stock để từ chối form cũ sau giao dịch.
- Danh sách/tìm/lọc/phân trang đơn; chi tiết dùng snapshot đơn và order_items.
- Chuyển tuần tự pending → confirmed → shipping → delivered. Admin chỉ hủy
  pending/cod/unpaid, hoàn kho trong transaction. Có tác vụ tự hủy sau 72 giờ.
- Hiển thị thanh toán độc lập trạng thái giao hàng. Xác nhận thu COD bằng POST
  riêng cho delivered/cod/unpaid; request lặp với đơn paid không ghi lần hai.
- Đánh giá từ dòng đơn đã giao thuộc người dùng hiện tại; điểm 1–5; tối đa một
  lần mỗi sản phẩm/người dùng; trang đọc công khai có phân trang và trạng thái rỗng.
- Có CSRF, validation backend, truy vấn tham số, escape HTML, lỗi an toàn và các
  layout/partial EJS dùng chung trong phạm vi tương ứng.

### A.3. Chưa triển khai hoặc bị giới hạn

- Ẩn/ngừng kinh doanh sản phẩm và vô hiệu hóa tài khoản: schema chưa có trạng
  thái phù hợp, chưa được duyệt thay đổi. BLOCKED nếu đưa vào phạm vi nghiệm thu;
  đây là phần đã được hoãn, không được tính như đã hoàn thành.
- Không có xóa sản phẩm/biến thể vật lý trong router hiện tại. Chính sách giữ
  lịch sử được bảo vệ bằng cách không cung cấp thao tác xóa tùy tiện.
- Chưa sửa/xóa/ẩn/kiểm duyệt review; chưa chốt nghiệp vụ các thao tác này.
- Không có chuyển khoản, cổng thanh toán, refund tự động hoặc webhook. Enum
  bank/refund có trong schema để đọc dữ liệu, không chứng minh đã triển khai chúng.
- Chưa có paid_at/received_by hoặc audit trail quản trị riêng; updated_at dùng
  chung không thay thế thời điểm/người thu COD. Không phải yêu cầu bắt buộc đã duyệt.
- MemoryStore, timer và token checkout trong bộ nhớ phù hợp demo local; không
  nghiệm thu vận hành production, nhiều instance hoặc idempotency bền vững.

### A.4. Phạm vi, phương pháp và lệnh đã thực hiện

Đường dẫn gốc áp dụng cho các file trong báo cáo:
`D:\Duong\Đồ án cơ sở\TechShop`.

Đã đọc các nhóm file sau:

- AGENTS.md, package.json, README.md, database/techshop.sql, tài liệu giai đoạn 5
  trong docs và các artifact test cũ nêu ở A.5.
- src/app.js, src/server.js, config/database.js, config/session.js;
  middleware/account-auth.js, admin-auth.js, admin-product-form.js, csrf.js,
  error-handler.js; các điểm sessionUser/regenerate trong account-service và auth-controller.
- routes/admin.js, reviews.js, orders.js, catalog.js; các controller/service/
  repository/validation cho admin-product, admin-order, review; order-service và
  order-repository; checkout-service/repository, order-expiry và admin-order-rules.
- views/admin/partials, tổng quan, sản phẩm/biến thể, danh sách/chi tiết đơn;
  views/reviews, views/orders/detail, views/catalog/detail và partial account/catalog;
  CSS admin/account/orders có liên quan. Không sửa frontend-static.
- tests/admin.test.js, admin-products.test.js, admin-orders.test.js,
  admin-payments.test.js, reviews.test.js; các test regression account, catalog,
  foundation, cart, checkout, orders, purchase-flow và helper giả lập liên quan.
- scripts/check-admin-products.cjs, check-admin-orders.cjs, test-db-config.cjs:
  chỉ đọc cách chạy, guard và cleanup, không thực thi runner ghi.

Lệnh/thao tác thực tế:

1. rg/Get-Content để khảo sát, rà test sử dụng filesystem/MySQL/process trước khi chạy.
2. `git status --short`: báo không phải Git repository. Không có diff Git để đối
   chiếu, không checkout/reset/stash/commit. Một lệnh rg với glob Windows ban đầu
   không khớp tên file; đã đọc trực tiếp các file cần kiểm tra, không coi đó là test lỗi ứng dụng.
3. `npm test`: exit 0, tests=91, pass=91, fail=0. Test dùng fixture trong bộ nhớ;
   request POST chỉ tác động mock. Không tạo tài khoản, đơn, giỏ hoặc review MySQL.
4. SELECT VERSION(), information_schema.TABLES/COLUMNS/KEY_COLUMN_USAGE bằng pool
   hiện tại; không in thông số kết nối hoặc bí mật. Xác nhận MySQL 8.0.46, 12 bảng
   InnoDB, các trường/enum/FK liên quan khớp SQL đã đọc.
5. Kiểm tra đọc thực tế qua admin-product/admin-order/review service và repository
   được bọc adapter chỉ cho câu bắt đầu SELECT, getConnection bị cấm: **15 SELECT,
   0 connection ghi**. Kết quả có 24 sản phẩm, trang đầu 20, chi tiết một sản phẩm
   có 3 biến thể; 1 đơn, chi tiết có 1 dòng. Đối chiếu trực tiếp status/payment/
   total/receiver/address cùng product_name/variant_name/SKU/quantity/unit_price
   của đơn với SELECT gốc: khớp. Trang review của sản phẩm được chọn có 0 đánh giá.
   Không công bố tên/điện thoại/địa chỉ khách hoặc nội dung sản phẩm trong báo cáo.
6. Đọc JSON bằng chứng cũ, kiểm tra trạng thái/cleanup/hash trước-sau; không sửa artifact.
7. Băm nội dung 6.041 file hiện có thuộc src/public/frontend-static/database/tests/
   scripts/docs và các file cấu hình/hướng dẫn chính trước/sau kiểm tra; loại trừ
   chính báo cáo này. Hash tổng hợp giữ nguyên. Chỉ tạo báo cáo được yêu cầu.

Không chạy npm start/dev vì server.js khởi động worker tự hủy có khả năng ghi
database. Không start instance test, không npm install, không chạy SQL dump,
không tạo test script/file khác. Các log `[HTTP] Có lỗi khi xử lý yêu cầu.` trong
npm test thuộc tình huống cố ý gây lỗi; các bài kiểm tra tương ứng đều đạt.

### A.5. Bằng chứng tích hợp lịch sử, không phải lần chạy mới

| Artifact nội bộ | Định danh | Nội dung đã đối chiếu |
| --- | --- | --- |
| .test-runtime/admin-products-results.json | ITP2-ed2af033458125f7 | 7/7 PASS; BLOB, UNIQUE SKU, options/parent, stale stock sau checkout, snapshot sau sửa, input sai, search/page; cleanup và hash trước/sau khớp |
| .test-runtime/admin-orders-results.json | 4c552c472c2210dd | 16/16 PASS; 9 nhóm đơn/hủy/worker, 3 COD, 4 reviews; cleanup và hash trước/sau khớp |

mtime hai artifact lần lượt là 2026-10-22T18:42:51.651Z và
2026-10-22T19:30:38.445Z. Đây là mốc file, không phải chứng thực thời điểm từng
câu SQL. Artifact không gắn commit hoặc hash đầy đủ source tại thời điểm chạy;
project không có Git. Không thể từ artifact một mình chứng minh mọi code hiện tại
giống hệt code của lần chạy. Runner thực hiện service/repository trên MySQL thật;
không phải mọi đường đi HTTP admin/MySQL đầu cuối.

## B. Bảng tiêu chí nghiệm thu

### Quy ước bằng chứng

- **AUTH**: tests/admin.test.js, account.test.js; middleware admin-auth/account-auth,
  account-service/session và router admin. Chạy lần này, fixture bộ nhớ.
- **PROD**: tests/admin-products.test.js; admin-product service/repository/validation,
  controller, form parser và views/admin/products. Chạy lần này với mock.
- **ORDER**: tests/admin-orders.test.js và orders.test.js; admin-order service/
  repository/rules, order-service, order-expiry. Chạy lần này với mock.
- **COD**: tests/admin-payments.test.js và checkout.test.js; confirmCod ở admin-order
  repository/service/controller, admin/orders/detail và checkout/success. Chạy lần này với mock.
- **REVIEW**: tests/reviews.test.js; review repository/service/controller/validation/
  routes/views. Chạy lần này với mock.
- **READ**: phép kiểm tra MySQL SELECT A.4.5; dữ liệu thực tế nhưng không ghi.
- **H-P/H-O**: hai artifact lịch sử A.5, không phải lần chạy mới.

PASS ở mức mock/HTTP chứng minh đúng hành vi tương ứng của backend với fixture,
không đồng nghĩa toàn bộ chức năng đã PASS MySQL thật. Những phần cần MySQL ghi
được tách thành dòng BLOCKED riêng. NOT TESTED dùng khi chưa kiểm tra, không
phải bị một test đã chạy từ chối.

### B.1. Phân quyền

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| A01 | Khách chưa đăng nhập không vào admin | AUTH: GET /admin, /admin/products, /admin/orders/1 trả 303 | PASS | HTTP thật, session/mock |
| A02 | User thường bị chặn admin | AUTH: GET/POST/PUT/PATCH/DELETE trả 403 | PASS | Không dựa trên ẩn menu |
| A03 | Không nâng quyền bằng role/is_admin/user_id/header | AUTH: giả mạo body/query/header/store vẫn 403, register vẫn role user | PASS | Danh tính do server xác minh |
| A04 | Session sai/hết hiệu lực không giữ quyền | AUTH: cookie sai, logout, đổi password, xóa fixture; bị chặn | PASS | Bộ nhớ test |
| A05 | Role được đọc lại mỗi request | AUTH: admin bị hạ quyền nhận 403 ngay; guard chỉ role admin chính xác | PASS | Không dùng role do client gửi |
| A06 | Route ghi sản phẩm được bảo vệ backend | PROD HTTP: POST sản phẩm/biến thể không quyền trả 403 | PASS | Prefix /admin có guard |
| A07 | Route ghi đơn/COD được bảo vệ backend | ORDER/COD HTTP: status/cancel/confirm-cod bị 403 khi không quyền | PASS | Trước handler nghiệp vụ |
| A08 | CSRF cho các thao tác ghi | AUTH/PROD/ORDER/COD/REVIEW HTTP: thiếu/sai token 403 | PASS | Multipart parse trước CSRF, chỉ admin được parse ảnh |
| A09 | Quyền sở hữu đơn và đánh giá | orders.test/reviews.test HTTP: đơn/dòng người khác 404 | PASS | Admin có quyền xem mọi đơn; khách bị giới hạn theo session |
| A10 | Escape HTML, không lộ password/hash/SQL/stack ở các lỗi đã test | AUTH/PROD/ORDER/COD/REVIEW HTTP và foundation.test | PASS | Không phải kiểm toán mọi kiểu tấn công |
| A11 | Toàn luồng phân quyền bằng session/tài khoản MySQL thật | Chưa chạy HTTP với user/admin MySQL riêng trong nhiệm vụ này | BLOCKED | Test ghi/tạo fixture không được phép; H-P/H-O không thay thế lớp HTTP này |

### B.2. Quản lý sản phẩm

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| P01 | Danh sách admin render và lấy dữ liệu MySQL | PROD HTTP render; READ thực tế 24 sản phẩm, trả trang đầu 20 | PASS | Hai tầng đã kiểm tra riêng, không gọi HTTP/MySQL đầu cuối |
| P02 | Tìm kiếm an toàn và phân trang | PROD query escape LIKE/prepared; H-P có page1/page2 cũ | PASS | Lần này PASS mock/query; kết quả phân trang MySQL cũ ghi riêng A.5 |
| P03 | Danh sách rỗng/ID sai/sản phẩm không tồn tại | PROD HTTP trả trạng thái rỗng và 404 | PASS | Fixture |
| P04 | Bắt buộc tên, giới hạn trường, danh mục, giá ban đầu hợp lệ | PROD validation/service: dữ liệu sai bị từ chối | PASS | Backend quyết định |
| P05 | Ảnh giới hạn/MIME/signature và lỗi form | PROD HTTP PNG, file SVG/giả/quá lớn, duplicate/malformed multipart, 413 | PASS | Kiểm tra signature, không phải giải mã ảnh đầy đủ |
| P06 | SQL tham số, không đọc BLOB hàng loạt | PROD query assertions; READ chạy repository thực tế | PASS | Tên cột/order cố định; OFFSET từ số nguyên backend |
| P07 | Ghi sản phẩm + biến thể mặc định atomic/rollback trên MySQL hiện tại | PROD mock PASS; H-P cũ PASS; không chạy lại ghi | BLOCKED | Cần fixture test riêng và duyệt chạy |
| P08 | Ẩn/ngừng kinh doanh sản phẩm | Schema và router chưa có trạng thái/chức năng tương ứng | BLOCKED | Phần đã hoãn, chưa duyệt schema; không tính đã hoàn thành |
| P09 | Layout sản phẩm admin trên desktop/mobile và thao tác trình duyệt | Đọc EJS/CSS, test chỉ render/asset | NOT TESTED | Chưa visual QA |

### B.3. Quản lý biến thể và bảo vệ lịch sử

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| V01 | Variant và option thuộc đúng product | PROD: wrong parent 404, option sai 422; READ có 3 variant ở một sản phẩm | PASS | Kiểm tra server, không chỉ select frontend |
| V02 | SKU bắt buộc và xử lý trùng | PROD: trùng thành 409, không tạo sản phẩm dở trong mock | PASS | UNIQUE MySQL có trong schema; H-P từng kiểm tra collation |
| V03 | Giá >0, stock nguyên không âm trong giới hạn | PROD: 0/âm/thập phân/overflow stock bị từ chối; stock=0 được lưu | PASS | Giá bằng 0 không cho bán qua admin hiện tại |
| V04 | Form cũ không ghi đè stock sau checkout | PROD: stock 5→4, expected=5 bị 409; H-P có bằng chứng cũ | PASS | Lần này mô phỏng stock thay đổi; không khẳng định race InnoDB mới |
| V05 | Sửa sản phẩm không ghi đè snapshot đơn | PROD assertions không ghi orders/items; ORDER snapshot fixture độc lập giá/địa chỉ hiện tại | PASS | So sánh MySQL sau sửa xem V07 |
| V06 | Admin sửa stock cạnh tranh checkout trên connection MySQL thật | Đọc khóa product/variant + expected_stock; chưa chạy race lần này | BLOCKED | H-P kiểm tra stale sau checkout tuần tự, chưa thay cho race đồng thời đầy đủ |
| V07 | Sửa tên/giá/stock thực tế vẫn giữ lịch sử MySQL | READ xác nhận snapshot hiện tại; H-P có test cũ; không thực hiện sửa | BLOCKED | READ không chứng minh hành vi sau một cập nhật mới |
| V08 | Variant không tồn tại hoặc thuộc sản phẩm khác | PROD service/HTTP trả 404 | PASS | Không dùng body để đổi parent |

Không có route xóa vật lý product/variant. Đây là chính sách an toàn của phạm vi
đã triển khai, không được diễn giải thành đã có đầy đủ tính năng xóa/ẩn. FK
order_items.product_id/variant_id SET NULL giữ snapshot nhưng không tự ngăn một
công cụ SQL bên ngoài xóa sản phẩm.

### B.4. Quản lý đơn hàng

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| O01 | Danh sách/tìm/lọc/phân trang admin | ORDER HTTP/query mock; READ có 1 đơn thực tế | PASS | Không lộ password/hash/session |
| O02 | Chi tiết đúng khách/người nhận/địa chỉ snapshot | READ so sánh trực tiếp receiver/address với orders; ORDER HTTP escape | PASS | buyer_name là tên tài khoản hiện tại, receiver_name là snapshot |
| O03 | Items đúng tên/variant/SKU/quantity/unit_price lịch sử | READ đối chiếu một dòng thực tế; ORDER snapshot fixture | PASS | Không JOIN giá hoặc địa chỉ hiện tại để ghi đè |
| O04 | Trạng thái đơn hiển thị đúng, unknown an toàn | ORDER detail/summary test, READ status khớp dữ liệu gốc | PASS | payment có nhãn riêng |
| O05 | Backend kiểm tra quyền khi thay trạng thái | ORDER HTTP và AUTH trả 403 cho user thường | PASS | Không dựa nút frontend |
| O06 | Chỉ chuyển tuần tự, không bỏ bước/quay lùi/trạng thái tùy ý | ORDER: pending→confirmed→shipping→delivered; sai/stale bị 409 | PASS | Lần này service/mock; dữ liệu thật không đổi |
| O07 | ID sai/không tồn tại và form thiếu xác nhận | ORDER HTTP/service 404/422 | PASS | Không crash/lộ SQL |
| O08 | Chỉ hủy pending/cod/unpaid | ORDER service/HTTP chặn confirmed/paid/bank và lặp; stock mock hoàn đúng | PASS | Không triển khai refund |
| O09 | Không hoàn kho hai lần khi hủy đồng thời trên InnoDB | ORDER mock PASS; H-O có test hai connection cũ | BLOCKED | Không chạy thao tác hoàn kho lần này |
| O10 | Rollback hủy khi hoàn kho hoặc cập nhật status lỗi trên InnoDB | ORDER mock PASS; H-O cũ có fault injection/rollback thật | BLOCKED | Không coi rollback mock là rollback MySQL |
| O11 | Quy tắc tự hủy 72h và lifecycle worker | ORDER: boundary/exclusion, không chồng tick, stop/log an toàn | PASS | Runtime worker dùng service giả lập |
| O12 | Worker thật hủy và hoàn kho đúng với dữ liệu MySQL | H-O cũ có boundary/race/worker; không chạy server.js | BLOCKED | Worker có thể ghi dữ liệu ngay khi start |
| O13 | Tạo đơn/order_items/trừ kho/xóa giỏ không dở dang khi lỗi InnoDB | Checkout mock PASS; code một transaction; không chạy ghi | BLOCKED | Regression bắt buộc cần test DB đã duyệt |

Code transaction hủy hiện tại: khóa order → kiểm tra status/method/payment/tuổi →
khóa và gộp items → khóa variants theo ID → hoàn stock có điều kiện không tràn INT
→ đổi status có precondition → commit. Khi lỗi rollback/release. Thiếu variant,
FK NULL hoặc stock overflow được từ chối, không đoán variant từ tên/SKU. Đây là
nhận xét code và test mock, không thay thế các dòng O09/O10/O12/O13.

### B.5. Quản lý thanh toán COD

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| T01 | Nhãn method/status theo dữ liệu, tách trạng thái giao hàng | COD/ORDER EJS fixtures và READ đối chiếu payment với orders | PASS | bank/refund có nhãn đọc, không phải tính năng thanh toán mới |
| T02 | COD unpaid không được suy ra paid | COD EJS fixtures unpaid/paid/cancelled/unknown và GET không ghi | PASS | delivered không tự nghĩa paid |
| T03 | Không tin payment_status/total/status frontend | COD service/HTTP body giả không đổi quy tắc/số tiền/stock | PASS | Đích paid là literal backend |
| T04 | Chỉ xác nhận delivered/cod/unpaid, checkbox bắt buộc | COD từ chối chưa giao/cancelled/bank/refund/unknown và thiếu confirm | PASS | Đơn paid lặp không ghi lần hai trong mock |
| T05 | Confirm COD cần admin, CSRF, POST | COD HTTP thiếu quyền/token bị chặn; GET endpoint 404 | PASS | Không có ghi khi xem trang |
| T06 | Gửi lại/xử lý lỗi không đổi đơn/kho/giá ngoài payment | COD mock gửi lặp/đồng thời, rollback ghi/commit/affectedRows=0 | PASS | Giới hạn mock được nêu rõ |
| T07 | Commit/rollback/khóa đồng thời COD trên MySQL thật hiện tại | H-O có 3 nhóm COD cũ; không chạy ghi lại | BLOCKED | Phải SELECT trước/sau trên fixture khi được duyệt |
| T08 | Mất mạng đúng lúc commit hoặc server crash khi xác nhận COD | Chưa gây lỗi kết nối/tiến trình | NOT TESTED | Không suy từ test lỗi trước commit ra mọi lỗi mạng |

Không thấy code tự xác nhận thanh toán khi GET hoặc chuyển shipping→delivered.
Không có handler bank/online/refund/webhook trong route hiện có. Đây là kiểm kê
phạm vi bằng code; không tuyên bố đã pentest mọi URL có thể có.

### B.6. Đánh giá sản phẩm

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| R01 | Chỉ người có dòng mua hợp lệ được mở/gửi đánh giá | REVIEW: chưa mua, chủ đơn khác, dòng không tồn tại bị 404 | PASS | Kiểm tra server |
| R02 | Đơn phải delivered | REVIEW: pending/confirmed/shipping/cancelled/unknown bị 409 | PASS | Không bắt buộc paid theo nghiệp vụ sau giao đã chốt |
| R03 | Product và item thuộc đúng order | REVIEW: item từ đơn khác bị 404, FK product NULL bị từ chối | PASS | JOIN orders/order_items/products |
| R04 | Danh tính từ session, không từ user_id/product_id/role body | REVIEW service/HTTP: giả mạo bị bỏ qua, lưu đúng user/product suy ra | PASS | Biết product_id không đủ điều kiện |
| R05 | Backend kiểm tra lại khi POST, không chỉ ẩn nút | REVIEW: GET đủ điều kiện rồi đổi status fixture, POST bị chặn | PASS | Có FOR UPDATE ở transaction |
| R06 | Một lần mỗi khách/sản phẩm và thông báo trùng | REVIEW: cùng đơn/đơn khác cùng sản phẩm và mock đồng thời, một bản lưu | PASS | UNIQUE thực tế cần R09; không coi mutex mock là InnoDB |
| R07 | Validate rating/comment và hiển thị lỗi gần trường | REVIEW 1/5 hợp lệ; 0/6/âm/thập phân/mảng/ID/nội dung sai bị từ chối | PASS | Nội dung tùy chọn, giới hạn 2.000 ký tự |
| R08 | Đọc công khai, rỗng/phân trang, escape và riêng tư | REVIEW HTTP/query; READ sản phẩm được chọn có 0 review | PASS | HTTP với nội dung có review là fixture; MySQL lần này chỉ kiểm tra rỗng |
| R09 | UNIQUE và hai đơn đồng thời trên connection MySQL thật | H-O có test concurrency + INSERT trùng trực tiếp cũ | BLOCKED | Không tạo review thật trong nhiệm vụ |
| R10 | Lỗi INSERT/commit không lưu review dở dang trên MySQL | REVIEW mock PASS; H-O có rollback thật cũ | BLOCKED | Không chạy fault injection ghi lần này |
| R11 | Không có endpoint xóa/sửa review chưa được duyệt | REVIEW HTTP POST /review/delete trả 404; router chỉ GET/POST tạo/đọc | PASS | Chỉ xác nhận thao tác xóa được thử; không coi sửa/xóa là chức năng đã có |
| R12 | Form/list review trên trình duyệt desktop/mobile | Chỉ render EJS và kiểm tra CSS bằng test | NOT TESTED | Chưa kiểm tra thao tác bàn phím/viewport/console thực tế |

Schema có đủ quan hệ kiểm tra mua hàng; không thiếu order_item_id. Tuy nhiên FK
riêng lẻ không tự chứng minh reviews.user_id/product_id khớp chủ đơn và sản phẩm
của order_item nếu DML được chạy ngoài ứng dụng. Tầng repository đang kiểm tra
JOIN này; không đề xuất sửa schema tự động.

### B.7. Regression giai đoạn 1–4

| ID | Tiêu chí | Bằng chứng | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| G01 | Express/EJS/static/404/400/413/500 và lỗi an toàn | foundation.test.js, npm test | PASS | createApp test; không khởi động server.js |
| G02 | Trang chủ/list/search/filter/sort/page catalog | catalog.test.js, npm test | PASS | Dữ liệu giả lập; READ bổ sung danh sách admin thật |
| G03 | Detail biến thể, ảnh BLOB/MIME/fallback và JS chọn variant | catalog.test.js, npm test | PASS | Không phải kiểm tra visual trình duyệt |
| G04 | Đăng ký/login/logout/giới hạn nhập sai/session | account.test.js, npm test | PASS | Hash/memory user fixture |
| G05 | Hồ sơ/địa chỉ/đổi mật khẩu và quyền sở hữu | account.test.js, npm test | PASS | Bao gồm district rỗng và hủy session cũ |
| G06 | Giỏ theo variant, quantity/giá/quyền/CSRF | cart.test.js, npm test | PASS | Không ghi giỏ thật |
| G07 | Checkout, giá/phí/địa chỉ được tính ở backend | checkout.test.js, npm test | PASS | Phí 30.000đ, miễn từ 300.000đ được kiểm tra bằng fixture |
| G08 | Lịch sử/snapshot/đơn người khác | orders.test.js, npm test; READ đối chiếu đơn thật | PASS | Hành vi sau sửa dữ liệu mới xem V07 |
| G09 | Luồng mua và request lặp với mock | purchase-flow.test.js, npm test | PASS | Không chứng minh concurrency InnoDB |
| G10 | Toàn luồng mua/rollback/tồn kho sau tích hợp giai đoạn 5 trên MySQL | Chỉ đọc code, artifact cũ; không checkout/hủy/sửa stock | BLOCKED | Cần fixture test riêng, không dùng dữ liệu demo |
| G11 | Header/footer, thông báo/loading, responsive và console trình duyệt | Chưa mở browser desktop/mobile trong nhiệm vụ | NOT TESTED | CSS @media và EJS render không đủ để PASS visual |
| G12 | Restart/nhiều instance/mất kết nối khi transaction đang commit | Chưa chạy tình huống vận hành này | NOT TESTED | Ngoài mục tiêu demo một tiến trình, vẫn cần ghi rõ giới hạn |

## C. Danh sách lỗi và rủi ro

### C.1. Lỗi đã xác minh

**F5-DOC-01 — Low — README chưa phản ánh chức năng giai đoạn 5.**

- File: README.md, phần mở đầu có câu “chưa có quản trị hoặc đánh giá”.
- Bằng chứng: nội dung file hiện tại trái với router admin/reviews, giao diện và
  các bài test vừa chạy thành công. Đây là lỗi tài liệu đã xác minh, không phải
  lỗi runtime hay lỗi phân quyền.
- Ảnh hưởng: người chạy demo có thể hiểu sai phạm vi, không tìm thấy hướng dẫn
  admin/review từ tài liệu chính. Phần khởi động cũng cần chỉ rõ tác vụ tự hủy đã có.
- Hướng xử lý: khi được giao sửa tài liệu, cập nhật phạm vi, liên kết docs bước
  D/E/F và lưu ý worker có khả năng ghi ngay khi server chạy. Không sửa trong lần này.

Không ghi nhận FAIL nghiệp vụ Critical/High từ các bài test đã chạy. Điều này
không có nghĩa đã chứng minh không tồn tại lỗi ngoài phạm vi kiểm thử.

### C.2. Rủi ro/giới hạn, không gắn nhãn lỗi đã tái hiện

| Mã | Mức ảnh hưởng tiềm năng | Vị trí và bằng chứng | Ảnh hưởng / hướng xử lý đề xuất |
| --- | --- | --- | --- |
| F5-R01 | Medium, thiếu phạm vi nếu yêu cầu ẩn sản phẩm | products không có trạng thái; router không có ẩn/ngừng bán | P08 BLOCKED, đã hoãn. Chỉ thiết kế schema khi được duyệt riêng |
| F5-R02 | Medium, giới hạn truy vết thu tiền | orders chỉ có payment_status/updated_at, không có paid_at/received_by | Không chứng minh ai/bao giờ thu tiền bằng updated_at; chưa phải tiêu chí bắt buộc. Nếu cần, đề xuất schema và duyệt riêng |
| F5-R03 | Medium, khả năng gián đoạn thao tác khi tranh khóa | admin-product khóa product rồi variant; checkout khóa các variant/JOIN product; review JOIN FOR UPDATE | Có thể phải chờ/deadlock dưới tải. Code có xử lý một số lỗi 409, nhưng chưa có race test bao phủ mọi cặp thao tác. Không khẳng định đã bán vượt kho hoặc mất dữ liệu |
| F5-R04 | High nếu dữ liệu bị xóa/nhập sai ngoài luồng, chưa tái hiện lỗi ứng dụng | order_items FK product/variant SET NULL; reviews FK CASCADE; hủy cần variant còn tồn tại | Thiếu variant khiến không thể hoàn kho an toàn, review có thể mất khi xóa ngoài ứng dụng. Giữ chính sách không xóa sản phẩm đã giao dịch; không sửa schema/data để né lỗi |
| F5-R05 | Medium ngoài demo một tiến trình | checkout-service dùng Map token, session MemoryStore; order-expiry chỉ chạy khi server bật | Không phải idempotency/audit/scheduler production. Đã khai báo giới hạn, chưa tự thêm hạ tầng hoặc schema |
| F5-R06 | Khoảng trống bằng chứng, không phải lỗi runtime | Artifact MySQL không gắn source revision; chưa có đầy đủ HTTP/MySQL đầu cuối | Không nâng test mock/historical lên PASS tích hợp hiện tại. Cần lượt nghiệm thu test riêng được cho phép ghi |

## D. Những vấn đề chưa kiểm thử và kế hoạch xác minh

### D.1. BLOCKED do giới hạn ghi database của nhiệm vụ

A11, P07, V06, V07, O09, O10, O12, O13, T07, R09, R10, G10.

Môi trường test riêng đã có; không cần tự tạo hoặc sao chép database demo. Khi
được phê duyệt một lượt kiểm thử ghi **chỉ trên test**, đề xuất:

1. Đọc lại guard openTestPool: database/tài khoản khác nguồn, instance/datadir/
   cổng đúng, grants DML chỉ test, engine InnoDB. Không in secret.
2. Chỉ sau đó mới khởi động instance test có sẵn và chạy các runner hiện có:
   `node scripts/check-admin-products.cjs --run` và
   `node scripts/check-admin-orders.cjs --run`. **Hai lệnh chưa được chạy trong lần này.**
3. Tạo fixture nhân tạo của chính lượt test, ghi IDs/trạng thái ban đầu, không dùng
   tài khoản hoặc sản phẩm khách thật. SELECT đối chiếu order/items/review/stock
   sau từng case và xác minh rollback, cleanup, hash dữ liệu cũ.
4. Bao phủ thêm admin cập nhật stock cạnh tranh checkout bằng hai connection,
   checkout cạnh tranh hủy và review/cập nhật sản phẩm nếu muốn nghiệm thu cạnh tranh
   rộng hơn. Test hiện có stale stock sau checkout chưa bao phủ tất cả race này.
5. Xác minh HTTP/MySQL đầu cuối: tài khoản/quyền test phải được duyệt rõ trước,
   không tự tạo admin hoặc tự đặt mật khẩu admin. Kiểm tra guest/user/admin, CSRF,
   owner của đơn/dòng, status transition, COD và review qua route thật.
6. Nếu cần thêm hook/test mới cho mất mạng/commit, đề xuất riêng; không sửa code
   production trong bước nghiệm thu. Cleanup chỉ đúng fixture IDs; dừng khi cleanup lỗi.

P08 BLOCKED vì **thiếu nghiệp vụ/schema đã duyệt**, khác với các dòng trên. Cần
quyết định có đưa ẩn/ngừng bán vào phạm vi giai đoạn 5 hay giữ phần hoãn hiện tại.
Không mặc nhiên yêu cầu thay schema để nghiệm thu phần đã triển khai.

### D.2. NOT TESTED

- P09, R12, G11: browser desktop/mobile, hiển thị dài/rỗng/lỗi, chọn file/form,
  keyboard, console JavaScript, thông báo thành công/thất bại và layout responsive.
  Nên dùng ứng dụng trỏ test riêng; không bấm thao tác ghi trên database demo.
- T08, G12: lỗi kết nối ngay commit, mất response, restart/nhiều instance. Chưa
  chạy, không suy từ test lỗi trước commit sang bảo đảm mọi tình huống này.

## E. Kết luận nghiệm thu

**Chọn kết luận 4: CHƯA ĐỦ BẰNG CHỨNG.**

Lý do không chọn “Chưa đạt”: không có tiêu chí nghiệp vụ bắt buộc FAIL đã được
tái hiện trong lần kiểm tra này. Lý do chưa chọn “Đạt/Đạt có điều kiện”: các tiêu
chí quan trọng về thao tác MySQL, cạnh tranh cập nhật kho/hoàn kho, COD và review
vẫn BLOCKED trong phạm vi lần nghiệm thu; còn thiếu kiểm tra HTTP/MySQL đầu cuối
và giao diện. Không được bỏ qua chúng chỉ vì có 91 test mock/thành phần đạt.

Bằng chứng cũ 7/7 và 16/16 là giá trị thực tế cần giữ lại, cho thấy đã từng có
kiểm thử InnoDB thành công trong phạm vi runner, không phải dự án chưa có test
MySQL. Nhưng không tự suy ra đã hoàn tất toàn bộ tiêu chí nghiệm thu hiện tại.

Để chuyển kết luận sang Đạt trong phạm vi MVP local đã duyệt, cần:

1. Cho phép riêng lượt test ghi fixture trên database test, xác minh lại các
   tiêu chí quan trọng BLOCKED; giữ mọi dữ liệu demo/thật ngoài phạm vi.
2. Hoàn tất đường đi HTTP/session/quyền + MySQL trên môi trường test được duyệt.
3. Chạy visual/manual desktop/mobile và ghi kết quả, không chỉ đọc CSS.
4. Xác nhận phạm vi ẩn/ngừng bán tiếp tục hoãn nếu không triển khai ở giai đoạn 5;
   sửa/xóa review và production/multi-instance vẫn ngoài phạm vi đã chốt.
5. Ghi nhận/sửa lỗi tài liệu khi được giao; không yêu cầu mở rộng COD/refund hoặc
   đổi schema ngoài nhu cầu được duyệt.

Trong nhiệm vụ này chỉ tạo **docs/REPORT_ACCEPTANCE_PHASE_5.md**. Không sửa code,
test, tài liệu khác, .env hoặc schema; không chạy migration, không DML trên bất
kỳ database nào và không chuyển sang giai đoạn 6.
