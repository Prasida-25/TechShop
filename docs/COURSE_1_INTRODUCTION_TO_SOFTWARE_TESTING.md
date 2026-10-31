# Khóa 1 — Introduction to Software Testing: bài thực hành TechZone

## 1. Mục tiêu và phạm vi

Áp dụng kiến thức nền tảng kiểm thử vào tính tiền, phí vận chuyển và giỏ hàng
TechZone. Đây là phần thực hành đầu tiên của bài tập lớn, không phải tuyên bố
đã hoàn thành mọi nội dung của khóa học hoặc đã kiểm thử toàn bộ website.

Phạm vi: hàm `quote`, service giỏ hàng và repository giỏ hàng với adapter dữ liệu
trong bộ nhớ. Không kiểm thử giao diện trình duyệt, đăng nhập, thanh toán, tạo đơn
thật hoặc khả năng khóa đồng thời của MySQL trong đợt này.

Code web được giữ nguyên. File thực hành riêng là `tests/course1.test.js`, sử dụng
`node:test` và `node:assert/strict` sẵn có. Đây là cách áp dụng khái niệm unit test
trong hệ JavaScript; không phải bài thực hành JUnit bằng Java. Nếu giảng viên yêu
cầu nộp JUnit, cần bổ sung phần phù hợp với yêu cầu đó.

## 2. Kiến thức và cách giải thích trong báo cáo

| Khái niệm | Ý nghĩa và ví dụ trong bài |
| --- | --- |
| Verification | Kiểm tra phần mềm thực hiện đúng quy tắc đã đặc tả: tiền hàng từ 300.000đ được miễn phí giao hàng |
| Validation | Đánh giá hệ thống có đáp ứng nhu cầu mua hàng thực tế của người dùng; cần thêm kịch bản người dùng và nghiệm thu, chưa được kết luận từ unit test |
| Logical test case | Mô tả một tình huống tổng quát, ví dụ đơn dưới ngưỡng miễn phí phải thu phí |
| Concrete test case | Cụ thể hóa bằng một sản phẩm 200.000đ, số lượng 1, phí 30.000đ, tổng 230.000đ |
| Test fixture | Dữ liệu và môi trường chuẩn bị trước test: sản phẩm còn hàng hoặc giỏ trong bộ nhớ; mỗi test tạo fixture mới |
| Test oracle | Căn cứ phân biệt đúng/sai; dùng giá trị kỳ vọng tính từ quy tắc nghiệp vụ, không gọi chính hàm đang test để sinh kỳ vọng |
| Test script | Mã thực thi các bước chuẩn bị, gọi hàm/service và đối chiếu bằng assertion |
| Fault và failure | Fault là khiếm khuyết trong mã; failure là hành vi quan sát được sai với kỳ vọng. Test thất bại cần điều tra cả code, dữ liệu và oracle trước khi kết luận lỗi web |
| Unit testing | Gọi trực tiếp hàm tính tiền với fixture nhỏ và đối chiếu kết quả; hàm vẫn sử dụng các hàm hỗ trợ thật |
| Integration testing | Ghép service và repository thật với adapter giả lập để kiểm tra tương tác; không chứng minh truy vấn chạy đúng trên MySQL |
| Black-box / white-box | Quy tắc nghiệp vụ cung cấp kỳ vọng hộp đen; đọc mã và coverage giúp thấy phần chưa chạy. Thiết kế hộp trắng sâu sẽ tiếp tục ở khóa 2 |
| Test-last / test-first | Đợt này viết test cho mã đã tồn tại, thuộc test-last; không gọi đây là quy trình TDD |

Các assertion hiện dùng **expected-value oracle** (giá trị kỳ vọng cụ thể) và
đối chiếu trạng thái trước/sau. Oracle heuristic dựa vào dấu hiệu có thể sai;
oracle consistency so sánh tính nhất quán giữa các lần/phiên bản; oracle xác suất
phù hợp kết quả ngẫu nhiên. Không cần ép tất cả loại oracle vào bài tính tiền xác định.

## 3. Cơ sở yêu cầu và fixture

Yêu cầu lấy từ các quy tắc nghiệp vụ project đã thống nhất:

