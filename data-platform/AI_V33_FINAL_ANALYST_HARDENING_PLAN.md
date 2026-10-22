# V3.3 — Kế hoạch hardening cuối cho AI Data Analyst

Ngày review: **16/10/2026, Asia/Ho_Chi_Minh**. Trạng thái: **PLAN ONLY — chưa triển khai**.
Người thực hiện tiếp theo: Claude. Đây là đặc tả thực thi; không phải báo cáo đã hoàn thành V3.3.

## 1. Tóm tắt điều hành

Giữ kiến trúc Hybrid hiện tại: catalog có quản trị → semantic intent → resolver → compiler → SQL read-only → artifacts → bằng chứng → báo cáo. Vấn đề chính là **quyền quyết định khả năng phân tích đang phân tán**, không phải thiếu một planner mới. Hợp nhất chính sách vào `CompatibilityIndex`/`AnalyticalResolver`, mở rộng protected preflight contract hiện có, rồi để UI, forecast, Risk, chart và verification tiêu thụ cùng quyết định đó.

Kết quả mục tiêu: một lần bấm trả báo cáo hữu ích hoặc CLARIFY/REDIRECT/UNSUPPORTED; lỗi truyền tải có dự phòng được phục hồi trong cùng tác vụ; không sửa prompt theo từng câu nghiệm thu. Chỉ công bố READY thực thi sau khi nghĩa yêu cầu đã đủ và mọi kiểm tra tĩnh đã qua. Không hứa READY đồng nghĩa dữ liệu chắc chắn đủ hoặc provider chắc chắn hoạt động (§9).

Có **9 phase**, khoảng **40–50 file sản phẩm/cấu hình**, cộng khoảng **15–20 file test/eval/fixture** được sửa hoặc thêm có mục đích. Không tạo hệ semantic song song, không thay Spark/Gold/ingestion, không đổi thuật toán forecast đang hoạt động, không mở rộng sang causal inference hay thống kê suy diễn mới.

## 2. Nhánh, HEAD và phạm vi bằng chứng

| Kiểm tra | Kết quả phiên review |
|---|---|
| Repository | `cnm-avengers-coffee-microservices-AI` |
| Branch | `branch_thaian` |
| HEAD đã review | `ee8a00b1c584dbacb25f54755c98205efe1f5e8a` |
| Remote sau `git fetch origin` | `origin/branch_thaian` = cùng SHA; ahead/behind **0/0** |
| Working tree trước review | Sạch |
| Phạm vi thay đổi phiên này | Chỉ tài liệu này; không commit/push, không sửa code/config/secret |

Đã đọc `CLAUDE.md`, `.claude/rules/{general,data-platform,token-budget}.md`; không có AGENTS.md áp dụng trong phạm vi. Giữ nguyên Kubernetes, chatbot, branch khác, schema và dữ liệu. Credential chỉ được cấu hình qua môi trường Data Platform; không đọc `.env` hay lấy secret từ runtime chatbot.

Phân biệt nguồn bằng chứng:

- **CODE**: mã tại HEAD trên, là nguồn sự thật về hành vi.
- **PROBE**: introspection catalog/kho chỉ đọc và preflight `AI_OFFLINE=1`, reference `2026-10-16`; không có provider call. Snapshot kho lúc `2026-10-16T14:47:49Z` = `21:47:49` giờ Việt Nam.
- **TEST**: phiên này chạy 116 test backend thuộc V3.2/forecast/query-batch/workspace: **115 pass, 1 fail** tại `tests.test_workspace_v31.PreflightTests.test_hot_path_latency_and_no_io`, p95 **86,1 ms**, yêu cầu `<50 ms`. Chưa kết luận nguyên nhân do tải máy hay thuật toán. 36 test frontend mission/report/jobs/workspace **36/36 pass**.
- **HISTORY**: tài liệu V3.2 báo 913 backend test với 4 lỗi cũ; frontend 153/153, build/typecheck pass. Phiên này **không chạy full suite, build, browser acceptance hay provider thật**. Không coi số lịch sử là kết quả mới.
- `AI_V32_MANUAL_TEST.md` là kịch bản 19 ca và nhóm C2, không phải nhật ký pass/fail của những câu mới trong yêu cầu. Các timeout và lỗi semantic được chủ dự án nêu là bằng chứng thủ công; phiên review chỉ tái hiện các phần deterministic, không khẳng định đã tái hiện lỗi provider live.

## 3. Kiến trúc hiện tại đã xác minh

Quy ước đường dẫn trong tài liệu: `A/` = `data-platform/analytics-api/`; `W/` = `data-platform/web-ui/`. Mọi tên dưới đây tồn tại tại HEAD; tên dự kiến thêm được ghi rõ **mới**.

| Thành phần | File và điểm vào hiện tại | Vai trò thực tế |
|---|---|---|
| UI thật | `W/src/App.tsx::renderActiveView` → `W/src/views/AnalyticsView.tsx` | State câu hỏi/mission/report nằm trong AnalyticsView, **không** ở zustand store. `AiAssistantView.tsx` là view cũ không được App route vào. |
| State/run/history | `AnalyticsView.tsx::{aiInput,handleProposePlan,handleExecuteAiReport,handleOneClick,handleResetToNewPrompt,handleFollowUpRefine,handleSelectVersion}` | Hai bước propose→approve→generate đang được nối vào nút chính; one-click hiện được dùng khi resume record. History, reportVersions, refinementChat là các state riêng. |
| Input/missions | `W/src/components/workspace/{AnalystWorkspace,MissionPicker,MissionInputBuilder,AnalysisScopePanel,QuestionPreflight,CapabilityDrawer}.tsx` | `preflightPayload`, `runRisk`, `fix`; builder dùng metadata server. Risk có scan và deep action. |
| Logic UI | `W/src/utils/{missionWorkspace,preflightPresentation,analysisInput,analysisJobs,workspacePresentation}.mjs` và `.d.ts` tương ứng | `switchMissionDraft`, `buildGuided`, `guidedActive`, `workspaceRequestFields`, `createPreflightClient`, `preflightView`, `applyFix`, `runAnalysisJob`. Abort/sequence cho preflight; idempotency và GET polling cho jobs. |
| HTTP | `A/routers/ai.py` | `ai_capabilities`, `ai_preflight`, `ai_risk_watch`, `submit_analysis_job`, `bounded_propose_plan`, `generate_executive_report`, `_invoke`, `reconcile_report`. DTO ở `A/common.py::{AiTextToReportRequest,AiPreflightRequest,AiGuidedContract,AiRiskWatchRequest}`. |
| Jobs | `A/services/analysis_job_service.py::{JobRepository,AnalysisJobs}` | `submit/work/status/cancel/cancel_key/finish`; owner + idempotency, Redis ở production, planning 28 s trong job 45 s, durable allowance 3 logical calls. |
| Orchestrator | `A/services/agent_pipeline.py::AnalysisPipeline` | `ui_context`, `guided_context`, `_propose`, `generate`, `report`, `refine`, `reconcile`, `request_signature`; facade `analysis_pipeline.py` xuất pipeline và `safe_failure`. |
| Early input | `A/services/preflight_service.py::{preflight_catalog,run,auto_guided}` | Advisory 0 provider/0 warehouse query khi gõ; dùng overlay physical nếu cache thiếu. Không tương đương compiler đã kiểm kho thật. |
| Mission/semantic lock | `mission_contract_service.py::{infer_mission,mission_mismatch,validate_guided,guided_intent}`; `semantic_preflight_contract.py::{contract_from_preflight,metric_locks,enforce_metric_locks}` | Guided có kiểm mission riêng; free text khóa alias chuẩn nhưng protected contract chưa bao phủ operations/views/report. |
| Anchors/retrieval | `request_anchors.py::{request_anchors,verify_anchors,complete_explicit_time,complete_explicit_granularity,normalize_explicit_metrics}`; `semantic_candidate_service.py::candidate_packet` | Trích bằng chứng có quản trị, retrieve ứng viên, bảo vệ nghĩa; không có quyền sinh SQL. `semantic_example_service.py`, `metadata/confirmed_analysis_examples.json` cung cấp ví dụ, không phải luật capability. |
| Planner production | `hybrid_analyst_planner.py::HybridAnalystPlanner(OneShotPlanner)::{context_payload,run,parse,merge_repair,preflight}` | Semantic envelope rồi deterministic resolve; repair có target, fingerprint, frozen fields. `one_shot_planner.py` vẫn là base; `DataAnalystAgent` là đường legacy khi chọn tường minh. |
| Semantic types | `analysis_intent.py::{AnalysisIntentEnvelope,IntentRequirement,IntentRanking,IntentForecast}`; `analyst_contract.py::{AnalyticalQuery,DashboardVisual,DashboardPlan}` | Intent chưa có REDIRECT, benchmark/expectation, statistical method/observation contract. Giữ các object này làm nghĩa truy vấn. |
| Capability | `analytical_resolver.py::{CompatibilityIndex,compatibility_index,AnalyticalResolver}` | `normalize/candidates/resolve_requirement/forecast_requirement/resolve`; sinh operations, feature bindings, requirement coverage, fingerprints. Đây là hạt nhân cần mở rộng. |
| Catalog/join | `analysis_catalog.py::AnalysisCatalog::{_relationships,path,compatible_dimensions,ground}`; `semantic_catalog_validation.py::{validate_catalog,validate_source_semantics,registry_drift}` | Catalog vật lý + overlay, many-to-one an toàn, policy Silver, source scope. `semantic_manifest_service.py::build_manifest` suy kiểu dimension từ physical metadata. |
| Mission metadata | `workspace_service.py::{metric_capabilities,mission_catalog,workspace_capabilities,mission_layout,follow_up_questions}`; `domain_intelligence_service.py::DomainIntelligence` | UI eligibility hiện khác mức kiểm soát của resolver; các lens/blueprint có capability riêng. |
| Query | `analytical_query_service.py::AnalyticalQueries::{prepare,run,run_batch,check_result}`; `analysis_query.py::{build_plans,validate_plan,compile_sql,validate_sql,validate_results}` | Prepare grounding/compile/capacity/dry-run; execute toàn tập được cho phép, validate schema/finite/grain/time/order/limits. |
| Execution/capacity | `sql_service.py::{execute_read_only,dry_run_sql,validate_sql_ast_security}`; `query_execution_batch.py::{report_snapshot,begin,connection}`; `analytical_capacity_planner.py::{AnalyticalCapacityContract,AnalyticalCapacityPlanner,dry_analysis_plan}` | READ ONLY, statement timeout, allowlist, report snapshot, giới hạn execution/response/artifacts. Không nới lỏng. |
| Forecast/Risk | `forecast_service.py::{validate_request,complete_series,forecast,backtest,report_forecasts}`; `risk_watch_service.py::{evaluate,classify,_execute}` | Forecast tất định, min history/horizon; Risk engine ngưỡng có sample guard. Deep report chưa tiêu thụ đầy đủ cùng signal contract. |
| Views | `analysis_expansion_service.py::{dashboard_policy,analysis_depth,supporting_candidates,mission_relevant,estimated_views}`; `dashboard_planner_service.py::{defaults,chart_reason,comparison_reason,build_dashboard}` | Expansion theo depth/mission; chart có kiểm unit/population/cardinality; còn floor 4 ở free form và filter mission sau render. |
| Relevance/insight | `chart_relevance_service.py::{apply,verify,mission_metric_scope,grammar_decisions}`; `derived_chart_service.py::contribution_charts`; `chart_insight_service.py::{insight,chart_insights,verify_insights,short_answer,compare_cards}` | Relevance lọc sau SQL; insight 0 AI, rationale/evidence/caveat đã có. |
| Report/verification | `insight_service.py::{analytical_features,trend_bucket_coverage,grounded_narrative}`; `analysis_quality_service.py::{assess_report,report_limitations}`; `verification_reconciliation_service.py::{reconcile,OracleRunner,verification_report,forecast_quality}` | Summary/conclusions từ evidence; structural score và independent query reconciliation đã tách. Artifacts/session/provenance được giữ. |
| Trình bày/export | `W/src/components/AnalystDashboardSummary.tsx::{AnalystDashboard,AnalystOptionalNarrative}`; `components/report/{ChartInsight,VerificationPanel}.tsx`; `ForecastPanel.tsx`; `A/services/docx_service.py::generate_report_docx` | Report có tab; kết luận hiện có thể nằm trong “Diễn giải đầy đủ” đóng mặc định. |
| Lỗi/provider | `error_taxonomy.py::{classify,analysis_stage}`; `analysis_issue_service.py::actionable_issue`; `analysis_pipeline.py::safe_failure`; `agent_provider.py::NativeAgentProvider.__call__`; `provider_budget.py::{ProviderBudget,ProviderTurn}`; `provider_credential_router.py::{credential_plan,eligible,record_failure}` | Có taxonomy, retry budget và secondary credential; semantics/counters/deadline còn mâu thuẫn (§11–12). |

