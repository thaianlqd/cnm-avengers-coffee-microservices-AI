# V3.3 — Independent review sau vòng triển khai completion

Ngày review: **17/10/2026, Asia/Ho_Chi_Minh**. Người review: Codex. Phạm vi: code mới của Data Platform, build đang phục vụ, offline tests và probes độc lập. **Không sửa code sản phẩm, không commit/push, không gọi provider thật.**

**Kết luận: đã có triển khai và rebuild thật, nhưng chưa đủ điều kiện đóng goal.** Bộ regression hiện có chạy xanh; các probe ngoài bộ đó vẫn tái hiện được sai phạm vi, bypass gate, sai diễn giải và sai tổng dự báo. Không nên hiểu các checkbox offline DONE trong progress là bằng chứng toàn bộ invariants đã đạt.

**PLAN làm tiếp chính:** [AI_V33_REVIEW_FOLLOWUP_PLAN.md](AI_V33_REVIEW_FOLLOWUP_PLAN.md). [Completion PLAN trước](AI_V33_COMPLETION_PLAN.md) giữ làm lịch sử/đặc tả nền; không triển khai lại các phần đã đúng.

**Bổ sung sau phản hồi “doanh thu miền Nam” ngày 17/10:** đã kiểm thêm scope grounding và câu trả lời tổng hợp, ghi R11–R13 bên dưới. Ảnh cho thấy một lần AI đã chọn sáu tỉnh/thành; không phải bằng chứng có mapping miền được quản trị. Không chạy lại full suite hoặc gọi AI thật cho phần bổ sung; chỉ preflight thật và scripted/fixture probes. PLAN giữ cùng tên file, thêm WP1A/WP5A và ma trận G/Q.

Quy ước đường dẫn: A/ = `analytics-api/`, W/ = `web-ui/`, tương đối từ thư mục chứa tài liệu này. Số dòng là tại working tree được review, có thể dịch chuyển sau khi Claude sửa.

## 1. Đã thay đổi và build thật chưa?

- Branch: `branch_thaian`; HEAD vẫn **`ee8a00b1c584dbacb25f54755c98205efe1f5e8a`**, thay đổi mới chưa commit.
- Khi bắt đầu review: **66 tracked files changed, +3016/−381**, cộng các file untracked; snapshot ghi digest của **94** file modified/untracked. Không dùng số diff để suy ra chất lượng, nhưng có đủ bằng chứng đây không phải vòng chỉ sửa tài liệu.
- Các hạng mục mới có production wiring: provider physical ledger qua job observer, governed pair revenue/cancellation, driver bốn aggregates, conclusion artifact, persistence fields, async tickets trong AnalyticsView và view coverage.
- Container web được tạo lúc `2026-10-16T18:49:38Z`, tức **01:49:38 ngày 17/10** giờ Việt Nam. Việc create image/container tự nó không chứng minh feature đúng.
- Đọc trực tiếp `localhost:8501`: JS `/assets/index-BtVVwX6D.js`, SHA-256 **`d0606955ede3b734edfa58934ccf116cbdfbf4af92108d130756951c35b67f9b`**, 518739 bytes, **khớp build local tại thời điểm đối chiếu**. Có `data-conclusion`, `data-trust-dimensions`, `Xem kế hoạch`, `Kết nối lại tác vụ`.
- CSS phục vụ cũng khớp local dist. Hash bốn file backend/catalog (`agent_pipeline`, `preflight_service`, `provider_budget`, `semantic_catalog`) trong container API khớp workspace.

Vì vậy các lỗi dưới đây hiện diện trong code/build đang kiểm, không thể quy hết cho browser cache. Giao diện tổng thể nhìn giống cũ là có thể hiểu được: phần lớn thay đổi thuộc logic backend, contract, kiểm chứng và lifecycle; PLAN trước không yêu cầu redesign toàn bộ UI.

## 2. Kiểm chứng độc lập đã chạy

