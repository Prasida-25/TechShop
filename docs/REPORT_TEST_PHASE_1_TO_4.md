# BÁO CÁO KIỂM TOÁN VÀ KIỂM THỬ GIAI ĐOẠN 1–4 — TECHSHOP / TECHZONE

Ngày kiểm toán: 22/10/2026. Môi trường: Windows, Node.js/Express/EJS/MySQL local.
Thương hiệu giao diện: TechZone. Phạm vi: kiểm tra và lập báo cáo, không sửa lỗi.

## Phần 1 – Tóm tắt kết quả

**Kết luận lựa chọn 2: Chỉ nên chuyển sang Giai đoạn 5 sau khi sửa các lỗi được
liệt kê và chốt các điều kiện tích hợp quản trị ở Phần 7.** Có thể tiếp tục demo
local phần đã có; chưa đủ bằng chứng để tuyên bố mọi nhánh, mọi thiết bị và mọi
tình huống mất kết nối đều hoàn thành.

### Thống kê test case trong báo cáo này

| Chỉ số | Số lượng |
| --- | ---: |
| Tổng test case được đặc tả, gồm case đã chạy và đề xuất | 64 |
| PASS | 49 |
| FAIL | 2 |
| NOT TESTED | 4 |
| BLOCKED | 4 |
| NEEDS REVIEW | 5 |

Số case là số dòng kết quả tại Phần 4, không phải số nhóm của Node test runner.
Một nhóm có thể chứa nhiều assertion tương ứng nhiều case. **PASS giả lập chỉ
khẳng định ở lớp giả lập**, không được hiểu là đã ghi thành công trên MySQL.

Bằng chứng thực thi mới trong lần kiểm toán:

- `npm test`: **47/47 nhóm đạt**, gồm nền tảng 3, Catalog 7, tài khoản 12, giỏ 7,
  checkout 9, đơn hàng 6, luồng mua liên thông 3. Repository ghi đều được thay
  bằng fixture trong bộ nhớ; không gửi DML đến MySQL.
- `npm run catalog:check`: **7/7 nhóm đạt, 83 SELECT có CTE giả lập** trên MySQL.
  Script đã được đọc trước khi chạy; chỉ cho phép SQL bắt đầu SELECT, không
  tạo bảng, không INSERT/UPDATE/DELETE. Đây là kiểm chứng SQL với fixture, không
  thay thế kiểm chứng dữ liệu kinh doanh thật.
- Các GET không đăng nhập trên ứng dụng dùng MySQL hiện tại và 4 kiểm tra
  repository Catalog chỉ đọc đều thực thi. Entry point tương ứng `npm start`
  khởi động được với cấu hình hiện tại và được dừng sau kiểm tra.
- Hai phép thử thành phần trong bộ nhớ phát hiện **2 FAIL mới**: middleware
  chuyển HTTP 413 thành 500; template xác nhận ghi COD khi nhận đơn bank/paid.
  Không gọi POST trên ứng dụng dùng database thật để tái hiện các lỗi này.

Không tái hiện Critical/High về đọc chéo tài khoản, sai giá, âm kho hoặc mất
snapshot trong các case đã chạy. Điều này **không chứng minh không có rủi ro
Critical/High**: mất tiến trình sau commit, cập nhật admin đồng thời và quyền
quản trị tương lai chưa được xác minh đầy đủ. Các rủi ro được giữ mức ảnh hưởng
ở Phần 5, không hạ mức chỉ vì chưa tái hiện.

Bằng chứng cũ: `.test-runtime/results.json` ghi **13/13** nhóm MySQL test thành
công; file có mốc sửa 22/10/2026 21:50 theo giờ máy. Báo cáo nghiệm thu cũ và
ảnh desktop cũng còn. Đây là **bằng chứng lịch sử**, không được cộng thành PASS
MySQL mới trong 64 case này. Không chạy lại `npm run test:mysql`, không khởi động
test instance, không sao chép/nạp dữ liệu trong lần kiểm toán này.

## Phần 2 – Phạm vi và phương pháp

### 2.1. Quyền thực hiện và bảo toàn

Yêu cầu không sửa dự án được áp dụng cho toàn bộ code, test, cấu hình, SQL và
dữ liệu. Ngoại lệ duy nhất là file báo cáo này, theo yêu cầu tạo Markdown tại
thư mục tài liệu đã tồn tại. Không tạo thêm thư mục hoặc tài liệu khác.

Đã chạy `git status --short`: thư mục hiện không phải Git repository, nên không
có working tree/commit để đối chiếu. Không checkout/reset/stash/commit. Không
thể biết nội dung chưa Save trong editor; chỉ đọc bản đang lưu trên đĩa.

Trước ghi báo cáo đã lập dấu vân tay nội dung 5.994 file đang có, loại node_modules,
.git, .test-runtime và chính file báo cáo khỏi phép so sánh. Chỉ so sánh digest,
không in `.env`, token, password hoặc hash mật khẩu. Kết quả bảo toàn cuối nhiệm
vụ được bổ sung tại cuối báo cáo. Không xóa log hoặc file runtime cũ.

### 2.2. File đã đọc/đối chiếu

- `AGENTS.md`, `package.json`, `.gitignore`, README và các báo cáo Giai đoạn 3–4.
- `src/app.js`, `src/server.js`; `src/config/environment.js`, `database.js`,
  `session.js`; middleware xác thực, CSRF, giới hạn đăng nhập, 404, xử lý lỗi.
- Routes/controller Catalog, tài khoản, giỏ, checkout, orders; các service
  `account-service.js`, `cart-service.js`, `checkout-service.js`, `order-service.js`.
- Repositories Catalog, users, addresses, cart, checkout, order; utilities
  validation/query/tính tiền/đối chiếu checkout.
- EJS Catalog và partial header/head/footer, EJS account, cart, checkout,
  orders; `public/js/{product-details,account-forms,checkout}.js`; CSS bổ sung
  Catalog/account/cart/orders và cách nhúng CSS/tài nguyên gốc.
- Bảy file `tests/*.test.js` và các helper/fixture tương ứng; script
  `scripts/check-catalog.cjs`; kết quả tích hợp cũ, schema `database/techshop.sql`.
- Đọc cấu trúc script môi trường test để phân biệt với runner giả lập, không
  gọi script tạo/khởi động/ghi môi trường test. Không đọc mật khẩu config test.

### 2.3. Database thực tế, giới hạn dữ liệu

Đã SELECT metadata cột/kiểu/NULL/default, PK/UNIQUE/index/FK/CHECK và quy tắc FK
từ information_schema. Có 12 bảng, đều InnoDB:
`users`, `user_addresses`, `categories`, `products`, `product_variants`,
`product_options`, `product_option_values`, `variant_option_values`,
`cart_items`, `orders`, `order_items`, `reviews`.

Số liệu hiện tại lúc kiểm toán: users=1, user_addresses=1, products=24,
product_variants=48, cart_items=2, orders=1, order_items=1, tổng stock=864.
Không dùng lại số đếm bằng 0 ở các báo cáo cũ. Không xuất họ tên, điện thoại,
địa chỉ, hash mật khẩu hoặc thông tin kết nối vào báo cáo.

Một SELECT tổng hợp đếm đơn thiếu chi tiết hoặc total_amount nhỏ hơn tổng
quantity × unit_price trả **0 bất thường**. Điều này chỉ là kiểm tra tính nhất
quán số học hiện tại, không chứng minh đơn được tạo đúng giá tại thời điểm mua.
Truy vấn adhoc đầu tiên dùng alias `lines` bị ER_PARSE_ERROR; đã đổi alias trong
lệnh kiểm tra trong bộ nhớ và chạy lại thành công. Đây không phải lỗi SQL của
ứng dụng, không được tính thành FAIL ứng dụng.

### 2.4. Sổ bằng chứng

