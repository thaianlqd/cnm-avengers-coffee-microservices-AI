# Kiểm tra báo cáo người dùng: Đà Nẵng và Hồ Chí Minh — 22/10/2026

Báo cáo gốc lúc **11:30**, session `caa3a343-b4e6-4dec-a554-9cae29495a8a`, **revision 1**, câu hỏi “so sánh doanh thu thành phố đà nẵng và thành phố hồ chí minh”. Phạm vi **toàn bộ thời gian**; người dùng không yêu cầu riêng tháng9.

**Kết luận dữ liệu: ĐẠT. Kết luận về diễn đạt/trình bày: còn các vấn đề dưới đây.** Không gọi lại LLM, không refresh hay sửa báo cáo, không sửa code sản phẩm/dữ liệu nguồn.

## Phương pháp

- Đọc đúng session đã chạy; API đăng nhập/ownership/revision kiểm quyền trước khi lấy đủ 8 trang artifact, 6 result sets bất biến.
- SQL oracle tự viết SELECT raw records của đúng hai thành phố, chạy warehouse reader trong READ ONLY REPEATABLE READ, timeout12s, rollback. Không dùng SQL compiler làm oracle.
- Đọc 16.650 đơn và 501 cửa hàng; chọn 15.994 đơn HOAN_THANH/DANG_GIAO cho doanh thu/AOV. Python cộng lại độc lập theo city/store/payment/order_type/month/store_type.
- 553 assertions về membership, từng giá trị nhóm, chart, map, facts và tổng đạt; 103 assertions bổ sung về12 key findings,3 conclusion findings,3 view findings và các phần trăm đạt. Đây là assertions cho đúng case này, không phải số test regression mới.
- Original report epoch identity639/orders633; oracle mới identity641/orders635. Mọi giá trị so sánh đều khớp nhưng **không tuyên bố cùng snapshot lịch sử**. Bản đồ đọc lại khớp epoch oracle hiện tại. Metadata snapshot không chứng minh địa chỉ thực hay upstream completeness.

## Toàn bộ biểu đồ và bản đồ

| Đối tượng | Kết quả |
|---|---|
| Cột so sánh thành phố | Đà Nẵng250.088.000đ; Hồ Chí Minh1.555.659.500đ. Chênh1.305.571.500đ, HCM cao hơn522,04484% so với Đà Nẵng |
| Donut hình thức nhận hàng | Dùng tại chỗ819.245.000đ (45,3687%); mang đi629.572.000đ (34,8649%); giao tận nơi356.930.500đ (19,7664%); tổng1.805.747.500đ |
| Doanh thu theo tháng | Cả10 điểm đúng raw population hai thành phố, tổng1.805.747.500đ; Jan229.495.000→Sep178.867.000, -22,06061% |
| Doanh thu tháng × loại điểm bán | Cả30 điểm (10tháng×3loại) đúng raw population; cộng ba series mỗi tháng bằng chart tổng tháng |
| Dữ liệu store/payment không hiện thành chart | 501 cửa hàng và4 payment methods đều giữ hai thành phố, từng nhóm và tổng khớp oracle |
| Bản đồ | 501 cửa hàng (HCM429, Đà Nẵng72), 486 cặp tọa độ hợp lệ; đúng membership và doanh thu/đơn từng cửa hàng |
| Map summary | 1.805.747.500đ /15.994đơn hợp lệ =112.901,5568đ, hiển thị112.902đ. Tổng16.650đơn gồm mọi trạng thái; không dùng16.650 làm mẫu số AOV |

Các chart hỗ trợ là **tổng gộp hai thành phố**, không có tỉnh khác. Chúng không tách từng thành phố để so sánh trực tiếp kênh/tháng giữa hai bên. Có đúng số trong phạm vi không đồng nghĩa từng chart đều là một phép so sánh city-by-city.

Tháng10/2026 chưa kết thúc, điểm7.931.500đ được đánh dấu*/nét đứt. Không diễn giải cú rơi cuối đường là doanh thu cả tháng sụt tương ứng. Nhận định so sánh kỳ đầy đủ dừng tại tháng9.

## Các vấn đề tìm được

1. **UC01 — P2, OPEN:** KPI “Biến động doanh thu -21,9%” thực chất là **CHI_NHANH_CHINH** Jan216.772.000→Sep169.226.000, -21,93364%. Detail mở chỉ ghi ngày, thiếu tên subgroup. Tổng cả hai thành phố/tất cả loại điểm bán là **-22,06061%**. Đúng số nhưng có thể bị hiểu thành biến động toàn phạm vi.
2. **UC02 — P2, OPEN:** chart ba đường và conclusion synthesis nêu -21,9%/đỉnh216,8triệu mà không ghi rõ “Chi nhánh chính”. Fact refs đúng subgroup; câu hiển thị thiếu chủ thể.
3. **UC03 — P2, OPEN:** mô tả “xếp từ cao đến thấp” không đúng với cột thành phố đang theo tên: Đà Nẵng trước, HCM sau. Số tiền và membership không sai.
4. **UC04 — P3, OPEN:** stored how_to_read của donut/multiline vẫn nói về độ dài thanh. Accordion hiện tại không hiển thị field này; metadata có hướng dẫn chung chưa đúng loại chart.
5. **UC05 — giới hạn đã công khai:** độ sâu đang **4/6, partial / PLANNING_GAP**, thiếu store/payment charts; metadata có reason renderer_unsupported, dashboard reason outside_mission_grammar. Hai result sets có dữ liệu và đúng số, nhưng không được render thành chart. Không được nói báo cáo này đủ6/6.
6. **UC06 — P2, OPEN về tính hữu ích:** các chart hỗ trợ gộp hai địa bàn. Đúng scope nhưng chưa trả lời so sánh channel/trend riêng giữa hai thành phố; cần tách series theo city nếu muốn phân tích so sánh sâu hơn.

Ô KPI **819.245.000đ** là nhóm “Dùng tại chỗ”. Ô **6.297.000đ** là cửa hàng **Avengers Coffee - ĐH Tôn Đức Thắng**, không phải doanh thu tổng Đà Nẵng. Các tên này hiện khi mở “Chi tiết chỉ số”; dải KPI đầu đang ưu tiên extrema phụ thay vì hiển thị cặp tổng thành phố rõ ràng.

Những vấn đề trên được phát hiện sau nghiệm thu corpus cũ. Lần này là kiểm tra, **chưa sửa**; không dùng trạng thái DONE của PLAN để phủ nhận chúng hoặc gọi phần diễn đạt hoàn hảo. Lỗi số liệu ngoài phạm vi chưa tái hiện trong báo cáo này. Địa bàn/địa chỉ vật lý vẫn theo source chưa owner-verified như giới hạn I13 đã công bố.

## Bằng chứng

- [Metadata/report gốc](report-summary.json)
- [Đủ các dòng artifact cùng revision](immutable-result-rows.json)
- [Oracle raw chỉ đọc](warehouse-oracle.json)
- [Review dữ liệu](review.json)
- [Review nhận định và findings](narrative-review.json)
- [Map cùng revision](geography.json)
- Scripts capture.py/warehouse_oracle.py/review.py/review_narrative.py và logs ở cùng thư mục. Lần reviewer đầu sai đường dẫn metadata đã giữ review.log; sửa harness rồi đạt, không sửa sản phẩm/oracle.
