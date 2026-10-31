# Kiểm thử và đánh giá chất lượng website bán hàng công nghệ TechZone

Đồ án cuối kỳ môn **Đánh giá và kiểm định chất lượng phần mềm** sử dụng website
TechZone làm đối tượng kiểm thử. Dự án vận dụng kiến thức từ bốn khóa học trong
chương trình Software Testing and Automation của University of Minnesota:
Introduction to Software Testing, Black-box and White-box Testing, Introduction
to Automated Analysis và Web and Mobile Testing with Selenium.

> Phần kế hoạch dưới đây mô tả những việc sẽ thực hiện cho bài tập lớn, không phải
> báo cáo kết quả đã hoàn thành. Các kết quả trong phần tài liệu kỹ thuật phía dưới
> thuộc những lần triển khai trước; cần chạy lại trên phiên bản được chọn để làm
> bằng chứng cho báo cáo cuối kỳ.

## 1. Giới thiệu và mục tiêu

TechZone là website bán hàng công nghệ, xây dựng bằng Node.js, Express, EJS,
JavaScript thuần và MySQL; tên thư mục mã nguồn là `TechShop`. Đồ án tận dụng
website hiện có để khảo sát yêu cầu, thiết kế kiểm thử, thực thi, ghi nhận lỗi và
đánh giá chất lượng phần mềm trong môi trường local.

Mục tiêu của bài tập lớn:

- Kiểm tra mức độ đáp ứng các yêu cầu và quy tắc nghiệp vụ đã thống nhất.
- Áp dụng kiểm thử hộp đen và hộp trắng để xây dựng các trường hợp kiểm thử có căn cứ.
- Tự động hóa kiểm thử đơn vị, tích hợp và một số luồng người dùng quan trọng.
- Phân tích mã nguồn và mô hình nghiệp vụ để tìm các vấn đề khó phát hiện chỉ bằng thao tác giao diện.
- Tổng hợp bằng chứng, đánh giá các lỗi còn tồn tại và đề xuất hướng cải thiện.

## 2. Phạm vi kiểm thử dự kiến

| Nhóm chức năng | Nội dung kiểm thử chính |
| --- | --- |
| Tài khoản | Đăng ký, đăng nhập bằng số điện thoại và mật khẩu, đăng xuất; dữ liệu không hợp lệ và số điện thoại trùng |
| Catalog | Xem danh sách, tìm kiếm, lọc, chi tiết sản phẩm và lựa chọn biến thể |
| Giỏ hàng | Yêu cầu đăng nhập, thêm sản phẩm, cập nhật số lượng, xóa khỏi giỏ; giới hạn tồn kho |
| Đặt hàng COD | Kiểm tra địa chỉ, tính tiền hàng và phí vận chuyển tại server, tạo đơn và trừ kho |
| Đơn hàng khách hàng | Xem lịch sử, chi tiết, kiểm tra quyền sở hữu và hủy đơn chờ xác nhận |
| Quản lý đơn hàng của admin | Kiểm tra phân quyền và các chuyển trạng thái hợp lệ, không hợp lệ |

Phạm vi thực thi sẽ được đối chiếu với yêu cầu giảng viên và phiên bản ứng dụng
chốt cho bài tập lớn. Các phần khác trong mã nguồn như mã giảm giá, chuyển khoản,
đánh giá sản phẩm và quản trị catalog chưa thuộc phạm vi kiểm thử chính của kế
hoạch này. Không phát triển thêm chức năng chỉ để mở rộng số lượng bài kiểm thử.

Đồ án tập trung vào website; kiểm tra trên kích thước màn hình điện thoại không
đồng nghĩa với kiểm thử ứng dụng mobile native. Kiểm thử tải lớn, cổng thanh toán
thực tế, triển khai hosting và các chức năng ngoài phạm vi trên chưa nằm trong kế hoạch.

## 3. Vận dụng kiến thức từ bốn khóa học

Đã có [bài thực hành đầu tiên của khóa 1](docs/COURSE_1_INTRODUCTION_TO_SOFTWARE_TESTING.md)
với giải thích khái niệm, 10 test case, mã test riêng và báo cáo thực thi trên dữ
liệu giả lập. Chạy bằng `node --test tests/course1.test.js`; đây chưa phải toàn
bộ phạm vi kiểm thử dự kiến bên dưới.

| Khóa học | Công việc dự kiến | Bằng chứng cần thu thập |
| --- | --- | --- |
| Introduction to Software Testing | Xây dựng kế hoạch; xác định test oracle, mức kiểm thử, điều kiện đầu vào và kết quả mong đợi; thực hiện kiểm thử đơn vị và tích hợp | Kế hoạch kiểm thử, bộ test case, nhật ký thực thi |
| Black-box and White-box Testing | Áp dụng phân vùng tương đương, giá trị biên, bảng quyết định và chuyển trạng thái; thiết kế test theo nhánh xử lý trong mã nguồn | Bảng thiết kế dữ liệu, test case, báo cáo độ bao phủ câu lệnh và nhánh |
| Introduction to Automated Analysis | Phân tích tĩnh mã JavaScript; mô tả điều kiện trước/sau và bất biến của đặt/hủy đơn; xây dựng mô hình trạng thái đơn hàng để kiểm tra các chuyển trạng thái | Báo cáo phân tích, mô hình, thuộc tính cần kiểm chứng và các vi phạm phát hiện được |
| Web and Mobile Testing with Selenium | Tự động hóa các luồng chính trên trình duyệt, sử dụng locator ổn định và chờ theo điều kiện; kiểm tra kết quả sau thao tác | Mã kiểm thử Selenium, kết quả chạy, ảnh minh chứng khi có lỗi |

Phân tích tĩnh bằng công cụ lint chỉ là một phần của phân tích tự động, không
thay thế kiểm chứng hình thức. Công cụ kiểm tra mô hình và yêu cầu áp dụng cụ thể
sẽ được chốt theo tiêu chí môn học; chỉ ghi nhận đã kiểm chứng khi có mô hình,
thuộc tính và kết quả thực thi tương ứng.

## 4. Công nghệ và công cụ

| Thành phần | Hiện trạng hoặc kế hoạch |
| --- | --- |
| Ứng dụng | Giữ Node.js, Express, EJS, JavaScript và MySQL hiện có |
| Bộ test hiện tại | Dùng `node:test`, chạy qua `npm test`; có các bộ giả lập và script kiểm tra MySQL riêng |
| Jest | Dự kiến bổ sung cho nhóm kiểm thử đơn vị và đo coverage của bài tập lớn; chưa được cấu hình trong `package.json` tại thời điểm lập kế hoạch |
| Selenium WebDriver | Dự kiến bổ sung cho kiểm thử trình duyệt; có thể viết bằng Java nếu môn học yêu cầu, không cần chuyển website sang Java |
| Phân tích tĩnh | Dự kiến sử dụng ESLint với bộ quy tắc phù hợp JavaScript; chưa cấu hình trong nhiệm vụ viết tài liệu này |
| Quản lý kết quả | Lưu test case, báo cáo lỗi, bảng liên kết yêu cầu với test và minh chứng trong tài liệu dự án |

