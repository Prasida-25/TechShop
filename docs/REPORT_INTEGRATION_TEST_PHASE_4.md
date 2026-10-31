# Báo cáo kiểm thử tích hợp Giai đoạn 4 – TechShop

Ngày: 23/10/2026 (Asia/Bangkok). Thương hiệu giao diện: TechZone.

**Kết luận 1: Có thể nghiệm thu Giai đoạn 4 trong phạm vi demo local một tiến trình và các tình huống đã kiểm thử.**

Không phải chứng nhận production hoặc idempotency bền vững. Phần F ghi rõ hạn chế kết quả commit chưa xác định và bộ nhớ; không sửa nghiệp vụ trong nhiệm vụ này.

## A. Môi trường và bằng chứng

### A.1. Xác minh trước mọi thao tác ghi

Lần kiểm tra ban đầu gặp ECONNREFUSED nên đã dừng. Sau khi người dùng xác nhận “làm tất cả những gì bạn cần”, đã khởi động lại **instance test hiện có**, không bootstrap/tạo database mới, không chạy dump.

- Database test: **techshop_test**, MySQL Community **8.0.46**.
- Cả 12 bảng là **InnoDB**, transaction isolation **REPEATABLE-READ**.
- Đã đối chiếu DATABASE(), datadir, port: tên database, data directory và cổng test khác nguồn; runtime khớp instance test. Không công bố endpoint, tên user hoặc secret.
- Guard openTestPool xác minh tài khoản test khác tài khoản nguồn; SHOW GRANTS chỉ cho USAGE và SELECT/INSERT/UPDATE/DELETE trên techshop_test. Không có quyền DDL hoặc quyền ghi database nguồn.
- Đối chiếu SHOW CREATE TABLE: 12/12 cấu trúc khớp nguồn trước/sau. Chuẩn hóa cách hiển thị CHARACTER SET và bỏ bộ đếm AUTO_INCREMENT khi so sánh; không thực hiện ALTER để khôi phục bộ đếm sau INSERT.
- Kết nối admin test chỉ dùng SELECT đếm information_schema.innodb_trx sau khi xác minh lại instance. Không dùng admin để tạo fixture hoặc sửa schema. Script stop chỉ SHUTDOWN instance test đã xác minh.
- Express nhận các repository dùng pool test; không thay .env, không đổi cấu hình npm start. HTTP chạy loopback ở cổng tạm.

### A.2. Fixture và cách bảo vệ dữ liệu

Mỗi fixture gồm hai user giả, hai địa chỉ, một category, một product và hai variant; giá ban đầu 100000.01/200000.00, stock 5 mỗi variant. Các case chủ động đổi **chỉ fixture mới** để tạo kho 1, kho 120, giá 0 hoặc giá mới. Trước/sau mỗi case đều SELECT giỏ, tồn kho, order, order_items và ghi ID.

Lần chạy cuối dùng **39 fixture**, hoàn toàn nhân tạo, không sao chép khách hàng hoặc sản phẩm thật. User test có mật khẩu băm Argon2id. Cleanup dùng ID đã ghi và quan hệ tới chính user mới, không xóa theo tiền tố TEST hay xóa toàn bảng. Sau từng case, hash nội dung của toàn bộ 12 bảng test phải khớp trạng thái trước lần chạy. Các fixture cũ được giữ nguyên.

### A.3. Công cụ, file và lệnh

Đã đọc AGENTS.md, package.json, database/techshop.sql; cấu hình database/session/app; routes, controllers, services, repositories cart/checkout/orders; các script test instance/config/runner; tài liệu nghiệm thu và báo cáo trước.

Lệnh đã chạy:

- node scripts/test-mysql-instance.cjs --start: khôi phục instance hiện có.
- Node qua stdin: preflight, kiểm tra metadata/grants/schema và hash trước/sau; không tạo script tạm trong mã nguồn.
- node --check scripts/check-purchase-mysql.cjs: đạt.
- npm run test:mysql: lần cuối **28/28 nhóm PASS**, exit code 0.
- npm test: có một lần **56/58**, hai lỗi “Memory allocation error”; sau khi dừng instance test, chạy lại cùng lệnh **58/58**, exit code 0. Không sửa source để làm test qua.
- node scripts/test-mysql-instance.cjs --stop: đã dừng riêng test instance sau kiểm tra; giữ datadir và dữ liệu test cũ.

