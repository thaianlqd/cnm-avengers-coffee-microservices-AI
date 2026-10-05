# Sửa đơn của khách hàng — 05/10/2026

## Phản hồi cần xử lý

Câu `vậy cho tôi sửa đơn số 2 đi bạn` chưa đi vào nhánh chọn đơn trực tiếp vì thiếu tiền tố `vậy`. Lượt lúc 08:52 gặp Gemini HTTP 400 trước khi thực thi công cụ; log chỉ phân loại `unknown_incompatible_request`, chưa xác định trường provider từ chối. Nhánh chọn đơn hiện nhận `vậy`, `thế`, `vậy thì`, `thế thì`, đọc đúng đơn trong danh sách đã hiển thị và kiểm tra quyền/trạng thái từ Order Service. Không cần gọi model cho câu chọn đơn này. Các yêu cầu sửa món phức tạp vẫn dùng luồng suy luận hiện có; chưa thử trực tiếp bằng key thật.

## Quy định đã chốt

- Tổng sau sửa được **bằng hoặc cao hơn tổng cũ**, tính sau giảm giá và phí giao.
- COD chưa thu tiền được sửa. Ví Avengers đã thanh toán được sửa và chỉ trừ phần chênh lệch tăng.
- Ví thiếu số dư: báo cần nạp thêm bao nhiêu, yêu cầu xem lại thay đổi sau khi nạp.
- Đơn QR/cổng thanh toán không sửa. Đơn bên cổng chưa trả cũng tiếp tục không hỗ trợ sửa vì chưa có luồng phát lại yêu cầu thanh toán.
- Cho sửa khi `MOI_TAO` hoặc `DA_XAC_NHAN`, trước `DANG_CHUAN_BI`; đơn huỷ/chuẩn bị/giao/hoàn thành bị khoá. Đây là mốc triển khai đã thông báo trong phiên.

Áp dụng cho endpoint sửa đơn của khách hàng, chatbot và modal lịch sử đơn Web Customer. Luồng chỉnh sửa dành riêng cho nhân viên vẫn giữ quy định hiện có.

## Xác nhận và tiền ví

Web gửi preview trước, hiển thị tổng cũ/mới và khoản trừ thêm, rồi xác nhận bằng revision và giá vừa xem. Thay đổi form làm mất hiệu lực preview; kết quả preview đến muộn không được dùng. Chat yêu cầu xác nhận trên lượt sau; chọn đơn khác bỏ preview/focus cũ ngay cả khi đơn mới không được sửa.

Backend khoá dòng đơn và kiểm tra lại chính sách, revision, giá Menu, voucher đã áp dụng và tổng tiền. Đơn ví bắt buộc có revision và tổng đã xác nhận. Debit ví, ledger, chi tiết đơn, tổng mới và giao dịch thanh toán chênh lệch nằm chung một transaction. Giữ giao dịch thanh toán ban đầu; thêm giao dịch chênh lệch, không viết lại tiền đã trả. Tham chiếu debit gắn với order/revision. Xác nhận lặp không trừ thêm; lỗi ghi đơn hoàn tác debit/ledger. Tổng bằng giá cũ không tạo debit. Writer đổi trạng thái cũng lấy khoá dòng đơn, tránh lưu tổng tiền cũ đè lên đơn vừa sửa.

## Kiểm tra

- 365 test AI qua, bao gồm câu nối tiếp chọn đơn, QR/ ví/COD, số thứ tự, tổng giảm và thiếu số dư.
- 196 test Order Service qua (191 unit test trong sandbox và 5 HTTP contract test dùng Nest giả trên loopback).
- 13 test helper Web Customer qua; build Nest và Vite thành công.
- Các launcher bỏ biến key/secret khỏi môi trường và chặn mạng ngoài. Dữ liệu đơn, ví, provider, DB đều giả; HTTP contract chỉ dùng 127.0.0.1. Không sửa đơn, trừ tiền hay gửi chat AI thật để kiểm thử; không đổi cấu hình model/token/timeout.

Có thể tự thử trong giao diện: xem lịch sử → chọn đơn đủ điều kiện → tăng số lượng/đổi món bằng hoặc cao hơn tổng cũ → kiểm tra preview → xác nhận. Xác nhận này là thao tác thật của người dùng.

## Cập nhật local

Đã build/recreate AI Service và Order Service; Web Customer nhận source qua bind mount. `/ai/health`, root Order Service và component Vite đều trả 200. Hash file xử lý đơn của AI và policy JS của Order trong container khớp file local. Hash toàn bộ biến `AI_AGENT_*`/`AI_CHAT_*` trước và sau recreate giống nhau. Không gửi chat thật trong bước xác minh này.
