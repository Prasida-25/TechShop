# Hướng dẫn làm việc với project TechShop

Các quy tắc này áp dụng cho toàn bộ project. Thương hiệu hiển thị là **TechZone**;
tên thư mục project là TechShop. Chỉ triển khai nhiệm vụ người dùng giao rõ ràng.

## 1. Bảo toàn giao diện

- Giữ nguyên giao diện HTML/CSS/JavaScript hiện tại trong `frontend-static/`.
- Không tự thiết kế lại, đổi màu, bố cục hoặc nội dung nếu người dùng chưa yêu cầu.
- Khi được giao chuyển sang EJS, tái sử dụng giao diện hiện có và giữ bản frontend
  tĩnh để đối chiếu. Không coi việc chuyển EJS là quyền thiết kế lại giao diện.
- Nếu phát hiện lỗi giao diện hoặc nội dung ngoài phạm vi nhiệm vụ, báo lại thay
  vì tự sửa.

## 2. Công nghệ

- Giữ Node.js + Express + MySQL; dùng EJS để render phía server và JavaScript
  thuần cho tương tác cần thiết.
- Không tự chuyển sang React, Vue, MongoDB hoặc framework khác.
- Môi trường MVP là demo local; không tự triển khai lên hosting hay thêm hạ tầng
  ngoài phạm vi được giao.

## 3. Database

- Đọc `database/techshop.sql` hiện tại trước khi viết hoặc sửa truy vấn.
- Không suy đoán tên bảng/cột từ giao diện. Nếu SQL và database thực tế không
  khớp, báo khác biệt và hỏi người dùng trước khi tiếp tục phần bị ảnh hưởng.
- Giữ schema hiện tại. Không tự đổi tên bảng/cột, thêm bảng, thêm cột hoặc thay
  đổi ràng buộc nếu chưa giải thích lý do và được người dùng chấp thuận.
- Mọi đề xuất thay đổi schema phải nêu mục đích, tác động đến dữ liệu hiện có
  và cách kiểm tra; chờ duyệt riêng trước khi thực hiện.
- Không tự nhập lại dump, tạo lại database hoặc chạy migration trên database thật.
  File dump có lệnh xóa bảng, không dùng làm script khởi động ứng dụng.
- Không tự thay đổi dữ liệu trên database thật, kể cả dữ liệu mẫu. Chỉ thực hiện
  thao tác ghi khi người dùng đã cho phép rõ ràng về phạm vi và môi trường.
- Khi chỉ kiểm tra kết nối/cấu trúc, chỉ đọc metadata; không thực hiện INSERT,
  UPDATE, DELETE, DROP, ALTER, CREATE hoặc thao tác thay đổi dữ liệu/cấu trúc.

## 4. Cấu trúc mã nguồn

- Tách routes, controllers, services, database connection và middleware theo
  cấu trúc đơn giản, dễ hiểu với sinh viên.
- Routes định tuyến; controllers nhận request và trả response; services xử lý
  nghiệp vụ; middleware xử lý xác thực, phân quyền và các bước dùng chung.
- Tập trung cấu hình kết nối database ở một nơi. Không đặt truy vấn trong EJS.
- Có thể tách truy vấn thành lớp truy cập dữ liệu khi cần, nhưng tránh tạo nhiều
  tầng trừu tượng, công cụ hoặc kiến trúc phức tạp không cần thiết.
- Dùng truy vấn có tham số; kiểm tra dữ liệu đầu vào ở server.

## 5. Phạm vi thực hiện

- Không viết toàn bộ website trong một lần. Chỉ triển khai nhiệm vụ được giao.
- Không tự thêm tính năng, sửa hàng loạt, đổi cấu trúc hoặc nâng cấp thư viện
  ngoài phạm vi nhiệm vụ.
- Khi người dùng chỉ muốn thống nhất kế hoạch hoặc khảo sát, không sửa file,
  cài đặt hay viết code nếu chưa được yêu cầu.
- Không tự xóa file. Nếu cần xóa hoặc thay thế, giải thích và hỏi trước.

## 6. Bí mật và cấu hình

- Không đưa mật khẩu, secret hoặc giá trị kết nối database vào source code,
  tài liệu công khai, log, báo cáo hoặc Git.
- Dùng dotenv và biến môi trường: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
- Giữ `.env` ngoài Git; file cấu hình mẫu chỉ chứa placeholder không nhạy cảm.
- Không in nội dung `.env`, mật khẩu hoặc đối tượng lỗi/cấu hình có thể lộ bí mật.
- Mật khẩu tài khoản phải được băm; không lưu mật khẩu rõ hoặc hiển thị lại
  mật khẩu đã lưu trong hồ sơ.

## 7. Dữ liệu đáng tin cậy và quyền truy cập

- Không dùng dữ liệu frontend để quyết định giá, tổng tiền, tồn kho, quyền truy
  cập hoặc user_id của người dùng.
