# Xóa sản phẩm chưa có đơn hàng

## Quyết định đã duyệt

- Admin được xóa sản phẩm chưa có đơn hàng.
- Nếu sản phẩm đang nằm trong giỏ khách, xóa cả các dòng giỏ liên quan.
- Sản phẩm đã có đơn bị chặn, kể cả đơn cancelled.
- Không thêm is_active, không làm ngừng bán/soft delete và không sửa schema.

Đã đọc SQL, code sản phẩm, giỏ, checkout, helper và test hiện có; đối chiếu
metadata FK MySQL hiện tại bằng SELECT. Xóa products sẽ CASCADE variants/options,
option_values/variant_option_values và cart_items. order_items dùng SET NULL nên
không thể dựa riêng FK để ngăn xóa sản phẩm đã giao dịch: cần kiểm tra backend.

## Cách triển khai

Route **POST /admin/products/:productId/delete** dùng guard admin và CSRF hiện có.
ID được kiểm tra; không có checkbox xác nhận. Khi bấm nút, hộp thoại hỏi lại với hai lựa chọn Xóa/Hủy; chỉ Xóa mới gửi form. Không nhận product_id,
user_id hoặc role trong form làm nguồn quyết định; ID sản phẩm từ URL vẫn được
validate và xác minh tồn tại ở database.

Transaction:

1. Khóa product FOR UPDATE, không tồn tại trả 404.
2. Khóa toàn bộ variants theo variant_id tăng dần.
3. Đọc order_items bằng current read FOR UPDATE: kiểm tra product_id trực tiếp
   và qua variant_id thuộc sản phẩm; không lọc trạng thái đơn.
4. Có bất kỳ liên kết đơn nào thì rollback/409. Product_id lịch sử NULL nhưng
   variant_id còn liên kết vẫn bị chặn.
5. Nếu có reviews tham chiếu sản phẩm nhưng không tìm được đơn liên quan, cũng
   chặn 409 để tránh cascade xóa đánh giá bất thường; yêu cầu kiểm tra dữ liệu.
6. DELETE products với ID có tham số, kiểm tra affectedRows, commit.
   FK CASCADE xóa dữ liệu con/giỏ trong cùng transaction. Lỗi rollback/release.

Không UPDATE/DELETE orders hoặc order_items trong chức năng này. Lock timeout/
deadlock ở service trả 409 an toàn, không tự retry câu xóa. Khóa parent và variants
ngăn việc kiểm tra xong rồi bỏ sót đơn vừa tạo; nếu tranh khóa với checkout có
thể có một phía bị từ chối, không cho cả xóa và mua cùng thành công.

Danh sách và chi tiết admin có has_orders từ EXISTS trên hai loại liên kết.
Đây chỉ là cờ hiển thị; POST luôn kiểm tra lại dưới khóa, không tin trạng thái
cũ của form. Có cột Xóa sản phẩm ở danh sách và form xóa ở trang sửa, cùng partial.
Sản phẩm chưa có đơn có nút **Xóa sản phẩm**, mở hộp thoại hỏi lại; đã có đơn
hiển thị Không thể xóa. GET không thực hiện xóa.

## File tạo/sửa

Tạo:

- src/views/admin/products/delete.ejs
- src/views/admin/products/delete-dialog.ejs
- public/js/admin-product-delete.js
- tests/admin-product-delete.test.js
- docs/xoa-san-pham-chua-co-don.md

Sửa:

- src/repositories/admin-product-repository.js: has_orders ở SELECT và transaction xóa.
- src/services/admin-product-service.js: ID và xử lý lỗi ghi dùng cơ chế sẵn có; không yêu cầu confirm_delete.
- src/controllers/admin-product-controller.js: POST xóa, redirect/thông báo.
- src/routes/admin.js: route POST dưới guard hiện có.
- src/views/admin/products/index.ejs: cột xóa/thông báo.
- src/views/admin/products/form.ejs: partial xóa và mô tả chính sách mới.
- public/css/admin.css: giao diện hộp thoại và backdrop, giữ phong cách hiện có.
- tests/helpers/admin-product-database.cjs: mô phỏng liên kết đơn/cascade/rollback.
- scripts/check-admin-products.cjs: thêm bốn nhóm InnoDB cho xóa sản phẩm.

Không sửa frontend-static, .env, package/dependency, SQL/schema hoặc code checkout.
Không xóa sản phẩm hay giỏ trên database demo trong quá trình kiểm thử.

## Kết quả kiểm thử

Sau cập nhật bỏ checkbox và thêm hộp thoại hỏi lại, đã chạy lại test sản phẩm/xóa:
12/12 PASS, gồm Hủy/Escape không gửi form, Xóa gửi đúng một lần, và POST không có confirm_delete. Kết quả regression 101/101 và
MySQL 11/11 bên dưới thuộc lượt triển khai ban đầu; không chạy lại hai bộ này
cho thay đổi bỏ checkbox. Không ghi database trong lượt cập nhật này.