## 4. Luồng thực thi hiện tại

1. `AnalyticsView` tạo input → `AnalystWorkspace` debounce POST `/preflight`; server trả `READY_GUIDED/READY_FOR_AI/NEEDS_INPUT/BLOCKED` cùng `can_submit`.
2. Nút chính truyền `onSubmit={() => handleProposePlan()}` tại `AnalyticsView.tsx`; POST `/propose-plan` → `AnalysisPipeline._propose`. Comment “default one click” không phản ánh wiring hiện tại.
3. `ui_context` resolve UI time/scope; `guided_context` validate guided hoặc chạy một phần preflight khi `natural_input && allow_deterministic_upgrade`. Chỉ bốn finding được kiểm để chặn free text ở nhánh này; không chặn toàn bộ `can_submit=false`. Client cũ/đường khác có thể bỏ qua precheck này.
4. `HybridAnalystPlanner.run`: anchors → candidate packet + protected metric locks → guided intent 0 call hoặc provider → normalize/ground → resolver → verify anchors → supporting expansion → `preflight` compile/dry-plan. Proposal không chạy truy vấn kết quả phân tích; có thể có metadata/value lookup/dry-run.
5. Session lưu intent/operations/coverage/fingerprints; generate kiểm owner, revision, request signature, schema và partial approval; chạy artifacts qua standard read-only executor rồi validate result.
6. `AnalysisPipeline.report`: analytical features → build dashboard → **chart_relevance.apply lọc theo mission** → table fallback → forecasts → chart insights/short answer → narrative/quality/verification → response/session.
7. `/analysis-jobs` đã có luồng propose→generate trong worker, durable ownership/cancel/cache; nhưng nút chính chưa sử dụng. `request_signature` hiện **không gồm `analysis_mission`**, dù mission quyết định supporting views/relevance; nguy cơ reuse cache/approval sai mission. Job payload chứa mission không khắc phục thiếu identity của plan-cache/session signature.

## 5. Nguyên nhân gốc đã kiểm chứng

| ID | Bằng chứng tại HEAD | Hệ quả/đích sửa |
|---|---|---|
| R1 | `preflight_service.run` để unsupported concept, forecast horizon/grouping, snapshot-history ở `warn`; `can_submit = not blocked` | Điều đã biết vẫn đi vào provider/planner; chuyển thành quyết định typed của cùng evaluator. |
| R2 | `validate_guided` kiểm additive/relationship/risk eligibility khác free text; resolver kiểm feature, chart kiểm metric/form sau kết quả | Cùng nghĩa yêu cầu nhưng đường nhập khác nhau có kết quả khác. Dùng cùng capabilities và obligations. |
| R3 | `chart_relevance.apply` lọc `outside_mission_evidence` sau SQL; `test_risk_mission_drops_non_risk_charts_even_if_interpreted` hiện xác nhận hành vi đó | Risk nhận revenue rồi mất chart. Thực tế report có thể vẫn success với bảng, không nhất thiết throw. Phải redirect trước provider/SQL. |
| R4 | Primary có thể dùng tới 25 s trong planning 28 s, reserve 3 s; secondary chỉ kiểm deadline còn lại, không bảo đảm cửa sổ phục hồi | Timeout dài làm dự phòng không hữu dụng. Env read-timeout 60 s không thắng `http_timeout()` khi có budget. |
| R5 | Transport tự retry 503; planner lại cấm attempts 2 nếu attempt 2 không có `credential_failover`; failover không `consume()` | Có thể gọi thành công rồi bị `provider_transport_nested`; durable 3 logical có thể tương ứng tới 6 HTTP. Một owner phục hồi và ledger HTTP riêng. |
| R6 | `semantic_repair_limit()` mặc định 2; ba vòng; `DATA_ANALYST_RECOVERY_MODEL` được dùng ở vòng resolution | Vẫn có đường semantic escalation; dừng một repair, không đổi model/credential vì nghĩa sai. Giữ fingerprint/frozen fields đang tốt. |
| R7 | `auto_guided` chỉ kiểm các slot nhận ra; câu “95%” được nâng `READY_GUIDED`; “weekly trong một ngày” cũng vậy | Không kiểm coverage toàn bộ ràng buộc/đủ kỳ. Không được bỏ expectation/benchmark/cohort chỉ vì đã bắt metric. |
| R8 | `coverage_for` lấy min/max hợp các nguồn; freshness overall lấy nguồn mới nhất; nguồn survey/review có thể cũ dù overall fresh | Capability lịch sử và partial-period cần theo nguồn/metric, không theo kho chung. |
| R9 | Free-form còn floor 4 trong expansion/quality, mission lại hạ floor theo estimated charts; grammar drop theo form | Độ đầy đủ bị đánh đồng số chart và chọn tab. Dùng requirement coverage + vai trò view. |
| R10 | Prompt edit chỉ xóa plan khi prompt rỗng; reset chưa xóa mọi active control/refinement/version state; late propose/refine không chung epoch | Chuyển mission đã được cải thiện, nhưng chưa bảo đảm toàn bộ state isolation. Test pure helper/source assertions chưa thay thế browser lifecycle. |
| R11 | `verify_insights` tự tính “matched” cho Pearson/threshold/gap bằng dạng evidence key, không recompute ở nhánh đó | Số matched có thể vượt độ kiểm thực tế. Kiểm statistic từ rows bằng verifier độc lập, không nhận dạng chuỗi là pass. |

Kết quả PROBE bổ sung: loss-only scope chưa có alias “đang lỗ” → `READY_FOR_AI`; compare “best” có revenue ở vế khác nên không clarify; AOV composition → `READY_FOR_AI`; weekly một ngày → `READY_GUIDED`; Risk revenue/orders/AOV → `READY_FOR_AI`; forecast 24 tháng theo chi nhánh có hai cảnh báo nhưng vẫn submit; garbage `dsdasds` → BLOCKED đúng. Không đưa lại garbage như một lỗi chưa sửa.

## 6. Inventory khả năng thực tế

PROBE catalog vật lý: **43/43 metric, 32 dimension, 18 subject, 22 join edges được compiler chấp nhận**. Fingerprint tại review: `626312065911175696388804647319d3f402ff2b1a7257c70f4b96feeea29363`. Đây là availability về cấu trúc, không phải mọi tổ hợp đều hợp lệ hay có dữ liệu.

| Phạm vi | Metric/nguồn đang có | Khả năng và giới hạn |
|---|---|---|
| Orders/stores/hourly | `revenue,order_count,aov,store_revenue,store_order_count,store_aov,hourly_orders,purchasing_customer_count,order_cancellation_rate,order_completion_rate`; `silver.don_hang` | KPI, compare, rank, trend theo city/store/store_type/order_type/payment_method/hour/weekday khi compatible. Revenue/AOV population `HOAN_THANH,DANG_GIAO`; order_count toàn đơn; cancellation `HOAN_THANH,DA_HUY`. Không coi cùng source là cùng population. |
| Items/products/promotions | `quantity_sold,item_revenue,product_revenue,voucher_revenue,discount_amount,voucher_order_count,promotion_redemption_count`; order lines/orders/redemptions | Cơ cấu revenue/quantity hợp lệ khi denominator đúng. Item gross (`gia_ban*so_luong`) không đồng nhất order net sau giảm giá. |
| Customers | `customer_count,total_spent`; `silver.nguoi_dung` SNAPSHOT | customer_count theo ngày tạo là cohort đăng ký trên snapshot hiện tại, không phải lịch sử tổng khách/tier/loyalty. `total_spent` là lifetime snapshot. Customer count không có city/store dimension trực tiếp. |
| Payments | `payment_count,payment_revenue`; `silver.giao_dich_thanh_toan` | Theo gateway/status và dimensions join được; population giao dịch khác order revenue. |
| Delivery | `delivery_count,delivered_count,failed_or_cancelled_delivery_count,delivery_success_rate,avg_delivery_minutes`; `silver.giao_hang` | Fact theo thời điểm nhận chuyến; success mẫu số terminal DELIVERED/FAILED/CANCELLED; CANCELLED gồm hủy/phân công lại. `total_deliveries,driver_rating` từ `silver.shipper` là snapshot. |
| Inventory | `stock_quantity,low_stock_count`; `silver.ton_kho_san_pham` SNAPSHOT | Theo sản phẩm/chi nhánh/category hiện tại; không có lịch sử tồn hoặc forecast tồn kho. |
| Reviews/staff/cash | `avg_product_rating,review_count,avg_store_rating,store_review_count,shift_count,late_count,late_shift_rate,total_cash_difference,system_cash_revenue,reconciled_shifts,large_cash_discrepancy_shift_count` | History theo fact clock, dimension tương thích; cash discrepancy không phải lợi nhuận. |
| Survey/favorites | `survey_response_count,favorite_count` | Có số lượng/nguồn, không có sentiment/CSAT/NPS đã quản trị. History rất hạn chế. |
| Association hiện có | Lens `delivery.shipper_relationship`, metrics `total_deliveries,driver_rating`, grain `driver_id` | Pearson + scatter trên snapshot, ≥3 pairs có variance; không có historical relationship cho cặp này. Cặp revenue/cancellation chưa có lens đã quản trị. |

Lịch sử quan sát chỉ đọc (MIN/MAX, **không chứng minh mọi ngày/group có đủ dữ liệu**):

| Nguồn | Khoảng ngày hiện có |
|---|---|
| Orders/payments/delivery assignments | 01/01 → 16/10/2026 |
| Cash shifts/staff shifts/store reviews | 01/01 → 02/10/2026 |
| Product reviews | 01/01 → 05/10/2026 |
| Promotion redemptions | 01/01 → 28/09/2026 |
| Surveys | 19/07 → 10/08/2026 |
| Favorites | 01/01/2026 duy nhất |

Silver SQL views được dựng trong `data-platform/data-sync/sync.py` (khối `CREATE OR REPLACE VIEW silver.*`), không phải mọi view xuất phát từ `spark-jobs/silver_transform.py`. Catalog có **21 Silver tables/views**, gồm FULL_FACT/SNAPSHOT; join order→store/customer/promotion, line→order/product, delivery→order/shipper, inventory→store/product, reviews/shifts→entity. Chỉ edges có target unique được `_relationships/path` chấp nhận; không dùng reverse one-to-many để nhân revenue. Giữ Gold presentation marts ngoài metric sources và giữ bảo vệ dữ liệu nhạy cảm dù cột PII tồn tại trong Silver.

Inventory dimension IDs: business/category `product,category,store,city,customer_role,order_status,payment_method,payment_status,promotion,payment_gateway,shift_name,attendance_status,order_type,payment_transaction_status,store_type,delivery_status,redeemed_promotion,redeemed_promotion_code`; identity/reference `product_id,store_id,customer_id,order_id,promotion_id,driver_id`; numeric attributes `loyalty_points,lifetime_spend,order_amount,stock_quantity_detail,warning_threshold`; timestamp `order_created`; cyclic grouping `hour,weekday`. Đây là inventory, không phải mọi ID được phép làm user-facing axis. `hour/weekday` cần logical categorical/cyclic type từ expression metadata, không lấy kiểu timestamp của cột `ngay_tao` như cách `build_manifest` đang suy kiểu cột nguồn.

Phân loại sản phẩm:

- **SUPPORTED**: phép tổng hợp/compare/rank/trend compatible, composition view đúng additive partition, six Risk signals, forecast các metric đăng ký, shipper association; driver exploration qua phân rã chênh lệch có dữ liệu và kỳ nền rõ.
- **REDIRECTABLE/NEAR-SCOPE**: AOV/rate composition → Compare; wrong tab → mission phù hợp; numeric/category → grouped Compare; risk revenue/AOV → Overview/Trend; câu causal → association/driver mô tả; horizon dài → gợi ý horizon tối đa (quyết định ban đầu UNSUPPORTED, sửa có chủ đích).
- **UNSUPPORTED**: profit/loss/margin/ROI không có chi phí; causal proof; ngoại cảnh vĩ mô; sentiment/CSAT/NPS chưa có metric; grouped forecast và horizon ngoài catalog; snapshot history; dimension “loại thành phố” chưa có taxonomy. Không suy lỗ từ doanh thu thấp, không tự thay bằng revenue.