Chỉ sửa **scripts/check-purchase-mysql.cjs** và cập nhật **docs/REPORT_INTEGRATION_TEST_PHASE_4.md**. Runner bổ sung manifest, cleanup theo ID, dừng khi lỗi, snapshot SQL, ca HTTP/concurrency/restart và fault injection adapter test. Không thêm dependency, không sửa src/public/frontend-static/database/tests, package hoặc env.

### A.4. Bằng chứng máy đọc được

Các file local dưới .test-runtime/ nằm ngoài Git, không chứa dữ liệu nguồn hoặc credential trong báo cáo:

- integration-preflight.json: phiên bản, engine, cách ly, hash schema/nội dung nguồn.
- integration-results.json: lần chạy cuối; results[i].fixtures có ID, initial/final, cleanedOrderIds/AddressIds/CartItemIds; observations có response/trace khi áp dụng.
- integration-2026-10-22T17-45-51-225Z-be74d1e9.json: bản lưu riêng lần cuối.
- integration-postflight.json: xác nhận dữ liệu nguồn, schema, file bảo vệ và cleanup.
- integration-<runId>.json: giữ cả các lần xây dựng/hiệu chỉnh runner, không xóa bằng chứng lỗi test harness.

Lần cuối: **2026-10-22T17-45-51-225Z-be74d1e9**; UTC **2026-10-22T17:45:51.226Z → 2026-10-22T17:45:56.838Z**. Thời gian UTC trong evidence tương ứng ngày 23/10 tại Việt Nam/Thái Lan.

## B. Test case chi tiết

Tiền điều kiện chung: guard và engine đạt; fixture mới ghi nhận initial; HTTP case đăng nhập bằng session độc lập và lấy CSRF mới. Mỗi PASS dưới đây là đã chạy, sau đó đối chiếu SELECT và cleanup. Các nhóm service được ghi rõ; không gộp thành HTTP. Cột bằng chứng trỏ tới integration-results.json.

