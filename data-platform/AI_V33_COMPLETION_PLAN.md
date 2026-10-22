# V3.3 — PLAN hoàn tất A–Z cho Claude sau independent review

> **CẬP NHẬT SAU REVIEW 17/10/2026:** vòng triển khai theo tài liệu này đã được kiểm tra lại. **PLAN chính để Claude làm tiếp hiện là [AI_V33_REVIEW_FOLLOWUP_PLAN.md](AI_V33_REVIEW_FOLLOWUP_PLAN.md)**; bằng chứng và lỗi R01–R10 ở [AI_V33_POST_IMPLEMENTATION_REVIEW.md](AI_V33_POST_IMPLEMENTATION_REVIEW.md). Giữ nội dung dưới đây làm đặc tả nền/lịch sử, không coi các mục DONE trong progress là đã đạt nghiệm thu nếu probe mới còn fail.

Ngày tạo: **17/10/2026, Asia/Ho_Chi_Minh**. Trạng thái: **PLAN bàn giao triển khai — chưa xác nhận hoàn tất V3.3**.

> **ĐÂY LÀ PLAN CỦA VÒNG COMPLETION TRƯỚC; PLAN TIẾP NỐI HIỆN TẠI ĐƯỢC LIÊN KẾT Ở ĐẦU FILE.**
> Chủ dự án giao Claude triển khai; Codex chỉ review và viết tài liệu này. Việc tạo file này không triển khai code, không chạy live provider và không commit/push.

## 0. Dùng đúng tài liệu

| Tài liệu | Vai trò |
|---|---|
| **`AI_V33_COMPLETION_PLAN.md` — file này** | Chỉ dẫn thực thi tiếp nối sau review; đọc trước và hoàn tất toàn bộ checklist |
| [AI_V33_FINAL_ANALYST_HARDENING_PLAN.md](AI_V33_FINAL_ANALYST_HARDENING_PLAN.md) | PLAN kiến trúc gốc; tham chiếu các đặc tả chi tiết còn áp dụng |
| [AI_V33_FINAL_ANALYST_HARDENING_PLAN.progress.md](AI_V33_FINAL_ANALYST_HARDENING_PLAN.progress.md) | Nhật ký cũ, không phải bằng chứng tất cả phase đã hoàn thành |

Code hiện tại là nguồn sự thật. Nếu progress ghi DONE nhưng chưa đạt điều kiện của file này, mở lại phase đó. Nếu bản gốc và file này khác nhau ở việc xử lý thiếu sót đã review, ưu tiên bản tiếp nối này; giữ các ràng buộc kiến trúc và an toàn của bản gốc.

