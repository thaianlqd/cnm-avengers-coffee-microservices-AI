# Data Platform — bàn giao đầy đủ cho phiên chat mới

Ngày chốt: **18/10/2026**, múi giờ Việt Nam. Đây là tài liệu tiếp nối công việc V3.3 AI Data Analyst, tổng hợp việc đã làm, bản code đã nghiệm thu, môi trường đang chạy, bằng chứng và giới hạn còn lại. Tài liệu này được tạo sau khi đóng nghiệm thu; không phải yêu cầu tự động bắt đầu một đợt sửa hoặc live test mới.

## 1. Đọc nhanh trước khi tiếp tục

**Goal triển khai `AI_V33_REVIEW_FOLLOWUP_PLAN.md` đã COMPLETE theo các release gates của PLAN.** WP0–WP9, gồm WP1A/WP5A và nhóm finding R01–R13, đã có production-path fixes, regression tests và nghiệm thu. Điều này không có nghĩa mọi câu hỏi tự nhiên đều thành công: lượt live cuối còn một ca bị false block, được tính là thất bại và lưu nguyên bằng chứng.

| Hạng mục | Tình trạng đã kiểm chứng |
|---|---|
| Code | Đã sửa trong working tree, **chưa commit/push**; giữ thay đổi có sẵn của Claude/người dùng |
| Backend | **1.063 tests PASS**, không fail/error trong full runner cuối |
| Frontend | **165 tests PASS**, TypeScript typecheck và production build PASS |
| Offline evaluation | **146 ca cũ + 33 ca V3.3 PASS** |
| Browser fixture | **16/16 PASS**: 12 mocked lifecycle + 4 journeys qua FastAPI/fixture thật |
| Browser trên ứng dụng đang phục vụ | **12/12 PASS**, API thật/DB read-only, không mock API responses, **0 paid HTTP** |
| Live provider qua jobs thật | Chạy đủ **29/29 ca**, không skipped; **24/25 useful = 96%**, overall 28/29 |
| Live gate | PASS theo ngưỡng useful ≥95%; không ghi L03 thành pass |
| API/web hiện tại | Cả hai **healthy**, vừa đọc lại trạng thái khi viết tài liệu này |
| Địa chỉ dùng thử | **http://localhost:8501**; API được publish ở **http://localhost:8502** |
| Hạn mức live | Đã reserve **151/160 tổng**, gồm 146 external attempts và 5 simulated faults; còn tối đa 9 reservations trong quyền hiện có |
| Phạm vi đã thay đổi | Data Platform và harness liên quan; không sửa chatbot/K8s/schema/migrations/ingestion/Spark/Gold |

Người dùng không cần build lại để kiểm bản đã bàn giao. Các số liệu PASS ở trên gắn với snapshot nghiệm thu; sau khi phiên mới sửa code, phải chạy kiểm tra liên quan trước khi tiếp tục dùng các số đó làm bằng chứng cho bản mới.

## 2. Repo, nhánh, snapshot và cách bảo toàn công việc

Repository:

```text
/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI
```

- Branch: `branch_thaian`.
- HEAD nền: `ee8a00b1c584dbacb25f54755c98205efe1f5e8a`.
- SHA256 của **raw bytes** `git diff HEAD -- data-platform .claude` tại nghiệm thu: `e84143c287e9df90dbabd158c5def7858eb0b326347598517ad4783a600af391`.
- Manifest cuối ghi 87 tracked files thay đổi và digests của 37 untracked source/test/document files tại thời điểm tạo manifest. Đây là tổng working tree kết hợp công việc trước của Claude và công việc tiếp nối, không phải toàn bộ đều do phiên cuối tạo.
- File bàn giao này được thêm **sau** manifest, nên không có trong danh sách 37 untracked files của manifest lịch sử. Không cần ghi đè manifest nghiệm thu chỉ để thêm tài liệu này.
- Không lấy HEAD một mình làm đại diện code đã test: phần triển khai chưa commit, phải đối chiếu cả dirty diff và untracked files.
- `git diff --check` đã PASS; quét nội dung thêm và untracked text không phát hiện literal secret. Các print/console mới được ghi nhận thuộc test/eval/benchmark/evidence/browser harness.

Không `git reset`, `restore`, `clean`, `stash`, `rebase`, commit hoặc push nếu người dùng chưa yêu cầu. Không hoàn tác thay đổi chỉ vì chưa nhận ra nguồn gốc. Không chuyển sang worktree `...-AI-k8s` để làm nhiệm vụ Data Platform này.

## 3. Tài liệu nào là nguồn chính

