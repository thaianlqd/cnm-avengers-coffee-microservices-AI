# V2.4 manual live evaluation — not run by Codex

Review Step 2 before approving SQL. Record actual provider calls/attempts/tokens/latency and compare all requested populations, metrics, units, time and Top N. A new proposal or natural-language refinement permits one total provider attempt, including failures. Approval/report rendering permits zero. A failed requested contract ends the turn; only an explicit manual retry starts another turn.

| Case | Exact prompt | Expected planning behavior |
|---|---|---|
| A | top 5 sản phẩm bán chạy nhất tại thành phố hồ chí minh | 1 call; proposal_ready; quantity ranking, Top 5, HCM; omitted time = all_time; 0 repair |
| B | top 5 món bán chạy nhất tại thành phố hồ chí minh tháng 9 | 1 call; month semantics, Top 5; reference date decides the recent occurrence |
| C | cho tôi top 5 sản phẩm bán chạy ở Hà Nội và top 3 sản phẩm bán chạy ở Cần Thơ trong quý trước | 1 call; two independent ranking populations/limits; same previous quarter |
| D | chi nhánh nào hoạt động tốt nhất tháng trước? | 1 call; narrow clarification of the metric defining best; retain subject/previous month; 0 SQL |
| E | cho tôi xu hướng doanh thu theo tuần trong 30 ngày gần nhất tại Hồ Chí Minh | 1 call; historical revenue, weekly grain, rolling scope and HCM filter |
| F | top 5 sản phẩm bán chạy ở Hà Nội trong quý trước, so sánh doanh thu với TP.HCM và cho tôi xu hướng doanh thu theo tuần | 1 call; preserve all requested operations, ranking population, comparison and weekly scope |
| G | phân tích tình hình bán hàng tại Hồ Chí Minh trong quý trước | 1 call; bounded useful requested/supporting analyses in the same decision; no chart filler |
| H | phân tích cơ cấu và xu hướng thanh toán trong quý trước | 1 call; complete compatible payment composition and historical trends; keep payment/order measures distinct |
| I | lợi nhuận thực tế sau khấu hao theo chi nhánh | 1 call; unsupported when that metric is absent; no invented formula; 0 SQL |
| J | Start from Top5 HCM, then “thêm doanh thu”, then “thêm xu hướng theo tuần” | 1 call per natural-language refinement turn; inherit unchanged scope; no repair; invalid changes preserve the approved report |

For A/F/G, also inspect optional work: at most six supports per requested parent in deep mode (three in focused mode), eight operations overall, twelve SQL queries, eight charts. Invalid support should be omitted independently and explained. Narrow scalar/detail requests need not meet an artificial chart minimum. An investigation can produce four views; a meaningful complex plan can produce six or more. Every chart must have a validated source and distinct question.

Desired A proposal diagnostics: `provider_call_count=1`, `provider_attempt_count=1`, `contract_repair_count=0`, `provider_fallback_count=0`, `model_escalation_count=0`, `db_query_count=0`, `status=proposal_ready`. After approval the new phase has `provider_call_count=0`; the proposal's original diagnostics are preserved separately. Actual token fields come only from provider telemetry and may be null.

Use the chart presentation selector to switch column orientation or line/area: zero provider and zero SQL calls. An incompatible choice must leave the prior report/revision unchanged. Top N must not become whole-population donut/100% composition. Check separate units, time ordering, empty results, duplicate views and evidence references.

Follow-up filter/time checks: canonical and qualified city names must retain the same population, including when `AI_AGENT_VALUE_LOOKUPS=0`. Unknown filter values must return `needs_clarification`, a filter label and bounded safe choices, with no analytical SQL and no provider repair. Choices explicitly replace the unresolved value; approval remains unavailable until a valid proposal exists. Optional unknown filters must not suppress requested work. If a refinement needs clarification, the approved report/revision and its period/Top N must survive. Missing required time fields still fail with a precise path (for example `time.mode`) instead of defaulting an explicit period to all_time. Diagnostics `filter_resolutions` expose catalog dimension IDs, status and lookup usage only, never raw model-selected values.

Offline reproduction, from `data-platform/analytics-api`:

```sh
AI_OFFLINE=1 python -m unittest discover -s tests
AI_OFFLINE=1 python tools/one_shot_matrix.py
AI_OFFLINE=1 python tools/analysis_matrix.py --output docs/V24_ANALYSIS_MATRIX.json
```

From `data-platform/web-ui`:

```sh
npm run test:ai-charts
npm run test:ai-understanding
npm run test:ai-agent
npm run typecheck
npm run build
```

Full architecture, results and limits: [AI_V24_IMPLEMENTATION.md](AI_V24_IMPLEMENTATION.md). Offline fixtures establish contract/orchestration behavior; they do not establish live semantic accuracy or warehouse facts.

Deep-mode follow-up: reload the UI and leave “Phân tích sâu · 5–6 góc nhìn” selected. Create a new proposal for the original city comparison, then inspect monthly revenue/orders, buying customers, product ranking and promotion usage where compatible. Repeat with payments, inventory, customers, stores and other available subjects. Check that every proposed operation is present before approval and the initial decision still uses one provider attempt. A report with insufficient data may have fewer views; empty, duplicate or invalid views must not be fabricated. Registered-customer history and current spending snapshots must be labelled separately. Change the report scope, then verify all retained supports match the new filters/time; compatible cached results should survive a wording-only refinement.
