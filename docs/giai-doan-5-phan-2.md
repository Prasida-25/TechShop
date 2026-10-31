# Giai đoạn 5 – Phần 2: Quản lý sản phẩm và biến thể

## Đã triển khai

- Danh sách sản phẩm từ MySQL, tìm tên/thương hiệu, phân trang 20 dòng/trang,
  sắp xếp ổn định theo created_at và product_id giảm dần. Không SELECT BLOB ở danh sách.
- Thêm sản phẩm cùng biến thể mặc định trong một transaction. Nếu SKU trùng hoặc
  tạo biến thể lỗi, không để lại sản phẩm dở dang. Biến thể mặc định có tên/SKU/giá/kho
  do admin nhập; form gợi ý tên Mặc định, không tự tạo dữ liệu trên database demo.
- Sửa tên, thương hiệu, danh mục có sẵn, mô tả và ảnh sản phẩm. Danh mục có thể để
  Chưa phân loại vì category_id nullable. Không thêm chức năng quản lý danh mục.
- Xem toàn bộ biến thể sản phẩm, thêm/sửa tên, SKU, giá, tồn kho và ảnh biến thể.
  Variant phải thuộc đúng product trên URL; không nhận product_id từ body để chuyển chủ.
- Nếu sản phẩm có cấu hình thuộc tính trong product_options/product_option_values,
  form yêu cầu chọn đúng một giá trị cho mỗi option. Backend kiểm tra lại các giá trị
  thuộc sản phẩm đó, từ chối thiếu/sai/field thuộc tính ngoài phạm vi. Cập nhật liên kết
  variant_option_values và variant trong một transaction.
- Giá lớn hơn 0, theo DECIMAL(12,2); tồn kho là số nguyên 0–2147483647. SKU tối đa
  50 ký tự và dựa vào UNIQUE thật để xử lý cả trường hợp ghi đồng thời. Trùng SKU trả 409.
- Sửa tồn kho yêu cầu checkbox xác nhận nếu số lượng thay đổi. Backend khóa dòng
  variant, so sánh stock hiện tại với expected_stock lúc mở form. Form cũ trả 409,
  cần tải lại; không dùng expected_stock làm tồn kho chính thức hoặc tự ghi đè sau checkout.
- PNG/JPEG/WebP tối đa 1 MB/ảnh, kiểm tra MIME và dấu hiệu định dạng đầu file; không
  nhận SVG hoặc MIME không khớp. Đây không phải bộ giải mã/tái mã hóa ảnh hoàn chỉnh.
  Ảnh lưu vào cột BLOB/MIME sẵn có, không ghi file upload xuống public hoặc dùng tên file
  làm đường dẫn. Không chọn ảnh mới giữ ảnh cũ; preview dùng endpoint ảnh Catalog hiện có.
- Giữ guard admin và CSRF cho mọi POST. EJS escape nội dung; không log SQL/secret.
  SQL lỗi không được đưa vào HTML. Deadlock/lock timeout phía thao tác admin được trả
  thông báo 409 yêu cầu tải lại, không tự retry câu ghi.

Không triển khai xóa sản phẩm/biến thể, ẩn/ngừng bán, quản lý option/value mới,
quản lý đơn/COD, hủy/hoàn kho hoặc đánh giá trong phần này. Sản phẩm hết hàng vẫn
hiển thị theo Catalog; tồn kho 0 không được dùng thay trạng thái ngừng bán.

## Schema và cấu trúc

Đã đọc database/techshop.sql và đối chiếu metadata MySQL cho categories, products,
product_variants, product_options, product_option_values, variant_option_values.
Schema hỗ trợ các thao tác đã nêu; không thêm/sửa bảng, cột, index, constraint.
Không sửa .env hoặc dependency. Không thay nghiệp vụ Catalog, Account, Checkout,
giá/phí/tồn kho đơn hàng hay snapshot lịch sử.

Routes → controller render/nhận form → service validate → repository SQL/transaction.
Validation dùng chung nằm trong utils. Không đặt SQL vào EJS.

Multipart được đọc bằng Request.formData() có sẵn trong Node hiện tại, không cài
thư viện. Middleware chỉ áp dụng POST multipart dưới /admin/products và chỉ parse
khi req.user đã được loadUser xác minh có role admin. Giới hạn toàn form 2 MB,
32 entries, một file image; từ chối field trùng. Parser chạy trước CSRF để token
trong multipart được middleware CSRF chung kiểm tra. Guard route vẫn chạy sau đó.
Không nới giới hạn urlencoded 16 KB của các chức năng khác.

