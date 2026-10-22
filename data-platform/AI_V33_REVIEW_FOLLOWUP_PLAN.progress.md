# V3.3 Follow-up — triển khai theo PLAN review

Goal: hoàn tất `AI_V33_REVIEW_FOLLOWUP_PLAN.md` (WP0–WP9, WP1A/WP5A), không commit/push, không ngoài Data Platform/schema/ingestion/K8s/chatbot, không đọc secret.
HEAD nền: ee8a00b1c584dbacb25f54755c98205efe1f5e8a; giữ 66 tracked changes và các files untracked của Claude. Baseline review: backend1017, web161/typecheck/build, eval146+33, mocked E2E12 pass. Live chưa chạy.

## Trạng thái hiện tại — nghiệm thu cuối ngày 18/10/2026

**COMPLETE theo release gates của PLAN; không có nghĩa mọi câu hỏi đều thành công.** Live cuối đạt24/25 useful (96%≥95%); L03 vẫn là failed case và được giữ nguyên. Bằng chứng: [run cuối](evaluation/v33/followup-20261018/README.md), [commands](evaluation/v33/followup-20261018/commands.json), [manifest](evaluation/v33/followup-20261018/manifest.json).

- WP0: DONE — giữ baseline, probes và mọi failed/diagnostic runs; không hoàn tác thay đổi của Claude/người dùng.
- WP1/WP1A: DONE — canonical gate + typed constraints/actions/scope/version; exact set/cohort validation qua public paths. Tests gate/geography và live L23–L29 PASS; unknown scope không fallback all-system.
- WP2: DONE — Risk custom/auto time giữ inline scope, selected signals và applied context; regression, DB smoke và served Hà Nội Scan0AI PASS.
- WP3: DONE — ≤1 repair/≤1 recovery/≤3 HTTP với deadline/window + durable reservation. Fault regressions PASS; L22 injected503→secondary thật PASS, counters29 jobs khớp meter. User đã duyệt trần TỔNG160; ledger151=146 external attempts+5 simulated faults.
- WP4/WP5/WP5A: DONE — temporal/forecast future-only, independent driver totals, pair đầy đủ với preview bounded, full scoped totals/direct answers và requirement coverage; regressions/eval/real-job live PASS trong ngưỡng. Guided served forecast2 future points0AI PASS.
- WP6/WP7: DONE — canonical conclusion replay/mutation, unit/scope, persistence/export, oracle mismatch và Risk tone/direction. Served independent oracle2/2 matched,0AI; not_measured vẫn riêng với passed.
- WP8: DONE — scorer frozen, API boundary tests, Chromium12 mocked +4 real fixture journeys PASS; served UI12 journeys với API thật/DB read-only PASS, không mock response.
- WP9: DONE — final full1063 backend/165 web/typecheck/build/146+33 eval/12 mocked browser PASS; final fixture-browser16/16 PASS. Web đã build và API restart cùng container; cả hai healthy, ledger không mất. Artifacts và ma trận finding→path→tests ở run cuối.

## Bàn giao

Không cần tự build: mở `http://localhost:8501`. Giới hạn còn lại: L03 HCM–Hà Nội bị false block khi provider sửa field ngoài target; không sinh báo cáo sai, không tính useful. Taxonomy là phân vùng báo cáo nội bộ trên địa danh có trong kho; không khẳng định bao phủ toàn bộ địa lý hành chính. Completeness thiếu chứng nhận vẫn unknown. Không commit/push; không thay schema/K8s/chatbot/ingestion.