| Mã | Nội dung | Cách hiểu |
| --- | --- | --- |
| E1 | npm test, 47/47 nhóm, exit 0 | Thực thi mới; ghi nghiệp vụ chỉ trong mock, Argon2/session/CSRF/EJS thật |
| E2 | catalog:check, 7/7 nhóm, 83 SELECT CTE, exit 0 | Thực thi mới; SQL MySQL thật nhưng dữ liệu CTE nhân tạo |
| E3 | 22 GET chỉ đọc trên createApp/cổng ngẫu nhiên | Thực thi mới với MySQL hiện tại; 200/303/400/404 như mô tả dưới |
| E4 | Metadata và SELECT tổng hợp MySQL hiện tại | Cấu trúc và đếm; không phải test commit/rollback |
| E5 | Entry point src/server.js theo package start | Khởi động với cấu hình hiện tại, nhận thông báo mở HTTP, dừng tiến trình kiểm toán |
| E6 | Probe trực tiếp errorHandler trong bộ nhớ | status 413 được truyền vào, status response ghi nhận là 500 |
| E7 | ejs.renderFile với fixture bank/paid/cancelled | HTML vẫn có “Đã ghi nhận đơn COD”, không có nhãn paid/cancelled; không chạy SQL |
| E8 | results.json 13/13 và báo cáo/ảnh nghiệm thu cũ | Bằng chứng kế thừa, không phải lượt chạy ghi MySQL hiện tại |
| E9 | Đọc code/schema có tham chiếu file | Dùng cho NEEDS REVIEW/thiết kế, không tự coi là PASS chức năng |

E3: `/`, `/foundation`, `/products`, tìm rỗng/không kết quả, chi tiết/ảnh sản phẩm
hiện có trả 200; ID sản phẩm thiếu trả 404, ID sai trả 400; page=-1 về trang hợp
lệ; giá âm/sort sai trả 400; register/login GET 200; account/cart/checkout/orders
chưa đăng nhập 303; `/.env`, `/database/techshop.sql` 404; CSS cart/orders 200.
Repository hiện tại còn xác minh tìm tên thực tế, danh mục, trang 1/2 không trùng,
chi tiết biến thể và giới hạn 10 gợi ý. Không lưu response chứa thông tin riêng.

### 2.5. Những việc không làm

Không POST tài khoản/giỏ/checkout lên database hiện tại, không chạy DML/DDL ở
MySQL kể cả database test. Không tạo test script mới, không npm install/npm ci,
không đổi `.env` hoặc cấu hình chạy, không dừng dịch vụ MySQL của người dùng.
Các server HTTP do test/audit mở được đóng sau khi kiểm tra. Không brute force,
stress test hoặc phá hoại. Test rate limit sẵn có chỉ dùng mock trong bộ nhớ.

Không kiểm tra live browser desktop/mobile trong lượt này, không thu thập
console trình duyệt hoặc log sản xuất đầy đủ. Ảnh desktop cũ không thay cho
regression trên bản hiện tại. Không chạy thử crash/restart giữa commit và trả
response. Các case ghi InnoDB hiện bị chặn bởi phạm vi chỉ đọc, dù môi trường
test đã được tạo ở nhiệm vụ trước.

## Phần 3 – Bảng tổng hợp theo giai đoạn

| Giai đoạn | Chức năng | Trạng thái | Bằng chứng | Vấn đề cần xử lý |
| --- | --- | --- | --- | --- |
| 1 | Start, pool, EJS, static, 404 | PASS trong phép thử đã chạy | E1/E3/E4/E5 | Không suy rộng sang mọi lỗi mạng/mọi môi trường |
| 1 | Che lỗi 500 | PASS ở mock | foundation.test.js:45 | Không coi test NODE_ENV production này là đã triển khai production |
| 1 | Trả đúng lỗi request quá lớn | FAIL thành phần | E6; error-handler.js:23 | B-01: 413 bị đổi thành 500 |
| 2 | Gợi ý/bán chạy, tìm/lọc/sort/page | PASS SQL CTE + mock + GET thật | E1/E2/E3 | Bán chạy thật chưa có đủ lịch sử delivered để đối chiếu độc lập |
| 2 | Biến thể/BLOB/fallback/đầu vào | PASS trong bộ dữ liệu kiểm tra | catalog.test.js; E2 | Không phải chứng nhận mọi MIME/dữ liệu hỏng đều an toàn |
| 3 | Tài khoản, quyền, địa chỉ, mật khẩu | PASS giả lập; ghi MySQL mới BLOCKED | account.test.js; E8 chỉ tham khảo | Cần duyệt chạy lại tích hợp; MemoryStore chỉ local |
| 4 | Giỏ, giá, checkout, phí | PASS giả lập | cart/checkout/purchase-flow.test.js | Không có mốc giá từ lúc thêm; đã chấp nhận đối chiếu từ checkout |
| 4 | Transaction/kho/đồng thời | PASS giả lập; MySQL mới BLOCKED | E1; 13/13 E8 lịch sử | Cần chạy lại trong test DB khi được phép; deadlock/crash chưa đủ |
| 4 | Snapshot, chủ đơn, lịch sử | PASS giả lập; tổng hợp thật không phát hiện lệch | orders.test.js; E4 | Phí suy ra chỉ đúng quy ước MVP chưa giảm giá/thuế |
| 4 | Trang xác nhận với bank/paid | FAIL thành phần ngoài nhánh COD chuẩn | E7; success.ejs:5 | B-02: thông báo cố định; không chứng minh sai payment_status lưu DB |
| 1–4 | Responsive/console/loading thật | NOT TESTED / NEEDS REVIEW | E9, ảnh cũ E8 | Chưa đủ cơ sở PASS mobile và back/forward checkout |

## Phần 4 – Test case chi tiết

Mỗi case có đủ 13 thuộc tính qua **hai bảng nối bằng ID**: bảng thiết kế có
ID/giai đoạn/chức năng/mục tiêu/tiền điều kiện/dữ liệu/bước/mong đợi; bảng kết
quả bổ sung thực tế/trạng thái/mức độ/bằng chứng/ghi chú. Không cần suy diễn
thực tế từ cột mong đợi. “—” ở severity nghĩa là không phải FAIL đã tái hiện.

Tiền điều kiện dùng chung, vẫn được ghi cho từng case:

- M: repository/DB giả lập sẵn có của E1; chỉ trong bộ nhớ, không phải MySQL.
- C: fixture CTE E2 trên MySQL, mọi câu chỉ SELECT.
- R: app/pool MySQL hiện tại, chỉ GET hoặc SELECT; không đăng nhập tài khoản thật.
- U: probe thành phần trong bộ nhớ, không database, không thêm file test.
- W: cần quyền mới cho tích hợp ghi database test riêng; **chưa chạy trong audit**.
- B: cần trình duyệt/thiết bị và fixture được phép; **chưa chạy trong audit**.

### 4.1. Giai đoạn 1

| ID | GĐ | Chức năng | Mục tiêu | Tiền ĐK | Dữ liệu | Bước thực hiện | Mong đợi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC1-01 | 1 | Khởi động | Entry point hiện tại chạy được | R; module sẵn có | Cấu hình hiện tại | Đọc start; chạy node src/server.js; chờ mở HTTP; dừng tiến trình audit | Không thiếu module/crash lúc mở HTTP |
| TC1-02 | 1 | MySQL | Pool đọc được schema | R | SELECT metadata/đếm | Mở pool; đọc tables/cột/FK/index/CHECK; đóng | Kết nối/đóng thành công, không lộ secret |
| TC1-03 | 1 | EJS | Render template/partials | M và R | GET /foundation | Đọc HTML/status | 200, HTML tiếng Việt, không còn thẻ EJS thô |
| TC1-04 | 1 | Static/404 | Không công khai file riêng | M và R | CSS, /.env, /database/techshop.sql | GET các URL | CSS 200; file riêng/route thiếu 404 |
| TC1-05 | 1 | Lỗi 500 | Che message/stack | M | TEST_PRIVATE_DETAIL | Route mock ném lỗi; đọc HTML | 500 chung, không có chi tiết gốc |
| TC1-06 | 1 | Lỗi DB | Mô tả lỗi an toàn | U/E1 | ECONNREFUSED, message giả | Gọi describeDatabaseError | Gợi ý tên biến, không echo message nhạy cảm |
| TC1-07 | 1 | Mất MySQL thật | Không treo khi mất kết nối | W | Endpoint DB test không phục vụ | Đề xuất chạy child cấu hình test, giới hạn thời gian; không dừng DB website | Fail nhanh/log an toàn/đóng pool |
| TC1-08 | 1 | Lỗi request | Giữ đúng HTTP 413 | U | error.status=413 | Gọi errorHandler với response stub ghi status | Response 413 với thông báo an toàn |