## 7. Mission cuối cho người dùng

**Câu hỏi tự do · Tổng quan · So sánh · Xếp hạng · Xu hướng · Dự báo · Rủi ro & cảnh báo**.

Free-form giữ `analysis_mission=null`, không tạo mission giả trong registry. Sáu mission có nút chọn; Composition và Correlation trở thành view/method nội bộ. Giữ IDs `composition/relationship`, contracts/lenses cũ cho saved reports, modules và API compatibility; thêm metadata visibility/legacy alias, không xóa backend capability. Câu “cơ cấu doanh thu” trong free form được hiểu thành Overview với contribution view; câu association dùng method nội bộ, không ép người dùng đổi sang tab thuật ngữ thống kê.

Selected mission là preference về tác vụ, không có quyền xóa nghĩa. Khi có tác vụ chính khác rõ ràng, trả REDIRECT kèm CTA; phương pháp hỗ trợ (contribution/association/driver) không tự gây mission mismatch. Với câu nhiều nhiệm vụ, giữ requirements và chọn layout thích hợp; không ép tất cả thành một operation.

## 8. Thiết kế contract canonical, tái sử dụng object hiện có

Không thêm service capability riêng. Mở rộng `semantic_preflight_contract.py::contract_from_preflight` thành builder cho projection typed; đặt `CapabilityDecision`/`CapabilityConstraint`/`ViewRequirement` **mới trong cùng file** dùng base `analysis_contract.Contract`. Bổ sung evaluator vào `AnalyticalResolver` (tên đề xuất `evaluate_capability`, **mới**) và mở rộng `CompatibilityIndex`. `AnalysisIntentEnvelope/IntentRequirement` tiếp tục là nguồn nghĩa duy nhất; quyết định chỉ chứa references/projections của nó, không một bản sao metric/filter grammar khác.

| Nhóm dữ liệu | Trường tối thiểu/nguồn |
|---|---|
| Identity | `version,request_fingerprint,registry_fingerprint,catalog_fingerprint,policy_version,reference_date,coverage_observed_at,intent_fingerprint,plan_fingerprint`; field chưa biết là null có kiểu |
| Decision | `decision: READY|CLARIFY|REDIRECT|UNSUPPORTED`, `reason_code,user_message`, `requested_mission,effective_mission`, `provider_needed`, `validation_stage: input|resolved|compiled`, `unresolved_fields` |
| Meaning | References tới intent requirements: metric/dimension/filter/time/granularity/ranking/forecast/scope/required operations; metric locks/recognized spans từ anchors giữ nguyên |
| Capability projection | Metric semantics/unit/grain/population/source scope; dimension `number|category|date|identity`; compatible operation/grouping/method; forecast/risk specs; min periods/observations; compatible views/report obligations |
| Action | `missing_information,choices,redirect_target,context_patch,supported_metrics,suggested_metrics,suggested_questions`; choices chỉ dùng catalog compatible |
| Constraints | Danh sách `{code,requirement_id,stage:static|semantic|runtime,status:passed|pending|failed,details}`. Pending không giả thành pass. |
| Views/report | `view_requirements` gắn requirement/role/metric/grain/scope; allowed forms, fallback; `report_requirements` gồm direct answer/evidence/caveats/actions và coverage roles |

Không cho provider tự khẳng định capabilities hay READY. Provider chỉ điền phần nghĩa còn trống; server tái evaluate cùng object, giữ locks/explicit constraints. Bổ sung có giới hạn vào `IntentRequirement`: `method`, `observation_grain`, `baseline`, `expectations` khi cần; hỗ trợ optional legacy/default và schema giới hạn, không đưa tất cả metadata/capability payload vào provider context.

Metric semantics dùng **`aggregation_semantics` hiện có làm primitive**, không tạo enum nghĩa cạnh tranh:

| Semantics | Quy tắc bổ sung |
|---|---|
| `sum/count/conditional_count` | Có thể additive theo partition/grain, không mặc định mọi dimension/time đều cộng được. |
| `average/ratio` | Recompute từ fact/numerator-denominator đã quản trị; không sum/mean-of-means, không part-to-whole. `rate` là ratio có rate semantics/unit; khai báo tử/mẫu khi đã kiểm chứng công thức. |
| `distinct_count` | Chỉ additive trên partition chứng minh disjoint. `purchasing_customer_count` không cộng qua branch/ngày. `customer_count` có disjoint partition giới hạn theo từng user snapshot, không suy rộng sang mua hàng. |
| Semi-additive | Metadata `additive_over`/`non_additive_over`, ví dụ tồn kho sum theo store/product cùng snapshot, cấm sum qua time. Không cần thay SQL engine. |
| Non-additive khác | Fail closed cho contribution; cần explicit aggregation/method đã đăng ký. |

Giữ `additive` làm projection tương thích cũ, nhưng mọi consumer chính dùng compatibility theo metric + operation + grain + partition. `semantic_catalog_validation` từ chối khai báo mâu thuẫn; `semantic_manifest_service`, workspace và chart không tự suy một bộ luật khác.

## 9. Early preflight, fail-fast và giới hạn của READY

Pipeline mục tiêu: **input → cùng capability gate → READY/CLARIFY/REDIRECT/UNSUPPORTED → diễn giải phần nghĩa cần thiết → hoàn tất cùng contract → compile/SQL → validate result → views/evidence → conclusion**. Không có planner/chart/report tự quyết capability khác gate này.

Có một giới hạn cần nói rõ: **không thể bảo đảm tất cả rule tĩnh của một ý định chưa được diễn giải từ free text đã qua ngay lúc gõ**. Bảo đảm đúng là:

1. Typing preflight 0 AI/0 warehouse query áp mọi rule suy được chắc chắn từ anchors, guided slots và cached capabilities. READY ở `validation_stage=input, provider_needed=true` chỉ là được phép diễn giải; UI ghi **“Có thể diễn giải yêu cầu; chưa xác nhận thực thi”**, không badge xanh “Đã đủ điều kiện phân tích”. Pending/failed cache cũng không hiển thị READY.
2. Với guided hoặc deterministic intent đầy đủ, dùng chính resolver + `AnalyticalQueries.prepare` ở submit để compile, không provider. Chỉ `validation_stage=compiled` mới hiển thị **“Sẵn sàng phân tích”**. Typing UI chưa có physical cache hợp lệ chỉ được nhận provisional label.
3. Provider cần thiết chạy một lần trong cùng submit/job; hoàn tất nghĩa rồi **evaluate lại cùng chính sách**, không thêm bộ phân loại độc lập. Nếu phát hiện ambiguity/unsupported trong phần trước đó chưa biết, trả typed decision trước SQL. Contract revision mới có cùng request identity; không gọi AI lúc gõ.
4. Execution boundary chỉ nhận compiled decision READY và binding khớp intent/plan/catalog/policy/scope/time; frontend flags/token không tạo authorization. API jobs, propose, generate, refine, modules, Risk đều enforce trên server, không phụ thuộc `allow_deterministic_upgrade` hay `question` vs `prompt`.

**Trả lời câu hỏi kiến trúc trọng yếu:** YES cho *mọi rule tĩnh đã có đủ nghĩa và cùng snapshot catalog* tại READY compiled; **NO** cho bảo đảm báo cáo chắc chắn thành công. Các điều kiện muộn hợp lệ phải được đánh dấu `runtime_checks_pending`:

| Chỉ biết sau I/O/kết quả | UX/terminal response |
|---|---|
| DB/provider/Redis unavailable, deadline/cancel; schema/coverage đổi sau preflight | Typed runtime failure/recheck, giữ input; không đổi thành user-input invalid. |
| Filter name cần safe lookup, row count/cardinality thực khác estimate | Lookup trước compiled READY khi có thể; capacity thực vượt → có lý do và sửa scope, không silently truncate. |
| No rows, NULL aggregate/zero denominator, insufficient observed complete periods, sparse history | INSUFFICIENT_DATA/HISTORY, alternative period/cadence; không claim trend hoặc forecast. |
| Pearson <3 valid pairs, zero variance, incompatible/thiếu paired entities | Không xuất r; typed method/sample limitation và bảng/grouped evidence nếu vẫn trả lời được; không giả kết luận association. |
| Part-to-whole có negative/zero total, chỉ một group, too many categories/series/points | Runtime view constraint đã khai trước; dùng comparison/table/preview phù hợp, disclosure rõ. |
| Result validation/integrity/reconciliation mismatch | Chặn phát biểu/số chưa xác minh; RESULT_VALIDATION_FAILED hoặc report attention rõ, không publish như verified success. |

READY không được muộn mất toàn bộ view vì cùng additive/risk/mission/unit rule đã biết. Nếu xảy ra, đó là **contract invariant violation** của server, có telemetry/regression; không lời khuyên “hãy thử lại câu hỏi”.

Thứ tự gate: structural/privacy → unsupported **bắt buộc** (kể cả scope predicate) → missing meaning → method/metric/temporal constraints → mission redirect → READY. Trả mọi finding độc lập trong một lần; một primary decision và các blockers. Không partial-execute khi người dùng chưa chấp nhận bỏ requirement không hỗ trợ.

## 10. REDIRECT và clarification

REDIRECT là first-class field, không dùng error đỏ + `mission_mismatch` chung. CTA chuyển tác vụ hoặc đổi view/method, áp `context_patch` có kiểu; preserve câu hỏi, metric, dates, filters, scope, ranking selection có chủ đích; xóa artifacts/approval/provider result cũ. Chạy lại cùng gate trên context mới. Không rewrite tự do hoặc tự execute khi người dùng chưa chọn CTA.

CLARIFY trả một nhóm câu hỏi ngắn dựa trên clause còn thiếu, không coi metric xuất hiện ở vế khác đã giải ambiguity. “HCM revenue so với best branches” vẫn thiếu **cohort ranking metric + N nếu không được nêu**. Metric lựa chọn gồm revenue/orders/AOV/purchasing customers/cancellation khi dimension tương thích; direction phải theo câu hỏi hoặc yêu cầu chọn, không đánh đồng highest cancellation với tốt nhất.

Mixed units: chọn các panel riêng với unit/scope rõ nếu câu hỏi yêu cầu side-by-side; nếu muốn “cao hơn” trên chung thước đo, CLARIFY ý định/REDIRECT association compatible. Không tính gap VND–%. AOV composition giải thích non-additive rồi CTA Compare; metric vẫn supported. Unsupported loss scope không tự gợi ý làm như revenue thấp là loss.

## 11. Provider reliability và credential dự phòng

Giữ `NativeAgentProvider` + `provider_credential_router`; **transport là owner duy nhất của retry/failover**, planner chỉ owner semantic repair. Bỏ duplicate resend ở `HybridAnalystPlanner.run` và branch retry 503 không theo policy trong transport; mọi recovery phải qua cùng ledger (§12). Giữ đúng model/request body khi retry transport, kiểm body hash; không semantic/model roulette. Sau semantic failure chỉ một targeted repair trên slot đang khỏe; không chuyển slot do semantic failure. Bỏ production `resolution`/`DATA_ANALYST_RECOVERY_MODEL` hop; legacy giữ qua adapter test tường minh.

Chính sách mặc định dự kiến để Claude triển khai/test: planning **40 s**, HTTP propose **41 s**, job **70 s**; provider cumulative ≤**30 s**, local reserve **5 s**, primary total timeout ≤**12 s**, recovery ≤**12 s** và luôn bị chặn bởi remaining budget; cần ≥**6 s** mới bắt đầu recovery. Connect timeout ≤2 s nằm trong attempt total. Không tạo deadline mới ở mỗi attempt. Proxy hiện `W/nginx.conf` read/send 240 s đã đủ, không cần tăng. Đây là policy kỹ thuật, phải đo live; không tuyên bố chắc đạt latency khi chưa đo.