| File | Vai trò |
|---|---|
| [AI_V33_REVIEW_FOLLOWUP_PLAN.md](AI_V33_REVIEW_FOLLOWUP_PLAN.md) | PLAN chính đã triển khai, gồm WP0–WP9, WP1A/WP5A, ma trận T/G/Q và DoD |
| [AI_V33_REVIEW_FOLLOWUP_PLAN.progress.md](AI_V33_REVIEW_FOLLOWUP_PLAN.progress.md) | Trạng thái hiện tại ở đầu file; checkpoint 8 là nghiệm thu cuối; các checkpoint cũ giữ lịch sử |
| [AI_V33_POST_IMPLEMENTATION_REVIEW.md](AI_V33_POST_IMPLEMENTATION_REVIEW.md) | Independent review gốc R01–R13, dùng để hiểu vấn đề ban đầu; không coi lỗi lịch sử trong đó là hiện vẫn chưa sửa |
| [evaluation/v33/followup-20261018/README.md](evaluation/v33/followup-20261018/README.md) | Bảng release gates, finding → production path → tests, giới hạn và kịch bản kiểm lại |
| [evaluation/v33/followup-20261018/manifest.json](evaluation/v33/followup-20261018/manifest.json) | HEAD, raw diff digest, untracked digests, catalog file SHA và tóm tắt offline eval |
| [evaluation/v33/followup-20261018/commands.json](evaluation/v33/followup-20261018/commands.json) | Exact commands đã chạy, môi trường và kết quả |
| [evaluation/v33/followup-20261018/runtime.json](evaluation/v33/followup-20261018/runtime.json) | Policy/catalog/registry/build identity và served browser status |
| [AI_V33_COMPLETION_PLAN.md](AI_V33_COMPLETION_PLAN.md) | Đặc tả nền trước vòng independent review này |
| [AI_V33_FINAL_ANALYST_HARDENING_PLAN.progress.md](AI_V33_FINAL_ANALYST_HARDENING_PLAN.progress.md) | Progress cũ của Claude; dùng làm lịch sử, không thay trạng thái nghiệm thu mới |

Nếu gặp dòng `IN_PROGRESS`, `NOT_RUN`, ledger111/120 hoặc “chưa complete” ở checkpoint cũ: đọc phần trạng thái hiện tại và checkpoint 8 trước. Không xóa lịch sử để làm tài liệu có vẻ xanh hơn.

## 4. Kiến trúc và luồng sản phẩm đang giữ

Data Analyst vẫn dùng kiến trúc Hybrid: LLM diễn giải nghĩa; server nắm metric definitions, scope, compatibility, compiler, SQL read-only, execution, calculations, validation và report verification. Không cho LLM tự quyết geographic membership hoặc dùng raw SQL tùy ý để vượt policy.

Luồng chính:

```text
UI free text / guided / module / refinement
→ normalize request + meaning/identity anchors
→ canonical capability/preflight + governed ScopeResolution
→ deterministic guided intent hoặc tối đa 1 semantic interpretation
→ static compatibility + targeted semantic repair nếu đủ điều kiện
→ resolver/compiler + view/answer requirements
→ SQL read-only + runtime/data guards + artifacts
→ charts + derived evidence + direct answers + conclusion + verification
→ session/history/save/reopen/DOCX
```

`Phân tích` dùng one-click job; `Xem kế hoạch` vẫn là preview/approve tùy chọn. Generate phải kiểm identity/revision/policy, không tin client tự khai READY. Known terminal decisions bị chặn trước provider và analytical SQL; trường hợp nghĩa còn cần diễn giải không bị giả thành đã compiled hoặc có dữ liệu.

Bảy mode: **Câu hỏi tự do, Tổng quan, So sánh, Xếp hạng, Xu hướng, Dự báo, Rủi ro & cảnh báo**. Contribution nằm dưới Tổng quan; association là phương pháp nội bộ/free text. Legacy reports/modules vẫn có adapter phù hợp, không tự nâng report cũ thành verified theo policy mới.

## 5. Những phần đã sửa và nối vào production

### 5.1. Capability, mọi đường vào và request identity

- Dùng contract canonical cho decision, constraints, typed actions và requirements; legacy presentation fields được suy ra từ contract.
- Nối gate qua preflight/pipeline/planner/generate/jobs/modules/semantic refinement; chặn bypass bằng legacy flag, module ID hoặc client READY.
- Kiểm clause bắt buộc: revenue hợp lệ không làm profit/loss/filter unsupported ở vế sau bị bỏ qua.
- Chuẩn hóa alias `question`/`prompt`, time/scope và trả lỗi khi alias xung đột.
- Typed actions cập nhật state có kiểm soát rồi preflight lại; không nối chuỗi vào prompt để mô phỏng state.
- Policy/catalog/request meaning/mission/time/scope/reference date/revision được dùng để bảo vệ approval, plan và reuse.
- Guided text đổi nghĩa phải bỏ quyền dùng guided intent cũ. Module rerun đi lại canonical path với intent/time/scope phù hợp.

