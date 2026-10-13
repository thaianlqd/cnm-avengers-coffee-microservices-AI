# Customer UI — 13/10/2026

## Thay đổi

- Kính lúp hiện trên cả danh sách món, gợi ý AI và món đã xem. Nút `+` mở popup tùy chọn trước khi thêm vào giỏ; callback giữ size, topping, đá, ngọt, sữa và thuộc tính động.
- Popup dùng chữ gọn, ảnh giữ tỷ lệ, danh sách topping mở trong luồng form để không che nút số lượng. Vùng nội dung cuộn riêng và nút đóng luôn ở trên. Có Escape, giữ focus trong dialog và trả focus về nút mở.
- Chỉ đóng popup sau khi server xác nhận thêm món. Lỗi giữ tùy chọn, không tạo dòng giỏ giả; chặn bấm trùng khi đang gửi. Trang chi tiết cũng chờ xác nhận trước khi báo thành công/chuyển sang giỏ.
- Giá size là giá bán đầy đủ; thuộc tính khác là phụ thu, theo contract của `services/order-service/src/modules/cart/cart.service.ts`. Dùng chung `productUnitPrice` ở giỏ, popup và trang chi tiết; không cộng base + giá size hai lần.
- Danh sách đánh giá 5 mục/trang. Điểm tổng và phân bố sao vẫn dùng toàn bộ phản hồi đã tải. Đổi sản phẩm reset lựa chọn; refresh giữ productId trong khi catalog đang tải.
- Font heading dùng Roboto, giảm kích thước/độ đậm của tiêu đề món và đánh giá. Header thu gọn trên màn hình nhỏ, giữ logo Highlands khi cuộn; không tràn ngang ở các kích thước đã kiểm tra.
- Banner trang chủ web có quả châu dùng gradient, bóng và chuyển động phối cảnh CSS; tắt chuyển động khi người dùng chọn reduced motion.

## Kiểm chứng

- `npm run build`: pass; Vite còn cảnh báo chunk chính lớn hơn 500 kB.
- `node --test src/lib/*.test.js src/components/*.test.js`: 63/63 pass, gồm oracle giá size/phụ thu.
- `node tests-checkout-ui.mjs`: các ca checkout hiện có pass.
- ESLint đầy đủ cho helper giá, hook phân trang, component phân trang, QuickViewModal và ProductDetailPage: pass. Runtime no-undef ở App/Order/Cart pass; hai tham chiếu auth modal cũ chuyển sang route login hiện có. Không tuyên bố full lint toàn app pass; các file App/Order/Cart còn lỗi lint cũ ngoài phạm vi đợt này.
- `python3 tools/check-product-ui.py http://127.0.0.1:5177`: pass trên bản build được phục vụ bằng Vite preview. Có thể dùng URL dev 5175; script cần Python Playwright/Chromium.
- Chromium cô lập dùng API giả lập: kính lúp và `+` không gửi giỏ trước xác nhận; lựa chọn Lớn 79.000 + Foam 11.000 = 90.000đ/đơn vị, số lượng 2; double click chỉ 1 POST; 503 giữ tùy chọn; 20 đánh giá chia 4 trang, điểm tổng giữ 4.5; không lỗi JS/tràn ngang ở 320/390/768/1024/1440 px.
- Ảnh/report: `artifacts/product-ui/`. Ảnh ngoài và ảnh fixture thiếu được thay placeholder trong kiểm thử. Các ca này không chứng minh dữ liệu catalog thực hay ghi giỏ thật; không gửi AI/provider.

## Xem lại nhanh

1. Mở `/?tab=order`, bấm kính lúp hoặc `+` trên món.
2. Chọn các tùy chọn, số lượng; xác nhận thêm, kiểm tra giỏ giữ lựa chọn.
3. Bấm tên/ảnh món để xem trang chi tiết; chuyển trang đánh giá và refresh URL có productId.
4. Thu cửa sổ về 320/390 px để xem header/popup và thử Escape trên desktop.

Mobile có báo cáo riêng tại `../customer-mobile/MOBILE_VERIFICATION.md`. Hai ảnh login admin/kế toán đã đổi sang bản gốc Highlands 2048 × 1365; nguồn trong `../web-admin/public/images/login/README.md`.