- R01: tiền hàng dưới 300.000đ có phí 30.000đ; từ 300.000đ có phí 0đ.
- R02: tiền hàng bằng tổng giá từng dòng nhân số lượng; tổng thanh toán bằng tiền hàng cộng phí, không áp dụng mã giảm giá trong bài này.
- R03: không báo giá cho giỏ rỗng hoặc số lượng vượt tồn kho.
- R04: thêm cùng biến thể vào giỏ sẽ cộng số lượng; thêm giỏ chưa trừ kho.
- R05: danh tính và giá không được lấy từ các trường do client tự khai báo.
- R06: người dùng không được thao tác giỏ của người khác.

Fixture tính tiền: sản phẩm hợp lệ, tồn kho 10, số lượng mặc định 1; giá dạng
chuỗi thập phân. Fixture tích hợp tái sử dụng `createCartDatabase` trong
`tests/helpers/cart-database.cjs`; biến thể 1 có giá 100.000,01đ. ID 1 và 2 là
danh tính giả lập được truyền vào service, không phải bằng chứng xác thực HTTP.
Không tạo tài khoản, sản phẩm hoặc giỏ trong database thật.

Mã HTTP 409/404 trong test là hợp đồng lỗi hiện có của các hàm/service. Quy tắc
nghiệp vụ xác định cần từ chối; nếu môn học yêu cầu đặc tả API độc lập, cần bổ sung
đặc tả đó trước khi xem mã lỗi là tiêu chí nghiệm thu chính thức.

## 4. Bộ test case và bảng truy vết

Mỗi hàng là một test tự động độc lập. Quy trình chung: tạo fixture mới → gọi
`quote` hoặc `service.change` → đọc kết quả/trạng thái → đối chiếu oracle.

| ID | Yêu cầu / mức | Dữ liệu và bước thực hiện | Kết quả mong đợi |
| --- | --- | --- | --- |
| C1-01 | R01, R02 / unit | Báo giá 1 sản phẩm giá 200.000đ | Tiền hàng 200.000đ, phí 30.000đ, tổng 230.000đ |
| C1-02 | R01, R02 / unit | Báo giá 1 sản phẩm giá 300.000đ | Tiền hàng và tổng 300.000đ, phí 0đ |
| C1-03 | R01, R02 / unit | Báo giá 1 sản phẩm giá 400.000đ | Tiền hàng và tổng 400.000đ, phí 0đ |
| C1-04 | R02 / unit | Báo giá 2 × 100.000đ và 1 × 50.000đ | Tiền hàng 250.000đ, phí 30.000đ, tổng 280.000đ |
| C1-05 | R03 / unit | Gọi báo giá với danh sách trống | Ném lỗi có status 409 |
| C1-06 | R03 / unit | Báo giá số lượng 11 trong khi kho có 10 | Ném lỗi có status 409 |
| C1-07 | R01, R02 / unit | Báo giá 3 × 100.000,01đ | Tiền hàng và tổng 300.000,03đ, phí 0đ |
| C1-08 | R04 / tích hợp giả lập | User 1 thêm biến thể 1 số lượng 2 rồi thêm 3 | Một dòng, tổng số lượng 5; dữ liệu biến thể/tồn kho không đổi |
| C1-09 | R05 / tích hợp giả lập | User 1 thêm 2 sản phẩm nhưng body giả user_id=2, price=1, total=2 | Giỏ user 1 có tổng 200.000,02đ; giỏ user 2 rỗng |
| C1-10 | R06 / tích hợp giả lập | User 1 tạo dòng giỏ; user 2 yêu cầu xóa dòng đó | Bị từ chối status 404; toàn bộ các dòng giỏ giữ nguyên |

C1-07 kiểm tra khả năng tính chính xác dữ liệu giá thập phân mà mã hiện có hỗ
trợ; không yêu cầu cửa hàng phải sử dụng giá có phần lẻ trong thực tế.

## 5. Cách chạy và đọc kết quả

Từ thư mục gốc TechShop, với dependency đã cài:

```powershell
node --test tests/course1.test.js
```

Chạy kèm đo coverage cho hai file được chọn:

```powershell
node --test --experimental-test-coverage --test-coverage-include=src/utils/checkout.js --test-coverage-include=src/services/cart-service.js tests/course1.test.js
```

Không cần mở website, khởi động MySQL hoặc chạy script seed. Lệnh `npm test` hiện
cũng tự nhận file mới vì dùng mẫu `tests/*.test.js`, nhưng kết quả toàn bộ bộ test
không nằm trong báo cáo thực thi lần này.

