# Kịch bản test Chat AI / Checkout V3

## Chuẩn bị

- Đăng nhập bằng một tài khoản khách hàng có địa chỉ mặc định.
- Hard refresh trang (`Cmd + Shift + R`) và bấm **Làm mới** chat.
- Mở đồng thời tab chat, giỏ hàng và lịch sử đơn để đối chiếu.
- Ghi lại số lượng, đơn giá, tổng tiền sau mỗi bước; không tiếp tục nếu bước trước sai.

## TC01 — Hỏi đánh giá không được hiểu thành chọn mua

1. Nhắn: `Gợi ý cho tôi nước và bánh`.
2. Sau khi bot trả danh sách, nhắn: `Cho tôi xem đánh giá của sp nước 1 và bánh 1 đi`.

Kỳ vọng:

- Bot trả đánh giá thật hoặc nói rõ món nào chưa có đánh giá.
- Bot không hỏi size/topping, không thêm món, không tạo `pending_products`.
- Số lượng giỏ không đổi.

## TC02 — Không tự tăng số lượng bánh

1. Nhắn: `Tôi chọn nước số 1 và bánh số 1`.
2. Chọn đúng một bộ tùy chọn cho nước: `size vừa, hạt sen, đào miếng, ít đá, ít ngọt`.
3. Mở giỏ hàng.

Kỳ vọng:

- Có đúng 1 nước và 1 bánh.
- Bánh không biến thành x2 nếu khách chưa yêu cầu.
- Mỗi món chỉ được ghi một lần dù model phát lại cùng tool call.

## TC03 — Giá chat, giỏ và checkout phải giống nhau

1. Tiếp tục từ TC02.
2. So đơn giá từng món trên câu trả lời chat với giỏ hàng.
3. Nhắn `chốt đơn`, hoàn tất hình thức nhận/chi nhánh/thanh toán và xem bản tóm tắt.

Kỳ vọng:

- Đơn giá gồm đúng giá gốc + phụ thu biến thể/topping từ backend.
- `Tạm tính` của chat = tổng các dòng trong giỏ.
- Tổng gốc, tiền giảm và tổng cuối ở chat = giỏ/checkout.
- Client gửi giá giả không làm thay đổi giá do backend tính.

## TC04 — Đủ thông tin thì tự tiến tới bước tiếp theo

1. Có ít nhất một món trong giỏ.
2. Nhắn một câu: `Chốt đơn, dùng tại quán và trả tiền mặt`.
3. Chọn cửa hàng khi bot đưa danh sách.

Kỳ vọng:

- Bot nhớ yêu cầu chốt đơn ban đầu, không bắt khách nhắn lại `chốt đơn`.
- Sau khi đủ món + hình thức nhận + cửa hàng + thanh toán, bot tự kiểm tra voucher.
- Sau khi chọn/bỏ voucher, bot tự tạo bản tóm tắt có nút xác nhận.
- Chưa bấm xác nhận thì chưa có đơn mới.

## TC05 — Danh sách voucher phải rõ và tính đúng

1. Ở bước voucher, kiểm tra từng dòng bot hiển thị.

Kỳ vọng:

- Mỗi ưu đãi có tên, **mã voucher thật** và số giảm dự kiến.
- Không hiển thị voucher hết hạn, hết lượt, sai hạng, chưa đạt tối thiểu hoặc không phù hợp giỏ.
- Không có trường hợp đơn 114.000đ nhưng báo giảm dự kiến 228.000đ.

## TC06 — Chọn “mã số 2” không được hiểu thành sản phẩm

1. Khi bot đang hiển thị danh sách voucher, nhắn: `Cho tôi áp dụng mã số 2`.

Kỳ vọng:

- Bot ánh xạ đúng mã ở dòng số 2 và validate/apply mã đó.
- Không xuất hiện câu `không tìm thấy sản phẩm <tên voucher>`.
- Không thêm voucher vào `pending_products`.
- Mã vừa được liệt kê là mã dùng được; nếu trạng thái thay đổi đồng thời thì bot báo lý do và giữ nguyên giỏ, không tự đổi sang mã khác.

## TC07 — Giỏ không mất hoặc nhân món qua nhiều lượt chat

1. Thêm 1 nước và 1 bánh.
2. Hỏi đánh giá, hỏi chi nhánh, mở/đóng chat, chuyển tab giỏ rồi quay lại.
3. Nhắn `giỏ của tôi có gì?`.

Kỳ vọng:

- Chat phản ánh đúng giỏ backend ở mọi lượt.
- Không tự giảm/mất món, không sinh thêm dòng trùng.
- Cùng sản phẩm nhưng khác tùy chọn là hai dòng riêng; cùng tùy chọn mới cộng số lượng.

## TC08 — Không tự thêm và không hỏi lặp

1. Nhắn `Món này được đánh giá sao?`, `Món này có vị gì?`, `Giá bao nhiêu?`.
2. Chưa dùng từ mua/thêm/chọn/lấy/đặt.

Kỳ vọng:

- Bot chỉ tư vấn; giỏ không thay đổi.
- Khi khách đã trả lời size/topping/đá/ngọt, bot không hỏi lại các trường đó.
- Bot chỉ nói `đã thêm` khi backend đã trả write thành công.

## TC09 — Memory và chống gửi trùng