Các file trọng tâm: `services/semantic_preflight_contract.py`, `preflight_service.py`, `request_anchors.py`, `analytical_resolver.py`, `analysis_pipeline.py`, `hybrid_analyst_planner.py`, `analysis_module_service.py`, `routers/ai.py`.

### 5.2. Scope địa lý, miền Nam/Bắc/Trung và cohort

- Thêm `scope_resolution_service.py`, metadata source/version và governed value groups trong semantic catalog.
- Taxonomy `warehouse_reporting_geography_v1` là **phân vùng báo cáo nội bộ theo địa danh có trong kho**, không đại diện đầy đủ địa lý hành chính Việt Nam.
- Miền Nam trong taxonomy này có 6 địa danh: **Hồ Chí Minh, Cần Thơ, Bình Dương, Đồng Nai, Bà Rịa - Vũng Tàu, Kiên Giang**. Bắc có 4, Trung có 6; membership cụ thể lấy từ catalog, không tự nhớ hoặc bịa danh sách.
- Hỗ trợ finite union, difference, complement, subregions và comparison cohorts; exact membership được kiểm trước execution.
- “Miền Nam trừ HCM” → 5; “miền Nam và Hà Nội” → 7. Địa danh chưa hỗ trợ/qualifier chưa bind phải disclose unresolved/clarify/unsupported, không tự chạy toàn hệ thống.
- Có dimension `reporting_region` được compiler dựng từ metadata; unknown/NULL vào “Chưa phân loại” để không mất doanh thu khi phân rã theo miền.
- Top N trong **mỗi miền** phải có ranking partition, không thay bằng global Top N.
- Scope repairs dùng typed expected patches cho filters/cohort axis; không được đổi frozen metric/time để làm test xanh.
- UI hiện detected scope, members, source/version và giới hạn taxonomy; scope/answer/provenance được giữ qua module/save/export.

Tất cả 7 live geography cases L23–L29 đều PASS trong full run cuối. Fixture conservation: North400 + South300 + Unknown400 =1100; per-region Top5 trên fixture12 branches trả10 rows, không global Top5.

### 5.3. Risk Scan/Deep và presentation

- Resolve time và inline scope độc lập; custom date không làm mất Hà Nội/HCM trong câu hỏi.
- Server thực thi selected signal IDs; Scan0AI, Deep dùng cùng governed signal/threshold/sample semantics.
- Risk revenue/orders/AOV đơn thuần được redirect phù hợp trước SQL, không success với nội dung rủi ro rỗng.
- UI phân biệt aggregate trong ngưỡng với nhóm vượt ngưỡng; no_data/insufficient/execution_error không giả xanh.
- Follow-up giữ đúng scope/time và hướng kiểm tra theo signal; applied context thể hiện request thật đã chạy.
- Inventory là snapshot, không giả thành lịch sử tháng được chọn. Không tạo composite risk score mới.

DB smoke trước đó: Hà Nội tháng9 auto/custom cùng giá trị94,62%,0AI. Served browser cuối đã chạy Hà Nội Scan qua API/DB thật,0AI và đúng applied scope.

### 5.4. Provider recovery, budget, deadline và job ledger

- Transport là owner duy nhất của resend/failover. Planner chỉ sở hữu interpretation và targeted semantic repair; không semantic model hopping.
- Mỗi submission: **≤1 interpretation + ≤1 targeted repair + ≤1 transport recovery; ≤3 physical HTTP**.
- Reserve trước send; failed/timeouts/recovery/repair đều tính. Counters logical/physical/repair/recovery có ý nghĩa riêng.
- Production ledger nằm trong job repository qua atomic mutation; resume/reconnect không được reset allowance. `JobRepository` và `AnalysisJobs` nằm trong `services/analysis_job_service.py`.
- Job idempotency/resume/cancel và terminal `needs_input` được nối qua luồng sản phẩm.
- Policy thời gian: planning40s; propose envelope41s; job70s; provider tổng30s; mỗi attempt≤12s; connect≤2s; local reserve5s; recovery cần cửa sổ tối thiểu6s sau reserve. Timeout lấy giới hạn còn lại nhỏ nhất.
- Fault tests kiểm 503/reset/timeouts/429/auth/secondary/malformed/repair/cancel/reservation crash. L22 cuối có simulated503 và secondary thật thành công.
- Giả thuyết “transport làm mất repair payload” đã bị test HTTP-boundary bác bỏ. **Không sửa NativeAgentProvider history/reset chỉ dựa vào giả thuyết cũ này.** Bằng chứng: `transport-hypothesis-rejected.txt`.