| Lệnh | Kết quả | Môi trường |
| --- | --- | --- |
| node --test tests/admin-product-delete.test.js tests/admin-products.test.js | 12/12 PASS | Service/mock, HTTP/session Express và JavaScript với DOM giả lập |
| npm test | 101/101 PASS | Regression hiện có, không ghi MySQL |
| node scripts/check-admin-products.cjs --run | 11/11 PASS, cleanup PASS | MySQL test riêng: 7 nhóm sản phẩm cũ + 4 nhóm xóa mới |

Test mock/HTTP/JavaScript kiểm tra: không checkbox, hộp thoại Xóa/Hủy, ID/quyền/CSRF; giả mạo product_id trong body;
GET không xóa; giao diện có cột/form xóa; từ chối mọi trạng thái pending,
confirmed, shipping, delivered, cancelled; FK product NULL còn variant;
đánh giá bất thường; form cũ; lỗi xóa/commit rollback; không ghi đơn; không ảnh
hưởng cart của sản phẩm khác. Mutex/cascade mock không được dùng để chứng minh InnoDB.

Bốn nhóm mới trên MySQL thật:

1. Tạo product/variant/options/value/link nhân tạo và hai dòng giỏ thuộc hai sản
   phẩm test. Xóa target bằng service, SELECT xác minh product/variant/options/
   value/link/cart của target biến mất, dòng giỏ sản phẩm khác còn nguyên,
   order_items của đơn fixture cũ trong cùng lượt không đổi.
2. Sản phẩm có order pending/cancelled và trường hợp order_items.product_id=NULL
   còn variant_id: đều bị 409. Hash nội dung bảng trước/sau yêu cầu xóa khớp.
3. Adapter test ném lỗi trước commit sau DELETE thật: rollback phục hồi product,
   variant và cart; hash toàn bộ 12 bảng khớp trước thao tác. Không sửa production
   hook, constraint hoặc schema để tạo lỗi; đây là fault injection ở adapter test.
4. Xóa cạnh tranh checkout trên hai connection khác nhau, đồng bộ trước begin.
   Chỉ một bên thành công. Lượt thực tế này: xóa thắng, checkout thất bại phù hợp,
   0 đơn mới, product/variant không còn. Không tuyên bố đã thử đủ mọi thứ tự thắng
   hoặc mọi lỗi mạng; nhánh đã có đơn thắng được kiểm tra riêng ở nhóm 2.

Runner dùng openTestPool xác minh database/tài khoản khác nguồn, datadir/cổng và
grants DML chỉ techshop_test; các bảng InnoDB. Chỉ tạo khách thường và fixture
nhân tạo trong test, không tạo admin MySQL. Cleanup đúng IDs tạo trong lượt này;
hash nội dung 12 bảng trước/sau khớp, không xóa dữ liệu test có sẵn. Pool đã đóng
và instance test đã dừng, không reset auto increment.

Evidence nội bộ: .test-runtime/admin-products-results.json,
tag **ITP2-ad9fb30a2abec5de**, 11 PASS, cleanup PASS. HTTP admin dùng mock;
MySQL mới là service/repository, chưa phải toàn luồng HTTP/admin/MySQL đầu cuối.

## Cách dùng và giới hạn

Khởi động lại server, vào **Quản trị → Sản phẩm**. Với sản phẩm chưa có đơn,
bấm **Xóa sản phẩm** tại bảng hoặc trang sửa, rồi chọn **Xóa** hoặc **Hủy** trong hộp thoại (Escape cũng hủy). Giỏ khách
mất các dòng liên quan khi tải lại trang; chưa có cập nhật thời gian thực/push.

Hộp thoại dùng HTML dialog và JavaScript; trình duyệt không hỗ trợ dialog dùng
window.confirm thay thế. Tên sản phẩm gán bằng textContent, không chèn HTML.
Đây là xác nhận trải nghiệm giao diện, không phải cơ chế cấp quyền; backend vẫn
kiểm tra admin/CSRF/đơn hàng. Test JavaScript dùng DOM giả lập, chưa phải visual
hoặc thao tác click trong trình duyệt thực tế.

Nếu checkout đã mở trước khi xóa, backend đọc lại giỏ và fingerprint; dữ liệu
thay đổi sẽ yêu cầu kiểm tra lại, không dùng giá/stock cũ từ frontend để đặt hàng.

Chính sách dựa trên liên kết order_items hiện còn trong database. Nếu lịch sử
đã bị xóa hoặc cả product_id/variant_id bị sửa NULL bằng công cụ ngoài luồng,
schema không có audit để phục dựng “đã từng mua” từ tên/SKU. Không tự sửa dữ liệu
legacy hoặc thêm cột theo suy đoán. Review bất thường còn liên kết được chặn riêng.

Không thêm chức năng xóa riêng từng variant hay ngừng bán. Chưa kiểm tra visual
desktop/mobile hoặc mọi cặp cạnh tranh với cập nhật cart/admin. Không sửa các báo
cáo gate/nghiệm thu lịch sử để chuyển phần chưa kiểm thử thành PASS.
