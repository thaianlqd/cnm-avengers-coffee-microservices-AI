# Progress V3.3 (execute-plan)
Quy ước: A/=analytics-api, W/=web-ui. PLAN: phase 1 dòng 340, 2:352, 3:364, 4:376, 5:388, 6:400, 7:412, 8:424, 9:436; DoD:561; ma trận test 448-523.
Ràng buộc: giữ Hybrid, không semantic system song song, không đổi Spark/Gold/forecast algo; không commit; không .env; live ≤60 HTTP (chưa chạy live).
Lệnh: từ repo root `.claude/scripts/dp-test.sh module tests.<m>`; fixture: `docker compose -f docker-compose.data.yml exec -T analytics-api env AI_OFFLINE=1 python -m tools.regenerate_capabilities_fixture`.
Baseline plan: 115/116 backend (lỗi latency preflight – lần chạy hiện tại đã pass, flaky theo tải).

## Phase 1 — IN PROGRESS
- DONE: request_signature thêm analysis_mission + accept_partial_scope (agent_pipeline.py); test A/tests/test_v33_identity.py.
- DONE: metric_capability/additive_across/dimension_logical_type (semantic_preflight_contract.py); catalog thêm additive_over/non_additive_over (stock_quantity, low_stock_count), disjoint_partitions (customer_count); validation mâu thuẫn; fixture capabilities_v31.json sinh lại.
- Test: test_v33_identity, semantic_truth_v30, analysis_contract, contract_v251, workspace_v31 xanh.
- DONE: CapabilityDecision/Constraint/ViewRequirement + evaluate_capability (semantic_preflight_contract.py) + AnalyticalResolver.evaluate_capability; POLICY_VERSION=3.3.0 vào plan_fingerprint (resolver + agent_pipeline check) => session/approval cũ lệch fingerprint phải replan. Test v33_identity 10 OK; v30/v251/workspace_v31/v32_mission xanh.
- CÒN (Phase 1): manifest metric_capabilities + W types/tests (làm cùng Phase 7 UI).
- Phase 2 CHƯA BẮT ĐẦU: cần nối evaluate_capability vào preflight_service/agent_pipeline trước provider (evaluator chưa được gọi ở entry point nào).

## Phase 2 — DONE (phạm vi lõi)
- preflight_service: 4 vi phạm forecast (metric/cadence/horizon/grouped) từ warn → block (giữ fixes), output thêm `capability{decision,policy_version}` (capability_decision); REDIRECT_CODES.
- agent_pipeline.guided_context: gate server vô điều kiện cho mọi free-text/legacy prompt (không cần allow_deterministic_upgrade/natural_input); chỉ REDIRECT_CODES; 4 mã precheck cũ vẫn chỉ khi natural_input+upgrade (gate rộng làm hỏng ~120 test → thu hẹp).
- Test: v33_identity (ServerGateTests), workspace_v31 cập nhật có chủ đích (warn→block). Full backend lần 1 (gate rộng) hỏng; sau thu hẹp: agent_v22/workspace_v31/v32_mission xanh (trừ 2 lỗi baseline). Full chạy lại ở cuối.
- CHƯA: p95 latency benchmark, UI QuestionPreflight hiển thị REDIRECT, cache index theo fingerprint.
## Phase 3 — DONE
- catalog: composition(visible=false,maps_to=overview), relationship(visible=false,maps_to=null); mission_catalog xuất visible/maps_to; validate. W: missionCards lọc visible, visibleMissionId. Fixture sinh lại. Test: v33 SevenModes, workspace.test.mjs cập nhật 8→6 (+free form = 7).

