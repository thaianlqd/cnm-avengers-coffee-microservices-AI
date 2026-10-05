# Đánh giá các chi nhánh vừa hiển thị — 05/10/2026

Log cuộc chat 22:54–22:57 cho thấy hai lỗi độc lập:

- 22:56: bốn lần gọi Gemini đều HTTP 503 trước công cụ, kết thúc server_provider_unavailable. Không phải lỗi HTTP 400 của lượt sửa đơn trước đó.
- 22:57: Gemini gọi search_knowledge_base, lấy faq_general_001 về thành phần sản phẩm. Chat llm_tools chưa expose get_store_reviews/get_top_rated_stores dù có executor, nên thiếu công cụ nghiệp vụ và FAQ lệch yêu cầu được dùng làm trả lời.

Thay đổi:

- Chỉ expose các công cụ đánh giá chi nhánh khi câu hiện tại yêu cầu đánh giá chi nhánh; các câu shopping bình thường giữ bề mặt công cụ cũ.
- Thêm compare_branch_reviews đọc một batch tối đa 5 canonical IDs từ snapshot chi nhánh vừa hiển thị. Không suy số món/product thành số chi nhánh, không lấy top toàn hệ thống thay cho danh sách địa phương. Thứ tự hiển thị giữ nguyên, không chọn chi nhánh checkout.
- Điểm và số đánh giá tính trên tất cả APPROVED ratings, kể cả không có bình luận. Đọc tối đa 3 nhận xét gần đây mỗi chi nhánh. Dùng bình quân trước làm tròn để xác định đồng hạng. Không có review thì không gán 0 sao hay bịa một chi nhánh tốt nhất.
- Các câu đọc trực tiếp “các chi nhánh này”, chi nhánh số n, tên có trong snapshot, hoặc hỏi chi nhánh nào tốt nhất trong danh sách, đi qua guarded gateway tới DB; không cần model. Không đổi provider/model/token/timeout/budget/retry.
- Thiếu snapshot/số không hợp lệ/“chi nhánh này” giữa nhiều lựa chọn thì hỏi rõ. Gặp lỗi DB thì trả thiếu dữ liệu, không chuyển sang FAQ thành phần. RAG không được thay thế dữ liệu review; get_top_rated_stores giữ stores/avg_rating/count trong model projection.
- Không sửa giỏ, địa chỉ, chi nhánh chọn, xác nhận hay trạng thái đơn khi xem review; chỉ ghi receipt/memory theo cơ chế hiện có.

Kiểm tra offline: 22 test mới tái hiện đúng câu hỏi, provider bị chặn, five-store scope, thứ tự/số tham chiếu, đồng hạng, rating không có bình luận, không có rating, DB outage, guest, named/implicit references, không ghi business state, RAG lạc chủ đề, từ chối/yêu cầu hỗn hợp. Suite liên quan tổng 586 qua, 5 test Gemini cũ deselect sau xác định sai lệch đã có ở HEAD: policy bỏ response_format khi Gemini có tools, test cũ vẫn đòi field đó/format retry trong tool round. Không thay production policy hoặc sửa các test không thuộc luồng review.

Đối chiếu DB thực bằng SELECT, không gọi AI: snapshot cuộc chat đúng 5 chi nhánh Onehub Thủ Đức, Big C Cityland, Riviera Point D7, UOA Tower D7, 77 Hoàng Văn Thái D7. Truy vấn chạy thành công; cả 5 hiện có 0 APPROVED reviews. Kết quả phù hợp là chưa đủ dữ liệu xếp hạng.
