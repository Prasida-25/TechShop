# REPORT GATE PHASE 5 – TECHSHOP / TECHZONE

Ngày kiểm tra: 23/10/2026 (UTC+7).

## 1. Tổng quan kết quả

**Phân loại: CHƯA ĐỦ BẰNG CHỨNG, CẦN KIỂM THỬ THÊM để xác nhận gate chuyển giai đoạn 6.**

Không có lỗi Critical/High được tái hiện trong lượt chạy an toàn này. Code hiện
có các chức năng chính của giai đoạn 5; bộ regression đạt **91/91**. Đây là kết
quả thành phần và HTTP với dữ liệu giả lập, không phải 91 bài MySQL end-to-end.

Ngoài ra đã đọc được **bằng chứng lịch sử** của 28 nhóm tích hợp giai đoạn 4,
7 nhóm sản phẩm/biến thể và 16 nhóm đơn/COD/review, tất cả ghi nhận đạt. Một số
nhóm giai đoạn 4 thực sự có HTTP/session + InnoDB + SELECT đối chiếu sau thao tác.
Không được kết luận dự án chưa từng kiểm thử MySQL thật. Tuy nhiên, không có
bằng chứng tương đương đầy đủ cho **HTTP/session → phân quyền admin → thao tác
sản phẩm/đơn/COD/review trên MySQL**, và chưa thấy case admin sửa stock cạnh
tranh checkout chạy trên hai connection thật.

Không chạy lại runner ghi MySQL trong nhiệm vụ này. Không tạo tài khoản, đơn,
review hoặc fixture database; không sửa code/schema/cấu hình. Chỉ tạo báo cáo.

### 1.1. Phạm vi đã đối chiếu

Thư mục gốc: `D:\Duong\Đồ án cơ sở\TechShop`.

- AGENTS.md, package.json, SQL gốc và các báo cáo/tài liệu giai đoạn 4–5.
- src/app.js; routes/admin.js, reviews.js, orders.js; middleware admin-auth,
  account-auth, CSRF và cách helper HTTP truyền cookie/token/session.
- Service/repository/validation quản trị sản phẩm, đơn, COD, review; checkout,
  tính giá/phí, khóa tồn kho, order snapshot; server/worker tự hủy 72 giờ.