## Phase 4 — PARTIAL
- provider_budget: ProviderBudget.record_physical (đặt chỗ HTTP vật lý trước khi gửi, trần 3, hash payload) nối vào 3 nhánh HTTP của agent_provider; test ledger + "<6s không recovery". CHƯA: owner recovery duy nhất/durable reservation/health sanitize/.env.example (không đổi secret/compose). Lưu ý: test_reliability_v210 2 test (connection reset/long timeout) fail khi chạy module (do env container có secondary key; không phải do thay đổi này — xác minh bằng cách tắt gate/ledger vẫn fail); runner chuẩn cô lập env.
## Phase 5 — PARTIAL (chỉ test bất biến)
- forecast: 1 kỳ/all-zero → forecast_insufficient_history; interval 80% không hứa 95%; risk traffic light — đã có sẵn, thêm test khoá (StatisticalHonestyTests). CHƯA: paired observation/driver delta/new pair capability.
## Phase 6 — CHƯA LÀM (view requirements/relevance/coverage) → bước tiếp theo đề xuất.
## Phase 7 — PARTIAL
- verification_score.trust_dimensions + quality_assessment.trust_dimensions (4 chiều tách riêng, not_measured ≠ passed); VerificationPanel hiển thị. CHƯA: conclusion artifact §20/DOCX.
## Phase 8 — PARTIAL
- Sửa lỗi identity: accept_partial_scope là approval nên KHÔNG nằm trong request_signature (làm hỏng propose→generate; test_verifiable_v27 bắt được) mà nằm trong plan-cache key (analysis_job_service).
- W: CTA mặc định "Phân tích" → handleOneClick, "Xem kế hoạch" → handleProposePlan (onPreview); missionWorkspace.invalidationFor/isCurrentEpoch/resetActive + wiring onChange (đổi nghĩa request → bỏ plan/clarification/report + bump epoch). Test web 155 pass.

## Kết thúc
- Sửa va chạm tên diagnostic: ledger dùng provider_physical_* (provider_http_attempts đã có nghĩa khác; test_v32 failover bắt được).
- dp-test all: backend 938 test, 5 lỗi = 4 baseline + 1 do mình (đã sửa, v32 43 OK); web 155/155, typecheck+build PASS; eval offline 146 ca: 4 ca retrieval fail (ship_12, rev_12, rev_r_02, v31_rev_01) — không liên quan thay đổi (chưa so với baseline trước-thay-đổi).
- Deploy: web-ui đã rebuild; bundle có "Xem kế hoạch" và "data-trust-dimensions".
- Live provider: KHÔNG chạy (0 HTTP).
- Chưa làm: Phase 6 (view requirements), conclusion artifact/DOCX, owner recovery durable, paired/driver capability, e2e browser harness, evaluation/v33 artifacts, benchmark p95.
### Kịch bản thủ công
1. Tab AI Analyst → thanh nhiệm vụ: thấy 7 thẻ (Câu hỏi tự do, Tổng quan, So sánh, Xếp hạng, Xu hướng, Dự báo, Rủi ro). Sai nếu còn "Cơ cấu"/"Tương quan".
2. Gõ "Dự báo doanh thu 12 tháng tới theo từng chi nhánh" → preflight báo chặn (đỏ) kèm gợi ý sửa; nút Phân tích không chạy. Bấm gợi ý "Đổi thành 6 tháng" → hết chặn.
3. Gõ "Doanh thu 7 ngày qua" → bấm "Phân tích" (một lần) → chạy thẳng tới báo cáo, không qua bước duyệt. "Xem kế hoạch" mở bước duyệt cũ.
4. Sau có kế hoạch/báo cáo, đổi khoảng thời gian hoặc phạm vi → kế hoạch/báo cáo cũ biến mất (không duyệt được kế hoạch cũ).
5. Báo cáo → tab Kiểm chứng: có các chip "Độ tin cậy / Đối soát / Trình bày / Đối chứng độc lập"; "Đối chứng độc lập: chưa đo" (không phải xanh).

