# Nghiệm thu Giai đoạn 4 với MySQL/InnoDB thật

## Môi trường đã tạo và mức cách ly

Đã tạo instance MySQL Community 8.0.46 riêng, chỉ bind 127.0.0.1, cổng riêng,
data directory riêng trong thư mục tạm của Windows. Không cài Windows service,
không đổi cấu hình hoặc dừng MySQL đang phục vụ website. Tài khoản MySQL website
không có quyền CREATE DATABASE/USER nên lần thử ban đầu bị từ chối; sau đó dùng
instance riêng, không nâng quyền tài khoản website.

Database techshop_test gồm 12 bảng InnoDB, sao chép **DDL metadata** của schema
hiện tại bằng SHOW CREATE TABLE; không chạy file dump và không sao chép dữ liệu.
Đối chiếu cấu trúc chuẩn hóa: 12/12 khớp, bỏ bộ đếm AUTO_INCREMENT và khác biệt
cách SHOW CREATE TABLE ghi tường minh CHARACTER SET utf8mb4 cùng collation.

Tài khoản runner chỉ có SELECT/INSERT/UPDATE/DELETE trên techshop_test, không
có CREATE/ALTER/DROP hoặc quyền schema website. Runner kiểm tra @@datadir,
@@port, DATABASE(), tên database chính xác và SHOW GRANTS trước khi ghi.
Các thao tác root/bootstrap chỉ thực hiện trên instance được đối chiếu datadir.

Thông tin bí mật nằm trong .env.test.local và .env.test-admin.local; hai file
được .gitignore loại trừ. .test-runtime/ cũng ngoài Git. Không in secret, không
đưa secret vào package.json/mã nguồn/báo cáo. .env hiện tại giữ nguyên.

## Kiểm thử đã thực thi

- `npm test`: **47/47** nhóm unit/HTTP dùng fixture giả lập đạt.
- `npm run test:mysql`: **13/13** nhóm tích hợp trên InnoDB thật đạt, chạy lại
  sau khởi động lại instance vẫn đạt. Không phải chỉ PREPARE hoặc mock.
- Fixtures chỉ trong test: khách/người nhận/địa chỉ/sản phẩm/SKU tự tạo; mật
  khẩu fixture băm Argon2id. Không sử dụng dữ liệu cá nhân thật.
- Tồn kho 1: 5 vòng hai khách đặt đồng thời qua các connection MySQL thật;
  mỗi vòng một đơn thành công, một 409, kho còn 0 và giỏ khách thua còn nguyên.
- Thêm cùng biến thể đồng thời: 5 lần thêm ra một dòng quantity=5.
- HTTP thật: 12 POST cùng token chỉ tạo một đơn; nhiều token cùng giỏ chỉ một
  đơn. Gửi lại không tạo thêm đơn trong tiến trình hiện tại.
- Rollback thật: lỗi stock thứ hai được chèn ở adapter để giả lập affectedRows=0;
  lỗi INSERT order do NOT NULL và dòng order_items thứ hai do CHECK quantity>0
  được MySQL thật từ chối; lỗi xóa giỏ được chèn ở adapter. Sau rollback kiểm tra
  kho/giỏ/đơn trở về trạng thái trước. Đây là fault injection quanh transaction
  thật, không đổi schema hoặc trigger để tạo lỗi.
- HTTP tài khoản thật: đăng ký không thể tự cấp admin, đăng nhập, hồ sơ, địa
  chỉ district rỗng/mặc định, đổi mật khẩu buộc đăng nhập lại và đăng xuất đạt.
- Trình duyệt desktop dùng database test: đăng nhập, chi tiết sản phẩm, thêm
  giỏ, checkout và lịch sử rỗng; đã xem ảnh chụp và kiểm tra cùng header, font,
  màu, nút và bố cục đang dùng. Chưa thử đầy đủ trên thiết bị/mobile thật.

## Đánh giá 14 tiêu chí