Timeout/connection/429 có Retry-After ngắn/retryable 5xx: tối đa **một transport recovery toàn submission**; ưu tiên secondary khi có. Daily quota chuyển secondary ngay, cooldown primary hiện có; không sleep đợi quota ngày. Auth/403/schema/bad request/malformed contract không tự đổi model; auth khác account không được dùng để che sai cấu hình. Hai slot hỏng → terminal provider failure đúng loại; không lần ba cho cùng payload. Có thể vẫn có một semantic repair cho **payload khác** sau một phản hồi hợp lệ, trong tổng 3 HTTP tối đa.

Credential reuse đã được triển khai một phần: compose inject `DATA_ANALYST_GEMINI_SECONDARY_KEY` từ secret môi trường được quản lý, fallback về root Gemini variable; module router không import chatbot. **Không cần tích hợp chatbot mới.** Tối thiểu: giữ env variable Data Platform, chuyển default ngầm thành explicit operator mapping, cập nhật `.env.example` bằng tên biến/giá trị rỗng; operator tự inject cùng credential đã có. Không đọc/copy file chatbot `.env`, không runtime scraping, không sửa chatbot logic, không log key/hash/key suffix hoặc dump headers/URLs chứa key. Deduplicate cùng key trong memory như code hiện tại; nếu chưa có secondary thì báo capability booleans, không giả đã kiểm dự phòng.

## 12. Ngân sách call và dừng semantic

Tách `semantic_interpretations`, `semantic_repairs`, `transport_recoveries`, **`provider_http_attempts`**; giữ `logical_provider_calls` để tương thích. Charge/reserve **trước mỗi HTTP**, kể cả timeout, retry và secondary; durable observer không chỉ tính logical primary. Một submission có tối đa 1 interpretation + 1 repair, tối đa 1 transport recovery, tổng ≤**3 HTTP**. Không 2 slots × 3 logical calls. Standalone native caller, jobs và eval dùng cùng owner budget; scripted provider reserve logical bằng adapter, không double charge.

Deterministic validation/guided/threshold scan/report/insight/reconciliation: **0 provider**. Simple exact intent: 0 khi mọi điều kiện/clause đã được hiểu. Normal semantic: thường **1 HTTP**. Không thêm call/chart hoặc synthesis sau result. Budget không reset khi reconnect/poll/refresh/cancel; job crash với trạng thái call không chắc không được replay trả phí.

Repair chỉ cho contract/format lỗi có thể sửa từ thông tin hiện có; không repair unsupported metric/method/history/user ambiguity. Giữ `issue_fingerprint`, output digest và frozen fields; trước repair phải có target sửa hữu hạn, sau repair phải giảm unresolved fields/unknown IDs mà không mất requested work. Fingerprint không đổi/identical output → STOP, không lần resolution tiếp. Format repair cùng quota repair, không thêm quota riêng. Ghi lý do và mức tiến triển, không raw model response.

## 13. Temporal, toán học và thống kê

Mở rộng `insight_service.trend_bucket_coverage` thành policy chung cho trend/change/KPI comparison/forecast; không giữ ba bản diễn giải khác nhau ở chart insight/UI/forecast. Trả bucket `{start,end,calendar_complete,selection_complete,source_coverage,status,reasons}` với status complete/partial_current/truncated_selection/coverage_unknown. Timezone theo catalog; reference/as-of cố định suốt job, tuần theo bucket SQL hiện có. Ngày hôm nay chưa complete ngay cả khi bucket end bằng ngày hôm nay.

- Tách **calendar completeness**, clipping bởi selection và freshness/availability từng nguồn. MIN/MAX không chứng minh ingestion completeness; overall fresh không làm survey fresh. Không dùng last_sync chung để khẳng định mọi nguồn đã phủ đủ.
- Khoảng ngày yêu cầu không thể tạo ≥2 comparable buckets → CLARIFY trước provider. Weekly trong một ngày không có cách đổi daily để tạo trend; đề nghị mở rộng ít nhất hai tuần đầy đủ hoặc **đổi sang số liệu trong ngày**. Một ngày theo daily vẫn chỉ một kỳ.
- Nếu cache chỉ cho upper bound đủ nhưng actual sparse, mark pending và check số complete observed periods sau query. Không nhận định trend/growth từ một kỳ, không coi missing=NULL là 0.
- Growth/compare/KPI chỉ dùng các kỳ đầy đủ cùng cadence/exposure. Nếu current partial, hiển thị riêng và so với cùng đoạn thời gian kỳ trước **chỉ khi phép đó được yêu cầu và có dữ liệu**; mặc định loại khỏi % change. Hiển thị “chưa đủ kỳ đối chiếu”, không -72% như decline kinh doanh.
- Ratio chênh lệch dùng **điểm phần trăm**; AOV weighted recompute từ fact; distinct count không sum qua overlapping groups. Signed cash metric không vào donut.
- “Tăng trưởng tốt” không có benchmark: trả mô tả tăng/giảm với caveat “chưa có chuẩn đánh giá tốt/xấu”; nếu đánh giá là yêu cầu duy nhất thì CLARIFY benchmark. Không tự đặt 3,6% là tốt.
- Numeric×numeric chỉ Pearson cho paired observations có grain đã quản trị, n≥3, hai variance >0; n<10 phải caveat. Category×numeric dùng grouped comparison đã có; không thêm ANOVA/Spearman/p-value chỉ vì prompt nhắc tới. Không encode city thành số để tính r.

## 14. Forecast guards

Giữ algorithms/selection/backtest/80% residual intervals trong `forecast_service.py`. 5 metric đăng ký hiện tại: `revenue,order_count,store_revenue,store_order_count,delivery_count`; min history day/week/month = **28/12/6**, max horizon = **31/13/6**; `allowed_dimensions=[]` hiện không hỗ trợ grouped **và** scope filter forecast theo branch. Cần gợi ý total-scope forecast hoặc historical filtered trend; không gợi ý branch forecast khi vẫn bị catalog cấm.

Validate horizon/cadence/grouping/filter/metric ngay gate 0 provider, trả mọi blocker cùng lúc. Cache có thể bác history chắc chắn thiếu, còn đủ actual complete/nonzero periods kiểm sau SQL. Zero-fill chỉ cho full-fact history có coverage đủ theo policy, không điền zero vào stale tail/unknown coverage/ngoài lịch sử; giữ clipping đầu/cuối từ `complete_series`, dùng cutoff theo nguồn. History kết thúc quá xa hiện tại phải INSUFFICIENT_HISTORY, không forecast qua gap không quan sát.

“Chính xác ít nhất 95%” lưu user expectation và thông báo **không có cam kết độ chính xác tương lai**, không đổi thành interval 95% hay bỏ silently khi auto-guided. Forecast hợp lệ vẫn READY với caveat. Report dùng MAE/RMSE/sMAPE, rolling-origin folds, naive baseline và interval level; empirical interval coverage chỉ khi thật sự đo được, còn lại null. Kiểm field mapping `forecast_quality` với output thật, không trả error_metrics trống dù backtest đã có.

## 15. Risk analysis

Giữ sáu signals registry: cancellation >8%; delivery success <90%; large cash discrepancy count >0 (>|500.000 VND|/ca); late shift >15%; low-stock count >0; store rating <3,5 với ≥5 reviews. Warning margins giữ nguyên. Đây là threshold mặc định, không điểm rủi ro tổng hợp, không anomaly detection tùy ý.

Threshold Scan 0 AI: server nhận và validate `signals` subset, không chỉ client lọc sau khi đã quét tất cả. `AiRiskWatchRequest` hiện chưa mang subset: bổ sung optional backward-compatible. Deep Risk dùng chính signal spec, minimum observations, source/time/scope và worst-entity logic của engine; không tính rating risk từ hai reviews. Snapshot tồn kho ghi “hiện trạng”, không gắn nhãn tháng 9 như lịch sử.

Risk request revenue/orders/AOV không có risk semantics → REDIRECT Overview/Trend trước provider/SQL; không ngầm thay bằng cancellation hoặc chạy xong xóa chart. Mixed supported/unsupported Risk requirements → hiển thị phạm vi cần xác nhận, không bỏ phần user yêu cầu. Phân biệt no_data/insufficient_sample/not_applicable và execution error; không nuốt query failure thành “không có dữ liệu”.

## 16. Association và driver exploration

Giữ shipper relationship hoạt động, internal method dưới free form. Causal wording chuyển mục tiêu mô tả association và caveat rõ **“Mối liên hệ không chứng minh nhân quả”**. Câu đòi chứng minh causal effect là unsupported; câu exploratory “có liên quan/làm…không?” có thể trả association với giới hạn.

Đối với revenue ↔ cancellation: hai metric cùng source nhưng **khác population filters**, không thể chỉ thêm vào một relationship query và nới `metric_scope`. Giải pháp giới hạn cần triển khai trong phase 5:

1. Đăng ký **một paired-observation capability** cho hai metric này theo `store_id` (label `store`) cùng approved period/scope; không mở arbitrary cross-domain join. Mở rộng lens/`AnalyticalBlueprint` hiện có bằng mode `paired_aggregates` và observation-key đã quản trị; mặc định cũ là single operation. Grain phải có thể giải thích là quan hệ **giữa chi nhánh**, không giữa từng order, không causal effect.
2. Resolver tạo hai standard aggregate operations riêng, giữ nguyên business filters mỗi metric và same parent requirement. Thực thi cùng read-only report snapshot; giữ unique entity keys, không Top-N/limit/truncated population.
3. Trong `insight_service` thêm helper paired observations **mới** để inner-align các result theo key được khai báo; validate one row/key, ≥3 complete valid pairs, variance, source period, disclosures cho entities thiếu cặp. Không thay đổi query compiler hay tạo metric giả với population chung.
4. Mở `DashboardVisual` bằng optional typed paired-source references/binding để scatter tiêu thụ hai artifacts; `dashboard_planner_service` + verifier dùng cùng binding/validated paired artifact. Mọi numeric fact mang cả hai source refs. Giữ shape scatter một-source hiện có. Không lạm dụng `compare_query_ids` vốn chỉ hỗ trợ scalar comparison.
5. Nếu thiếu grain/observations/không thể bảo đảm pairing → CLARIFY grain hoặc limitation + grouped panels; không tuyên bố correlation. Không coi đây là capability đã có ở HEAD.

Driver “vì sao revenue giảm”: baseline mặc định chỉ dùng **kỳ trước cùng cadence đã nêu rõ trong report** nếu cả hai đủ dữ liệu; thiếu thì CLARIFY/chọn kỳ. Query full-scope revenue hai kỳ + breakdown trên cùng dimension; tính delta và contribution-to-change (signed), kiểm tổng segment deltas reconcile với total. Không dùng pie của signed change hoặc claim net item revenue = order revenue. Related associations chỉ bổ sung khi capability đăng ký và có evidence; không bắt buộc thêm r vào mọi driver report. Ngôn ngữ: yếu tố liên quan, phân rã đóng góp, driver quan sát được; không suy nguyên nhân ngoại cảnh.

“Revenue và loại thành phố”: `city` là category, **“loại thành phố” chưa có dimension**; CLARIFY muốn so sánh thành phố hay loại điểm bán `store_type`. Chọn city rồi REDIRECT/grouped Compare. Không âm thầm ánh xạ city type thành store type.

## 17. Kiến trúc relevance của views

Contract sinh `view_requirements` trước SQL từ requested requirements và supporting candidates được chấp nhận. Tận dụng requirement coverage/operation IDs/fingerprints hiện có. Mỗi view mang `requirement_id,operation_ids,metric_ids,dimension_ids,scope,filters,time,analytical_role,relevance_reason,caveats,evidence_refs,provenance` hoặc references immutable đến các dữ liệu đó; không sao chép rows.

Di chuyển static mission eligibility/unit/composition/method/form guards từ `chart_relevance.apply/grammar_decisions` về evaluator + view planning trước query. `apply` chỉ bind/annotate, dedup, budget supporting và xử lý **runtime shape** đã khai; `verify` kiểm đúng cùng contract như verifier, không tự định nghĩa mission metrics nữa. `chart_reason` chia static predicate có thể dùng trong preflight và runtime predicate dùng rows; một hàm rule dùng chung, không copy logic.