## Checkpoint triển khai 1
- Regression trước-sửa: gate/geography 5 tests FAIL; forecast/unit thêm 2 FAIL; UI Risk/oracle 3 FAIL (logs /tmp/v33-followup).
- WP1/WP1A IN_PROGRESS: canonical input verdict enforced cả guided/legacy prompt; scope sets metadata v1 + derived reporting_region; exact city membership guard, UI scope labels. Còn matrix phức hợp/negative/unknown và cross-entry.
- WP2/WP3 IN_PROGRESS: Risk scope resolve độc lập custom time; max1 semantic repair, bỏ model hop, secondary phải đủ recovery window, job planning40s. Core54 tests PASS trước nhóm report tiếp theo.
- WP4/WP5/WP5A/WP6 IN_PROGRESS: forecast chỉ future; driver insight signed deltas; full-artifact total evidence/direct answer bindings; conclusion replay quality và render cuối UI/DOCX; view metric/dimension/all pair refs guards. Nhóm55 chỉ còn2 fixture no-plan errors đang sửa.
- WP7 IN_PROGRESS: Risk no_data/insufficient gray, below followup + scope/time, oracle mismatch attention; 3 frontend regressions PASS.
- Chưa chạy full suite/build/real browser/live. Live0 HTTP. Không commit/push; tests offline network/DB external bị chặn.

## Checkpoint triển khai 2
- Core integration57 đã chỉ còn1 expectation prose compare cũ, đã đổi sang canonical gap; suite70 còn1 legacy error category forecast đã sửa. Chưa tính pass khi chưa chạy lại.
- Scope: region CASE compiler + SQL safety pure CASE/IF; reporting_region filter aliases bị loại để không sinh cả city và derived filter; literal comparison hỗ trợ city-grouped và support kế thừa union. New integration thực thi miền Nam và theo miền đã qua pipeline.
- Required views kiểm metric union trên các charts cùng role, đủ dims/artifact refs, pair/driver đủ mọi nguồn. Hard chart floor production/catalog=0; Deep giữ ngân sách views hữu ích; legacy floor tests chuyển sang coverage oracle.
- Conclusion canonical replay bắt thay text; AOV/ratio/distinct grouped có truy vấn tổng canonical, additive dùng full-artifact total evidence; typed answer requirements persist. Final conclusion cuối UI/DOCX; giữ toàn bộ caveats/answers.
- Typed actions xuyên API/UI; semantic refinement có pre-gate; reconciliation lưu đúng revision và downgrade mismatch; verification có5 chiều riêng, numeric chưa đo thể hiện Chưa đo.
- Frontend164 tests/typecheck/build từng pass trước edits mới. Full offline runner đang chạy session36876, logs /tmp/v33-followup/final và full-summary.log. Không restart analytics-api lúc suite chạy.
- Browser mock12 pass; real API fixture còn lỗi harness nhận diện executor là production. Đã sửa thànhMock(wraps=execute), chờ run /tmp/v33-followup/api-browser5.log. Fixture container v33-followup-fixture, không secrets/DB/network external; script bash .claude/scripts/dp-fixture-http.sh.
- Live cohort frozen29 cases (25 useful,7 geography), scorer không nhận proposal/partial/wrong metric, giữ skipped trong denominator; injection meter phân biệt simulated503 với actualexternalHTTP. Live vẫn0 HTTP, chưa chạy.
- TODO chính: xem full suite failures/triage, browser fixture & save/reopen/DOCX, hoàn tất matrix/caveats/geography cases còn thiếu; benchmark/read-only smoke/served rebuild/live/artifacts. Không đánh dấu DONE hoặc COMPLETE khi còn các gate này.

## Checkpoint triển khai 3
- Full offline lần1 đã phát hiện39 failures+34 errors; không bỏ qua. Triage sửa feature-target additivity (không áp AOV sang phần revenue), canonical comparison/ranking, scalar view cadence, regeneration supporting views sau parent delta và independent provenance replay.
- Nhóm143 sau triage còn2 context assertions+3 refinement/repair errors. Nhóm84 tiếp theo đã hết errors, chỉ còn29 ký tự context vượt soft budget; rút metadata prose lặp, không tăng budget. Full2 đang chạy, logs `/tmp/v33-followup/full2/`, summary `/tmp/v33-followup/full2-summary.log`.
- Browser fixture thật15/15 PASS (12 mocked lifecycle +3 real FastAPI/jobs/report), log `/tmp/v33-followup/api-browser6.log`. Đang thêm HTTP save/reopen/DOCX và cross-entry safety; kết quả browser trước edits không được dùng làm final gate.
- Catalog có quản trị source/version/taxonomy CASE và dimension semantics; preflight scoped miền Nam đúng6. Fixture capability hash đã regenerate từ catalog hiện tại. Live vẫn0 external HTTP.

