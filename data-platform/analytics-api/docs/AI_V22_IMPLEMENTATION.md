# Data Platform AI V2.2 — implementation and offline validation

Ngày xác minh: 2026-10-06. Phạm vi: `data-platform/analytics-api/` và `data-platform/web-ui/`.

Đã chuyển production pipeline sang agent dùng native function calling để hiểu yêu cầu, khám phá semantic catalog và chọn phép phân tích logic. Server tiếp tục giữ quyền biên dịch SQL, kiểm chứng dữ liệu, tính bằng chứng và quyết định tính hợp lệ của dashboard. Toàn bộ xác minh dưới đây dùng metadata/kết quả tổng hợp và transport giả lập; chưa đánh giá độ chính xác hiểu ngôn ngữ của model thật.

## A. Starting branch / HEAD / working tree

- Branch: `branch_thaian`.
- HEAD khi bắt đầu và khi kết thúc: `e625e8e28297dccdfd7868da1183670cb87a0ef1`.
- Hai thư mục trong phạm vi sạch khi bắt đầu. Kiểm tra trạng thái/diff chỉ giới hạn hai thư mục này; không kiểm tra trạng thái nội dung của các hệ thống ngoài phạm vi.
- Không đọc, sửa, kiểm thử hay revert customer ordering chatbot. Các thay đổi chatbot có sẵn được để nguyên.

## B. Current V2.1 architecture discovered

V2.1 dùng `AnalysisPipeline` với bước tìm candidate/vector trước understanding, `understand`/hints/grammar để tạo `AnalysisSpec`, compiler và các validator, rồi presentation/synthesis. Refinement đi qua `refine_spec`; có nhánh nhờ model đề xuất SQL repair sau lỗi execution. Catalog giới hạn 4 charts, 8 series và 30 categories. Phần UI có nội dung mô tả dashboard cố định và renderer với tập chart hạn chế.

## C. Pre-LLM semantic routing retired

Production facade hiện chỉ chuyển đến `agent_pipeline.AnalysisPipeline`. Luồng này không gọi `hints`, `understand`, `refine_spec`, semantic candidate search, vector retrieval hay SQL repair. Các helper ngôn ngữ V2.1 vẫn tồn tại để giữ fixture lịch sử, được đánh dấu legacy; production chỉ dùng helper ngày tham chiếu và dựng nhãn/clarification từ catalog. UI time/branch được chuyển thành ràng buộc từ trường cấu trúc, không quét câu hỏi để đoán ý định.

Scan các module agent production mới không tìm thấy `in prompt`, `in user_message`, `in feedback`, tên thành phố của ma trận đánh giá, hoặc lời gọi router/hints đã nghỉ sử dụng. Nhánh theo operator, kiểu dữ liệu, grain, unit và feature là kiểm chứng/tính toán sau quyết định của model.

## D. New Data Analyst Agent architecture

```text
User request + explicit UI constraints
    → bounded native tool agent
    → projected semantic concepts / resolved safe values
    → typed AnalyticalQuery
    → normalized time + catalog-grounded AnalysisSpec
    → validated QueryPlan + deterministic SQL compiler + AST/security checks
    → read-only executor + result contract
    → stored result references + deterministic evidence
    → validated DashboardPlan + grounded narrative
    → report + authoritative session/refinement
```

Proposal đăng ký và kiểm chứng phép phân tích mà không chạy analytical SQL. Bước generate với proposal đã duyệt dùng đúng phép phân tích server lưu. Lookup giá trị entity, nếu model chủ động yêu cầu, là thao tác read-only riêng, tối đa 8 candidate/lượt và có counter riêng; không phải analytical query. Bộ kiểm chứng offline chặn mọi kết nối DB thật.

## E. Available semantic tools

Sáu tool nhỏ: `search_semantic_catalog`, `describe_semantic_concept`, `resolve_dimension_value`, `run_analysis`, `ask_clarification`, `finish_analysis`.

Search nhận truy vấn ngắn do model chọn; xếp hạng lexical trên nhãn/alias của catalog thực tế và phân trang. Describe chỉ trả khái niệm logic, nhãn, grain, unit, khả năng lịch sử, business filters và dimension tương thích; không trả physical schema/SQL/expression hoặc toàn bộ value list. Resolve làm việc trên một dimension đã chọn, dùng enum/safe values/alias hoặc lookup read-only có giới hạn. Concept không có dữ liệu vật lý hợp lệ bị loại khỏi discovery.