Requested requirement luôn có primary chart/KPI/table đúng nghĩa hoặc limitation cụ thể; primary không bị drop vì form preference khi dữ liệu hợp lệ. Nếu runtime view không thể dựng, fallback table là trạng thái có khai báo; coverage phải biết table trả lời được câu hỏi nào. Association thiếu paired data không được coi bảng hai metric là đã trả lời r. Không fetch/query thêm chỉ để đủ chart; derived contribution reuse denominator artifacts đã validate.

Dedup bằng semantic identity (metric + meaning/transform + dimension/grain + filter/time/scope + role/requirement), không chỉ `chart_type`; bar/donut của một breakdown thường là một role, không tính hai coverage. Khi bỏ chart phải cập nhật `story_sections/domain_groups/kpi refs/chart_count` đã tạo trước đó để không còn refs mồ côi.

## 18. Chính sách coverage phân tích

Thay floor toàn cục trong `dashboard_policy`, planner và `assess_report` bằng **required roles + optional target**:

| Loại bài toán | Roles cần/đáng có khi dữ liệu cho phép |
|---|---|
| Broad Overview | Headline KPI/change, time trend, group/ranking, contribution/breakdown — mục tiêu khoảng 4 view có ích |
| Compare rộng | Direct comparison bắt buộc; trend comparison, breakdown/distribution, supporting segment khi compatible |
| Driver | Main change bắt buộc + baseline; breakdown, top signed contributors; association chỉ nếu liên quan và supported |
| Risk sâu | Direct signal bắt buộc; worst entities, historical signal trend, supporting segmentation |
| Narrow Top 5 | Primary ranking bắt buộc; một supporting view tùy ích lợi, không floor 4 |
| Forecast/association | Forecast + quality/history hoặc scatter + paired/sample evidence; không pad bằng pie |

Luồng duy nhất: `requested_requirements → candidate_views → validated_views → coverage_assessment`. Mỗi role có answered/limited/unavailable + reason; KPI/table có thể là một analytical view khi thực sự trả lời role, không đếm số UI card làm chart. Critical direct answer thiếu → không SUCCESS đầy đủ. Optional role thiếu do history/dimension/sample/capacity → report thành công có hạn chế rõ; không dùng số lượng thấp để giảm “AI accuracy”.

Depth chỉ mở ngân sách supporting và segmentation, không thay metric/population/primary answer. Giữ focused/deep/comprehensive nếu chứng minh được khác biệt; không bảo đảm số chart phải tăng trong mọi câu hẹp. Ba độ sâu cùng câu có primary numbers giống nhau, supporting distinct roles có thay đổi khi metadata cho phép.

## 19. Diễn giải chart

Giữ `ChartInsight`, `chart_insights`, `why_relevant/what_it_shows/key_facts/caveats/next_checks`; mỗi primary view trả rõ vì sao có, phần nào của câu hỏi được trả lời, strongest numeric finding và lưu ý. Chọn facts từ validated evidence của requirement, không text mô tả lens chung thay cho user goal. Giữ deterministic 0 AI, không thêm call/chart.

Trend/KPI/forecast dùng temporal policy chung. Contribution mẫu số ghi full scope hay selected cohort đúng thực tế; câu caveat ranking hiện “số liệu phân tích dùng toàn bộ phạm vi” cần tách **ranking xét candidates toàn phạm vi** và **tổng/mean của Top N chỉ dựa Top N**. Mọi derived fact (gap, share, Pearson, breaches) phải recompute verification từ row refs/công thức; loại nhánh tự pass theo dấu `-`, `~` hay tên key.

## 20. Kết luận và report completeness

Mở rộng output `grounded_narrative`/`AnalysisPipeline.report` bằng `analysis_conclusion` **mới** có `direct_answer,key_evidence,caveats,next_actions,requirement_refs,evidence_refs`. Tất cả từ validated findings; câu hẹp có thể chỉ vài dòng. Nếu không có recommendation có bằng chứng, ghi hành động kiểm tra dữ liệu tiếp theo hoặc không cần hành động, không bịa kinh doanh.

Report thành công kết thúc bằng mục hiển thị trực tiếp **KẾT LUẬN PHÂN TÍCH**, gồm bốn phần trên; không giấu trong details đóng mặc định. Giữ short answer đầu trang và legacy `conclusions/recommendations/executive_summary` là projection để saved reports/DOCX tương thích. Dùng chung conclusion cho UI/export/save; cập nhật verifier đang so `conclusions` với `grounded_narrative` để không từ chối artifact mới đúng nghĩa. Không gọi LLM viết essay.

## 21. Verification/provenance

Giữ panel V3.2 và năm nhóm độc lập; bổ sung provider reliability riêng. Structural verification, numeric reconciliation, semantic coverage, forecast quality, provider reliability **không gộp thành xác suất đúng**. Internal completeness score là chỉ số kỹ thuật, không nhãn “độ chính xác AI”. Oracle hiện khác query shape nhưng chung metric/compiler; phải tiếp tục công khai giới hạn đó.

Reconciliation ưu tiên high-value total, rank membership/ties, change/driver sum, ratio numerator-denominator khi metadata đã khai và cùng snapshot. Không sum rate/AOV để đối chiếu. Oracle không đo được → not_measured, không 100%; bound max queries; deadline/cancel vẫn hiệu lực. Ghi `source_snapshot/as_of,registry/catalog/policy fingerprints,intent/plan bindings,computation scope,display scope,source coverage`. On-demand reconcile về sau phải xác nhận cùng snapshot/version hoặc báo re-run/current-data comparison, không gọi là mismatch của report chỉ vì data-sync đã đổi.

`verification.forecast_backtest` lấy đúng field thật; report claims và chart-derived calculations cùng evidence IDs. Score/attention chỉ phản ánh phép kiểm đã làm. Failure không được `not_scored` rồi vẫn hiển thị success xanh cho số chưa kiểm.

## 22. State/reset và retry UX

Một active-analysis epoch/revision cho **cả** preflight/proposal/job/execute/refine/risk/reconcile/export-preview. Reuse `jobEpoch`/AbortController/sequence thay vì thêm store toàn cục. Mọi response chỉ commit khi epoch + input identity khớp; cancellation phía server cho job khi bỏ phiên. Không tự paid resubmit từ Retry chung.

- Prompt/time/scope/metric/depth/mission/input-mode đổi: invalidate decision, plan, approval, report, pendingClarification, activeModule khi incompatible, versions/refinement/feedback/table-selection/showSql/preview; không làm mất history độc lập.
- Switch mission: giữ drafts per mission như hiện tại; không mang report. REDIRECT là action khác, preserve deliberate context, không lấy draft cũ đè câu vừa redirect. Apply patch nguyên tử, tránh `return` sớm làm mất time/scope trong cùng patch.
- Reset: abort/cancel, xóa pending job/sessionStorage, active report/plan/clarification/risk/guided/module/versions/refinement, input controls về documented defaults (`mission=null,time=auto,scope=auto,depth=deep`), reset draft cache của active workspace; history vẫn xem được bằng explicit history action.
- Loading/pending preflight không dùng verdict cũ để enable “Sẵn sàng”; vẫn có thể click submit để server kiểm lại trong cùng job, nhưng không claim READY trước đó. Preflight unavailable ghi chưa kiểm; authoritative server không fail-open.
- Kết nối lại job dùng original idempotency key/job ID và GET polling; lỗi provider cuối chỉ cho retry có lý do khi recovery hết/không có dự phòng. Semantic no-progress yêu cầu thay input/diagnostic, không “Retry until lucky”.

## 23. Taxonomy hợp nhất, giữ API cũ

Giữ `error_taxonomy.classify` là nơi map duy nhất; `safe_failure`/`actionable_issue` và job state đọc map, không tái suy từ prefix/status text. Thêm `decision` cho user outcomes và giữ legacy `status/outcome/error_type/analysis_state` qua adapter. Runtime terminal states vẫn riêng với four-way capability decision; không ép outage thành UNSUPPORTED.

| Concept yêu cầu | Map/điều chỉnh dự kiến |
|---|---|
| USER_INPUT_INVALID | `unrecognized_question`/DTO invalid → CLARIFY analytical goal hoặc UNSUPPORTED non-analytical; 0 call |
| CLARIFICATION_REQUIRED | Existing ambiguous categories → CLARIFY + typed fields |
| MISSION_REDIRECT | `mission_mismatch` legacy alias → REDIRECT; thêm method/view redirect, không bắt buộc mission tab khác |
| UNSUPPORTED_METRIC/DIMENSION/OPERATION | Giữ category cụ thể trong `reason_code`, không collapse mất lý do vào một error_type chung |
| INSUFFICIENT_DATA/HISTORY | `insufficient_data/forecast_insufficient_history`; runtime reason giữ periods/observations, sửa scope có chủ đích |
| TEMPORAL/METHOD_INCOMPATIBILITY | Typed codes mới ở canonical constraints → CLARIFY hoặc REDIRECT theo sửa được gì |
| PROVIDER_TIMEOUT/RATE_LIMIT/UNAVAILABLE | Existing provider categories + recovery_exhausted/retry_after/counters; message phản ánh đúng timeout/quota, không đoán chỉ từ flag failover |
| SEMANTIC_RESOLUTION_FAILED | Existing no-progress/budget; không retry provider bằng input cũ |
| QUERY_VALIDATION/EXECUTION/RESULT_VALIDATION_FAILED | Existing `plan/dry_run_failed`, `execution/query_timeout`, `result_contract/quality_verification` giữ stage và guidance |
| SYSTEM_FAILURE | Storage/catalog/policy/internal/cancel/expired có codes riêng; không coi người dùng cần đổi metric |

## 24. Chín phase thực thi

Thứ tự **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Sau phase 1–2, chỉ expose compiled READY khi các rule của phase sau đã được chuyển vào canonical policy; không bật V3.3 UI nửa chừng. Trong mỗi phase, sửa invariant theo lớp, không hard-code câu acceptance. `U/I/F` dưới đây lần lượt là unit/integration/frontend; integration offline dùng scripted provider + fixture warehouse, không live API.

### Phase 1 — Contract và compatibility thống nhất

- **Objective:** mở rộng semantic truth hiện có và identity, không làm biến đổi kết quả truy vấn.
- **Files:** `A/services/{semantic_preflight_contract,analysis_intent,analytical_resolver,semantic_catalog_validation,semantic_manifest_service,workspace_service,session_service,agent_pipeline}.py`, `A/common.py`, `A/metadata/semantic_catalog.json`; `W/src/types/index.ts`, `W/src/utils/{preflightPresentation,missionWorkspace,analysisJobs,workspacePresentation}.d.ts`.
- **Functions/classes:** `contract_from_preflight`, `IntentRequirement`, `CompatibilityIndex`, `AnalyticalResolver.resolve/resolve_requirement`, `validate_source_semantics/validate_catalog`, `build_manifest`, `metric_capabilities`, `ReportSession`, `encode_session/decode_session`, `AnalysisPipeline.request_signature`, `plan_fingerprint`; thêm typed projections/evaluator §8.
- **Changes:** semantic type/additive-over/disjointness/numerator-denominator/dimension type projections; decision/constraints/view obligations; include mission + policy + normalized effective scope/time/reference/input mode in signature/fingerprints. `AnalysisPipeline.request_signature` và `plan_fingerprint` cũng thuộc identity change này. Contract version + fingerprint invalidate old incompatible approvals/caches; schema physical không đổi.
- **Backward compatibility:** optional output fields; retain legacy additive and request aliases; decode old reports read-only, stale proposals yêu cầu replan; không convert stored rows/SQL tùy tiện.
- **Tests U:** mở `tests/test_semantic_truth_v30.py`, `test_analysis_contract.py`, `test_contract_v251.py`; enum/projection, logical type của transformed/cyclic dimensions, distinct count partition, stock semi-additive, catalog contradiction, policy fingerprint deterministic.
- **Tests I:** cùng intent guided/free text cho cùng capability; đổi mission/policy không hit plan-cache cũ; old session round-trip không giả READY.
- **Tests F:** `workspace.test.mjs`, `missionWorkspace.test.mjs` dùng capabilities fixture generated từ server; typecheck. Không hard-code metric catalog trong UI.
- **Done when:** một evaluated decision tái sử dụng được, mọi field có source/owner; 43 metrics được phân loại, không có capability tĩnh mới do UI tự khai.

### Phase 2 — Gate sớm, clarify và redirect