## Checkpoint triển khai 4 — offline release gates
- Full3:1040/1040 backend PASS (545.6s),165/165 web PASS, typecheck/build PASS,146+33 offline eval PASS,16/16 Chromium PASS; logs `/tmp/v33-followup/full3/`. Sau đó direct module rerun được nối qua canonical propose→approve→generate;55 tests module/legacy/Risk PASS và browser16/16 (gồm module save/rerun+saved report/DOCX) PASS trên source cuối, `/tmp/v33-followup/api-release/`.
- Read-only DB thật: Risk Hà Nội auto/custom Sep có cùng scope, cùng94.62%,0 provider; guided miền Nam tổng197,594,000VND,540 nhóm có dữ liệu. Probe bắt thêm lỗi horizontal aggregate bị gán Ranking/drop khỏi Overview; đã sửa và90 related tests PASS. Không dùng540 nhóm để khẳng định tổng số branch trong miền.
- Warm preflight p95=19.41ms/990 requests; cold catalog154.3ms,first88.4ms riêng. Added lockfile lines được chuẩn hóa whitespace;git diff --check PASS, không format lại toàn lockfile.
- UI đã rebuild/recreate riêng web-ui, API restart sau suite; không đổi DB/schema/ingestion/K8s/chatbot. Served manual browser đang chạy (owner mới, chỉ guided/scan, mọi free-text paid POST bị chặn bởi harness).
- WP0–WP7: production fixes+regressions đã nối; WP8 offline/API/browser PASS. WP9 còn served journeys/live/artifact matrix cuối. Live0 external HTTP; provider và secondary đều configured (boolean check, không đọc secret).

## Checkpoint triển khai 5 — live phát hiện gaps mới, chưa release
- Auto-review chặn live lần đầu vì thiếu destination/payload authorization;0HTTP gửi. User sau đó xác nhận rõ Google Gemini + metadata nghiệp vụ +29 frozen questions +trần60HTTP. Không bypass rejection.
- Live đầu chạy đủ29:35 reservations=34 externalHTTP+1 simulated503. Useful16/25=64%,overall17/29;median1,max2,p95~4.746s. Release FAIL, giữ nguyên artifacts `evaluation/v33/followup-20261017/live-initial.json` và ledger; còn25 reservations trong quyền60. Secondary-injection case dùng2attempts nhưng failover flagfalse vì slot đã ở secondary sau quota cooldown; chưa đóng reliability live gate.
- Lỗi mới: forecast horizon bị time parser gắn legacy forecast_unsupported khiến history current_year không được canonicalize; current-month eligibility bị future window che; buyer alias nhận customer_count; generic ambiguity gọi AI/overgeneration; optional caveat làm partial giả. Đã sửa và tạo `tests/test_v33_live_regressions.py` dùng22 normalized test-owner session captures (không raw response/secrets/user sessions).
- Narrow ambiguity guard đã chỉnh để giữ natural shipper paraphrases. Nhóm59 tests PASS saufix; regression replay cònbuyer frozen target do thiếu repair-only concept group; đã bổ sung group (không execution equivalence), đang chạy `/tmp/v33-followup/live-replay-final2.log`.
- Đang hoàn tất offline fixes trước diagnostic live có pacing (ngoài measured submission), giữ frozen denominator và không dùng rerun-subset làm release pass. Chưa dùng thêm liveHTTP; không nâng trần60 khi chưa được phép.