| Kiểm tra | Kết quả mới trong phiên review này |
|---|---|
| Canonical backend runner, offline | **1017 tests, OK**, 501.220 giây |
| Frontend node tests | **161/161 pass** |
| TypeScript/build | **PASS/PASS**; build local, không rebuild/restart container |
| Offline evaluator | 146 ca cũ: domain 113/113, metric 113/113, compile 108/108, preflight 17/17, unsupported 5/5, forecast rejection 6/6; V3.3 **33/33** |
| Playwright hiện có | **12/12 pass**, 20.7 giây; Vite app với API mock/deferred |
| Preflight benchmark | 33 cases × 12 = 396 requests; cold catalog 163.2 ms, first request 84.2 ms; warm p50 11.97 ms, **p95 15.89 ms**, max 20.62 ms |
| Served API | Preflight thật; một Risk scan thật qua executor read-only, 0 provider |
| Probes ngoài suite | Phát hiện các lỗi R01–R10 dưới đây |
| Live provider/fallback | **NOT_RUN trong phiên review**, 0 physical provider HTTP |
| `git diff --check` | Exit 2, diagnostics tại `W/package-lock.json` (trailing whitespace/CRLF); không phải nguyên nhân lỗi nghiệp vụ |

Backend unit probes dùng ScriptedProvider/FixtureWarehouse, chặn external HTTP/DB; transport probes dùng HTTP mocks/fake clock, không credential thật. `provider_calls=1/3` trong probe nghĩa là lượt scripted interpretation, **không phải provider HTTP thật**.

Logs/probes của phiên nằm tại `/tmp/v33-independent-review/`; script tái hiện ở `/tmp/v33_independent_probe.py` và `/tmp/v33_more_probes.py`. Đây là files tạm; các input/assertion cốt lõi được ghi đầy đủ bên dưới và trong PLAN để tạo regression lâu dài.

Không coi 12 Playwright mocked journeys là đã nghiệm thu browser với backend thật hay live provider. Công cụ đọc UI native không cung cấp được một journey Data Platform hữu ích trong phiên này; kết luận về runtime dựa trên served assets, API và code/probes, không gán MANUAL_UI=PASS.

## 3. Findings theo mức ảnh hưởng

### R01 — P1: Gate server vẫn bỏ lọt privacy/unsupported; chưa có một canonical decision được thực thi đầy đủ

**Nguồn:** `A/services/agent_pipeline.py:117,151`; `preflight_service.py:109,126,477`; `semantic_preflight_contract.py:237,244`; `analytical_resolver.py:300`.

`guided_context` chỉ chặn một tập code trong `REDIRECT_CODES`; `privacy_blocked` và `unsupported_only` không nằm trong tập đó. Resolver gọi evaluator nhưng ở điểm chặn chỉ lấy constraint có code `non_additive_total`; việc có caller chưa chứng minh toàn bộ decision được thực thi. Preflight vẫn tự phân loại findings bằng policy riêng.

| Probe chạy full `propose`, scripted provider trả revenue aggregate hợp lệ | Preflight | Kết quả thực |
|---|---|---|
| `Lợi nhuận tháng 9 năm 2026` | UNSUPPORTED, `unsupported_only` | Provider 1 lượt, `proposal_ready` |
| `Email khách hàng` | UNSUPPORTED, `privacy_blocked` | Provider 1 lượt, `proposal_ready` |
| `Doanh thu và lợi nhuận tháng 9 năm 2026` | READY, không block | Provider 1 lượt, `proposal_ready` với phần revenue |
| AOV distribution + `contribution_share` gọi evaluator canonical | READY, constraints=[] | Mâu thuẫn với preflight AOV composition → REDIRECT |

Không khẳng định probe đã xuất PII từ DB: executor chưa chạy cho các proposal này. Lỗi đã chứng minh là known terminal đi tới interpreter và có thể lập kế hoạch cho nghĩa khác. Client preflight hỏng/direct caller không được dựa vào UI để bảo vệ.

Contract V3.3 hiện vẫn thiếu stage/status pending/actions/request bindings như PLAN yêu cầu. `_ORDER` còn ưu tiên REDIRECT trước CLARIFY; input thiếu thông tin và mismatch chưa có precedence thống nhất.

### R02 — P1: Guided input bỏ qua semantic/temporal constraints của câu hỏi

**Nguồn:** `A/services/agent_pipeline.py:117`; `mission_contract_service.py:137`; `preflight_service.py:568`.

Nhánh guided chỉ kiểm slots và metric anchors, không chạy cùng gate cho toàn bộ nghĩa câu hỏi.