Các file trọng tâm: `services/provider_budget.py`, `agent_provider.py`, `hybrid_analyst_planner.py`, `analysis_job_service.py`; tests reliability/provider faults/identity/live regressions.

### 5.5. Temporal, forecast, association, driver và view coverage

- Period selection, current/clipped periods và stale tail được xử lý có giới hạn; một kỳ không đủ để kết luận trend/growth, không zero-fill đuôi stale thành0.
- Thiếu chứng nhận source completeness vẫn `unknown`; MIN/MAX/freshest source không chứng minh mọi nguồn complete.
- Forecast giữ thuật toán hiện có; total chỉ cộng **future** points, tách current in-progress point. Metric unit `VND` tách khỏi cadence `month`/`day` trong answer binding.
- Forecast policy hiện tại chặn grouped/scope-filtered forecast; không gợi ý branch-filtered forecast làm workaround. Horizon/history theo governed catalog; expectation accuracy95% không phải guarantee.
- Backtest dùng số thật: sMAPE/evaluated points/test horizon/folds/naive baseline/improvement; không đổi thành “độ chính xác AI”.
- Association revenue/cancellation ghép hai aggregates theo unique store key, giữ populations, sample/variance/invalid guards và caveats; không suy diễn nhân quả.
- Pair1215 quan sát: chart preview≤200 điểm theo key-order stride, có disclosure; Pearson/n và verification vẫn dùng toàn bộ cặp, không tính trên preview.
- Driver dùng signed deltas, equivalent complete baseline và totals current/previous độc lập; không mặc định doanh thu đã giảm và không gọi decomposition là nguyên nhân nhân quả.
- View requirements thay hard chart floor. Narrow/scalar/Top N không padding; missing required evidence không full success. Metric/dimension/source/transform bindings được kiểm; coverage/conclusion được tính lại sau response bounding.

### 5.6. Direct answers, conclusion, verification và persistence

- `answer_requirement_service.py` dựng direct answers từ full artifacts/canonical evidence, độc lập thứ tự chart và paging. Doanh thu tổng không còn mặc định trả “chi nhánh cao nhất”.
- Additive total dùng full artifact; AOV/rate/distinct dùng canonical aggregate thích hợp, không cộng nhóm một cách sai nghĩa.
- Conclusion có direct answers/findings/evidence/caveats/actions đọc được; forecast trả lời phần tương lai, không chỉ lịch sử.
- Canonical replay kiểm text, số, dấu, unit, denominator, group/date/formula/reference; evidence ID tồn tại hoặc chứa dấu `-` không đủ để pass.
- Independent reconciliation mismatch downgrade trạng thái; chưa đo phải là `not_measured`, không pass. Năm chiều trust tách riêng, không gom thành xác suất báo cáo đúng.
- Giữ conclusion/forecasts/verification/provenance qua bounded response/session/save/reopen/DOCX. `KẾT LUẬN PHÂN TÍCH` nằm cuối phần phân tích UI/DOCX.
- Served oracle đã thực thi2 independent read-only queries,2/2 matched,0AI. Đây là kiểm chứng số liệu cho report đó, không phải100% đúng cho mọi báo cáo.

### 5.7. UI state isolation và test infrastructure

- Các async paths mang epoch/request/report identity và AbortSignal; late preflight/propose/generate/refine/Risk/reconcile không được ghi đè state mới.
- Reset/đổi nghĩa request invalidates plan/approval/report/drafts phù hợp; history chỉ mở chủ động. Reconnect dùng job/key cũ, không propose lại tạo paid work mới.
- TypeScript contracts capability/scope/answer/report đã nối vào state/actions thực tế.
- Runner trả nonzero khi test/typecheck/build/eval fail; provider env/secondary isolation được chuẩn hóa. Offline tests chặn external network/warehouse ngoài fixture.
- Main evaluator nạp33 V3.3 cases; legacy failures/retrieval failures đã triage và xử lý, không skip/delete cho xanh.
- Playwright có mocked race tests và journeys qua API fixture riêng; lưu riêng với browser acceptance trên served API/DB thật.

## 6. Kết quả nghiệm thu và số liệu quan trọng

