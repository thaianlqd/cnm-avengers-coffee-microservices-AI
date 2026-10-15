# Header có ảnh, đơn hàng và bản đồ shipper — 15/10/2026

Bản phối màu tiếp theo: [nền trắng và điểm nhấn đỏ](../shipper-white-red-20261015/README.md).

Cập nhật tiếp theo theo ảnh Viettel Post người dùng gửi: header hình ảnh lớn và cách sắp xếp tìm kiếm/cửa hàng/số liệu/tiện ích, đưa bản đồ vào chi tiết đơn. **Phạm vi là shipper mobile và bản Expo Web của app shipper. Không đổi layout customer hoặc web quản trị.**

## Bố cục đã triển khai

- Công việc: thanh tên tài xế/công tắc nhận đơn cố định; ảnh header riêng Avengers Coffee; tìm kiếm nổi trên mép ảnh; thẻ chi nhánh và quyền GPS; ba thẻ chỉ số; bốn tiện ích; danh sách đơn. Ảnh cuộn cùng nội dung, công tắc vẫn thấy khi cuộn. Nền kem ấm, màu đỏ Coffee và chữ dễ đọc.
- Đơn chưa nhận: mã/trạng thái, điểm lấy/giao, bản đồ thu nhỏ, các món và COD. Phí giao và nút nhận cố định phía dưới. Không dùng delivery ID trước khi nhận.
- Đơn đã nhận: cùng khối điểm lấy/giao/bản đồ; mở hành trình từ nút Mở rộng. Giữ nguyên xác nhận lấy món, giao hàng và các nghiệp vụ hiện có.
- Bản đồ lớn Expo Web: gộp trạng thái, thời gian/khoảng cách đường bộ, tiến độ và nút điều hướng trong một bảng dưới cùng; không còn hai bảng chồng nhau. Preview và bản đồ lớn dùng renderer/provider hiện có; preview native dùng native map + retina tiles hiện có.
- Không đặt tọa độ mẫu cho đơn thiếu dữ liệu. Chỉ hiện những điểm có tọa độ hợp lệ. Chưa có điểm nào thì hiện địa chỉ và thông báo. Chỉ vẽ đường theo geometry provider, không giả đường thẳng thành đường đi.

## Kiểm tra

- Expo export **web/iOS/Android PASS**; [log export](export.log).
- **10 unit tests PASS**, gồm kiểm tra điểm tọa độ thiếu/sai/phạm vi; [log](unit-tests.log).
- QA trên build thật: ảnh header tải và vừa chiều ngang 320/390/600px, không tràn ngang; readiness còn thấy khi cuộn; map preview ở đơn mới và đã nhận; bản đồ vector toàn màn hình, mở rộng bảng chuyến; Ví/Lịch sử/Hồ sơ và phân trang. [Kết quả](layout-checks.json).
- **5 regression nhận đơn PASS**: GPS bị chặn + profile cũ; nhận trực tiếp không kích hoạt nhầm thẻ cha; lưu trạng thái thất bại; xung đột nhận ở danh sách và xem trước. [Kết quả](readiness-checks.json).
- ESLint bằng config Expo hiện có: 0 errors ở các component mới và các file preview/map web được kiểm tra; vẫn có warnings dependency hooks trong map. Shipper chưa có config lint toàn app riêng; không báo lint toàn dự án sạch.
- Toàn bộ HTTP API, provider bản đồ và WebSocket trong browser QA là fixture. Ảnh bản đồ kiểm tra dùng geometry đường/công viên/nước giả lập để chạy renderer thật offline, không thể hiện độ chi tiết của dữ liệu provider production. Không dùng API key người dùng, không nhận hoặc sửa đơn thật. Chưa chạy thiết bị/emulator iOS/Android.

## Ảnh giao diện với dữ liệu giả

- [Trang đầu 390px](shipper-work-390.png), [320px](shipper-work-320.png), [600px](shipper-work-600.png)
- [Đơn mới có bản đồ](shipper-order-preview.png), [Đơn đã nhận](shipper-assigned-detail.png)
- [Bản đồ lớn](shipper-full-map.png), [mở bảng chi tiết](shipper-full-map-expanded.png)
- [Ví & COD](shipper-wallet.png), [Lịch sử](shipper-history.png), [Hồ sơ](shipper-profile.png)

## Ảnh header

Tạo bằng **built-in imagegen**, không gọi CLI hoặc API key người dùng. Asset được chép vào repository: [`apps/shipper-mobile/assets/branding/coffee-delivery-header-v2.png`](../../../shipper-mobile/assets/branding/coffee-delivery-header-v2.png). Chỉ là hình nền; toàn bộ chữ, số liệu và nút là UI thật. [Prompt đầy đủ](header-prompt.txt).

Reload Expo Web/trình duyệt để xem source mới. Không commit/push.