## Vòng hoàn tất (phiên 3)
- P6: narrow_request (Top ≤5, 1 metric, không explicit depth) → focused, không ép 4 chart; test NarrowDepthTests; dashboard_minimum_views giữ xanh.
- P7: build_conclusion → report.conclusion (answer/findings có evidence_id hợp lệ/caveats/actions); UI data-conclusion; DOCX có mục "Kết luận"; test.
- P5: paired_observations + reconcile_driver_deltas (insight_service) + test (chưa nối READY vì chưa có renderer — đúng PLAN).
- P8: terminal_state: REDIRECT/CLARIFY → job needs_input + result.decision; test workspace.test.mjs wiring CTA.
- P9: evals/semantic_cases_v33.json + tests/test_final_hardening_v33.py (bất biến cross-entry, 0 provider); evaluation/v33/offline_summary.json. LIVE: KHÔNG chạy (bị chặn quyền) → 0 HTTP.
- Kết quả cuối: backend 946 test, đúng 4 lỗi baseline; web 156 pass; eval offline như trên. Web-ui đã rebuild, bundle có data-conclusion/Xem kế hoạch.
- Chưa/không làm: live ≤60 HTTP, durable physical reservation across reconnect, p95 benchmark, browser e2e thật, phần W types Phase 1.

## ===== Checkpoint phiên 4 (17/10) — theo AI_V33_COMPLETION_PLAN.md =====
Goal: hoàn tất DoD §5.3 của AI_V33_COMPLETION_PLAN.md. Các mục DONE ở trên chỉ là "helper/một phần"; mở lại từng phase theo file COMPLETION. Commit bị hệ thống chặn → người dùng tự commit. Live provider bị chặn quyền (real-money) → gate live NOT_RUN/BLOCKED.
Thứ tự làm: P1 evaluator nối production + manifest/types + depth default; P2 gate hợp nhất; P4 owner recovery+ledger bền; P5 temporal/forecast/risk/pair/driver nối pipeline; P6 view requirements; P7 verifier mutation + conclusion; P8 epoch + Playwright; P9 runner exit code + eval v33 + artifacts.
### Phiên 4 — tiến độ (trước sau; chi tiết)
- P1: evaluator gọi trong AnalyticalResolver.resolve_requirement (non_additive_total → lỗi typed); metric `capability` trong workspace manifest + TS types (CapabilityDecision…) + badge additivity ở drawer; job payload dùng exclude_unset (default depth không thành lựa chọn tường minh); UI chỉ gửi depth khi người dùng chọn; JOB_VERSION 3.
- P2: gate server cho mọi prompt (kể cả module); mission_mismatch gate mọi entry; mã mới forecast_scope_unsupported, risk_signal_required, trend_range_too_short; quyết định theo mã (UNSUPPORTED/REDIRECT/CLARIFY) trong preflight_service.CODE_DECISION; cases V33 có expected decision; test_final_hardening_v33 (4 test) kiểm provider/executor spy.
- P4: provider là owner duy nhất của transport recovery (1 lần/submission, cùng payload; failover secondary hoặc resend), planner không retry transport; không model hop ở production; trần 3 physical HTTP; ledger bền trên job (physical_http, recovery_used) qua observer; deadline table PLANNING40/HTTP41/JOB70/PROVIDER30/ATTEMPT12/CONNECT2/RESERVE5/WINDOW6; dp-test.sh: exit code đúng + cô lập secondary key. 4 lỗi backend cũ đã triage: pearson caveat; 3 test native cập nhật theo policy V3.3 + GEMINI_MODELS cố định.
- P5: Risk: signal_ids chọn lọc (id sai → lỗi), execution_error thay no_data; UI headline không xanh khi có lỗi tính toán.
- P5 (tiếp): Pair revenue/cancellation theo store_id A–Z: catalog.governed_pairs + validation; resolver tách 2 aggregate (binding relationship_strength + query_ids/pair_id/key); insight_service.paired_observations (khóa duy nhất, trùng khóa vô hiệu, loại bool/NaN/inf, đếm excluded) + evidence pearson/pair_status; derived_chart_service.pair_charts (scatter 2 nguồn); verifier recompute pair_pearson. Driver (feature driver_delta): 4 aggregate (kỳ này/kỳ trước × nhóm/tổng), đối soát với tổng độc lập, baseline_missing/reconcile_failed → driver_status (không kết luận), biểu đồ signed_delta. rate → điểm phần trăm. Tests: tests/test_v33_pair.py (8 test qua pipeline thật, oracle độc lập).
- P7 (tiếp): verify_insights recompute typed calc (gap/change/threshold/pearson/pair_pearson); bỏ auto-match dấu '-'; mutation tests tests/test_v33_verification.py; conclusion trả lời mọi phần + forecast + caveat đủ + action đọc được + verify_conclusion vào verification (metric conclusion_grounding); trust dims theo oracle.
- P8 (tiếp): tất cả async (propose/generate/refine/job checkpoint/reconcile/risk) có ticket epoch+AbortSignal; backToQuestion/reset/chọn version/mở history hủy request; reset về mặc định đầy đủ; "Kết kkết nối lại" resume cùng key; legacy mission map khi mở (effect + toast). Playwright E2E (9 test pass, kiểm tra đã bắt lỗi thật khi gỡ fix).
- Harness: dp-test.sh exit code đúng + cô lập secondary key.

