# Số lượng, bản đồ và phân trang 5 vai trò — 14/10/2026

## Kết quả

Chat customer web/mobile có nút **− / + số lượng từng món ngay trong danh sách đã chọn**, trước bước Tiếp tục. Tại bước tùy chọn vẫn chỉnh lại được số lượng. Mỗi món giữ số lượng riêng, giới hạn 1–99; gửi cả nhóm một lượt và server xác nhận giá/giỏ. Kiểm tra UI chọn 2/2 phần rồi chỉnh thành 3/2 phần, xác nhận đúng cả hai payload gửi server.

Bản đồ customer web/mobile và shipper có marker theo vai trò, tên điểm, đường đi, nút định tâm, thẻ trạng thái/thời gian/khoảng cách và tiến trình ở đáy. Shipper có vùng bản đồ lớn, chi tiết thu gọn/mở rộng và nút đến điểm tiếp theo cố định. Không vẽ điểm giao giả khi thiếu tọa độ. Thời gian/khoảng cách chỉ hiển thị từ kết quả route hợp lệ; khi đã lấy món, tuyến đi từ vị trí tài xế đến khách thay vì cộng lại chặng đến quán. Các điểm giao ghép giữ thứ tự server truyền vào. Kéo bản đồ customer tắt tự theo dõi; định tâm bật lại. Sửa lỗi receiver của timer theo dõi đơn gây `Illegal invocation` trên Expo web.

Server chặn **chỉ định, tự nhận và nhận nhóm đơn mới** khi tài xế chưa ở trạng thái ACTIVE. GPS không tự chuyển tài xế sang ACTIVE. Tạo/reset tài khoản không tự bật sẵn sàng. Danh sách chỉ định của manager chỉ cho chọn tài xế sẵn sàng; staff cũng lọc ACTIVE. Tài xế ngoại tuyến vẫn có thể tiếp tục đơn đã nhận. Các kiểm tra nhận đơn chạy với repositories giả; không phân công đơn thật.

## Phân trang và rà soát tab

Đã thêm phân trang cho **33 danh sách/tiểu danh sách**; xem [audit theo source](pagination-audit.json). Mặc định 10 dòng/trang, chọn trang đầu/cuối thông qua số trang, các trang giữa dùng dấu “…”. Đổi bộ lọc quay về trang đầu; dữ liệu giảm thì tự giới hạn trang hợp lệ. Bảng dùng footer đúng `tr/td` và colSpan đúng số cột. Các thống kê tiếp tục tính trên tập dữ liệu đầy đủ đã tải.

| Vai trò | Tab đã mở kiểm tra | Những danh sách được bổ sung/sửa |
|---|---:|---|
| Admin | 14 | Tài xế, KPI tài xế, chi trả, COD, đánh giá chi nhánh, kiosk vệ tinh/khu vực, nhân sự và giao combo trong chi tiết kiosk; sửa thanh số trang menu/khảo sát |
| Quản lý | 18 | Giao hàng, tài xế, COD, ngoại lệ, kiosk vệ tinh, bàn/đơn tại bàn; sửa thanh số trang đánh giá, nhân viên, menu, khảo sát và chốt ca |
| Nhân viên | 11 | Giao hàng, COD, đội tài xế, bàn/đơn tại bàn; các danh sách menu/chốt ca dùng thanh số trang gọn |
| Đối tác kiosk | 13 | Nhân sự, ca đã chốt, đơn bán, combo, lịch sử nhập, giao dịch ví, công nợ, royalty, yêu cầu ca và đánh giá; menu dùng số trang gọn |
| Kế toán | 3 | Phiếu thu/chi; các danh sách nhượng quyền đã có phân trang được giữ |

Tổng cộng **59 tab** đã mở bằng phiên và HTTP giả, không lỗi render. Lịch tuần, form cấu hình, giỏ đang soạn, số liệu tổng quan và hội thoại realtime giữ bố cục theo nghiệp vụ. Phân trang thao tác trên dữ liệu do các API hiện có trả về; không mở rộng phạm vi quyền hoặc giới hạn truy vấn hiện tại.

## Kiểm chứng

- **327 tests PASS**: 86 customer/common/mobile, 21 admin/unit/SSR, 220 Order. Lượt Order đầu bị sandbox chặn bind loopback ở 5 test HTTP; chạy lại cùng assertions với quyền bind, 21 suites PASS.
- Vite customer/admin PASS; Expo customer/shipper export **web/iOS/Android** PASS; Order Nest/Docker build PASS.
- **15 kịch bản UI PASS**: 7 regression chọn số lượng/inbox/menu và 8 bản đồ/phân trang vai trò. Kiểm tra thêm 200 đánh giá, trang 34 có dòng 199–200, thanh số trang vừa điện thoại.
- Tất cả API/provider/tile/route/WebSocket trong QA được intercept, dùng key `fixture-only`. Không dùng API key của người dùng để test, không gửi tin nhắn/đơn/thanh toán thật.
- Order service Docker Compose local đã được build/recreate riêng. Khởi động hoàn tất, logs kiểm tra cuối **0 ERROR**. Không chạy schema migration, seed/reset DB hoặc cập nhật Kubernetes capacity setup. Agent không commit/push.
- Native iOS/Android đã compile bundle; chưa chạy thiết bị/emulator. Nền bản đồ/tuyến đường trong ảnh là fixture, không phải kiểm chứng chất lượng provider ngoài thực tế.

[Kết quả tổng hợp](checks.json), [QA map và tab](ui-checks.json). Script tại root: `scripts/verification/maps-actors-ui.mjs` và `scripts/verification/customer-staff-ui.mjs`.

## Xem thay đổi

Refresh web. Khởi động lại Expo customer và shipper với `npx expo start -c` vì có cấu hình Metro mới cho UI dùng chung. Bật/tắt **Sẵn sàng nhận đơn** để cập nhật trạng thái chính thức của tài xế; staff/manager tải lại danh sách tài xế khi cần chỉ định.

- [Chọn số lượng web](customer_web-selection.png), [mobile](customer_mobile-selection.png)
- [Tùy chọn và số lượng web](customer_web-options.png), [mobile](customer_mobile-options.png)
- [Bản đồ customer web](customer_web-journey-390.png), [customer mobile](customer_mobile-journey-390.png), [shipper](shipper-journey-390.png)
- [Trang 34 của 200 đánh giá](manager-reviews-page34.png), [thanh phân trang điện thoại](manager-reviews-390.png)
- [Admin trang 2](admin-page2.png), [manager](manager-page2.png), [staff](staff-page2.png), [đối tác](partner-page2.png), [kế toán](accountant-page2.png)