## Routes

| Method | URL | Chức năng |
| --- | --- | --- |
| GET | /admin/products | Danh sách, q và page |
| GET | /admin/products/new | Form tạo sản phẩm + default variant |
| POST | /admin/products | Tạo product + variant mặc định |
| GET | /admin/products/:productId/edit | Form sản phẩm và danh sách biến thể |
| POST | /admin/products/:productId/update | Sửa sản phẩm |
| GET | /admin/products/:productId/variants/new | Form thêm biến thể |
| POST | /admin/products/:productId/variants | Thêm biến thể |
| GET | /admin/products/:productId/variants/:variantId/edit | Form sửa biến thể |
| POST | /admin/products/:productId/variants/:variantId/update | Sửa biến thể |

Tất cả đặt sau requireAuth/requireAdmin và trước fallback 404 quản trị. GET không
ghi dữ liệu. Không có DELETE hoặc route nâng quyền/tạo admin.

## File đã tạo

- src/utils/admin-product-validation.js
- src/middleware/admin-product-form.js
- src/repositories/admin-product-repository.js
- src/services/admin-product-service.js
- src/controllers/admin-product-controller.js
- src/views/admin/products/index.ejs
- src/views/admin/products/form.ejs
- src/views/admin/products/variant.ejs
- src/views/admin/products/fields.ejs
- src/views/admin/products/image.ejs
- tests/helpers/admin-product-database.cjs
- tests/admin-products.test.js
- scripts/check-admin-products.cjs
- docs/giai-doan-5-phan-2.md

## File đã sửa

- src/app.js: inject repository admin khi test; middleware multipart theo phạm vi.
- src/routes/admin.js: các route sản phẩm/biến thể.
- src/views/admin/partials/start.ejs: menu Sản phẩm hoạt động.
- src/views/admin/index.ejs: cập nhật phần đã triển khai, không menu giả.
- public/css/admin.css: form, table, thông báo validation, preview ảnh; chỉ phạm vi admin.
- tests/helpers/account-client.cjs: cho phép inject product repository giả lập.
- tests/admin.test.js: cập nhật kỳ vọng menu và route không tồn tại sau khi có module sản phẩm.

## Kết quả kiểm thử thực tế

| Phạm vi | Lệnh | Kết quả |
| --- | --- | --- |
| Test trực tiếp sản phẩm/biến thể | node --test tests/admin-products.test.js | 7/7 PASS |
| Toàn bộ regression và test mới | npm test | 71/71 PASS, gồm các test con có sẵn |
| SQL/service/transaction trên MySQL test | node scripts/check-admin-products.cjs --run | 7/7 PASS; cleanup và hash dữ liệu cũ PASS |

Test unit/HTTP dùng fixture riêng trong bộ nhớ, không ghi MySQL. Có các trường hợp:
tên/danh mục/SKU/giá/stock không hợp lệ; ảnh MIME/signature/size; option khác sản phẩm;
SKU trùng rollback; form kho cũ 409; thiếu xác nhận kho 422; sai parent/ID 404;
tìm kiếm tham số hóa; EJS escape; multipart tạo BLOB; lỗi gần field; quyền user và
CSRF; file giả/quá lớn/duplicate/malformed; body >2 MB trả 413; lỗi SQL giả không lộ chi tiết.

### Tích hợp MySQL thật, tách biệt với HTTP giả lập

Script dùng openTestPool hiện có: kiểm tra datadir/cổng, database techshop_test,
tài khoản riêng chỉ SELECT/INSERT/UPDATE/DELETE trên test. Instance test hiện có
được khởi động lại, không chạy bootstrap hoặc sao chép database. Cả 12 bảng InnoDB.
Không tạo tài khoản admin; chỉ tạo một khách hàng fixture để kiểm tra checkout/snapshot.

7 nhóm tích hợp:

1. Tạo product/default variant; SELECT giá 100000.01, stock 5, BLOB/MIME đúng file PNG.
2. SKU trùng theo collation MySQL (cả khác chữ hoa/thường) trả 409; hash toàn bộ
   bảng sau rollback khớp trước thao tác, không để product mới dở dang.
3. Thêm variant có option/value đúng sản phẩm, SELECT link; value lạ trả 422,
   variant thuộc product khác trả 404, không ghi thay đổi ngoài ý muốn.
4. Checkout thật trên fixture trừ stock 5→4; admin gửi expected_stock=5 bị 409,
   không ghi đè kho hoặc tạo thêm đơn.
