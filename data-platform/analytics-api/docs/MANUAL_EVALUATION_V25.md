# Data Platform AI V2.5 — ma trận live A–L

Chưa chạy các trường hợp này với provider hoặc kho dữ liệu thật. Các kết quả trong `V25_QUALIFICATION.json` dùng quyết định scripted và dữ liệu giả lập để kiểm tra hợp đồng, compiler và orchestration. Chúng không chứng minh khả năng hiểu ngôn ngữ của Gemini, token thực tế hay latency live.

Chạy qua giao diện Data Platform sau khi tự triển khai phiên bản này. Gửi câu hỏi, kiểm tra phần “AI hiểu yêu cầu”, duyệt kế hoạch, rồi xem dashboard và bằng chứng. Các trường không ghi riêng bên dưới để **Tự động**, độ sâu mặc định **Phân tích sâu**.

| Test | Câu hỏi / lựa chọn | Kết quả cần kiểm tra |
| --- | --- | --- |
| A — focused nhỏ | `top 5 sản phẩm bán chạy nhất tại thành phố hồ chí minh`; độ sâu Tập trung | Ranking số lượng sản phẩm; HCM được ground thành giá trị catalog; Top 5; all_time khi không có thời gian; ít hỗ trợ, bảng giữ đủ metric. |
| B — deep nhỏ | Cùng câu hỏi A; Phân tích sâu | Giữ ranking chính; thêm các góc nhìn sản phẩm/category/store/trend có ích khi hợp lệ. Không lặp biểu đồ để đủ số lượng. |
| C — orders | `phân tích tình hình đơn hàng TP.HCM tháng này` | Một kế hoạch nhất quán về đơn hàng/bán hàng, trend, chi nhánh, khách mua và context thực sự được catalog hỗ trợ. Khách mua trong kỳ khác khách đăng ký. |
| D — store health | `chi nhánh TP.HCM nào đang hoạt động tốt và chi nhánh nào cần chú ý trong tháng này?` | Giải thích chỉ số, baseline, thời gian và cohort. Không tạo điểm tổng hợp; doanh thu/volume cao không tự chứng minh tốt. Nếu chưa đủ tín hiệu hoặc exposure tương đương, nêu chênh lệch peer và giới hạn, hoặc làm rõ định nghĩa “tốt”. |
| E — shipper | `phân tích đội ngũ shipper trong tháng này` | Nhận diện delivery nhưng làm rõ lịch sử chưa có: hiện catalog chỉ có tổng chuyến và điểm shipper dạng snapshot. Không đổi tháng này thành all_time âm thầm, không tạo SLA/thời gian giao/tỷ lệ giao thành công. Có thể lập yêu cầu mới toàn bộ thời gian để xem hiện trạng. |
| F — voucher | `phân tích tình hình sử dụng voucher trong tháng này` | Các lens usage, discount, voucher revenue và breakdown/trend hợp lệ. Usage gồm mọi trạng thái; các metric tiền dùng population riêng. Không suy ra ROI hoặc redemption rate. |
| G — payments | `phân tích cơ cấu và xu hướng thanh toán quý trước` | Tập đầy đủ cho cơ cấu, calendar quarter đúng, trend có grain phù hợp. Không gộp count và tiền trên cùng trục đơn vị, không coi ngày thanh toán là ngày đơn hàng. |
| H — comprehensive | `đánh giá toàn diện hoạt động kinh doanh TP.HCM quý trước`; Phân tích toàn diện | Một investigation có các domain liên quan, hướng đến 6–8 view nếu đủ bằng chứng. Dashboard theo domain/mục đích; không chọn domain ngẫu nhiên để đủ quota. |
| I — yêu cầu lớn tường minh | `đánh giá hoạt động TP.HCM quý trước, so sánh Hà Nội, phân tích chi nhánh, sản phẩm, khách hàng, voucher và giao hàng`; Phân tích toàn diện | Mọi phần tường minh là requested, kể cả ở focused. Không bỏ phần giao hàng lịch sử: hiện phần này cần làm rõ vì snapshot. Nếu hơn 8 operation, đề nghị chia yêu cầu. Không thực thi một report thiếu phần requested. |
| J — unsupported | `lợi nhuận thực tế sau khấu hao theo chi nhánh` | Quyết định unsupported với lý do chỉ số chưa có. Không tự viết công thức lợi nhuận; không analytical SQL. |
| K — refinement | Từ report bán hàng HCM deep đã duyệt, gửi `thêm phân tích voucher` | Một lượt AI mới; giữ requested cũ, period/population cũ. Voucher có population khác phải ghi `related` và qua validator. Refinement không hợp lệ giữ nguyên report/revision đã duyệt. Đổi biểu đồ bằng control dùng lại kết quả, không gọi AI/SQL. |
| L — override có cấu trúc | `phân tích tình hình bán hàng`; domain Đơn hàng và doanh thu; thời gian Quý trước; scope chọn Thành phố = Hồ Chí Minh | Cả ba lựa chọn có thẩm quyền. Kế hoạch mâu thuẫn bị từ chối, không đổi domain/time/population. Kiểm tra duyệt dùng lại đúng payload lúc lập kế hoạch. |

Với A–L, mỗi lượt lập kế hoạch hoặc refinement ngôn ngữ được phép tối đa **1 provider call**, **0 repair/fallback/escalation/post-result synthesis**, **0 embedding call**, **0 analytical SQL lúc proposal**. Duyệt kế hoạch gọi **0 provider** và chỉ thực thi SQL được compiler tạo, kiểm chứng và đọc trong transaction readonly. Lookup giá trị scope là tra cứu riêng có giới hạn, không phải analytical SQL.

Ghi kết quả từng test trong bảng sau; không thay token thiếu bằng ước lượng:

| Test | Status / lý do | Provider calls | Input tokens | Output tokens | Serialized context chars | Domain packs | Requested | Supporting | Omitted supports | DB queries sau duyệt | Chart count / types | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Chưa chạy | | | | | | | | | | | |
| B | Chưa chạy | | | | | | | | | | | |
| C | Chưa chạy | | | | | | | | | | | |
| D | Chưa chạy | | | | | | | | | | | |
| E | Chưa chạy | | | | | | | | | | | |
| F | Chưa chạy | | | | | | | | | | | |
| G | Chưa chạy | | | | | | | | | | | |
| H | Chưa chạy | | | | | | | | | | | |
| I | Chưa chạy | | | | | | | | | | | |
| J | Chưa chạy | | | | | | | | | | | |
| K | Chưa chạy | | | | | | | | | | | |
| L | Chưa chạy | | | | | | | | | | | |

Kiểm tra thêm trước khi dùng kết luận: điều kiện trạng thái của metric, non-null population, đơn vị, complete/Top N/limited, số quan sát, null buckets và evidence refs. Baseline peer là trung bình/trung vị **giữa các nhóm đã kiểm chứng trong cùng operation**; không phải tổng hoặc trung bình có trọng số của toàn doanh nghiệp. Peer bị chặn khi ranking, limit, truncated, thiếu giá trị, thiếu nhóm hoặc không đủ sample được metadata yêu cầu.