| ID | Mục tiêu | Tiền điều kiện bổ sung / các bước | Mong đợi | Thực tế | Trạng thái | Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- |
| IT4-01 | Cách ly, InnoDB, nhiều connection | Guard phải đạt trước DML; đọc engines, lấy hai connection IDs | 12 bảng InnoDB, hai connection khác nhau | Đạt; môi trường test riêng được xác minh | PASS | results[0] · isolation-and-InnoDB; cleanup PASS |
| IT4-02 | CRUD giỏ và quyền sở hữu | Fixture hai user; thêm cùng/khác variant, tăng/giảm/xóa/clear, thử xóa giỏ bên kia | Gộp đúng, không vượt kho, chặn trái chủ | Hai dòng/tổng quantity 3; vượt kho bị chặn; xóa trái chủ 404; clear rỗng | PASS | results[1] · cart-CRUD-and-owner; cleanup PASS |
| IT4-03 | Thêm giỏ đồng thời | Gửi 5 lần add cùng variant qua service và pool thật | Một dòng quantity 5 | Một dòng quantity 5 | PASS | results[2] · cart-concurrent-add-unique; cleanup PASS |
| IT4-04 | Phí và snapshot sau sửa fixture | Đặt ở 299999.99 và 300000.00; sửa tên/giá/địa chỉ; đọc lịch sử | Tổng 329999.99 và 300000.00, snapshot giữ nguyên | Hai ngưỡng đúng; giá/tên/địa chỉ lịch sử không thay đổi | PASS | results[3] · shipping-price-and-snapshot; cleanup PASS |
| IT4-05 | Giỏ rỗng, giá đổi, địa chỉ ngoại | Preview rỗng; chọn địa chỉ user B; đổi giá sau preview; duyệt lại | Từ chối không ghi; xác nhận lại dùng giá mới | Giỏ rỗng/địa chỉ ngoại bị chặn; giá cũ 409, preview mới tổng 180000.00 | PASS | results[4] · price-change-foreign-address-and-empty; cleanup PASS |
| IT4-06 | Rollback trừ kho thứ hai | Hai dòng giỏ; adapter trả affectedRows=0 ở trừ kho thứ hai | Không còn order/items, kho/giỏ bằng trước | SELECT sau rollback bằng trước; đơn/items = 0 | PASS | results[5] · real-rollback-stock-second; cleanup PASS |
| IT4-07 | Rollback tạo order | Sau cập nhật kho, adapter đặt receiver_name NULL để MySQL từ chối | Rollback toàn bộ | MySQL ER_BAD_NULL_ERROR; kho/giỏ bằng trước, không order/items | PASS | results[6] · real-rollback-order; cleanup PASS |
| IT4-08 | Rollback item thứ hai | Sau order và item thứ nhất, adapter đặt quantity item thứ hai = 0 | Rollback cả order/item trước và kho | MySQL ER_CHECK_CONSTRAINT_VIOLATED; không order/items dở dang | PASS | results[7] · real-rollback-item-second; cleanup PASS |
| IT4-09 | Rollback trước xóa giỏ | Adapter ném lỗi tại clear sau khi ghi items | Rollback toàn bộ | SELECT kho/giỏ/đơn/items bằng trước | PASS | results[8] · real-rollback-clear; cleanup PASS |
| IT4-10 | Rollback ngay trước commit | Adapter ném lỗi tại commit wrapper, chưa gửi COMMIT thật | Khôi phục cả giỏ đã xóa và kho/đơn/items | SELECT sau lỗi bằng trước; không có đơn/items | PASS | results[9] · real-rollback-before-commit; cleanup PASS |
| IT4-11 | Hai khách tranh kho 1 qua service | 5 vòng, user/giỏ độc lập; Promise.allSettled gọi backend trên MySQL thật | Một thành công, một 409, kho 0, giỏ bên thua còn | 5/5 vòng đạt; đây là tích hợp service, không phải HTTP | PASS | results[10] · real-InnoDB-last-stock-race-5-rounds; cleanup PASS |
| IT4-12 | Hai token cùng một giỏ | Hai preview, gọi place gần đồng thời | Một đơn, không mua lặp giỏ đã xử lý | Một fulfilled, một rejected; SELECT đúng một đơn | PASS | results[11] · duplicate-tokens-same-cart; cleanup PASS |
| IT4-13 | HTTP session/CSRF/catalog/đặt hàng | Khách chưa đăng nhập; login fixture; POST không CSRF; 12 checkout cùng token; xem đơn chéo | Chuyển login, CSRF 403, một đơn, đơn người khác 404 | Đạt; SQL xác nhận kho còn 4 và một đơn | PASS | results[12] · real-HTTP-account-catalog-and-purchase; cleanup PASS |
| IT4-14 | Regression tài khoản trên test | Login user fixture; sửa hồ sơ, thêm địa chỉ, đổi mật khẩu | Không đổi role; district rỗng hợp lệ; session cũ không vào account | Role user, district rỗng; đổi mật khẩu buộc đăng nhập lại; không thêm tài khoản thật | PASS | results[13] · real-HTTP-profile-address-password; cleanup PASS |
| IT4-15 | HTTP COD và đối chiếu đầy đủ SQL | Login → thêm quantity 2 với giá/user giả → checkout → SELECT order/items/stock/cart và địa chỉ | Đúng chủ, COD pending/unpaid; tổng 230000.02; stock 5→3; cart rỗng | Đạt; unit_price 100000.01, quantity 2, snapshot địa chỉ Đường TEST, district rỗng | PASS | results[14] · HTTP-COD-commit-SQL-details-and-cart; cleanup PASS |
| IT4-16 | Hai khách HTTP tranh kho 1 | 5 vòng, hai session; chặn đồng bộ trước begin, hai connection khác nhau; gửi hai POST đồng thời | Mỗi vòng chỉ một 303, một 409, bán 1, kho 0 | 5/5 vòng đúng; hai connection MySQL thực, không mô phỏng DB | PASS | results[15] · HTTP-two-customers-last-stock-overlapping-InnoDB-5-rounds; cleanup PASS |
| IT4-17 | Gửi lại và 12 POST cùng token | 12 POST gần đồng thời, sau đó gửi lại sau thành công; SELECT | Một đơn, kho trừ một lần, retry cùng order_id | 303/409 khi đang xử lý; retry 303 về đơn cũ, DB không đổi thêm | PASS | results[16] · HTTP-replay-after-success-and-12-parallel-same-token; cleanup PASS |
| IT4-18 | Client mất response sau commit | Adapter đợi sau COMMIT thật; AbortController ngắt request trước response; tiếp tục server rồi retry | Đơn đã lưu một lần; retry tìm lại đơn trong cùng tiến trình | Client AbortError, một order, retry 303; snapshot SQL không thay đổi | PASS | results[17] · HTTP-client-abort-after-real-commit-and-retry; cleanup PASS |
| IT4-19 | Commit thật nhưng adapter báo lỗi | COMMIT thật → adapter ném lỗi trước khi service nhận kết quả; POST lại; SELECT và GET lịch sử | Xác định kết quả thực, không tự ghi lặp | Đơn đã lưu/kho 4; HTTP đầu 500, retry 409, GET đơn 200. PASS về quan sát/chống ghi lặp; còn hạn chế UX M-01 | PASS | results[18] · real-commit-adapter-response-error-then-retry-refused; cleanup PASS |
| IT4-20 | Restart tiến trình Express thật | Child Node riêng tạo đơn; dừng child; mở child mới; login mới, gửi token cũ, xem đơn | Ghi nhận token mất; không đơn thứ hai; lịch sử còn | Token cũ 409; GET đơn 200; checkout giỏ rỗng 409, DB giữ nguyên | PASS | results[19] · actual-Express-child-restart-old-token-and-history; cleanup PASS |
| IT4-21 | Tổng tiền frontend thấp/cao | HTTP gửi total_amount/price 0.01 và 9999999999.99, shipping_fee 0 | Backend bỏ qua, dùng giá DB và phí đã duyệt | Cả hai đơn tổng 130000.01; unit_price 100000.01 | PASS | results[20] · HTTP-frontend-total-low-high-ignored; cleanup PASS |
| IT4-22 | Giá đổi sau thêm trước preview | Add rồi UPDATE giá duy nhất variant fixture lên 150000; preview và place | Dùng giá hiện tại, không lấy giá frontend/session | Preview tổng 180000.00; item lưu unit_price 150000.00; không kiểm tra mốc giá lúc add | PASS | results[21] · price-change-before-preview-current-database-price; cleanup PASS |
| IT4-23 | Giá đổi sau preview qua HTTP | Preview → UPDATE giá fixture → POST cũ → lấy preview mới → POST | Cũ 409 không ghi; mới đúng giá | Đúng; preview mới 180000, item giá 150000.00 | PASS | results[22] · HTTP-price-change-after-preview-reconfirm; cleanup PASS |
| IT4-24 | Giá 0/âm | Giỏ có fixture, UPDATE giá 0; thử preview/add; thử UPDATE -1 trên fixture | 0 không được bán; âm bị CHECK chặn nếu schema quy định | Preview 409, add 422; -1 bị ER_CHECK_CONSTRAINT_VIOLATED; không nới constraint | PASS | results[23] · zero-price-refused-negative-price-CHECK; cleanup PASS |
| IT4-25 | Quantity sai và biên 99 | POST 0,-1,1.5,100,6 khi stock 5, abc; rồi stock fixture 120, add 99, thêm 1 | Sai bị chặn; 99 hợp lệ nếu đủ kho, tổng 100 bị từ chối | Các input sai 422 và SQL không đổi; 99 đạt, thêm 1 bị 422; giỏ rỗng checkout 409 | PASS | results[24] · HTTP-quantity-invalid-boundary-and-empty-cart; cleanup PASS |
| IT4-26 | Variant sai / product_id giả | POST ID lạ; product_id không khớp với variant hợp lệ; thêm option fixture làm tổ hợp thiếu | Từ chối variant sai; không lấy product_id từ frontend | ID sai/variant thiếu option 422; order_items dùng đúng product/variant trong DB | PASS | results[25] · HTTP-unknown-invalid-variant-spoofed-product; cleanup PASS |
| IT4-27 | Quyền địa chỉ, giỏ, đơn, user_id | Hai session A/B; sửa/xóa item B, chọn địa chỉ B, gửi user_id B, xem đơn A bằng B | Không truy cập chéo, không đổi chủ từ form | Item B 404; địa chỉ B 409; đơn vẫn thuộc A; giỏ B nguyên; detail/success trái chủ 404 | PASS | results[26] · HTTP-owner-address-cart-order-and-spoofed-user; cleanup PASS |
| IT4-28 | Snapshot sau sửa và xóa fixture | Đặt; sửa tên/giá/địa chỉ; sau đó DELETE đúng fixture address/variant/product; SELECT và GET lịch sử | Snapshot giữ nguyên dù FK thành NULL | Detail trước/sau bằng nhau; address_id/product_id/variant_id NULL; HTTP vẫn 200, tên/địa chỉ cũ còn | PASS | results[27] · history-snapshots-after-edit-and-FK-SET-NULL; cleanup PASS |
| IT4-29 | Lỗi sau items trước trừ kho | Cần điểm lỗi tương ứng trong luồng thật | Có thể chứng minh rollback tại điểm đó | Luồng hiện trừ kho trước order/items, không có điểm này; không sửa production để đổi thứ tự | BLOCKED | checkout-repository.js; các điểm tương đương IT4-06/08/09/10 đã chạy |
| IT4-30 | Mất kết nối MySQL thực quanh COMMIT | Cần cắt TCP/kill connection có kiểm soát, kết luận thời điểm commit | Tra cứu đúng kết quả | Chưa cắt kết nối MySQL; IT4-19 dùng adapter ném lỗi sau commit thật, không thay thế hoàn toàn bài này | NOT TESTED | Kế hoạch bổ sung |
| IT4-31 | Chạy đồng thời nhiều Express instance | Cần hai server với token phát sinh/được gửi chéo | Xác định giới hạn token không chia sẻ | Chưa chạy ma trận nhiều instance; restart IT4-20 không tương đương multi-instance | NOT TESTED | checkout-service.js Map; đọc code |
| IT4-32 | Deadlock nhiều products/variants đan xen | Cần lịch khóa nhiều biến thể và writer cạnh tranh | Rollback an toàn, không âm kho | Chưa tạo lịch deadlock; test tranh cùng variant cuối không bao phủ trường hợp này | NOT TESTED | Kế hoạch bổ sung |