Sẽ khảo sát các test hiện có trước khi bổ sung để tái sử dụng tình huống phù hợp.
Không chuyển đổi toàn bộ bộ test sang công cụ khác khi chưa cần thiết. Các công
cụ dự kiến ở trên chưa được cài đặt chỉ bằng việc bổ sung README này.

## 5. Các tình huống kiểm thử tiêu biểu

- **Đăng nhập:** thông tin hợp lệ, sai mật khẩu, trường trống và truy cập chức năng yêu cầu đăng nhập khi chưa có phiên.
- **Phí vận chuyển:** tiền hàng 299.999đ, 300.000đ và 300.001đ; lần lượt mong đợi phí 30.000đ, 0đ và 0đ, trong trường hợp không áp dụng mã giảm giá.
- **Số lượng sản phẩm:** giá trị 0, số âm, không phải số nguyên, đúng tồn kho và vượt tồn kho; kiểm tra cả phía server.
- **Quyền sở hữu:** tài khoản A không được xem hoặc thao tác trên đơn hàng, địa chỉ của tài khoản B.
- **Tính tiền:** sửa giá hoặc tổng tiền trong request không làm thay đổi cách server tính tiền từ dữ liệu tin cậy.
- **Hủy đơn:** chỉ cho khách hủy đơn chờ xác nhận; yêu cầu hủy lặp không được hoàn kho nhiều lần.
- **Transaction và đồng thời:** hai yêu cầu mua phần tồn kho cuối không gây bán vượt kho; lỗi giữa chừng không để lại đơn hoặc tồn kho cập nhật dở dang.

Mỗi trường hợp cần ghi: mã test, yêu cầu liên quan, tiền điều kiện, dữ liệu,
các bước, kết quả mong đợi, kết quả thực tế, trạng thái và minh chứng. Kết quả
mong đợi được xác định từ yêu cầu đã chốt, không lấy hành vi hiện tại của ứng
dụng làm mặc định đúng.

## 6. Các bước thực hiện

1. **Khảo sát:** đọc yêu cầu, mã nguồn, schema và các test hiện có; chốt phiên bản, phạm vi và tiêu chí đánh giá.
2. **Lập kế hoạch:** xác định rủi ro, môi trường, dữ liệu, công cụ, cách ghi nhận lỗi và điều kiện kết thúc kiểm thử.
3. **Thiết kế:** xây dựng test case hộp đen, xác định nhánh cần kiểm thử hộp trắng và lập bảng liên kết yêu cầu với test.
4. **Chuẩn bị môi trường:** cấu hình bộ test và database kiểm thử độc lập sau khi được cho phép về phạm vi dữ liệu.
5. **Thực thi:** chạy test đơn vị, tích hợp, Selenium và phân tích tự động; lưu kết quả thực tế, lỗi và minh chứng.
6. **Xử lý lỗi:** phân loại mức độ, xác định nguyên nhân; sửa trong phạm vi được giao, kiểm thử lại và kiểm thử hồi quy.
7. **Tổng hợp:** đánh giá kết quả, trình bày hạn chế, hoàn thiện báo cáo và kịch bản demo cuối kỳ.

## 7. Môi trường và nguyên tắc dữ liệu kiểm thử

- Thực hiện trên môi trường local; dùng dữ liệu giả lập cho các test không cần MySQL.
- Test tạo tài khoản, tạo/hủy đơn, cập nhật tồn kho và các thao tác ghi khác chỉ chạy trên database kiểm thử riêng đã được cho phép.
- Không dùng database website đang sử dụng làm nơi chạy thử các tình huống ghi dữ liệu.
- Không tự nhập dump `database/techshop.sql`: file có lệnh xóa bảng và không phải script khởi động ứng dụng.
- Không thay đổi schema chỉ để test chạy qua; khác biệt giữa SQL và database phải được làm rõ trước khi tiếp tục phần bị ảnh hưởng.
- Không đưa `.env`, mật khẩu, cookie phiên hoặc thông tin cá nhân vào Git, ảnh chụp và báo cáo.
- Giữ giao diện hiện tại và bản đối chiếu `frontend-static/`; lỗi ngoài phạm vi được ghi nhận để xem xét riêng.

## 8. Sản phẩm bàn giao và tiêu chí đánh giá

Sản phẩm dự kiến gồm:

- Kế hoạch kiểm thử và đặc tả phạm vi.
- Bộ test case và bảng liên kết yêu cầu với test case.
- Mã kiểm thử tự động cùng hướng dẫn chạy tái lập.
- Báo cáo thực thi, độ bao phủ và phân tích tự động.
- Danh sách lỗi có mức độ nghiêm trọng, bước tái hiện và minh chứng.
- Báo cáo tổng kết chất lượng và kịch bản demo các tình huống tiêu biểu.

Báo cáo sẽ thống kê số test đạt, không đạt, bị chặn và chưa chạy; độ bao phủ
câu lệnh/nhánh trong phạm vi đo; số lỗi theo mức độ và trạng thái xử lý. Không
đặt trước kết quả đạt hoặc đồng nhất coverage cao với phần mềm không còn lỗi.
Các luồng chính phải có bằng chứng thực thi; các lỗi nghiêm trọng còn mở và
những phần chưa kiểm tra phải được trình bày rõ khi kết luận.

## 9. Hướng dẫn sử dụng tài liệu và chạy kiểm tra hiện có

Hướng dẫn cấu hình và khởi động ứng dụng được giữ trong phần tài liệu kỹ thuật
bên dưới. Để chạy bộ test hiện có không cần MySQL, sau khi đã cài các dependency:

```powershell
npm test
```

Lệnh này chạy `node --test tests/*.test.js`, chưa phải Jest hoặc Selenium.
Không chạy các script khởi tạo, seed hoặc test ghi MySQL khi chưa xác nhận đúng
môi trường kiểm thử và được phép ghi dữ liệu. Lệnh chạy Jest, Selenium và phân
tích tĩnh sẽ được bổ sung khi các công cụ đó được triển khai.

---

## Tài liệu kỹ thuật và lịch sử triển khai hiện có

Phần dưới được giữ lại để tham khảo cách chạy và lịch sử phát triển. Một số mô
tả theo giai đoạn có thể cũ hơn mã nguồn hiện tại; không dùng các số liệu kiểm
thử lịch sử làm kết quả của bài tập lớn khi chưa xác minh lại.

### TechShop — Catalog và tài khoản TechZone