Quy ước: **A/** = `data-platform/analytics-api/`; **W/** = `data-platform/web-ui/`.

## 1. Mục tiêu, phạm vi và cách thực hiện

**Claude tiếp tục từ working tree hiện tại và hoàn tất cả 9 phase.** Kết quả là một luồng phân tích hoạt động xuyên suốt từ đầu vào đến báo cáo, có bằng chứng nghiệm thu qua API, browser và live acceptance có giới hạn.

Luồng mục tiêu:

```text
Input chuẩn hóa
  → một capability contract chung
  → READY / CLARIFY / REDIRECT / UNSUPPORTED
  → interpretation nếu cần
  → đánh giá compiled intent theo cùng policy
  → validated plan → read-only query → validated result
  → views đáp ứng requirements → verified findings
  → KẾT LUẬN PHÂN TÍCH → save/reopen/export
```

### 1.1. Chỉ dẫn thực thi cho Claude

- Thiết lập goal **hoàn tất toàn bộ V3.3 theo Definition of Done của file này**. Nếu môi trường có công cụ goal thì dùng; nếu không có, dùng checklist và progress để quản lý cùng mục tiêu. Không coi việc thiếu công cụ goal là blocker triển khai.
- Tiếp tục qua các phase mà không dừng xin xác nhận sau từng phần đã được giao. Không dừng ở skeleton, helper hoặc một nhóm test riêng lẻ chạy xanh.
- Giữ các thay đổi đúng đang có; sửa và nối tiếp phần thiếu, không triển khai lại toàn bộ từ đầu.
- Mỗi phase phải có code được gọi trong luồng sản phẩm, regression test phù hợp và bằng chứng kết quả. Khai báo class/helper nhưng không có production caller chưa đủ để đánh dấu DONE.
- Chủ động xử lý lỗi phát sinh trong phạm vi, chạy lại kiểm tra liên quan rồi tiếp tục. Không kết thúc bằng danh sách những phần vẫn làm được nhưng chưa làm.
- Cập nhật progress sau mỗi phase: production paths đã nối, kiểm tra đã chạy, kết quả, phần còn thiếu và bước kế tiếp. Không xóa lịch sử hay sửa kết quả cũ thành pass.
- Khi context đầy, ghi checkpoint gồm goal, phase đang làm, thay đổi, test results và bước tiếp; tiếp tục từ đó sau compaction.
- Chỉ dừng vì blocker môi trường hoặc quyền hạn thực sự không thể tự giải quyết. Hoàn thành các phần độc lập trước; ghi rõ hạng mục chưa nghiệm thu. Không công bố hoàn tất khi còn release gate bắt buộc chưa đạt.

### 1.2. Phạm vi đã chốt

- Branch yêu cầu: **`branch_thaian`**. HEAD nền đã review và còn trùng tại thời điểm tạo tài liệu: **`ee8a00b1c584dbacb25f54755c98205efe1f5e8a`**.
- Working tree có thay đổi V3.3 chưa commit. Kiểm tra lại trước khi triển khai; giữ nguyên thay đổi của người dùng, không reset/rebase/clean/stash/restore hoặc ghi đè mù.
- Đọc `CLAUDE.md`, các rules Data Platform/general/token-budget và instructions áp dụng trước khi sửa.
- Giữ kiến trúc Hybrid, compiler, SQL read-only, query/result validators và thuật toán forecast hiện có.
- Không sửa chatbot, Kubernetes, schema, ingestion hoặc Spark/Gold để giải quyết nhiệm vụ này.
- Không đọc/in/copy secret hoặc `.env`. Dùng tên biến trong `.env.example`; kiểm tra cấu hình bằng trạng thái đã sanitize khi cần.
- Không commit/push hoặc deploy production. Có thể rebuild dịch vụ phát triển Data Platform để nghiệm thu theo quy tắc repo.
- Có thể sửa test harness liên quan để bảo đảm isolation, counter chính xác và exit code phản ánh lỗi.
- Không cần tạo semantic system, service, planner hoặc bộ policy song song.

### 1.3. Bằng chứng đầu vào và trạng thái thực tế

Các kết quả dưới đây thuộc phiên independent review trước khi ghi file, **không phải test mới chạy ngày 17/10**. Khi Claude triển khai, ghi rõ before/after và phiên bản code được kiểm.

| Khu vực | Tình trạng đã kiểm chứng |
|---|---|
| Capability | Evaluator mới chưa được production entry point gọi; gate hiện tại có đường bypass |
| Provider | Counter vật lý chưa durable; retry thành công có thể bị từ chối bởi `provider_transport_nested`; deadline chưa được thống nhất |
| Phân tích | Risk revenue-only có thể success với 0 chart; weekly trend trong một ngày vẫn tạo kết quả trend |
| Verification | Giá trị sai vẫn được xác nhận khi evidence key chứa dấu `-` |
| Kết luận | Thiếu caveat, có action enum/chuỗi dictionary; forecast conclusion chưa trả lời đúng phần tương lai |
| UI | Response propose cũ có thể xuất hiện lại sau reset; nhiều handler chưa bảo vệ epoch |
| Backend | 946 test: **942 pass, 3 fail + 1 error** |
| Frontend | 156/156 node tests pass; typecheck pass. Review này chưa chạy lại build/browser |
| Evaluation | 146 ca cũ: retrieval domain 110/113, metric 109/113, compile 108/108, preflight 17/17; V3.3 cases chưa được evaluator chính nạp |
| Release evidence | Chưa có browser E2E, live acceptance và benchmark đầy đủ; review không có live provider call |

Bốn tên lỗi backend cần triage:

1. `test_one_shot_v24.OneShotTests.test_default_native_budget_blocks_reentry_without_reset`.
2. `test_agent_v22.AgentTests.test_distribution_and_correlation_observational`.
3. `test_agent_v22.AgentTests.test_native_provider_gemini_signature_and_groq_fallback`.
4. `test_one_shot_v24.OneShotTests.test_native_transport_failure_never_retries_or_falls_back`.

Bốn retrieval failures: `ship_12`, `rev_12`, `rev_r_02`, `v31_rev_01`.

Việc trùng tên lỗi lịch sử không chứng minh chúng vô hại hoặc được phép bỏ qua. Chúng vẫn là lỗi cần xử lý, không được tính thành pass.

## 2. Contract chung và các kiểu đầu vào bắt buộc

### 2.1. Một nguồn quyết định capability

Mở rộng contract hiện có trong `A/services/semantic_preflight_contract.py`; dùng `AnalyticalResolver`/`CompatibilityIndex` làm nguồn quyết định. Preflight, planner, UI, forecast, Risk, views và quality tiêu thụ cùng kết quả.

| Thành phần | Nội dung bắt buộc |
|---|---|
| `CapabilityDecision` | Decision, giai đoạn đánh giá, policy/catalog fingerprint, lý do/thông điệp, có cần interpretation, constraints, actions, view requirements |
| Constraint | Mã, requirement liên quan, chủ thể, static/semantic/runtime, trạng thái passed/failed/pending, blocking, nguồn/chủ thể chịu trách nhiệm kiểm |
| Action | Loại thao tác và typed patch cho mission/metric/time/scope/method; phần giữ lại và phần thay đổi rõ ràng |
| View requirement | ID, vai trò phân tích, required/optional, metric/dimension, time/scope, operation/artifact bindings, runtime predicates |
| Coverage | Mỗi requirement có bằng chứng đáp ứng hoặc lý do thiếu cụ thể; không chỉ đếm chart |
| Identity | Request meaning, mission, time/scope/reference date, catalog, policy và plan revision nhất quán qua proposal/job/cache/approval |

Bổ sung trường tương ứng vào manifest và TypeScript types. Server dựng contract từ input đã chuẩn hóa; không tin client tự khai READY hoặc gửi fabricated constraints để vượt gate.

Phân biệt hai thời điểm:

- **Input READY:** được phép tiếp tục interpretation nếu cần; chưa cam kết đã compile hoặc có dữ liệu. Unresolved semantic checks phải hiện rõ.
- **Compiled READY:** nghĩa yêu cầu đã đủ, static compatibility đã qua; chỉ còn runtime checks được khai báo như sample size, source availability hoặc result validity.

Các trường legacy `can_submit`, `state`, `findings` là projection từ contract chung. Không giữ một hàm phân loại riêng trong preflight và policy khác trong planner.

Thứ tự quyết định: **cấu trúc/privacy/security → phần bắt buộc unsupported → thiếu thông tin → cần đổi mission/method → READY**. Thu thập toàn bộ blockers và gợi ý sửa; không chỉ trả lỗi đầu tiên.

Ví dụ phân loại: mission mismatch có đích hợp lệ là REDIRECT; horizon vượt giới hạn là UNSUPPORTED kèm action sửa; thiếu metric là CLARIFY; không nhận diện được chính xác một alias tự nó chưa đủ để kết luận UNSUPPORTED.

### 2.2. Ma trận mọi đường vào

| Đường vào | Hành vi bắt buộc |
|---|---|
| Gõ câu hỏi/preflight | 0 provider, 0 warehouse query; chưa đủ bằng chứng thì thể hiện pending/needs interpretation |
| Free text + mission | Kiểm tra toàn bộ câu, gồm metric, filter, cohort, thời gian và phương pháp |
| Guided nguyên bản | Dựng intent xác định, 0 provider khi contract đã đủ |
| Guided rồi sửa câu chữ | Nếu nghĩa thay đổi, không dùng guided intent cũ; diễn giải và gate lại |
| API dùng `question` hoặc legacy `prompt` | Cùng quyết định, không phụ thuộc `natural_input`/`allow_deterministic_upgrade` |
| Alias `time`/`time_range`, branch/scope cũ | Chuẩn hóa một lần; alias mâu thuẫn trả lỗi rõ, không chọn ngẫu nhiên |
| Propose → approve → generate | Generate kiểm identity/revision/policy; approval cũ không dùng cho request mới |
| One-click job | Cùng gate với propose/generate; terminal decision kết thúc job đúng trạng thái |
| Module/template/rerun | Kiểm stored intent cùng time/scope mới; không bỏ gate vì có module ID |
| Semantic refinement | Kết hợp nghĩa báo cáo trước với feedback rồi đánh giá lại |
| Visual-only refinement | Dùng artifacts hợp lệ đã có; không provider/SQL mới chỉ để đổi trình bày |
| Cache/resume | Chỉ reuse khi identity/policy tương thích; resume cùng job/key |
| History/save/reopen | Đọc được báo cáo cũ, không nâng thành verified theo policy mới |
| Risk Scan/Deep | Chung signal, threshold, sample, temporal và scope policy |
| Export/DOCX | Bảo toàn conclusion, caveat, evidence và trạng thái kiểm chứng |

Mọi trường hợp đã xác định phải CLARIFY/REDIRECT/UNSUPPORTED trước execution phải chứng minh **0 provider và 0 analytical SQL** bằng spy ở boundary thật. Không chỉ assert counter mặc định của response. Metadata lookup phục vụ submit/runtime nếu cần phải được phân loại và đo riêng; typing preflight vẫn không I/O.

## 3. Chín phase triển khai

Thực hiện theo thứ tự để contract và gate ổn định trước khi mở rộng rendering/verification. Một phase được làm trước một phần vẫn phải kiểm lại điều kiện DONE. Trong lúc thực hiện, chỉ chạy tests liên quan; full suite chạy ở release gate và chạy lại nếu có thay đổi mới ảnh hưởng kết quả.

### Phase 1 — Hoàn thiện capability contract và identity

**Điểm nối:** `semantic_preflight_contract`, `analytical_resolver`, `semantic_catalog_validation`, `semantic_manifest_service`, `workspace_service`, request/cache identity và frontend types.

**Cần thực hiện:**

- Hoàn thiện contracts ở mục 2; giữ một evaluator canonical.
- Sinh metric capabilities từ catalog: unit, population, grain, aggregation semantics, additivity theo dimension/time, ratio parts, availability và phương pháp được hỗ trợ.
- Dimension type dựa trên metadata được quản trị; bỏ suy đoán tên ID ở các nơi riêng lẻ.
- Ratio/AOV không cộng thành parts-of-whole; distinct count chỉ cộng qua partition được chứng minh disjoint; snapshot không cộng qua thời gian.
- Nối manifest backend với TypeScript types và UI controls. Không thêm một map frontend riêng dễ drift.
- Đưa policy/catalog identity vào cache và approval validation. Bump storage/cache/job version khi wire contract không tương thích.
- Phân biệt default depth với depth người dùng chủ động chọn; không để serialize → reconstruct DTO biến default thành explicit choice.
- Giữ `accept_partial_scope` là approval choice, không làm request signature thay đổi gây hỏng propose → generate; đưa lựa chọn này vào identity của kết quả/cache liên quan khi cần.

**Test:** catalog contradictions, ratio/semi-additive/distinct partitions, manifest/types agreement, mission/time/scope/policy identity mutation, propose → approve → generate và legacy read compatibility.

**DONE khi:** cùng request có capability nhất quán ở manifest/preflight/resolver; thay meaning/mission/time/scope/policy không reuse nhầm plan; các fields mới có consumers thực tế.

### Phase 2 — Nối gate vào mọi entry point

**Điểm nối:** preflight, `AnalysisPipeline`, `HybridAnalystPlanner`, generate, jobs, module preparation/rerun, refinement, failure/action adapters và QuestionPreflight.

**Cần thực hiện:**

- Thay phân loại rời rạc trong preflight bằng projection từ evaluator chung.
- Nối evaluator vào toàn bộ paths trong mục 2.2, trước provider và trước analytical execution khi đủ bằng chứng để quyết định.
- Bỏ bypass theo legacy flags hoặc module ID. Sửa regression đúng nguyên nhân; không thu hẹp gate chỉ để tránh test failures.
- Nhận diện constraint theo từng clause: metric hợp lệ ở vế đầu không làm filter unsupported ở vế sau biến mất. Cohort metric/N của vế so sánh phải đủ riêng.
- Giữ natural language linh hoạt. Không nhận ra exact alias chưa đủ để unsupported; trường hợp cần semantic interpretation được dùng một interpretation rồi đánh giá compiled intent theo cùng policy.
- Không âm thầm bỏ phần yêu cầu. Partial analysis phải có disclosure và approval hợp lệ.
- UI dùng typed actions cho CLARIFY/REDIRECT; áp patch rồi preflight lại. Không nối chuỗi câu trả lời vào prompt để mô phỏng state update.
- Action phải dẫn đến cấu hình khả thi: đổi horizon vẫn chưa đủ nếu grouped forecast còn bị cấm; phải thể hiện toàn bộ blockers còn lại.
- Cache index/vocabulary theo catalog fingerprint để hot path không I/O.

**Test:** public API tests cho prompt/question/guided/job/propose→generate/module/refine; fabricated client READY; unsupported financial predicate lẫn supported revenue; clause-local cohort; paraphrases không bị overblock; pending/no-input/privacy handling.

**Benchmark:** warm preflight p95 `<50 ms`, frozen input matrix và môi trường ghi rõ. Đo cold init riêng; không nới/xóa assertion chỉ để xanh hoặc lẫn cold init vào latency request.

**DONE khi:** mọi đường vào cùng verdict, known terminal 0 provider/0 analytical SQL, UI có actions sửa được yêu cầu thật và benchmark có evidence.

### Phase 3 — Hoàn tất bảy chế độ và compatibility cũ

Bảy chế độ hiển thị: **Câu hỏi tự do, Tổng quan, So sánh, Xếp hạng, Xu hướng, Dự báo, Rủi ro**.

**Điểm nối:** mission metadata, `MissionPicker`, `MissionInputBuilder`, capability drawer, `missionWorkspace`, `AnalyticsView` khi load history/module/template.

**Cần thực hiện:**

- Giữ contribution dưới Tổng quan; association là phương pháp nội bộ/free text.
- Nối legacy mission mapping vào state thực tế khi mở history/module/template, không chỉ có helper trong test.
- Composition cũ ánh xạ Overview; relationship cũ đi qua free form và capability phù hợp.
- Không mất internal capabilities đang hoạt động, gồm shipper relationship.
- Dropdown metric/dimension/phương pháp lấy từ contract chung.
- Đổi mission giữ deliberate context tương thích; không để draft cũ ghi đè yêu cầu đang chuyển. Trường không còn tương thích phải được xóa/disclose rõ.

**Test:** đủ bảy modes; ẩn primary composition/relationship; legacy render/rerun; draft transition; không gợi ý unsupported metric/method/scope.

**DONE khi:** browser nhìn thấy đúng modes và legacy opening dùng mapping thật, không chỉ kiểm danh sách metadata.

### Phase 4 — Một owner phục hồi provider và ledger durable

**Điểm nối:** `NativeAgentProvider`, `ProviderBudget`/`ProviderTurn`, credential router/health, planner retry policy, `AnalysisJobs` observer và atomic job mutation, HTTP envelopes.

**Cần thực hiện:**

- Transport layer là owner duy nhất của resend/failover. Planner chỉ sở hữu interpretation và targeted semantic repair.
- Bỏ retry trùng, semantic model hop và kiểm tra cấm nhầm một transport recovery hợp lệ.
- Interpretation tối đa 1, targeted repair tối đa 1, transport recovery tối đa 1 cho toàn submission; tổng tối đa **3 physical HTTP**.
- Repair phải có tiến triển, giữ frozen fields; repeated semantic fingerprint dừng ngay.
- Transport recovery giữ cùng semantic payload/model của logical call đang phục hồi; chỉ đổi credential tương thích khi cần. Không xoay key/model để sửa lỗi nghĩa. Repair là logical call riêng, được phép có payload sửa đổi theo contract.
- Reserve physical counter trước mỗi HTTP send, kể cả timeout, failover và repair. Deduplicate credential trùng; không đổi slot giả để tạo allowance mới.
- Persist reservation qua atomic mutation của job repository hiện có; không chỉ đếm trong một instance `ProviderBudget`. Standalone path dùng cùng interface với memory adapter.
- Worker restart/reconnect không reset allowance. Reservation đã ghi nhưng chưa biết HTTP có gửi hay chưa vẫn tính bảo thủ; không replay paid attempt không rõ trạng thái.
- Tách counters interpretation/repair/recovery/physical HTTP, giữ ý nghĩa legacy counters rõ. Observer phải thực sự nhận physical reservation trước send.
- Check cancel/deadline trước mỗi attempt và trước publish result; không tiếp tục provider sau result.
- Provider health/error output được sanitize; credential slot labels được phép, key/headers/secret URL không được persist.

**Mặc định thời gian:**

| Giới hạn | Giá trị |
|---|---:|
| Planning | 40 giây |
| Propose HTTP envelope | 41 giây |
| Job | 70 giây |
| Tổng thời gian provider | 30 giây |
| Mỗi HTTP attempt | Tối đa 12 giây |
| Connect timeout | Tối đa 2 giây |
| Reserve cho local work | 5 giây |
| Cửa sổ tối thiểu để bắt đầu recovery | 6 giây sau khi trừ reserve |

Timeout thực tế lấy giới hạn nhỏ nhất còn lại giữa attempt/provider total/request deadline, có trừ local reserve. Không bắt đầu recovery khi thiếu cửa sổ. Deadline toàn submission không được khởi lại cho từng attempt; primary không dùng hết phần thời gian dành cho recovery.

**Test bắt buộc:** 503 → thành công, connection reset, early/full timeout, 429 có/không retry-after hợp lệ, auth lỗi, secondary thiếu/trùng/hỏng, malformed output, repair có/không tiến triển, cancel, cạnh tranh reservation và crash sau reservation. Kiểm cả recovery ở interpretation và ở repair; tổng vẫn ≤3.

**DONE khi:** fault-injection suite pass, recovery thành công không bị `provider_transport_nested`, reconnect không phát sinh paid work mới, allowance durable và mọi submission ≤3 physical HTTP.

### Phase 5 — Temporal, forecast, Risk, association và driver

**Điểm nối:** resolver/blueprints/intent, data coverage, forecast, Risk Watch, analytical features, query batch snapshot và typed result evidence. Không thay schema hoặc thuật toán forecast.

#### 5.1. Temporal chung

- Dùng cùng policy cho KPI, trend, growth, forecast, insight và conclusion.
- Theo timezone catalog; phân biệt kỳ hoàn chỉnh, kỳ bị cắt bởi lựa chọn, kỳ đang mở và nguồn stale.
- Không dùng MIN/MAX để khẳng định nguồn đầy đủ. Thiếu bằng chứng completeness phải ghi unknown; không tự thêm watermark schema.
- Không dùng nguồn mới nhất che độ trễ của nguồn khác. Giữ coverage/source-as-of cho từng bằng chứng.
- Một kỳ không đủ cho trend/growth; không so kỳ thiếu với kỳ đủ rồi kết luận giảm.
- Mẫu số 0 không tạo phần trăm tăng vô hạn; thay đổi rate dùng điểm phần trăm đúng ngữ nghĩa.
- Không zero-fill đuôi stale thành doanh thu 0. Phân biệt absence, missing và zero theo contract hiện có.

#### 5.2. Forecast

- Giữ thuật toán hiện có; dùng catalog policy về metric/cadence/horizon/history.
- Hiện tại không hỗ trợ grouped hoặc scope filter: gate cả hai; không gợi ý branch-filtered forecast như cấu hình hợp lệ.
- Horizon tối đa: ngày 31, tuần 13, tháng 6. History tối thiểu: 28/12/6 kỳ hợp lệ tương ứng; kiểm cả cadence/metric và runtime series.
- “Accuracy ≥95%” là expectation cần giải thích, không phải guarantee hoặc prediction interval. Không tự đổi interval thành 95% để đáp ứng câu chữ.
- Map đúng backtest thực tế: `smape_pct`, evaluated points, test horizon, folds, naive baseline và improvement; không đọc nhầm key rồi báo thiếu dữ liệu giả.
- Kết luận trả lời phần tương lai; tách lịch sử, forecast horizon, backtest và limitations. Interval coverage chỉ hiện nếu thực sự được tính.

#### 5.3. Risk

- Server nhận và thực thi selected signal IDs; default không chọn là toàn bộ signals được quản trị. Signal ID sai trả lỗi, không fallback âm thầm sang toàn bộ.
- Scan 0 provider; Deep dùng cùng threshold/sample/time semantics và evidence của engine.
- Giữ sáu signals và threshold đang có; không tạo composite score mới.
- Inventory là snapshot, không gắn thành lịch sử tháng 9.
- Query failure là lỗi tính toán có kiểu; không đổi thành `no_data`, xanh hoặc success đầy đủ.
- Revenue/orders/AOV đơn thuần không phải risk signal: REDIRECT trước query.

#### 5.4. Association

- Hoàn tất governed pair revenue/cancellation theo `store_id`: hai aggregates riêng, cùng kỳ/scope/snapshot; giữ population riêng của từng metric.
- Ghép theo khóa duy nhất; không zip theo thứ tự hoặc join fact thô. Không nới population/join guards để ép query chung.
- Duplicate key làm pair không hợp lệ; missing/invalid observations có counter và caveat.
- Loại bool/NaN/inf/NULL khỏi số hợp lệ; không ghép missing key với nhau. Báo rõ số observations ban đầu, số paired hợp lệ và số bị loại.
- Pearson chỉ khi `n≥3` và cả hai variance khác 0; `n<10` có caveat mẫu nhỏ.
- Category/city không mã hóa thành số để tính Pearson; chuyển grouped comparison phù hợp sau khi người dùng làm rõ dimension.
- Không suy diễn nhân quả từ tương quan; không bổ sung thống kê suy diễn mới trong scope này.
- Chỉ expose READY cho pair khi resolver, execution, renderer và verifier đều hoàn chỉnh.

#### 5.5. Driver

- Dùng baseline kỳ trước tương đương và hoàn chỉnh; thiếu baseline phải làm rõ/ghi limitation trước khi đưa kết luận.
- Chỉ nói “giảm” sau khi số liệu chứng minh.
- Đối soát tổng signed deltas với total current/previous độc lập, cùng snapshot/scope; không so tổng với chính tổng vừa cộng.
- Chứng minh breakdown bao phủ đầy đủ và disjoint; Top N không tự đại diện toàn bộ denominator.
- Gọi đây là phân rã thay đổi, không khẳng định nguyên nhân nhân quả.

**Test:** frozen clock, cross-year/timezone, current/clipped/stale periods, zero denominator, sparse/all-zero history, forecast max bounds, selected Risk signals, sample guard, two-population fixture, duplicate/missing/invalid pairs, constant variance và independently reconciled driver totals.

**DONE khi:** các phép tính chạy trong pipeline thật với provenance và runtime guards. Helper chỉ test riêng chưa được tính DONE. Pair phải được hoàn thiện A–Z; không trì hoãn vô hạn bằng cách giữ helper rồi tắt capability mà gọi phase hoàn thành.

### Phase 6 — View requirements và coverage thay cho chart floor

**Điểm nối:** resolver, expansion, dashboard planner/contracts, relevance, derived charts, report assembly và quality assessment.

**Cần thực hiện:**

- Resolver lập view requirements trước query: câu hỏi nào, metric nào, role nào và evidence nào cần có.
- Planner dùng cùng static compatibility cho mission/unit/population/grain/form.
- Chart layer kiểm artifact/runtime predicates và hiện thực requirement, không tự phán lại business capability.
- Bỏ hành vi nhận request rồi xóa chart vì static mission mismatch.
- Static disagreement sau compiled READY thành lỗi contract có thể quan sát; không che bằng bảng rồi trả success.
- Nối paired scatter renderer với references của cả hai artifacts và pairing/statistic evidence.
- Thay hard minimum 4 charts và special case Top≤5 bằng requirement coverage. Narrow/scalar/Top N đủ trả lời, thường 0–2 chart; broad hướng tới khoảng 4 vai trò hữu ích khi dữ liệu cho phép.
- Thiếu role có reason cụ thể. Required association evidence thiếu không phải full success; optional supporting evidence thiếu có limitation.
- Deduplicate theo nghĩa, cập nhật refs/counters sau dedup; không để orphaned references.
- Không chạy SQL hoặc tạo chart chỉ để đủ số lượng. Giữ result table/artifact paging và zero-chart scalar hợp lệ khi đã trả lời đủ.

**Test:** narrow với default Deep từ UI, explicit depth, broad coverage, semantic duplicates, paired renderer, required/optional runtime omission và READY→query→view matrix. Thay test chấp nhận Risk revenue rồi drop chart bằng test gate trước execution.

**DONE khi:** không còn Risk revenue success-0-chart, không mất requested meaning vì relevance filter, narrow và broad có direct answer/coverage đúng.

### Phase 7 — Kết luận có bằng chứng và verification trung thực

**Điểm nối:** insights, report assembly/quality, verification/reconciliation, bounded responses, UI report/verification, save/load và DOCX.

Artifact kết luận thống nhất gồm bốn phần:

1. **Trả lời trực tiếp** toàn bộ yêu cầu.
2. **Phát hiện chính** với evidence references.
3. **Giới hạn/cảnh báo** từ data, scope, kỳ, phương pháp và forecast.
4. **Hành động đề xuất** bằng câu người dùng đọc được.

**Cần thực hiện:**

- Tạo conclusion sau khi đã thu đủ report limitations. Không lấy short answer chart đầu tiên làm toàn bộ câu trả lời.
- Chuẩn hóa action objects; không hiện enum `review_gap`, `monitor_variation` hoặc `str(dict)`.
- Dùng typed evidence/calculation references cho row facts và derived statistics. Không mã hóa formula rồi suy nghĩa bằng delimiter trong một string key.
- Bỏ xác nhận dựa trên key có dấu `-`, metric marker hoặc tên `threshold_breaches`. Row key hợp lệ có dấu gạch vẫn phải được resolve chính xác.
- Verifier recompute gap/share/rate change/threshold/association từ artifacts, kiểm unit/scope/population/formula; evidence ID tồn tại chưa đủ để chứng minh statement đúng.
- Tích hợp verification vào quality gate và conclusion, không chỉ hiển thị một chip mới.
- Mutation tests thay số, dấu, denominator, group, date, formula và evidence reference phải bị phát hiện; không thêm LLM judge.
- Tách năm chiều: structural, numeric reconciliation, semantic coverage, forecast quality, provider execution. Không blend thành xác suất báo cáo đúng.
- `not_measured` khác `passed`; independent oracle đã chạy phải cập nhật đúng kết quả, không cố định luôn chưa đo. Reconciliation giữ as-of/snapshot semantics để tránh false mismatch.
- Bảo toàn conclusion/forecasts/verification/provenance qua bounded response, session, save/reopen và DOCX; sửa save whitelist nếu đang bỏ fields.
- Legacy report thiếu artifact vẫn đọc được với trạng thái legacy/not measured.
- Đặt **KẾT LUẬN PHÂN TÍCH** ở cuối phần phân tích và hiển thị trực tiếp trong UI/DOCX, không giấu trong narrative đóng mặc định.

**Test:** numeric mutation suite, primary requirement coverage, forecast-forward answer, chart/source caveat propagation, action object variants, independent oracle states và serialize → save → reopen → export round-trip. Kiểm DOCX nội dung và render/layout khi layout được sửa; không gọi UI tests là DOCX visual acceptance.

**DONE khi:** probe giá trị sai bị phát hiện, kết luận đủ bốn phần và toàn bộ requested parts, caveats không mất, save/reopen/export giữ evidence và verification.

### Phase 8 — State isolation và one-click end-to-end

**Điểm nối:** `W/src/views/AnalyticsView.tsx`, workspace/preflight/clarification, analysis jobs utils, Risk handlers, report reconciliation, history/module loading và backend terminal state adapters.

**Cần thực hiện:**

- Giữ nút **Phân tích** chạy one-click; **Xem kế hoạch** giữ preview/approve tùy chọn.
- Nối reset/invalidation vào state thật; helper chưa được handler gọi không tính hoàn thành.
- Mọi async path mang epoch và report/request identity: preflight, propose, generate, job polling/checkpoints, refine, Risk và reconciliation.
- Trước mọi state commit sau `await`, kiểm identity; bỏ response cũ. Checkpoints và catch/finally cũng không được ghi đè active state mới.
- Đổi nghĩa request phải abort client task, cancel owned task phù hợp và invalidate plan/approval/report/drafts liên quan. Async cancel cũ không được ảnh hưởng job mới.
- Reset active state về defaults: prompt, mission, time/scope, depth, guided/module context, plan, report, clarification, refinement và loading flags; giữ history để mở chủ động.
- History không bị late response hoặc module draft ghi đè; module/report selection phải có identity riêng.
- Mất kết nối resume cùng job ID/idempotency key; nút “Kết nối lại tác vụ” không gọi propose mới hoặc tạo paid submission mới.
- CLARIFY/REDIRECT kết thúc polling bằng `needs_input`; typed decision/actions điều khiển UI. UNSUPPORTED có thông báo/action đúng loại, không giả thành provider failure.
- Partial-scope approval vẫn được yêu cầu đúng lúc; không tự approve để đạt one-click metric.

**Browser regressions bắt buộc:**

| Tình huống | Assert chính |
|---|---|
| Propose chậm → reset → response cũ về | Không quay lại bước plan, không plan cũ |
| Generate chậm → đổi time/scope | Không report/approval cũ cho request mới |
| Refine chậm → mở history khác | Không ghi đè report mới chọn |
| Risk chậm → đổi mission | Không publish scan cũ vào mission mới |
| Reconcile chậm → thay report | Không gắn verification của report trước |
| Double-click | Một logical submission/job |
| Mất POST response → reconnect/refresh | Resume đúng key/job, không interpretation mới |
| Cancel khi HTTP đang chạy | Không publish kết quả muộn, không retry thêm |
| Sửa guided text, controls cũ còn | Không chạy nhầm guided intent trước đó |
| REDIRECT → sửa có kiểm soát → Phân tích | Giữ deliberate context và chạy đúng endpoint |

**DONE khi:** browser thật xác nhận stale responses không xuất hiện lại, không duplicate paid work và controls phản ánh đúng active request. Source-string assertions hoặc pure helper tests không thay thế browser acceptance.

### Phase 9 — Regression, live bounded và bàn giao

#### 9.1. Harness và offline

- Sửa runner để test/typecheck/build/eval fail trả exit code khác 0; không chỉ in failures rồi thành công. Aggregate command phải giữ failure status của các bước trước.
- Cô lập provider env nhất quán giữa module/full runner, gồm secondary credential; không in giá trị env.
- Unit/offline chặn network và warehouse ngoài fixture; spy đếm ở transport/executor thật.
- Nạp `semantic_cases_v33.json` vào evaluator chính; ghi từng case, không chỉ aggregate tự tạo.
- Dùng API/job/propose→generate integration tests cho cross-entry invariant. Gọi riêng `guided_context` không chứng minh provider không thể bị gọi ở toàn pipeline.
- Giải quyết bốn backend failures và bốn retrieval failures ở mục 1.3. Nếu legacy expectation xung đột policy mới, dùng adapter/expectation có giải thích và giữ production invariant; không skip/delete/loosen test cho xanh.
- Expected numeric values phải từ fixture/oracle độc lập, không copy lại output vừa sinh.

#### 9.2. Browser

- Thêm Playwright E2E với Chromium, script `test:e2e`, test server riêng và API mocking cho race cases; pin dependency bằng lockfile theo môi trường repo.
- Dùng local test server qua [Playwright webServer](https://playwright.dev/docs/test-webserver) và deferred/mock responses qua [Playwright mock APIs](https://playwright.dev/docs/mock).
- Chạy thêm browser journeys qua API thật ở guided/fixture mode để kiểm wiring; ghi riêng với mocked UI tests.
- Lưu traces/screenshots khi fail. Test phải click và quan sát request/state, không chỉ grep source.
- Không để harness intercept production behavior hoặc thêm test-only bypass vào capability policy.

#### 9.3. Thứ tự kiểm tra và lệnh

1. Chạy tests từng phase trong quá trình sửa.
2. Full backend bằng `.claude/scripts/dp-test.sh backend` từ repo root.
3. Frontend node tests, typecheck, build qua `.claude/scripts/dp-test.sh web`.
4. Offline evaluation cũ + V3.3 qua harness đã nối, `.claude/scripts/dp-test.sh eval`.
5. Browser E2E qua `npm run test:e2e` trong W/.
6. Read-only database smoke qua executor chuẩn; không dùng SQL riêng để né validators.
7. Live provider acceptance sau khi meter/gates sẵn sàng.
8. Rebuild web container và kiểm served bundle; không recreate API giữa backend suite. Dùng `--no-deps` khi chỉ cần cập nhật web và API đã sẵn sàng.
9. Manual acceptance trên UI phục vụ tại `localhost:8501`.

Giữa phase dùng `.claude/scripts/dp-test.sh module tests.<module>` sau khi isolation được sửa. Không dùng unisolated `unittest discover`. Chỉ rerun full checks khi có thay đổi/failure cần xác minh thêm; không chạy lặp vô mục đích.

**DONE khi:** toàn bộ release gates ở mục 5 đạt và artifacts phản ánh đúng phiên bản code được kiểm. Bundle chứa chuỗi mới chưa đủ chứng minh feature đúng; vẫn cần journeys.

## 4. Ma trận đầu vào/nghiệm thu bắt buộc

Mỗi nhóm có paraphrase, đảo clause, alias hợp lệ, có/không dấu và structured equivalent khi phù hợp. Đây là fixtures để kiểm invariant, không phải chuỗi để hardcode production. Kết hợp với các entry points ở mục 2.2 theo parameterized matrix; bao phủ mọi public path và mọi lớp constraint, không chỉ một câu happy path.

| ID | Nhóm đầu vào | Quyết định/hành vi mong đợi |
|---|---|---|
| IN-01 | `dsdasds`, chào hỏi, câu không có nội dung phân tích | Hướng dẫn nhập lại, không chạy planner thông thường |
| IN-02 | Top 5 chi nhánh tốt nhất tháng 9 | CLARIFY metric, giữ N/entity/time |
| IN-03 | Overview nhưng yêu cầu Top 5 revenue | REDIRECT Ranking; action giữ metric/N/time/scope |
| IN-04 | Doanh thu HCM so với nhóm branch hoạt động tốt nhất | CLARIFY tiêu chí và N của cohort còn thiếu |
| IN-05 | Revenue HCM so với cancellation Hà Nội | CLARIFY mục tiêu; nếu separate panels thì không gap chung unit |
| IN-06 | Chỉ các chi nhánh đang lỗ | UNSUPPORTED financial filter; không low-revenue proxy |
| IN-07 | Revenue hợp lệ kèm profit/filter unsupported | Chặn phần bắt buộc unsupported, không silent partial execution |
| IN-08 | Top 5 doanh thu cao nhất, loại doanh thu thấp | Chuẩn hóa redundancy, không tự đặt threshold |
| IN-09 | Cơ cấu AOV theo chi nhánh | REDIRECT Compare; AOV vẫn là metric hợp lệ |
| IN-10 | Cơ cấu tỷ lệ hủy theo thành phố | REDIRECT Compare; không share/donut cho rate |
| IN-11 | Trend tuần trong riêng ngày 15/09/2026 | CLARIFY range; mở rộng kỳ hoặc snapshot, không daily một kỳ rồi gọi trend |
| IN-12 | Doanh thu tháng 9 tăng trưởng tốt không | Tính biến động nếu đủ kỳ; thiếu benchmark phải nói rõ |
| IN-13 | Vì sao doanh thu giảm | Kiểm baseline và thay đổi thật, không mặc định đã giảm |
| IN-14 | Forecast từng branch trong 24 tháng | UNSUPPORTED; đủ cả grouping và horizon blockers |
| IN-15 | Forecast total revenue 3 tháng, accuracy ≥95% | READY nếu đủ điều kiện; không guarantee; backtest thật |
| IN-16 | Forecast có filter branch | Chặn theo policy hiện tại, không gợi ý branch forecast như cách sửa |
| IN-17 | Risk chỉ revenue/orders/AOV | REDIRECT Overview/Trend trước SQL |
| IN-18 | Risk chọn một signal | Chỉ thực thi signal đó; Scan 0 provider |
| IN-19 | Risk rating có 4 reviews | Insufficient sample theo policy, không red chắc chắn |
| IN-20 | Revenue cao có làm cancellation thấp đi | Association nếu pair hợp lệ, không kết luận nhân quả |
| IN-21 | Tương quan revenue với loại thành phố | CLARIFY city hay store_type; category → grouped comparison |
| IN-22 | Pair duplicate/missing key/NaN/variance 0/n<3 | Runtime limitation rõ, không Pearson giả |
| IN-23 | Current day/week/month hoặc clipped periods | Partial rõ; không false decline/growth |
| IN-24 | Một nguồn stale, nguồn khác mới | Coverage từng nguồn, không latest-source masking |
| IN-25 | Snapshot inventory trong tháng 9 | Hiện trạng, time applicability đúng |
| IN-26 | Narrow scalar/Top N, default Deep từ UI | Trả lời đủ, không padding chart |
| IN-27 | Broad overview/compare/driver/Risk | Coverage hữu ích, thiếu role có reason |
| IN-28 | API legacy/module/refine/cache/approval tampering | Không bypass gate/reuse sai identity |
| IN-29 | Edit/reset khi response chậm | Không hồi sinh plan/report cũ |
| IN-30 | Mất kết nối rồi resume | Cùng job/key, không interpretation mới |
| IN-31 | Mutation số/gap/share/r/threshold/evidence | Verification phát hiện |
| IN-32 | Save → reopen → DOCX | Giữ conclusion/caveats/evidence/verification |
| IN-33 | 503 → successful recovery | Kết quả hợp lệ cùng submission, không nested transport error |
| IN-34 | Malformed/conflicting aliases/client READY | Validation rõ; không provider/SQL hoặc bypass |
| IN-35 | Unsupported filter ở vế sau, metric hợp lệ vế trước | Không bỏ filter chỉ vì metric đã được nhận ra |
| IN-36 | Empty/no-data hoặc source runtime failure | Phân biệt no_data, execution_error và pending; không fabricated success |

Runtime thiếu dữ liệu phải chỉ rõ requirement không đáp ứng. Không dùng success đầy đủ khi phần trả lời chính chưa có bằng chứng. Giữ các ca happy path V3.2 và legacy contracts tương thích trong regression.

## 5. Release gates, bằng chứng và kết thúc goal

### 5.1. Live acceptance có hard ceiling

Chỉ chạy sau offline/browser gates phù hợp. Live sử dụng credentials đã cấu hình trong môi trường Data Platform, không đọc secret hoặc lấy từ chatbot.

- Meter atomic reserve trước mọi physical HTTP; tính cả failed attempts, recovery và repair. Không dự toán bằng logical count rồi cộng sau mỗi case.
- Ceiling thông thường **60 HTTP**; diagnostic extension tổng tối đa **80**. Trên 80 cần approval riêng.
- Định nghĩa trước ít nhất **20 câu semantic hợp lệ/near-scope**, expected outcomes và denominator. Useful first-click outcome **≥95%**.
- Câu đủ thông tin nhưng bị clarify/unsupported sai không tính useful success. Không loại failures khỏi denominator sau khi chạy.
- Known deterministic decisions, numeric/scope guards và fault-injection invariants đạt **100%**; không có false causal claim hoặc secret leak.
- Semantic HTTP median ≤1; mọi submission ≤3. Report/guided/threshold paths đúng loại có 0 provider.
- Ghi planning/job p95, tách cold/warm/recovery; mục tiêu tương ứng ≤40/70 giây.
- Có journey injected transport failure rồi secondary thật thành công nếu credential tương thích đã cấu hình. Không cố làm provider thật hết quota để tạo lỗi.
- Không tiêu hết quota cho đủ số, không xóa failed run hoặc chỉ ghi lần đẹp. Diagnostic rerun có lý do và giữ lịch sử trước/sau.
- Thiếu credential/môi trường: hoàn tất phần độc lập, ghi gate NOT_RUN/BLOCKED với điều kiện mở khóa; goal chưa fully complete. Không tuyên bố live fallback verified từ mock-only tests.

Phân bổ tham chiếu trong trần 60: 28 HTTP cho 14 semantic happy paths, 4 cho ambiguity cases, 6 cho 3 driver/association/expectation cases, 6 cho 2 recovery journeys và tối đa 16 diagnostic reserve. Known deterministic/guided matrix thêm vào với 0 HTTP. Phân bổ là giới hạn, không phải quota phải dùng hết; tổng meter luôn là thẩm quyền cuối.

### 5.2. Artifacts bàn giao

Cập nhật progress hiện có, phân biệt rõ status cũ và status sau independent review. Lưu bằng chứng dưới `data-platform/evaluation/v33/`; không ghi đè/mất historical failures để tạo summary đẹp.

Mỗi run/case cần:

- HEAD SHA **và digest working-tree diff**, vì code chưa commit; digest của các source/test/catalog untracked liên quan phải nằm trong manifest phiên chạy.
- Policy/catalog fingerprints, môi trường và thời điểm kiểm tra; không secret.
- Case ID, expected/actual decision, metric/population/grain/time/scope, requirement coverage và terminal state.
- Logical/physical/repair/recovery counters, credential slot label nếu cần, stage/total latency.
- Kết quả numeric/oracle checks, failure/not-run reason và diagnostic reruns.
- Browser traces/screenshots và manual results; ghi rõ mock, API fixture, database thật hay provider thật.
- Save/reopen/export results và hướng rollback bằng artifact/version trước đó; không reset working tree hoặc xóa volumes/history.

### 5.3. Definition of Done — tất cả phải đạt

- [ ] Một capability contract được production paths dùng xuyên suốt, không còn bypass.
- [ ] Bảy modes hoạt động; legacy reports/modules còn đọc và rerun được khi tương thích.
- [ ] Known terminal decisions bị chặn sớm với 0 provider/0 analytical SQL; client không thể override.
- [ ] Provider recovery có một owner, durable ledger, ≤3 physical HTTP/submission.
- [ ] Temporal, additivity, forecast, Risk, association và driver đúng ngữ nghĩa, đã nối A–Z.
- [ ] Không còn static chart disagreement sau compiled READY hoặc success che mất yêu cầu chính.
- [ ] Narrow không padding; broad có requirement coverage và lý do thiếu rõ.
- [ ] Kết luận đủ bốn phần, trả lời đủ yêu cầu và tồn tại qua save/reopen/export.
- [ ] Derived-statistic verifier phát hiện mutation; `not_measured` không hiển thị như pass.
- [ ] One-click, redirect, reset, refinement, history, reconciliation và reconnect vượt browser regressions.
- [ ] Full backend, frontend, typecheck, build, offline eval và browser tests pass; lỗi cũ được xử lý minh bạch.
- [ ] Preflight benchmark và live latency/call counters có evidence.
- [ ] Live gates đạt trong budget; manual UI acceptance được chạy thật trên bundle phục vụ đúng version.
- [ ] Artifacts/progress phản ánh thực tế; không có phase DONE dựa trên helper chưa nối hoặc test chưa chạy.
- [ ] Không có thay đổi ngoài scope, secret, commit/push hoặc hành động phá hủy dữ liệu.

**Chỉ đánh dấu goal COMPLETE khi toàn bộ checklist đạt.** Báo cáo cuối gồm kết quả, kiểm tra thực chạy, số HTTP thật, giới hạn còn lại, phạm vi diff và kịch bản UI để chủ dự án kiểm lại. Nếu còn blocker ngoài khả năng xử lý, nêu điều kiện mở khóa và phần chưa đạt; không gọi là đã hoàn tất.

## 6. Lời giao việc có thể gửi nguyên văn cho Claude

> Đọc `data-platform/AI_V33_COMPLETION_PLAN.md` làm PLAN thực thi chính, tham chiếu PLAN gốc và progress được liên kết trong file. Tôi giao bạn triển khai hoàn chỉnh cả 9 phase từ working tree hiện tại, giữ các thay đổi đúng đã có. Thiết lập goal theo Definition of Done; làm tiếp A–Z, tự sửa regression trong phạm vi, cập nhật progress và chạy đủ API/browser/offline/live gates trong budget đã chốt. Không dừng sau skeleton hoặc sau vài test xanh. Chỉ báo hoàn tất khi có đủ bằng chứng nghiệm thu; blocker thật phải nêu cụ thể. Không sửa chatbot/Kubernetes/schema/ingestion, không đọc secret, không commit hoặc push.
