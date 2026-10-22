# Data Platform / AI Data Analyst — hardening 2026-10-20

Trạng thái: **LOCAL_ACCEPTED_REMOTE_PENDING** — **LOCAL_READY_FOR_USER_PUSH**. HEAD nền `790eae42026441bb74bc6a53dc29e08934846944`, branch `branch_thaian`. Không commit/push/trigger CI; remote exact-SHA chưa có. Receipt của vòng này: `evaluation/ai-data-hardening-20261020/`.

## Gate hiện hành

Source fingerprint (498 code/test/metadata/config/fixture, loại trừ docs/evaluation/runtime/env): `5859dbc2f480af0737590d6adeb823b93b1e0d55ea6981895886d18db7d32194`. Acceptance manifest: `8440a1c7f80192081f7584658ffc33acb67fa1035469a4b3d75d7c9e07d25aed`. Đây là working tree chưa commit, không phải claim remote SHA đã xanh.

| Phase | Status | Evidence |
|---|---|---|
| 0 Baseline/invariants | PASS | HEAD nền + source-manifest; metric/budget/access/compiler giữ nguyên |
| 1 Gitleaks | PASS local | classification36; fixture equality2/2; normal0 cuối; synthetic control42; config không đổi |
| 2 P6 | PASS local | 15 backend tests P6 + browser3 mới + HTTP P6 + Redis two-process CAS |
| 3 Edge | PASS | domain32/32, family18/18, edge28/28, total78/78 |
| 4 Oracle | PASS | frozen floors/state; 193 depth runs; 155 complete +34 honest limited +4 expected typed errors |
| 5 Regression/runtime | PASS local | backend1367, web191, browser40+5; pipeline65+41+33; load15/15; soak900.105s/fault PASS |
| 6 Diff review | PASS | diff-review.json; metadata parity; no demo/question branch, parallel engine, provider client, compiler bypass or schema/grant changes |
| 7 Remote DP CI | PENDING user push | không commit/push/fetch/trigger; chỉ accept CI cùng SHA user push sau này |

Semantic offline:146, dataset/failures0; V33 33/33, V34 120/120; authored reference120/120 (83 compiled intents). Đây không phải phép đo độ hiểu câu tự nhiên của model live. Full backend1367/1367 trong560.560s; expanded targeted158/158 trước full. Web191/191, typecheck/build PASS. Browser40 mocked +5 actual FastAPI HTTP PASS. Pipeline unit65/65, integration41/41, API PostgreSQL/Redis33/33.

Hai process: cùng revision chỉ1 publish; stale reject, owner isolation, idempotency, cross-process artifact/cancel, sessionCAS, crash reservation giữ nguyên. Load15/15 profile (1/4/8/12/20 ×3):111 completed,24 expected429; owner cap4/global12, fairness PASS. Fixture local không đo production SLO/reader-pool pressure.

Provider sends thật phát sinh vòng này: **0**. DB/schema/grant production thay đổi: **0**. SQL/test data ghi chỉ trong fixture dùng riêng.

## Thay đổi và phạm vi

- Gitleaks: tái hiện đúng release staging và image v8.30.1 pin digest. 36 finding `generic-api-key` là fingerprint trên hai JSON fixture minified (12 focused, 24 comprehensive). Chỉ định dạng JSON; so sánh parse bằng HEAD cho thấy giá trị giữ nguyên. Không sửa allowlist/config hay exit code. Scan sau định dạng: 0; control tổng hợp bắt cả `github-pat` và `generic-api-key`, exit 42. Scan cuối source/evidence sẽ ghi trong receipt.
- P6: typed semantic selections gắn chart/query/lens/session/revision/catalog/access; server kiểm row binding, type, compatibility, scope và hierarchy. Compiler/batch/snapshot hiện có thực thi revision; client không gửi SQL và không tái tính metric. Numerator partition là inspect-only theo metadata.
- UI: pending/applied, batch Apply, bỏ pending, chip/remove/clear, depth/refresh, stale indication, single-flight/abort/epoch suppression, breadcrumb/back/reset; lựa chọn nhóm ở từng chart. Keyboard/responsive kiểm bằng browser. Báo cáo mới thay nguyên khối; báo cáo cũ giữ khi lỗi.
- Session: revision làm trên bản detached; CAS/lock hiện có công bố. Cancel/deadline/revoke trước publication. Save chặn revision cũ; reopen giữ snapshot, refresh tạo revision mới. Không gọi provider từ tương tác BI.
- Khả năng nguồn: stale/incomplete hiển thị partial; unknown không được mô tả là đã chứng minh đầy đủ. Không tạo dữ liệu hay lịch sử nguồn.