**Tổng ma trận: 32 case/nhóm; 28 PASS, 0 FAIL, 1 BLOCKED, 3 NOT TESTED.** 28/28 là số nhóm runner đã thực thi, không có nghĩa mọi kịch bản đề xuất đều đã chạy. Regression 58 test được thống kê riêng, không cộng vào 28.

### B.1. Manifest fixture của lần cuối

Các ID dưới đây chỉ thuộc database test. Tất cả đã cleanup; dấu — là không có đơn còn lưu để cleanup. Order rollback có thể tiêu thụ số AUTO_INCREMENT nhưng không để lại hàng.

| Case | User IDs | Address IDs đã ghi/cleanup | Product ID | Variant IDs | Order IDs cleanup |
| --- | --- | --- | --- | --- | --- |
| IT4-02 | 339, 340 | 344, 345 | 169 | 337, 338 | — |
| IT4-03 | 341, 342 | 346, 347 | 170 | 339, 340 | — |
| IT4-04 | 343, 344 | 348, 349 | 171 | 341, 342 | 124 |
| IT4-04 | 345, 346 | 350, 351 | 172 | 343, 344 | 125 |
| IT4-05 | 347, 348 | 352, 353 | 173 | 345, 346 | 126 |
| IT4-06 | 349, 350 | 354, 355 | 174 | 347, 348 | — |
| IT4-07 | 351, 352 | 356, 357 | 175 | 349, 350 | — |
| IT4-08 | 353, 354 | 358, 359 | 176 | 351, 352 | — |
| IT4-09 | 355, 356 | 360, 361 | 177 | 353, 354 | — |
| IT4-10 | 357, 358 | 362, 363 | 178 | 355, 356 | — |
| IT4-11 | 359, 360 | 364, 365 | 179 | 357, 358 | 130 |
| IT4-11 | 361, 362 | 366, 367 | 180 | 359, 360 | 131 |
| IT4-11 | 363, 364 | 368, 369 | 181 | 361, 362 | 132 |
| IT4-11 | 365, 366 | 370, 371 | 182 | 363, 364 | 133 |
| IT4-11 | 367, 368 | 372, 373 | 183 | 365, 366 | 134 |
| IT4-12 | 369, 370 | 374, 375 | 184 | 367, 368 | 135 |
| IT4-13 | 371, 372 | 376, 377 | 185 | 369, 370 | 136 |
| IT4-14 | 373, 374 | 378, 379, 380 | 186 | 371, 372 | — |
| IT4-15 | 375, 376 | 381, 382 | 187 | 373, 374 | 137 |
| IT4-16 | 377, 378 | 383, 384 | 188 | 375, 376 | 138 |
| IT4-16 | 379, 380 | 385, 386 | 189 | 377, 378 | 139 |
| IT4-16 | 381, 382 | 387, 388 | 190 | 379, 380 | 140 |
| IT4-16 | 383, 384 | 389, 390 | 191 | 381, 382 | 141 |
| IT4-16 | 385, 386 | 391, 392 | 192 | 383, 384 | 142 |
| IT4-17 | 387, 388 | 393, 394 | 193 | 385, 386 | 143 |
| IT4-18 | 389, 390 | 395, 396 | 194 | 387, 388 | 144 |
| IT4-19 | 391, 392 | 397, 398 | 195 | 389, 390 | 145 |
| IT4-20 | 393, 394 | 399, 400 | 196 | 391, 392 | 146 |
| IT4-21 | 395, 396 | 401, 402 | 197 | 393, 394 | 147 |
| IT4-21 | 397, 398 | 403, 404 | 198 | 395, 396 | 148 |
| IT4-22 | 399, 400 | 405, 406 | 199 | 397, 398 | 149 |
| IT4-23 | 401, 402 | 407, 408 | 200 | 399, 400 | 150 |
| IT4-24 | 403, 404 | 409, 410 | 201 | 401, 402 | — |
| IT4-25 | 405, 406 | 411, 412 | 202 | 403, 404 | — |
| IT4-26 | 407, 408 | 413, 414 | 203 | 405, 406 | 151 |
| IT4-26 | 409, 410 | 415, 416 | 204 | 407, 408 | — |
| IT4-26 | 411, 412 | 417, 418 | 205 | 409, 410 | — |
| IT4-27 | 413, 414 | 419, 420 | 206 | 411, 412 | 152 |
| IT4-28 | 415, 416 | 421, 422 | 207 | 413, 414 | 153 |