## F. AnalyticalQuery schema

`AnalyticalQuery` dùng contract Pydantic cấm field ngoài schema. Có `id`, `subject`, `operation`, `metrics`, `group_by`, `filters`, `project`, structured `time`, `granularity`, `ranking`, `order_by`, `limit`, `role`, `parent_id`, `purpose`, `replaces`, `changed_fields`.

Operator: aggregate, ranking, trend, distribution, detail, cross_tab, relationship. Tối đa 6 metrics, 4 grouping fields, 12 filters, 12 projected fields, 6 sort fields; limit 1–100. Identifier phải là tên logic và được đối chiếu catalog. Raw SQL, formulas, joins và physical references không thuộc contract. Detail không được trộn metric/grouping; ranking phải có Top N và ordering. Metrics có authoritative business filters/null population khác nhau phải tách phép phân tích, tránh âm thầm đổi tập đo.

## G. Agent tool-round behavior

Default 6 rounds, tối đa 8 tool calls/round. Lúc đầu chỉ expose search/describe/clarification. Khi đã khám phá hoặc có server state, expose resolve/run/finish. Final planning sau generate đã duyệt chỉ expose finish và tối đa 1 round; single-operation approval không cần gọi lại model.

Tất cả `run_analysis` trong batch được compile/validate trước khi một query nào được execute. Requested được ưu tiên trước supporting. Tool arguments sai nhận category lỗi an toàn để model sửa trong budget; lỗi execution/result contract dừng phần query, không sửa SQL bằng model. Nếu đã có kết quả hợp lệ nhưng hết budget/provider lỗi, report giữ kết quả đó, ghi `completion_status=partial`, limitations và cảnh báo. Proposal chưa finish hợp lệ không được tự duyệt.

