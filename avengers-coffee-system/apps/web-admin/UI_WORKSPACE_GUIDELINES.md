# Quy ước giao diện actor

Yêu cầu mới nhất của người dùng ngày 13/10/2026 thay thế bảng màu cũ: **sidebar đen/charcoal, nội dung sáng, font Inter gọn hơn, bỏ xanh lá và teal xanh lá.** Xanh dương được dùng làm điểm nhấn; màu cam và đỏ sáng bổ sung cho biểu đồ và trạng thái. Không dùng đỏ đô/nâu đỏ hoặc tím làm màu chủ đạo.

| Không gian | Nhóm tài khoản | Màu nhấn |
| --- | --- | --- |
| Admin | ADMIN | Xanh dương `#2563eb` |
| Quản lý | MANAGER | Xanh biển `#0e75b5` |
| Nhân viên | STAFF, KIOSK_STAFF, FRANCHISE_STAFF | Cam `#c64b12` |
| Đối tác kiosk | FRANCHISEE | Xanh biển sáng `#007cad` |
| Kế toán | ACCOUNTANT | Xanh dương sáng `#1764d8` |

Menu chọn có nền màu/chữ trắng, menu chưa chọn chữ xám sáng trên sidebar charcoal. Typography: nội dung/form 13px, menu/nút 12px, tiêu đề chính 20px, số KPI 22px. Dùng trọng lượng 400–600; tránh chữ lớn/đậm dày toàn trang. Inter có fallback font hệ điều hành khi font mạng chưa tải.

Dùng biến `--primary`, `--primary-light`, `--primary-subtle` theo actor. Biểu đồ có bảng màu xanh dương, xanh biển, cam và đỏ sáng; không đồng màu cả dashboard. Giữ nhãn phạm vi dữ liệu, trạng thái rỗng và bảng số liệu; không thêm dữ liệu demo vào ứng dụng để làm đầy biểu đồ. Biểu đồ đường co theo chiều rộng thẻ, biểu đồ cột/tròn nằm thành cặp; mobile một cột.

Popup dùng thân trắng, header xám sáng, input có một viền/focus ring, nút chính có màu actor. Form dài cuộn trong viewport; không để nút hoặc trường nhập tràn màn hình. Giữ màu lỗi/thao tác phá hủy riêng. Không có nút mở ứng dụng Shipper Mobile trong menu quản lý/nhân viên.


Login phải gửi workspace và kiểm tra vai trò trước khi lưu phiên, kể cả yêu cầu đổi mật khẩu lần đầu. API là nguồn quyền thật; chọn tab không nâng quyền tài khoản. Phiên admin mới lưu trong sessionStorage của từng tab, phiên localStorage cũ chỉ được khôi phục nếu vai trò phù hợp workspace. Đăng xuất một tab không xóa phiên mới của tab khác.

Login dùng **ảnh phủ toàn viewport**, khung đăng nhập khoảng 480px nằm bên phải, không chia ảnh/form 50–50. Mobile vẫn có ảnh nền phía sau khung form. Ảnh khác nhau theo nhóm, dùng ảnh Highlands người dùng yêu cầu ở Admin. Ảnh lưu cục bộ và nguồn được ghi trong public/images/login/README.md. Ảnh Highlands minh họa vai trò; nguồn cụ thể trong README, không gán là ảnh các cơ sở Avengers.

Tìm kiếm dùng danh sách điều hướng thực của actor, không ẩn/đổi DOM của menu. Có phím Cmd/Ctrl K, Tab/Enter và Esc, giữ focus khi đóng. Thông báo có trạng thái tải, lỗi/thử lại, rỗng, chưa đọc và phân trang. Popup cần nằm trong viewport; danh sách dài cuộn bên trong.

Tải component tab nặng, kết quả tìm kiếm và panel thông báo bằng React.lazy/Suspense; skeleton có nhãn truy cập. Hiệu ứng vào nhẹ, tắt khi prefers-reduced-motion. Màn hình hẹp dùng drawer điều hướng, lưới co về một cột và bảng cuộn trong wrapper. Không sửa tràn bằng cách cắt mất form hoặc nội dung.

Ưu tiên mới nhất: bỏ accent hồng ở đối tác và accent xám ở kế toán; tăng độ rõ của chữ mô tả, badge và đường biểu đồ. Công nợ thông thường là thông tin tài chính, hiển thị badge xanh; quá hạn/đi muộn/cần xử lý vẫn có nhãn cảnh báo riêng. Không dùng nền vàng trải rộng cho số liệu công nợ/royalty chờ thu. Banner nhượng quyền xanh sáng, KPI nền trắng để chữ/số dễ đọc.