## Oracle và tương thích

Ma trận giữ 32 domain + 18 family + 17 edge gốc và bổ sung 11 holdout = **78 case / 28 edge**. E18–E27/E29 kiểm all-null, missing source, stale source, access, fanout, budget/timeout, saved tamper, JS response race thực, cancel/revoke, identity-filter và ratio population có oracle độc lập. Các depth có ý nghĩa được kiểm trực tiếp trong holdout.

`ai_final_expectations.json` khóa expected error/status/gap, min views và core lenses; static planner audit chỉ là diagnostic. Judge kiểm requested numbers/meaning bất biến qua depth, <=8 ops, re-verification từ artifact, không singleton/duplicate/irrelevant chart.

**Điều chỉnh có chứng minh D10:** `total_spent` thuộc cohort CUSTOMER theo business filter; group `customer_role` không có biến thiên hay history. Một cột duy nhất trước đây không phải comparison. Số tổng độc lập vẫn bằng tổng `tong_chi_tieu` của CUSTOMER và giữ trong bảng đã kiểm chứng. Floor/max của riêng D10 là 0 useful chart, coverage `LIMITED_BY_SOURCE_CAPABILITY`; không hạ 4/6/8 của rich cases. Test độc lập kiểm cả ba depth. Chính sách `cohort-pinning-v1` được đóng vào artifact/query/cache signature; saved contracts cũ giữ policy render cũ. Xóa/hạ policy trong report mới làm verifier từ chối.

## Lịch sử live và giới hạn

Giữ receipt live cũ nguyên trạng: **FIRST_ATTEMPT = 10/12**, L05/L12 timeout; retry L12 rồi L05 thành công: **EVENTUAL_SUCCESS_AFTER_BOUNDED_RETRY = 12/12**. Vòng hardening này không có live provider send, không tăng/reset ledger/budget. Đây không phải bằng chứng live mới cho source hiện tại.

Giới hạn còn: histogram chưa có compiler binning; customers không có history phù hợp, inventory/shipper là snapshot, wishlist hạn chế trục. Chỉ metadata hierarchy được công bố mới drill được; numerator partition/mixed incompatible populations chỉ xem. Danh sách chọn nhóm bị chặn theo response/preview budget và có nhãn một phần; bảng artifact giữ kết quả. Refresh cần session còn hạn và catalog/access tương thích; saved snapshot cũ vẫn xem được. Fixture load/soak không chứng minh production SLO.

## Kiểm thủ công sau cập nhật bundle

1. Tab Trợ lý AI: tạo báo cáo, chọn nhóm từ chart hoặc toolbar; pending chưa đổi KPI. Thêm nhiều lựa chọn rồi Apply một lần; stale giữ nguyên toàn bộ revision cũ đến khi hoàn tất.
2. Drill theo chiều có hierarchy: breadcrumb/back/reset rồi Apply; thử partition inspect-only để thấy action bị vô hiệu hóa.
3. Lưu báo cáo, mở tại Báo cáo của tôi; kiểm depth/filter/drill/provenance. Refresh tạo revision mới; mở lại bản lưu để kiểm snapshot cũ không đổi.
4. Thử 1440/768/390 px và Tab/Enter trên select/chip/button. Tab Kiểm chứng & nguồn hiển thị limitation; Hỏi tiếp bằng AI chỉ chuẩn bị draft khi được chọn, user submit mới diễn giải.

## Danh sách file

Production:

- `data-platform/analytics-api/common.py`
- `data-platform/analytics-api/route_policy.py`
- `data-platform/analytics-api/routers/ai.py`
- `data-platform/analytics-api/routers/reports.py`
- `data-platform/analytics-api/services/agent_pipeline.py`
- `data-platform/analytics-api/services/analysis_expansion_service.py`
- `data-platform/analytics-api/services/analysis_quality_service.py`
- `data-platform/analytics-api/services/analysis_response_service.py`
- `data-platform/analytics-api/services/analytical_query_service.py`
- `data-platform/analytics-api/services/analytical_resolver.py`
- `data-platform/analytics-api/services/dashboard_planner_service.py`
- `data-platform/analytics-api/services/error_taxonomy.py`
- `data-platform/analytics-api/services/hybrid_analyst_planner.py`
- `data-platform/analytics-api/services/request_anchors.py`
- `data-platform/analytics-api/services/semantic_catalog_validation.py`
- `data-platform/analytics-api/services/session_service.py`
- `data-platform/analytics-api/services/telemetry.py`
- `data-platform/analytics-api/services/workspace_service.py`
- `data-platform/web-ui/src/components/report/ReportWorkspace.tsx`
- `data-platform/web-ui/src/utils/reportPersistence.mjs`
- `data-platform/web-ui/src/utils/workspaceInteraction.d.ts`
- `data-platform/web-ui/src/utils/workspaceInteraction.mjs`
- `data-platform/web-ui/src/views/AnalyticsView.tsx`
- `data-platform/web-ui/src/views/DashboardHubView.tsx`

Test/eval/fixture:

- `data-platform/analytics-api/evals/ai_final_acceptance.py`
- `data-platform/analytics-api/evals/ai_final_expectations.json`
- `data-platform/analytics-api/tests/test_ai_final_edges.py`
- `data-platform/analytics-api/tests/test_workspace_revision.py`
- `data-platform/pipeline-tests/final_workspace_two_api.py`
- `data-platform/web-ui/src/utils/reportPersistence.test.mjs`
- `data-platform/web-ui/src/utils/workspaceInteraction.test.mjs`
- `data-platform/web-ui/tests/e2e/fixtures/ai-final-report-comprehensive.json`
- `data-platform/web-ui/tests/e2e/fixtures/ai-final-report-focused.json`
- `data-platform/web-ui/tests/e2e/fixtures/ai-workspace-report.json`
- `data-platform/web-ui/tests/e2e/real-api.spec.ts`
- `data-platform/web-ui/tests/e2e/workspace-interaction.spec.ts`

Config/tool harness:

- `.claude/scripts/dp-v35-two-api.sh`
- `.github/workflows/data-platform-ci.yml`
- `data-platform/analytics-api/tools/run_workspace_ui_oracle.py`

## Kết quả đóng local

- Soak900.105s:1541/1541 operations,60/60 jobs,0 failure; request counters A757/B784 khớp exact counts; p95=49.53ms,p99=143.09ms. Chỉ fixture local, không phải production SLO.
- Fault matrix:5/5 crash windows; actual PostgreSQL cancel0.596s; revoke before_send/before_sql/persist/sql; ceiling3/4, shared half-open1 probe/16 offers, reader pressure, drain, Redis outage503/reconnect/no memory fallback PASS. Loopback meter và reservation giả lập tách khỏi external provider sends0.
- Bundle8501: `index-CzZ6kpJZ.js`, sha256 `03750e54297a7d7ff4dc9eff36513761c7b3da7cb6ecefae6a43f9bdf529ccc7`; byte giống localdist. API đang chạy có route typed; chỉ recreate web-ui. Các fixture đã dừng; không start Spark/Airflow, không đụng DB thật.
- Gitleaks source/evidence cuối0; control2 findings (`generic-api-key`,`github-pat`) exit42. Có5 false positive mới ở checksum receipt; xác nhận từng checksum rồi tách name/path vàsha256 thành field riêng, giữ toàn bộ hash. Không sửa scanner/config/allowlist/exit fail-closed; final rescan bao gồm receipt bàn giao.
- Metadata parity, architecture inventory và git diff --check PASS. Toàn bộ498 source files giữ nguyên từ lúc bắt đầu full gates.

**LOCAL_READY_FOR_USER_PUSH**. Đề xuất commit message: `feat(data-platform): hoan thien P6 va hardening acceptance`. Không commit/push/fetch/trigger remote. Sau khi user push mới xác minh SHA mới và mọi job Data Platform CI terminal/PASS; không dùng run SHA cũ. Remote hiện **PENDING**, chưa có bằng chứng để đổi trạng thái thành FINAL_VERIFIED. Gate summary máy đọc: `evaluation/ai-data-hardening-20261020/release-gates.json`.
