# Chọn món trong chat và inbox nhân sự — 14/10/2026

Cập nhật màu: [shipper nền trắng và điểm nhấn đỏ](../shipper-white-red-20261015/README.md).

Cập nhật tiếp theo: [header có ảnh, đơn hàng có bản đồ và layout shipper theo ảnh tham khảo](../shipper-reference-layout-20261015/README.md).

Cập nhật 15/10: [layout chỉ shipper mobile và banner tự chuyển 10 giây trên web/mobile](../shipper-layout-autobanner-20261015/README.md).

Cập nhật nhận đơn shipper: [tách quyền GPS khỏi readiness, sửa xem trước đơn mới và lỗi 404](../shipper-readiness-20261014/README.md).

Cập nhật tiếp theo: [banner toàn ảnh, bản đồ vector và sửa đăng nhập/quản lý shipper](../shipper-banner-vector-20261014/README.md).

Web và mobile dùng chung mô hình lựa chọn món và mô hình hội thoại nhân sự. Bản cập nhật này tiếp nối phần đồng bộ Agent/mobile, màu nền customer, Leaflet và banner shipper trong [báo cáo trước](../chat-parity-20261014/README.md).

## Cách dùng

- Trong chat customer: bấm **+** trên các món muốn chọn, bấm **Tiếp tục**, chọn size/đá/độ ngọt/sữa/topping phù hợp từng món, chỉnh số lượng rồi **Thêm … món vào giỏ**. Bấm lại dấu chọn để bỏ món khỏi danh sách trước khi gửi.
- Các trường bắt buộc phải được chọn. Các mục tùy chọn có thể bỏ tick; topping chọn nhiều, không tự thêm topping. Nút **Theo mặc định** là lựa chọn rõ ràng của khách để dùng mặc định của Menu.
- Staff/manager: mở **Tin nhắn khách hàng** trong menu hoặc nút chat. Màn hình lớn có danh sách bên trái và hội thoại bên phải; điện thoại chuyển giữa danh sách và chi tiết. Tìm kiếm, lọc chưa đọc/đang mở, trả lời nhanh, bản nháp từng khách và số chưa đọc được giữ lại.
- Reload web. Khởi động lại Expo bằng `npx expo start -c` trong cả `apps/customer-mobile` và `apps/admin-mobile` để nạp cấu hình Metro theo dõi các helper dùng chung.

## Những lỗi đã sửa

Bảng thực đơn bị áp dụng `display:grid` từ CSS cho thành phần cũ, làm header và hàng dữ liệu sử dụng bố cục khác nhau. Table thật được giới hạn CSS riêng, chia cùng sáu cột và cuộn ngang bên trong trên màn hình hẹp.

Inbox mới có không gian hội thoại lớn, avatar, thời gian, bong bóng tin nhắn, ô soạn và nút gửi cố định. Không trộn tin của khách khác khi đổi hội thoại; phản hồi chậm không ghi đè khách đang chọn; gửi lỗi giữ bản nháp; socket echo không nhân đôi tin. Tin người thật chứa câu hỏi menu vẫn được hiển thị. Trả lời nhanh chỉ điền bản nháp.

Các nút lựa chọn customer gửi một `ui_action` có snapshot Menu tới Agent hiện tại. Server xác thực sản phẩm, số lượng, nhóm tùy chọn và snapshot trước khi gọi commerce tools hiện có. Luồng bấm chọn/tick bỏ qua LLM; giá và giỏ vẫn do server xác nhận. Retry gắn với cả nội dung action để không dùng lại phản hồi cho một bộ tùy chọn khác. Giới hạn 16 món mỗi lượt; normal model command limit giữ nguyên. Thêm vào giỏ không tự đặt đơn hoặc thanh toán.

## Kiểm chứng

- **100 tests frontend/mobile PASS**: 81 customer/common/mobile và 19 admin/unit/SSR.
- **215 tests backend PASS**, chạy Docker `--network none`, provider và commerce dependencies giả: batch chọn món, tùy chọn/defaults, grouped references, malformed/stale/forged actions, durable replay và các luồng commerce hiện có.
- Vite build customer/admin và Expo export **web/iOS/Android** của hai mobile app PASS; ESLint các file inbox admin-mobile PASS.
- **7 tình huống UI PASS** trên bản build thật, dùng Playwright: customer web/Expo web; staff và manager web/Expo web; menu admin. Kiểm tra kích thước customer 320/390/768/1440, sáu cột menu khớp vị trí dưới 1px, hai lần bấm + không gửi API cho tới Tiếp tục, bỏ tick tùy chọn, gửi hai món cùng lượt và không checkout.
- Tất cả HTTP API/provider và WebSocket trong QA đều được intercept. Không dùng API key hoặc gửi tin cho khách thật. iOS/Android đã build bundle; chưa chạy thiết bị/emulator.
- AI service local đã build/recreate riêng; logs khởi động hoàn tất, 0 ERROR/traceback trong kiểm tra cuối. Không commit/push do agent thực hiện.

[Kết quả máy đọc](checks.json). Script QA: `scripts/verification/customer-staff-ui.mjs` tại root repository. Script cần đường dẫn bốn export, Playwright và Chromium qua biến môi trường; tự tạo server loopback và đóng khi kết thúc.

## Ảnh kiểm tra (dữ liệu giả)

- [Thực đơn căn cột](admin-menu-aligned.png)
- [Web customer chọn nhiều món](customer_web-selection.png), [tick tùy chọn](customer_web-options.png)
- [Mobile customer chọn nhiều món](customer_mobile-selection.png), [tick tùy chọn](customer_mobile-options.png)
- [Web inbox rộng](staff_web-inbox-1440.png), [điện thoại](staff_web-inbox-390.png)
- [Mobile inbox rộng](staff_mobile-inbox-1440.png), [điện thoại](staff_mobile-inbox-390.png)