5. Sửa product đã có đơn và sửa tên/giá/kho variant: order detail/snapshot trước
   và sau bằng nhau; giá mới 200000.00, kho 0 nhưng unit_price đơn vẫn 100000.01;
   không upload lại thì ảnh cũ còn nguyên.
6. Giá 0/âm/scientific và stock âm/thập phân bị từ chối trước SQL, các bảng không đổi.
7. Tạo 23 product fixture; tìm kiếm/phân trang MySQL thật cho 20+3 dòng không trùng,
   page vượt được clamp; SQL injection/literal % không trả toàn bộ dữ liệu.

Sau test cleanup theo đúng product IDs mới và user test mới, thứ tự FK; không xóa
theo tiền tố TEST hoặc xóa toàn bảng. Đối chiếu hash nội dung cả 12 bảng test trước/sau
đạt, giữ nguyên toàn bộ dữ liệu test cũ. Bộ đếm AUTO_INCREMENT có thể tăng tự nhiên,
không ALTER để đặt lại. Evidence local: .test-runtime/admin-products-results.json,
gồm ID fixture, kết quả và hash; không ghi mật khẩu hoặc dữ liệu cá nhân thật.
Pool đã đóng và instance test đã dừng an toàn.

Các case MySQL chạy qua service/repository thật, không phải toàn bộ HTTP đăng nhập
admin trên MySQL. Case HTTP multipart/CSRF/quyền dùng repository fixture; không
gộp hai loại bằng chứng thành một test end-to-end admin MySQL chưa thực hiện.

## Chạy và kiểm tra trên máy

Chạy npm start, đăng nhập bằng tài khoản admin đã được cấp quyền hợp lệ rồi mở
/admin/products. Không có admin mặc định, không tự tạo mật khẩu hoặc nâng quyền.

1. Bấm Thêm sản phẩm, nhập tên, SKU, giá >0, kho >=0; chọn danh mục/ảnh nếu có.
2. Lưu, kiểm tra danh sách biến thể mặc định trên trang sửa sản phẩm.
3. Thêm hoặc sửa biến thể; nếu sản phẩm có option đã cấu hình thì phải chọn đủ.
4. Nếu đổi stock, chọn xác nhận. Nếu nhận 409 do stock thay đổi, bấm tải lại dữ liệu
   mới nhất, xem lại số lượng rồi lưu; không tự bấm gửi lại form cũ.
5. Xem sản phẩm tại Catalog bằng link có sẵn. Giá/kho/ảnh mới được đọc từ DB;
   giá/tên trong đơn lịch sử không bị sửa.

Chỉ thử ghi sản phẩm khi chủ dự án muốn thay đổi dữ liệu thực. Để tự động kiểm thử
an toàn với môi trường test hiện có, giữ terminal chạy instance riêng:

~~~powershell
node scripts/test-mysql-instance.cjs --start
~~~

Terminal khác:

~~~powershell
node scripts/check-admin-products.cjs --run
node scripts/test-mysql-instance.cjs --stop
npm test
~~~

## Chưa triển khai hoặc chưa kiểm thử

- Ẩn/ngừng bán: thiếu trạng thái schema; cần duyệt riêng nếu muốn bổ sung, không
  dùng stock=0 để giả ngừng bán. Không có thay đổi schema đang chờ cho phần đã hoàn thành.
- Xóa: không triển khai kể cả khi FK cho phép SET NULL, để giữ chính sách không xóa
  cứng sản phẩm đã có giao dịch. Chưa có nút xóa ảnh hoặc xóa variant.
- Tạo/sửa loại thuộc tính và giá trị: chưa có màn hình quản lý option/value; form
  variant dùng cấu hình hiện có. Option chưa có value sẽ không có lựa chọn hợp lệ,
  backend chặn lưu thay vì tạo value giả.
- Kiểm tra ảnh là MIME/signature và giới hạn kích thước, không giải mã toàn bộ file.
- QA trực quan trên trình duyệt/mobile, đăng nhập admin MySQL thực và lịch cạnh tranh
  đồng thời giữa admin với checkout đa sản phẩm chưa chạy. Đã chạy thứ tự checkout
  rồi stale form trên InnoDB, không tuyên bố bao phủ mọi lịch deadlock.
- Session/idempotency và các giới hạn Giai đoạn 4 giữ nguyên; không sửa ngoài phạm vi.

Phần tiếp theo là quản lý đơn hàng/COD. Dừng tại Phần 2; không tự xây chuyển trạng thái,
ghi nhận thu tiền hoặc hoàn kho trước khi chốt các quy tắc cần thiết cho phần đó.