| Kiểm tra | Kết quả | File trong `evaluation/v33/followup-20261018/` |
|---|---|---|
| Full chuẩn |1063 backend/165 web/typecheck/build/146+33 eval/12 mocked browser PASS, exit0 | `full-final.txt` |
| Real fixture browser |16/16 PASS, gồm12 mocked +4 actual FastAPI fixture | `browser-final.txt` |
| Served browser |12/12 PASS,0AI, không mock responses | `served-browser.json`, `served-final.txt` |
| Final affected modules |104 PASS | `final-module-tests.txt` |
| Geography exact-scope |76 PASS | `exact-scope-tests.txt` |
| Warm preflight |990 requests; median13,78ms, p95 **21,37ms**, mục tiêu<50ms | `preflight-benchmark.json` |
| Cold catalog / first |154,4ms /88,2ms, báo riêng | `preflight-benchmark.json` |
| Live useful |24/25=96%, toàn29 cases chạy,0 skipped | `live-jobs-final.json` |
| Live latency |Planning p95=3073,98ms; job p95=3779,95ms; end-to-end p95=3833ms | `live-jobs-final.json`, `latencies-and-counters.json` |
| Live counters |Semantic physical HTTP median1, max2; per-job durable counters khớp meter | `live-jobs-final.json` |
| Total quota |151 reservations=146 external attempts+5 injected faults | `live-ledger-final.json` |
| Final consistency |Diff/secret scan/artifact consistency PASS | `final-checks.json` |

Full backend mất544,090s ở lần cuối. Host Python tạo manifest là3.15.0; **backend tests/runtime dùng Docker Python3.11.17 aarch64**. Đừng dùng trường `python` trong manifest để suy ra backend đã chạy trên host3.15.

DB smoke lịch sử trong run17: miền Nam tháng9 có scoped revenue197.594.000VND và540 nhóm có dữ liệu. Đây không phải tổng số cửa hàng trong miền và không phải số bất biến nếu warehouse sau này thay đổi. Served guided report all-system cuối ghi440.072.000VND; không so hai số khác scope rồi gọi là lệch.

Browser screenshot evidence: `south-input.png`, `risk-hanoi.png`, `guided-report.png`, `independent-reconciliation.png`, `guided-forecast.png`. Scope/forecast screenshots đã được xem trực tiếp. Đây là automated browser acceptance trên UI thật; người dùng chưa được ghi nhận đã tự nghiệm thu thủ công.

## 7. Lỗi còn lại và giới hạn phải nói trung thực

**L03 vẫn FAIL:** câu so sánh doanh thu Hồ Chí Minh với Hà Nội tháng9 bị `UNDERSTANDING_FAILURE` sau1 repair vì provider đổi `dimension_ids` ngoài target được cấp (`untargeted_field_changed`). Job kết thúc failed, dùng2HTTP; không xuất báo cáo sai scope và không tính useful. Chi tiết đầy đủ trong [known-live-failure.json](evaluation/v33/followup-20261018/known-live-failure.json).

Ca này là false block có thể cải thiện ở vòng sau. Gate≥95% được đạt với24/25, không có nghĩa đã sửa được mọi paraphrase hoặc được phép nới frozen fields. Khi sửa tiếp: tái hiện offline, xem issue targeting/cohort axis, chỉ mở field đúng dependency; giữ regression chống đổi metric/time/scope khác. Không xóa failed case hoặc đổi denominator để tuyên bố100%.

Các giới hạn khác:

- Geographic taxonomy chỉ bao phủ nhãn được quản trị trong kho; địa danh/qualifier mới có thể cần clarify/unsupported.
- Source completeness có thể unknown; “verified” nội bộ không thay thế independent oracle, chứng nhận freshness hoặc độ đúng nghĩa của mọi câu hỏi.
- Forecast có policy/horizon/history restrictions và không đảm bảo accuracy≥95% hay causal explanations.
- Performance/live rate là kết quả của frozen cohort trên snapshot/môi trường đã đo, không SLA cho mọi câu hỏi, tải cao hay provider model version tương lai.
- Phiên này không audit toàn bộ Kafka/Spark/Airflow/ingestion/Kubernetes/chatbot, không chạy load test toàn hệ thống và không thay schema. Hai service healthy không chứng minh toàn bộ stack đều healthy.
- Không có bước commit/push hoặc triển khai production. Đây là local development deployment.

## 8. Live authorization, counters và cách tránh tiêu quota nhầm

Người dùng đã xác nhận rõ các trần **TỔNG**60 →80 →120 →160HTTP, gửi cùng29 frozen questions và metadata nghiệp vụ đến Google Gemini tại `generativelanguage.googleapis.com`, dùng cấu hình hiện có; không gửi raw warehouse rows hay dữ liệu cá nhân khách hàng. Lần nâng gần nhất là160 tổng, không phải được thêm160.