| # | Tiêu chí | Kết quả và bằng chứng |
| --- | --- | --- |
| 1 | Đăng nhập thêm sản phẩm/biến thể | Đạt: HTTP thật vào giỏ; khách chưa đăng nhập bị chuyển login |
| 2 | Thao tác giỏ chính xác | Đạt: thêm, gộp/tách, tăng/giảm, xóa, rỗng, quyền sở hữu; UNIQUE thực tế và 5 thêm đồng thời |
| 3 | Giá/tổng ở backend | Đạt: giá/user_id/total giả từ form không quyết định dữ liệu; giá DECIMAL và BigInt tính tiền |
| 4 | Địa chỉ đúng sở hữu | Đạt: địa chỉ người khác bị từ chối; đọc lại/khóa địa chỉ trong transaction |
| 5 | Phí đúng quy tắc | Đạt: giá 299.999,99đ cho tổng 329.999,99đ; đúng 300.000đ miễn phí trên đơn MySQL thật |
| 6 | Tạo đơn/trừ kho atomic | Đạt: begin/commit/rollback trên connection InnoDB thật; lỗi từng bước không để dữ liệu dở dang |
| 7 | Không tạo đơn sai giá | Đạt: giá đổi sau preview bị 409, khách duyệt lại mới đặt; order_items lưu đúng giá đọc lại từ DB |
| 8 | Không âm kho | Đạt: UPDATE có điều kiện, khóa biến thể; 5 vòng tranh kho cuối không âm |
| 9 | Không tạo đơn lặp | Đạt trong phạm vi demo một tiến trình: 12 POST/token và nhiều token/cùng giỏ. Chưa có khóa idempotency bền vững qua restart/crash/nhiều instance, đúng giới hạn đã duyệt |
| 10 | Chỉ xem đơn của mình | Đạt: MySQL repository và HTTP thật trả 404 với đơn người khác; query user_id không đổi chủ |
| 11 | Giữ lịch sử | Đạt: sau đặt, UPDATE tên/giá/địa chỉ hiện tại trong DB test rồi đọc đơn vẫn đúng snapshot và giá cũ |
| 12 | Database đúng phạm vi duyệt | Đạt: DDL/DML mới chỉ trên instance test; dữ liệu/schema website không bị sửa; SQL gốc/.env/frontend không đổi hash |
| 13 | Phong cách thống nhất | Đạt qua đối chiếu CSS và xem desktop: tái sử dụng header/footer/font/màu/nút; chưa nghiệm thu giao diện đầy đủ trên mobile |
| 14 | Giai đoạn cũ vẫn hoạt động | Đạt phạm vi đã kiểm tra: 47 test cũ/mới, HTTP Catalog và luồng tài khoản thật; không sửa src hoặc giao diện website trong nhiệm vụ này |

Kết luận: **đủ điều kiện demo local một tiến trình theo các phương án đã duyệt**.
Không coi đây là bảo đảm production, không khẳng định chống lặp bền vững qua
mọi tình huống mất tiến trình hoặc đã thử đầy đủ mọi thiết bị. Trạng thái ngừng
bán chưa có trong schema và đã được hoãn, không giả vờ coi hết hàng là ngừng bán.
Hủy đơn/auto-hủy 72 giờ, hoàn tiền và quản trị vẫn ngoài phần đã triển khai.

## Bảo vệ dữ liệu website

Trước/sau: users=1, user_addresses=0, orders=0, order_items=0, cart_items=0,
tổng stock=865. 5.861 file frontend-static/, database/ và .env không đổi hash.
Các truy vấn vào database website chỉ đọc metadata và đếm tổng hợp; không
thêm khách/đơn hay trừ kho ở đó. Các đơn/khách TEST trong instance test được
giữ lại để xem lại, không tự xóa database hoặc file dữ liệu test.

## Cách dùng môi trường đã tạo

Mở một terminal riêng ở thư mục project, giữ terminal này chạy:

```powershell
node scripts/test-mysql-instance.cjs --start
```

Trong terminal thứ hai:

```powershell
npm test
npm run test:mysql
# Tùy chọn xem giao diện với database test, URL localhost in ở terminal:
node scripts/serve-test.cjs --serve
```

Runner tạo fixture riêng cho mỗi nhóm, không xóa dữ liệu test cũ. Mỗi lần chạy
tạo thêm dữ liệu TEST. Khi xem giao diện có thể tự đăng ký tài khoản thử trong
database test, không cần dùng tài khoản website thật.

Khi xong, dừng server giao diện bằng Ctrl+C, rồi:

```powershell
node scripts/test-mysql-instance.cjs --stop
```

Lệnh stop đối chiếu data directory trước SHUTDOWN; chỉ dừng instance test, giữ
database/fixture trên đĩa. Instance test sẽ được dừng sau lượt nghiệm thu này.
Không cần chạy lại bootstrap. Với máy khác chưa có môi trường, sau khi được
phép tạo mới, chạy --start rồi ở terminal khác chạy:

```powershell
node scripts/setup-test-db.cjs --create --isolated
```

Script từ chối ghi đè config/schema test đã có. Đường dẫn mysqld mặc định là
bản MySQL 8 trên Windows; có thể cung cấp TEST_MYSQLD_PATH ở môi trường chạy.
Không cài thêm MySQL hoặc thư viện npm trong nhiệm vụ này.

## File thay đổi

Tạo 5 script:

- scripts/test-mysql-instance.cjs: vòng đời instance riêng; cwd ASCII để MySQL
  Windows khởi động ổn định với project có dấu; không mở cửa sổ mới.
- scripts/setup-test-db.cjs: sao chép DDL và tạo tài khoản giới hạn trên test.
- scripts/test-db-config.cjs: guard database, datadir/cổng, account và grants.
- scripts/check-purchase-mysql.cjs: 13 nhóm tích hợp thật, opt-in.
- scripts/serve-test.cjs: server giao diện dùng toàn bộ repository trên pool test.

Tạo docs/nghiem-thu-giai-doan-4.md. Sửa .gitignore, package.json và README.md.
File local ngoài Git: .env.test.local, .env.test-admin.local, .test-runtime/
(runtime, kết quả, ảnh checkout); datadir nằm riêng trong thư mục tạm Windows.

Đã điều chỉnh npm test chỉ tìm tests/*.test.js và thêm cờ opt-in cho script
môi trường để Node không tự khởi động server khi tự dò tên file *test*.cjs.
Không thay đổi thư viện, package-lock.json, src/, public/ hay frontend-static/.
