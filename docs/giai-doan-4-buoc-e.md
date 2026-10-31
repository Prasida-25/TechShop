# Giai đoạn 4 — Bước E: Kiểm thử và báo cáo

## Kết quả và phạm vi

Lượt kiểm tra Bước E: `npm test` đạt **47/47**, 0 lỗi, 0 bỏ qua. Có 3 nhóm mới
cho luồng HTTP xuyên suốt và lỗi ghi chi tiết một phần; toàn bộ 44 nhóm cũ đạt.
Các test nghiệp vụ ghi dữ liệu đều dùng fixture trong bộ nhớ, không ghi MySQL.
Không phát hiện lỗi cần sửa mã chức năng trong lượt kiểm tra này.

Chưa có cấu hình/môi trường MySQL test riêng được xác nhận trong project;
không có `.env.test.local` hoặc biến TEST_DB_NAME trong tiến trình kiểm tra.
Không suy luận rằng máy không có database test từ các kiểm tra cấu hình này.
Chưa tạo database/user MySQL, chưa chạy SQL gốc, migration hoặc seed thật.

## Ma trận 19 tình huống

“Đạt giả lập” là đã thực thi test tự động trong bộ nhớ. Không đồng nghĩa đã
kiểm thử ghi, khóa, deadlock hoặc isolation trên MySQL/InnoDB thật.

| # | Tình huống | Kết quả thực tế và bằng chứng |
| --- | --- | --- |
| 1 | Thêm sản phẩm vào giỏ | Đạt giả lập: cart.test.js và purchase-flow.test.js đi qua HTTP/service/repository |
| 2 | Thêm cùng biến thể nhiều lần | Đạt giả lập: tăng quantity, một dòng; thêm đồng thời được kiểm tra ở cart.test.js |
| 3 | Cùng sản phẩm, khác biến thể | Đạt giả lập: hai dòng riêng trong giỏ |
| 4 | Tăng vượt kho | Đạt giả lập: backend trả 422, số lượng không đổi |
| 5 | Giảm số lượng | Đạt giả lập: POST cập nhật và kiểm tra quantity mới |
| 6 | Xóa dòng | Đạt giả lập: dòng của mình được xóa, dòng của người khác bị từ chối |
| 7 | Giỏ trống | Đạt giả lập: EJS có trạng thái trống, checkout từ chối |
| 8 | Sản phẩm ngừng bán | CHƯA HỖ TRỢ: schema không có trạng thái ngừng bán; không thêm trường giả để báo test đạt. Đã kiểm tra riêng biến thể không tồn tại/sai cấu hình/giá không hợp lệ/hết hàng, nhưng đó không phải trạng thái ngừng bán |
| 9 | Giá thay đổi trước checkout | Đạt giả lập: GET lấy giá mới; thay đổi sau lúc duyệt checkout thì POST 409 và phải xác nhận lại. Không phát hiện thay đổi từ lúc thêm giỏ vì schema thiếu mốc giá, theo phương án đã duyệt |
| 10 | Địa chỉ của người khác | Đạt giả lập: GET chọn địa chỉ và POST thay address_id đều bị từ chối |
| 11 | Chưa đăng nhập | Đạt HTTP giả lập: giỏ/checkout/lịch sử/chi tiết chuyển đăng nhập; POST thêm giỏ có CSRF nhưng chưa đăng nhập không ghi dữ liệu |
| 12 | Truy cập đơn người khác | Đạt giả lập: 404 kể cả thêm user_id giả trong query; lịch sử không có đơn người khác |
| 13 | Đặt thành công | Đạt giả lập: pending/cod/unpaid, đúng snapshot và tổng, trừ kho, xóa đúng giỏ, xem được lịch sử/chi tiết |
| 14 | Trừ kho thất bại | Đạt giả lập: lỗi biến thể thứ hai khôi phục cả phần kho đã trừ trước đó |
| 15 | INSERT order_items thất bại | Đạt giả lập: lỗi dòng đầu và bổ sung lỗi dòng thứ hai sau khi dòng đầu đã được ghi |
| 16 | Transaction rollback | Đạt giả lập: lỗi kho/order/items/clear/commit khôi phục trạng thái, release connection; commit lỗi ở đây là lỗi mô phỏng, không bao quát mọi tình huống mất kết nối sau commit thật |
| 17 | Hai khách tranh kho thấp | Đạt service và HTTP giả lập: kho=1, một thành công/một 409, kho=0, giỏ khách thất bại còn nguyên. CHƯA xác minh khóa InnoDB thật |
| 18 | Bấm xác nhận liên tục | Đạt giả lập: 12 POST HTTP cùng token chỉ một đơn; thêm test token khác cùng giỏ và gửi lại sau thành công. Giới hạn token một tiến trình vẫn còn |
| 19 | Lịch sử khi tên/giá/địa chỉ đổi | Đạt HTTP giả lập: đặt đơn → đổi tên/giá/địa chỉ → bỏ dữ liệu hiện tại và cho FK NULL → đọc lại đúng snapshot, đơn giá và địa chỉ cũ |

Các test cũ còn kiểm tra CSRF, session, giả mạo giá/user_id/role, giới hạn 99,
phân trang, SQL có tham số, escape HTML, phí theo ngưỡng, phí lịch sử khác mức
hiện tại và lỗi không lộ SQL/secret.