## C. Transaction, commit và rollback

- IT4-15: POST checkout tạo một COD pending/unpaid, quantity 2, unit_price 100000.01, tổng 230000.02; tồn kho 5→3; giỏ user mua rỗng; snapshot địa chỉ đúng. Đối chiếu dữ liệu trong MySQL, không chỉ redirect.
- IT4-07: MySQL thật từ chối order do NOT NULL (ER_BAD_NULL_ERROR) sau khi kho đã được trừ trong transaction; SELECT sau rollback không có order/items, kho/giỏ như trước.
- IT4-08: MySQL thật từ chối item thứ hai do CHECK (ER_CHECK_CONSTRAINT_VIOLATED), rollback cả order và item thứ nhất lẫn kho.
- IT4-06/09/10: lỗi stock thứ hai, clear và trước commit được gây có kiểm soát tại adapter. Các câu ghi trước lỗi chạy trên InnoDB thật; SELECT xác nhận rollback nguyên trạng. Không tuyên bố cả ba lỗi là lỗi tự phát sinh từ MySQL.
- IT4-19: **commit đã thành công thì rollback gọi sau đó không thể xóa đơn đã commit**. Trace ghi begin → đọc/khóa → stock/order/item/clear → commit → rollback → release; đơn vẫn tồn tại đúng. Không lấy việc có gọi rollback làm bằng chứng giao dịch đã hoàn tác.
- Cuối lần chạy: **0 transaction InnoDB đang mở** trên instance test; đã mượn cả 10 connection của pool để ghi nhận ID, release và đóng pool. Child Express đều đóng; test instance đã dừng.

