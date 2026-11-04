# Website bán phụ kiện công nghệ TechZone

TechZone là website thương mại điện tử phục vụ đồ án cơ sở, hỗ trợ khách hàng tìm kiếm sản phẩm, lựa chọn phiên bản, quản lý giỏ hàng, đặt hàng và theo dõi đơn mua.

Website có khu vực quản trị để quản lý danh mục, sản phẩm, tồn kho, đơn hàng, thanh toán, mã giảm giá và quảng cáo.

## Chức năng chính

### Khách hàng

- Xem trang chủ, danh mục sản phẩm và quảng cáo.
- Tìm kiếm theo tên hoặc thương hiệu.
- Lọc theo danh mục, khoảng giá; sắp xếp và phân trang.
- Xem chi tiết sản phẩm, thư viện ảnh, phiên bản, giá và tồn kho.
- Đăng ký, đăng nhập bằng số điện thoại và mật khẩu.
- Quản lý hồ sơ cá nhân, địa chỉ nhận hàng và đổi mật khẩu.
- Thêm sản phẩm theo phiên bản vào giỏ hàng.
- Thay đổi số lượng, xóa và chọn sản phẩm để thanh toán.
- Mua ngay từ trang chi tiết sản phẩm.
- Áp dụng mã giảm giá khi checkout.
- Đặt hàng bằng COD hoặc chuyển khoản thủ công.
- Xem lịch sử, trạng thái và chi tiết đơn hàng.
- Đánh giá sản phẩm đã mua sau khi đơn được giao.

### Quản trị viên

- Quản lý danh mục sản phẩm.
- Thêm, sửa và xóa sản phẩm theo điều kiện nghiệp vụ.
- Quản lý phiên bản, mã phiên bản, giá và tồn kho.
- Thêm và xóa hình ảnh sản phẩm.
- Tra cứu đơn hàng, xem chi tiết và cập nhật trạng thái.
- Hủy đơn hợp lệ và hoàn kho.
- Xác nhận đã thu COD hoặc đã nhận chuyển khoản.
- Quản lý mã giảm giá và theo dõi lượt sử dụng.
- Quản lý quảng cáo, vị trí và thứ tự hiển thị.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Template engine | EJS |
| Backend | JavaScript, Node.js, Express |
| Database | MySQL 8.0, InnoDB |
| Kết nối database | mysql2/promise, connection pool |
| Quản lý phiên | express-session |
| Băm mật khẩu | Argon2id |
| Bảo vệ biểu mẫu | csrf-sync |
| Giới hạn request xác thực | express-rate-limit |
| Cấu hình môi trường | dotenv |
| Kiểm thử | Node.js Test Runner |

## Cấu trúc dự án

