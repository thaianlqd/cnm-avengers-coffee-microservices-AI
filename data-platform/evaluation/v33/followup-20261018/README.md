# V3.3 follow-up — bằng chứng nghiệm thu 18/10/2026

PLAN chính: `data-platform/AI_V33_REVIEW_FOLLOWUP_PLAN.md`. Progress cạnh PLAN là checkpoint thực thi; review gốc được giữ nguyên để đối chiếu. HEAD và working-tree digest nằm trong `manifest.json`; exact commands/environment trong `commands.json`. Không commit/push, không đổi schema/ingestion/chatbot/Kubernetes.

## Release gates

| Gate | Bằng chứng |
|---|---|
| Full offline | `full-final.txt`:1063 backend,165 web,typecheck/build,eval146+33,12 mocked Chromium PASS (exit0). `full-checks-before-last-patches.txt` giữ lần1059 trước các patch cuối |
| Regression của patch cuối | `exact-scope-tests.txt`; `final-module-tests.txt`; không network/warehouse ngoài fixture |
| Browser | `browser-final.txt`: 12 mocked lifecycle +4 real FastAPI fixture journeys; tách rõ với served browser |
| Served UI + DB read-only | `served-browser.json`:12/12 journeys PASS, API thật, không response mocks;5 screenshots đã lưu. Guided/Scan/reconcile/forecast0AI; oracle2/2 matched |
| Preflight | `preflight-benchmark.json`: cold catalog154.4ms, first88.2ms riêng;990 warm requests,p95=21.37ms (<50ms) |
| Live thật | `live-jobs-final.json`:29/29 cases chạy,24/25 useful=96% (target≥95%),28/29 overall; không xóa failed case hoặc đổi denominator |
| Live job performance | planning p95=3073.98ms,job p95=3779.95ms; semantic median1 HTTP,max2; durable per-job counters khớp meter |
| Recovery | L22 có simulated503 + secondary thật thành công; lỗi inject vẫn được reserve như một attempt |
| Quota | `live-ledger-final.json`:151 reservations gồm146 external attempts và5 simulated faults trên TẤT CẢ runs; trần user cho phép160 tổng; không reset ledger |

Lượt live cuối đi qua `AnalysisJobs` thật, owner mới cho batch, job/idempotency riêng và repository durable hiện có. Các lượt failed/diagnostic trước được giữ trong `followup-20261017/` và hai JSON geography tại thư mục này. Diagnostic subset không được dùng để đạt release gate. Cold init là benchmark catalog/first-request; không khẳng định trạng thái cache nội bộ của dịch vụ Gemini.

## Failure còn được tính trong target

`known-live-failure.json` giữ nguyên L03: so sánh doanh thu Hồ Chí Minh–Hà Nội bị UNDERSTANDING_FAILURE sau một repair vì provider đổi grouping ngoài target được cấp. Job kết thúc `failed`,2 HTTP; không thực thi phân tích sai scope và không tính useful. Đây là một false block trong25 semantic cases, phù hợp gate96%; không phải bằng chứng mọi paraphrase đều đúng. Không biến thất bại này thành pass hoặc claim hệ thống chính xác100%.

Giá trị/source completeness không có chứng nhận vẫn `unknown`; independent oracle chưa chạy vẫn `not_measured`. Điểm kiểm chứng không phải xác suất báo cáo đúng.

## Finding → production path → regression

| Finding | Production path đã sửa | Kiểm tra chính |
|---|---|---|
| R01/R02 | canonical preflight/evaluator → pipeline, guided/legacy, jobs/modules/refine; typed actions và UI state dùng contract | `test_final_hardening_v33`, `test_v33_followup.GateParityTests`, browser real API terminal parity |
| R03 | Risk custom/auto time cùng inline scope, selected signals và applied context | `test_v33_followup` Risk tests; DB smoke trong run17; served Risk Hà Nội |
| R04 | transport recovery owner; one repair; deadline/window; reservation atomic trước send, job ledger | `test_reliability_v210`, `test_v33_provider_faults`, `test_v33_identity`; L22 và counters của29 jobs live |
| R05 | forecast future-only total, current kỳ riêng, stale-tail guard; typed metric unit tách cadence | `test_forecast_v30`, `test_v33_followup.EvidenceRegressionTests`, served guided forecast |
| R06 | driver signed deltas, current/baseline/totals độc lập và provenance | `test_v33_pair.DriverPipelineTests`, `test_v33_verification`, live L20 |
| R07 | canonical numeric/text/unit/conclusion replay; oracle mismatch downgrade; persisted verification | `test_v33_verification`, `test_v33_followup`, web `v33Followup.test.mjs`, saved report/DOCX browser |
| R08 | requirement coverage, source bindings, chart static disagreement; pair display bounded nhưng n/r tính trên toàn bộ cặp | `test_v33_views`, `test_v33_pair` (1215 pairs), `test_v33_followup`; live L19 |
| R09 | Risk tone/count/direction, below-threshold follow-up giữ scope/time, guided messaging | web `v33Followup.test.mjs`, Risk service/route tests, served Hà Nội scan |
| R10 | frozen cohort/scorer/exit code, durable shared meter, diagnostic giữ denominator; actual job live harness | `test_final_hardening_v33.LiveMeterTests`, `test_v33_live_regressions` harness, JSON từng run |
| R11/R12 | governed taxonomy v1/source, finite union/difference/complement/cohorts; unknown scope disclosed; exact matching trước SQL | `test_v33_followup.GeographyTests`, `test_v33_live_regressions`; live L23–L29 đều PASS |
| R13 | full-artifact scoped total/direct answer; non-additive canonical aggregate; scope/answer persistence | `test_v33_followup` total/AOV/module tests; regional conservation/partition tests; saved/reopen/DOCX |