| ID | Thực tế | Trạng thái | Severity nếu FAIL | Bằng chứng | Ghi chú/hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| TC1-01 | Entry point mở HTTP, tiến trình audit đã dừng | PASS | — | E5; package.json start | Tương ứng lệnh node trong npm start, không cài lại dependency |
| TC1-02 | Đọc 12 bảng InnoDB và metadata thành công, đóng pool | PASS | — | E4; config/database.js | Không kiểm thử commit hoặc rò connection dài hạn |
| TC1-03 | 200 và assertion EJS/partials đạt | PASS | — | E1 foundation:20; E3 | Không phải test mọi trang |
| TC1-04 | CSS 200; URL riêng 404 | PASS | — | E1 foundation:20; E3 | Không in giá trị file bị chặn |
| TC1-05 | Mock nhận 500, không lộ chi tiết | PASS | — | E1 foundation:45 | Chỉ xác minh nhánh lỗi đã dựng |
| TC1-06 | Assertion gợi ý an toàn đạt | PASS | — | E1 foundation:63 | Không thay cấu hình MySQL để tạo lỗi |
| TC1-07 | Chưa chạy lỗi kết nối thật | BLOCKED | — | E9 server.js; chỉ đọc | Cần duyệt cấu hình lỗi ở tiến trình test riêng |
| TC1-08 | Stub ghi status=500, khác 413 | FAIL | Medium | E6; error-handler.js:23 | B-01; bổ sung xử lý lỗi parser 4xx sau khi được giao sửa |

### 4.2. Giai đoạn 2

| ID | GĐ | Chức năng | Mục tiêu | Tiền ĐK | Dữ liệu | Bước thực hiện | Mong đợi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC2-01 | 2 | Trang chủ | Lấy dữ liệu hiện tại | R | products hiện có | GET / và gọi getHomeProducts | 200, dữ liệu DB, tối đa 10 gợi ý |
| TC2-02 | 2 | Gợi ý/bán chạy | Thứ tự và delivered | C | Đơn delivered/pending/hủy CTE | Gọi repository home, so danh sách và tổng lượng | created_at/ID ổn định, chỉ delivered được tính |
| TC2-03 | 2 | Phân trang | Trang khác không trùng | C và R | page 1/2, limit 5, page 999 | Gọi repository các trang, đối chiếu ID | Không trùng khi dữ liệu ổn định, vượt về trang cuối |
| TC2-04 | 2 | Tìm kiếm | Tên/thương hiệu có kết quả | C và R | Tên thật hiện tại, tên/brand CTE | Truy vấn q, đối chiếu ID/kết quả | Có sản phẩm đúng; không lấy dữ liệu tĩnh |
| TC2-05 | 2 | Tìm rỗng/không kết quả | Trạng thái hợp lệ | M/C/R | q rỗng, __AUDIT_NOT_FOUND__ | GET/search và repository | Không crash, không kết quả có thông báo |
| TC2-06 | 2 | Lọc phối hợp | Đúng danh mục và min price | C | category 1, giá 0–100, q Tai nghe | Kết hợp q/category/giá/sort | Chỉ kết quả đúng toàn bộ điều kiện |
| TC2-07 | 2 | Sắp xếp | Allowlist và giá đúng chiều | C/M | asc/desc/name/bestselling; sort sai | Gọi từng sort, so giá/thứ tự | Giá theo MIN biến thể hợp lệ; sort sai 400 |
| TC2-08 | 2 | Input/SQLi | Không mở rộng SQL bằng q | C/M | Nháy, phần trăm, gạch dưới, OR 1=1 | Tìm chuỗi đặc biệt; query sai kiểu | Tìm ký tự thật, không lỗi SQL hoặc trả toàn bộ vì injection |
| TC2-09 | 2 | Biến thể | Đúng thuộc tính/giá/kho | C/M/R | Phiên bản còn/hết hàng, cấu hình sai | GET chọn variant; truy vấn detail | Chỉ tổ hợp thật hợp lệ; hết kho vẫn xem được |
| TC2-10 | 2 | ID/tham số | Không tồn tại/sai đều an toàn | C/M/R | ID chữ, ID lớn, category sai, giá âm | GET và validator | 400 hoặc 404 đúng nhánh; không SQL detail |
| TC2-11 | 2 | Ảnh | BLOB, fallback và MIME | C/M/R | PNG, null, MIME text/html, ID thiếu | GET ảnh/cache/fallback | MIME allowlist, nosniff, fallback; không nhúng BLOB vào HTML |
| TC2-12 | 2 | Dữ liệu rỗng | Không dựng dữ liệu giả | M | Categories/products rỗng, repository lỗi | Render home/list/detail rỗng và lỗi | Trống/404/500 phù hợp, không giá/sales giả |

| ID | Thực tế | Trạng thái | Severity nếu FAIL | Bằng chứng | Ghi chú/hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| TC2-01 | GET 200, repository có tối đa 10 gợi ý | PASS | — | E3; Catalog repo | Chưa đối chiếu mọi trường của 24 sản phẩm bằng mắt |
| TC2-02 | Đúng danh sách/thứ tự và sales 7/5 trong CTE | PASS | — | E2 nhóm 1 | Fixture CTE, không phải đơn delivered thật |
| TC2-03 | CTE và trang hiện tại không trùng ID; vượt trang được chặn | PASS | — | E2 nhóm 4; E3 | Chưa kiểm tra khi admin thay dữ liệu giữa hai request |
| TC2-04 | Tìm tên thật có ID mục tiêu; brand CTE đúng | PASS | — | E2 nhóm 2; E3 | Không khẳng định chất lượng xếp hạng tìm kiếm |
| TC2-05 | GET rỗng/không kết quả 200, assertion trạng thái đạt | PASS | — | E1 catalog:57; E2 | q rỗng được phép xem danh sách theo nghiệp vụ |
| TC2-06 | Kết hợp trả đúng 1 sản phẩm CTE | PASS | — | E2 nhóm 3 | Giá lọc là giá thấp nhất, không phải giá bất kỳ |
| TC2-07 | Giá asc/desc đúng; sort sai trả 400 | PASS | — | E2 nhóm 4; E1 catalog:38 | Allowlist SQL không lấy tên cột tùy ý |
| TC2-08 | Chuỗi injection không khớp, ký tự LIKE được escape | PASS | — | E2 nhóm 2; E1 catalog:38 | Không phải pentest mọi đường SQL |
| TC2-09 | Giá/kho đúng variant; sai thuộc tính bị loại | PASS | — | E1 catalog:84; E2 nhóm 5 | Không tự ghép tổ hợp không tồn tại |
| TC2-10 | 400/404 như assertion và GET thực tế | PASS | — | E1/E2/E3 | ID thiếu khác với lỗi hệ thống |
| TC2-11 | Ảnh thật 200; fixture MIME/cache/fallback đạt | PASS | — | E1 catalog:111; E2 nhóm 6–7 | Ảnh cache private 60 giây; không kiểm thử mọi dạng file độc hại |
| TC2-12 | Mock trống và lỗi tải render an toàn | PASS | — | E1 catalog:135 | Không làm rỗng database thật để thử |