- Frozen case file: `analytics-api/evals/live_cases_v33.json`.
- SHA256 case file: `975e93363e4d80f20059fcef860a349ee8158cad827b40a984afe8d922808cab`.
- Shared global acceptance ledger đang ở **trong analytics-api container**: `/tmp/v33-live-http-ledger.json`.
- Ledger đã đọc lại lúc viết tài liệu:151 reservations/151 events. Bản snapshot bền trong repo: `evaluation/v33/followup-20261018/live-ledger-final.json`.
- Global acceptance meter khác production per-job durable ledger. Cần giữ cả hai; không suy ra global budget còn lại chỉ từ một instance `ProviderBudget` mới.
- Final full run dùng32 reservations=31 external+1 simulated503; total151 đã bao gồm các failed/diagnostic runs trước.
- Còn9 không đủ full rerun29 cases. Không tự chạy live thêm chỉ để “kiểm lại cho chắc”. Nếu vượt160 hoặc đổi payload/destination vượt phạm vi đã duyệt, cần authorization mới.
- Không recreate analytics-api container làm mất `/tmp` ledger rồi tưởng quota về0. Không reset/xóa ledger hoặc bỏ failed reservations. Nếu ledger mất, dừng paid work để đối chiếu snapshot/lịch sử và phục hồi counter bảo thủ trước.
- Diagnostic subset không đủ đóng release gate; không ghép lần đẹp nhất của từng ca thành một full PASS. Giữ failed/skipped trong denominator theo harness.
- `--approved-ceiling` là tham số kỹ thuật, không tự tạo quyền chi tiền. Phiên bàn giao này không gọi provider thêm.

Trước đây auto-review từng chặn live vì thiếu egress authorization; người dùng sau đó đã duyệt rõ. Một phiên khác bị dừng do usage limit và đã resume. Hai sự kiện lịch sử đó không phải blocker hiện tại và không cần xin lại đúng quyền đã có.

## 9. Lịch sử live cần giữ

Không chỉ lưu lần cuối xanh. Run17 giữ live ban đầu64%, run ở trần80 đạt80% với2 skipped, run ở111 đạt92%; diagnostics và failed ledger được giữ. Run18 còn `geography-before-patches.json` và `geography-after-axis-patch.json` trước final full pass.

Thư mục:

```text
data-platform/evaluation/v33/followup-20261017/
data-platform/evaluation/v33/followup-20261018/
```

Host `/tmp` từng mất sau reboot. Artifacts trong repo là nguồn bàn giao chính; đừng dựa vào một session ID/tool log hoặc đường dẫn `/tmp` cũ để tuyên bố một test đã pass. Lịch sử checkpoint giải thích quá trình, file final result xác nhận trạng thái cuối.

## 10. Dịch vụ và bản build hiện tại

| Thành phần | Giá trị |
|---|---|
| Compose | `docker-compose.data.yml` |
| API service/container | `analytics-api` / `avengers_analytics_api` |
| Web service/container | `web-ui` / `avengers_analytics_web` |
| Web URL | `http://localhost:8501` |
| API published URL | `http://localhost:8502` |
| Web image tại nghiệm thu | `sha256:bcc20d112f0ddb7ad416c525111f3aa68cf342e3075e0d61269faa5c01299e6e` |
| Served JS | `/assets/index-BQXk_xMd.js` |
| Served JS SHA256 | `94af386bd32277eeafb0613b6e2f57921edde770d368428337fd259914109d48` |
| Policy / resolver / job versions |3.3.1 /2.8.0 /3 |
| Catalog fingerprint | `967f2fdc6ab5933e616596c02f256793bc7e12c23356b1eb54f45a7f93e667d1` |
| Registry fingerprint | `c2805207d50c4480360cdfb5e6e145283426e6bdc31dc61146741f237810d12a` |

Web đã rebuild riêng bằng `--no-deps --build`; API đã restart **cùng container**, sau khi backend suite kết thúc. Ledger151 được kiểm lại sau restart. Hai service healthy khi đóng nghiệm thu và khi viết tài liệu này.

Container fixture do tác vụ tạo: `v33-followup-fixture`, cổng18765, **đã dừng sau tests**. Không cần nó để dùng ứng dụng; muốn chạy lại real-fixture browser thì khởi lại bằng script riêng. Không dừng stack, xóa volumes hoặc recreate API tùy tiện. Trạng thái K8s không được suy ra từ công việc này.

## 11. Lệnh kiểm tra dùng cho phiên sau

Chạy từ repo root, trừ khi nêu khác. Các lệnh test sau là offline; không cần thực thi lại tất cả chỉ để đọc bàn giao. Dùng `LOG_DIR` riêng cho từng lần để tránh ghi đè log.

