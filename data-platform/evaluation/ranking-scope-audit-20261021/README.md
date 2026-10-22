# Chẩn đoán xếp hạng, phạm vi và độ sâu — 21/10/2026

Kiểm tra trên runtime localhost:8501, mốc tham chiếu 21/10/2026. Chỉ kiểm tra: không thay code sản phẩm, cấu hình triển khai, schema hay dữ liệu nguồn. Có tạo các phiên phân tích kiểm thử tạm thời. Cả 6 lượt API dùng guided contract, tổng 0 provider calls / 0 physical provider HTTP. Các con số dưới đây là dữ liệu quan sát trong kho tại thời điểm kiểm tra, không suy ra giao dịch thực tế ngoài nguồn này.

## Kết quả chính

- Kỳ 15–21/10/2026 trả về đúng một tỉnh Hồ Chí Minh, 798.500 VND. SELECT độc lập cho thấy toàn kỳ có 10 đơn tại tỉnh này: 8 HOAN_THANH (798.500 VND), 1 DA_HUY (44.000 VND), 1 MOI_TAO (101.700 VND). Doanh thu chuẩn chỉ gồm HOAN_THANH/DANG_GIAO. Dữ liệu đơn mới nhất: 18/10/2026 03:22:18.517818 theo giá trị timestamp của kho. Không tự coi tỉnh không có bản ghi là doanh thu 0 để lấp đủ N.
- Xếp Bottom 5 tháng 9 đúng: Ninh Thuận 112.000; Sóc Trăng 183.000; Bạc Liêu 206.000; Trà Vinh 270.000; Quảng Trị 300.000 VND. Tổng 1.071.000 VND, 12 đơn hợp lệ. SQL xếp ASC, nhưng tiêu đề biểu đồ luôn ghi Top 5: lỗi nhãn.
- Các biểu đồ phụ tháng 9 hiện không giới hạn theo kết quả Bottom 5. Truy vấn hỗ trợ giữ thời gian và bộ lọc đầu vào, nhưng không mang danh sách tỉnh xếp hạng: `filters=[]`, `cohort_query_id=null`, `population_relation=related`, `purpose=context`. Payment/trend có tổng 440.072.000 VND, tức toàn bộ 55 tỉnh có doanh thu, không phải 1.071.000 VND của 5 tỉnh.
- SELECT đối chứng đúng 5 tỉnh cho cơ cấu thanh toán: QR 313.000; COD 362.000; ví điện tử 286.000; VNPAY 110.000 VND. Chỉ 6 cửa hàng có doanh thu hợp lệ trong tập này. Các cửa hàng Big C Hà Nội/Big C Hạ Long trên biểu đồ phụ hiện tại không thuộc tập 5 tỉnh đó.
- API geography lấy phạm vi đầu vào chưa có lọc kết quả xếp hạng: 55 tỉnh, 1.215 cửa hàng hiện tại; 1.160 cửa hàng có tọa độ. Lớp màu có thể lấy đúng 5 dòng kết quả, nhưng tổng quan, danh mục chọn và lớp ghim vẫn lấy mạng lưới rộng hơn. Đây là sự trộn phạm vi giữa lớp kết quả và mạng lưới.
- Bộ chọn và xác minh `city` chỉ có 16 giá trị enum, trong khi SQL tháng 9 có 55 tỉnh. Gửi đúng 5 tỉnh Bottom bằng bộ lọc IN bị `needs_input / filter_value_unknown` trước thực thi; chúng tồn tại trong dữ liệu nhưng không nằm trong enum này. Gửi Hồ Chí Minh + Hà Nội chạy thành công, 6 biểu đồ và geography đều lọc đúng 2 tỉnh, doanh thu 250.748.000 VND. Chọn nhiều giá trị được hỗ trợ nhưng danh mục phạm vi chưa đủ.

## Ba độ sâu trên cùng bài toán Bottom 5 tháng 9

| Độ sâu | Kết quả runtime | Nội dung |
|---|---:|---|
| Tập trung | 4/4 | Xếp hạng tỉnh, diễn biến ngày, chi nhánh, hình thức nhận hàng |
| Phân tích sâu | 6/6 | Thêm diễn biến theo loại điểm bán và cơ cấu phương thức thanh toán |
| Toàn diện | 8/8 | Thêm diễn biến chia theo hình thức nhận hàng và phương thức thanh toán |