- Guided ranking revenue/store/Top5, câu `Top 5 chi nhánh có doanh thu cao nhất đang lỗ tháng 9 năm 2026`: **proposal_ready**, query filters **[]**, đã chạy **1 analytical SQL**; sau đó report lỗi `quality_verification`. Đây là lỗi bị phát hiện quá muộn, không phải early rejection đúng thiết kế.
- Guided trend revenue/week, custom `2026-09-15 → 2026-09-15`: **success**, **completion_status=complete**, 1 chart, 0 provider. Kết luận `Kỳ cao nhất: 2026-09-14 với 200 VND`; ngày đó là bucket start, ngoài ngày người dùng chọn. Cùng câu free text bị CLARIFY `trend_range_too_short`.

Phải bảo vệ filter/time/method, không chỉ metric. Không được giải quyết bằng cách cấm mọi guided text; guided hợp lệ phải vẫn 0 provider.

### R03 — P1: Risk mất filter trong câu hỏi khi thời gian được chọn thủ công

**Nguồn:** `A/routers/ai.py:233,260`.

Grounding scope từ question nằm bên trong nhánh `elif payload.question.strip()`, sau các nhánh xử lý time. Khi `time=custom`/preset, nhánh đó không chạy.

Input cùng câu `Rủi ro tại Hà Nội tháng 9 năm 2026`:

- `time=auto`: router chuyển `city in [Hà Nội]` vào engine.
- `time=custom`, `2026-09-01 → 2026-09-30`: router chuyển **scope=None**.

**Tái hiện trên API đang phục vụ:** POST `/api/ai/risk-watch`, selected `delivery_success_low`, custom September, question Hà Nội → response **scope=[]**, delivery success **95.8%**, **585 nhóm**, 0 provider. Đây là số liệu toàn phạm vi, không phải Hà Nội.

UI lại có thể hiển thị filter nhận diện từ preflight, khiến người dùng tin report đã lọc. Phải resolve time/scope độc lập, thống nhất precedence với pipeline chính.

### R04 — P1: Provider policy chưa đạt một repair/đủ recovery window/40 giây trên job

**Nguồn:** `A/services/hybrid_analyst_planner.py:46,821`; `provider_budget.py:83,105`; `agent_provider.py:734`; `analysis_job_service.py:316`.

- `semantic_repair_limit()` mặc định **2**, vẫn chấp nhận env=2. Probe full production planner: **proposal_ready, calls=3, semantic_repair_count=2**. Đây là interpretation + hai semantic repairs, không phải một recovery transport.
- Nhánh secondary dùng `claim_recovery()` nhưng không kiểm minimum recovery window; claim không tự kiểm remaining/provider-total deadline.
- Fake clock còn **5 giây sau local reserve**: primary 503 rồi secondary vẫn gửi HTTP lần 2 và thành công. PLAN yêu cầu không bắt đầu recovery nếu <6 giây.
- `AnalysisJobs.work` vẫn hardcode **`time.monotonic()+28`**, dù constants đã đổi planning=40. Vì vậy claim mọi đường dùng cùng bảng 40/41/70 là chưa đúng.
- Planner vẫn có đường env `DATA_ANALYST_RECOVERY_MODEL` đổi model khi kind=`resolution`. Đây là path tồn tại trong source, chưa chạy live và không được xem như đã loại bỏ model escalation.

Physical ledger qua job observer là tiến bộ có thật; cần giữ, không viết lại từ đầu.

### R05 — P1: Tổng forecast trong kết luận cộng cả kỳ đang diễn ra

**Nguồn:** `A/services/chart_insight_service.py:360,374`; `forecast_service.py:179`.

Engine phân biệt `kind=in_progress` với `kind=future`, horizon chỉ đếm các kỳ tương lai. `_forecast_sentences` cộng mọi point.

Probe bằng thuật toán forecast thật: history Jan–Sep, mỗi tháng 100; reference 16/10; horizon=2 tháng. Engine trả Oct(in_progress)=100, Nov(future)=100, Dec(future)=100. Tổng **hai tháng tới=200**, kết luận ghi **`Dự báo ... 2 tháng tới ... tổng các kỳ dự báo 300 VND`**.

Không đổi thuật toán forecast. Sửa tập kỳ dùng để trả lời, provenance của total và kiểm chứng cùng tập kỳ.