### 4.3. Giai đoạn 3

| ID | GĐ | Chức năng | Mục tiêu | Tiền ĐK | Dữ liệu | Bước thực hiện | Mong đợi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC3-01 | 3 | Đăng ký | Tạo user hợp lệ | M | Họ tên, số di động chuẩn, mật khẩu fixture | GET token; POST mock đăng ký | 303 login, không tự đăng nhập |
| TC3-02 | 3 | Validation đăng ký | Bắt lỗi theo trường | M | Tên trống, email thay phone, password ngắn, confirm lệch | POST từng bộ dữ liệu mock | 422, không tạo user, lỗi gần field |
| TC3-03 | 3 | Trùng điện thoại | Chuẩn hóa và xử lý race | M | 090… và +84 tương ứng; hai client | Đăng ký trùng rồi gửi đồng thời | Một user; một 303/một 409 khi race |
| TC3-04 | 3 | Hash/role | Không mật khẩu rõ hoặc tự làm admin | M | role=admin, user_id=999 giả | Đăng ký; verify Argon2 và record mock | Hash Argon2id; role=user; không echo mật khẩu |
| TC3-05 | 3 | Đăng nhập | Đúng vào, sai bị từ chối chung | M | Đúng/sai password, số chưa có | GET token và POST mock | Thành công hoặc 401 chung, không lộ tồn tại tài khoản |
| TC3-06 | 3 | Phone-only | Không login email | M | email@example.com | Gửi field phone là email | 401, không tạo session đăng nhập |
| TC3-07 | 3 | Session/logout | Chống fixation, hủy phiên | M | Cookie trước login/sau logout | Login, so cookie, thử cookie cũ, logout POST | Cookie mới; cookie cũ không truy cập; GET logout không thực thi |
| TC3-08 | 3 | Hồ sơ | Đổi tên/phone và bắt trùng | M | Phone hợp lệ mới/trùng/không hợp lệ | Cập nhật mock, đăng nhập lại số mới | Đúng user, 409/422 khi sai |
| TC3-09 | 3 | Quyền hồ sơ | Không sửa user/role/password qua profile | M | user_id khác, role admin, password kèm form | POST profile mock, so record hai user | Chỉ tên/phone của session được sửa |
| TC3-10 | 3 | Địa chỉ | CRUD đúng sở hữu, district tùy chọn | M | district rỗng, ward trống, địa chỉ người khác | Add/edit/default/delete mock, thử ID chéo | Rỗng district hợp lệ; thiếu ward 422; ID chéo 404 |
| TC3-11 | 3 | Mặc định | Tối đa một mặc định khi đồng thời | M | Hai địa chỉ, lỗi giữa transaction | Thêm/chuyển/xóa mặc định và fault injection | Một mặc định, lỗi rollback |
| TC3-12 | 3 | Đổi mật khẩu | Xác minh hash cũ, thu hồi phiên | M | Cũ sai, mới yếu/trùng, confirm lệch, ID giả | Đổi mock; thử phiên và mật khẩu cũ/mới | 422 khi sai; hash mới; các phiên cũ bị từ chối |
| TC3-13 | 3 | CSRF/rate limit | Bảo vệ form và giới hạn dò | M | Token thiếu/sai/khác client; vài lần sai có giới hạn | Chạy test đã có trong bộ nhớ | 403 và 429/Retry-After, không khóa vĩnh viễn |
| TC3-14 | 3 | Tích hợp MySQL mới | Tái xác minh ghi tài khoản/địa chỉ | W | Fixture nhân tạo, constraint thật | Đề xuất chạy script hiện có sau khi duyệt; không chạy hiện tại | Các ràng buộc/transaction thật đúng |

| ID | Thực tế | Trạng thái | Severity nếu FAIL | Bằng chứng | Ghi chú/hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| TC3-01 | 303 và chưa đăng nhập như assertion | PASS | — | E1 account:39 | Ghi vào mock, không vào users thật |
| TC3-02 | Từng field lỗi 422, users mock vẫn rỗng | PASS | — | E1 account:39 | Frontend không phải nguồn quyết định |
| TC3-03 | Duplicate/race cho 303+409, một user mock | PASS | — | E1 account:67 | UNIQUE phone thật có trong E4; chưa rerun race MySQL |
| TC3-04 | Argon2 verify thật đạt, record mock role=user | PASS | — | E1 account:39 | Không in hash/mật khẩu fixture trong báo cáo |
| TC3-05 | Login đúng 303, sai 401 chung | PASS | — | E1 account:77 | Không dùng thông tin login thật |
| TC3-06 | Email bị 401 | PASS | — | E1 account:77 | Không triển khai email/OTP theo phạm vi |
| TC3-07 | Regenerate/destroy và cookie cũ đúng; HttpOnly/Lax | PASS | — | E1 account:77 | Secure chưa kiểm chứng qua HTTPS thật; local HTTP không Secure là dự kiến |
| TC3-08 | Cập nhật đúng và login số mới đạt; trùng/sai bị từ chối | PASS | — | E1 account:144 | Chưa xác minh sở hữu phone bằng OTP, đã hoãn |
| TC3-09 | User khác không đổi, role/hash không đổi | PASS | — | E1 account:144 | Actor lấy từ req.user |
| TC3-10 | CRUD/quyền/NULL logic mô phỏng đạt | PASS | — | E1 account:164 | NOT NULL không cấm chuỗi rỗng district; user đã duyệt |
| TC3-11 | Một default và rollback trong mô phỏng | PASS | — | E1 account:199 | DB không có UNIQUE default; mọi writer tương lai phải cùng quy tắc khóa |
| TC3-12 | Hash mới verify thật, session khác cũ bị từ chối | PASS | — | E1 account:214,243 | Chưa kiểm tra request đang chạy ngang thời điểm đổi password |
| TC3-13 | 403/429 theo test fixture | PASS | — | E1 account:120,131 | Không brute force trên MySQL hay người dùng thật |
| TC3-14 | Không thực thi ghi MySQL trong audit | BLOCKED | — | E8 13/13 lịch sử; E9 | Có môi trường cũ nhưng quyền audit hiện chỉ đọc; cần duyệt mới |

### 4.4. Giai đoạn 4