## ===== Phiên 4 (17/10/2026) — theo AI_V33_COMPLETION_PLAN.md =====
Trạng thái trước phiên: các phase DONE ở trên là helper/một phần. Dưới đây là kết quả sau khi nối vào luồng sản phẩm (không xoá lịch sử cũ).
| Phase | Nối vào production | Bằng chứng |
|---|---|---|
| 1 Contract/identity | evaluator canonical gọi trong `AnalyticalResolver.resolve_requirement`; view requirements gắn vào coverage trước query; `metric.capability` trong manifest + TS types + badge; job payload `exclude_unset` (depth mặc định ≠ lựa chọn); JOB_VERSION 3; POLICY_VERSION trong fingerprint | test_v33_identity (32), workspace_v31 |
| 2 Gate | gate server cho mọi prompt của pipeline one_shot (kể cả module/legacy prompt), mã block → UNSUPPORTED/REDIRECT/CLARIFY; kiểm theo từng clause; 13 mã chặn mới; benchmark p95 17.8 ms (cold tách riêng) | test_final_hardening_v33, evals v33 27+3 ca, evaluation/v33/preflight_benchmark.json |
| 3 Bảy chế độ | picker lọc visible; legacy mission tự map khi mở (effect + disclosure) | workspace.test.mjs, Playwright |
| 4 Provider | transport là owner duy nhất (1 recovery/submission, cùng payload, secondary hoặc resend), planner không retry transport, không model hop, 3 physical HTTP, ledger bền (job record qua observer), bảng deadline 40/41/70/30/12/2/5/6 | test_v33_provider_faults, test_reliability_v210, test_one_shot_v24 |
| 5 Temporal/forecast/risk/pair/driver | pair revenue×cancellation (catalog.governed_pairs) và driver_delta chạy A–Z trong pipeline + DB thật; risk chọn signal + execution_error; rate = điểm phần trăm; backtest map đúng key | test_v33_pair, test_v33_verification, smoke DB thật |
| 6 View requirements | `view_coverage` (satisfied/missing + lý do) vào report, verification, conclusion; ngưỡng narrow Top N là policy catalog | test_v33_views, test_v33_pair |
| 7 Kết luận/verification | conclusion trả lời mọi phần + forecast + caveat + action đọc được; verifier recompute typed calc (mutation tests); conclusion_grounding; trust dims theo oracle; save/reopen/DOCX giữ nguyên | test_v33_verification, test_refinement_quality_v281, reportPersistence.test |
| 8 State | ticket epoch+AbortSignal cho propose/generate/refine/job/reconcile/risk; back/reset/history hủy request; reset về mặc định; “Kết nối lại tác vụ” resume cùng key; clarification là chỉnh câu hỏi có kiểm soát | Playwright 10 journey |
| 9 Harness/eval | dp-test.sh exit code đúng + cô lập secondary key + e2e; 4 lỗi backend cũ + 4 lỗi retrieval cũ xử lý; evaluator nạp semantic_cases_v33 | dp-test all |