### R06 — P1: Nhận định driver chart diễn giải current revenue thay vì delta đang vẽ

**Nguồn:** `A/services/derived_chart_service.py::driver_charts`; `chart_insight_service.py:67`.

Fixture driver đúng có Aug totals 2200, Sep totals 1600; deltas CN s1=−400, CN s3=−300, CN s2=+100. Driver chart vẽ đúng delta.

Nhưng insight của chart đó lại ghi:

- `Cao nhất: CN s2 với 900 VND (56,2% tổng).`
- `Thấp nhất: CN s3 với 100 VND.`
- `Ba nhóm dẫn đầu chiếm 100% tổng doanh thu của phạm vi.`

Insight dùng raw rows của current artifact, không dùng signed_delta transform. Số có thể khớp row gốc nên verifier vẫn nhận; nhưng mô tả sai đối tượng của chart. Conclusion có driver answer đúng ở đầu rồi trộn thêm peaks của baseline/current không phân biệt vai trò.

Điều tương tự phải được kiểm cho contribution transform và Top N denominator; chưa kết luận mọi transform đều sai nếu chưa tái hiện riêng.

### R07 — P1: Conclusion grounding và UI oracle status vẫn có thể xác nhận sai

**Nguồn:** `A/services/verification_reconciliation_service.py:179`; `chart_insight_service.py:271,394`; `analysis_quality_service.py:325`; `W/src/utils/verificationPresentation.mjs:13,22`.

Ba probe độc lập:

1. Evidence e1 nói revenue=100; conclusion answer/finding bị đổi thành `999 tỷ`, giữ e1 → `verify_conclusion` **3/3 pass, dangling=[]**. Hàm chỉ kiểm answer nonempty, ref tồn tại và caveats điều kiện forecast.
2. Copy một full driver report, sửa conclusion answer/finding thành số bịa → `assess_report` trước/sau **giống hệt**. Legacy `conclusions[]` được kiểm nhưng artifact mới `conclusion` chưa được canonical quality replay kiểm đủ.
3. Đổi fact text thành `999 tỷ USD` và unit=USD nhưng giữ numeric value đúng → numeric insight verifier **2/2 matched**, unsupported=[]. Kiểm con số riêng không chứng minh text/unit đúng.

Thêm lỗi UI: `mergeReconciliation({status:verified}, oracle numeric=mismatch)` cho **status=verified** với **0/1 numeric matches, accuracy_pct=0**. Header vẫn có thể báo `Các kiểm tra đều đạt` dù bảng chỉ ra lệch.

Các typed gap/change/Pearson numeric mutation tests mới là cải tiến thật; phải mở rộng chúng sang rendered statements, conclusion, transforms và trạng thái sau oracle.

### R08 — P2: View coverage có false-positive; chart floor chưa thực sự được thay

**Nguồn:** `A/services/view_requirement_service.py:10`; `analysis_quality_service.py:422`; `analysis_expansion_service.py:63`.

Probe requirement grouped revenue/store, artifact q có rows, chart q là line và metric AOV → **view status=satisfied**. `_implements` chủ yếu kiểm giao operation refs; grouped condition `... or kind == grouped` làm mọi chart cùng ref có thể pass, không kiểm metric/dimension/time/transform bindings. Paired coverage cũng chưa chứng minh đủ cả source refs.

Hard minimum_views trong quality vẫn tồn tại; narrow là special case Top N≤5 lấy threshold từ catalog. Chuyển magic number sang metadata chưa đáp ứng yêu cầu coverage cho scalar/narrow khác. Scalar không cần chart có thể pass view coverage nhưng vẫn bị lớp chart-floor đánh thiếu.

Đây là claim contract chưa đạt; không nên gọi “đã bỏ floor” chỉ vì một Top5 case tốt hơn.

### R09 — P2: Risk UI còn false-green, sai hướng điều tra và thông điệp mâu thuẫn

**Nguồn:** `W/src/utils/workspacePresentation.mjs:223,230`; `components/workspace/RiskSignalTable.tsx:15`; `components/workspace/AnalystWorkspace.tsx:96`; `A/services/preflight_service.py:435,568`.