1. Thực hiện ít nhất 12 lượt chat, chọn món, hình thức nhận, thanh toán và địa chỉ.
2. Reload trang rồi tiếp tục cùng cuộc hội thoại.
3. Trong DevTools, gửi lại cùng request có cùng `client_message_id` (hoặc double-click gửi khi mạng chậm).

Kỳ vọng:

- Bot nhớ các lựa chọn server-side, không phụ thuộc 8 tin nhắn frontend gần nhất.
- Reload không làm quên trạng thái checkout/giỏ.
- Cùng `client_message_id` trả lại cùng response, không chạy mutation lần hai.
- Bấm **Làm mới** tạo conversation mới nhưng không tự xóa giỏ hàng.

## TC10 — Địa chỉ, chi nhánh và tồn kho theo hình thức nhận

### A. Dùng tại quán / Lấy tại quán

1. Chọn `Dùng tại quán` hoặc `Mang đi`.
2. Xác nhận địa chỉ đã lưu hoặc nhập địa chỉ mới.

Kỳ vọng:

- Bot liệt kê các cửa hàng gần vị trí và chờ khách chọn.
- Chỉ báo thiếu hàng khi có bản ghi tồn kho xác nhận chi nhánh không kinh doanh món hoặc không đủ số lượng. Thiếu bản ghi phải được ghi là “chưa xác minh”, không được tự báo hết hàng hoặc chặn thêm món.
- Bot không tự chốt cửa hàng khi khách chưa chọn.

### B. Giao tận nơi

1. Chọn `Giao tận nơi` và xác nhận địa chỉ giao.

Kỳ vọng:

- Bot không hỏi khách chọn cửa hàng.
- Hệ thống tự chọn cửa hàng gần nhất có đủ toàn bộ giỏ, lưu đúng địa chỉ giao.
- Nếu cửa hàng gần nhất thiếu hàng, thử cửa hàng phù hợp kế tiếp; nếu không nơi nào đủ thì chặn checkout và nêu món thiếu.

### C. Tồn kho thay đổi phút cuối

1. Tạo bản tóm tắt khi còn hàng.
2. Trước khi xác nhận, dùng admin giảm tồn một món xuống dưới số lượng cần.
3. Bấm xác nhận.

Kỳ vọng:

- AI kiểm tra lại và order-service tiếp tục kiểm tra lần cuối.
- Không tạo đơn; giỏ được giữ nguyên và bot nêu món không đủ hàng.
- Thiếu bản ghi tồn kho là “chưa xác minh”, không được nói chắc chắn còn/hết; chỉ từ chối nếu có bản ghi xác nhận hết/ngừng bán.

### D. Hỏi tồn kho một chi nhánh cụ thể

1. Hỏi “Chi nhánh ABC còn món X không?” khi giỏ hàng chưa có địa điểm nhận.

Kỳ vọng:

- Trả lời đúng theo tồn kho của chi nhánh được hỏi, không suy rộng sang các chi nhánh khác.
- Nếu thiếu bản ghi, nói chưa xác minh được và hỏi khách có muốn tìm cửa hàng gần đó không; không tự báo hết.

## TC13 — Chọn nhiều món và hỏi đánh giá trong cùng lượt

1. Sau danh sách đánh số theo nhóm, nhắn: “Cho tôi nước số 1 và bánh thì số 2; đánh giá của khách về hai món này thế nào?”

Kỳ vọng:

- Trả lời đánh giá cho cả nước và bánh.
- Hiển thị đầy đủ tùy chọn của cả hai món, nhóm tùy chọn xuống dòng dễ đọc.
- Giữ cả hai món trong pending state; không âm thầm chỉ giữ món đầu.
- Nếu thiếu tùy chọn ở một món thì chưa thêm món nào. Khi đã đủ lựa chọn/mặc định, thêm cả hai một lần rồi hỏi hình thức nhận và COD.

## TC11 — Bản tóm tắt cũ không được chốt nhầm

1. Tạo bản tóm tắt A.
2. Thêm/xóa/đổi món hoặc đổi hình thức nhận để tạo bản tóm tắt B.
3. Thử dùng nút/request xác nhận của A.

Kỳ vọng:

- A bị từ chối là `stale_checkout`.
- `action_id` của A khác B và hết hạn sau 15 phút.
- Chỉ B mới có thể tạo đơn.

## TC12 — Tạo đơn đúng một lần

1. Từ bản tóm tắt hợp lệ, bấm xác nhận hai lần nhanh hoặc gửi lại request.
2. Mở lịch sử đơn và giỏ hàng.

Kỳ vọng:

- Chỉ có một mã đơn mới.
- Response lặp trả `already_processed`/mã đơn đã tạo, không tạo đơn thứ hai.
- Đơn chứa đúng món, số lượng, giá, voucher, cửa hàng và hình thức nhận.
- Giỏ được xóa sau khi có `order_id`; nếu backend chưa xác nhận mã đơn thì giỏ phải còn nguyên.

## Tiêu chí PASS tổng

- 12/12 test case đạt.
- Không có lỗi 4xx/5xx bất ngờ trong Network tab.
- Log `ai-service` và `order-service` không có traceback/exception mới.
- Tổng tiền và số lượng khớp ở chat, giỏ, checkout và lịch sử đơn.