## Checkpoint triển khai 6 — sửa lỗi live và triage compatibility
- Diagnostic13 cases:11 pass,2 fail (L19 verifier/conclusion sau chart payload pruning; L29 scope repair đổi map implicit→explicit bị coi thay nghĩa). Tổng49 reservations; diagnostic không phải release pass. L22 secondary_used=true với một simulated503 và một response thật từ secondary.
- Đã thêm regression trước-sửa: bounded pair1215 quan sát và implicit/explicit feature target identity. Sửa pair preview≤200 điểm, thống kê/insight vẫn từ toàn bộ cặp; coverage/completion/conclusion được tính lại sau transport bounding. Scope repair giữ frozen targets có cùng nghĩa, vẫn chặn đổi targets thật.
- Full offline mới:1049 tests,6fail+3error; web165/typecheck/build,eval146+33 và mocked browser12 PASS. Triage minh bạch: archived adapter giữ completion legacy; failed refinement vẫn partial; anchors thêm partition_dimensions; incomplete vague input expectation đổi theo policy có chú thích; overview requested axes không được chuyển thành optional ranking; repair thêm feature không được coi thay target retained feature.
- Browser final16/16 PASS, `/tmp/v33-followup/browser-final/e2e.log`; API fixture không credentials/DB/network external. Regression scope-repair end-to-end với frozen time và generic activity10/10 PASS.
- User đã xác nhận nâng trần TỔNG lên80HTTP (không phải thêm80), cùng Google Gemini/business metadata, không customer rows. Không có paid calls mới kể từ49 ở checkpoint này; lượt full mới phải dùng cùng `/tmp/v33-live-http-ledger.json`.

## Checkpoint triển khai 7 — resume 18/10, giữ toàn bộ thất bại
- Phiên trước bị automatic approval review dừng do usage limit; lệnh test cohort-axis cuối KHÔNG được chạy. Máy vừa khởi động lại, `/tmp` host mất logs; các JSON trong filesystem container vẫn còn, ledger111 được bảo toàn. Không suy ra PASS từ log đã mất.
- Live run trần80:20/25=80%,27/29 cases đã chạy (2 skipped); lưu `live-release-at-80.json`. Live run trần120:23/25=92%,29/29 đã chạy,31 reservations (30 external+1 simulated), tổng111; FAIL, lưu `live-at-111.json` +ledger. L22 injected503→secondary thật success. Không cherry-pick diagnostics để đổi92% thành PASS.
- L11/L14/L21 mới đã được sửa: governed rating entity qualifiers, long cosmetic requirement ID được hash cục bộ, model không được khai known metric unavailable; targeted repair sửa requirement gốc.81 tests từng PASS trước patch scope cuối. Benchmark cold init dùng catalog mới thật, không cache-hit0ms. Risk bare mission không bị generic-activity guard chặn.
- Hai lỗi còn ở live: L28 model tách union thành hai scopes rồi không sửa exact filters; L29 cần sửa đồng thời filter và cohort grouping nhưng dimension bị frozen. Đã thêm scope_contract vào interpretation và issue `scope_cohort_axis_mismatch` mở đúng dimension target, vẫn chặn đổi time/metric. Regression mới đang chạy ở `/tmp/v33-followup-resume/cohort/`.
- Trần hiện tại120HTTP TỔNG, còn9. Chưa có paid calls mới sau111. Phải nghiệm thu full cuối +served/browser và cập nhật manifest/matrix; goal chưa COMPLETE.


## Checkpoint triển khai 8 — chốt nghiệm thu 18/10/2026