Giai đoạn 3 bổ sung tài khoản trên nền Node.js, Express, EJS và MySQL: đăng ký,
đăng nhập, đăng xuất, hồ sơ, địa chỉ, đổi mật khẩu. Catalog đã có trang chủ,
danh sách, tìm kiếm, lọc, sắp xếp, phân trang, chi tiết/biến thể và ảnh BLOB.
Đã bổ sung Bước B — Giỏ hàng và Bước C — Checkout/đặt COD của Giai đoạn 4.
Đã có Bước D — Lịch sử và chi tiết đơn hàng; chưa có quản trị hoặc đánh giá. Frontend tĩnh, SQL gốc và cấu
hình `.env` hiện có được giữ nguyên.

## Chuẩn bị và cấu hình

Chạy lệnh từ thư mục gốc project, với Node.js 24 và npm đã cài trên máy:

```powershell
npm ci
```

Nếu đã có `.env`, giữ file hiện tại và kiểm tra các tên biến bên dưới. Nếu chưa
có, sao chép `.env.example` thành `.env`, rồi điền thông tin MySQL local của bạn.
Không sao chép đè lên `.env` đang có. Không chia sẻ hoặc commit file `.env`.

| Biến | Ý nghĩa |
| --- | --- |
| `PORT` | Cổng HTTP, mặc định 3000 nếu chưa khai báo |
| `DB_HOST` | Máy chủ MySQL |
| `DB_PORT` | Cổng MySQL |
| `DB_USER` | Tài khoản MySQL |
| `DB_PASSWORD` | Mật khẩu MySQL; được phép để trống nếu tài khoản local thực sự không có mật khẩu |
| `DB_NAME` | Tên database đã tồn tại |

Biến môi trường của tiến trình được ưu tiên hơn `.env`. Ứng dụng không tự tạo
database, chạy SQL, migration hoặc dữ liệu mẫu.

## Chạy thử

```powershell
npm start
```

Server kiểm tra MySQL bằng `SELECT 1` trước khi mở HTTP. Khi thành công, mở
<http://127.0.0.1:3000/> (hoặc cổng PORT bạn chọn) để xem trang chủ catalog.
Kết quả kết nối MySQL nằm trong terminal lúc khởi động. Nếu đang chạy tiến trình
cũ, hãy dừng bằng Ctrl+C và chạy lại để nạp route mới.

Server chỉ lắng nghe tại `127.0.0.1` để demo local. Dừng bằng Ctrl+C. Có thể dùng
`npm run dev` để Node tự khởi động lại khi sửa mã nguồn. Thay đổi `.env` cần
khởi động lại tiến trình.

```powershell
npm run db:check
npm test
npm run catalog:check
npm run account:check
```

- `db:check`: dùng chung pool/cấu hình backend, chỉ SELECT metadata để in bảng,
  cột và khóa ngoại; không đọc dữ liệu khách hàng, không in mật khẩu.
- `test`: kiểm tra query, HTTP/EJS, dữ liệu rỗng, chọn biến thể, ảnh, cache, CSS,
  400/404/500 và không lộ lỗi SQL. Dùng repository/dữ liệu giả lập riêng trong
  bộ test, không cần MySQL và không ghi database.
- `catalog:check`: cần MySQL đang chạy. Chạy chính SQL của repository với các
  CTE chứa dữ liệu giả lập, che tên bảng thật trong phạm vi mỗi SELECT. Kiểm tra
  tính đúng của thống kê, lọc, giá, thứ tự, phân trang, thuộc tính và HTTP. Không
  tạo bảng tạm, không INSERT, không thay đổi dữ liệu/schema. Kết quả này là test
  dữ liệu giả lập trên MySQL, không phải bằng chứng database thật đã có sản phẩm.
- `account:check`: cần MySQL, chỉ đếm dữ liệu, đọc metadata và PREPARE 13 câu SQL
  tài khoản/địa chỉ để kiểm tra cú pháp, tên cột và quyền. Không EXECUTE câu ghi,
  không tạo tài khoản/địa chỉ thử, không thay đổi schema hoặc dữ liệu.
- Khi database thật trống, website hiển thị trạng thái chưa có dữ liệu.
  Không tự nạp fixture hoặc chạy dump để làm trang có sản phẩm.
- Khi triển khai production sau này, đặt `NODE_ENV=production` qua môi trường
  tiến trình. Middleware hiện luôn ẩn message và stack của lỗi gốc, kể cả local.

## Giỏ hàng — Giai đoạn 4, Bước B

Đăng nhập, chọn biến thể trên trang chi tiết và thêm số lượng vào giỏ; mở `/cart`
để sửa số lượng, xóa dòng hoặc xóa toàn bộ giỏ. Mỗi biến thể tối đa 99 và không
vượt kho hiện tại; giá phải lớn hơn 0. Backend đọc giá/kho từ MySQL, bỏ qua
user_id và giá do trình duyệt gửi. Thêm giỏ chưa giữ hoặc trừ kho.

Mọi POST có CSRF và yêu cầu đăng nhập. Thay đổi giỏ dùng transaction khóa theo
người dùng; UNIQUE hiện có bảo vệ cặp user/biến thể. Không sửa schema hoặc `.env`.

**Giới hạn:** bảng giỏ không có giá tham chiếu/thời điểm thêm. Chưa thể cảnh báo
giá thay đổi so với lúc thêm một cách bền vững. Không dùng session làm nguồn
giá; mỗi lần xem đều tính bằng giá hiện tại. Bước C đối chiếu giá từ lúc khách
duyệt checkout, không xác định thay đổi giá từ lúc thêm giỏ.

`npm test` dùng database giả lập, không ghi MySQL thật. Kiểm thử giỏ bằng dữ liệu
thật qua giao diện sẽ ghi `cart_items`; không tự tạo dữ liệu thử. Chi tiết phạm
vi và kết quả: [Báo cáo Bước B](docs/giai-doan-4-buoc-b.md).

## Checkout và đặt COD — Giai đoạn 4, Bước C

Từ giỏ hợp lệ, mở `/checkout`, chọn địa chỉ của bạn và bấm Áp dụng địa chỉ,
kiểm tra tổng tiền, đánh dấu xác nhận rồi đặt COD. Tiền hàng từ 300.000đ miễn
phí giao hàng, dưới ngưỡng thu 30.000đ. Giá/kho/địa chỉ đọc lại trong transaction;
thay đổi so với bản đã duyệt thì phải xác nhận lại. Đơn mới pending/cod/unpaid.

Token phía server chống gửi lặp trong demo local một tiến trình, hết hạn sau
20 phút; không phải khóa chống lặp bền vững qua restart. Mọi câu ghi đơn, chi
tiết, trừ kho và xóa giỏ cùng transaction. Không sửa schema; lưu snapshot sản
phẩm/địa chỉ vào các cột hiện có. Tổng cuối lưu ở orders.total_amount; phí lịch
sử suy ra từ tổng cuối trừ tiền hàng của chi tiết đơn.