| ID | GĐ | Chức năng | Mục tiêu | Tiền ĐK | Dữ liệu | Bước thực hiện | Mong đợi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC4-01 | 4 | Thêm biến thể | Một dòng/variant/user | M | Thêm v1 hai lần, v2 cùng product | POST mock; đọc cart | v1 quantity tăng; v2 dòng khác |
| TC4-02 | 4 | Quantity | Chặn số bất thường và vượt kho | M | 0, -1, 1.5, 100, 1e1, mảng, stock+1 | Gửi từng input, thử cộng quá 99 | Backend từ chối, không đổi cart |
| TC4-03 | 4 | Quản lý giỏ | Tăng/giảm/xóa/rỗng đúng | M | Dòng của user hiện tại | Update quantity, delete, clear, GET | Quantity/tổng đúng; giỏ rỗng có thông báo |
| TC4-04 | 4 | Quyền giỏ | Không dùng user_id client | M | ID dòng người khác, user_id giả | Update/delete chéo, thêm kèm user_id | 404 hoặc bỏ trường giả; không sửa người khác |
| TC4-05 | 4 | Giá backend | Đọc giá hiện tại và tính đúng | M | price=-1,total=0 giả; DECIMAL có phần lẻ | Thêm/xem cart; đổi giá fixture | Tổng từ giá DB mock; không sai số floating-point |
| TC4-06 | 4 | Giá lúc checkout | Thay đổi sau duyệt phải xác nhận lại | M | Giá tăng giữa preview và POST | Preview; đổi giá; POST cũ; preview mới | Cũ 409, không ghi đơn; duyệt mới đặt giá mới |
| TC4-07 | 4 | Giá từ lúc thêm | Đánh giá thiếu mốc tham chiếu | E9; không có cột mốc | Giá thay từ lúc add đến GET | Đọc schema/code; đề xuất test sau duyệt nghiệp vụ | Nếu yêu cầu nhận biết từ lúc add thì phải có mốc tin cậy |
| TC4-08 | 4 | Checkout trống | Không đặt giỏ rỗng/không địa chỉ | M | Cart trống hoặc address=[] | GET/POST mock phù hợp | Trống bị chặn; thiếu địa chỉ có hướng dẫn, không nút xác nhận |
| TC4-09 | 4 | Địa chỉ checkout | Chặn địa chỉ chéo/mất/đổi | M | addressId khác user, bị xóa/sửa | Preview/POST/mock transaction | 409; snapshot phải khớp bản đã duyệt |
| TC4-10 | 4 | Phí và giới hạn tiền | Chính xác ngưỡng đã duyệt | M | 299999.99; 300000.00; 300000.01; tổng quá DECIMAL | Tính quote | Dưới ngưỡng +30000; từ ngưỡng 0; quá giới hạn bị chặn |
| TC4-11 | 4 | Đặt thành công | Commit đủ dữ liệu | M | Cart hợp lệ/COD, form giả paid | POST mock; kiểm tra orders/items/kho/cart | pending/cod/unpaid, snapshot đúng, trừ đúng, xóa đúng cart |
| TC4-12 | 4 | Rollback | Không dở dang khi lỗi từng bước | M | Lỗi stock thứ hai/order/item thứ hai/clear/commit | Inject lỗi ở adapter giả lập | Kho/giỏ/đơn phục hồi, release connection |
| TC4-13 | 4 | Hai khách tranh kho | Một món cuối không âm | M | Hai khách, stock=1 | Promise.all service và hai POST HTTP | Một thành công, một 409; kho 0; giỏ thua còn |
| TC4-14 | 4 | Gửi lặp backend | Không dựa vào nút disabled | M | 12 POST/token; hai token cùng cart | Gửi đồng thời, gửi lại sau thành công | Một đơn, trả lại ID cũ hoặc 409 phù hợp |
| TC4-15 | 4 | InnoDB hiện tại | Tái xác minh khóa/rollback thật | W | Fixture kho=1, hai connection | Đề xuất rerun test:mysql trên test DB sau duyệt | Thật sự atomic/không vượt kho, không mock mutex |
| TC4-16 | 4 | Timeout/crash | Kết quả commit mơ hồ và retry | W | Mất response, crash giữa commit và lưu token | Đề xuất proxy/fault injection trên instance riêng | Không ghi lại đơn; người dùng biết kết quả hoặc tra cứu được |
| TC4-17 | 4 | Lịch sử/quyền | Chỉ xem đơn mình, paging đúng | M | Hai user, 22 đơn, ID giả/thiếu | GET lịch sử page sai/vượt; GET ID chéo | Đúng chủ, 404 chung, page ổn định |
| TC4-18 | 4 | Snapshot | Độc lập dữ liệu hiện tại/FK NULL | M | Sửa tên/giá/địa chỉ, bỏ dữ liệu hiện tại | Đặt mock; đổi fixture; GET đơn cũ | Giữ tên/SKU/giá/địa chỉ lúc mua |
| TC4-19 | 4 | Phí lịch sử | Không áp lại chính sách mới | M | Fee cũ 45000; item thiếu/tổng không khớp | Render detail và service | Phí cũ 45000; không đủ dữ liệu ghi không xác định |
| TC4-20 | 4 | Ngừng bán | Không coi hết kho là ngừng bán | E9 | Schema hiện không status active | Đọc metadata/logic; chưa thêm cột | Cần quyết định archive trước quản trị |
| TC4-21 | 4 | Xác nhận thành công | Không báo COD sai loại đơn | U | order bank/paid/cancelled nhân tạo | Render success.ejs trực tiếp | Nội dung phải phù hợp dữ liệu hoặc từ chối nhánh không hỗ trợ |
| TC4-22 | 4 | Deadlock | Không bỏ sót khóa sản phẩm khi admin vào | E9; W để xác minh | Cart gồm nhiều products/variants đan xen | Đọc FOR UPDATE join; đề xuất hai transaction khóa chéo | Rollback an toàn và thông báo có thể thử lại, không dở dang |

| ID | Thực tế | Trạng thái | Severity nếu FAIL | Bằng chứng | Ghi chú/hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| TC4-01 | Gộp và tách đúng dòng | PASS | — | E1 cart:15; purchase-flow:22 | Chỉ mock; UNIQUE thật được xác nhận E4 |
| TC4-02 | Tất cả input sai bị từ chối | PASS | — | E1 cart:29 | Bỏ qua kiểm tra frontend vẫn bị chặn ở service |
| TC4-03 | CRUD và trạng thái rỗng đạt | PASS | — | E1 cart:44,107 | Không xóa giỏ thật |
| TC4-04 | Không đổi dữ liệu user khác | PASS | — | E1 cart:44; purchase-flow:22 | Không kết luận quyền admin đã triển khai |
| TC4-05 | Tính tiền lẻ đúng; giá từ request bị bỏ qua | PASS | — | E1 cart:15,62,97 | Giá dương mới được mua; catalog có thể hiển thị giá 0 thật |
| TC4-06 | Giá đổi trả 409; xác nhận mới dùng giá mới | PASS | — | E1 checkout:50; purchase-flow:22 | Chỉ nhận biết từ preview, không từ lúc thêm giỏ |
| TC4-07 | Không có giá/thời điểm tham chiếu lúc thêm | NEEDS REVIEW | — | E9 cart_items; checkout-service | Giới hạn đã duyệt; không ghi FAIL cho yêu cầu đã được điều chỉnh |
| TC4-08 | Trống 409; thiếu địa chỉ không token/nút đặt | PASS | — | E1 checkout:16,68,135 | Không tạo giá/địa chỉ giả để vượt constraint |
| TC4-09 | Chặn địa chỉ chéo và thay đổi dữ liệu | PASS | — | E1 checkout:50,68; purchase-flow:22 | ID dùng để chọn, ownership luôn server kiểm tra |
| TC4-10 | Ngưỡng và DECIMAL như assertion | PASS | — | E1 checkout:16 | Quy tắc 300000/30000 đã được tái duyệt trước Bước C |
| TC4-11 | Mock commit đủ, role/payment giả bị bỏ qua | PASS | — | E1 checkout:26 | Không coi kết quả này là giao dịch MySQL mới |
| TC4-12 | Rollback/release mock đạt, kể cả item thứ hai | PASS | — | E1 checkout:80; purchase-flow:79 | Mock không tái hiện isolation/commit không rõ kết quả thật |
| TC4-13 | Hai request HTTP/service cho đúng một đơn | PASS | — | E1 checkout:95; purchase-flow:67 | Database mock có mutex toàn cục, không chứng minh khóa InnoDB |
| TC4-14 | 12 POST mock chỉ một đơn; token khác cùng cart an toàn ở case thử | PASS | — | E1 purchase-flow:22; checkout:95,126 | Không bảo đảm durable qua restart; R-01 |
| TC4-15 | Không chạy lại ghi/khóa MySQL trong audit | BLOCKED | — | E8 có 13/13 cũ; script check-purchase-mysql.cjs | Không gộp thành PASS mới chỉ vì đọc kết quả cũ |
| TC4-16 | Chưa chạy crash/timeout thật | NOT TESTED | — | E9 checkout-service:43–50 | Test “response bị mất” hiện chỉ gọi lại sau service đã resolve; chưa cắt mạng/kill tiến trình |
| TC4-17 | Page/quyền/ID thiếu và ID sai đạt | PASS | — | E1 orders:13,46,75 | Không dùng tài khoản thật để thử truy cập chéo |
| TC4-18 | HTTP snapshot vẫn đúng sau sửa/bỏ fixture hiện tại | PASS | — | E1 purchase-flow:22; orders:29 | Chưa thực hiện DELETE sản phẩm thật; xem RG-07 |
| TC4-19 | Phí cũ 45000 và warning thiếu dữ liệu đúng | PASS | — | E1 orders:29,53 | Voucher/thuế tương lai cần quy ước/schema khác |
| TC4-20 | Không có cột trạng thái sản phẩm/biến thể | NEEDS REVIEW | — | E4/E9 | Đã hoãn ở GĐ4, nhưng cần thiết kế trước GĐ5; R-02 |
| TC4-21 | HTML vẫn báo COD với fixture bank/paid | FAIL | Medium | E7; views/checkout/success.ejs:5 | B-02 là lỗi trình bày thành phần; chưa phải sai dữ liệu thanh toán DB |
| TC4-22 | Có khóa variants theo ID nhưng JOIN còn khóa products | NEEDS REVIEW | — | E9 checkout-repository:10–12 | Có thể đảo thứ tự product khi variant đan xen; chưa tái hiện deadlock |