```bash
# Trạng thái đọc-only trước khi sửa
git status --short
git diff --check
docker compose -f docker-compose.data.yml ps analytics-api web-ui

# Regression module liên quan
LOG_DIR=/tmp/v33-next-module .claude/scripts/dp-test.sh module tests.test_v33_live_regressions
LOG_DIR=/tmp/v33-next-scope .claude/scripts/dp-test.sh module tests.test_v33_followup

# Frontend node tests + typecheck + build
LOG_DIR=/tmp/v33-next-web .claude/scripts/dp-test.sh web

# Offline evaluation cũ + V3.3
LOG_DIR=/tmp/v33-next-eval .claude/scripts/dp-test.sh eval

# Full release checks khi cần nghiệm thu bản code mới
LOG_DIR=/tmp/v33-next-all .claude/scripts/dp-test.sh all
```

Browser qua fixture API cần hai terminal; tên container phải đang trống:

```bash
# Terminal 1: fixture riêng, không credentials/warehouse ngoài fixture
bash .claude/scripts/dp-fixture-http.sh

# Terminal 2: 12 mocked +4 actual fixture journeys
V33_API_TARGET=http://127.0.0.1:18765 LOG_DIR=/tmp/v33-next-browser .claude/scripts/dp-test.sh e2e

# Khi tests xong, chỉ dừng container do mình tạo
docker stop v33-followup-fixture
```

Script `.claude/scripts/dp-test.sh` hỗ trợ `backend`, `module`, `web`, `eval`, `e2e`, `all`; full suite dùng Docker backend, không dựng venv host mới. Không recreate API trong lúc backend suite chạy. Chromium đã có trên máy; runner dùng binary cài sẵn nếu phù hợp, không nhất thiết tải browser lại.

Exact live command đã chạy được lưu trong `evaluation/v33/followup-20261018/commands.json`; không lặp lệnh đó trong phiên mới theo thói quen vì chỉ còn9 reservations. Script served acceptance `web-ui/tools/served-acceptance-v33.mjs` dùng API/DB thật, tạo jobs/reconciliation của owner thử nghiệm và0AI; đây không phải unit test thuần fixture.

Nếu sửa UI và cần người dùng test bản mới:

```bash
docker compose -f docker-compose.data.yml up -d --no-deps --build web-ui
```

Chỉ restart API khi không còn test đang chạy và đã bảo toàn acceptance ledger. Sau deploy phải kiểm bundle thực tế đang phục vụ; build local PASS một mình chưa chứng minh browser tải code mới.

## 12. Các file nên mở theo vấn đề

| Vấn đề | Điểm vào nên đọc |
|---|---|
| Câu hỏi/gate/alias/READY | `analytics-api/services/preflight_service.py`, `semantic_preflight_contract.py`, `request_anchors.py`, `routers/ai.py` |
| Miền/tỉnh/cohort/scope repair | `scope_resolution_service.py`, `request_anchors.py`, catalog `analysis_registry`, `sql_service.py`, `hybrid_analyst_planner.py` |
| Semantic interpretation/repair/L03 | `hybrid_analyst_planner.py`, `analysis_intent.py`, `semantic_candidate_service.py`, `tests/test_v33_live_regressions.py` |
| Provider recovery/counter/jobs | `agent_provider.py`, `provider_budget.py`, `analysis_job_service.py`, `tests/test_v33_provider_faults.py` |
| Forecast/temporal | `forecast_service.py`, `insight_service.py`, `chart_insight_service.py`, `tests/test_forecast_v30.py` |
| Tổng hợp/direct answer/conclusion | `answer_requirement_service.py`, `insight_service.py`, `chart_insight_service.py`, `analysis_pipeline.py` |
| Views/pair/driver | `view_requirement_service.py`, `derived_chart_service.py`, `analytical_resolver.py`, `tests/test_v33_pair.py`, `tests/test_v33_views.py` |
| Numeric verification/oracle | `analysis_quality_service.py`, `verification_reconciliation_service.py`, `verification_score.py`, `tests/test_v33_verification.py` |
| UI input/reset/history/reconnect | `web-ui/src/views/AnalyticsView.tsx`, `components/workspace/AnalystWorkspace.tsx`, `QuestionPreflight.tsx`, `AnalysisScopePanel.tsx` |
| Risk UI / oracle UI | `components/workspace/RiskSignalTable.tsx`, `components/report/VerificationPanel.tsx`, utilities/tests liên quan |
| Report persistence/DOCX | `workspace_service.py`, `docx_service.py`, `web-ui/src/utils/reportPersistence.mjs`, real-api browser tests |
| Live scorer/meter/eval | `evals/live_acceptance_v33.py`, `live_cases_v33.json`, `semantic_eval_v30.py`, `semantic_cases_v33.json` |