- Scope repair mở đúng cohort axis và gửi typed scope patches có quản trị; frozen time/metric vẫn được bảo vệ. L28 union/L29 Bắc–Nam trước sửa FAIL được giữ trong geography-before/after-axis JSON, không ghép diagnostic pass thành full pass. Giả thuyết repair payload bị transport bỏ đã bị regression HTTP-boundary bác bỏ; không sửa NativeAgentProvider history vì giả thuyết đó.
- Full suite cuối exit0:1063 backend (544.090s),165 frontend, typecheck/build,146 ca cũ+33 V3.3 và12 mocked Chromium PASS. Targeted patch104 tests và real-fixture Chromium16/16 PASS; typecheck cuối sau wiring TS cũng PASS. Logs tóm tắt đã copy vào run cuối, không phụ thuộc `/tmp` để bàn giao.
- Full live mới qua29 AnalysisJobs thật:24/25 useful=96%,28/29 overall,0 skipped;32 reservations trong run (31 external+1 simulated503), tổng151/160 (146 external+5 simulated). Semantic HTTP median1,max2; planning p95=3073.98ms,job p95=3779.95ms. Counters durable khớp meter; L22 dùng secondary thật thành công. Giữ L03 failed/2HTTP/untargeted_field_changed, không claim100% semantic accuracy.
- Preflight benchmark990 warm requests p95=21.37ms; cold catalog154.4ms và first88.2ms báo riêng. Rebuild riêng web-ui `--no-deps --build`; restart analytics-api cùng container sau khi suite xong, ledger151 được kiểm lại. Served asset `index-BQXk_xMd.js`, SHA256 `94af386bd32277eeafb0613b6e2f57921edde770d368428337fd259914109d48`.
- Served Chromium12 journeys PASS:7 modes, Nam6/difference5/union7, unresolved/mixed/one-day-week guards, Hà Nội Risk Scan, guided Overview/job, oracle2/2 matched và guided forecast2 future points tách current;0 paid HTTP, không API response mocks. Đã xem ảnh scope/forecast; screenshots/result/commands/runtime nằm trong run cuối. Đây là browser automation trên UI thật, không khai là người dùng đã test tay.
- HEAD `ee8a00b1c584dbacb25f54755c98205efe1f5e8a`; tracked working-tree diff SHA256 `e84143c287e9df90dbabd158c5def7858eb0b326347598517ad4783a600af391`. Manifest ghi thêm digests các source/tests/docs untracked, policy/catalog/runtime; tất cả failed runs cũ vẫn còn. Rollback chỉ bằng source/image artifacts đồng bộ đã chọn, không reset/clean hoặc xóa dữ liệu.

## Kịch bản UI để chủ dự án kiểm lại

1. Trợ lý AI → nhập “Doanh thu các chi nhánh miền Nam tháng 9 năm 2026”: thấy6 địa danh, scope source/version; sau phân tích tổng scoped revenue đứng trước cực trị. Sai nếu preflight nói toàn hệ thống hoặc thiếu disclosure taxonomy.
2. Thử “miền Nam trừ HCM”, “miền Nam và Hà Nội”, “Quảng Nam”: lần lượt5,7 địa danh và unresolved/unsupported; không âm thầm chạy toàn hệ thống.
3. Chọn Rủi ro, nhập Hà Nội/tháng9 → Kiểm tra rủi ro: applied context Hà Nội,0AI; aggregate và nhóm vi phạm thể hiện riêng. Sai nếu có nhóm vượt ngưỡng nhưng summary nói không có rủi ro.
4. Dùng cấu hình guided Dự báo doanh thu2 tháng → Phân tích:0AI;2 future points, current point riêng; tổng future không cộng current và KẾT LUẬN PHÂN TÍCH ở cuối phần phân tích.
5. Guided Tổng quan → báo cáo → Kiểm chứng & nguồn → Chạy đối chiếu độc lập:0AI, trạng thái theo kết quả thực; lưu/mở lại/Word giữ conclusion/caveats/evidence. Reset/đổi input khi đang chạy không hồi sinh báo cáo cũ (browser regressions đã kiểm).
