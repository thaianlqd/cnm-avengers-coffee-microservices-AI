# Explainable investigations — Data Platform

The former prompt explicitly discouraged extra queries after the top-level question was answered. Supporting operations also required identical subject IDs, so a validated order-to-line-item relationship could not support an investigation into items sold. A two-row city comparison therefore produced one chart and one finding, repeated in several report sections.

The agent now selects bounded supporting breakdowns, temporal views and composition for open analytical questions from discovered catalog concepts. Narrow single-number requests remain narrow. There is no city/product keyword routing, fixed query sequence, minimum chart count or predetermined dashboard. Default budgets remain six model rounds, eight operations/charts. The request includes the operation/chart budget.

Subject discovery returns paginated related subjects and a small set of physically available metrics. Related cohort eligibility derives from the catalog's checked child-to-parent many-to-one paths. Supporting queries must preserve the parent's explicit filters and resolved period, and metric-owned time columns, business filters and required-non-null predicates must agree. Reverse fanout, unrelated scopes and different metric populations remain rejected. Different grains and metric definitions are reported separately; order revenue and line revenue are not assumed to reconcile.

Proposal and report responses include `analysis_explanation`, derived from actual catalog definitions, query plans, result counts and evidence IDs. The UI shows sources, metrics/units, dimensions, filters, time, business predicates, selection scope and valid chart reasons. Each reported evidence reference points to its stored numerical values and statement. This is an auditable explanation of selected analysis, not private model reasoning or an assertion of causality. Unavailable metrics require clarification rather than invented formulas.

The repeated finding/comment is replaced with a numeric feature where applicable and a scope/evidence reference. The UI removes insight cards that exactly repeat findings. Large bar/line axis labels use compact Vietnamese scales; tooltips preserve exact values. A line chart still requires ordered historical observations. A donut requires complete nonnegative additive composition; Top N is not a whole-population share. Additional graphs require distinct supporting questions and validated data.

Validation: 292/292 backend tests (26.900 s) before the final budget-only payload addition; 13/13 frontend agent tests and Vite build pass. The new offline end-to-end investigation executes five validated operations and emits bar, horizontal-bar, multi-line and donut views plus per-operation evidence explanations. Tests cover cross-subject scope preservation, matching metric populations and reverse-path rejection. These are scripted orchestration tests, not live model-language evaluations. No new provider inference or analytical warehouse query is run by the agent for this change.

## Five manual scenarios

Use a new proposal/report after reloading the rebuilt UI. Review the selected scope and period before approving execution. Actual chart counts depend on availability, returned rows and validation.

1. **Regional sales investigation**
   > So sánh doanh thu Hà Nội và TP.HCM trong quý trước. Phân tích đóng góp của từng cửa hàng, top 5 món theo số lượng trong mỗi thành phố, doanh thu của các món đó và xu hướng doanh thu theo tuần. Giải thích nguồn dữ liệu, cách tính và dẫn chứng cho từng nhận định.
   Expect a city comparison, branch/item views and an ordered historical view when available. Currency and quantity use separate views. Rankings are scoped per city; no Top N population-share claim.

2. **Product mix**
   > Trong 30 ngày qua, món nào đóng góp nhiều doanh thu nhất và món nào bán nhiều nhất? Phân tích theo danh mục và thành phố, hiển thị top 10 món, đồng thời tính cơ cấu doanh thu trên toàn bộ danh mục. Giải thích khác biệt giữa doanh thu và số lượng bán.
   Expect distinct metric units, ranking plus complete category composition if valid; do not label the top ten as the full product population.

3. **Temporal investigation**
   > Phân tích doanh thu từ 01/04/2026 đến 30/09/2026 theo tháng và thành phố. Cho biết các kỳ tăng giảm, cửa hàng đóng góp nổi bật và những dữ liệu nào cần kiểm tra thêm trước khi kết luận nguyên nhân.
   Expect ordered temporal comparisons, scoped store context and quantified changes. Observed changes must not be described as proven causes.

4. **Payment analysis**
   > Phân tích số giao dịch và doanh thu thanh toán theo phương thức trong quý trước, so sánh Hà Nội và TP.HCM. Cho thấy cơ cấu phương thức, xu hướng theo tuần và giải thích phạm vi giao dịch nào được tính vào từng chỉ số.
   Expect compatible payment metrics, a composition view only for a complete population, and temporal grouping if historical metadata exists. Payment and order revenue must not be conflated.

5. **Current inventory and unsupported history**
   > Phân tích tồn kho hiện tại theo nguyên liệu và địa điểm: nguyên liệu nào có số lượng tồn thấp, địa điểm nào đáng kiểm tra trước? Nêu rõ có dữ liệu ngưỡng cảnh báo hay không. Nếu không có lịch sử tồn kho thì không vẽ đường xu hướng và giải thích dữ liệu còn thiếu.
   Expect catalog-backed current stock/threshold metrics. Missing thresholds or history must be disclosed/clarified, never guessed or fabricated into temporal charts.

Final validation/deployment: 174/174 agent tests pass after the explicit operation/chart budget addition (21.481 s); targeted multi-subject report regression passes after including all validated plan-join sources in explanations. Both Docker images built, including the proposal-step explanation panel. API/web were recreated with `--no-deps`. A proposal-only check in the new API container using actual local schema metadata validates four operations (city, store, item-per-city ranking, weekly trend) and four explanations, with zero analytical queries, row lookups or provider HTTP requests.