Các tên file backend trong bảng được tính tương đối từ `data-platform/analytics-api/services/` nếu không có prefix khác. Không suy đoán mọi file trong repo đều thuộc production path; lần theo call path và test boundary trước khi sửa.

## 13. Kiểm lại trên UI cho người dùng

1. Trợ lý AI → nhập **“Doanh thu các chi nhánh miền Nam tháng 9 năm 2026”**: preflight thấy6 địa danh và nguồn/phiên bản taxonomy; report trả tổng đúng scoped population trước findings cực trị. Sai nếu silently thành toàn hệ thống hoặc chỉ trả chi nhánh cao nhất thay tổng.
2. Thử **“Doanh thu miền Nam trừ HCM tháng 9 năm 2026”**, **“Doanh thu miền Nam và Hà Nội tháng 9 năm 2026”**: lần lượt5 và7 members. **“Doanh thu Quảng Nam tháng 9 năm 2026”** phải có unsupported/unresolved thay vì tự bỏ địa danh.
3. Chọn Rủi ro, nhập Hà Nội/tháng9, bấm **Kiểm tra rủi ro (0 lượt AI)**: applied scope vẫn Hà Nội; aggregate và nhóm vượt ngưỡng được tách rõ.
4. Dùng guided **Dự báo doanh thu2 tháng tới**:0AI; có2 future points, current in-progress riêng; tổng dự báo không cộng current, caveats/backtest hiện đúng.
5. Guided Tổng quan → báo cáo → **Kiểm chứng & nguồn → Chạy đối chiếu độc lập (0 lượt AI)**: trạng thái đúng measured result, không tự pass khi chưa đo. Save/reopen/Word phải giữ conclusion/caveats/evidence/verification.
6. Đổi input/reset/mở history khi response chậm: không hồi sinh plan/report cũ. Các race cases đã có browser regressions; nếu tái hiện mới cần lưu đúng request/job/report identity.

Free-text bấm Phân tích/Xem kế hoạch có thể dùng provider. Chỉ thao tác preflight hoặc guided/Scan phù hợp mới có bằng chứng0AI; không gọi mọi hành vi UI là miễn phí.

## 14. Cách bắt đầu phiên chat mới

Thứ tự đọc tối thiểu:

1. File bàn giao này.
2. Đầu `AI_V33_REVIEW_FOLLOWUP_PLAN.progress.md` và checkpoint8.
3. `evaluation/v33/followup-20261018/README.md`; mở `known-live-failure.json` nếu nhiệm vụ mới là L03.
4. `CLAUDE.md`/hướng dẫn repo áp dụng và đúng đoạn code/test liên quan nhiệm vụ mới.

Phiên mới nên kiểm `git status` trước, xác định phần người dùng muốn sửa tiếp, rồi tái hiện bằng regression offline. Không triển khai lại V3.3 từ đầu, không tự coi các failed runs cũ là trạng thái hiện tại, không chạy live trọn bộ khi chưa đủ quota. Nếu cần rollback deployment, dùng source/image artifacts đồng bộ đã chọn, không git reset/clean hoặc xóa jobs/history/dữ liệu.

Có thể dán nguyên đoạn sau vào chat mới:

> Hãy đọc `data-platform/DATA_PLATFORM_HANDOFF_20261018.md` trước rồi tiếp tục từ trạng thái thực tế đã bàn giao. PLAN V3.3 follow-up đã đạt release gates; code vẫn chưa commit, giữ toàn bộ working tree của tôi. Đọc progress hiện tại và evidence run18 thay vì làm lại từ đầu. Còn known live false block L03 HCM–Hà Nội; nếu tôi giao sửa tiếp thì tái hiện offline và sửa đúng production path, không nới safety/identity để xanh. Live ledger đã151/160 tổng, chỉ còn9 reservations trong quyền cũ; không tự chạy full live hoặc reset meter. Không commit/push/reset/clean, không đọc secret, không sửa chatbot/K8s/schema/ingestion ngoài nhiệm vụ tôi giao. Khi thay đổi code, kiểm các module liên quan và xác minh bản đang phục vụ trước khi báo xong.

## 15. Việc đã thực hiện riêng khi tạo file bàn giao này

Đã đọc lại progress/manifest/runtime/commands và evidence README; đọc trạng thái API/web và ledger bằng lệnh read-only. API/web healthy, ledger vẫn151/151 events. Chỉ thêm file Markdown này, không đổi product code, không chạy thêm live acceptance, không tiêu quota, không restart/recreate dịch vụ và không ghi đè evidence nghiệm thu cũ.
