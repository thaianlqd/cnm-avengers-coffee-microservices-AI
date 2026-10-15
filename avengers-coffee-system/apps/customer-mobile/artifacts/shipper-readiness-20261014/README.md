# Bật nhận đơn và xem đơn mới — 14/10/2026

Đã sửa hai lỗi trong ảnh, không commit/push.

## Nguyên nhân đã xác nhận

Đọc runtime local cho thấy tài khoản trong ảnh vẫn `INACTIVE`, có 1 đơn mới và chưa có chuyến giao được nhận. Đơn trong ảnh có trong pool; GET đường dẫn chi tiết delivery cũ trả **404**. Không nhận đơn thật hoặc sửa trạng thái thật để thử.

- Home chờ quyền GPS **trước** khi gọi PATCH trạng thái. Khi trình duyệt chặn vị trí, công tắc không thể bật. `Alert.alert` trên web còn làm thông báo lỗi không hiện rõ.
- Bấm thẻ đơn mới truyền **mã đơn hàng** vào màn chi tiết **chuyến giao**. Đơn chưa nhận chưa có delivery record nên 404 là đúng với API đó.

## Thay đổi

- Công tắc lưu `ACTIVE`/`INACTIVE` lên server độc lập với GPS. Sau khi bật thành công mới xin quyền vị trí. GPS bị chặn vẫn có thể sẵn sàng nhận đơn; có cảnh báo và nút cấp lại quyền, không tự tạo tọa độ.
- Nút nhận đơn vẫn khóa khi ngoại tuyến hoặc đang gửi request. Chỉ mở sau khi server xác nhận trạng thái sẵn sàng. Lưu thất bại giữ ngoại tuyến và hiện lỗi trên màn hình.
- Response profile bắt đầu trước khi đổi trạng thái không được ghi đè kết quả mới hoặc session đã lưu.
- Thẻ đơn chưa nhận mở **Chi tiết đơn mới**, đọc pool được server giới hạn theo shipper/chi nhánh. Hiển thị cửa hàng, địa chỉ giao, món, COD và phí giao, có nút nhận. Không gọi API delivery trước khi nhận, không tạo delivery chỉ để xem.
- Sau POST nhận thành công, chuyển sang ID delivery thật mà server trả. Cả nhận trực tiếp từ danh sách và nhận trong màn xem trước cùng hành vi này.
- Click nút nhận/checkbox không kích hoạt thêm click thẻ cha. Các lỗi nhận đơn và ghép đơn hiển thị inline; đơn bị người khác nhận có thông báo rõ.
- Backend vẫn yêu cầu `ACTIVE` trước manager assignment/self-accept/batch; không bỏ điều kiện sẵn sàng. Không thay trạng thái, phân công hoặc lifecycle của đơn thật để test.

## Kiểm tra

- **5 kịch bản UI PASS** trên bản build với API giả lập: GPS denied + profile cũ + bật/tắt + xem trước rồi nhận; nhận trực tiếp; PATCH trạng thái lỗi; conflict nhận đơn ở Home; conflict ở màn xem trước.
- Xác nhận offline khóa nút, GPS denied không gửi tọa độ, request nhận chỉ gửi một lần, không gọi `/deliveries/<order-id>` cho đơn chưa nhận, sau nhận mở `/deliveries/<delivery-id>`.
- **7 tests Shipper PASS**, **8 tests backend readiness PASS**; Expo export Web/Android/iOS PASS, `git diff --check` PASS.
- Chưa QA native trên thiết bị thật. Không dùng API key của người dùng, không gọi provider Maps/AI/payment hoặc tạo/nhận đơn thật trong các bài kiểm tra.

[Xem trước đơn mới](available-preview.png), [chi tiết sau nhận](accepted-detail.png), [UI checks](checks.json), [runtime chỉ đọc](runtime-read-only.json), [source SHA256](source-sha256.json).

Script: `scripts/verification/shipper-readiness-ui.mjs`; export với `EXPO_NO_DOTENV=1` và key fixture. Gán `SHIPPER_EXPORT`, `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, `UI_ARTIFACTS` rồi chạy script.

Reload trang/app shipper để nhận code mới rồi bật **Sẵn sàng nhận đơn**. GPS đã bị Chrome chặn cần mở quyền Vị trí cạnh thanh địa chỉ và chọn Cho phép để theo dõi vị trí trực tiếp; trạng thái sẵn sàng không phụ thuộc bước này.