`npm test` dùng fixture giả lập, không đặt đơn trên MySQL thật. Đặt qua giao
diện sẽ ghi dữ liệu và trừ kho trên database cấu hình hiện tại. Kiểm thử thực
tế transaction InnoDB cần duyệt database test riêng. Chi tiết file, route,
giới hạn và cách chạy: [Báo cáo Bước C](docs/giai-doan-4-buoc-c.md).

## Lịch sử và chi tiết đơn — Giai đoạn 4, Bước D

Sau đăng nhập, mở `/orders` từ header hoặc menu tài khoản. Lịch sử có 10 đơn mỗi
trang, mới nhất trước; `/orders/:orderId` hiển thị chi tiết của chính người dùng.
ID sai/không tồn tại/thuộc người khác trả cùng 404. Trang đặt hàng thành công
có liên kết đến chi tiết và lịch sử.

Tên/SKU/giá mua và địa chỉ lấy từ snapshot orders/order_items, không phụ thuộc
catalog hoặc địa chỉ hiện tại. Phí lịch sử = tổng thanh toán đã lưu trừ tổng
quantity × unit_price; không áp dụng lại mức phí hiện hành cho đơn cũ. Nếu dữ
liệu chi tiết thiếu/không khớp, báo không xác định phí, không tạo số liệu giả.

Toàn bộ truy vấn mới chỉ SELECT, không sửa schema hay dữ liệu. `npm test` có
test dữ liệu giả lập riêng cho lịch sử/chi tiết; MySQL thật chưa có đơn nên chỉ
kiểm tra được trạng thái rỗng và truy vấn. Chi tiết file, kết quả và cách chạy:
[Báo cáo Bước D](docs/giai-doan-4-buoc-d.md).

## Kiểm thử Giai đoạn 4 — Bước E

`npm test` chạy 47 nhóm với dữ liệu giả lập, gồm luồng HTTP giỏ → checkout →
lịch sử, 12 yêu cầu xác nhận lặp và rollback sau khi ghi chi tiết thứ nhất.
Không đặt đơn/trừ kho trên MySQL thật. Tình huống ngừng bán chưa hỗ trợ vì schema
không có trạng thái; test đồng thời giả lập không thay thế kiểm thử InnoDB.
Đã tạo instance MySQL test riêng theo phê duyệt tiếp theo: 13/13 nhóm kiểm thử
InnoDB thật đạt. Xem [đánh giá 14 tiêu chí và cách chạy môi trường test](docs/nghiem-thu-giai-doan-4.md).

Xem [ma trận 19 tình huống và phương án môi trường test](docs/giai-doan-4-buoc-e.md).

## Dữ liệu mẫu catalog

Đã thêm bộ mẫu vào MySQL local theo yêu cầu người dùng: 6 danh mục, 24 sản phẩm,
48 biến thể. Tên sản phẩm có `(Demo)`, thương hiệu `TechZone Demo`, mô tả ghi rõ
dữ liệu kiểm thử. Ảnh PNG minh họa dùng chung từ `Describe.png` có sẵn trong
project, không phải ảnh riêng của từng mặt hàng. Có sản phẩm hết hàng, biến thể
mặc định, màu sắc, switch, dung lượng và chiều dài; một sản phẩm thiếu ảnh để thử
fallback. Mặc định 10 sản phẩm/trang sẽ có 3 trang.

Script riêng không được gọi từ `npm start` hoặc bộ test:

```powershell
# Xem trước, không kết nối/ghi database:
node scripts/seed-catalog.cjs

# Chỉ chạy khi được phép thêm dữ liệu vào database đang cấu hình:
node scripts/seed-catalog.cjs --apply
```

Script chỉ SELECT/INSERT catalog trong transaction, không sửa schema, không
UPDATE/DELETE dữ liệu đã có. SKU mẫu có tiền tố `TZDEMO-V1-`; chạy lại sẽ bỏ qua
sản phẩm mẫu đã có, không đặt lại giá/kho. Bộ mẫu cũ thiếu SKU hoặc xung đột SKU
sẽ báo lỗi và rollback thay vì ghi đè. Không tạo tài khoản hoặc đơn hàng, nên
khu vực bán chạy vẫn trống khi chưa có đơn `delivered`.

## Tài khoản — Giai đoạn 3

Các trang có thể dùng ngay sau `npm start`:

| Route | Chức năng |
| --- | --- |
| `GET/POST /register` | Đăng ký họ tên, số điện thoại, mật khẩu và xác nhận |
| `GET/POST /login` | Đăng nhập, chuyển về trang tài khoản phù hợp |
| `POST /logout` | Đăng xuất; không có thao tác đăng xuất bằng GET |
| `GET /account` | Hồ sơ của người đang đăng nhập |
| `POST /account/profile` | Sửa họ tên/số điện thoại của chính mình |
| `GET /account/addresses` | Danh sách và form thêm địa chỉ |
| `GET /account/addresses?edit=ID` | Form sửa địa chỉ thuộc tài khoản hiện tại |
| `POST /account/addresses` | Thêm địa chỉ |
| `POST /account/addresses/:addressId/update` | Sửa địa chỉ của mình |
| `POST /account/addresses/:addressId/delete` | Xóa địa chỉ sau xác nhận |
| `POST /account/addresses/:addressId/default` | Chọn địa chỉ mặc định |
| `GET/POST /account/change-password` | Đổi mật khẩu, hủy phiên cũ và đăng nhập lại |

Quy tắc và cách thử:

1. Mở `/register`, nhập thông tin của bạn. Số di động Việt Nam được chuẩn hóa
   về 10 chữ số bắt đầu bằng 03/05/07/08/09; chấp nhận dạng +84/84 và khoảng trắng,
   dấu chấm/gạch nối. Không hỗ trợ email đăng nhập hoặc OTP xác minh.
2. Mật khẩu dài 8–128 ký tự, có chữ cái Latin và chữ số, được băm Argon2id. Đăng
   ký xong chuyển đến đăng nhập, không tự đăng nhập. Vai trò đăng ký luôn là user;
   không chấp nhận user_id/role từ form để quyết định danh tính hoặc quyền.
3. Đăng nhập rồi mở `/account` để đổi họ tên/số điện thoại. Số mới không được
   trùng tài khoản khác, chưa yêu cầu OTP theo phạm vi MVP đã chốt.
4. Mở `/account/addresses`, nhập người nhận, số điện thoại, số nhà/đường,
   Phường/Xã và Tỉnh/Thành phố. Quận/Huyện tùy chọn, lưu chuỗi rỗng khi bỏ trống.
   Địa chỉ đầu tiên tự làm mặc định. Mọi thay đổi mặc định khóa dòng người dùng
   trong transaction; không thêm UNIQUE/trigger. Xóa mặc định sẽ chọn địa chỉ còn
   lại có ID nhỏ nhất. Chỉ chọn địa chỉ khác để chuyển mặc định, không bỏ mặc
   định bằng cách bỏ checkbox khi sửa địa chỉ đang mặc định.