Gemini giữ nguyên signed function-call parts và ghép ID của function responses trong request-local transport; không đưa thought text/signature vào session hay report. Groq dùng native tool call IDs; một attempt/provider/round, và sau primary failure dùng fallback đã chọn cho các round tiếp theo. API shape đã đối chiếu [Gemini generateContent](https://ai.google.dev/api/generate-content), [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures) và [Groq tool use](https://console.groq.com/docs/tool-use/overview), không gọi inference API thật.

## H. Semantic compiler behavior

Logical query được chuyển thành một `AnalysisSpec` có scope độc lập, ground bằng metadata/fingerprint hiện tại, build QueryPlan và compile SQL xác định. TimeSpec được chuẩn hóa sau quyết định của model theo reference date và timezone. Cross-tab dùng heatmap algebra; relationship dùng aggregate algebra cho paired observations. Explicit projected ordering đi tới SQL và numeric result-order check, với NULLS LAST. Ranking giữ đúng metric/direction/Top N; không xếp lại auxiliary metric như một ranking mới.

## I. Existing validators preserved

Giữ plan validation, SQL AST equality/semantics, read-only single SELECT, safe table/column allowlists, PII guard, approved joins/cardinality/fanout, grain/aggregation, time/business-filter rules, Top N/global/per-group limits, result columns/types/identity/order/duplicate-row checks, fingerprint và complete-cohort overflow sentinel. Cached results cũng được validate lại theo contract hiện tại. Schema fingerprint gồm physical safe values để thay đổi value catalog vô hiệu hóa session/cache cũ.

## J. DashboardPlan schema

Plan có active operation references (tối đa 8), visuals (tối đa 24 proposals), KPI evidence refs, typed evidence claims, constrained recommendation actions và removed operation refs. Visual chọn result reference, chart type, metrics, x/series fields, role, priority, purpose, optional comparison result refs. Server không chấp nhận một model tự hạ requested source thành supporting để đổi thứ tự ưu tiên.

## K. Chart types supported

Bar, horizontal bar, line, area, multi-line, donut, heatmap, grouped bar, stacked bar, 100% stacked bar, scatter và explicit table view. Validation xét grain, số dimensions, units, category/series budgets, time ordering, null/finite values, additive completeness và paired/nonconstant observations. Donut/stacked composition không suy từ Top N hoặc limited cohort. Mixed units dùng các view riêng có scope liên kết. So sánh scalar giữa nhiều results chỉ dùng cùng subject/metric/period và các population không giao nhau. Default distribution dùng bar cho average/non-additive metrics, limited cohort hoặc quá nhiều categories; chỉ dùng donut khi composition hợp lệ. Missing cells/points không bị đổi thành 0; line break theo missing values.

## L. Old chart limits and new behavior

Catalog: charts 4 → 8; series 8 → 16; categories 30 → 100. Bỏ nội dung mô tả dashboard cố định và nhánh renderer hạn chế trong AnalyticsView. Dashboard dùng priority/role và semantic dedup, không cắt `[:4]`. Đề xuất bị bỏ có reason/role/priority; các bảng kết quả được giữ để metric không biến mất khi vượt chart budget.

## M. Requested/supporting chart counts

Default tổng tối đa 8 charts. Requested có thể chiếm toàn bộ 8; supporting dùng phần budget còn lại sau requested. Một query có thể tạo nhiều chart hợp lệ từ nhiều metrics, không cần query thêm cho mỗi chart. Fixture rich tạo 6 requested charts từ 3 queries: hai city ranking có quantity/revenue và một weekly trend có hai metrics. Narrow ranking tạo 1 chart cùng KPI chênh lệch/Top N total và result table; không tạo chart phụ chỉ để đạt số lượng. Dashboard công bố số requested/supporting thực tế và số omissions.

## N. Insight engine

Math do server tính: ranking leader/gap/relative gap/selected Top N total/spread; group extrema/gap; trend first/last/change/percent/peak/trough/slope per day/volatility; complete-distribution shares/HHI; same-period population gap; Pearson trên ít nhất 3 paired observations có variance. Zero baseline không sinh phần trăm; null không bị lấp; Top N total được gọi đúng là tổng tập trả về. Auxiliary metric không được nhận nhầm leader/rank của primary metric.

Evidence ID ổn định theo operation/metric/feature/partition/comparison scope; statement chứa các số đã tính và scope đi kèm period/filter/selection. Claims phải khớp evidence ID, metric, scope, claim type và canonical statement nếu có text. Fallback summary chia lượt giữa operations và metrics, thay vì chỉ lấy first-row/first-metric. Group comparisons tìm max/min thật; trend giảm dùng diễn đạt trung tính, không gọi là tăng.

## O. Recommendation grounding

Chỉ chấp nhận các action review_gap, monitor_variation, review_concentration, investigate_relationship với evidence feature đúng tiền điều kiện. Câu khuyến nghị dùng template thận trọng, không bịa stock/profit/forecast/causality. Claim phần trăm bịa hoặc recommendation sai evidence bị reject và ghi lý do. Không có recommendation hợp lệ thì UI không tạo section giả.

## P. Metric/unit fixes

`quantity_sold`: nhãn “Số lượng sản phẩm bán”, unit “sản phẩm”, description tổng số sản phẩm. Không dùng “ly” cho mọi sản phẩm. Chart/KPI/insight lấy unit từ semantic metric; 100% composition có unit %. X/Y scatter có metric label/unit riêng. Quantity và revenue được biểu diễn đầy đủ trên linked views khi units khác nhau.

## Q. Session/refinement changes

Server lưu logical operations, compiled artifacts/results, fingerprint, reference date, DashboardPlan và compact AgentState. Approval kiểm tra cùng request signature và fingerprint; refinement kiểm tra approved session/revision/fingerprint, không tin client SQL/rows/history. `replaces` + `changed_fields` kế thừa các field không đổi từ operation server. Signature canonical hóa metric/group/filter/value order và period; duplicate/reordered calls dùng lại rows đã validate. Chart-only refinement không chạy analytical SQL. Kết quả reuse giữ `as_of` thời điểm query gốc; report timestamp không giả là thời điểm refresh dữ liệu. Provider failure lúc refine vẫn giữ các operation cũ chưa bị thay thế thành công.

Clarification dùng lựa chọn có thật và giữ known meaning. Một nested filter/time/ranking sai được đánh dấu phần cần sửa, không xóa metrics/filters/Top N hợp lệ khác.

## R. Observability

Diagnostics có pipeline version, schema fingerprint, reference/timezone, agent rounds, native provider attempts/status/category/latency/usage, semantic calls/cache hits, analytical calls/cache hits, analytical DB count, value lookup count, result reuse, feature count, chart count/types/roles, limitations, validators và total latency. Per-round có system/schema/history/semantic context/tool result/result projection characters. Provider usage vắng mặt là null; offline scripted rounds không giả làm real provider calls. Error logs không in raw provider responses, API key, DB errors hoặc thought content.

## S. Files changed

Paths dưới analytics-api:

- Production mới: `services/agent_pipeline.py`, `agent_provider.py`, `analyst_contract.py`, `analytical_query_service.py`, `data_analyst_agent.py`, `semantic_tools.py`, `dashboard_planner_service.py`, `insight_service.py`.
- Production cập nhật: `services/analysis_pipeline.py`, `analysis_catalog.py`, `analysis_contract.py`, `analysis_query.py`, `analysis_understanding.py`, `session_service.py`; `routers/ai.py`; `metadata/semantic_catalog.json`.
- Test/tool mới: `tests/agent_fixtures.py`, `tests/test_agent_v22.py`, `tools/agent_matrix.py`.
- Test/tool cập nhật: `tests/test_analysis_contract.py`, `tests/test_understanding_v21.py`, `tools/analysis_matrix.py`, `tools/analysis_coverage.py`.
- Evidence/docs mới: file này, `docs/AGENT_MATRIX_V22_OFFLINE.json`, `docs/MANUAL_MATRIX_V22_OFFLINE.json`, `docs/SEMANTIC_COVERAGE_V22.json`.

Paths dưới web-ui: `package.json`, `src/views/AnalyticsView.tsx`, `src/components/Charts.tsx`, `src/components/AnalysisMeaning.tsx`; mới `src/components/AnalystDashboardSummary.tsx`, `src/utils/analystDashboard.test.mjs`.

Không cần sửa `llm_service`, `sql_service`, `metadata_service` hoặc `vector_rag_service`: adapter mới dùng configured provider credentials/current metadata loader/read-only executor; vector retrieval không còn là prerequisite của understanding.

## T. Tests added

153 named backend agent cases: 96 metric/operator cases (32 metrics × aggregate/ranking/distribution), 15 adversarial cases và 42 orchestration/transport/cache/refinement/dashboard/evidence/extension/edge cases. Có guard chặn requests và psycopg2 thật. Fixtures trả tool decisions có cấu trúc; không giả vờ test hiểu tiếng Việt. Thêm 10 UI structural/SSR tests cho renderer, mixed units, missing values, semantic labels, dynamic summary, requested/supporting, omission và optional narrative. Các integration tests cũ chuyển sang native tool mocks; compiler/result/privacy regression vẫn giữ.

## U. Exact test results

| Kiểm tra | Kết quả |
|---|---|
| Backend unittest discover | **271/271**, 26.278 s, exit 0 |
| Agent V2.2 matrix | **153/153**, 18.994 s, exit 0 |
| Legacy 86-case matrix qua native adapter | **86/86**, exit 0 |
| UI tests: charts + understanding + agent | **20/20**, exit 0 |
| Frontend `npm run build` | **PASS**, Vite 5.4.21, 61 modules, 1.06 s |
| Frontend standalone `tsc --noEmit --pretty false` | Exit 2: **6 baseline TS2305 errors**, không có lỗi mới |
| Python compile, changed modules | **22/22**, PASS |
| Scoped git whitespace check | **PASS** (honors existing CRLF) |

Đối chiếu `tsc` trên bản archive chỉ gồm HEAD web-ui xác nhận cùng 6 lỗi: thiếu exports PipelinesData, RealtimeEvent, SystemUser, SystemRole, SystemLog trong usePlatformStore và RealtimeEvent trong StreamingView. Không thay đổi các trang/store ngoài mục tiêu AI để che các lỗi đó. Production Vite build không chạy full TypeScript checker.

Lệnh chạy lại từ repository root:

```sh
cd data-platform/analytics-api
AI_OFFLINE=1 PYTHONPYCACHEPREFIX=/private/tmp/data-platform-ai-v21-pycache /private/tmp/data-platform-ai-v21-venv/bin/python -m unittest discover -s tests -q
AI_OFFLINE=1 PYTHONPYCACHEPREFIX=/private/tmp/data-platform-ai-v21-pycache /private/tmp/data-platform-ai-v21-venv/bin/python tools/agent_matrix.py
AI_OFFLINE=1 PYTHONPYCACHEPREFIX=/private/tmp/data-platform-ai-v21-pycache /private/tmp/data-platform-ai-v21-venv/bin/python tools/analysis_matrix.py --output docs/MANUAL_MATRIX_V22_OFFLINE.json
```

```sh
cd data-platform/web-ui
npm run test:ai-charts
npm run test:ai-understanding
npm run test:ai-agent
npm run build
```

Hai code blocks đều bắt đầu từ repository root. Python venv trên là môi trường kiểm chứng tạm của phiên làm việc, không phải dependency được thêm vào repository.

## V. Offline matrix coverage

[Agent results](AGENT_MATRIX_V22_OFFLINE.json), [legacy fixture matrix](MANUAL_MATRIX_V22_OFFLINE.json), [catalog inventory](SEMANTIC_COVERAGE_V22.json).

Inventory fixture: 16 subjects, 32 metrics, 26 dimensions. Subjects: orders, promotions, order_items, products, stores, customers, payments, delivery, inventory, product_reviews, store_reviews, staff_shifts, cashier_reconciliation, customer_surveys, wishlist_favorites, hourly. Có extension energy/region/kWh được thêm vào metadata fixture mà không thêm nhánh ngôn ngữ Python. Ma trận cũ chứa tên/paraphrase tiếng Việt/Anh nhưng các expected tool decisions được script sẵn; đây là regression của contract/SQL/dashboard, không phải điểm NLP accuracy.

## W. Real provider calls

**0 Gemini. 0 Groq. 0 embedding calls.** REST shape được kiểm chứng bằng transport mocks và tài liệu công khai. Không có inference request thật hoặc token bill thật.

## X. Live warehouse mutations

**0 live warehouse queries. 0 live warehouse mutations.** DB operations trong bảng cost là mock executor invocations. Không chạy DDL/DML, migrations hoặc sửa dữ liệu Silver.

## Y. Remaining limitations

- Chưa có live language-quality/latency/cost evaluation; native schema acceptance và thought-signature interoperability vẫn cần manual provider QA. Offline tests không chứng minh dữ liệu Silver thật đúng hoặc model thật chọn đúng meaning.
- Compact expanded tool schema ở stage đầy đủ vẫn ~7.1k characters; discovery/value-resolution nhiều bước, fallback attempt và dài context là các bottleneck cần đo thực tế.
- Semantic search lexical do model yêu cầu có thể cần paraphrase/pagination; metric/dimension mới chỉ được discover khi catalog và physical metadata hợp lệ, không tự bịa definition.
- Claims/recommendations dùng canonical grounded statements và constrained actions. Cách viết prose tự do bị giới hạn có chủ ý; correlation không phải causality và không có forecast tự sinh.
- Result/chart budgets vẫn hữu hạn. Whole-cohort vượt limit bị reject để tránh gọi mẫu bị cắt là population đầy đủ; omissions có lý do và giữ bảng kết quả. Không bảo đảm mỗi câu luôn có 4–6 charts.
- Session store giữ tính chất in-memory/TTL như trước; persistence hoặc multi-worker shared state chưa nằm trong thay đổi này.
- Sáu TypeScript errors có sẵn vẫn còn. Python 3.9/LibreSSL của môi trường kiểm chứng phát warning urllib3; không dùng môi trường này để xác nhận kết nối HTTPS provider thật.

## Z. Manual live evaluation matrix — chưa chạy

Chỉ người dùng chạy matrix này khi chủ động dùng provider/warehouse thật. Chưa có PASS/FAIL hoặc token/latency thực tế cho A–L.

| ID | Câu hỏi/cuộc hội thoại | Điểm cần xác minh |
|---|---|---|
| A | top 5 món bán chạy nhất tại thành phố hồ chí minh tháng 9 | quantity metric; city canonical; year/reference interpretation; đúng Top 5; unit sản phẩm |
| B | cho tôi top 5 sản phẩm bán chạy ở Hà Nội và top 3 sản phẩm bán chạy ở Cần Thơ trong quý trước | hai scopes độc lập, cùng kỳ đã chuẩn hóa; Top 5 và Top 3 riêng |
| C | chi nhánh nào hoạt động tốt nhất tháng trước? | narrow metric clarification với lựa chọn catalog thật; giữ subject/time |
| D | cho tôi xu hướng doanh thu theo tuần trong 30 ngày gần nhất tại Hồ Chí Minh | rolling period, week buckets, revenue business filters, ordered time |
| E | top 5 sản phẩm bán chạy ở Hà Nội trong quý trước, so sánh doanh thu với TP.HCM và cho tôi xu hướng doanh thu theo tuần | giữ mọi requested part; comparison cùng metric/kỳ; chart roles/units và scope trend rõ ràng |
| F | cơ cấu số đơn hàng theo phương thức thanh toán tháng trước | đầy đủ additive distribution; không dùng Top N subset làm whole composition |
| G | so sánh doanh thu và giá trị đơn hàng trung bình của các chi nhánh trong tháng trước | metric definitions/populations hợp lệ, đa metric, VND, extrema/gap có evidence |
| H | khách hàng được chia theo hạng thành viên như thế nào? | current catalog membership dimensions/metrics, không lộ PII, snapshot/time capability đúng |
| I | top 5 tài xế theo số lượt giao và cho biết điểm đánh giá của họ | multi-metric, independent units; chỉ metric giao được gọi là ranking leader; paired-data constraints |
| J | cho tôi bảng chi tiết 20 đơn hàng gần nhất trong tháng trước | safe detail projection, explicit ordering/limit; không email/phone/address |
| K | lợi nhuận thực tế sau khấu hao của từng chi nhánh tháng trước | unsupported metric clarification; không chế công thức/mapping từ revenue |
| L1 | top 5 sản phẩm bán chạy ở Hà Nội trong quý trước | tạo session/report, ghi revision/fingerprint/as_of |
| L2 | đổi biểu đồ sang cột dọc | giữ query scope/rows, không thêm analytical DB query |
| L3 | đổi thành top 3 và thêm doanh thu của các sản phẩm đó | server-authoritative patch, giữ city/period, cập nhật Top N và multi-metric views |

Với mỗi lần chạy, ghi: prompt + reference_date/timezone/UI constraints; tool rounds/calls; analytical operations + AnalysisSpec/QueryPlan + compiled SQL; row counts/result contracts; chart count/types/roles/omissions; evidence/insights/rejected claims; clarification + known meaning; provider attempts/status/actual usage; latency, DB/value-lookup counts, reuse/as_of. Đối chiếu SQL/result trên Silver bằng cùng period/business filters; không đánh giá chỉ theo giao diện trông hợp lý.

## AA. Git status

Working tree giữ các modified/new files liệt kê ở S, chỉ trong hai thư mục được phép. Branch/HEAD không đổi. Scoped `git diff --check` sạch; không stage/commit. Các JSON evidence V2.2 được tạo riêng, không ghi đè evidence V2.1.

Kết quả scoped git status: **16 modified, 17 untracked**.

```text
 M data-platform/analytics-api/metadata/semantic_catalog.json
 M data-platform/analytics-api/routers/ai.py
 M data-platform/analytics-api/services/analysis_catalog.py
 M data-platform/analytics-api/services/analysis_contract.py
 M data-platform/analytics-api/services/analysis_pipeline.py
 M data-platform/analytics-api/services/analysis_query.py
 M data-platform/analytics-api/services/analysis_understanding.py
 M data-platform/analytics-api/services/session_service.py
 M data-platform/analytics-api/tests/test_analysis_contract.py
 M data-platform/analytics-api/tests/test_understanding_v21.py
 M data-platform/analytics-api/tools/analysis_coverage.py
 M data-platform/analytics-api/tools/analysis_matrix.py
 M data-platform/web-ui/package.json
 M data-platform/web-ui/src/components/AnalysisMeaning.tsx
 M data-platform/web-ui/src/components/Charts.tsx
 M data-platform/web-ui/src/views/AnalyticsView.tsx
?? data-platform/analytics-api/docs/AGENT_MATRIX_V22_OFFLINE.json
?? data-platform/analytics-api/docs/AI_V22_IMPLEMENTATION.md
?? data-platform/analytics-api/docs/MANUAL_MATRIX_V22_OFFLINE.json
?? data-platform/analytics-api/docs/SEMANTIC_COVERAGE_V22.json
?? data-platform/analytics-api/services/agent_pipeline.py
?? data-platform/analytics-api/services/agent_provider.py
?? data-platform/analytics-api/services/analyst_contract.py
?? data-platform/analytics-api/services/analytical_query_service.py
?? data-platform/analytics-api/services/dashboard_planner_service.py
?? data-platform/analytics-api/services/data_analyst_agent.py
?? data-platform/analytics-api/services/insight_service.py
?? data-platform/analytics-api/services/semantic_tools.py
?? data-platform/analytics-api/tests/agent_fixtures.py
?? data-platform/analytics-api/tests/test_agent_v22.py
?? data-platform/analytics-api/tools/agent_matrix.py
?? data-platform/web-ui/src/components/AnalystDashboardSummary.tsx
?? data-platform/web-ui/src/utils/analystDashboard.test.mjs
```

## AB. Commit / push

**NO COMMIT PERFORMED. NO PUSH PERFORMED.**

## TOKEN / COST ARCHITECTURE

System prompt: **1,659 Unicode characters**, không preload catalog/schema/value dictionaries. Có 6 generic tools. Initial stage expose 3; grounded/refinement stage expose 6; approval final planning expose 1. Schema được expand references và bỏ titles/defaults; kết quả semantic có pagination theo concept, không gửi toàn bộ catalog. Search chạy trên server, chi phí prompt phụ thuộc phần trả về thay vì kích thước warehouse/catalog.

Server giữ full rows/SQL/report. Context model gồm request, explicit scope, compact logical operations/result refs và tối đa 4 features/operation khi refinement; không replay client history/full dashboard/full result tables. Tool result analytical gồm columns/count/scope/as_of, tối đa 4 preview rows và 16 deterministic features; giảm preview rồi features theo character budget. Duplicate discovery cache trong request; canonical query signature cache trong request/session; fingerprint/revision kiểm tra trước reuse. Không embedding như bước mặc định.

| Offline scenario | Rounds | Semantic calls | Analytical calls | Mock DB queries | Charts | System chars | Tool-schema chars/round | Tool-result chars/round |
|---|---:|---:|---:|---:|---:|---:|---|---|
| SIMPLE QUESTION | 2 | 1 | 1 | 1 | 1 | 1659 | [1605, 7145] | [295, 2265] |
| MULTI-PART QUESTION | 2 | 3 | 3 | 3 | 6 | 1659 | [1605, 7145] | [885, 9070] |
| REFINEMENT (chart-only) | 1 | 0 | 0 | 0 | 1 | 1659 | [7145] | [21] |

Result projection chars/round tương ứng: simple [0,2244], multi-part [0,9049], refinement [0]. Counts/characters lấy từ runner offline, không phải phép đo token. Tool-result characters là lượng server tạo ra trong round; chỉ được đưa tới provider nếu có round tiếp theo. Các scripts có thể emit query + finish trong cùng round; model thật có thể cần thêm discovery/resolve/result-interpretation rounds. Real provider usage ở mọi offline scenario là **null**, real provider/embedding/live DB calls đều **0**. Không có tuyên bố tiết kiệm bao nhiêu token/tiền so với model thật V2.1.

Một result set có thể nuôi nhiều visuals/KPI/insights; six charts của multi-part không làm tăng analytical queries từ 3 lên 6 và không tạo per-chart provider calls. Simple approved query bỏ final synthesis model call; approved multi-operation tối đa một finish-only round. Math, feature extraction, chart eligibility, aggregation checks, percentages/correlation và prose fact rendering do server đảm nhiệm; LLM chọn meaning/operations/evidence.

Config `AI_AGENT_*` (default; accepted range):

| Suffix | Default | Range |
|---|---:|---|
| ROUNDS | 6 | 1–8 |
| OPERATIONS | 8 | 1–8 |
| DB_QUERIES | 12 | 1–16 |
| CHARTS | 8 | 1–8 |
| CATEGORIES | 100 | 2–100 |
| SERIES | 16 | 2–24 |
| TOOL_RESULT_CHARS | 6000 | 1000–12000 |
| PREVIEW_ROWS | 4 | 0–8 |
| CONTEXT_CHARS | 48000 | 8000–96000 |
| TOOLS_PER_ROUND | 8 | 1–12 |
| VALUE_LOOKUPS | 4 | 0–8 |

Giới hạn model field/schema và compiler/security vẫn áp dụng dù config lớn hơn. Budget reached tạo lỗi an toàn hoặc partial report có limitations từ results đã kiểm chứng; không âm thầm bỏ requested meaning. Các bottleneck cần đo live tiếp theo: expanded schemas, số discovery rounds, accumulated compact history, provider fallback latency và thao tác entity lookup. Không tăng số lượt chỉ để đủ số biểu đồ.