### 4.5. Bảo mật, giao diện và regression liên giai đoạn

| ID | GĐ | Chức năng | Mục tiêu | Tiền ĐK | Dữ liệu | Bước thực hiện | Mong đợi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RG-01 | 1–4 | Desktop live | Xác nhận tất cả trang tích hợp | B | Catalog/account/cart/checkout/orders | Đề xuất xem desktop ở app test sau duyệt | Font/màu/header/footer/bố cục thống nhất, không tràn |
| RG-02 | 1–4 | Mobile | Responsive và thao tác form | B | Rộng 360/390/768, bàn phím ảo | Đề xuất mở trang, cuộn, nhập, đổi variant | Không che nút/tổng tiền, điều khiển dùng được |
| RG-03 | 1–4 | Console/log thật | Không có lỗi JS bất thường | B | Luồng từ catalog đến chi tiết đơn | Đề xuất thu console/network và log app test | Không uncaught error; phân biệt lỗi cố ý với bất thường |
| RG-04 | 4 | Loading/back-forward | Nút đặt phục hồi khi quay lại | E9; B để tái hiện | Submit rồi browser Back/BFCache | Đọc checkout.js, đề xuất thử offline/Back | Không kẹt disabled hoặc dữ liệu tổng cũ |
| RG-05 | 1–4 | Regression | Không hỏng chức năng cũ | M/C/R | Toàn bộ suite và GET an toàn | Chạy E1/E2/E3 | Tất cả assertion trong phạm vi suite đạt |
| RG-06 | 3–5 | Quyền admin tương lai | Không suy ra đã có requireAdmin | E9 | role=user/admin, route admin chưa có | Đọc middleware/routes; đề xuất test trước thêm admin | Route admin mới phải kiểm tra role server và CSRF |
| RG-07 | 4–5 | Xóa/FK thật | Giữ lịch sử khi xóa dữ liệu liên quan | W | Fixture test với order snapshot/FK | Đề xuất DELETE địa chỉ/biến thể chỉ trên test riêng và đọc lại | FK NULL đúng, snapshot nguyên; không xóa sản phẩm giao dịch ở admin thật |
| RG-08 | 1–4 | Không thay đổi dự án | Chỉ có report mới | R; hash ban đầu | 5.994 file đã lưu | So digest trước/sau, kiểm tra số đếm DB | File cũ không đổi; không DML/DDL trong audit |

| ID | Thực tế | Trạng thái | Severity nếu FAIL | Bằng chứng | Ghi chú/hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| RG-01 | Chưa mở browser live trong lượt này | NOT TESTED | — | E8 ảnh cũ; E9 CSS | Ảnh cũ không tự biến thành PASS bản hiện tại |
| RG-02 | Chưa chạy thiết bị/viewport mobile | NOT TESTED | — | E9 @media trong CSS | Có breakpoint không chứng minh mobile đạt |
| RG-03 | Chưa thu browser console/log đầy đủ | NOT TESTED | — | E1 có log generic do test cố ý | Không dùng log lỗi mock để kết luận server thật đang lỗi |
| RG-04 | Không có handler pageshow/reset submitting | NEEDS REVIEW | — | E9 public/js/checkout.js:3–8 | R-05; có dấu hiệu BFCache giữ disabled, chưa tái hiện browser |
| RG-05 | 47/47 và 7/7 CTE đạt; GET an toàn đạt | PASS | — | E1/E2/E3 | Không suy rộng sang các case NOT TESTED/BLOCKED |
| RG-06 | Có role trong DB nhưng chưa có tuyến admin/guard admin | NEEDS REVIEW | — | E9 routes; users.role | Không phải truy cập trái phép đã tái hiện; điều kiện bắt buộc trước GĐ5 |
| RG-07 | Chưa thực hiện xóa trên MySQL | BLOCKED | — | E4 FK; E1 chỉ mô phỏng | Chỉ mô tả cách thử; cần quyền ghi test riêng mới |
| RG-08 | So digest cuối; xem mục bảo toàn cuối báo cáo | PASS | — | Dấu vân tay trước/sau, danh sách lệnh chỉ đọc | PASS này giới hạn bản đã lưu, không bao quát buffer chưa Save |

## Phần 5 – Danh sách lỗi và rủi ro theo mức độ

### 5.1. Critical

Không có lỗi Critical đã tái hiện trong lần audit. Không chứng nhận hệ thống
không còn lỗi Critical: chưa pentest đầy đủ, chưa fault injection crash thật.

### 5.2. High – rủi ro qua code review, chưa phải FAIL tái hiện

**R-01 – Token đặt hàng không bền vững và cửa sổ commit mơ hồ.** GĐ4;
`src/services/checkout-service.js:8–50`. Map chỉ nằm trong tiến trình, trạng thái
done chỉ được lưu sau await repository.place. Crash sau commit, mất phản hồi,
restart hoặc nhiều instance không có khóa duy nhất trong orders để tra cứu
theo yêu cầu gốc. Mong đợi chống lặp bền vững khi nghiệp vụ yêu cầu; thực tế chỉ
đã chứng minh mock same-process và có E8 cũ. **Ảnh hưởng tiềm tàng High: đơn
ngoài ý muốn hoặc người mua không biết kết quả**, không hạ mức vì chưa tái hiện.
Không khẳng định chắc chắn tạo trùng: việc xóa giỏ và đối chiếu ID dòng đã ngăn
nhiều đường retry. Giới hạn local này đã được duyệt; trước mở rộng cần quyết
định idempotency lưu DB/tra cứu kết quả và duyệt schema riêng, không tự thêm.

**R-02 – Chưa có mô hình ngừng bán/vô hiệu hóa và hàng rào xóa quản trị.** GĐ4→5;
schema products/product_variants/users; FKs cart/reviews. Chưa có active/archive
column; xóa biến thể CASCADE giỏ; xóa sản phẩm CASCADE reviews. Mong đợi admin
không làm mất lịch sử giao dịch/đánh giá hoặc tiếp tục bán mặt hàng đã ngừng.
Hiện chưa có admin nên chưa tái hiện thao tác sai; **rủi ro High khi thêm admin**.
Đề xuất duyệt archive/disable và chính sách xóa trước; không dùng stock=0 làm
archive, không tự thêm cột trong audit.

**R-03 – Quyền admin và quy tắc writer đồng thời chưa được thiết kế/kiểm thử.**
GĐ3→5; các route/middleware hiện chỉ xác thực user, chưa có admin route nên
không gọi đây là lỗ hổng route đang tồn tại. GĐ5 phải có requireAdmin, không
tin role từ request; mọi cập nhật tồn kho/thuộc tính/địa chỉ mặc định phải có
quy tắc khóa tương thích checkout. Nếu admin sửa mapping thuộc tính đồng thời,
subquery kiểm tra biến thể không đồng nghĩa đã khóa tất cả mapping. Mong đợi
tránh privilege escalation và sai trạng thái bán; **ảnh hưởng High** nếu bỏ qua.
Cần test user thường gọi từng route admin và race sửa biến thể/đặt hàng trên
DB test, chưa đủ quyền để thử trong audit này.