- **Objective:** bác điều chắc chắn không chạy được trước provider và dùng cùng gate ở mọi entry point.
- **Files:** `A/services/{preflight_service,semantic_preflight_contract,request_anchors,mission_contract_service,agent_pipeline,hybrid_analyst_planner,analysis_pipeline,error_taxonomy,analysis_issue_service}.py`, `A/routers/ai.py`, `A/common.py`; `W/src/utils/preflightPresentation.{mjs,d.ts}`, `W/src/components/workspace/QuestionPreflight.tsx`, `W/src/components/AnalysisClarification.tsx`.
- **Functions/classes:** `run/auto_guided`, `request_anchors/verify_anchors`, `validate_guided/infer_mission`, `AnalysisPipeline.guided_context/ui_context/_propose/generate/refine`, `HybridAnalystPlanner.run/preflight`, `ai_preflight/_invoke`, `safe_failure/classify/actionable_issue`, `preflightView/applyFix/createPreflightClient`.
- **Changes:** bind recognized clauses/constraints, no unsupported predicate bypass; enforce unconditional server gate including legacy prompt/modules; all blockers reported together; READY qualification §9; typed REDIRECT/CLARIFY and explicit context patch. Broad natural phrases remain accepted for interpretation; reject lack of any business/analytical evidence without regex blacklist. Cache index/vocabulary by catalog fingerprint to bound preflight latency; không I/O khi gõ.
- **Backward compatibility:** adapters `can_submit/status/state/findings` generated from decision, không giữ second policy; old `switch_mission` fixes được đọc như redirect action.
- **Tests U:** `tests/test_workspace_v31.py`, `test_v32_mission_reliability.py`, `test_semantic_recovery_boundaries.py`; new proposed `tests/test_final_hardening_v33.py` cho cross-entry invariant. Vary unsupported financial scope/metric aliases/clauses; clause-local “best”.
- **Tests I:** jobs/propose/generate/refine/modules cùng verdict; 0 provider + 0 analytical SQL cho known terminal decision; stale/fabricated client READY không bypass; no partial execution without acceptance.
- **Tests F:** `missionWorkspace.test.mjs`, `analysisClarification.test.mjs`, `analysisFailureV30.test.mjs`; redirect retains date/scope, missing metric options compatible; unavailable/pending không badge xanh.
- **Done when:** không còn early known forecast/risk/additive/method violation chỉ warn để chạy tiếp; p95 deterministic warm path `<50 ms` trên môi trường test quy định, separate cold init measurement. Fix lỗi hiệu năng đã thấy hoặc chứng minh harness/tải và đặt benchmark CI ổn định, không xóa assert để xanh.

### Phase 3 — Bảy chế độ sản phẩm

- **Objective:** giảm kiến thức thống kê người dùng phải có, giữ internal views/methods.
- **Files:** `A/metadata/semantic_catalog.json`, `A/services/{workspace_service,mission_contract_service,analysis_expansion_service}.py`; `W/src/components/workspace/{MissionPicker,MissionInputBuilder,CapabilityDrawer}.tsx`; `W/src/utils/{missionWorkspace,workspacePresentation}.{mjs,d.ts}`; `A/tools/regenerate_capabilities_fixture.py`, `A/tests/fixtures/capabilities_v31.json`.
- **Functions/classes:** `mission_catalog/mission_for/require_mission/mission_layout`, `infer_mission/mission_mismatch/guided_intent`, `mission_relevant`, `missionControls/buildGuided/defaultSlots`.
- **Changes:** hide primary composition/relationship bằng server visibility; contribution dưới Overview, method relationship dưới free form/deep; available dimensions/metrics từ canonical index; hướng dẫn scope/forecast đúng catalog, không suggest filter bị cấm.
- **Backward compatibility:** stored mission IDs/templates/modules vẫn resolve; mission selection đổi presentation không phá data contracts. Legacy opening maps sang visible mode với disclosure.
- **Tests U:** `test_workspace_v31.py`, `test_v32_mission_reliability.py` kiểm retained backend methods và danh sách visible sáu mission + free form.
- **Tests I:** legacy composition/relationship saved report/module render/rerun đúng policy; free form composition revenue resolve, AOV redirect.
- **Tests F:** cập nhật expectation “eight missions” có chủ đích trong `workspace.test.mjs`; `missionWorkspace.test.mjs` kiểm visibility, draft và legacy map.
- **Done when:** UI có đúng bảy modes; không mất shipper scatter/contribution capability; statistical method không tự gây wrong-tab reject.

### Phase 4 — Một owner phục hồi provider, ledger thật

- **Objective:** transient failure recover trong cùng submit khi có năng lực dự phòng, không tăng semantic retries.
- **Files:** `A/services/{agent_provider,provider_budget,provider_credential_router,provider_health_service,hybrid_analyst_planner,analysis_job_service,agent_pipeline,error_taxonomy}.py`, `A/routers/ai.py`, `data-platform/.env.example`, `docker-compose.data.yml` chỉ khối analytics-api.
- **Functions/classes:** `NativeAgentProvider.__call__/reset`, `ProviderBudget.{consume,http_timeout,recovery_available}`, `ProviderTurn.invoke`, `validate_single_shot_policy`, `credential_plan/eligible`, `HybridAnalystPlanner.run/semantic_repair_limit`, `AnalysisJobs.work` observer, `bounded_propose_plan`.
- **Changes:** deadline policy §11, physical durable reservation và separate logical/repair counters, one recovery whole submission, remove duplicate resend/model escalation; same payload hash on transport retry; no-progress stops; sanitized health and both-slots failure cause.
- **Backward compatibility:** retain old diagnostics aliases with documented logical meaning; bump job version để job budget cũ không phục hồi như job mới; old native archival behavior phải chọn legacy adapter tường minh.
- **Tests U:** fake-clock + HTTP stub trong `test_v32_mission_reliability.py`, `test_reliability_v210.py`, `test_semantic_truth_v30.py`; 429/5xx/early và full timeout/connection/auth/schema/malformed JSON/duplicate key/cooldown/no secondary/cancel. Kiểm không khởi attempt mới khi remaining <6 s.
- **Tests I:** `test_analysis_jobs.py`, `test_query_batch.py`: reserve trước HTTP, crash/reconnect không reset quota, fallback+repair tổng ≤3 physical; one successful transport retry không thành nested error; no post-result calls.
- **Tests F:** `analysisJobs.test.mjs`, `analysisFailureV30.test.mjs`, `reportV32.test.mjs` cho stage/reconnect/retry guidance; provider error không bị coi cần đổi metric.
- **Done when:** internal recovery 100% pass fault-injection, 0 semantic-induced key rotation/model hop, primary timeout không ăn cửa sổ dự phòng; chỉ secret variable names/booleans xuất trong artifacts.

### Phase 5 — Temporal, forecast, Risk và association/driver compatibility

- **Objective:** mọi phép toán dùng cùng assumptions; hoàn tất static/runtime constraints trước mở READY V3.3.
- **Files:** `A/services/{analytical_resolver,analytical_blueprint_service,analysis_intent,mission_contract_service,semantic_catalog_validation,preflight_service,insight_service,forecast_service,risk_watch_service,data_coverage_service,chart_insight_service,analyst_contract,analytical_query_service}.py`, `A/metadata/semantic_catalog.json`, `A/common.py`, `A/routers/ai.py`; `W/src/utils/forecastPresentation.mjs`, `W/src/components/ForecastPanel.tsx` khi cần hiển thị quality/caveat.
- **Functions/classes:** `resolve_requirement/forecast_requirement`, `AnalyticalBlueprint/validate_blueprint/wire_blueprint`, `trend_bucket_coverage/analytical_features`, `complete_series/validate_request/report_forecasts`, `evaluate/classify`, `coverage_for/build_snapshot/fact_clocks`, `IntentRequirement/IntentForecast`, `DashboardVisual`, `AnalyticalQueries.prepare/run_batch`; paired observation helper **mới** trong insight service.
- **Changes:** policy §§13–16; runtime samples and no-data constraints; ratios/disjointness; forecast expectation; Risk signals server-side; paired revenue/cancellation giữ separate populations, add one governed pair, không mở generic join; driver signed delta reconciliation. `dashboard_planner_service` paired-source consumption được nối đầy đủ ở phase 6, chưa expose pair READY nếu chưa có renderer/verifier.
- **Backward compatibility:** giữ forecast algorithms/numerical output, six thresholds, default all signals; additive legacy projection. Snapshot labels có thể đổi cho đúng, không đổi schema/view SQL.
- **Tests U:** `test_forecast_v30.py`, `test_semantic_truth_v30.py`, `test_workspace_v31.py`, `test_v32_mission_reliability.py`, `test_result_reliability_v26.py`; today/week/month clipped/cross-year/timezone/zero denominator/one-period/sparse/stale history; frozen clock.
- **Tests I:** FixtureWarehouse + query snapshot tests: two population aggregates paired by unique key, duplicate/missing pairs, n/variance guards; driver sum deltas match total; rated risk sample=4 không red; forecast max horizons và all-zero history fail đúng loại.
- **Tests F:** `forecastPresentation.test.mjs`, `workspace.test.mjs`, `reportV32.test.mjs` cho p.p. vs %, incomplete current day, missing accuracy guarantee, snapshot Risk, category redirect.
- **Done when:** không one-period trend/growth, không partial-period decline giả, không parts-of-whole AOV/rate, không 95% promise, no causal claim; pair/driver capability có evidence/provenance đầy đủ hoặc không được publish READY.

### Phase 6 — View requirements, relevance và coverage

- **Objective:** chart layer hiện thực contract, không phán lại nghĩa.
- **Files:** `A/services/{analytical_resolver,analysis_expansion_service,dashboard_planner_service,chart_relevance_service,derived_chart_service,analyst_contract,agent_pipeline,analysis_quality_service}.py`; `W/src/utils/analystDashboardLayout.mjs`, `W/src/utils/{dashboardPresentation,aiChartConfig}.{mjs,d.ts}`; `W/src/components/AnalystDashboardSummary.tsx`.
- **Functions/classes:** `supporting_candidates/dashboard_policy/estimated_views`, `defaults/chart_reason/comparison_reason/build_dashboard/presentation_rows`, `apply/verify/grammar_decisions`, `contribution_charts`, `AnalysisPipeline.report`, `assess_report`, `DashboardVisual`.
- **Changes:** compile view requirements + static compatibility upfront, bind runtime predicates, paired scatter two-source, semantic dedup, coverage roles/limitations, remove free-form four-chart hard floor and form-only loss of requested evidence. Rebuild dashboard refs/counters after dedup; zero-chart narrow scalar valid, association missing evidence incomplete.
- **Backward compatibility:** giữ chart payload hiện có và result table/artifact paging; optional new requirement/provenance fields; old charts render legacy, không nâng fake verification.
- **Tests U:** `test_dashboard_layout_v26.py`, `test_dashboard_minimum_views_v212.py`, `test_overview_dashboard_v296.py`, `test_v32_mission_reliability.py` cập nhật expected behavior có lý do.
- **Tests I:** READY→query→result→view property matrix: mọi requested static capability được thực hiện; Risk revenue bị gate trước execution (thay test chấp nhận rồi drop); only runtime omissions allowed; broad/narrow coverage, paired missing sample, all charts rejected invariant.
- **Tests F:** `analystDashboard.test.mjs`, `analystDashboardLayout.test.mjs`, `aiChartConfig.test.mjs`, `reportV32.test.mjs` kiểm không refs mồ côi, no irrelevant padding, fallback/table reason rõ.
- **Done when:** không deterministic capability mới tại relevance; narrow Top 5 không cần ≥4 charts; broad aim ~4 meaningful roles hoặc có reason thiếu cụ thể, không chart-only SQL.

### Phase 7 — Conclusion và verification có bằng chứng