## D. Concurrency thực tế

IT4-11 có 5 vòng qua service trên nhiều kết nối thật. IT4-16 bổ sung **5 vòng qua HTTP**, hai khách, hai session, cùng variant stock=1. Barrier test chỉ đồng bộ trước begin để hai request bắt đầu transaction cùng lúc, không đặt hàng tuần tự và không mô phỏng engine.

| Vòng HTTP | Connection IDs | HTTP của hai khách | Order ID | Quantity đã bán | Stock còn | Dòng giỏ còn |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 16 / 12 | 409 / 303 | 138 | 1 | 0 | 1 |
| 2 | 12 / 16 | 409 / 303 | 139 | 1 | 0 | 1 |
| 3 | 16 / 12 | 303 / 409 | 140 | 1 | 0 | 1 |
| 4 | 16 / 12 | 303 / 409 | 141 | 1 | 0 | 1 |
| 5 | 12 / 16 | 303 / 409 | 142 | 1 | 0 | 1 |

Không có vòng HTTP nào bán vượt kho hoặc tạo đơn thành công thứ hai. Code dùng SELECT FOR UPDATE, khóa user/giỏ/variant và UPDATE stock với điều kiện stock >= quantity. Kết quả áp dụng cho lịch chạy/fixture này; không chứng minh mọi lịch deadlock đa sản phẩm đều an toàn về trải nghiệm.

## E. Chống đặt hàng trùng và mất phản hồi