## Thay đổi file ở Bước E

Tạo:

- tests/purchase-flow.test.js: 3 nhóm kiểm thử mới, hoàn toàn dữ liệu giả lập.
- docs/giai-doan-4-buoc-e.md: báo cáo này, ma trận và phương án MySQL test.

Sửa:

- tests/helpers/checkout-database.cjs: cho repository giỏ/checkout/đơn dùng cùng
  trạng thái giả lập, hỗ trợ lỗi order_items thứ hai.
- README.md: liên kết báo cáo và cách chạy test.

Không sửa src/, public/, frontend-static/, database/, .env, package.json hoặc
lockfile; không cài thư viện. Test helper chỉ được dùng trong bộ test, không
đăng ký vào ứng dụng thật.

## Kiểm tra MySQL thật — chỉ đọc

Trước kiểm thử: users=1, user_addresses=0, products=24, cart_items=0, orders=0,
order_items=0, tổng stock=865. Metadata không có trường trạng thái ngừng bán ở
products/product_variants. Không in người dùng, địa chỉ, mật khẩu hoặc .env.

Sau lượt test: users=1, user_addresses=0, products=24, cart_items=0, orders=0,
order_items=0, tổng stock=865, không đổi so với trước. Hash các file đã có cho
thấy chỉ README.md và tests/helpers/checkout-database.cjs thay đổi; mã ứng dụng,
public, frontend gốc, SQL, .env, dependencies và lockfile không đổi. Có hai file
mới là bài test luồng mua và báo cáo này như danh sách ở trên.
Không thực thi INSERT/UPDATE/DELETE/CREATE/ALTER/DROP hoặc đặt đơn thử trên DB thật.

## Phương án MySQL test đề xuất — CHƯA THỰC HIỆN, chờ duyệt

Đề xuất cho demo local: database riêng **techshop_test** trên MySQL local và
tài khoản chỉ có quyền trong database test; không có quyền dữ liệu TechShop
đang dùng. Có thể chọn instance MySQL riêng nếu muốn cách ly hoàn toàn server.

Sau khi được duyệt mới thực hiện lần lượt:

1. Tạo database test và tài khoản riêng có quyền giới hạn. Đối chiếu tên không
   trùng database ứng dụng; không sửa cấu hình ứng dụng hoặc `.env` hiện tại.
2. Tạo schema rỗng tương ứng cấu trúc hiện tại trong database test. Không nhập
   dump nguyên bản chứa DROP; không sao chép dữ liệu thật hoặc dữ liệu cá nhân.
3. Cấu hình test riêng bằng biến TEST_DB_* hoặc file local ngoài Git. Chỉ test
   runner đọc cấu hình đó; `npm start` giữ cấu hình hiện tại. Cần kiểm tra host,
   tài khoản, SELECT DATABASE() và tên đích chính xác trước mọi thao tác ghi;
   không chỉ dựa vào việc tên có hậu tố _test. Dùng quyền tài khoản giới hạn để
   database thật không thể bị ghi dù cấu hình runner sai.
4. Nạp fixture nhân tạo: 2 khách, 2 địa chỉ với district rỗng, 1 danh mục,
   1 sản phẩm/2 biến thể mặc định hợp lệ với SKU test riêng; giá 100.000đ và
   200.000đ, kho các lượt thử 1 hoặc 5. Mật khẩu fixture băm bằng Argon2id;
   mọi thông tin chỉ là dữ liệu thử, không dùng lại tài khoản thật.
5. Chạy transaction bằng connection thật: thành công, lỗi kho, lỗi INSERT chi
   tiết thứ hai, kiểm tra rollback. Dùng hai connection/HTTP đồng thời tranh
   một sản phẩm cuối; kiểm tra chỉ một đơn, kho không âm và giỏ thất bại còn.
6. Gửi lặp cùng token/nhiều token; kiểm tra snapshot sau khi sửa tên/giá/địa
   chỉ trong database test. Dọn fixture chỉ trong database test theo phạm vi
   được duyệt; không tự xóa database hoặc chạm vào dữ liệu ứng dụng thật.

Các thao tác CREATE và ghi fixture trên database test cần người dùng chấp
thuận trước. Chưa có script tự tạo/nạp/dọn database để tránh chạy nhầm.

## Cách chạy hiện tại và kết luận

```powershell
# Toàn bộ test giả lập, không cần MySQL, không ghi database thật:
npm test
# Chỉ 3 nhóm luồng mua bổ sung:
node --test tests/purchase-flow.test.js
```

Các test chỉ mở HTTP cổng ngẫu nhiên trên localhost rồi đóng; không dùng tài
khoản hoặc đơn thật. Chưa kiểm thử trực quan toàn bộ desktop/mobile ở Bước E.

Hoàn tất lượt kiểm thử giả lập và báo cáo. Chưa xác nhận toàn bộ Giai đoạn 4
đã được nghiệm thu transaction trên MySQL thật. Hai điểm còn lại là môi trường
InnoDB test chưa duyệt và trạng thái ngừng bán chưa có trong schema/phạm vi.
Token chống lặp vẫn không bền vững qua restart/nhiều instance như đã thống nhất.
Dừng và chờ người dùng duyệt môi trường test riêng trước khi chạy kiểm thử ghi.