Chọn độ sâu có hiệu lực và tăng góc nhìn; kết quả xếp hạng chính không đổi. Tuy nhiên cả ba đều mở rộng theo phạm vi đầu vào toàn hệ thống, chưa theo tập 5 tỉnh kết quả. `complete` chỉ chứng minh đủ số góc nhìn theo policy hiện tại, không chứng minh đáp ứng yêu cầu phân tích sâu tập Bottom 5.

Kỳ 7 ngày ở mức deep trả 2/6: một xếp hạng tỉnh và một diễn biến có hai ngày phát sinh doanh thu. Các chiều còn lại đều singleton (một cửa hàng Hutech, một phương thức COD, một hình thức giao tận nơi, một loại điểm bán), nên bị bỏ khỏi biểu đồ. Không tạo thêm nhóm giả là đúng. Mã gap hiện là LIMITED_BY_MISSION và thông báo quy nguyên nhân cho nhiệm vụ, chưa phản ánh đúng nguyên nhân singleton từ dữ liệu.

## Kiểm tra UI cấu hình

Thử trực tiếp trên tab Chrome riêng: chọn nhiệm vụ Xếp hạng; khi chiều còn “Chọn chiều”, nút “Dùng cấu hình này” disabled và có thông báo thiếu chiều. Chọn “Tỉnh/thành” thì nút bật; bấm nút cập nhật câu hỏi và hiện trạng thái đang dùng cấu hình tất định. Lỗi nút luôn không dùng được chưa tái hiện trong luồng này.

Ô “Chiều phân tích” là single select để chọn một trục xếp hạng; bộ lọc nhiều tỉnh nằm trong “Thu hẹp thủ công”. Builder dùng bản nháp riêng: cần bấm “Dùng cấu hình này” để chuyển sang câu hỏi; đổi chỉ số sẽ xóa chiều đã chọn để tránh giữ chiều không tương thích. Các hành vi này có thể gây cảm giác mất cấu hình, cần làm rõ trạng thái UI. Chưa kết luận một lỗi UI khác ngoài những gì đã tái hiện. Luồng bấm đầy đủ nhiều giá trị trên Chrome chưa được xác minh trọn vẹn do trình duyệt liên tục đổi trạng thái; bộ lọc IN được kiểm chứng bằng API thật như trên.

## Bằng chứng

- [cases.json](cases.json): request đã gửi, job/session/request IDs, 3 độ sâu, SQL thực thi, phạm vi, mẫu kết quả và tóm tắt geography. Không chứa tài khoản/mật khẩu.
- [events.json](events.json): 262 sự kiện của 5 request được đối chiếu log; không có sự kiện status=failed trong tập này. Request từ chối giá trị lọc là kết quả nghiệp vụ `needs_input`, không được coi là thành công phân tích chỉ vì HTTP/job không crash.
- SELECT đối chứng độc lập dùng reader connection, transaction READ ONLY, statement_timeout=10s, rollback khi kết thúc. Kiểm tra số tỉnh/đơn theo trạng thái, Bottom 5, doanh thu và thanh toán trong tập tỉnh; không sử dụng SQL do AI cung cấp.

## Vị trí nguyên nhân trong source hiện tại

- `analytics-api/services/analysis_expansion_service.py`: `LensBuilder.shape` kế thừa `req.filters/time`, không ghim thành viên kết quả xếp hạng.
- `analytics-api/services/analytical_resolver.py`: supporting operations được gắn related/context; cơ chế ranked companion có sẵn chỉ dành một trường hợp nhiều chỉ số requested, chưa bao phủ các chiều phụ tự sinh này.
- `analytics-api/services/geography_exploration_service.py`: `approved_context` lấy filters của requested operation, không thu hẹp theo các dòng kết quả xếp hạng.
- `web-ui/src/components/report/GeographicReportPanel.tsx`: lấy metric từ report, nhưng store layer/overview từ geography network.
- `analytics-api/metadata/semantic_catalog.json`: `city.enum` có 16 tỉnh và grounding mode enum.
- `analytics-api/services/dashboard_planner_service.py`: title của mọi ranking được thêm tiền tố `Top`, kể cả ASC/Bottom.

Hướng sửa sau khi thống nhất: giữ một tập thành viên Top/Bottom N đã xác định làm phạm vi cho biểu đồ phụ, KPI và bản đồ; so sánh với toàn hệ thống phải có nhãn và vai trò riêng. Đồng bộ danh mục bộ lọc với giá trị được cấp quyền trong nguồn, giữ kiểm tra tên chặt chẽ. Thêm kiểm chứng tổng, thành viên và phạm vi giữa các biểu đồ thay vì chỉ đếm số góc nhìn.