- Nhiều token cùng giỏ: một lần thành công; lần còn lại bị chặn sau khi giỏ được xử lý.
- 12 POST cùng token: chỉ tạo một đơn; request đang pending có thể 409; sau done, gửi lại trả 303 về đúng order_id cũ, không trừ thêm kho.
- IT4-18 ngắt HTTP client **sau COMMIT thật và trước khi server trả response**. Client nhận AbortError; gửi lại cùng tiến trình nhận đơn cũ, SQL không đổi thêm.
- IT4-19 commit thật nhưng adapter báo lỗi: HTTP 500, retry token 409, **đơn test #145 vẫn đã lưu**, kho chỉ trừ một lần; GET lịch sử/detail 200. Đây là fault injection kết quả trả về adapter, chưa phải cắt mạng MySQL thật.
- IT4-20 đóng và khởi động lại **tiến trình Node/Express child thật**, không chỉ tạo service object mới. Đăng nhập lại rồi gửi token cũ nhận 409; đơn vẫn xem được; giỏ rỗng không tạo thêm đơn.
- Token đang ở Map trong tiến trình, không phải dữ liệu bền vững. Restart mất token/session trong bộ nhớ; chưa có khóa yêu cầu duy nhất để tra cứu kết quả qua nhiều instance. Không thêm bảng/cột trong nhiệm vụ này.

## F. Lỗi, hạn chế và lịch sử chạy

### Critical / High

Không tái hiện lỗi truy cập chéo, sai giá, âm kho hoặc transaction dở dang trong các case đã chạy. Không suy diễn rằng mọi lỗi Critical/High đã được loại trừ.

### Medium – M-01: commit đã lưu nhưng phản hồi lỗi chưa dẫn tới kết quả rõ ràng

- Điều kiện: IT4-19, adapter ném lỗi sau khi c.commit() thật đã resolve.
- Thực tế: đơn đã lưu nhưng trang nhận 500; gửi lại token 409. Khách có thể xem lịch sử để biết kết quả, nhưng chưa có tra cứu token bền vững. Không phát hiện đơn trùng hoặc trừ kho lần hai trong test này.
- Đây là bằng chứng hành vi qua **fault injection**, không tuyên bố một lỗi mạng thật đã xảy ra. PASS của IT4-19 nghĩa là test đã xác minh kết quả và không tự ghi lặp, không phải trải nghiệm lỗi đã hoàn thiện.
- Đề xuất riêng: thông báo “chưa xác định kết quả, kiểm tra lịch sử” cho tình huống phù hợp; nếu cần khôi phục kết quả tự động qua restart/multi-instance, thiết kế idempotency bền vững trong orders hoặc bảng riêng và xin duyệt schema. Chưa sửa.

### Medium – M-02: regression gặp lỗi cấp phát bộ nhớ ở một lần chạy

Một lần npm test chạy cùng thời điểm đọc/đối chiếu dữ liệu và khi instance test còn bật cho kết quả 56/58. Hai test orders HTTP và purchase-flow HTTP báo “Memory allocation error”. Nguyên nhân gốc chưa được chứng minh; không tự kết luận lỗi nghiệp vụ hay sửa Argon2/cấu hình production. Sau khi dừng riêng instance test và chạy lại, cùng lệnh đạt 58/58. Khi tái diễn nên đo bộ nhớ hoặc thử test-concurrency=1 trong môi trường kiểm thử; không tự đổi npm script trong nhiệm vụ này.

### Low

Không ghi nhận lỗi giao diện mới; nhiệm vụ chỉ chạy HTTP/EJS, chưa thực hiện QA trực quan desktop/mobile.

### Lỗi runner trong quá trình chuẩn bị – đã sửa, không phải lỗi production

Các lần thử đầu dừng ngay và cleanup thành công khi gặp: helper chưa lấy CSRF mới sau login; adapter trace thiếu import CART_SQL; snapshot giỏ thiếu cart_item_id khiến URL test thành undefined. Đã sửa trong runner và chạy lại toàn bộ. Barrier được đặt trước begin để không tạo vòng chờ nhân tạo giữa test và khóa MySQL. Bằng chứng các lần chạy trước được giữ theo runId; không đổi những FAIL harness đó thành PASS lịch sử. Lần cuối 28/28 là chạy mới sau khi sửa harness.

Một phép thăm dò đọc biến session in_transaction trả ER_UNKNOWN_SYSTEM_VARIABLE trên MySQL này. Không dùng truy vấn đó trong runner cuối; kiểm tra 0 active transaction qua information_schema.innodb_trx bằng admin test chỉ đọc. Không thay cấu hình MySQL để né lỗi.

### Giới hạn nghiệp vụ giữ nguyên

