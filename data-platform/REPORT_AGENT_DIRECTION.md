# Định hướng Data Platform và trợ lý tạo báo cáo

Đánh giá này dựa trên mã nguồn tại thời điểm hiện tại. Chưa có lần chạy end-to-end với warehouse và nhà cung cấp mô hình đang triển khai, nên không coi kết quả kiểm thử offline là bằng chứng chất lượng trong môi trường thật.

## Kết luận

Kiến trúc có đủ các lớp cơ bản của một data platform: đồng bộ nguồn và sự kiện, Bronze/Silver/Gold, lịch xử lý, warehouse, semantic catalog, API phân tích và UI. Trợ lý AI cũng đã có luồng lập kế hoạch, kiểm tra ngữ nghĩa, biên dịch SQL phía máy chủ, chạy chỉ đọc và gắn bằng chứng với báo cáo. Không cần thay toàn bộ hệ thống hay cho mô hình tự viết SQL tùy ý.

Vấn đề chính là **độ tin cậy của dữ liệu đầu vào** và **hợp đồng đầu ra của trợ lý**. Người dùng hỏi một việc hẹp nhưng hệ thống có thể mở rộng sang nhiều phân tích hỗ trợ, nhiều biểu đồ và lời kết luận chung. Chất lượng báo cáo phải được đo theo mức độ trả lời đúng câu hỏi, chứ không theo số biểu đồ hoặc độ dài.

## Ưu tiên ở nền tảng dữ liệu

1. **Chống mất sự kiện trước khi cam kết Kafka offset.** `kafka-consumer/consumer.py` bật `enable_auto_commit=True`, trong khi `flush_batch` chỉ ghi cảnh báo khi PostgreSQL hoặc MinIO lỗi và vòng lặp vẫn xóa buffer. Có thể mất dữ liệu mà consumer không thử lại. Dùng manual commit sau khi ghi bền vững, idempotency theo topic/partition/offset, retry và dead-letter; quyết định rõ PostgreSQL hay Bronze là nguồn ghi bắt buộc.
2. **Đồng bộ cả cập nhật và xóa.** `data-sync/sync.py` upsert theo timestamp nhưng không có đường xử lý bản ghi bị xóa ở nguồn. Cần CDC/tombstone hoặc đối soát định kỳ, watermark có overlap và phép kiểm tra số lượng/checksum theo bảng.
3. **Đo độ mới dữ liệu, không chỉ sự tồn tại.** `airflow/dags/daily_pipeline_dag.py` kiểm tra bốn khóa `latest.json` có tồn tại, chưa xác nhận ngày của lần chạy, số bản ghi, chất lượng và sự nhất quán Bronze → Silver → Gold. Mỗi lần chạy nên có `run_id`, watermark nguồn, row count, thời điểm hoàn tất và trạng thái kiểm tra; chỉ công bố snapshot Gold khi toàn bộ bước qua kiểm tra.
4. **Rà cấu hình bí mật và phân quyền.** Nhiều dịch vụ có mật khẩu phát triển mặc định ngay trong mã. Môi trường triển khai phải bắt buộc secret riêng, tài khoản chỉ đọc cho phân tích, quyền ghi tách biệt cho pipeline, và không đồng bộ trường nhạy cảm vào catalog báo cáo.

## Trợ lý báo cáo nên vận hành thế nào

Luồng chuẩn: **hiểu câu hỏi → xác nhận phạm vi còn thiếu → lập kế hoạch ngữ nghĩa → kiểm tra kế hoạch → truy vấn chỉ đọc → kiểm chứng số liệu → trình bày → tinh chỉnh theo góp ý**. Mô hình đề xuất ý định và cấu trúc báo cáo; semantic catalog và máy chủ quyết định định nghĩa chỉ số, bộ lọc, mối nối, SQL hợp lệ và tính đúng của kết quả. Mỗi phiên cần lưu câu hỏi gốc, phạm vi đã chấp thuận, phiên bản dữ liệu, truy vấn, bằng chứng và các lần chỉnh sửa.

Hợp đồng hiển thị mặc định cho một câu hỏi hẹp:

- Một câu trả lời trực tiếp ở đầu: chỉ số/kết luận chính, khoảng thời gian, phạm vi và đơn vị.
- Tối đa ba điểm nổi bật, mỗi điểm có số liệu và liên kết đến phép tính đã kiểm chứng.
- Một đến ba biểu đồ **thực sự phục vụ câu hỏi**. Phân tích hỗ trợ và bảng chi tiết nằm trong mục mở rộng.
- Khuyến nghị chỉ xuất hiện khi bằng chứng đủ để đề xuất một bước kiểm tra hoặc hành động cụ thể. Không tự suy diễn nguyên nhân, dự báo hoặc lời khen/chê chung.
- Nếu thiếu dữ liệu hoặc phạm vi mơ hồ, hỏi một câu làm rõ cụ thể hoặc trả lời phần đã biết kèm giới hạn; không tạo kết luận thay cho dữ liệu thiếu.

Mã hiện tại cần xử lý tiếp:

- `analytics-api/services/insight_service.py::grounded_narrative` vẫn có thể chọn đến 12 nhận định. Đã rút tóm tắt về một nhận định chính, bỏ kết luận và khuyến nghị mặc định mang tính suy diễn; bước tiếp theo là xếp nhận định theo mức liên quan đến yêu cầu gốc và tránh lặp KPI/biểu đồ.
- `analytics-api/services/analysis_expansion_service.py` và kiểm tra chất lượng vẫn dùng sàn bốn góc nhìn. Với câu hỏi hẹp, số góc nhìn là **trần theo nhu cầu**, không phải chỉ tiêu để bù cho đủ. Phải cập nhật đồng bộ planner, kiểm tra chất lượng và UI.
- `web-ui/src/views/AnalyticsView.tsx` là màn hình trợ lý đang được ứng dụng dùng; `AiAssistantView.tsx` là luồng cũ không được `App.tsx` gắn vào. Cần gom về một luồng sản phẩm để tránh hai cách lưu/gọi báo cáo khác nhau.
- Dù có semantic guardrail, các bộ đánh giá offline hiện có vẫn cần bổ sung câu hỏi thật của người dùng, đặc biệt câu hỏi ngắn, mơ hồ, phạm vi liên vùng, thiếu dữ liệu và phản hồi “báo cáo lan man”.

## Cách nghiệm thu

Tạo tập câu hỏi thực tế gồm yêu cầu đơn chỉ số, Top N, so sánh kỳ, nhiều chi nhánh, câu hỏi thiếu phạm vi và câu hỏi không có dữ liệu. Với mỗi câu, lưu câu trả lời mong đợi và các chỉ số nguồn đã đối soát. Chấm riêng: đúng phạm vi, đúng số liệu, bao phủ yêu cầu, phát hiện không có bằng chứng, mức lặp/lan man, thời gian hoàn tất và khả năng tinh chỉnh. Chỉ triển khai rộng khi có kiểm thử end-to-end trên snapshot warehouse được gắn phiên bản và một vòng đánh giá thủ công bởi người dùng nghiệp vụ.

## Thứ tự triển khai

1. Khắc phục Kafka commit/ghi lỗi và thêm độ mới, đối soát dữ liệu.
2. Đặt hợp đồng báo cáo ngắn gọn, bỏ sàn bốn biểu đồ cho yêu cầu hẹp và siết bộ sinh nhận định.
3. Gom UI trợ lý thành một luồng, chạy bộ câu hỏi thật và đo lỗi theo từng giai đoạn agent.
4. Sau khi độ đúng ổn định mới mở thêm kiểu phân tích và tự động hóa báo cáo định kỳ.