- `riskSummary` với toàn `no_data` → **green**, headline `Các tín hiệu đều trong ngưỡng`, total=0.
- Toàn `insufficient_sample` → **green**, total=1.
- `execution_error` được summary trả gray, nhưng JSX map mọi trạng thái không red/yellow thành **emerald**.
- Chọn delivery success operator=`lt`: server không gửi `bad_direction`; follow-up đòi `Top 5 ... cao nhất`, thay vì nhóm thấp cần kiểm tra. Đúng lỗi nhìn thấy trong screenshot.
- Caption `${breached}/${total} tín hiệu có dữ liệu` dùng tử số số tín hiệu vượt ngưỡng, không phải số có dữ liệu; `0/1` gây hiểu nhầm.
- Guided Risk đủ cấu hình vẫn có thể đồng thời hiện `không cần AI diễn giải` và finding `AI sẽ diễn giải ... tối đa một lượt`. Đây là lỗi nội dung/trạng thái, không phải browser chưa rebuild.

Giữ aggregate healthy và local group breach thành hai thông tin riêng; không cần đổi ngưỡng hay làm aggregate red giả.

### R10 — P1 cho release gate: Live runner chưa đủ khả năng chứng minh nghiệm thu

**Nguồn:** `A/evals/live_acceptance_v33.py:45,86,104`; `evals/live_cases_v33.json`; `tests/test_final_hardening_v33.py:29,60`; `W/tests/e2e/helpers.ts:41`.

- `classify(useful)` nhận bất kỳ `proposal_ready` là pass, chưa kiểm meaning/coverage/report. `--execute` là optional nên default không đạt report-level first-click acceptance.
- `{status:success, verification:attention, completion_status:partial, conclusion:sai metric}` vẫn pass classifier.
- Câu disclaimer đúng `Không bảo đảm độ chính xác 95%.` lại fail vì chỉ tìm substring `95%`.
- 22 cases nhưng useful denominator chỉ **18**, còn 4 ambiguity cases; chưa có ≥20 semantic hợp lệ/near-scope theo PLAN. Hết budget thì skipped bị loại khỏi `done`/useful denominator, có thể làm tăng tỷ lệ giả.
- `inject_transport_failure` được ghi cho L22 nhưng runner không đọc/thực thi field đó. Không có recovery live journey theo đặc tả.
- Main không có release gate exit failure cho không đạt target/NOT_RUN; counters/latency chưa tách đủ stages, semantic median lẫn các path 0 call.
- “Cross-entry” test chính vẫn gọi `guided_context` trực tiếp với provider/executor mocks không được phương thức đó dùng. Nó không chứng minh API/job/module paths được chặn đầy đủ.
- 12 Playwright journeys là real browser nhưng **toàn bộ `/api/**` bị mock**, preflight mặc định READY và report giả; đây là lifecycle regression tốt nhưng không bắt được scope/gate/numeric bugs vừa tái hiện.

**Không chạy live để lấy số đẹp trước khi sửa scorer/meter acceptance.** Hard HTTP meter mới là phần tốt cần giữ. Live NOT_RUN vẫn là thiếu bằng chứng, không phải nguyên nhân duy nhất khiến goal chưa đạt.

### R11 — P1: “Miền Nam” chưa được catalog quản trị; server nhận cả bỏ scope hoặc chọn sai vùng

**Nguồn:** `A/metadata/semantic_catalog.json::analysis_registry.dimensions.city`; `services/request_anchors.py::request_anchors/population_filters/verify_anchors`; `services/semantic_candidate_service.py::candidate_packet`; `services/analytical_query_service.py` phần filter validation; `W/src/utils/missionWorkspace.mjs::detectedScope`.

Catalog có 16 giá trị tỉnh/thành trong dimension `city`, aliases cho từng giá trị; **không có city.value_groups miền**, không có dimension `region` được công bố. Cơ chế value_groups đã tồn tại cho `store_type`/kiosk; có thể mở rộng có quản trị, không cần schema/ingestion mới. Test `test_region_and_customer_cohorts_are_not_invented` cố ý giữ raw region unavailable vì bằng chứng lịch sử khu_vuc_id quá thiếu; không được coi raw region fact là hoàn chỉnh hoặc sửa test đơn thuần cho xanh.

**Preflight thật đang phục vụ**, với custom September và Overview:

| Input | Decision | Filters |
|---|---|---|
| Doanh thu miền Nam | READY | [] |
| Doanh thu chi nhánh các chi nhánh miền nam | READY | [] |
| Doanh thu miền Bắc | READY | [] |
| Doanh thu miền Nam trừ Hồ Chí Minh | READY | [] |
| Doanh thu Quảng Nam | READY | [] |
| Doanh thu chi nhánh mới mở | READY | [] |

READY_FOR_AI tự nó được phép khi còn nghĩa cần diễn giải. Lỗi ở đây là không có **unresolved scope obligation**, UI nói “toàn hệ thống/chưa nêu phạm vi” dù đã có phạm vi bằng lời, rồi compiled plan không chứng minh đã xử lý phần đó.

**Full production propose + scripted interpretation**, cùng chính xác câu trong ảnh `Doanh thu chi nhánh các chi nhánh miền nam`, metric store_revenue/group store, September:

| Model output | Kết quả server |
|---|---|
| Không city filter | proposal_ready, 1 scripted call |
| Sáu giá trị Hồ Chí Minh/Cần Thơ/Bình Dương/Đồng Nai/Bà Rịa - Vũng Tàu/Kiên Giang | proposal_ready, 1 scripted call |
| Chỉ Hà Nội | proposal_ready, 1 scripted call |
| Hồ Chí Minh + Đà Nẵng | proposal_ready, 1 scripted call |

Đây không phải đo accuracy live của model; nó chứng minh **server không phân biệt được đúng/sai ở scope này**. Filter values hợp lệ trong enum chỉ chứng minh “giá trị tồn tại”, chưa chứng minh chúng tương đương “miền Nam”.

Phải có metadata scope sets/version/provenance, rule expansion và exact-set verification; không sửa prompt thành câu có sẵn sáu tên hoặc dạy model tự nhớ địa lý. Các tên hiện có là taxonomy của kho; không tự đổi sang ranh giới hành chính hiện hành.

### R12 — P1: Phạm vi được nhắc nhưng chưa biết bị mất; scope guards còn cho thêm/mở rộng filter

**Nguồn:** `request_anchors.py::verify_anchors` vòng `explicit_value_missing`; `analytical_query_service.py` kiểm membership; `preflight_service.py` projection filters; candidate/intent contract.

Guard literal hiện chủ yếu bảo vệ giá trị **được nhắc có xuất hiện đâu đó**, không chứng minh exact allowed scope của từng requirement và nguồn gốc mọi filter. Scope nhóm không có trong catalog không tạo anchor; phrases `miền Nam`, `mới mở`, hoặc địa danh ngoài enum không có unresolved binding đủ để ngăn model bỏ qua.

Phải phân biệt: no scope thật, known resolved scope, unknown/unresolved scope, explicit all-scope, và scope user override. Khác biệt này phải giữ qua input → intent → query → supporting views → report/save/refine, với clause binding riêng cho compare/Top N từng miền. Không áp một bộ lọc toàn câu vào mọi vế so sánh.

“Miền Nam và Hà Nội”, “miền Nam trừ HCM”, “so sánh Bắc/Nam”, “kiosk trong miền Nam” cần union/difference/cohorts/intersection đúng nghĩa; không được dùng cách gom tất cả literal thành list phẳng rồi coi đã covered.

Full propose probes bổ sung, mỗi ca 1 scripted interpretation, đều **proposal_ready**:

- Hỏi `Doanh thu Hồ Chí Minh tháng 9 năm 2026`, model thêm city IN **[Hồ Chí Minh, Hà Nội]** → scope bị mở rộng nhưng vẫn pass.
- Hỏi `Doanh thu miền Nam và Hà Nội tháng 9 năm 2026`, model chỉ giữ **[Hà Nội]** → mất miền Nam nhưng vẫn pass.
- Hỏi `Doanh thu theo chi nhánh tháng 9 năm 2026`, model tự thêm **[Hà Nội]** → scope bị thu hẹp không có nguồn nhưng vẫn pass.

Các ca này phải thành regressions; không nhầm việc enum validation pass với semantic scope pass. Probes ghi tại `/tmp/v33_geo_probe.py`, `/tmp/v33_scope_widen_probe.py`, kết quả địa lý tại `/tmp/v33-geo-probes.json`; tất cả dùng fixtures và không provider HTTP thật.