- Lấy danh tính từ phiên đăng nhập đã được server xác thực. Kiểm tra vai trò
  và quyền sở hữu địa chỉ, giỏ, đơn hàng trên server cho mỗi thao tác liên quan.
- Lấy giá và tồn kho từ database; tính tiền hàng và phí vận chuyển tại server.
- Không tin các trường ẩn, tham số URL, request body hoặc localStorage để cấp quyền.
- Khi được giao đặt/hủy đơn, dùng transaction và kiểm soát cập nhật đồng thời
  để tránh bán vượt kho hoặc hoàn kho nhiều lần.

## 8. Các quyết định nghiệp vụ đã thống nhất

- MVP: catalog → tài khoản → giỏ → đặt COD → quản lý đơn.
- Bắt buộc đăng nhập ngay khi thêm sản phẩm vào giỏ và khi đặt hàng.
- Đăng nhập bằng số điện thoại + mật khẩu. Hồ sơ MVP gồm họ tên, điện thoại,
  mật khẩu qua chức năng đổi mật khẩu, và địa chỉ.
- Khách được đổi số điện thoại nhưng không được trùng tài khoản khác.
  Chưa triển khai khôi phục mật khẩu bằng OTP trong MVP.
- Sản phẩm có biến thể mặc định; hiển thị giá “từ” khi có nhiều mức giá.
- Trừ kho khi đặt hàng thành công. Khách chỉ được hủy đơn chờ xác nhận.
- Đơn vẫn chờ xác nhận sau 72 giờ từ lúc tạo sẽ tự hủy; hoàn kho đúng một lần
  cho mỗi lần hủy hợp lệ. Chỉ xây cơ chế này khi được giao nhiệm vụ tương ứng.
- Tiền hàng từ 300.000đ được miễn phí vận chuyển; dưới mức đó thu 30.000đ.
- COD là phương thức thanh toán MVP. Chuyển khoản xác nhận thủ công xem xét sau.
- Khách nhập địa chỉ tự do. Cách xử lý cột `district` còn chưa chốt: hỏi trước
  khi triển khai checkout, không tự bỏ cột hoặc đặt dữ liệu giả để vượt ràng buộc.
- Giữ ảnh BLOB giai đoạn đầu.
- Admin quản lý sản phẩm, biến thể, tồn kho và đơn hàng. Phạm vi sản phẩm gồm
  thêm, sửa, ẩn hoặc xóa theo chính sách được duyệt.
- Không xóa cứng sản phẩm đã có giao dịch; dùng ẩn/ngừng kinh doanh và giữ lịch
  sử đơn. Tài khoản đã có đơn ưu tiên vô hiệu hóa, không xóa dữ liệu giao dịch.
- Schema hiện chưa hỗ trợ đầy đủ ẩn/ngừng kinh doanh và vô hiệu hóa tài khoản;
  đề xuất thay đổi và xin duyệt riêng trước khi triển khai, không tự thêm cột.
- Trả hàng/hoàn tiền nằm ngoài MVP. Đơn đã giao không có thao tác hủy, trả hàng
  hay hoàn tiền trong MVP; chưa bổ sung schema cho các chức năng này.
- Đánh giá phát triển sau MVP; quy tắc đã thống nhất là một lần mỗi sản phẩm
  sau khi giao. Các tính năng bổ sung khác phải có yêu cầu riêng.

## 9. Kiểm tra và báo cáo sau mỗi nhiệm vụ

- Chạy các kiểm tra phù hợp với thay đổi và trong phạm vi được phép. Không chạy
  kiểm thử ghi dữ liệu trên database thật nếu chưa được chấp thuận.
- Không khẳng định kiểm tra thành công nếu chưa chạy hoặc chưa có kết quả.
- Báo rõ: file đã tạo/sửa, thay đổi chính, kiểm tra đã chạy và kết quả, lỗi hoặc
  hạn chế còn tồn tại, cùng cách chạy thử.
- Với thay đổi tài liệu, kiểm tra nội dung và phạm vi file là đủ; không cần
  khởi động ứng dụng hoặc kết nối database.

## 10. Khi nào phải hỏi người dùng

- Hỏi trước nếu yêu cầu chưa rõ hoặc lựa chọn triển khai có thể ảnh hưởng đến
  dữ liệu/cấu trúc database mà chưa được người dùng chấp thuận cụ thể.
- Hỏi trước khi xóa file, thay đổi giao diện ngoài yêu cầu, đổi công nghệ hoặc
  mở rộng phạm vi tính năng.
- Nêu rõ điểm cần quyết định, lý do và tác động. Không tự coi đề xuất là đồng ý.
- Tôn trọng những quyết định đã được người dùng xác nhận; chỉ hỏi lại khi xuất
  hiện mâu thuẫn hoặc tác động mới chưa nằm trong phạm vi đã duyệt.