- Không có giá tham chiếu đáng tin cậy từ lúc add giỏ. Đã kiểm tra giá hiện tại trước preview và từ chối thay đổi sau preview; không tuyên bố có thông báo so sánh giá lúc add.
- Schema chưa có trạng thái ngừng bán; test variant thiếu option kiểm tra tính hợp lệ thực, không giả vờ đã có chức năng vô hiệu hóa/ngừng bán.
- Snapshot có giá, tên/variant/SKU và địa chỉ; phí lịch sử đang suy ra từ tổng đơn trừ tổng dòng theo MVP. Chưa thiết kế thuế/voucher/phí phức tạp.
- Trả hàng, hủy/auto-hủy, quản trị và đánh giá không được triển khai trong nhiệm vụ này.

## G. Kết luận, cleanup và cách chạy lại

**Có thể nghiệm thu trong phạm vi demo local một tiến trình đã kiểm thử**, với giới hạn M-01 được ghi rõ và chưa chứng nhận production/multi-instance. Không yêu cầu thay schema để công nhận những case đã đạt; nếu nâng yêu cầu idempotency bền vững phải duyệt riêng trước.

### G.1. Trạng thái sau kiểm thử

| Bảng test | Trước lần cuối | Sau cleanup | Đối chiếu nội dung |
| --- | --- | --- | --- |
| cart_items | 29 | 29 | Khớp hash toàn bộ nội dung |
| categories | 32 | 32 | Khớp hash toàn bộ nội dung |
| order_items | 20 | 20 | Khớp hash toàn bộ nội dung |
| orders | 20 | 20 | Khớp hash toàn bộ nội dung |
| product_option_values | 0 | 0 | Khớp hash toàn bộ nội dung |
| product_options | 0 | 0 | Khớp hash toàn bộ nội dung |
| product_variants | 64 | 64 | Khớp hash toàn bộ nội dung |
| products | 32 | 32 | Khớp hash toàn bộ nội dung |
| reviews | 0 | 0 | Khớp hash toàn bộ nội dung |
| user_addresses | 66 | 66 | Khớp hash toàn bộ nội dung |
| users | 66 | 66 | Khớp hash toàn bộ nội dung |
| variant_option_values | 0 | 0 | Khớp hash toàn bộ nội dung |

- Tất cả 28 nhóm cleanup PASS; toàn bộ nội dung cũ 12 bảng test khớp hash, không chỉ khớp số hàng.
- Hash dữ liệu 12 bảng nguồn trước/sau khớp; không ghi vào database demo. Hàng dữ liệu nguồn không được lưu vào evidence, chỉ lưu count/hash.
- Schema nguồn và test không đổi ngoài bộ đếm AUTO_INCREMENT tự tăng do fixture ở test; không DDL, không khôi phục counter bằng ALTER.
- **5975 file bảo vệ** (src/public/frontend-static/database/tests và env/package liên quan) không đổi hash.
- Không còn fixture của lần chạy trong test DB; số liệu lịch sử của các lần trước được giữ. Không có cleanup thất bại.
- Pool/Express child đóng, 0 active InnoDB transaction trước dừng; instance test dừng an toàn. MySQL website vẫn hoạt động.
- Log “[HTTP] Có lỗi khi xử lý yêu cầu.” xuất hiện có chủ đích trong case adapter báo lỗi sau commit. Không log SQL, mật khẩu hoặc cấu hình gốc.

### G.2. Chạy lại trên máy hiện tại

Giữ terminal khởi động instance test chạy:

~~~powershell
node scripts/test-mysql-instance.cjs --start
~~~

Ở terminal khác, chạy lần lượt:

~~~powershell
npm run test:mysql
node scripts/test-mysql-instance.cjs --stop
npm test
~~~

Không chạy setup-test-db.cjs hoặc nhập lại dump cho môi trường đã có. Runner tự xác minh guard và chỉ cleanup fixture mới; dừng khi có FAIL hoặc cleanup không khớp. Nếu dữ liệu test cũ được người khác sửa đồng thời, phép so hash sẽ dừng; không cleanup rộng để ép test qua. Giữ các evidence local để điều tra.

Các bước tiếp theo nếu muốn mở rộng bằng chứng: IT4-30 cắt kết nối MySQL quanh commit, IT4-31 nhiều instance, IT4-32 deadlock đa sản phẩm; không tự sửa lỗi nghiệp vụ hoặc chuyển Giai đoạn 5 trong nhiệm vụ này.