- **Objective:** báo cáo trực tiếp, đầy đủ, không ngộ nhận accuracy.
- **Files:** `A/services/{insight_service,chart_insight_service,agent_pipeline,analysis_quality_service,verification_reconciliation_service,verification_score,analysis_response_service,docx_service}.py`; `W/src/components/{AnalystDashboardSummary,WordReportPreviewModal}.tsx`, `W/src/components/report/{ChartInsight,VerificationPanel}.tsx`, `W/src/views/AnalyticsView.tsx` phần save/export.
- **Functions/classes:** `grounded_narrative`, `insight/verify_insights/short_answer`, `report/reconcile`, `assess_report`, `reconcile/verification_report/forecast_quality`, `bound_response/session_report_summary`, `generate_report_docx`, `AnalystOptionalNarrative`.
- **Changes:** conclusion artifact §20, deterministic facts derived statistic verification, separate reliability/forecast/reconciliation metrics; per-source temporal caveats and as-of reconciliation; preserve conclusion in bounded response/save/export. Không thêm LLM judge.
- **Backward compatibility:** legacy arrays/summary generated từ conclusion; saved old reports không có artifact vẫn đọc được với nhãn verification legacy/not_measured.
- **Tests U:** `test_verifiable_v27.py`, `test_v32_mission_reliability.py`, `test_comparison_score_v282.py` mutate gap/r/share/breach/date để verifier phát hiện; not_measured ≠ passed.
- **Tests I:** serialization/save/reload/export payload round-trip không mất conclusion/refs; independent oracle bounded, ratio recompute, datasource snapshot đổi không false mismatch; no post-result AI.
- **Tests F:** `reportV32.test.mjs`, `analysisQuality.test.mjs`, `analystDashboard.test.mjs`; conclusion visible cuối report, bốn nội dung, “90/100” không hiểu là correctness. Nếu sửa layout DOCX, render/verify theo workflow document trước delivery implementation.
- **Done when:** mọi successful report có câu trả lời/evidence/caveats/actions, mọi primary view có rationale và verified numeric finding; five trust dimensions không bị blended thành accuracy.

### Phase 8 — Một lần bấm và state isolation end-to-end

- **Objective:** nối UI vào job hiện có, hoàn thiện atomic state/redirect/reset/reconnect.
- **Files:** `W/src/views/AnalyticsView.tsx`, `W/src/components/workspace/{AnalystWorkspace,QuestionPreflight,MissionInputBuilder}.tsx`, `W/src/components/AnalysisClarification.tsx`, `W/src/utils/{analysisJobs,missionWorkspace,preflightPresentation,analysisInput}.{mjs,d.ts}`; `A/services/{analysis_job_service,agent_pipeline,session_service}.py` và `A/routers/ai.py` phần terminal decision adapter.
- **Functions/classes:** `handleOneClick/handleProposePlan/handleExecuteAiReport/handleResetToNewPrompt/handleFollowUpRefine`, workspace `onChange/fix/runRisk`, `runAnalysisJob/switchMissionDraft/applyFix`, `AnalysisJobs.public/work/finish/status`, `request_signature`.
- **Changes:** CTA mặc định gọi `handleOneClick`; “Xem kế hoạch” tùy chọn giữ luồng hai bước. Job dừng ngay CLARIFY/REDIRECT/UNSUPPORTED, partial scope vẫn phải xác nhận. Pure reset/invalidation reducer **mới trong missionWorkspace.mjs** để kiểm logic và gọi nhất quán từ tất cả edit/history/module/redirect handlers; epoch áp cả non-job responses. Giữ job terminal `needs_input` cho CLARIFY/REDIRECT để client cũ dừng polling; first-class `result.decision=REDIRECT` điều khiển CTA ở client mới, legacy `status=needs_clarification` là projection.
- **Backward compatibility:** preview/approve workflow, saved history/modules vẫn dùng được; version sessionStorage key/job contract khi đổi state; không auto replay record schema cũ. Feature flag hiện `DATA_ANALYST_ONE_CLICK_ENABLED` tiếp tục là kill switch.
- **Tests U:** `analysisJobs.test.mjs`, `missionWorkspace.test.mjs`, `analysisClarification.test.mjs` kiểm lifecycle reducer và typed actions thay cho chỉ grep source.
- **Tests I:** `test_analysis_jobs.py`, `test_first_submission_v294.py`, `test_one_click_semantics.py`: idempotency/lost POST response/poll resume/cancel-by-key/owner/cache identity/reset while running.
- **Tests F:** browser component journeys (thêm harness phù hợp vào `W/package.json` nếu cần, proposed `W/tests/analyst-workspace.e2e.mjs` mới): deferred responses propose/refine/risk/reconcile về sau reset/mission edit; CTA one-click phải đi đúng endpoint; counts và state không dùng history report cũ.
- **Done when:** click một lần tới useful terminal state, không bắt duyệt bình thường; redirect click giữ deliberate context; mọi stale response bị bỏ; reset toàn bộ active state nhưng history còn.

### Phase 9 — Offline regression, live bounded và manual release gate

- **Objective:** chứng minh invariant trên biến thể câu hỏi và luồng thật, không chỉ golden strings.
- **Files:** `A/tests/` các module đã nêu và proposed `test_final_hardening_v33.py`, `A/evals/{semantic_eval_v30,run_eval_v29,fixture_warehouse}.py`, proposed `A/evals/semantic_cases_v33.json`; `A/tools/run_tests_v29.py`; `W/src/utils/*.test.mjs`, proposed `W/tests/analyst-workspace.e2e.mjs`; cập nhật `AI_V32_MANUAL_TEST.md` hoặc thêm ma trận V3.3 trong phase implementation, artifacts dưới `data-platform/evaluation/v33/`.
- **Functions/classes:** `load_cases/run_offline/run_live/expected_outcome`, `IsolatedResult`; reuse FixtureWarehouse, ScriptedProvider; live meter hook trước **mọi HTTP**.
- **Changes:** matrices §§25–27; hard physical call ceiling; no test keys/logs; separate offline oracle compile khỏi semantic understanding; terminal decision/rationale, metrics/populations/periods/view coverage đều được chấm. Chạy baseline trước rồi ghi exact before/after; không sửa test chỉ để hợp output mới.
- **Backward compatibility:** giữ V3.0/V3.1/V3.2 cases với expectation update chỉ khi policy sản phẩm đã đổi; legacy tests chọn legacy adapter, không bỏ cả nhóm.
- **Tests U:** full isolated runner + new invariant suite; retrieval và actual semantic fixtures độc lập; replay transport deterministic, budget/fingerprint/scoring mutation tests.
- **Tests I:** read-only live DB smoke sau offline pass; owned jobs/API contract, full report pipeline và cache-version journeys; `data-sync/test_sync.py` chỉ cần nếu file đó thực sự thay đổi (plan này không yêu cầu thay).
- **Tests F:** tất cả node tests, typecheck, build, browser journeys; rebuild web container khi implementation thay UI rồi xác nhận served bundle mới; không rebuild khi backend suite đang chạy. Manual theo §27.
- **Done when:** release thresholds §31 đạt, artifacts có SHA/fingerprints/call counters/failures/not-run rõ; live ≤60 thông thường, extension ≤80 khi cần chẩn đoán; không retry một câu đến khi đẹp rồi chỉ ghi lần đẹp.

## 25. Ma trận offline regression

Mọi ca known deterministic terminal phải assert **0 provider**, **0 analytical SQL**; metadata lookup được tính riêng khi cần. Dùng cả paraphrase có/không dấu, trật tự clause, aliases, extra whitespace, structured controls; câu Việt dưới đây là fixture, **không là nhánh production**.

| ID | Input/điều kiện | Verdict/điều cần kiểm |
|---|---|---|
| O1 | Tổng quan tháng 9/2026, chỉ chi nhánh đang lỗ | UNSUPPORTED financial scope, không dùng low revenue làm proxy |
| O2 | Tổng quan revenue tháng 9 và vì sao giảm | READY driver nếu baseline đủ; otherwise CLARIFY baseline/history; không claim đã giảm trước khi tính |
| C1 | Revenue HCM so với nhóm branch hoạt động tốt nhất | CLARIFY cohort metric và N còn thiếu, dù revenue có ở vế HCM |
| C2 | Cancellation Hà Nội so với revenue HCM tháng 9 | CLARIFY mục tiêu hoặc explicit separate panels; không gap chung unit |
| R1 | Top 5 chi nhánh tốt nhất tháng 9 | CLARIFY ranking metric, giữ N/time/entity |
| R2 | Top 5 doanh thu cao nhất nhưng loại doanh thu thấp | Chuẩn hóa redundancy, giữ exact Top 5; không threshold tự đặt |
| T1 | Trend revenue tháng 9 có tăng trưởng tốt không | READY mô tả + benchmark caveat; evaluative-only → CLARIFY |
| T2 | Trend theo tuần trong ngày 15/09/2026 | CLARIFY temporal range; mở rộng range hoặc redirect daily snapshot, không gợi daily vẫn claim trend |
| P1 | Cơ cấu AOV theo branch tháng 9 | REDIRECT Compare, metric aov supported |
| P2 | Cơ cấu cancellation rate theo city tháng 9 | REDIRECT Compare, không donut/rate contribution |
| F1 | Forecast từng branch trong 24 tháng | UNSUPPORTED + cả horizon và grouped/filter blockers; CTA total-scope ≤6 tháng rõ |
| F2 | Forecast revenue 3 tháng, accuracy ≥95% | READY nếu history đủ + expectation disclaimer, actual backtest; không promise/95%-interval giả |
| K1 | Risk tháng 9 chỉ revenue/orders/AOV | REDIRECT Overview/Trend, 0 query rồi drop charts |
| K2/A1 | Revenue cao có làm cancellation thấp đi không? | Association wording, approved paired grain/store two populations; READY nếu compatible; runtime sample limitation không causal |
| A2 | Tương quan revenue và loại thành phố | CLARIFY dimension chưa có; city chosen → grouped Compare, không Pearson category |
| H1 | Valid happy path từng mode | Primary answer/coverage/scope đúng; guided exact 0 calls; free semantic scripted ≤1+1 |
| G1 | `dsdasds`, greetings, no-domain question | Giữ existing nonsense block; conversational guidance, không normal planning |
| U1 | Unsupported standalone + mixed supported/unsupported metric/filter | Không bypass vì có recognized revenue ở vế khác; không partial autoexecute |
| D1 | No-data, sparse history, constant pairs/too few groups | Typed runtime limitations và pending checks đúng; không fabricated numbers |
| Q1 | Complete/truncated/current day/week/month, stale source, first=0 | Không misleading % change; p.p. cho rate; same temporal rules trong KPI/chart/conclusion/forecast |
| M1 | Switch mission, edit nonempty prompt/time/scope/depth, reset, history | Epoch invalidation, không stale plan/charts; redirect preserve deliberate context |
| B1 | Timeout/connection/429/5xx, two keys failure, semantic repeated fingerprint | Transport ledger ≤3, one recovery, one repair; correct terminal stage; không paid replay |
| V1 | Mutate chart formula/gap/r/share/threshold/requirement refs | Verifier phát hiện; không pass derived statistic chỉ theo key |
| I1 | Old prompt alias/direct APIs/module/cache/approval tampering | Không gate bypass; mission/policy/time identity đổi phải replan |

Lệnh chuẩn cho implementation (không dùng unisolated unittest discover): `.claude/scripts/dp-test.sh module tests.test_final_hardening_v33` giữa phase; cuối chạy `.claude/scripts/dp-test.sh backend`, `... web`, `... eval`. Env test phải bỏ cả `DATA_ANALYST_GEMINI_SECONDARY_KEY` như full runner, `AI_OFFLINE=1`, memory stores, block HTTP/DB cho unit/semantic offline. Helper module wrapper hiện chưa unset secondary như full runner: sửa isolation ở phase 9 nếu còn bất nhất, không in giá trị env.

Eval offline hiện tại `A/evaluation/v31/semantic_offline.json`: 146 cases, domain 110/113, metric 109/113, compile 108/108, preflight 17/17; failing retrieval IDs `ship_12,rev_12,rev_r_02,v31_rev_01`. Đây không đo khả năng hiểu NL live. Bốn full-suite failure lịch sử nằm ở `test_one_shot_v24.py::{test_default_native_budget_blocks_reentry_without_reset,test_native_transport_failure_never_retries_or_falls_back}` và `test_agent_v22.py::{test_distribution_and_correlation_observational,test_native_provider_gemini_signature_and_groq_fallback}`. Triage theo current production/legacy policy, không tự xem chúng là pass hay bỏ qua.

## 26. Ma trận live provider acceptance — chỉ sau offline

Phiên review này **0 live call**. Future implementation được phép dùng keys đã cấu hình theo yêu cầu owner. Harness `semantic_eval_v30.run_live` hiện dự toán 2 calls/case và cộng logical counter sau case; không đủ hard cap physical, cần sửa trước khi chạy V3.3. Atomic meter reserve trước mỗi send, cả thứ cấp/recovery/repair; hết budget → skip typed, không overshoot.

