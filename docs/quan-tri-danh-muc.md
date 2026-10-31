# Quản trị danh mục sản phẩm

## Phạm vi và quyết định

Người dùng yêu cầu bổ sung quyền thêm/sửa/xóa danh mục cho admin, sau đó chốt:
**Không cho xóa danh mục khi danh mục còn có sản phẩm.**

Đã đọc SQL gốc và đối chiếu metadata MySQL hiện tại bằng SELECT:

- categories: category_id INT PK, category_name VARCHAR(100) NOT NULL,
  description TEXT nullable; UNIQUE uq_categories_name trên tên.
- products.category_id tham chiếu categories, ON DELETE SET NULL.

Không thay schema hoặc FK. Ứng dụng chủ động chặn xóa danh mục có sản phẩm,
không dựa vào hành vi SET NULL để bỏ phân loại sản phẩm.

## Chức năng và route

| Method | URL | Chức năng |
| --- | --- | --- |
| GET | /admin/categories | Danh sách, số sản phẩm, tìm tên và phân trang 20 danh mục |
| GET | /admin/categories/new | Form thêm |
| POST | /admin/categories | Tạo tên và mô tả |
| GET | /admin/categories/:categoryId/edit | Form sửa, hiển thị điều kiện xóa |
| POST | /admin/categories/:categoryId/update | Sửa tên/mô tả |
| POST | /admin/categories/:categoryId/delete | Xóa danh mục rỗng sau xác nhận |

Menu Danh mục trong layout quản trị dùng chung. Tên bắt buộc tối đa 100 ký tự,
mô tả tùy chọn tối đa 4.000 ký tự. Tên trùng trả 409 với lỗi tại trường tên;
ID sai/không tồn tại 404; thiếu xác nhận xóa 422; danh mục có sản phẩm 409.
Form giữ các giá trị hợp lệ khi lỗi; EJS escape tên/mô tả. Không viết SQL trong view.

Các danh mục mới/sửa được catalog và form sản phẩm đọc lại từ cùng bảng hiện có;
không bổ sung cache hoặc dữ liệu danh mục cố định. Không sửa frontend-static.

## Bảo vệ

- Tất cả route nằm dưới guard requireAuth/requireAdmin hiện có; không cho user
  tự gửi role hoặc user_id để cấp quyền. Tất cả POST có CSRF.
- Backend kiểm tra dữ liệu/ID; chỉ dùng truy vấn tham số. Từ khóa LIKE escape,
  ORDER BY cố định và OFFSET từ số nguyên đã chuẩn hóa, có clamp trang.
- Form xóa chỉ hiện khi product_count=0, cần checkbox confirm_delete=1. Dù gửi
  request trực tiếp, repository vẫn kiểm tra lại bằng transaction.
- Xóa: SELECT category FOR UPDATE → SELECT một product đang tham chiếu FOR UPDATE
  → nếu có product thì rollback/409 → nếu rỗng thì DELETE category → commit.
  Khóa parent kết hợp FK ngăn gán sản phẩm mới vào danh mục trong lúc kiểm tra/xóa.
- Không UPDATE/DELETE products, orders hoặc order_items trong repository danh mục.
- Lỗi ghi/commit rollback và release connection. Lock timeout/deadlock trả 409
  an toàn, yêu cầu tải lại thay vì tự retry. Không đưa SQL/stack/config vào response.
- Không có GET xóa, không có xóa dây chuyền sản phẩm hoặc thao tác sửa tài khoản.

## File tạo/sửa

Tạo:

- src/utils/admin-category-validation.js
- src/repositories/admin-category-repository.js
- src/services/admin-category-service.js
- src/controllers/admin-category-controller.js
- src/views/admin/categories/index.ejs
- src/views/admin/categories/form.ejs
- tests/helpers/admin-category-database.cjs
- tests/admin-categories.test.js
- docs/quan-tri-danh-muc.md

Sửa:

- src/routes/admin.js: các route danh mục dưới guard chung.
- src/app.js: inject adminCategoryRepository để test không dùng MySQL thật.
- src/views/admin/partials/start.ejs: thêm menu Danh mục, giữ các thay đổi giao diện hiện có.
- tests/helpers/account-client.cjs: inject repository danh mục giả lập.

Không sửa dependency, .env, schema/SQL, code tài khoản/checkout hoặc dữ liệu
database demo. Không tạo/xóa danh mục thực tế trong quá trình kiểm thử.

## Kiểm thử

`node --test tests/admin-categories.test.js`: **5/5 nhóm PASS**.

`npm test`: **97/97 PASS**, gồm các test danh mục mới và regression hiện có.

1. Thêm/sửa đúng trường, tên/mô tả/ID sai, biên độ dài và lỗi tên trùng.
2. Tìm kiếm/page/SQL tham số, input bất thường, không có kết quả và đọc bằng SELECT.
3. Xóa rỗng, chặn danh mục có sản phẩm, thêm product vào fixture sau GET rồi
   DELETE bị chặn; không thay product hoặc đơn, kiểm tra thứ tự khóa.
4. Rollback lỗi update/delete/commit, thông báo lock lỗi và gửi xóa hai lần.
5. Express HTTP/EJS/session/mock: guest/user bị chặn; CSRF; validation/XSS;
   thêm/sửa/xóa; chặn POST thủ công vào danh mục có sản phẩm; thiếu xác nhận;
   GET xóa 404; lỗi 500 không lộ SQL.

Các test trên dùng database giả lập trong bộ nhớ. Không coi mutex mock là bằng
chứng InnoDB hoặc collation UNIQUE thực tế. Lần này MySQL chỉ được dùng để đọc
metadata; chưa chạy tích hợp CRUD/xóa hoặc race gán product/xóa trên MySQL riêng.
Chưa kiểm tra visual browser desktop/mobile. Không thay đổi các báo cáo nghiệm
thu lịch sử thành PASS cho phần chưa chạy.

## Cách thử

Khởi động lại server, đăng nhập admin và chọn **Danh mục** hoặc mở
`/admin/categories`. Thêm hoặc sửa tên/mô tả. Mở Sửa / Xem danh mục để xóa khi
không có sản phẩm, tích xác nhận trước khi bấm. Nếu đang có sản phẩm, chuyển các
sản phẩm sang danh mục khác từ quản lý sản phẩm rồi mới xóa danh mục.

`npm test` chạy regression bằng dữ liệu giả lập. Không tạo danh mục hoặc đơn trên
database demo chỉ để kiểm thử. Lưu ý server vẫn có worker tự hủy pending 72 giờ
đã được duyệt ở bước trước; không bật server demo để chạy test transaction.
