# Shipper trắng và đỏ — 15/10/2026

Theo góp ý mới nhất, nền shipper chuyển từ kem/xám sang trắng, gồm cả nền ngoài khung ứng dụng Expo Web. Đỏ được dùng làm điểm nhấn ở thẻ phí giao, tiêu đề từng khối, viền chi nhánh và tab đơn đang chọn. Giữ màu xanh cho trạng thái sẵn sàng/thành công.

Theme dùng chung chỉ trong shipper, các tab kế thừa nền trắng; khối chi nhánh trong Hồ sơ và nút icon dùng sắc đỏ nhạt. Không thay dữ liệu, nghiệp vụ nhận đơn hoặc provider bản đồ.

Expo export web/iOS/Android PASS. Browser QA trên build với API/provider/WebSocket fixture PASS: Công việc 320/390/600px, ảnh header vừa khung, công tắc vẫn thấy khi cuộn; đơn mới/đã nhận và map; Ví/Lịch sử/Hồ sơ/phân trang. Không gọi API thật hoặc dùng key người dùng. Native đã xuất bundle, chưa thử thiết bị.

- [Trang đầu 390px](shipper-work-390.png), [320px](shipper-work-320.png), [600px](shipper-work-600.png)
- [Ví & COD](shipper-wallet.png), [Hồ sơ](shipper-profile.png)
- [Kết quả kiểm tra](checks.json)

Reload web/Expo để nạp thay đổi màu. Không commit/push.