- Các EJS quản trị, đơn mua/review/catalog và mô tả hướng dẫn hiện tại.
- tests/*.test.js, helper mock; scripts/check-admin-products.cjs,
  check-admin-orders.cjs và check-purchase-mysql.cjs; artifact đã có trong .test-runtime.

Các đường dẫn bên dưới tính từ thư mục gốc này. Báo cáo không công bố giá trị
.env, mật khẩu, token, cookie hoặc thông tin cá nhân của khách.

### 1.2. Đối chiếu chức năng giai đoạn 5

| Chức năng | Code/route chính | Đánh giá có giới hạn bằng chứng |
| --- | --- | --- |
| Sản phẩm/biến thể | /admin/products; thêm/sửa product và variants; admin-product service/repository/validation | Đã có; validation/ảnh/SKU/parent/options được kiểm tra bằng test mới. Có artifact service/MySQL cũ, chưa đầy đủ HTTP/MySQL admin |
| Đơn hàng | /admin/orders; POST :orderId/status và :orderId/cancel; admin-order-rules | Chuỗi pending→confirmed→shipping→delivered; admin hủy pending/cod/unpaid; khóa/hoàn kho có điều kiện; đã kiểm tra mock và đọc artifact InnoDB cũ |
| Phân quyền admin | router.use('/admin', requireAuth, requireAdmin); account-auth tải user | Test HTTP mới chặn guest/user, request giả role/user_id và session cũ. Dữ liệu tài khoản dùng mock, không phải user MySQL thật |
| COD | POST /admin/orders/:orderId/confirm-cod | Chỉ delivered/cod/unpaid, checkbox + CSRF + role admin; gửi lại đơn paid không ghi lần hai; GET/chuyển giao hàng không tự thu COD |
| Review | GET/POST /orders/:orderId/items/:itemId/review; GET /products/:productId/reviews | Kiểm tra chủ đơn và delivered; product suy ra từ item; một lần/người/sản phẩm; rating 1–5; có SQL UNIQUE và test mock/InnoDB lịch sử |

Schema reviews có user_id/product_id/order_item_id, FK tương ứng và UNIQUE
(user_id,product_id), UNIQUE(order_item_id). orders lưu snapshot người nhận/địa
chỉ/tổng tiền; order_items lưu tên/variant/SKU/quantity/unit_price. Các nhận xét
schema ở đây dựa trên SQL/code và bằng chứng đã có, **không phải truy vấn metadata
mới trong lượt gate này**.

Không triển khai bank/online/refund/webhook. Sửa/xóa/kiểm duyệt review chưa được
duyệt. Product chưa có trạng thái ẩn/ngừng bán; không coi chức năng đó đã hoàn
thành. Không có route xóa cứng product/variant trong phạm vi hiện tại.

## 2. Các kiểm thử đã thực sự chạy

### 2.1. Lượt chạy mới

Lệnh duy nhất chạy bộ test:

```powershell
node --test --test-reporter=tap tests/*.test.js
```

Đây là cùng bộ file và Node test runner của `npm test`, chỉ chọn reporter TAP để
trích chính xác tên/kết quả từng bài. Không báo đã chạy thêm npm test lần thứ hai.

Kết quả: exit 0; **83 test cấp ngoài + 8 subtest = 91 PASS**, FAIL=0,
cancelled=0, skipped=0, todo=0. Thời gian Node báo 8882.5961 ms. Các log lỗi HTTP
thuộc test cố ý gây lỗi để kiểm tra thông báo an toàn, không phải bài test thất bại.

Môi trường: Node.js hiện có trên Windows local; Express listen cổng ngẫu nhiên
127.0.0.1 trong các test HTTP; không khởi động src/server.js. Helper withAccountApp
sử dụng session/cookie/CSRF middleware thật với MemoryStore, user/repository test
trong bộ nhớ. Các mutex/transaction mô phỏng không chứng minh khóa InnoDB.

Phụ lục cuối báo cáo ghi **đúng tên 91 kết quả PASS**, file, lớp kiểm tra, loại
database và việc có đối chiếu database thật hay không. Những bài chỉ gọi validator,
service, repository hoặc EJS được tách khỏi bài HTTP/session.

### 2.2. Kiểm tra tĩnh và bảo toàn file

- Đọc code/routes/SQL/test/runner bằng Get-Content, rg và đọc JSON artifact.
- Rà các test hiện có trước khi chạy: không gọi runner MySQL hoặc script tạo
  fixture database; không chạy npm install hoặc cập nhật dependency.
- Không kết nối database trong lượt gate này; không có SELECT mới trên database
  ứng dụng. Phép đọc MySQL ở REPORT_ACCEPTANCE_PHASE_5.md là lượt kiểm tra trước,
  không tính như một kết quả mới ở đây.
- Đối chiếu hash 6.042 file hiện có trong src/public/frontend-static/database/
  tests/scripts/docs và các file cấu hình/hướng dẫn chính, loại trừ báo cáo này.
  Hash trước/sau khớp; không thay file dự án khác. Chỉ đọc artifact, không ghi đè nó.
- Không dùng npm start/dev vì server.js có worker tự hủy có thể cập nhật đơn/kho
  ngay sau listen. Không khởi động instance test hoặc chạy cleanup.

### 2.3. Bằng chứng lịch sử đã đọc và kiểm tra chất lượng

Các dòng dưới là **kết quả cũ lưu trong artifact**, không phải bài test vừa chạy.
Không cộng 28+7+16 vào 91 để tạo một tổng PASS chung vì thời điểm/phạm vi khác nhau.

| Artifact | Định danh / kết quả cũ | Môi trường và kiểu thực thi | Có đối chiếu database? |
| --- | --- | --- | --- |
| .test-runtime/integration-results.json | 2026-10-22T17-45-51-225Z-be74d1e9; 28/28 PASS | MySQL test riêng; gồm service và HTTP/session thật qua createApp, có cả child process restart | Có: snapshots/SELECT, cleanupAndOldDataVerified=true, hash before/after khớp, activeInnoDBTransactions=0 |
| .test-runtime/admin-products-results.json | ITP2-ed2af033458125f7; 7/7 PASS | Service/repository trực tiếp, InnoDB test; không kiểm tra HTTP/session admin | Có: SELECT BLOB/variants/history, digest trước/sau, cleanup PASS |
| .test-runtime/admin-orders-results.json | 4c552c472c2210dd; 16/16 PASS | Service/repository/worker trực tiếp, InnoDB test; không chạy route HTTP admin/review cùng user MySQL | Có: snapshot stocks/orders/items/reviews, connection IDs cạnh tranh, cleanup PASS, hash before/after khớp |

.test-runtime/results.json là bản tóm tắt cùng 28 nhóm của integration-results,
không phải một lượt độc lập để cộng thêm. Tên purchase-mysql-results.json không
tồn tại; đã xác minh runner thực tế ghi integration-results.json, không coi việc
khác tên file là thiếu toàn bộ bằng chứng.

Các artifact không gắn source revision/hash đầy đủ của thời điểm chạy. Do đó
bằng chứng cũ có giá trị cho tình huống đã chạy nhưng không chứng thực tự động
mọi nhánh code hiện tại hoặc mọi race giữa các chức năng được thêm sau đó.

### 2.4. Ma trận các luồng nghiệp vụ quan trọng

| Luồng cần đánh giá | Test mới đã chạy và lớp bằng chứng | MySQL/HTTP lịch sử có thật | Phần còn chưa chứng minh |
| --- | --- | --- | --- |
| Đặt hàng thiếu kho | “Checkout: từ chối giỏ/giá/kho/địa chỉ thay đổi và xác nhận lại giá mới”, service/mock; “Giỏ: kiểm tra số lượng, ID, giá dương, biến thể hợp lệ và tồn kho ở backend”, service/mock | Artifact giai đoạn 4 có quantity/stock/empty và rollback; SQL đối chiếu | Chưa chạy lại ghi trên source hiện tại; test mới không chứng minh InnoDB |
| Hai khách tranh kho 1 | “Luồng mua HTTP: hai khách đồng thời tranh kho 1 (DB giả lập, không chứng minh InnoDB)”, HTTP/session/mock | “HTTP-two-customers-last-stock-overlapping-InnoDB-5-rounds”: 5 vòng, hai connection khác nhau, một 303/một 409, 1 đơn, stock 0; SELECT thật. Có thêm “real-InnoDB-last-stock-race-5-rounds” ở service | Không suy ra mọi cặp cạnh tranh admin/checkout cũng đã được thử |
| Hủy hoàn kho nhiều lần | “Hủy admin: hai yêu cầu đồng thời hoàn kho một lần; từ chối đơn đã thu tiền/khác COD/đã xác nhận”, service/mock | “two-admin-cancellations-real-connections-restore-once”, “admin-cancel-vs-expiry-restore-once”: service/InnoDB/SELECT, không HTTP | Route admin + user MySQL + transaction chưa được kiểm tra cùng một test |
| Giá/tên/địa chỉ đổi ảnh hưởng lịch sử | “Đơn hàng: snapshot độc lập catalog/địa chỉ đã xóa; phí lịch sử không tính lại”; “Luồng mua HTTP: giỏ → xác nhận lại giá → 12 request lặp → lịch sử snapshot”, mock | “edit-traded-product-price-stock-keeps-history-and-image”, “history-snapshots-after-edit-and-FK-SET-NULL”: ghi fixture rồi SELECT so sánh snapshot | Không có trạng thái ngừng bán hiện tại để kiểm tra; không tự giả định có |
| Khách thao tác dữ liệu người khác | “Đơn hàng HTTP/EJS: session, quyền, phân trang, snapshot, rỗng, lỗi an toàn và CSS”; test HTTP review, đều mock | “HTTP-owner-address-cart-order-and-spoofed-user”: tài khoản/HTTP/MySQL thật cho cart/address/order; review owner có service/InnoDB cũ | Review mới và HTTP/MySQL trong một luồng chưa được thử; khách chưa có route sửa đơn riêng |
| Khách truy cập admin | “Admin: user bị chặn cả GET/POST/PUT/PATCH/DELETE, không nâng quyền từ request”; HTTP/session thật, user mock | Runner admin gọi service trực tiếp nên **không** chứng minh guard MySQL/HTTP | Cần user/admin fixture được duyệt trên test để xác minh toàn đường đi |
| COD và trạng thái giao hàng | 5 nhóm admin-payments, gồm HTTP/session/mock, GET không ghi, điều kiện delivered/cod/unpaid và gửi lại | 3 nhóm cod-receipt trong artifact admin-orders: service/InnoDB, hai connection và rollback/SELECT | Chưa HTTP admin/session MySQL cùng commit COD; không có refund/online |
| Điều kiện review và trùng nhiều đơn | 7 nhóm reviews, gồm HTTP/session/mock và validation/owner/delivered/duplicate | 4 nhóm reviews-real-* trong artifact admin-orders: service/InnoDB, UNIQUE thực tế/SELECT/rollback | Chưa route HTTP/session MySQL thật cho review |

### 2.5. Phân tích code, không trình bày thành PASS runtime

- Checkout mở một transaction, khóa user/cart và variants theo thứ tự ID, đọc
  lại giá/stock và địa chỉ thuộc user, so fingerprint khách duyệt. UPDATE stock
  có điều kiện stock>=quantity, kiểm tra affectedRows trước lưu order/items,
  clear cart và commit. Lỗi đi qua rollback/release. Đây là cấu trúc code;
  bằng chứng thực nghiệm nằm ở test mới/mock và artifact cũ tách riêng ở trên.
- Hủy khóa order, kiểm tra pending/cod/unpaid, khóa/gộp items và variants, hoàn
  kho có điều kiện không tràn INT rồi chuyển cancelled trong cùng transaction.
  Request sau đọc lại status không còn pending nên không hoàn lần hai. FK NULL
  hoặc thiếu variant bị từ chối, không đoán dữ liệu để hoàn kho.
- Admin sửa variant khóa product/variant, kiểm tra expected_stock và confirm_stock.
  Điều này bảo vệ form stale đã được kiểm thử; chưa thấy test admin sửa stock
  **đồng thời** checkout qua các connection thật. Thứ tự khóa khác nhau có thể
  tạo chờ/deadlock; không đủ căn cứ kết luận đã mất cập nhật hoặc bán vượt kho.
- Review JOIN orders/order_items/products lọc chủ đơn từ session, kiểm tra
  delivered, suy product_id từ item và kiểm tra lại trong transaction. UNIQUE
  bảo vệ user/product và order_item; không tin các ID quyền sở hữu trong body.
- Order snapshot không phụ thuộc giá/địa chỉ hiện tại. buyer_name admin là tên
  tài khoản hiện tại; receiver_name/address thuộc snapshot lúc đặt, không nhầm hai khái niệm.

## 3. Các kiểm thử chưa chạy

| ID | Kiểm tra cần bổ sung | Trạng thái lần này | Lý do và cách làm an toàn |
| --- | --- | --- | --- |
| B01 | HTTP/session/MySQL admin: user thường bị chặn, role bị thu hồi, CSRF, thao tác thực tế | BLOCKED | Không tạo tài khoản hoặc ghi DB; cần user/admin test được duyệt, không tự tạo mật khẩu admin |
| B02 | Tạo/sửa product/variant, status/cancel/COD qua HTTP admin trên MySQL test | BLOCKED | Có test mock + service/MySQL cũ; cần nối thành một luồng và SELECT đối chiếu |
| B03 | Review owner/delivered/duplicate qua HTTP/session/MySQL trong một lượt | BLOCKED | Có HTTP/mock + service/MySQL cũ, chưa đủ bằng chứng lớp kết hợp |
| B04 | Admin cập nhật stock cạnh tranh checkout, rollback hai phía | BLOCKED | Cần hai connection, fixture kho thấp, barrier và SELECT kho/đơn; không dùng dữ liệu demo |
| B05 | Chạy lại regression tích hợp MySQL sau khi đã cố định snapshot source cho gate | BLOCKED | Các runner ghi/cleanup nên không được chạy theo giới hạn nhiệm vụ |
| N01 | Visual desktop/mobile, console, bàn phím, trạng thái rỗng/lỗi/loading | NOT TESTED | EJS render/CSS không thay kiểm tra browser. Phần này phù hợp mục tiêu hoàn thiện của giai đoạn 6 |
| N02 | Chuyển trạng thái ngừng bán ảnh hưởng đơn cũ | BLOCKED | Chưa có cột/luồng ngừng bán đã duyệt; không tạo giá trị trạng thái giả |
| N03 | Nhiều instance, restart giữa transaction và mất kết nối MySQL đúng lúc commit cho admin/COD/review | NOT TESTED | Không được coi thử restart/abort checkout cũ là đã thử mọi transaction mới |

B01–B05 bị chặn bởi **phạm vi không ghi dữ liệu**, không phải xác nhận môi trường
test đã mất hoặc MySQL không hoạt động. Không tự khởi động/test ghi để vượt giới hạn.

## 4. Lỗi hoặc rủi ro cần khắc phục

### Lỗi tài liệu đã xác minh

**G5-D01 — Low:** README.md vẫn ghi “chưa có quản trị hoặc đánh giá”, không khớp
router, EJS và test hiện tại. Phần hướng dẫn khởi động cần chỉ rõ worker tự hủy
72 giờ có thể ghi đơn/kho khi server bật. Đề xuất cập nhật trong công việc tài
liệu của giai đoạn 6 khi được giao; không sửa ở đây. Lỗi này không chứng minh
nghiệp vụ sai và tự nó không phải lý do chặn gate kỹ thuật.

### Rủi ro/giới hạn có căn cứ, chưa phải lỗi đã tái hiện

| Mã | Căn cứ | Hệ quả / hướng xử lý tối thiểu |
| --- | --- | --- |
| G5-R01 | Chưa có HTTP/admin/review + MySQL fixture trong runner; source revision không được gắn với artifact cũ | Khoảng trống bằng chứng B01–B05. Kiểm thử riêng trước khi ký gate đầy đủ, không mặc định cần sửa code |
| G5-R02 | Khóa product/variant trong admin và checkout/review có đường đi khác nhau | Có thể chờ/deadlock; cần race B04. Chỉ sửa khi xác minh lỗi hoặc hành vi không đáp ứng yêu cầu, không khẳng định stock đã sai |
| G5-R03 | Checkout token là Map trong tiến trình; session MemoryStore; worker chạy cùng server | Đã có test restart checkout cũ từ chối token và giữ lịch sử, nhưng không phải idempotency/audit/scheduler bền vững nhiều instance. Giữ giới hạn demo local nếu chưa duyệt mở rộng |
| G5-R04 | order_items FK SET NULL; reviews FK CASCADE; hoàn kho cần variant tồn tại | Xóa/nhập sai ngoài luồng có thể ngăn hoàn kho hoặc làm mất review. Không cung cấp xóa cứng product đã giao dịch; không tự phục dựng dữ liệu từ SKU/tên |
| G5-R05 | Schema chưa có paid_at/received_by; updated_at dùng chung | Không truy vết đầy đủ ai/bao giờ thu COD; không bắt buộc mở rộng MVP nếu chưa có yêu cầu audit |

Không ghi nhận lỗi giá sai, tồn kho âm, vượt quyền hoặc đánh giá trái điều kiện
đã tái hiện trong các test mới. Không được diễn giải thành bảo đảm tuyệt đối
không còn lỗ hổng. Chưa chạy brute force/stress/pentest hoặc fault injection mới.

## 5. Những việc tối thiểu trước giai đoạn 6

1. Chốt phạm vi gate là MVP demo local hiện tại; ẩn/ngừng bán, sửa/xóa review,
   refund, production/multi-instance tiếp tục ngoài phạm vi nếu chưa duyệt riêng.
2. Cho phép rõ một lượt **ghi fixture chỉ trên database test riêng** để làm B01–B05.
   Xác minh instance/datadir/cổng, tên DB, user/grants trước thao tác. Không sao
   chép toàn bộ DB demo, không sửa .env, không tự tạo admin/mật khẩu admin.
3. Dùng runner/test hiện có tối đa; phần HTTP admin/review và race kho còn thiếu
   cần kế hoạch test riêng được duyệt trước khi thêm script/hook. Mỗi test phải
   có trạng thái ban đầu, request/connection trace, SELECT sau commit/rollback
   và cleanup đúng IDs. Dừng nếu cleanup lỗi.
4. Gắn kết quả với snapshot/hash code được kiểm tra để so sánh sau này. Artifact
   cũ vẫn giữ lại; không bắt chạy lại chỉ để thay đổi con số hoặc che lỗi môi trường.
5. Nếu test mới phát hiện lỗi nghiệp vụ/phân quyền/kho, sửa trong nhiệm vụ được
   duyệt rồi regression. Hiện chưa có căn cứ yêu cầu thay schema hay sửa hàng loạt.

Visual/responsive, rà bảo mật rộng hơn và hoàn thiện README là công việc hợp lý
của giai đoạn 6; không bắt hoàn thành toàn bộ nội dung giai đoạn 6 trước khi được
bắt đầu. Khoảng trống chặn xác nhận gate ở đây là bằng chứng cho các chức năng
giai đoạn 5 và cạnh tranh kho, không phải yêu cầu thiết kế lại hoặc làm production.

Các lệnh tích hợp hiện có cần quyền cho lượt ghi riêng, **chưa chạy trong nhiệm vụ**:

```powershell
node scripts/check-purchase-mysql.cjs --run
node scripts/check-admin-products.cjs --run
node scripts/check-admin-orders.cjs --run
```

Không chạy chúng trên database demo/thật; không xem danh sách lệnh là chấp thuận
ngầm để ghi dữ liệu. Không chạy npm start chỉ để kiểm tra báo cáo.

## 6. Kết luận và lý do

**Chọn: Chưa đủ bằng chứng, cần kiểm thử thêm.**

Các chức năng đã có và test an toàn mới đều đạt. Đặc biệt đã có bằng chứng cũ
đáng kể cho InnoDB, HTTP/session khách hàng, tranh kho cuối cùng, rollback, replay
và lịch sử; không nên mô tả dự án như chỉ có test mock.

Tuy nhiên, chưa có bằng chứng hoàn chỉnh cho các route quản trị/review mới khi
gắn session/tài khoản và transaction MySQL trong cùng test, cũng như race admin
sửa stock với checkout. Hai lớp “HTTP/mock đạt” và “service/MySQL đạt” không tự
ghép thành “HTTP/MySQL đạt”. Với giới hạn không ghi dữ liệu, không thể lấp các
khoảng trống đó trong lần kiểm tra này.

Đây không phải kết luận đã có lỗi nghiêm trọng buộc sửa ngay. Sau khi B01–B05
được phép thực hiện và đạt trong phạm vi đã chốt, có thể xác nhận gate để bước
sang hoàn thiện giao diện/kiểm thử bảo mật/tài liệu của giai đoạn 6. Không tự
triển khai giai đoạn 6 hoặc sửa lỗi trong nhiệm vụ lập báo cáo.

## Phụ lục – Tên và chất lượng bằng chứng từng test PASS mới

Mọi dòng ở bảng sau đều chạy trong lượt Node Windows local ở mục 2.1.

- **U:** validator/service/repository/helper trực tiếp, hoặc assert cấu hình; không HTTP/session.
- **H:** HTTP Express + cookie/session/CSRF thật với MemoryStore và user/repository mock.
- **H0:** HTTP Express thật nhưng không kiểm tra một phiên đăng nhập xác thực; không coi là test quyền.
- **E:** render EJS bằng fixture, không HTTP/session.
- **J:** thực thi JavaScript chọn biến thể với môi trường DOM giả lập; không trình duyệt đầy đủ.
- **M:** database giả lập trong bộ nhớ; assert state/query không phải SELECT đối chiếu MySQL.
- **—:** bài kiểm tra không truy vấn database; không có bằng chứng MySQL.

Cột “Đối chiếu MySQL” ghi Không ở mọi dòng: lượt này **không** kết nối hoặc ghi
MySQL. Không đọc tên bài có chữ SQL/UNIQUE/transaction rồi suy ra có MySQL thật.

| TAP ID | Tên test đúng như kết quả chạy | File | Môi trường / lớp kiểm tra | DB | Đối chiếu MySQL | Kết quả |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Định dạng điện thoại, địa chỉ district rỗng và returnTo chỉ tới route hợp lệ | tests/account.test.js | Node local / U | — | Không | PASS |
| 2 | Đăng ký: validate từng trường, Argon2id, số duy nhất và không tự tạo admin | tests/account.test.js | Node local / H | M | Không | PASS |
| 3 | Đăng ký đồng thời trùng số: UNIQUE được xử lý thành 409, không mất tài khoản | tests/account.test.js | Node local / H | M | Không | PASS |
| 4 | Đăng nhập/đăng xuất: thông báo chung, cookie, regenerate, session cũ và header Catalog | tests/account.test.js | Node local / H | M | Không | PASS |
| 5 | Giới hạn đăng nhập thất bại trả 429 và Retry-After, không khóa vĩnh viễn trong DB | tests/account.test.js | Node local / H | M | Không | PASS |
| 6 | CSRF bắt buộc cho tất cả POST tài khoản và token không dùng được giữa hai client | tests/account.test.js | Node local / H | M | Không | PASS |
| 7 | Hồ sơ: sửa của mình, đổi số không OTP, UNIQUE và không thay role/mật khẩu/user_id | tests/account.test.js | Node local / H | M | Không | PASS |
| 8 | Địa chỉ: CRUD, district rỗng, chuyển mặc định, không truy cập địa chỉ người khác | tests/account.test.js | Node local / H | M | Không | PASS |
| 9 | Địa chỉ: khóa theo người dùng ngăn nhiều mặc định và rollback cập nhật dở dang | tests/account.test.js | Node local / U | M | Không | PASS |
| 10 | Đổi mật khẩu: validate, không nhận user_id khác và hủy mọi session cũ | tests/account.test.js | Node local / H | M | Không | PASS |
| 11 | Version HMAC từ chối session cũ cả khi bỏ lỡ lần destroy store; không nhận hash thuần | tests/account.test.js | Node local / U | M | Không | PASS |
| 12 | Cấu hình session demo không cho dùng MemoryStore trong production | tests/account.test.js | Node local / U | — | Không | PASS |
| 13 | Đơn admin: danh sách/tìm/lọc/phân trang, input an toàn và chỉ SELECT khi đọc | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 14 | Đơn admin: snapshot không lấy giá/địa chỉ hiện tại, thiếu dữ liệu không tạo phí giả; ID lỗi 404 | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 15 | Đơn admin: chuyển tuần tự, không bỏ/quay bước; không ghi payment/giá/khách hàng/kho khi giao | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 16 | Hủy admin: hai yêu cầu đồng thời hoàn kho một lần; từ chối đơn đã thu tiền/khác COD/đã xác nhận | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 17 | Hủy admin: gộp variant trùng, rollback khi hoàn kho hoặc status lỗi; chặn thiếu variant/overflow | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 18 | Tự hủy: chỉ pending quá 72h/cod/unpaid; cạnh tranh admin không hoàn hai lần; lỗi một đơn không bỏ toàn batch | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 19 | Worker tự hủy: chạy lúc start, không chồng tick, dừng chờ lượt đang chạy; log không lộ lỗi gốc | tests/admin-orders.test.js | Node local / U | M | Không | PASS |
| 20 | Đơn admin HTTP: quyền/CSRF, snapshot/EJS, POST trạng thái và hủy, không thay dữ liệu bằng GET | tests/admin-orders.test.js | Node local / H | M | Không | PASS |
| 21 | COD: xác nhận riêng sau giao, chỉ cập nhật payment_status; request lặp không ghi lần hai | tests/admin-payments.test.js | Node local / U | M | Không | PASS |
| 22 | COD: từ chối sai ID, chưa xác nhận, chưa giao, đã hủy, bank, refund và trạng thái không biết | tests/admin-payments.test.js | Node local / U | M | Không | PASS |
| 23 | COD: hai yêu cầu cùng xác nhận chỉ ghi một lần (mutex giả lập, không phải InnoDB) | tests/admin-payments.test.js | Node local / U | M | Không | PASS |
| 24 | COD: lỗi ghi/affectedRows=0 và lỗi trước commit rollback; lock timeout trả thông báo an toàn | tests/admin-payments.test.js | Node local / U | M | Không | PASS |
| 25 | COD HTTP/EJS: admin/CSRF, GET không ghi, nút chỉ cho đơn đủ điều kiện, không lộ lỗi, gửi lại an toàn | tests/admin-payments.test.js | Node local / H | M | Không | PASS |
| 26 | Sản phẩm admin: validation tên/danh mục/giá/stock/SKU, không nhận field quyền hoặc ID từ body | tests/admin-products.test.js | Node local / U | — | Không | PASS |
| 27 | Sản phẩm admin: chọn đúng giá trị option; ảnh MIME/signature/size, không nhận SVG hoặc file giả | tests/admin-products.test.js | Node local / U | — | Không | PASS |
| 28 | Sản phẩm admin: tạo product+default variant atomic, SKU trùng rollback; sửa giữ ảnh cũ và không đụng order_items | tests/admin-products.test.js | Node local / U | M | Không | PASS |
| 29 | Biến thể admin: đúng product/option, SKU trùng, stale stock, rollback link và bảo toàn dữ liệu | tests/admin-products.test.js | Node local / U | M | Không | PASS |
| 30 | Danh sách admin: query an toàn, limit/page và SQL parameterized, không đọc BLOB | tests/admin-products.test.js | Node local / U | M | Không | PASS |
| 31 | Sản phẩm admin HTTP: EJS, tạo multipart BLOB, lỗi gần field, thêm/sửa biến thể và tồn kho cũ | tests/admin-products.test.js | Node local / H | M | Không | PASS |
| 32 | Sản phẩm admin HTTP: quyền/CSRF, file giả hoặc quá lớn, malformed/duplicate multipart, không ghi ngoài ý muốn | tests/admin-products.test.js | Node local / H | M | Không | PASS |
| 33 | Admin: khách chưa đăng nhập, cookie sai và returnTo chỉ cho URL nội bộ đã duyệt | tests/admin.test.js | Node local / H | M | Không | PASS |
| 34 | Admin: user bị chặn cả GET/POST/PUT/PATCH/DELETE, không nâng quyền từ request | tests/admin.test.js | Node local / H | M | Không | PASS |
| 35 | Admin: role admin từ repository render nền EJS, CSS/font và 404 trong khu vực quản trị | tests/admin.test.js | Node local / H | M | Không | PASS |
| 36 | Admin: CSRF bắt buộc, logout hủy session và cookie cũ không vào được | tests/admin.test.js | Node local / H | M | Không | PASS |
| 37 | Admin: đọc lại role mỗi request, mất quyền/đổi mật khẩu/xóa fixture thì session cũ bị chặn | tests/admin.test.js | Node local / H | M | Không | PASS |
| 38 | Admin: guard mặc định từ chối thiếu user hoặc role không chính xác | tests/admin.test.js | Node local / U | — | Không | PASS |
| 39 | Giỏ: gộp cùng biến thể, tách biến thể khác; bỏ qua giá/user_id trình duyệt | tests/cart.test.js | Node local / U | M | Không | PASS |
| 40 | Giỏ: kiểm tra số lượng, ID, giá dương, biến thể hợp lệ và tồn kho ở backend | tests/cart.test.js | Node local / U | M | Không | PASS |
| 41 | Giỏ: tăng/giảm, xóa dòng/xóa giỏ và kiểm tra quyền sở hữu | tests/cart.test.js | Node local / U | M | Không | PASS |
| 42 | Giỏ: luôn đọc giá/kho mới, thông báo lỗi nhưng không tự xóa dòng | tests/cart.test.js | Node local / U | M | Không | PASS |
| 43 | Giỏ: mô phỏng thêm đồng thời không mất cập nhật; rollback/release khi lỗi | tests/cart.test.js | Node local / U | M | Không | PASS |
| 44 | Giỏ: SQL giới hạn theo user, không tải BLOB, không ghi stock/đơn; tiền không sai số | tests/cart.test.js | Node local / U | M | Không | PASS |
| 45 | Giỏ HTTP/EJS: đăng nhập, CSRF, CRUD, giả mạo ID/giá, trạng thái trống và CSS | tests/cart.test.js | Node local / H | M | Không | PASS |
| 46 | Chuẩn hóa query: ID, giá, trang, limit, ký tự đặc biệt và allowlist sort | tests/catalog.test.js | Node local / U | — | Không | PASS |
| 47 | HTTP giả lập: trang chủ, danh sách, tìm kiếm, lọc, phân trang và escape HTML | tests/catalog.test.js | Node local / H0 | M | Không | PASS |
| 48 | HTTP giả lập: chi tiết chọn đúng giá, tồn kho, thuộc tính và SKU của biến thể | tests/catalog.test.js | Node local / H0 | M | Không | PASS |
| 49 | HTTP giả lập: ảnh BLOB, cache, fallback, MIME không an toàn và ảnh sai ID | tests/catalog.test.js | Node local / H0 | M | Không | PASS |
| 50 | HTTP giả lập: dữ liệu rỗng và lỗi tải không lộ SQL | tests/catalog.test.js | Node local / H0 | M | Không | PASS |
| 51 | JavaScript chọn biến thể gửi lại form để server đọc giá, chạy được khi không có select | tests/catalog.test.js | Node local / J | — | Không | PASS |
| 52 | Repository chỉ SELECT: escape LIKE, không SELECT BLOB trong danh sách và sắp xếp từ allowlist | tests/catalog.test.js | Node local / U | M | Không | PASS |
| 53 | Checkout: phí đúng ngưỡng, tiền chính xác và giới hạn DECIMAL | tests/checkout.test.js | Node local / U | — | Không | PASS |
| 54 | Checkout: thành công atomic, snapshot, COD pending/unpaid; bỏ qua giá/user frontend | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 55 | Checkout: từ chối giỏ/giá/kho/địa chỉ thay đổi và xác nhận lại giá mới | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 56 | Checkout: địa chỉ người khác, thiếu địa chỉ, ID sai và không xác nhận | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 57 | Checkout: rollback khi trừ kho, tạo đơn, chi tiết, xóa giỏ hoặc commit lỗi | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 58 | Checkout: gửi trùng token/khác token cùng giỏ và tranh mua kho thấp (giả lập) | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 59 | Checkout: token hết hạn và thứ tự khóa/SQL có điều kiện | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 60 | Checkout: giữ kết quả khi commit xong nhưng response bị mất; không tự gửi lại câu ghi | tests/checkout.test.js | Node local / U | M | Không | PASS |
| 61 | Checkout HTTP/EJS: đăng nhập, CSRF, checkout, thành công, lặp và không lộ đơn khác | tests/checkout.test.js | Node local / H | M | Không | PASS |
| 62.1 | COD chưa thu tiền | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.2 | Chuyển khoản đã thanh toán | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.3 | COD đã thanh toán | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.4 | Đơn hủy, chưa thanh toán | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.5 | Đơn hủy, trạng thái hoàn tiền đã lưu | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.6 | Giá trị lạ không được suy ra đã thanh toán | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.7 | Không tra nhầm thuộc tính prototype | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62.8 | Thiếu giá trị | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 62 | Xác nhận EJS: hiển thị đúng dữ liệu thanh toán/trạng thái bằng fixture, không dùng MySQL | tests/checkout.test.js | Node local / E | — | Không | PASS |
| 63 | Express render EJS và các partial, phục vụ CSS, trả 404 | tests/foundation.test.js | Node local / H0 | — | Không | PASS |
| 64 | Middleware lỗi không lộ message/stack trong production | tests/foundation.test.js | Node local / H0 | — | Không | PASS |
| 65 | Thông báo MySQL chỉ nêu nguyên nhân an toàn | tests/foundation.test.js | Node local / U | — | Không | PASS |
| 66 | Parser HTTP: giữ 413, 400, request hợp lệ và lỗi server 500 (không dùng DB) | tests/foundation.test.js | Node local / H0 | — | Không | PASS |
| 67 | Middleware giữ nguyên lỗi công khai 400 và lỗi nghiệp vụ 401/403/404 | tests/foundation.test.js | Node local / U | — | Không | PASS |
| 68 | Đơn hàng: lịch sử đúng chủ sở hữu, thứ tự và phân trang thật/giá trị sai | tests/orders.test.js | Node local / U | M | Không | PASS |
| 69 | Đơn hàng: snapshot độc lập catalog/địa chỉ đã xóa; phí lịch sử không tính lại | tests/orders.test.js | Node local / U | M | Không | PASS |
| 70 | Đơn hàng: ID sai/không tồn tại/người khác đều 404, không đọc items trái quyền | tests/orders.test.js | Node local / U | M | Không | PASS |
| 71 | Đơn hàng: dữ liệu thiếu/không khớp không tạo phí giả; trạng thái theo dữ liệu | tests/orders.test.js | Node local / U | M | Không | PASS |
| 72 | Đơn hàng: repository chỉ SELECT có tham số, offset không nhận SQL tùy ý | tests/orders.test.js | Node local / U | M | Không | PASS |
| 73 | Đơn hàng HTTP/EJS: session, quyền, phân trang, snapshot, rỗng, lỗi an toàn và CSS | tests/orders.test.js | Node local / H | M | Không | PASS |
| 74 | Luồng mua HTTP: giỏ → xác nhận lại giá → 12 request lặp → lịch sử snapshot | tests/purchase-flow.test.js | Node local / H | M | Không | PASS |
| 75 | Luồng mua HTTP: hai khách đồng thời tranh kho 1 (DB giả lập, không chứng minh InnoDB) | tests/purchase-flow.test.js | Node local / H | M | Không | PASS |
| 76 | Rollback sau khi order_items thứ nhất đã ghi và dòng thứ hai thất bại (giả lập) | tests/purchase-flow.test.js | Node local / U | M | Không | PASS |
| 77 | Đánh giá: sản phẩm/danh tính suy ra từ đơn đã giao, không tin body; UNIQUE mỗi sản phẩm qua nhiều đơn | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 78 | Đánh giá: chặn chưa mua, chủ đơn khác, dòng không thuộc đơn, trạng thái chưa giao, sản phẩm đã mất | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 79 | Đánh giá: validation điểm 1–5 nguyên, chuỗi/độ dài nội dung và ID bất thường | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 80 | Đánh giá: kiểm tra lại trạng thái khi POST, rollback lỗi insert/commit; duplicate DB thành 409 | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 81 | Đánh giá: hai request/các đơn khác nhau cho cùng sản phẩm chỉ ghi một (mock, không chứng minh InnoDB) | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 82 | Đánh giá công khai: rỗng/phân trang/thứ tự, thiếu sản phẩm và chỉ SELECT, không lấy thông tin khách | tests/reviews.test.js | Node local / U | M | Không | PASS |
| 83 | Đánh giá HTTP/EJS: đăng nhập/CSRF, lỗi gần trường, chống XSS, không tin ID/role, không có sửa/xóa | tests/reviews.test.js | Node local / H | M | Không | PASS |

83 dòng cấp ngoài và 8 subtest được liệt kê riêng; dòng 62 là test cha của 62.1–62.8. Không cộng lại thành 99 hoặc coi 91 là số tiêu chí nghiệp vụ độc lập.

## Phụ lục – Chi tiết từng nhóm MySQL PASS lịch sử

Bảng này truy xuất từ các artifact mục 2.3 và đối chiếu runner. **Không nhóm nào được chạy lại trong lượt gate này.** HP/HO không đi qua xác thực admin/session thật; không nâng thành HTTP/MySQL admin. Các bài gây lỗi trước/sau commit dùng adapter test bao quanh transaction MySQL thật, không có nghĩa đã thử mọi lỗi mạng tự nhiên. Môi trường là instance MySQL test riêng theo guard của runner; không phải database demo.

| ID | Tên nhóm đúng trong artifact | Runner | Môi trường / HTTP-session hay service | Đối chiếu database | Kết quả đã lưu |
| --- | --- | --- | --- | --- | --- |
| H4-1 | isolation-and-InnoDB | scripts/check-purchase-mysql.cjs | MySQL test thật / Metadata, không HTTP/session | Metadata | PASS lịch sử |
| H4-2 | cart-CRUD-and-owner | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-3 | cart-concurrent-add-unique | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-4 | shipping-price-and-snapshot | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-5 | price-change-foreign-address-and-empty | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-6 | real-rollback-stock-second | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-7 | real-rollback-order | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-8 | real-rollback-item-second | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-9 | real-rollback-clear | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-10 | real-rollback-before-commit | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-11 | real-InnoDB-last-stock-race-5-rounds | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-12 | duplicate-tokens-same-cart | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-13 | real-HTTP-account-catalog-and-purchase | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-14 | real-HTTP-profile-address-password | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-15 | HTTP-COD-commit-SQL-details-and-cart | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-16 | HTTP-two-customers-last-stock-overlapping-InnoDB-5-rounds | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-17 | HTTP-replay-after-success-and-12-parallel-same-token | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-18 | HTTP-client-abort-after-real-commit-and-retry | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-19 | real-commit-adapter-response-error-then-retry-refused | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-20 | actual-Express-child-restart-old-token-and-history | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-21 | HTTP-frontend-total-low-high-ignored | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-22 | price-change-before-preview-current-database-price | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-23 | HTTP-price-change-after-preview-reconfirm | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-24 | zero-price-refused-negative-price-CHECK | scripts/check-purchase-mysql.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-25 | HTTP-quantity-invalid-boundary-and-empty-cart | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-26 | HTTP-unknown-invalid-variant-spoofed-product | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-27 | HTTP-owner-address-cart-order-and-spoofed-user | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| H4-28 | history-snapshots-after-edit-and-FK-SET-NULL | scripts/check-purchase-mysql.cjs | MySQL test thật / HTTP/session thật + service | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-1 | create-product-default-variant-and-BLOB | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-2 | unique-SKU-rolls-back-new-product | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-3 | options-ownership-links-and-wrong-parent | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-4 | checkout-stock-change-rejects-stale-admin-form | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-5 | edit-traded-product-price-stock-keeps-history-and-image | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-6 | price-stock-invalid-no-writes | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HP-7 | real-search-escaping-and-pagination | scripts/check-admin-products.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-1 | sequential-status-and-historical-detail | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-2 | two-admin-cancellations-real-connections-restore-once | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-3 | admin-cancel-vs-expiry-restore-once | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-4 | 72-hour-boundary-and-payment-status-exclusions | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-5 | real-rollback-second-restore | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-6 | real-rollback-status | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-7 | missing-variant-and-stock-overflow-remain-pending | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-8 | confirm-vs-cancel-real-row-lock | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-9 | actual-worker-rescan-cancels-newly-expired-fixture | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-10 | cod-receipt-after-delivery-and-repeated-concurrent-requests | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-11 | cod-receipt-rejects-ineligible-orders-without-changing-data | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-12 | cod-receipt-real-rollback-before-commit | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-13 | reviews-real-insert-derived-product-and-user-without-changing-order-stock | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-14 | reviews-real-ownership-status-item-and-deleted-product-validation | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-15 | reviews-real-two-connections-different-orders-same-user-product | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |
| HO-16 | reviews-real-insert-rollback-before-commit | scripts/check-admin-orders.cjs | MySQL test thật / Service/repository; không HTTP/session | Có, SELECT/snapshot/digest | PASS lịch sử |