5. Xóa địa chỉ cần checkbox xác nhận và hộp xác nhận ở trình duyệt. Khóa ngoại
   `orders.address_id ON DELETE SET NULL` giữ nguyên bản sao địa chỉ của đơn cũ;
   code không sửa/xóa đơn hàng.
6. Đổi mật khẩu yêu cầu mật khẩu cũ đúng, mật khẩu mới khác và xác nhận khớp.
   Thu hồi các session của người dùng trong store; HMAC phiên bản mật khẩu được
   đối chiếu ở mỗi request để từ chối cả session cũ còn sót do yêu cầu đồng thời.
   Session không lưu mật khẩu hay hash mật khẩu.

Session và bảo vệ form:

- Dùng express-session, cookie `techzone.sid`, HttpOnly, SameSite=Lax, Secure
  tự bật khi kết nối HTTPS. Session hết hạn sau 2 giờ không hoạt động; regenerate
  khi đăng nhập, destroy khi đăng xuất. Trang tài khoản và HTML động không cache.
- **Chỉ demo local:** dùng MemoryStore tường minh. Khởi động lại ứng dụng làm
  mất phiên. Không thêm bảng session. `NODE_ENV=production` bị từ chối khởi động
  cho tới khi có store production được duyệt; không dùng MemoryStore production.
- Không sửa `.env`. Nếu chưa có `SESSION_SECRET`, sinh secret ngẫu nhiên trong
  bộ nhớ khi tạo ứng dụng, không in ra hoặc lưu vào source. Có thể cung cấp biến
  môi trường SESSION_SECRET ít nhất 32 ký tự qua môi trường chạy khi cần.
- CSRF synchronizer token bằng csrf-sync cho tất cả POST, kể cả login/register.
  Form thiếu/sai token trả 403, cần tải lại trang để lấy form hợp lệ.
- express-rate-limit giới hạn đăng nhập: 5 lần thất bại/cặp IP+số điện thoại,
  tối đa 30 lần thất bại/IP trong 15 phút. Đăng ký tối đa 10 yêu cầu/IP/15 phút.
  Có Retry-After khi trả 429; không khóa tài khoản vĩnh viễn, không thêm cột DB.

Kiểm thử tài khoản:

- `npm test`: có 12 nhóm tài khoản chạy với database giả lập riêng trong bộ nhớ,
  đi qua route → controller → service → repository. Bao gồm băm mật khẩu thật,
  CSRF, session fixation, thu hồi các phiên, UNIQUE, giả mạo ID/role, quyền sở hữu
  địa chỉ, lock/rollback mặc định và bản sao đơn hàng giả lập.
- Các test không tạo tài khoản/địa chỉ trong MySQL thật. Bộ test giao diện cũng
  dùng tài khoản giả lập riêng, không hiển thị tài khoản giả trong ứng dụng thật.
- PREPARE thành công không chứng minh đã ghi dữ liệu thực tế. Chưa kiểm thử
  INSERT/UPDATE/DELETE tài khoản và địa chỉ trên MySQL thật vì chưa được phép thêm
  dữ liệu tài khoản thử. Có thể kiểm tra thủ công bằng tài khoản do bạn tự đăng ký
  trên ứng dụng; những thao tác đó sẽ ghi vào MySQL cấu hình hiện tại.

