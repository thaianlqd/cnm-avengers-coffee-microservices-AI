# Incident: chọn hai tỉnh doanh thu ổn định nhất rồi so sánh

**Trạng thái: DIAGNOSED / NOT_FIXED.** Ngày22/10/2026. Không gọi lại provider trong lượt kiểm này.

Câu gốc: “so sánh doanh thu bán hàng của 2 tỉnh có doanh thu ổn định nhất”. Request ID `req_d702b6b70aec42ab81309f7ca0148a8e`, lúc12:10:03–12:10:05 giờ Việt Nam.

## Điều đã xác nhận

- Log runtime: một INITIAL_UNDERSTANDING và một CONTRACT_REPAIR, tổng2provider calls; stop_reason=no_progress, INVALID_CONTRACT, lỗi semantic_resolution_failed ở SEMANTIC_INTENT. Resolver/compiler timing chưa có; UI thông báo chưa truy vấn.
- Lượt sửa có codes `clarification_required` và `explicit_metrics_missing`, không phải timeout/provider unavailable.
- Offline metadata replay nhận hai lần cụm “doanh thu”; cả hai khóa canonical về **revenue**. Một intent chỉ revenue vẫn qua `verify_anchors` với issues=[]; **không cần cả sáu revenue metrics**.
- Khi replay intent không có requirement, missing-metric diagnostic liệt kê cả sáu candidate IDs của alias “doanh thu”. Vì vậy danh sách UI không chứng minh user yêu cầu sáu chỉ số: đó là lỗi diễn đạt từ candidate alternatives sang missing obligations.
- Features ổn định chưa được nhận diện; không tìm thấy stability/stddev/CV ranking metric trong registry, không có stability trong derived_features. Volatility nội bộ của trend là diagnostic, chưa là tiêu chí chọn cohort được quản trị.
- “2 tỉnh” là nhóm được tính từ dữ liệu, không phải hai tên tỉnh có sẵn. Cần selection criterion + time window + cadence trước khi xây comparison frame.

## Điều chưa thể kết luận

Không có raw draft provider của request này trong receipt hiện có. Không khẳng định LLM chính xác đã nói gì, vì sao thiếu clarification object, hoặc đã đề xuất một công thức ổn định nào. Lỗi thật đã xác nhận là không có final valid intent và bounded repair dừng không tiến triển. Control revenue-only chỉ chứng minh anchor không ép sáu metric; nó **không chứng minh** câu “ổn định nhất” đã được hiểu/trả lời đầy đủ.

## Hành vi đúng cần có

Hỏi có cấu trúc về kỳ, cách đo ổn định/cadence hoặc thông báo tính năng chọn tỉnh theo độ ổn định chưa được hỗ trợ; giữ nguyên revenue và entity city, không yêu cầu người dùng chọn thêm doanh thu sản phẩm/thanh toán/món. Không bỏ chữ “ổn định” và tự xếp hạng theo tổng doanh thu.

Ví dụ lựa chọn: “Bạn muốn xét mức ổn định theo tháng trong khoảng thời gian nào? Có thể dùng độ biến động tương đối CV nếu hệ thống đã hỗ trợ và công bố điều kiện áp dụng.” CV là phương án cần định nghĩa, không phải nghĩa duy nhất mặc định của câu hỏi.

Khi có definition hợp lệ: series theo tỉnh → score ổn định → chọn hai tỉnh → freeze keys → so sánh, dùng cùng frame/controls trong PLAN chung. Chưa đủ hai tỉnh đủ điều kiện phải báo insufficient data, không chọn đại.

## Bằng chứng

- [Log request có sẵn](existing-request-log.txt)
- [Replay metadata offline](offline-evidence.json)
- [Script replay](reproduce_offline.py)
- [Bổ sung thiết kế chung](../../../AI_DATA_ANALYST_COMPARISON_SELECTION_ADDENDUM_20261022.md)

Lượt kiểm mới:0provider calls,0business SQL,0product edits. Hai calls nêu trên là của yêu cầu người dùng đã chạy, không phải lượt replay mới.


## Đối chiếu log với guard sau câu hỏi của người dùng

`clarification_required` chỉ có một raise site trong planner parse: sau khi đã xử lý analyze và unsupported; nhánh còn lại là parsed decision clarification và clarification object vắng/null. Vì vậy có thể suy ra **bản diễn giải lượt đầu đi vào nhánh cần hỏi lại nhưng không cung cấp phần khai báo hỏi lại hợp lệ**. Đây là suy luận từ log+code path, không phải bản chép raw output. Chưa thể nói model đã hiểu tiêu chí ổn định hay selection→comparison đúng. Lượt sửa cuối chỉ xác nhận no_progress, không suy raw nội dung.

`draft_shapes` hiện chỉ chiếu requirements, không ghi envelope decision/clarification; log tổng chỉ giữ counts/status/timings. Xem [log-source-inference.json](log-source-inference.json). Cần structured semantic trace được kiểm quyền để lần sau đọc bản diễn giải từngphase, không cần raw reasoning hay secret. Không gửi thêm provider để tái tạo lịch sử đã mất.
