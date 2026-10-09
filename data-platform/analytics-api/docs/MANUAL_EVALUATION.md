# Manual Data Platform AI V2 evaluation

> For the current one-shot policy and exact A–J live prompts, use [V2.4 manual evaluation](MANUAL_EVALUATION_V24.md). The 39-case record below is historical; current V2.4 qualification passes 86 offline fixtures.

The saved offline run passed 39/39 cases with **zero real provider, embedding, or warehouse calls**. Complex interpretations and rows are scripted fixtures. These passes validate contracts and orchestration, not live language understanding or warehouse business truth.

## Repeat the offline checks

From `data-platform/analytics-api/`, using an environment with `requirements.txt` installed:

```sh
python -m unittest discover -s tests -q
python tools/analysis_matrix.py --output docs/MANUAL_MATRIX_OFFLINE.json
python tools/analysis_matrix.py --case comparison_5_3 --case complex_weekly_comparison --case refine_add_city
```

## Later live evaluation (requires explicit authorization)

Live mode spends provider quota and reads the configured warehouse. It does not import application startup or seed vectors. It has **not** been executed for this task. Configure your normal database/provider environment; optionally enable vector retrieval. Inspect each proposed interpretation before using the UI generation action.

```sh
python tools/analysis_matrix.py --live --allow-provider-calls --case comparison_5_3 --output docs/MANUAL_MATRIX_LIVE.json
```

For each case, compare intended subject/metric/unit/time/filter/group Top N to the proposal, then compare grounded source/grain/joins, generated SQL predicates/group/order/limit, actual rows, chart scope, and cited numerical evidence. Record actual attempts/tokens/latency. Do not treat fixture row values as expected warehouse data. A success-shaped response is insufficient if its analytical meaning is wrong. The harness compares exact approved specs and result contracts; human judgment must additionally assess business truth and initial live interpretation.

## Cases

| Case | Natural-language request | Expected contract outcome | Follow-up |
| --- | --- | --- | --- |
| simple_top5 | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | — |
| small_top3 | Top 3 sản phẩm bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 3 DESC | — |
| explicit_month | Top 5 món ở Hà Nội tháng 10 năm 2026 theo số lượng | success; ranking; Top 5 DESC | — |
| comparison_5_3 | So sánh top 5 món ở Hà Nội với top 3 món ở Cần Thơ quý trước theo số lượng, kèm doanh thu | success; comparison; Top 5 DESC; Hà Nội Top 5, Cần Thơ Top 3 | — |
| per_group | Top 2 món bán chạy trong từng thành phố tháng này | success; ranking; Top 2 DESC | — |
| ascending_stores | Xếp hạng top 3 chi nhánh có doanh thu thấp nhất năm 2026 | success; ranking; Top 3 ASC | — |
| count_scalar | Số đơn hàng tháng này | success; aggregate | — |
| revenue_scalar | Doanh thu tháng này | success; aggregate | — |
| true_composition | Cơ cấu số đơn theo phương thức thanh toán tháng này | success; distribution | — |
| daily_trend | Xu hướng doanh thu mỗi ngày trong tháng 10 năm 2026 | success; trend | — |
| category_multiline | Xu hướng số lượng bán theo danh mục trong tháng 10 năm 2026 | success; trend | — |
| heatmap | Ma trận sản lượng theo danh mục và thành phố | success; heatmap | — |
| ranking_with_trend | Top 5 món bán chạy ở Hà Nội tháng này kèm xu hướng doanh thu theo ngày | success; composite | — |
| safe_customer_detail | Danh sách mã khách hàng và điểm loyalty, tổng chi tiêu | success; detail | — |
| inventory_snapshot | Số lượng tồn kho hiện tại theo sản phẩm | success; aggregate | — |
| promotion_scope | Doanh thu khuyến mãi tại Hà Nội tháng này | success; aggregate | — |
| ratings | Top 3 chi nhánh theo điểm phục vụ tháng này | success; ranking; Top 3 DESC | — |
| cancellations | Số đơn đã hủy tháng này | success; aggregate | — |
| empty | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | — |
| ambiguous_best | Cho tôi chi nhánh tốt nhất | needs_clarification; ranking; Top 1 DESC | — |
| unsupported_history | Tổng chi tiêu tích lũy khách hàng tháng này | needs_clarification; aggregate | — |
| pii_request | Danh sách khách hàng gồm email | needs_clarification; detail | — |
| adversarial_six_rows | Top 5 món bán chạy nhất tại Hà Nội tháng này | error; ranking; Top 5 DESC | — |
| english | Top 5 products by quantity sold in Hanoi this month | success; ranking; Top 5 DESC | — |
| mixed_terms | Top 5 products theo quantity_sold tại HN tháng này | success; ranking; Top 5 DESC | — |
| telex_typo | top 5 san rphaamr ban chay tai HN thang nay | success; ranking; Top 5 DESC | — |
| fulfillment_composition | Cơ cấu số đơn theo hình thức nhận hàng tháng này | success; distribution | — |
| customer_segmentation | Phân nhóm số khách hàng theo điểm loyalty | success; distribution | — |
| shift_analysis | Số ca làm theo tên ca và chi nhánh trong tháng 10 năm 2026 | success; aggregate | — |
| branch_comparison | So sánh doanh thu chi nhánh mã SITE_A với SITE_B tháng này | success; aggregate; SITE_A, SITE_B | — |
| complex_weekly_comparison | Top 5 sản phẩm theo số lượng ở Hà Nội và top 3 ở Cần Thơ quý trước, đồng thời so sánh doanh thu và xu hướng theo tuần. | success; composite; Hà Nội Top 5, Cần Thơ Top 3 | — |
| refine_top_n | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Đổi thành top 3 |
| refine_chart | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Đổi sang biểu đồ cột |
| refine_add_heatmap | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Thêm heatmap |
| refine_remove_city | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Bỏ lọc thành phố |
| refine_metric | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Đổi sang doanh thu món |
| refine_dates | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Đổi thời gian thành tháng 9 năm 2026 |
| refine_add_city | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Thêm TP.HCM để so sánh |
| refine_detail | Top 5 món bán chạy nhất tại Hà Nội tháng này | success; ranking; Top 5 DESC | Chỉ hiển thị bảng chi tiết của kết quả xếp hạng, bỏ biểu đồ |

The adversarial overflow fixture is skipped in live mode; its synthetic invalid rows are tested offline. Clarification/rejection cases should not execute business SQL. Empty results should remain empty without invented KPIs. Chart-only refinement should execute no additional SQL.
