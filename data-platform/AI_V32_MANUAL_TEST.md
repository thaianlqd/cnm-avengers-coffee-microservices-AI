# Kịch bản test thủ công V3.2 (localhost:8501 → "Trợ lý AI")

Trước khi test: Ctrl+Shift+R. Kỳ dữ liệu có sẵn: tháng 9/2026. Mọi ca "0 lượt AI" không tốn quota Gemini.
Mỗi ca: **Bước** → **Đúng** → **Sai nếu**.

## A. Màn nhập (Không gian phân tích)
1. **Vô nghĩa** — gõ `dsdasds`. → Nhãn "Chưa nhận ra bài toán phân tích" (đỏ), nút Lập kế hoạch bị khoá. Sai nếu: còn chữ "Câu hỏi hợp lệ".
2. **Đổi nhiệm vụ** — chọn *So sánh*, gõ `So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9/2026`, rồi bấm tab *Xếp hạng*. → Ô câu hỏi trống (bản nháp riêng), kế hoạch/báo cáo cũ biến mất. Quay lại *So sánh*: câu cũ còn. Sai nếu: câu cũ sang Xếp hạng.
3. **Lệch nhiệm vụ** — ở *Xếp hạng*, gõ lại câu so sánh ở ca 2. → "Yêu cầu chưa phù hợp với nhiệm vụ đang chọn" + 2 nút "Chuyển sang So sánh" / "Viết lại câu hỏi cho Xếp hạng"; bấm nút thì chuyển/sửa đúng.
4. **Alias** — *Câu hỏi tự do*, gõ `doanh thu`. → Chip "Doanh thu · chỉ số chuẩn", không còn "+5 chỉ số cùng tên".
5. **Quyền riêng tư** — gõ `số điện thoại khách hàng mua nhiều nhất`. → Chặn (BLOCKED).
6. **Chưa hỗ trợ** — gõ `Phân tích lợi nhuận tháng 9`. → "Cần bổ sung thông tin", cảnh báo "chưa có định nghĩa được quản trị" + nút thay bằng Doanh thu/… ; không gửi được. 
7. **Câu thân mật** — `hôm nay bán được bao nhiêu?`, `món nào bán chạy nhất?`, `chi nhánh nào đang có tỷ lệ hủy cao?` → cả 3 được chấp nhận.
8. **Phạm vi** — gõ `Doanh thu theo chi nhánh tháng 9/2026`. → Phạm vi ghi "Tự nhận diện từ câu hỏi" (thấy chi nhánh + tháng 9); chọn tay chỉ nằm trong "Thu hẹp thủ công". Sai nếu: mặc định "Sản phẩm".
9. **Độ sâu** — dưới ô chọn có mô tả từng mức (Tập trung / Sâu: tối đa 6 góc nhìn hỗ trợ, 1 chiều / Toàn diện: tối đa 8, 3 chiều).

## B. Chạy được không cần AI (0 lượt)
10. **Trend** — nhiệm vụ *Xu hướng*: `Phân tích xu hướng doanh thu theo tuần trong tháng 9 năm 2026` → dòng "thực thi tất định, không cần AI"; nút "Lập kế hoạch (không cần AI)"; duyệt → báo cáo thành công.
11. **Dự báo** — *Dự báo*, dùng builder: chỉ số Doanh thu, 3 tháng → báo cáo có dự báo 3 tháng, không lỗi phải "thử lại".
12. **Rủi ro** — *Rủi ro*, tháng 9/2026, nút "Kiểm tra rủi ro (0 lượt AI)" → 6 tín hiệu (hiện `Số sản phẩm sắp hết` đỏ, còn lại xanh), chỉ chỉ số rủi ro, không biểu đồ doanh thu sản phẩm; có "Điểm nên kiểm tra tiếp".
13. **Tương quan** — *Tương quan*: tổng chuyến giao vs điểm đánh giá theo mã người giao → scatter + "Tương quan không phải nhân quả".

## C. Một câu – 3 độ sâu (chứng minh độ sâu thật)
14. Câu `Doanh thu theo chi nhánh tháng 9 năm 2026`, chạy lần lượt Tập trung → Sâu → Toàn diện. → số biểu đồ tăng (khoảng 2 → 5 → 7), "góc nhìn hỗ trợ" tăng; số liệu chính (doanh thu từng chi nhánh) **giống nhau** ở cả 3. Sai nếu: 3 báo cáo y hệt.

## D. Báo cáo – 4 tab
15. **Báo cáo**: đầu trang có "Trả lời ngắn"; mỗi biểu đồ có tiêu đề nêu chiều ("theo …"), khối **"Nhận định từ biểu đồ"** (vì sao có, số liệu chính, lưu ý, điểm nên kiểm tra), mục "Cách đọc / Định nghĩa chỉ số / Xem dữ liệu / Nguồn & phạm vi". Không có khối kiểm chứng chen giữa.
16. **Kiểm chứng & nguồn**: có 5 thước đo riêng; "Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)"; "Đối chiếu độc lập: Chưa đo". Bấm **"Chạy đối chiếu độc lập (0 lượt AI)"** → hiện bảng Kỳ vọng/Báo cáo/Khớp. Sai nếu: còn "Điểm kiểm chứng tổng" hoặc "độ chính xác AI".
17. **Dữ liệu / SQL**: xem SQL và bảng kết quả.
18. **Lưu & xuất**: lưu báo cáo; xuất Word có câu trả lời ngắn, nhận định từng biểu đồ, mục đối chiếu.

## C2. Đúng "ngữ pháp" biểu đồ từng nhiệm vụ (mới)
- **So sánh** (HCM vs Hà Nội, tháng 9/2026): dải KPI = *Hồ Chí Minh · Hà Nội · Chênh lệch tuyệt đối · Chênh lệch %*; biểu đồ chính là cột (không có donut); "Trả lời ngắn" đúng 1 câu "… cao hơn … (+x%)".
- **Cơ cấu** theo phương thức thanh toán: nhãn tiếng Việt ("Thanh toán khi nhận hàng", "Ví điện tử", "VNPay"…), không còn `THANH_TOAN_KHI_NHAN_HANG`; không có 2 donut trùng nhau.
- **Tổng quan**: KPI + xu hướng + tối đa **1** biểu đồ tỷ trọng (không còn 3 donut).
- **Xu hướng**: chỉ 1 thẻ "Thay đổi giữa hai kỳ" (không lặp 5 lần); kỳ chưa đủ ngày có dấu `*`.
- **Xếp hạng**: tên chi nhánh không kèm mã (`/ HC_QN_…`).
- Mục "Kiểm chứng & nguồn" → "góc nhìn đã được lọc bỏ" liệt kê lý do (trùng góc nhìn / không đúng dạng biểu đồ / vượt ngân sách độ sâu).

## E. Provider (chỉ kiểm hiển thị)
19. Khi lỗi, thẻ lỗi có dòng "Giai đoạn: …" (vd. Hạn mức dịch vụ AI) và chỉ có nút "Thử lại" khi lỗi tạm thời. Góc trên ghi "AI provider: Sẵn sàng / Giới hạn quota / …". Khi hết quota cả 2 khoá phải ra thông báo hết quota, không phải lỗi ngữ nghĩa. (Không cố ép lỗi thật.)