### 5.3. Medium – lỗi đã tái hiện

**B-01 – HTTP 413 bị báo 500.** GĐ1; `src/middleware/error-handler.js:16–23`,
liên quan `express.urlencoded({limit:'16kb',parameterLimit:40})` trong app.js.
Tái hiện không ghi DB: gọi middleware trực tiếp với `{status:413,
type:'entity.too.large'}` và response stub. Mong đợi 413, thông báo an toàn;
thực tế stub nhận 500. Trạng thái **FAIL thành phần**, severity **Medium**:
request quá lớn bị hiểu là lỗi máy chủ, khó hướng dẫn người dùng và sai giám
sát. Chưa gửi HTTP body quá lớn trên ứng dụng thật. Đề xuất xử lý các lỗi parser
4xx được nhận diện, giữ status phù hợp nhưng không trả message gốc/stack.

**B-02 – Xác nhận cố định COD khi dữ liệu không phải COD.** GĐ4;
`src/views/checkout/success.ejs:5`, controller success lấy một đơn bất kỳ thuộc
user theo ID. Tái hiện: renderFile với fixture `payment_method='bank',
payment_status='paid',status='cancelled'`, không SQL. Mong đợi hiển thị đúng
phương thức/trạng thái hoặc thông báo nhánh không hỗ trợ; thực tế HTML vẫn có
“Đã ghi nhận đơn COD”, không phản ánh các trường trên. Trạng thái **FAIL template**,
severity **Medium**; không khẳng định DB bị ghi sai trạng thái thanh toán.
Nhánh tạo đơn MVP chỉ COD nên ảnh hưởng hiện tại giới hạn; vẫn cần sửa trước
khi admin thay trạng thái/đơn cũ hoặc mở bank. Đề xuất dùng nhãn từ dữ liệu thật,
đồng thời kiểm tra ngữ cảnh truy cập trang xác nhận.

### 5.4. Medium – cần xem xét, chưa sửa

- **R-04 – Deadlock đa sản phẩm/biến thể.** `checkout-repository.js:10–12` khóa
  variant theo ID tăng dần, nhưng JOIN FOR UPDATE còn khóa product. Các cart
  với variant đan xen giữa hai product có thể dẫn thứ tự product khác nhau.
  Chưa có lịch chạy tái hiện; không kết luận chắc chắn deadlock. Mong đợi rollback
  an toàn và thông báo thử lại; hiện lỗi DB ngoài CartError thành 500 chung,
  không tự retry. Cần test hai connection thật và admin writer; không retry
  mù sau commit không rõ kết quả.
- **R-05 – Nút checkout có thể kẹt khi Back/BFCache.** `public/js/checkout.js:3–8`
  đặt dataset.submitting=1 và disabled=true, không reset pageshow. Mong đợi form
  khi quay lại được kiểm tra/refresh giá và có thể dùng; thực tế chỉ đọc code,
  chưa browser repro. Cần test trình duyệt thật trước quyết định sửa.
- **R-06 – Mặc định địa chỉ chỉ được bảo đảm bởi application lock.**
  `address-repository.js` khóa users; schema không có UNIQUE bảo đảm một default.
  Test mock đã đạt. Writer mới ở admin/import/direct SQL có thể bỏ lock; cần
  dùng cùng invariant và kiểm thử đồng thời thật. Không tự thêm UNIQUE/trigger.
- **R-07 – Phí lịch sử suy ra và mốc giá giỏ.** Phí = total − SUM(quantity×unit_price)
  hợp lệ với MVP chưa discount/tax; sau mở rộng sẽ không phân biệt phí/giảm giá.
  Giỏ không lưu giá lúc thêm nên không nhận biết thay đổi từ thời điểm đó.
  Đây là giới hạn đã duyệt, không phải FAIL giá backend hiện tại. Chỉ đổi schema
  khi có nghiệp vụ và phê duyệt riêng.

### 5.5. Low – tài liệu/phạm vi

**D-01 – Tài liệu có đoạn lỗi thời.** AGENTS còn nói district chưa chốt, README
còn đoạn tài khoản chưa kiểm thử ghi MySQL trong khi báo cáo nghiệm thu sau đó
có 13/13 kết quả tích hợp. Lần audit ưu tiên quyết định user mới nhất: district
tùy chọn lưu chuỗi rỗng; kết quả cũ chỉ kế thừa có ghi nguồn. Chưa sửa tài liệu
vì chỉ được tạo báo cáo. Đề xuất cập nhật sau khi người dùng giao riêng.

Không tìm thấy bằng chứng mới về secret trong response ở các URL/nhánh đã thử;
không tuyên bố đã quét sạch mọi secret trong mọi lịch sử Git/log hoặc dependency.

## Phần 6 – Rủi ro database và cấu trúc đã xác minh

| Bảng/nhóm | Cấu trúc thực tế và ràng buộc | Hệ quả nghiệp vụ |
| --- | --- | --- |
| users | user_id INT PK auto; full_name VARCHAR(100), phone VARCHAR(15) UNIQUE, password VARCHAR(255), role ENUM user/admin; created_at mặc định CURRENT_TIMESTAMP; trường lõi NOT NULL | Phone-only; mật khẩu là hash ở ứng dụng; chưa có disable/soft delete |
| user_addresses | address_id PK auto; user_id FK users CASCADE; receiver_name/phone/address_detail/ward/district/province NOT NULL; is_default TINYINT(1) NOT NULL DEFAULT 0; index user_id | district VARCHAR(100) cho phép chuỗi rỗng, không cho NULL; service kiểm tra các field còn lại; default cần khóa app |
| categories/products | category PK, tên category UNIQUE; products.product_id PK, category_id nullable SET NULL; tên/brand/description, created_at; ảnh MEDIUMBLOB và MIME VARCHAR(50) | Không có active/archive; category bị xóa không xóa sản phẩm |
| product_variants | variant_id PK; product_id FK CASCADE; sku VARCHAR(50) UNIQUE; variant_name VARCHAR(200); price DECIMAL(12,2) CHECK >=0; stock INT DEFAULT 0 CHECK >=0; ảnh/MIME | Kho tại variant; schema chấp nhận giá 0, service mua đòi >0; không có ledger kho riêng |
| options/values/mapping | option PK, unique(product_id,option_name); value PK, unique(option_id,value_name); mapping PK(variant_id,option_value_id), các FK CASCADE | DB chưa bảo đảm đúng một value/option/cùng product; SQL VALID_VARIANT bổ sung kiểm tra, cần giữ invariant khi có admin |
| cart_items | cart_item_id PK auto; user_id/variant_id NOT NULL FK CASCADE; quantity INT NOT NULL DEFAULT 1 CHECK >0; UNIQUE(user_id,variant_id), index variant_id | Chống dòng trùng; giới hạn 99/stock là app; không snapshot giá/thời điểm thêm; xóa variant mất dòng cart |
| orders | order_id PK auto; user_id NOT NULL FK NO ACTION; address_id nullable FK SET NULL; snapshot receiver_name/phone/address_detail/ward/district/province NOT NULL; total_amount DECIMAL(12,2) CHECK >=0 | Đã có snapshot địa chỉ, không thiếu như giả định prompt; không có subtotal/shipping riêng hoặc idempotency key |
| orders trạng thái | status ENUM pending/confirmed/shipping/delivered/cancelled DEFAULT pending; payment_method cod/bank DEFAULT cod; payment_status paid/unpaid/refund DEFAULT unpaid; created_at CURRENT_TIMESTAMP, updated_at tự cập nhật | Có enum không đồng nghĩa đã có nghiệp vụ bank/refund/admin/cancel |
| order_items | PK; order_id NOT NULL FK CASCADE; product_id/variant_id nullable SET NULL; snapshot product_name NOT NULL, variant_name/sku nullable; quantity CHECK >0; unit_price DECIMAL(12,2) CHECK >=0; index order/product/variant | Snapshot tên và giá đầy đủ cho MVP; thành tiền tính từ snapshot, không JOIN giá hiện tại; xóa orders sẽ xóa items nên không có chức năng đó |
| reviews | review_id PK; UNIQUE(user_id,product_id), UNIQUE(order_item_id); rating CHECK 1..5; FK user/product/order_item CASCADE | Đúng một review/product/user ở DB, nhưng DB chưa chứng minh order_item thuộc user/product và order delivered; GĐ5 phải kiểm tra server |