| Nhóm | Số câu/lượt dự kiến | Physical allowance tối đa |
|---|---:|---:|
| Guided, known invalid/unsupported/redirect/garbage/malformed | ≥18 ca, gồm mọi retained modes | 0 |
| Vietnamese semantic happy paths + aliases/domain variations | 14 câu | 28 |
| Ambiguous/paraphrase chưa thể quyết cục bộ | 4 câu | 4; known ambiguity vẫn 0 |
| Driver/association/numeric-category + forecast expectation | 3 câu semantic; deterministic variants riêng | 6 |
| Recovery/secondary validation | 2 journey có fault injection transport trong test client + real successful secondary response; không cố làm provider thật hết quota | 6 |
| Diagnostic reserve cho failure cụ thể, ghi cả trước/sau | Chỉ dùng khi có failure/counter evidence | 16 |
| **Tổng ceiling thường** | Không phải quota phải tiêu hết | **60** |

Tiêu chí: deterministic decisions/guards **100%**, supported semantic first-click useful state **≥95%** trên ít nhất 20 câu semantic hợp lệ/near-scope đã định nghĩa trước, **100%** không sai số/scope/causality/secret/READY-view invariant, median semantic HTTP ≤1 và tất cả ≤3; latency mục tiêu p95 planning ≤40 s, job ≤70 s, ghi cold/warm/fallback riêng. Câu hợp lệ trả unsupported/clarify giả không tính useful success. Rate thực tính denominator đã lên danh sách trước, không loại failures sau khi chạy.

Fault recovery deterministic suite phải 100%; live không bảo đảm ép được timeout/quota tự nhiên, dùng injected transport boundary rồi real secondary cho journey kiểm chứng. Nếu secondary chưa được inject, đánh dấu NOT_RUN recovery live, không xác nhận reliability hoàn tất. Extension diagnostic được owner cho phép tới **80** tổng physical reservations; trên 80 phải xin approval. Không tự chạy thêm chỉ để đạt %; nếu hết budget mà chưa đạt thì report chưa đạt release.

Mỗi record: case ID/SHA/catalog+policy fingerprints, expected/actual decision, primary metric/population/grain/period, calls logical/HTTP/repair/recovery, fallback used (boolean/slot label), latency stage/total, terminal state, coverage, unnecessary retry, grounded result checks. Không raw secret/provider headers/URLs, không dump `.env`; mask trước persist/log.

## 27. Ma trận nghiệm thu UI thủ công

| Journey tại `localhost:8501` | Kết quả bắt buộc |
|---|---|
| Mở Workspace, chọn bảy modes | Composition/Correlation không top-level; internal capability vẫn tìm/đọc được |
| Gõ invalid/unsupported/ambiguous | Feedback trước run, đúng nút sửa; không “câu hỏi hợp lệ” sai, không spinner provider cho known terminal |
| Overview → câu Top 5 → CTA Ranking | Preserve question/date/filter/metric/N, không draft cũ đè; chạy một lần có ranking |
| AOV composition → CTA Compare | Giải thích non-additivity; không nói metric unavailable |
| Weekly một ngày, 24-month grouped forecast | Có toàn bộ blockers và suggestions khả thi ngay trước run |
| Forecast guided 3 tháng; 95% expectation | Một lần bấm; actual history/backtest/interval, không guarantee |
| Risk Scan vs Deep | 0 calls cho Scan, selected signals server-side; Deep cùng threshold/sample/time semantics; revenue-only redirect |
| Revenue/cancellation causal wording; city/category | Association caveat + paired provenance hoặc compatible comparison/clarify; không Pearson category |
| Broad Overview/Driver/Compare/Risk | Primary answer và khoảng 4 meaningful roles khi có data, thiếu có reason; no duplicates/padding |
| Narrow Top 5/scalar | Đủ trả lời, không filler; Top N totals/denominator ghi đúng |
| Complete/partial periods từ nhiều nguồn | Partial hiện rõ, growth không so kỳ thiếu với kỳ đủ; forecast không zero-fill stale tail |
| Edit/switch/reset lúc propose/job/refine/risk đang chậm | Kết quả cũ không xuất hiện lại; controls về defaults; history mở bằng thao tác riêng |
| Rớt kết nối/refresh rồi resume | Cùng job/key, không thêm interpretation; cancel dừng publish late result |
| Report/verification/save/reopen/DOCX | Kết luận bốn phần visible; rationale mỗi view; verification không là accuracy; preserved refs/as-of |

Browser tests phải thực sự click nút chính và quan sát network/state, không chỉ đọc source string. Khi rebuild web container ở phase implementation, xác minh bundle phục vụ chứa version mới rồi hard reload. Không ghi kết quả thủ công là PASS nếu chỉ chạy API hoặc pure utils.

## 28. Tóm tắt budget và telemetry

| Phạm vi | Giới hạn |
|---|---|
| Typing preflight | 0 AI, 0 warehouse query; debounce 400 ms hiện có; warm p95 <50 ms target |
| Exact guided/threshold/report | 0 provider |
| Normal semantic submission | Thường 1 interpretation, tối đa 1 targeted repair |
| Transport | Tối đa 1 recovery/submission, tổng ≤3 HTTP; reserve durable trước send |
| Time | Planning 40 s/HTTP41 s/job70 s; provider tổng30 s, local reserve5 s, recovery min6 s; đo trước release |
| Live suite | Bình thường ≤60, diagnostic tổng≤80; >80 owner approval |

Không dùng logical `provider_call_count` để quảng cáo số request vật lý. Ghi hai counters, repair/transport reasons và stage latency; health cooldown sanitized. Không thêm raw question/model output vào log mặc định; fixtures acceptance có câu đã được duyệt riêng.

## 29. Rủi ro migration và quyết định sản phẩm

**Mức rủi ro MEDIUM.** Phần lõi truy vấn/risk/forecast đã có; thay đổi cắt ngang preflight→session→cache→chart→quality→UI dễ tạo regression nếu chỉ chuyển tên state. Cao nhất là paired observations khác population, immutable identity và thống nhất temporal coverage. Không có nhu cầu chứng minh phải thay Silver schema.

| Rủi ro | Kiểm soát |
|---|---|
| Strict preflight thu hẹp natural aliases | Chỉ block từ positive evidence chắc chắn; không absence-of-exact-alias = unsupported; semantic path giữ cho ngôn ngữ gần phạm vi; paraphrase eval |
| Old tests yêu cầu 4 charts/eight missions/drop-risk-revenue | Update có chủ đích theo invariant đã chốt; giữ legacy API/render tests, không cập nhật expected numeric values vô cớ |
| Cache/session cũ dùng sai mission/policy | Signature/fingerprint versioned, replan approvals, không rewrite historic reports; job storage version/key migration |
| Deadline dài hơn làm giữ worker lâu | 12 slot/4 worker hiện có giữ bounded; load/cancel tests; deadline global không nhân theo attempts |
| Shared credential cùng project/quota hoặc không độc lập | Không hứa throughput tăng; same-key dedup, cooldown, measured secondary smoke, explicit env mapping |
| Bỏ chart floor làm report quá nghèo | Required analytical roles + direct-answer acceptance và missing-role explanations, không số chart global |
| Freshness nguồn không đủ metadata chứng minh completeness | Mark unknown/pending, conservative exclusions; không tự thêm watermark schema/ingestion rewrite |

Không còn quyết định owner nào chặn **viết/triển khai theo plan**: dùng mặc định bảy modes, one-click chính + preview tùy chọn, deadlines/caps và acceptance thresholds ở trên. Operator cần cung cấp mapping secondary qua secret config nếu muốn live fallback được nghiệm thu; đây là điều kiện môi trường, không yêu cầu tiết lộ key. Đổi schema/ingestion hoặc tiêu >80 live calls là phạm vi cần owner approval riêng, không nằm trong plan mặc định.

## 30. Rollout và rollback

Thực hiện từng phase với tests trên môi trường phát triển, chỉ rollout V3.3 sau phase 8–9. Policy version là identity server trong contract/fingerprints; `/capabilities` công bố version để UI chọn adapter, không cần thêm env switch duy trì hai capability engine. Cùng process/request dùng một policy, không chạy resolver cạnh tranh hoặc provider shadow calls. Contract mới additive fields; versioned cache/job/session tránh dùng lẫn. Không tự commit/push/deploy production trong nhiệm vụ implementation khi chưa được owner giao phạm vi đó.

Rollback bằng redeploy artifact/code+config trước V3.3 đã lưu, chuyển frontend/backend đồng bộ về version trước, vô hiệu hóa one-click bằng flag hiện có khi cần; không `git reset`, không xóa volumes/data/history. Terminal/cancel jobs theo owner, không replay ambiguous paid attempts. Báo cáo lịch sử giữ read-only; proposals/new-policy caches bị invalidated theo version, không mutate thành old semantics. Giữ SQL protections ở mọi version; không rollback bằng việc bỏ validator.

Nếu phase phát hiện capability chưa implement chắc chắn, tắt capability cụ thể trong **cùng registry** với lý do rõ, giữ các happy paths khác; không mở READY rồi dựa chart filter che lỗi. Runtime outage hiển thị đúng loại và runbook, không âm thầm đổi dataset/metric.

## 31. Definition of Done cho implementation tương lai

1. Chỉ thay phạm vi Data Platform được chỉ định; không chatbot/Kubernetes/secrets/schema/ingestion ngoài scope. Git owner tự commit.
2. Bảy modes hoạt động; legacy composition/relationship vẫn đọc/rerun được dưới policy compatible; garbage early block đang tốt được giữ.
3. UI/backend dùng cùng decision/constraint projection; known unsupported/ambiguity/near-scope tương ứng UNSUPPORTED/CLARIFY/REDIRECT trước provider/analytical SQL. No API bypass, no silent partial scope.
4. READY compiled vượt tất cả static checks cùng policy/catalog; mọi late constraint thuộc danh sách runtime công khai §9. **0** late static mission/metric/unit/form disagreement, **0** requested meaning bị chart filter xóa.
5. Guided/simple deterministic/threshold scan/report không dùng AI; semantic thường ≤1, repair≤1, recovery≤1, HTTP≤3; identical semantic fingerprint dừng; timeout recover internally khi recovery capacity còn. Counters durable và reconnect không trả phí lại.
6. Trend/growth đủ kỳ comparable; partial/current/truncated/source coverage thống nhất; ratio/AOV/distinct/snapshot semantics đúng; forecast không guarantee; Risk thresholds/sample nhất quán; causal/category wording xử lý đúng.
7. Pair revenue/cancellation và driver decomposition chỉ release khi paired/scope/delta reconciliation pass; không sửa population guards để chạy bằng mọi giá.
8. Broad analysis có coverage roles hữu ích (~4 nếu data cho phép), narrow không padding; mỗi primary view có requirement rationale, verified strongest finding, caveat, source scope đúng; runtime limitations cụ thể.
9. Successful report có **KẾT LUẬN PHÂN TÍCH** gồm direct answer/evidence/caveats/actions trong UI/save/export. Không blended verification = accuracy; derived statistic mutation bị phát hiện, independent not_measured trung thực.
10. One-click thực sự nối vào main CTA; reset/edit/tab/redirect/history và late-response regressions pass; không cũ plan/chart/module state xuất hiện lại.
11. Full offline unit/integration/node/typecheck/build/browser regression pass; triage và xử lý minh bạch 4 legacy failures, 4 retrieval failures và latency failure đã nêu. Legacy tests dùng adapter đúng policy; không drop/skip test hoặc đổi fixture để xanh. Nếu còn failure thì ghi chưa đạt DoD, không gọi baseline failure là pass.
12. Live gates §26 đạt trong budget, deterministic guards/fault-injection 100%, semantic ≥95% theo predeclared matrix; mọi NOT_RUN được nêu rõ. Manual UI §27 có evidence thật; V3.2 happy paths vẫn hoạt động.
13. Artifacts acceptance ghi exact SHA, policy/catalog fingerprints, call/latency/terminal-state/coverage; không secret xuất hiện. Có rollback artifact và version mapping kiểm được.

**Điểm dừng của phiên review này:** chỉ giao kế hoạch. Không triển khai các phase, không thay code production, không commit/push.
