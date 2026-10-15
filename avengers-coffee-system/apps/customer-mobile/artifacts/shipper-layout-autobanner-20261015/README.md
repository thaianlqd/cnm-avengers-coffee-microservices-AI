# Layout shipper mobile và banner tự chuyển — 15/10/2026

Bản cập nhật tiếp theo: [header có ảnh, đơn hàng và bản đồ shipper theo ảnh tham khảo](../shipper-reference-layout-20261015/README.md).

Theo xác nhận mới nhất, **layout chỉ thay đổi ở shipper mobile**, gồm bản Expo Web của cùng app. Tham khảo cách tổ chức công việc và nhóm thao tác trong ảnh Viettel Post người dùng gửi và [trang giới thiệu chính thức](https://fly.viettelpost.vn/). Giữ nhận diện Avengers Coffee, dữ liệu và các luồng giao hàng hiện có.

## Giao diện shipper

- Công việc: header đỏ gọn, cửa hàng và công tắc nhận đơn luôn thấy khi cuộn; ba chỉ số trong ngày, bốn tiện ích, tìm kiếm, tab đơn và thẻ lấy/giao hàng rõ ràng. Thu nhập dùng phí của chuyến đã giao, không cộng tiền COD.
- Ví & COD: số dư, thống kê, tiền thu hộ từng chi nhánh, các thao tác và danh sách phí giao trong các khối phẳng, ít bóng đổ.
- Lịch sử: tổng chuyến/thành công/thất bại theo khoảng thời gian, bộ lọc, tìm kiếm, thẻ đơn và phân trang gọn.
- Hồ sơ: thông tin tài xế/cửa hàng và các nhóm công việc/hỗ trợ. Điều hướng tới các màn hình hiện có.
- GPS vẫn độc lập với trạng thái sẵn sàng. GPS bị chặn không khóa nhận đơn; lỗi lưu trạng thái/nhận đơn vẫn hiện rõ. Đơn chưa nhận mở phần xem trước bằng order ID; sau khi nhận mới mở chi tiết bằng delivery ID.

## Banner customer

Home và Order trên web/mobile giữ bộ ảnh riêng. Đã bỏ mũi tên, nút dừng/chạy và các nút/chấm chọn slide; tự đổi mỗi **10.000ms**. Web tạm ngừng đổi ảnh khi tab ẩn; mobile tạm ngừng khi rời màn hình hoặc app không active. Bấm ảnh Home để mở thực đơn vẫn hoạt động. Không thay layout customer trong đợt này.

## Kiểm chứng

- Vite customer build PASS. Expo customer và shipper export web/iOS/Android PASS.
- 7 unit tests shipper PASS.
- Shipper chưa có cấu hình ESLint riêng. Audit bằng cấu hình Expo hiện có cho thấy các lỗi hooks/Animated và globals đã tồn tại trước đợt layout; không báo lint toàn app PASS. Lỗi purity ở bộ lọc ngày Lịch sử đã được sửa bằng mốc thời gian của lần tải dữ liệu.
- QA trên production exports: banner Home/Order web và mobile thực sự đổi ảnh sau 10 giây, không còn controls. Bốn tab shipper, xem trước đơn, phân trang và điều hướng PASS; không tràn ngang ở 320/390px, Công việc kiểm tra thêm 600px; công tắc nhận đơn vẫn thấy khi cuộn.
- 5 regression UI nhận đơn PASS: GPS bị chặn + profile cũ; nhận trực tiếp từ thẻ; lưu trạng thái thất bại; xung đột nhận đơn ở danh sách và ở xem trước.
- HTTP/provider/WebSocket dùng fixture, không gửi request tới API thật, không dùng key người dùng và không nhận/sửa đơn thật. iOS/Android đã xuất bundle; chưa kiểm tra thiết bị/emulator native.

[Kết quả layout/banner](checks.json), [kiểm tra lại bundle shipper cuối](shipper-final-checks.json), [regression nhận đơn](readiness-checks.json). Scripts: `scripts/verification/banner-auto-shipper-layout-ui.mjs` và `scripts/verification/shipper-readiness-ui.mjs`. Các script dùng đường dẫn build, Playwright và Chromium từ biến môi trường, đóng server local khi xong.

## Ảnh kiểm tra với dữ liệu giả

- [Công việc 390px](shipper-work-390.png), [320px](shipper-work-320.png), [600px](shipper-work-600.png)
- [Ví & COD](shipper-wallet.png), [320px](shipper-wallet-320.png)
- [Lịch sử](shipper-history.png), [Hồ sơ](shipper-profile.png), [Xem trước đơn](shipper-order-preview.png)
- [Home web](web-home-no-controls.png), [Order web](web-order-no-controls.png)
- [Home mobile](mobile-home-no-controls.png), [Menu mobile](mobile-menu-no-controls.png)

Reload trình duyệt/Expo để nạp source mới. Không commit/push.