Nguồn thư viện: [express-session](https://expressjs.com/en/resources/middleware/session/),
[node-argon2](https://github.com/ranisalt/node-argon2),
[csrf-sync](https://github.com/Psifi-Solutions/csrf-sync),
[express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration).

## Xử lý lỗi khởi động

- `ECONNREFUSED`: kiểm tra MySQL đang chạy, DB_HOST và DB_PORT.
- `ETIMEDOUT`: kiểm tra địa chỉ, cổng và firewall. Timeout kết nối là 10 giây.
- `ER_ACCESS_DENIED_ERROR`: kiểm tra DB_USER, DB_PASSWORD và quyền đăng nhập.
- `ER_BAD_DB_ERROR`: kiểm tra tên database hiện có; không nhập lại dump để sửa
  lỗi kết nối khi chưa xác nhận phạm vi với người quản lý dữ liệu.
- Thiếu biến/sai định dạng cổng: sửa cấu hình local và khởi động lại.
- Cổng HTTP đang dùng: chọn PORT khác hoặc dừng tiến trình đang dùng cổng.

Nếu MySQL thất bại, server báo lỗi an toàn, đóng pool và thoát với mã 1 thay vì
tiếp tục mở HTTP. Không cần dừng MySQL thật để thử trường hợp này: có thể dùng
biến môi trường trong một tiến trình thử riêng để trỏ đến cổng local không có
dịch vụ, rồi bỏ override đó; giữ nguyên `.env`.

## Cấu trúc mã nguồn

- `src/server.js`: kiểm tra kết nối, mở HTTP và đóng kết nối khi dừng.
- `src/app.js`: cấu hình Express, EJS, public và middleware.
- `src/config/environment.js`: nạp `.env`, kiểm tra cấu hình.
- `src/config/database.js`: pool MySQL tái sử dụng, kiểm tra kết nối, lỗi an toàn.
- `src/routes/`, `src/controllers/`: route/controller các chức năng website.
- `src/repositories/catalog-repository.js`: toàn bộ SELECT cho catalog.
- `src/utils/catalog-query.js`: chuẩn hóa query, allowlist sort, URL và giá.
- `src/middleware/`: 404 và xử lý lỗi tập trung.
- `src/views/catalog/`: trang catalog và các partial tái sử dụng từ frontend.
- `scripts/check-db.cjs`: script kiểm tra cấu trúc đã có, dùng chung pool.
- `public/css/`, `public/images/`, `public/fonts/`: tài nguyên gốc được sao chép
  theo nhu cầu; `catalog.css` bổ sung cho bộ lọc, trạng thái và trang chi tiết.
- `public/js/product-details.js`: gửi GET khi chọn biến thể. Server đọc lại
  giá, kho và ảnh; nút “Xem phiên bản” vẫn dùng được khi tắt JavaScript.
- `tests/`: kiểm thử bằng công cụ có sẵn của Node, cùng fixture tách biệt.

`src/services/account-service.js` xử lý nghiệp vụ tài khoản; repository người
dùng/địa chỉ tách SQL khỏi controller. Cấu hình session và middleware xác thực,
CSRF, giới hạn đăng nhập nằm trong `src/config/`, `src/middleware/`. EJS tài
khoản tái sử dụng header/footer catalog, CSS tài khoản được sao chép nguyên bản
và bổ sung bằng `account-extra.css`. Chỉ `public/` phục vụ tài nguyên tĩnh qua
HTTP; `.env`, source code, SQL và `frontend-static/` không được công khai.

## Route và cách thử catalog

| URL | Nội dung |
| --- | --- |
| `/` | Danh mục, tối đa 10 sản phẩm mới nhất và tối đa 10 sản phẩm bán chạy |
| `/products` | Danh sách, bộ lọc và phân trang |
| `/products/search?q=tai%20nghe` | Tìm theo tên sản phẩm hoặc thương hiệu |
| `/products?category_id=1&min_price=100000&max_price=500000&sort=price_asc&page=1&limit=10` | Kết hợp bộ lọc; category_id phải tồn tại |
| `/products/1` | Chi tiết sản phẩm có ID 1 nếu tồn tại |
| `/products/1?variant=2` | Chọn biến thể 2 nếu thuộc sản phẩm 1 và hợp lệ |
| `/products/1/image` | Ảnh BLOB sản phẩm |
| `/products/1/variants/2/image` | Ảnh BLOB biến thể thuộc đúng sản phẩm |

Các ID trong ví dụ chỉ minh họa URL, không phải dữ liệu được tạo sẵn.

## Quy tắc catalog

- Gợi ý: `created_at DESC, product_id DESC`, giới hạn 10.
- Bán chạy: tổng `order_items.quantity` khi `orders.status = 'delivered'`;
  không tính đơn hủy/chờ/đang giao. Chưa có lượt bán thì hiển thị trạng thái trống.
- Danh sách không tải BLOB. Giá thấp nhất/cao nhất và tổng kho lấy từ biến thể
  hợp lệ. Lọc giá so với **giá thấp nhất**, không so với bất kỳ biến thể nào khác.
  Hai mức giá khác nhau hiển thị “Từ”. Không có biến thể hợp lệ thì không tạo giá 0.
- Biến thể hợp lệ: giá/kho không âm, mỗi thuộc tính của sản phẩm có đúng một
  giá trị, không tham chiếu thuộc tính của sản phẩm khác. Sản phẩm không có
  thuộc tính được dùng biến thể mặc định không gắn giá trị thuộc tính.
- Biến thể hết hàng vẫn hợp lệ; sản phẩm hết hàng vẫn hiển thị. Không tự tạo
  biến thể mặc định nếu database chưa có. Chọn nguyên biến thể tồn tại thay vì
  ghép các giá trị thành tổ hợp mới. Nếu có nhiều SKU trùng tổ hợp thuộc tính,
  vẫn phân biệt bằng tên biến thể và SKU.
- Chi tiết mặc định chọn biến thể còn hàng đầu tiên theo ID; nếu tất cả hết
  hàng thì chọn biến thể đầu tiên. `?variant=` cho phép xem cả biến thể hết hàng.
- Mô tả được escape và hiển thị như văn bản, không thực thi HTML từ database.
- Sort cho phép: `newest`, `price_asc`, `price_desc`, `name`, `bestselling`.
  Sản phẩm chưa có giá nằm cuối khi sắp xếp theo giá. Các sort đều có thứ tự phụ
  theo ID để phân trang ổn định. Limit mặc định 10, tối đa 40. Trang sai định dạng
  quay về 1, trang vượt giới hạn được đưa về trang cuối; không hiển thị trang 1/0.
- Từ khóa được trim/gộp khoảng trắng, tối đa 200 ký tự. `%`, `_`, dấu nháy và
  gạch chéo được tìm như ký tự thật. Từ khóa rỗng tương đương xem danh sách.
  Từ khóa sai kiểu/quá dài trả 400, không trả toàn bộ sản phẩm thay thế.
- Danh mục không tồn tại, giá sai hoặc sort ngoài allowlist trả 400. Sản phẩm
  không tồn tại trả 404. Query luôn có tham số; tên cột sort không lấy từ người dùng.
- Ảnh cho phép JPEG, PNG, WebP, GIF, AVIF, BMP với MIME trong allowlist. Có ETag và
  cache 60 giây. Thiếu ảnh biến thể quay về ảnh sản phẩm; ảnh sản phẩm thiếu/
  MIME không hỗ trợ dùng SVG thông báo thiếu ảnh tại local. ID không tồn tại trả
  404 kèm ảnh placeholder; ID sai định dạng trả 400. Không thực thi SVG từ BLOB.
- Schema chưa có trạng thái ẩn/ngừng kinh doanh nên catalog hiện hiển thị các
  sản phẩm đang tồn tại. Không thêm cột, không có thao tác ghi hoặc quản trị.
- Không hiển thị sao, khuyến mãi, giá gốc hoặc số lượt bán giả. Các nội dung
  marketing/chính sách tĩnh và footer của giao diện gốc được giữ để đối chiếu;
  chúng không đồng nghĩa đã có chức năng trả hàng/hoàn tiền trong MVP.

Project hiện chưa có Git repository. `.gitignore` đã loại `.env`, các biến thể
`.env.*` (trừ `.env.example`), node_modules, log và coverage để chuẩn bị cho Git.

## Giỏ hàng và checkout theo sản phẩm đã chọn

- Header dùng `GET /cart/preview` khi rê chuột trực tiếp lên biểu tượng giỏ hoặc
  focus biểu tượng bằng bàn phím; nhấn biểu tượng vẫn mở `/cart`. Không có nút
  mũi tên riêng. Chỉ trả giỏ của session hiện tại, tối đa 5 dòng
  mới nhất, không tải BLOB; response `no-store`. Chưa đăng nhập trả 401; lỗi tải
  được phân biệt với giỏ trống. Nút Mở giỏ hàng dẫn tới `/cart`.
- `/cart` dùng giao diện bảng trên desktop và card trên mobile. Chọn từng dòng/chọn
  tất cả để xem tổng tiền; chưa chọn thì Mua hàng bị vô hiệu hóa. Tổng tiền hiển thị
  dùng giá server đã render, còn số tiền đơn hàng luôn được backend đọc/tính lại.
- Tăng/giảm hoặc Cập nhật số lượng sử dụng POST hiện có, đọc lại HTML từ server để
  cập nhật giá, thành tiền và tồn kho. Xóa một/nhiều dòng có hộp thoại Xóa/Hủy.
  Xóa nhiều dòng sử dụng tuần tự API xóa từng dòng; nếu lỗi sẽ dừng và báo số dòng
  đã xử lý, không giả định cả nhóm được xóa trong một transaction.
- Checkout nhận `GET /checkout?items=1,2` (ID dòng giỏ, tối đa 200 dòng), kiểm tra
  quyền sở hữu ở preview và trong transaction. Token checkout ràng buộc với các
  dòng đã duyệt; POST không được thay danh sách hoặc giá. Chỉ các dòng đặt thành
  công bị xóa; những dòng chưa chọn được giữ lại. Không có `items` vẫn là luồng
  checkout toàn bộ giỏ để tương thích các liên kết cũ.
- Test không ghi MySQL: `node --test tests/cart.test.js tests/cart-screen.test.js tests/checkout.test.js tests/purchase-flow.test.js`.
- Test InnoDB riêng: `node scripts/check-selected-checkout.cjs --run`, yêu cầu instance
  test riêng đã thiết lập đang chạy; script xác minh đích trước ghi và chỉ dọn fixture
  của chính lần chạy. Không chạy test ghi trên database website.

## Bộ ảnh sản phẩm

- Bằng tài khoản quản trị MySQL, chọn schema dự án trong Workbench và chạy
  `database/add-product-images.sql` một lần. Script chỉ thêm bảng `product_images`;
  không chạy lại `database/techshop.sql` hoặc nhập lại dump. Ảnh đại diện cũ giữ nguyên.
- Tài khoản ứng dụng cần quyền SELECT và INSERT trên bảng mới (và quyền DELETE
  khi xóa sản phẩm theo chính sách hiện có). Không cấp quyền CREATE cho ứng dụng
  chỉ để chạy script này.
- Trang thêm/sửa sản phẩm có một ảnh đại diện và tối đa 9 ảnh bổ sung, định dạng
  PNG/JPEG/JFIF/WebP/GIF/AVIF/BMP, mỗi ảnh tối đa 1 MB. Backend nhận diện định dạng
  theo nội dung và lưu MIME thực tế, chấp nhận ảnh bị đặt sai đuôi hoặc MIME upload.
  Không nhận SVG/HEIC/TIFF; chưa có bộ chuyển đổi cho các định dạng này.
  Giữ Ctrl/Shift khi chọn nhiều file trong cùng
  một lần chọn. Khi sửa, ảnh bổ sung mới được nối tiếp, không thay thế bộ ảnh cũ.
- Nếu tạo mới chỉ chọn ảnh bổ sung, ảnh đầu tiên làm ảnh đại diện. Khi form báo lỗi,
  chọn lại file ảnh trước khi gửi. Trong trang sửa sản phẩm/biến thể, mục Ảnh đã lưu
  có nút xóa từng ảnh và hộp thoại Xóa/Hủy; xóa có hiệu lực ngay và không ảnh hưởng
  giá, kho, biến thể hay lịch sử đơn. Chưa bổ sung thao tác sắp xếp từng ảnh.
- Ảnh bổ sung hiển thị tại trang chi tiết và được phục vụ qua
  `/products/:id/images/:imageId`; truy vấn danh sách chỉ lấy metadata, không lấy BLOB.
- Khi chưa tạo bảng, catalog và chức năng sản phẩm một ảnh vẫn dùng được; thao tác
  lưu ảnh bổ sung báo lỗi và rollback, không lưu sản phẩm dở dang.
- Test an toàn (database giả lập): `node --test tests/admin-products.test.js tests/catalog.test.js`.
- Test tích hợp bộ ảnh: `node scripts/check-product-images.cjs --run`. Chỉ dùng instance
  test riêng đã thiết lập, đang chạy và đã áp dụng cùng bảng `product_images`.
  Script xác minh môi trường trước mọi ghi, kiểm tra InnoDB/HTTP/rollback/thêm ảnh đồng
  thời, rồi chỉ dọn sản phẩm của chính lần chạy; không dùng database website.

## Mã giảm giá

- Schema bổ sung: `database/add-coupons.sql` đã được duyệt và cần chạy một lần bằng
  Workbench. Không chạy lại dump và không chạy lại script nếu bảng/cột đã có.
  Ứng dụng không tự tạo schema; `.env` giữ nguyên.
- Admin mở `/admin/coupons`: tạo/sửa điều kiện, bật/tắt, tìm kiếm, xem hạn mức và
  các đơn đã sử dụng. Mã gồm 3–50 ký tự chữ/số/`_`/`-`, không phân biệt hoa/thường.
  Mã đã tạo không đổi tên; không có xóa cứng. Không được giảm hạn mức dưới lượt đang dùng.
- Khách đăng nhập, chọn sản phẩm từ giỏ rồi mở checkout. Nhập mã → Áp dụng mã;
  có thể gỡ hoặc thay mã. Một đơn dùng tối đa một mã, tính trên tiền hàng đã chọn.
  Nhập mã không giữ hoặc trừ lượt. Session chỉ giữ chuỗi mã, không giữ giá trị giảm.
- Phần trăm làm tròn xuống đến 0,01đ; giảm cố định/phần trăm không vượt tiền hàng.
  Phí vận chuyển dựa trên **tiền hàng trước giảm**: từ 300.000đ miễn phí, dưới đó
  30.000đ. Mã không giảm phí giao hàng. Tổng thanh toán không âm.
- Backend kiểm tra thời gian theo đồng hồ MySQL local (bắt đầu bao gồm, kết thúc
  không bao gồm), kích hoạt, tiền hàng tối thiểu và hạn mức mỗi lần báo giá/đặt hàng.
  Nếu giá/điều kiện thay đổi thì phải xác nhận lại; mã không còn hợp lệ chặn đặt hàng.
- Transaction khóa biến thể rồi mã, trừ lượt có điều kiện và lưu đơn/kho/giỏ cùng lúc.
  Lỗi trước commit rollback toàn bộ. Hủy hợp lệ pending COD/unpaid, gồm tự hủy 72h,
  hoàn lượt đúng một lần cùng transaction hoàn kho. Giới hạn toàn hệ thống, chưa có
  giới hạn mỗi khách. Cơ chế token checkout vẫn chỉ dành cho demo một tiến trình.
- Đơn mới lưu `coupon_id`, `coupon_code`, `discount_amount`, `shipping_fee`.
  Sửa/vô hiệu hóa mã không đổi lịch sử. Đơn cũ có các trường NULL được đọc như trước,
  không backfill hoặc suy đoán mã đã sử dụng. Chi tiết đơn khách/admin có dòng giảm giá.
- Test unit/HTTP với database giả lập:
  `node --test tests/coupons.test.js tests/coupon-checkout.test.js`.
- Test MySQL thật: khởi động instance test riêng đã thiết lập bằng
  `node scripts/test-mysql-instance.cjs --start`, bảo đảm test có cùng schema mã,
  rồi chạy `node scripts/check-coupons.cjs --run`. Script xác minh tên DB, instance,
  tài khoản/quyền test trước khi ghi, tạo fixture riêng, đối chiếu SELECT và chỉ dọn
  fixture của lần chạy. Không dùng database website. Test gọi service/repository,
  không phải kiểm thử trình duyệt xuyên suốt với MySQL.

Các file của phần mã giảm giá:

- Mới: `src/utils/coupon-validation.js`, `src/utils/coupon-pricing.js`,
  `src/repositories/coupon-repository.js`, `src/services/coupon-service.js`,
  `src/controllers/admin-coupon-controller.js`, ba template trong `src/views/admin/coupons/`.
- Tích hợp: `src/app.js`, `src/routes/admin.js`, `src/routes/checkout.js`,
  `src/controllers/checkout-controller.js`, `src/services/checkout-service.js`,
  `src/utils/checkout.js`, `src/repositories/checkout-repository.js`,
  `src/repositories/admin-order-repository.js`, `src/repositories/order-repository.js`,
  `src/services/order-service.js`, `src/views/checkout/index.ejs`,
  `src/views/orders/detail.ejs`, `src/views/admin/orders/detail.ejs`,
  `src/views/admin/partials/start.ejs`, `public/css/cart.css` và README này.
- Test mới: `tests/coupons.test.js`, `tests/coupon-checkout.test.js`,
  `scripts/check-coupons.cjs`. Cập nhật adapter test trong
  `tests/helpers/account-client.cjs`, `tests/helpers/checkout-database.cjs`,
  `tests/helpers/admin-order-database.cjs`; cập nhật số bảng schema test từ cũ
  sang 14 trong `scripts/check-admin-products.cjs`, `scripts/check-purchase-mysql.cjs`.

Kết quả lần triển khai 25/10/2026:

- Hai file test mã: 8/8 đạt (unit, database giả lập, HTTP/session thật).
- Coupon MySQL: 14/14 tình huống đạt, cleanup fixture đạt; gọi service/repository
  trên instance InnoDB riêng và đối chiếu SELECT, không phải HTTP end-to-end coupon.
- Regression mua hàng MySQL: 28/28 đạt, có các bài HTTP thật, concurrency và rollback.
- `npm test`: 125/128 đạt. Ba assertion giao diện có sẵn còn lỗi:
  `tests/admin-categories.test.js` đòi header/checkbox xóa cũ;
  `tests/admin-orders.test.js` đòi dòng “2 đơn hàng phù hợp”;
  `tests/admin-product-delete.test.js` đòi form xóa tại trang sửa.
  Không sửa các giao diện ngoài phạm vi để làm các assertion này vượt qua.
- Trình duyệt với dữ liệu giả lập: form admin/checkout desktop và 390px,
  áp dụng/gỡ mã, tổng tiền sau giảm; không ghi nhận lỗi JavaScript ở lần kiểm tra.
  Header khách mobile vẫn có thanh cuộn ngang ở hàng liên kết trên cùng như trước.
  Không chỉnh phần header ngoài phạm vi mã giảm giá.
- Database website chỉ đọc metadata và đếm mã (0 mã); không tạo mã/đơn thử,
  không đổi `.env` hoặc schema website. Schema đã duyệt chỉ được áp dụng thêm
  vào instance test riêng để chạy tích hợp. Instance test được dừng sau kiểm thử.

## Thanh toán Ngân hàng (chuyển khoản thủ công)

- Checkout → Phương thức thanh toán → Thay Đổi → Ngân hàng → Áp dụng phương thức.
  Lựa chọn được giữ khi đổi địa chỉ hoặc áp dụng/gỡ voucher. Token server ràng buộc
  phương thức đã chọn; chỉ chấp nhận `cod` hoặc `bank`, không nhận trạng thái paid
  hay tổng tiền do trình duyệt tự gửi. Nút Đặt hàng giữ giao diện không checkbox
  của người dùng; form gửi trường confirm mà service hiện có yêu cầu.
- Thông tin nhận tiền do cửa hàng cung cấp nằm ở `src/config/payment.js`.
  Đây là thông tin chuyển khoản công khai, không phải mật khẩu/credentials.
  Sau tạo đơn, nội dung chuyển khoản là `TZ` + mã đơn; số tiền theo tổng đã lưu.
  Trang thành công và chi tiết đơn pending/unpaid hiển thị hướng dẫn chuyển khoản.
- Đơn Ngân hàng tạo với `pending/unpaid`. Admin vào chi tiết đơn, đối soát sao kê,
  xác nhận nhận đủ tiền bằng POST riêng `/admin/orders/:orderId/confirm-bank`.
  Có kiểm tra admin, CSRF, trạng thái, thời hạn và khóa dòng trong transaction.
  Xác nhận nhận tiền không tự đổi trạng thái giao hàng; sau đó admin mới chuyển
  tuần tự confirmed → shipping → delivered. Đơn ngân hàng chưa paid bị chặn giao.
- Đơn pending/unpaid COD hoặc Ngân hàng quá 72 giờ từ lúc tạo được tự hủy,
  hoàn kho/lượt voucher đúng một lần trong transaction. Đơn ngân hàng paid
  không tự hủy và không có thao tác hủy/hoàn tiền trong phạm vi này.
  Admin cần đối soát trong thời hạn; nếu tiền đến sau khi đơn hủy, cần xử lý
  thủ công ngoài ứng dụng, không xác nhận paid hoặc tự hoàn tiền cho đơn đã hủy.
- Không có cổng thanh toán, QR động, webhook, tự kiểm tra số dư hay hoàn tiền.
  Chưa có nhật ký riêng ghi admin nào đối soát vì schema hiện tại không có bảng/cột
  đó. Không thêm schema hoặc cập nhật dữ liệu website khi triển khai.
- File mới: `src/config/payment.js`, `src/views/checkout/bank-details.ejs`,
  `tests/bank-payment.test.js`.
- File tích hợp: routes/controllers/services/repositories checkout và admin-order,
  `src/services/order-service.js`, template checkout/index, checkout/success,
  orders/detail, admin/orders/detail, CSS checkout-screen; adapter test checkout,
  admin-order, tests/admin-orders, tests/checkout-screen và scripts/check-coupons.
- Kiểm tra 25/10/2026: 4 test Ngân hàng đạt (service/repository mock và HTTP/session
  thật với DB giả lập); bộ liên quan checkout/voucher/screen 33/33 đạt.
  `npm test` đạt 132/135, còn 3 assertion giao diện cũ đã ghi ở mục trước.
  `node scripts/check-coupons.cjs --run`: 17/17 đạt trên MySQL InnoDB test riêng,
  gồm 3 tình huống mới Ngân hàng (tạo đơn/đối soát lặp, rollback đối soát,
  tự hủy/hoàn lượt/kho). Đối chiếu bằng SELECT, không phải HTTP end-to-end Ngân hàng.
  Regression mua hàng MySQL `node scripts/check-purchase-mysql.cjs --run`: 28/28 đạt.
  Các fixture được cleanup, không đặt đơn/trừ kho trên DB website.
- Đã kiểm tra trình duyệt desktop/mobile 390px với dữ liệu giả lập: chọn Ngân hàng,
  đúng thông tin tài khoản, tổng tiền và không tràn ngang/không lỗi JavaScript.
