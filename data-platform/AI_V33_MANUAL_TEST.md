# V3.3 — Kịch bản kiểm tra thủ công trên UI (localhost:8501)

Chỉ cần mở trình duyệt; bản web-ui đã được build lại và đang phục vụ. Mỗi ca: **bước → kết quả đúng → dấu hiệu sai**.

## A. Bảy chế độ và nhập liệu
1. **Trợ lý AI** → thanh nhiệm vụ. *Đúng:* 7 thẻ (Câu hỏi tự do, Tổng quan, So sánh, Xếp hạng, Xu hướng, Dự báo, Rủi ro & cảnh báo). *Sai:* còn “Cơ cấu”/“Tương quan”.
2. Chọn **Xu hướng** → “Dùng cấu hình này” → “Phân tích”. *Đúng:* chạy thẳng tới báo cáo, không qua bước duyệt. *Sai:* phải bấm “Xác nhận”.
3. Sau khi “Dùng cấu hình này”, tự sửa chữ trong ô câu hỏi → “Phân tích”. *Đúng:* chạy như câu hỏi tự do. *Sai:* báo cáo vẫn theo cấu hình cũ.

## B. Chặn sớm (0 lượt AI, 0 SQL) — gõ vào ô câu hỏi, chưa bấm gì
| Câu gõ | Đúng |
|---|---|
| `Dự báo doanh thu 12 tháng tới theo từng chi nhánh` | Chặn, nêu **cả hai** lỗi (theo từng chi nhánh + vượt tầm 6 tháng) kèm gợi ý sửa |
| `Dự báo doanh thu 3 tháng tới của Hà Nội` | Chặn (chưa hỗ trợ dự báo theo bộ lọc); không gợi ý “dự báo riêng Hà Nội” |
| `Doanh thu của các chi nhánh đang lỗ` | Chặn “điều kiện chi phí/lợi nhuận chưa có dữ liệu”, không thay bằng “doanh thu thấp” |
| `Cơ cấu AOV theo chi nhánh` | Chuyển hướng sang So sánh (AOV là tỷ lệ/trung bình, không có cơ cấu) |
| `So sánh doanh thu Hồ Chí Minh với tỷ lệ hủy Hà Nội` | Hỏi làm rõ (hai chỉ số khác đơn vị) |
| `Tương quan doanh thu với thành phố` | Hỏi làm rõ (thành phố là biến phân loại) |
| chọn **Rủi ro** + `Doanh thu có rủi ro không` | Chuyển hướng sang Tổng quan/Xu hướng; nút chạy bị khóa |
| `Xu hướng doanh thu theo tuần trong ngày 15/09/2026` | Hỏi mở rộng khoảng thời gian (≥2 kỳ) |
| `xin chào bạn` | Hướng dẫn nhập lại |
*Sai:* câu vẫn chạy được rồi mới báo lỗi, hoặc chỉ hiện cảnh báo vàng.

## C. Báo cáo có kết luận
4. `Top 5 chi nhánh doanh thu cao nhất tháng 9 năm 2026` → “Phân tích”. *Đúng:* báo cáo gọn (không ép đủ 4 biểu đồ); có khối **Kết luận** (trả lời, phát hiện có mã bằng chứng, lưu ý, hành động đọc được — không thấy `review_gap`).
5. `Doanh thu cao có làm tỷ lệ hủy thấp đi không` → báo cáo có biểu đồ phân tán cặp, câu “tương quan không chứng minh nguyên nhân”, n quan sát; tab **Kiểm chứng** hiện “Góc nhìn bắt buộc đã có”.
6. `Vì sao doanh thu tháng 9 năm 2026 thay đổi` → kết luận nói rõ tăng/giảm bao nhiêu so với tháng 8, nhóm đóng góp lớn nhất, “không khẳng định nguyên nhân”. Biểu đồ thay đổi có dấu.
7. `Dự báo doanh thu 3 tháng tới, độ chính xác tối thiểu 95%` → kết luận trả lời phần **tương lai** (khoảng 80%, kiểm tra lùi sMAPE), **không** hứa 95%.
8. Tab **Kiểm chứng**: chip *Đối chứng độc lập: chưa đo* (không xanh) → bấm “Chạy đối chiếu độc lập” → chip cập nhật.
9. Lưu báo cáo → Quản lý Báo cáo → mở lại → Xuất Word. *Đúng:* kết luận, lưu ý, trạng thái kiểm chứng còn nguyên.

## D. Rủi ro
10. Nhiệm vụ **Rủi ro** → “Kiểm tra rủi ro”. *Đúng:* 6 tín hiệu, 0 lượt AI; lỗi truy vấn hiện “Lỗi tính toán”, không bao giờ màu xanh.

## E. Trạng thái và mạng chậm
11. Bấm “Xem kế hoạch”, trong lúc đang chờ bấm “Sửa câu hỏi”. *Đúng:* quay lại ô câu hỏi, kế hoạch cũ không hiện lại.
12. Đang phân tích, bấm “Dừng phân tích”. *Đúng:* ô câu hỏi, nhiệm vụ, thời gian, phạm vi, độ sâu về mặc định; lịch sử còn nguyên.
13. Đổi **Thời gian** sau khi đã có kế hoạch. *Đúng:* kế hoạch cũ biến mất.
14. Ngắt mạng ngay khi bấm “Phân tích” → khi có mạng bấm “Kết nối lại tác vụ”. *Đúng:* tiếp tục cùng tác vụ, không tạo lượt AI mới.