Tất cả FK UPDATE_RULE hiện là NO ACTION. Không chạy lại dump vì dump chứa DROP,
LOCK TABLES và ALTER DISABLE/ENABLE KEYS. Không tạo migration trong audit.

Về tiền/kho: đã thấy truy vấn tham số, BigInt theo phần trăm đồng, khóa users,
cart, variants, kiểm tra address, UPDATE stock với điều kiện stock>=quantity,
commit/rollback/release cùng connection. Đây là điểm tốt từ code và mock; **không
dùng riêng việc đọc code để cấp PASS cho InnoDB mới**. R-01/R-04 vẫn cần test.

Về xóa: schema SET NULL giữ snapshot đơn, nhưng chính sách admin vẫn phải cấm
xóa cứng sản phẩm có giao dịch. Tài khoản có orders bị FK chặn xóa; disable
chưa có. Reviews có CASCADE nên cần thiết kế chính sách bảo toàn trước GĐ5.

## Phần 7 – Kết luận và khuyến nghị

**Chọn kết luận 2: Chỉ nên chuyển sang Giai đoạn 5 sau khi sửa các lỗi được liệt kê.**

Không có bằng chứng buộc kết luận 3 về lỗi nghiêm trọng đang phá giá/kho/quyền
người dùng. Tuy nhiên “47/47 test đạt” không phủ được hai lỗi thành phần mới và
những tình huống chưa thử; vì vậy không chọn kết luận 1 vô điều kiện.

Điều kiện trước khi mở rộng chức năng quản trị:

1. Được giao sửa B-01/B-02, thêm regression đúng nhánh đã tái hiện, chạy lại suite.
   Với B-02, nêu rõ nhánh bank nằm ngoài tạo đơn MVP nhưng template không được
   cung cấp thông tin sai khi dữ liệu đầu vào cho phép nhánh đó.
2. Thống nhất vẫn demo một tiến trình hay yêu cầu idempotency bền vững. Không
   bắt buộc tự thêm bảng/cột chỉ để “đạt điểm”; nếu vẫn giữ local phải ghi rõ
   giới hạn và có hướng dẫn tra cứu đơn khi phản hồi không rõ kết quả.
3. Duyệt thiết kế archive/disable, quy tắc xóa và requireAdmin trước viết endpoint
   quản trị; quy tắc review chỉ sau delivered và thuộc user/product phải ở server.
4. Xin phép chạy lại các case W trên môi trường test riêng; ưu tiên race có admin
   writer, rollback và lỗi kết nối. Không dùng database đang có đơn thật để thử.
5. Kiểm tra desktop/mobile, console và Back/BFCache checkout. Không gọi UI hoàn
   thành trên mọi thiết bị chỉ từ sự tồn tại của CSS breakpoint.

Không yêu cầu triển khai OTP, trả hàng, thanh toán online hoặc đổi framework để
khắc phục các phát hiện này. Những chức năng đó vẫn ngoài phạm vi đã duyệt.

## Phần 8 – Kế hoạch kiểm thử tiếp theo

### 8.1. Database test riêng – chỉ là đề xuất, chưa chạy trong audit

Môi trường riêng đã có từ nhiệm vụ trước; không cần tự tạo lại hay sao chép dữ
liệu người dùng. Sau phê duyệt mới, kiểm tra tên DB chính xác, @@datadir/cổng,
account/grants rồi dùng fixture nhân tạo. Không sửa `.env` website. Không chạy
script có --run/--create/--start/--stop trong nhiệm vụ chỉ đọc hiện tại.

| Ưu tiên | Case | Cách thực hiện an toàn sau duyệt | Tiêu chí chấp nhận |
| --- | --- | --- | --- |
| P1 | TC4-15/TC3-14 | Rerun test:mysql trên instance riêng, fixture mới, giữ chứng cứ từng nhóm | Commit, hash, UNIQUE, kho và rollback thật đúng; không ghi source DB |
| P1 | TC4-16/R-01 | Fault injection mất response và kết nối quanh commit; restart chỉ process test | Biết kết quả hoặc tra cứu được, không tự tạo đơn mới ngoài ý muốn |
| P1 | TC4-22/R-03 | Hai connection và admin writer test theo lịch khóa nhiều products/variants | Không âm kho/mất snapshot; deadlock bị rollback và hướng dẫn thử lại an toàn |
| P1 | RG-07 | Xóa địa chỉ/variant fixture có đơn chỉ trong test DB | FK NULL; snapshot nguyên; không xóa order/history |
| P2 | TC1-07 | Sai endpoint ở process test riêng, không dừng MySQL website | Timeout hữu hạn, log an toàn, pool được đóng |
| P2 | R-06 | Nhiều cập nhật default qua mọi writer test | Một địa chỉ mặc định/user hoặc trạng thái được quy định rõ |

### 8.2. Trình duyệt và regression sau sửa

- Desktop: trang chủ, tìm/lọc/page, detail/variant/ảnh thiếu, register/login,
  account/address, giỏ, checkout, success/history/detail; trạng thái rỗng/lỗi.
- Mobile 360/390/768px và ít nhất một thiết bị thật: header/menu, nút, bảng/tổng,
  bàn phím ảo, cuộn ngang, input số và select địa chỉ.
- Loading: submit một lần, response chậm, Back/Forward, trang khôi phục từ BFCache;
  kiểm tra nút/tổng tiền và việc bắt xác nhận lại, không nhầm disabled với idempotency.
- Console/network/log: không uncaught JS, CSS/font/ảnh không 404 bất thường;
  không log token/phone/password/SQL. Log cố ý của test lỗi phải được đánh dấu.
- Sau sửa B-01: kiểm tra status 400/413 hợp lệ bằng app test, vẫn che stack; chạy
  lại foundation/CSRF/session để tránh bỏ lỗ bảo mật vì xử lý lỗi rộng quá mức.
- Sau sửa B-02: COD unpaid/paid/cancelled và bank ở template hoặc test DB; giá
  trị order thật không bị thay; lịch sử/detail và ownership vẫn đúng.
- Sau GĐ5: regression toàn bộ 47 nhóm hiện có, CTE Catalog, tích hợp MySQL riêng,
  cộng ma trận user/admin, ngừng bán, review delivered, không xóa cứng lịch sử.

### Bảo toàn cuối nhiệm vụ

Chỉ tạo `docs/REPORT_TEST_PHASE_1_TO_4.md`; không sửa các file khác. Dấu vân tay
nội dung 5.994 file cũ trong phạm vi kiểm tra khớp hoàn toàn trước/sau. Đếm cuối:
users=1, user_addresses=1, products=24, variants=48, orders=1, order_items=1,
cart_items=2, tổng stock=864, khớp lần đọc đầu của audit. Đây là đối chiếu số
đếm/tổng kho, không phải checksum từng bản ghi dữ liệu hoặc audit log MySQL.

Đã kiểm tra đủ 64 ID không trùng và cộng trạng thái bằng đọc lại Markdown:
49 PASS + 2 FAIL + 4 NOT TESTED + 4 BLOCKED + 5 NEEDS REVIEW = 64. Không cộng
13 kết quả MySQL cũ hoặc 47 nhóm runner lần nữa vào tổng case. Báo cáo không
chứa mật khẩu, token, secret, dữ liệu nhận hàng hoặc cấu hình kết nối thật.
