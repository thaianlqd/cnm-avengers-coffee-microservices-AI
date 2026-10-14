# Customer/shipper mobile & chat parity — 14/10/2026

Đã sửa code và cập nhật riêng AI service local; không commit/push.

- Splash HTML, React và native cùng `#b22830`; logo trắng trong suốt có sẵn thay logo kèm lớp đỏ. [Ảnh](customer-splash.png).
- Leaflet CSS local giữ layout/upstream license, bỏ ba URL ảnh local không được Metro hỗ trợ. Tracking dùng `divIcon`; layer-toggle dùng SVG data URI. Build không còn warning import CSS local resources.
- Shipper login dùng ảnh đội ngũ Highlands trong repo, logo Highlands và nội dung giao hàng nội bộ cửa hàng. [Ảnh](shipper-login-390.png).
- Mobile AI bỏ `/ai/chat` và `/ai/chat/order-intent`, bỏ đoán sản phẩm/chi nhánh theo prose, bỏ tự thêm size Nhỏ. Dùng `/ai/agent/chat`, guest capability header, conversation ID và client message ID bền vững. Retry đúng tin nhắn dùng lại lượt; timeout không đổi chatbot.
- Web/mobile dùng chung `agentTurn`, `agentContract`, `chatText`, `chatWidgetActions`, `walletTopup`. Mobile render đúng products/branches/vouchers/payment/login/QR từ server, giữ nguyên Markdown/danh sách tùy chọn, ordinal global và nhóm nước/bánh. Nút + gửi canonical product ID; chi tiết mở ProductDetail.
- Checkout chỉ có khi server trả summary; nút và xác nhận bằng text dùng cùng action ID, không chốt ngay sau chọn món. Giỏ/đơn/ví được invalidate sau tool mutation; ví thiếu tiền dùng options/topup thật từ server. QR/topup chỉ xác nhận qua trạng thái server; receipt được giữ khi reset hội thoại.
- Hội thoại lưu theo tài khoản/khách, giữ khi đổi AI/nhân viên và reload. Header responsive, nút gửi có accessibility label, Enter gửi trên web; auto-scroll sau rich layout.
- Voice web dùng SpeechRecognition như web-customer. Native chỉ gửi audio để STT (`transcription_only=true`) rồi gửi transcript vào cùng Agent; không chạy thêm legacy order inference. Dọn microphone khi rời panel và tránh race giữ/thả.
- Log trước sửa có `unknown_intent` ở web. Bổ sung prompt cho greeting kèm mua món và repair chỉ dùng tên intent hợp lệ; test fake provider chứng minh ordinal chọn tùy chọn, chưa ghi cart/checkout. Không khẳng định loại bỏ mọi lỗi stochastic của model thật.

[Chat chọn món số 2, đủ tùy chọn và chưa vào giỏ](customer-options.png).

## Kiểm thử

[Checks](checks.json): 62 Node tests PASS, hai nhóm AI offline 114/135 PASS (có overlap), lint 0 lỗi/cảnh báo; customer Expo web/iOS/Android, shipper Expo web và web-customer Vite build PASS. Chromium mock API ở 320/390/480/1440px PASS, bốn lượt Agent giả lập gồm voice. Không gọi provider bằng API key thật; test AI chạy `docker run --network none`, transport/provider/DB giả lập. Native mới kiểm tra bundle, chưa chạy trên thiết bị/emulator. CSS và hai màn hình thay đổi được kiểm tra bằng ảnh render.

AI service local đã rebuild/recreate `--no-deps`; log xác nhận startup complete, không gửi chat smoke thật. Các service và artifacts K8S/load-test khác được giữ nguyên.

## Áp dụng frontend đang chạy

Dừng rồi chạy lại `npx expo start -c` trong customer-mobile để Metro đọc `metro.config.js` mới (watch contracts web dùng chung); reload browser/app. Shipper cũng reload/restart Expo để nhận banner mới. Native splash app.json cần rebuild native app nếu muốn thay màn splash OS của binary đã cài.

## Chạy lại offline

```bash
node --test tests/*.test.mjs
# Export apps ra /tmp trước; mock browser test không gửi API thật.
CUSTOMER_EXPORT=/tmp/avengers-customer-parity-export \
SHIPPER_EXPORT=/tmp/avengers-shipper-banner-export \
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_EXECUTABLE=/path/to/chromium \
node tests/chat-ui-offline.mjs
```