### R13 — P2: Trả lời doanh thu đang ưu tiên cực trị/gap; thiếu total và câu trả lời đúng cấp độ

**Nguồn:** `services/chart_insight_service.py::short_answer/build_conclusion`; `services/insight_service.py::analytical_features`; dashboard KPI/requirement coverage; UI `AnalystDashboardSummary`.

Ảnh report có sáu tỉnh/thành và 540 nhóm quan sát; **540 là số nhóm có dữ liệu trả về**, chưa có bằng chứng là toàn bộ chi nhánh miền Nam hoặc toàn bộ địa lý. “Trả lời ngắn/Kết luận” chỉ nói chi nhánh cao nhất ~1,3 triệu; không có tổng doanh thu của miền ở câu trả lời chính.

Fixture full report với `Doanh thu theo chi nhánh`: Quán A=300, Quán B=400. Pipeline trả success, kpi_cards=[], short_answer/conclusion=`Quán B cao hơn Quán A 100 VND (+33,3%)...`; không trả scoped total=700. Data đủ cho breakdown, nhưng answer selection chỉ dựa fact chart đầu/ưu tiên gap. Với câu có yêu cầu ranking/compare thì gap/top có thể đúng; không được dùng cùng mẫu cho mọi dạng yêu cầu revenue/overview.

PLAN cần typed answer requirements theo mục đích (scalar total/breakdown/ranking/compare/trend/forecast), canonical total/denominator evidence và quan hệ giữa nhóm trong data, nhóm được render/paging và tổng population. Không cộng sum Top20 hoặc các ratio/averages để bù total.

Screenshot còn cho thấy “Kết luận” ở đầu và trùng câu trả lời ngắn; source xác nhận section được render trước views. Yêu cầu cũ “KẾT LUẬN PHÂN TÍCH cuối phần phân tích” chưa được thực hiện đúng. Sửa vị trí và nội dung trong cùng artifact/UI/export flow, không chỉ đổi heading.

## 4. Gaps còn cần nghiệm thu, không gán thành bug đã tái hiện đầy đủ

- Source freshness/completeness chưa thống nhất: `data_coverage_service.py:65,78` vẫn dùng max-date tổng của nguồn mới nhất; không có completeness proof cho từng requirement. MIN/MAX chỉ là observed bounds. Cần probe sparse/stale multi-source vào KPI/chart/driver/forecast, không chỉ test current bucket clipping.
- Typed CapabilityDecision và UI action contract chưa đầy đủ stage/pending/request binding; chưa có một policy canonical được mọi tầng thực thi hoàn chỉnh.
- Trust dimensions backend vẫn là ba nhóm legacy + independent reference, không đúng năm chiều đã chốt structural/numeric/semantic/forecast/provider. UI helper comment “five-way” không làm wire payload thành năm chiều.
- Không xác nhận live provider semantics/fallback hoặc toàn bộ manual UI từ screenshot/bundle markers. Các phần này cần nghiệm thu ở vòng tiếp theo sau khi sửa scorer.
- Không audit schema migration `026_analysis_modules.sql` hoặc Kubernetes worktree vì không thuộc vòng code thay đổi này; không chỉnh các phần đó.

## 5. Đối chiếu tiến độ và khuyến nghị

Giữ những cải tiến đã chứng minh: full offline suite xanh, retrieval regressions đã xử lý, transport resend success, physical reservation trên job, governed pair/driver wiring, save fields, async tickets và mocked browser regressions.

Mở lại các mục DONE tương ứng **Phase 1/2/4/5/6/7/9**. Phase 3 và phần lifecycle của Phase 8 đã tiến bộ; tiếp tục bổ sung integration coverage/Risk semantics mà không refactor lại vô cớ.

Ưu tiên vòng sửa: **R01/R02/R11/R12/R03 → R04 → R05/R06/R07/R13 → R08/R09 → R10 + temporal/acceptance gaps**. Chi tiết triển khai, interfaces, tests và điểm kết thúc nằm trong [PLAN tiếp nối](AI_V33_REVIEW_FOLLOWUP_PLAN.md).

Full suite xanh là bằng chứng regression hiện có không fail; không chứng minh những hành vi chưa có assertion. Sau review này chưa có bằng chứng hợp lệ để ghi “chỉ còn live và manual UI”.