```text
TechShop/
├── database/
│   └── database.sql
├── public/                
├── scripts/               
├── src/
│   ├── app.js             
│   ├── server.js          
│   ├── config/            
│   ├── routes/            
│   ├── controllers/       
│   ├── services/          
│   ├── repositories/      
│   ├── middleware/        
│   ├── utils/             
│   └── views/             
├── tests/
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

Luồng xử lý:

**Routes → Controllers → Services → Repositories → MySQL**

## Cài đặt và chạy ứng dụng

### 1. Yêu cầu môi trường

- Node.js 24 và npm.
- MySQL 8.0.
- MySQL Workbench hoặc công cụ tương đương.

Bản SQL hiện được xuất từ MySQL 8.0.46. Dự án được cấu hình để demo local.

### 2. Cài đặt thư viện

Tải hoặc clone repository, mở terminal tại thư mục chứa `package.json`:

```bash
npm ci
```

### 3. Thiết lập database

1. Tạo một database MySQL mới, trống, dùng bộ ký tự `utf8mb4`.
2. Chọn database đó làm schema mặc định trong MySQL Workbench.
3. Mở và chạy file `database/database.sql` trên schema vừa tạo.
4. Chuẩn bị tài khoản MySQL có quyền đọc và cập nhật dữ liệu trong database dự án.

**Lưu ý:** file SQL là bản dump có lệnh `DROP TABLE`. Chỉ nhập vào database mới; không chạy lại trên database có dữ liệu cần giữ.

Ứng dụng không tự nhập SQL khi khởi động.

### 4. Cấu hình môi trường

Sao chép `.env.example` thành `.env` nếu chưa có file `.env`.

```dotenv
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database_name
```

Thay các giá trị minh họa bằng cấu hình MySQL trên máy của bạn.

`DB_NAME` phải trùng với database đã nhập SQL. Không đưa file `.env` lên GitHub.

### 5. Khởi động

```bash
npm start
```

Truy cập:

```text
http://127.0.0.1:3000
```

Nếu thay `PORT`, sử dụng cổng tương ứng.

Server kiểm tra kết nối MySQL trước khi mở HTTP. Dừng ứng dụng bằng `Ctrl+C`.

Chạy chế độ phát triển:

```bash
npm run dev
```

### 6. Sử dụng tài khoản

- Đăng ký khách hàng tại `/register`.
- Đăng nhập tại `/login`.
- Tài khoản đăng ký qua giao diện luôn có vai trò khách hàng.
- `/admin` yêu cầu tài khoản đã được cấp vai trò quản trị trong môi trường local.

## Các đường dẫn chính

| Đường dẫn | Chức năng |
| --- | --- |
| `/` | Trang chủ |
| `/products` | Danh sách sản phẩm |
| `/products/search` | Tìm kiếm sản phẩm |
| `/products/:id` | Chi tiết sản phẩm |
| `/register` | Đăng ký |
| `/login` | Đăng nhập |
| `/account` | Hồ sơ cá nhân |
| `/account/addresses` | Quản lý địa chỉ |
| `/account/change-password` | Đổi mật khẩu |
| `/cart` | Giỏ hàng |
| `/checkout` | Xác nhận đặt hàng |
| `/checkout/success/:orderId` | Kết quả đặt hàng |
| `/orders` | Lịch sử đơn hàng |
| `/orders/:orderId` | Chi tiết đơn hàng |
| `/orders/:orderId/payment` | Hướng dẫn chuyển khoản |
| `/admin` | Tổng quan quản trị |
| `/admin/categories` | Quản lý danh mục |
| `/admin/products` | Quản lý sản phẩm |
| `/admin/orders` | Quản lý đơn và thanh toán |
| `/admin/coupons` | Quản lý mã giảm giá |
| `/admin/advertisements` | Quản lý quảng cáo |

Thay `:id` và `:orderId` bằng mã thực tế.

## Quy tắc nghiệp vụ

- Người dùng phải đăng nhập để thêm giỏ và đặt hàng.
- Mỗi phiên bản chỉ có một dòng trong giỏ của cùng người dùng.
- Số lượng phải là số nguyên dương, tối đa 99 và không vượt tồn kho.
- Giá và tổng tiền được kiểm tra, tính toán ở backend từ MySQL.
- Tiền hàng trước giảm giá từ 300.000đ được miễn phí vận chuyển; dưới ngưỡng thu 30.000đ.
- Mã giảm giá áp dụng trên tiền hàng theo điều kiện được cấu hình.
- Tạo đơn, lưu chi tiết, trừ kho, ghi nhận lượt mã và xóa dòng giỏ đã mua được xử lý trong một transaction.
- Đơn hàng lưu thông tin sản phẩm, giá mua và địa chỉ tại thời điểm đặt.
- Trạng thái giao hàng chuyển tuần tự: chờ xác nhận → đã xác nhận → đang giao → đã giao.
- Admin chỉ hủy đơn chờ xác nhận và chưa thanh toán.
- Đơn chờ xác nhận, chưa thanh toán quá 72 giờ được tác vụ nền xử lý tự hủy khi server hoạt động.
- COD được xác nhận thu tiền sau khi giao.
- Chuyển khoản được admin đối soát thủ công trước khi xử lý giao hàng.
- Chỉ chủ đơn đã giao được đánh giá sản phẩm thuộc đơn, tối đa một lần mỗi khách hàng/sản phẩm.
- Không xóa danh mục còn sản phẩm hoặc sản phẩm đã có đơn hàng.

## Kiểm tra cơ bản

```bash
npm run db:check
npm test
```

- `db:check`: kiểm tra kết nối và cấu trúc database.
- `npm test`: chạy bộ kiểm thử fixture/mock.
- `npm run catalog:check`: kiểm tra SQL catalog bằng dữ liệu CTE giả lập trên MySQL.

Kiểm thử mock không thay thế kiểm thử transaction MySQL thật.

`npm run test:mysql` chỉ dành cho môi trường MySQL test riêng đã thiết lập; không chạy kiểm thử ghi dữ liệu trên database demo hoặc dữ liệu cần giữ.

## Phạm vi hiện tại

- Dự án phục vụ demo local; session chưa được cấu hình cho production.
- Chuyển khoản thủ công, chưa tích hợp cổng thanh toán hoặc webhook.
- Chưa có OTP, quên mật khẩu, tích hợp vận chuyển và trả hàng/hoàn tiền.
- Chống gửi lặp checkout phụ thuộc bộ nhớ một tiến trình.
- Giỏ hàng chưa lưu giá tham chiếu lúc thêm; hệ thống đối chiếu thay đổi từ thời điểm duyệt checkout.