## ===== KẾT QUẢ CUỐI (17/10/2026) — đối chiếu Definition of Done của AI_V33_COMPLETION_PLAN.md §5.3 =====
Lệnh: `.claude/scripts/dp-test.sh all` → EXIT 0 — backend 1017 test OK (0 lỗi, kể cả 4 lỗi cũ), web 161/161 + typecheck + build, eval offline 146 ca (113/113, 113/113, 108/108, 17/17, 5/5, 6/6) + 33/33 ca V3.3, Playwright 12/12.
- [x] Một capability contract xuyên suốt — evaluator gọi trong resolver; gate server cho mọi prompt (pipeline one_shot); legacy adapter `planning_mode=legacy` giữ hợp đồng cũ (ghi rõ).
- [x] Bảy chế độ + legacy map thật khi mở (effect + disclosure).
- [x] Known terminal → 0 provider/0 SQL ở boundary thật (spy provider/executor; test job end-to-end; `physical_http` = 0).
- [x] Provider: một owner, ledger bền trên job, ≤3 physical, deadline table; fault-injection 9 ca.
- [x] Temporal/forecast/risk/pair/driver nối pipeline + DB thật (smoke): pair 1215 chi nhánh, driver 4 query, cả hai verified.
- [x] Static disagreement: view_coverage; thiếu view bắt buộc ⇒ completion_status=partial + verification=attention + caveat trong kết luận.
- [x] Narrow không padding (ngưỡng là policy catalog `narrow_top_n`); broad có coverage + lý do.
- [x] Kết luận đủ bốn phần, trả lời driver/pair/forecast, qua save/reopen/DOCX.
- [x] Verifier recompute typed calc (mutation tests) ; not_measured ≠ passed ; oracle cập nhật chiều tin cậy.
- [x] Browser: 12 journey Playwright (stale propose/generate/refine/risk, double-click, lost POST → resume cùng key, cancel khi HTTP chạy, guided sửa chữ, REDIRECT giữ ngữ cảnh).
- [x] Backend/frontend/typecheck/build/offline eval/browser đều pass; lỗi cũ xử lý minh bạch (evaluation/v33/history_before_completion.json giữ lịch sử).
- [x] Preflight benchmark p95 16.6 ms (cold 160.8 ms tách riêng) — evaluation/v33/preflight_benchmark.json.
- [ ] **Live provider ≤60 HTTP: NOT_RUN / BLOCKED** — lệnh gọi LLM thật bị bộ phân loại quyền chặn (real-money). 0 HTTP đã gửi. Mở khóa: chạy `docker compose -f docker-compose.data.yml exec -T analytics-api python -m evals.live_acceptance_v33 --out /tmp/live_v33.json [--execute] [--extension]` (meter nguyên tử trước mọi HTTP, trần 60/80, 22 ca định nghĩa sẵn trong evals/live_cases_v33.json). Vì vậy KHÔNG tuyên bố "fallback live verified".
- [ ] Manual UI acceptance trên bundle phục vụ: kịch bản sẵn ở AI_V33_MANUAL_TEST.md (chưa có người chạy).
Bằng chứng: evaluation/v33/{manifest,summary,offline_cases,preflight_benchmark,history_before_completion}.json (manifest có HEAD + sha256 working-tree diff + sha256 file chưa track).
Không commit/push; không đọc secret; không đụng chatbot/K8s/schema/ingestion.