## Ma trận T/G/Q

- T01–T08: canonical/financial/privacy/guided/temporal/non-additive/module/semantic-refine tests trong `test_final_hardening_v33`, `test_v33_followup`, `test_v33_identity`, real-api browser. Assertions tại provider/executor boundary, không chỉ gọi helper.
- T09–T14: Risk auto/custom numeric scope; explicit UI precedence; one repair/recovery/time/deadline/cancel/durable counters trong `test_v33_followup`, `test_reliability_v210`, `test_analysis_jobs`, `test_v33_provider_faults`.
- T15–T20: forecast horizon/accuracy caveat, signed driver, metric/source/transform view coverage và narrow/broad trong forecast/pair/views/identity suites. Large paired scatter hiển thị≤200 điểm theo key-order stride; Pearson/n vẫn dùng1215 cặp đầy đủ, disclosure rõ.
- T21–T30: numeric/text/unit/sign/denominator/group/date/ref mutations, oracle status, persistence/export, Risk classification/follow-up, partial/stale periods, correct contribution denominator và live scorer/meter. Các test nguồn trong verifier/followup suites và web utility/browser tests.
- G01–G06,G09–G16,G18–G20: independent South6/North4/Central6 expectations, subregions4/2, union7/difference5/complement10, unknown/fine-grain/qualifier/UI conflicts và exact rejection probes trong `GeographyTests`; provenance/version giữ qua save/module/export. Aliases là metadata, không hardcode câu hỏi production.
- G07: cohort repair → generate cho fixture North400/South300, answer giữ cả hai totals; wrong frozen time vẫn bị từ chối.
- G08:12 fixture branches, Top5 mỗi miền trả10 rows (5+5), regional selected sums2000/5000; global Top5 không được coi là per-region.
- G17: unknown/NULL city cùng vào “Chưa phân loại”; independent fixture North400+South300+Unknown400=1100, không mất doanh thu/nhân đôi.
- Q01–Q08: full-population totals độc lập paging; fixture AOV700/3 từ scalar query; compare/scoped total/selection labels/mutation và persistence tests. DB smoke run17 ghi197,594,000VND trong scope Nam,540 data-bearing groups; không gọi540 là tổng số cửa hàng thuộc miền.

## Cách kiểm lại trên bản đang phục vụ

1. `localhost:8501` → Trợ lý AI → nhập `Doanh thu các chi nhánh miền Nam tháng 9 năm 2026`: scope chip6 địa danh; mở chi tiết thấy source/version, tổng doanh thu đứng trước findings cực trị.
2. Thay bằng `Doanh thu miền Nam trừ HCM` / `Doanh thu miền Nam và Hà Nội`: scope5 /7; `Quảng Nam` phải có unresolved/unsupported, không tự chạy all-system.
3. Rủi ro Hà Nội + tháng9 custom: applied context vẫn Hà Nội; nhóm vượt ngưỡng và aggregate tách riêng, không false green.
4. Dùng guided Dự báo doanh thu2 tháng:0 AI; tách current in-progress với2 future points, future total không cộng current; kết luận/caveats hiển thị.
5. Guided Overview → report → Kiểm chứng & nguồn → chạy đối chiếu độc lập: truy vấn read-only,0 AI; trạng thái thể hiện kết quả thật. Save/reopen/Word qua fixture browser giữ conclusion/evidence/verification.

## Bản đang phục vụ

Analytics API và web-ui đều healthy sau deploy/restart. Browser tải `/assets/index-BQXk_xMd.js`, SHA256 `94af386bd32277eeafb0613b6e2f57921edde770d368428337fd259914109d48`. Restart API cùng container giữ ledger151. Screenshots: `south-input.png`, `risk-hanoi.png`, `guided-report.png`, `independent-reconciliation.png`, `guided-forecast.png`. Đã xem ảnh scope/forecast, không chỉ kiểm response JSON; đây là automated acceptance, không thay lời xác nhận người dùng đã test tay.

## Rollback và giới hạn vận hành

Giữ bản source/artifact/image trước theo version và digest; nếu cần rollback deployment thì phục vụ image/source snapshot đồng bộ trước đó sau khi chủ dự án chọn. Không dùng git reset/clean/rebase và không xóa Redis jobs, lịch sử runs hoặc dữ liệu kho. Thay đổi hiện vẫn ở working tree để người dùng review/commit.