Khi trình bày một test, giải thích theo ba bước:

1. **Arrange:** chuẩn bị sản phẩm giá 200.000đ và tồn kho hợp lệ.
2. **Act:** gọi `quote`.
3. **Assert:** kiểm tra phí 30.000đ và tổng 230.000đ; các giá trị này lấy từ yêu cầu R01/R02.

Nếu test fail, lưu tên test, expected/actual và bước tái hiện; kiểm tra nguyên
nhân trước khi sửa. Không đổi kỳ vọng chỉ để làm test pass.

## 6. Báo cáo thực thi ngày 28/10/2026

Môi trường: Windows, Node.js v24.16.0. Đã chạy lệnh coverage ở trên, mã thoát 0.

| Chỉ số | Kết quả |
| --- | --- |
| Số test | 10 (7 unit, 3 tích hợp giả lập) |
| Đạt | 10 — C1-01 đến C1-10 |
| Không đạt / bị hủy / bỏ qua | 0 / 0 / 0 |
| Thời gian runner ghi nhận | Khoảng 1,69 giây; có thể thay đổi giữa các lần chạy |
| Lỗi mới phát hiện trong phạm vi này | Không có qua 10 trường hợp đã chạy |

| File được đo | Line coverage | Branch coverage | Function coverage |
| --- | --- | --- | --- |
| `src/utils/checkout.js` | 50,88% | 78,57% | 42,86% |
| `src/services/cart-service.js` | 100,00% | 65,00% | 100,00% |
| Tổng hai file | 75,44% | 68,52% | 71,43% |

Đây là số liệu V8/Node báo cho hai file, **không phải coverage toàn project**.
Line coverage không đồng nghĩa statement coverage, đặc biệt khi một dòng chứa
nhiều câu lệnh. Dù `cart-service.js` đạt 100% dòng, vẫn còn nhánh chưa thực thi.
Các hàm xử lý địa chỉ, fingerprint và lựa chọn dòng trong `checkout.js` chưa
thuộc bộ test này. Coverage không chứng minh mọi assertion đủ mạnh hoặc không còn lỗi.

Chưa đo mutation score, chưa thực hiện mutation testing, chưa có bằng chứng
MySQL thực, Selenium hoặc nghiệm thu người dùng trong lần này. Các test tích hợp
giả lập không đánh giá isolation, khóa dữ liệu hoặc transaction MySQL thực tế.

## 7. Mẫu ghi nhận lỗi cho các lần tiếp theo

| Trường | Nội dung cần điền |
| --- | --- |
| Mã lỗi / test liên quan | BUG-xxx / C1-xx |
| Phiên bản và môi trường | Phiên bản mã nguồn, Node, trình duyệt nếu có |
| Tiền điều kiện và dữ liệu | Fixture hoặc trạng thái cần chuẩn bị; không đưa secret |
| Bước tái hiện | Các bước đủ rõ để người khác thực hiện lại |
| Mong đợi / thực tế | Ghi riêng hai kết quả |
| Mức độ / ưu tiên | Đánh giá theo ảnh hưởng và thứ tự cần xử lý |
| Minh chứng / trạng thái | Log an toàn, ảnh nếu có; mới, đang xử lý, đã sửa, kiểm tra lại |

Không tạo lỗi giả để điền báo cáo. Chỉ ghi nhận lỗi quan sát được, kèm bằng chứng.

## 8. Nội dung cần tiếp tục trước khi kết luận toàn bộ khóa 1

- Bổ sung kiểm thử HTTP cho yêu cầu đăng nhập và luồng người dùng; phân biệt với service nhận sẵn user ID.
- Đánh giá độ mạnh của bộ test bằng một thí nghiệm mutation có kiểm soát trên bản sao biệt lập, không sửa mã web đang sử dụng.
- Làm rõ tiêu chí giảng viên về JUnit và statement coverage nếu bắt buộc.
- Thực hiện validation với kịch bản nghiệm thu người dùng sau khi chốt môi trường dữ liệu kiểm thử.

Kết luận đợt đầu: các chức năng trong phạm vi đã đáp ứng 10 kỳ vọng được kiểm
tra. Chưa đủ bằng chứng kết luận toàn bộ website đạt chất lượng hoặc không có lỗi.
