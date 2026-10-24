# Đặt món tại bàn & khảo sát chi nhánh

Ứng dụng React/Vite độc lập, chạy tại `http://localhost:5176`. Không dùng router,
phiên đăng nhập hoặc giỏ hàng của web-customer.

- Thực đơn tại bàn: `/?storeId=MA_CHI_NHANH&tableId=2`
- Khảo sát công khai đã kích hoạt: `/survey/ID`
- Cài và chạy: `npm ci` rồi `npm run dev`.
- Docker Compose: `docker compose up -d --build web-table-order` từ repository root.
- Dev proxy mặc định tới `http://127.0.0.1:3000`; cấu hình server bằng
  `API_PROXY_TARGET`. Trong Docker, proxy tới `http://api-gateway:3000`.
- Có thể đặt `VITE_API_BASE_URL` khi triển khai static build, trỏ tới gateway công khai.
- Web Admin dùng `VITE_TABLE_ORDER_URL` để tạo QR/link. Mặc định là cùng hostname,
  cổng 5176. Muốn quét từ điện thoại, mở admin bằng IP LAN hoặc đặt URL LAN/domain.

Giá, chi nhánh và tình trạng bán món được đọc từ server. Khách không gửi giá.
Đơn QR là đơn dùng tại chỗ, chờ cửa hàng tiếp nhận và thanh toán tại quầy.
Mã yêu cầu UUID giúp gửi lại cùng một yêu cầu không tạo đơn trùng.
Phản hồi khảo sát gắn chi nhánh từ biểu mẫu ở server; manager không được chọn phạm vi khác.
