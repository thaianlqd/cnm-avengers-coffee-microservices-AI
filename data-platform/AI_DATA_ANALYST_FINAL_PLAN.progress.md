# AI Data Analyst FINAL — tiến độ triển khai (bắt đầu 2026-10-19)

Nguồn: `AI_DATA_ANALYST_FINAL_PLAN_20261019.md` (R2) · bàn giao việc cũ: `AI_DATA_PAUSED_WORK_20261019.md`.
Evidence: `evaluation/ai-data-final-20261019/`. Không ghi đè receipt V3.4/V3.5. Không commit/push.

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| P0 Baseline + tái hiện | PASS | red→green UI depth + scalar cancellation (xem dưới) |
| P1 Depth contract + capability manifest | PASS | lens_policy v4.0.0 (4/6/8) một nguồn; static audit trong `evals/ai_final_acceptance.py` |
| P2 Lens planner (core/diagnostic/extended) | PASS | planner thuần metadata, shape dùng chung, reserve 0-chi-phí |
| P3 Eligibility sau thực thi + coverage độc lập | PASS | `analysis_coverage` + verifier tính lại từ artifact (chống xóa chart/đổi nhãn) |
| P4 Đa dạng chart + kết luận | PASS | exposure scatter, heatmap, stacked_100 mix-shift, Pareto (mới), kết luận tổng hợp `view_findings`; histogram NOT_DONE (cần op binning trong compiler) |
| P5 UI compact + so sánh mức | PASS | chip bao phủ, nhãn lens, đủ view không “Xem thêm”, mô tả mức từ server; e2e + ảnh 1440/768/390 |
| P6 Tương tác + tương thích | PASS (local hardening) | typed cross-filter, pending/Apply, race suppression, governed drill/back/reset, atomic revision, save/reopen/refresh; backend + browser HTTP thực + Redis CAS |
| P7 Regression + hiệu năng + runtime | PASS (local hardening) | backend1367, eval146 + authored120, web191, browser45, acceptance78/78, pipeline65+41+33, two-process/load/fault +900.105s soak PASS |
| P8 Review + bàn giao | PASS (local) | audit chống hardcode sạch; xem mục P7–P8 dưới; không commit/push |

## P0 — Baseline (HEAD e7da8e18, branch_thaian = origin/branch_thaian, working tree: 2 file PLAN chưa track)

- Tái hiện offline trên **rich fixture** (`evals/rich_fixture.py`: 6 chi nhánh/4 ở HCM, 30 ngày, ~700 đơn, tỷ lệ hủy khác nhau theo chi nhánh/hình thức) với production `AnalysisPipeline`:

| input depth | effective | ops | charts | ghi chú |
|---|---|---:|---:|---|
| không gửi | deep | 7 | 3 | 2 cột "1 thành phố" (đếm đơn/khách theo tỉnh đã bị ghim) |
| focused | focused | 1 | 0 | |
| deep | deep | 7 | 3 | |
| comprehensive | comprehensive | 8 | 4 | thêm donut doanh thu theo hình thức (không liên quan hủy) |

  (Lần chạy này truyền `analysis_depth` qua request pydantic nên "không gửi" ở đây = mặc định deep của request model; lỗi UI "hiện deep nhưng không gửi" nằm ở `AnalyticsView.tsx` + `analysisInput.mjs`, kiểm bằng test web bên dưới.)
- Gốc xác nhận từ source: policy target 2/5/8 (catalog), 2–4/4–6/6–8 (`DEPTH_POLICIES`), supporting-chart budget 0/4/6 (`chart_relevance_service`); `supporting_candidates` lấy lens/metric liên quan theo miền (không theo lớp metric/giá trị phân tích); `estimated_views` ≠ chart cuối; `depth_coverage` chỉ ghi nhận.

## P0/P1/P2 — thực hiện (2026-10-19, đang chạy)

- **Red→green #1 (UI default depth)**: `analysisInput.test.mjs` "FINAL P0…" đỏ → xanh sau khi bỏ cờ `aiDepthChosen` trong `AnalyticsView.tsx` (UI luôn gửi mức đang hiển thị).
- **Red→green #2 (scalar cancellation nghèo view)**: `tests/test_ai_final_depth_contract.py` đỏ (0/3/4 chart) → sau lens planner: focused 4 · deep 6 · comprehensive 8 chart, mọi chart thuộc họ chỉ số hủy (không còn cột "1 thành phố", donut doanh thu). Chung cho mọi miền (không nhánh theo câu hỏi).
- **Metadata (catalog, additive)**: 9 metric `component_only` (tử/mẫu số/exposure của 4 ratio + 5 average), `components` trên metric chủ, `lens_axes` cho 16 domain, `dashboard_policy.lens_policy` v4.0.0 (view_targets 4/6/8, sequences theo lớp metric, min_groups, trend_granularity). Component-only bị ẩn khỏi manifest cho LLM/UI (`build_manifest(include_components=False)`), chỉ index compiler thấy.
- **Code**: `analysis_expansion_service.py` (lens planner thuần metadata), `analytical_resolver.py` (tích hợp, coverage.lenses, fingerprint), `dashboard_planner_service.py` (lens_visuals, lens eligibility, paired exposure), `chart_relevance_service.py` (no_lens_binding), `analyst_contract.DashboardVisual` (analysis_lens_*), `agent_pipeline.py` (lens_context).
- Fixture: `evals/rich_fixture.py` (oracle độc lập + rich_world 21 bảng).


## Kết quả P1–P3 (2026-10-20)

**Root causes đã sửa (chung cho mọi miền, không nhánh theo câu hỏi):**
1. UI hiện deep nhưng không gửi depth → server legacy auto hạ focused (0 chart). Sửa UI + ghi `selection_origin` (explicit/legacy_auto) vào coverage/telemetry.
2. Supporting candidates lấy “metric liên quan theo miền” → cột 1 thành phố, donut doanh thu cho câu hủy. Thay bằng lens planner theo **lớp metric** (ratio/additive/average/distinct), components (tử/mẫu/exposure), lens_axes, trục bị ghim (filter, business filter, cột vật lý/biểu thức dẫn xuất), cardinality, lịch sử.
3. Ba nguồn số 2/5/8, 2-4/4-6/6-8, 0/4/6 → một `lens_policy.view_targets` 4/6/8; `DEPTH_POLICIES.target_views` chỉ phản chiếu.
4. Coverage chỉ ghi nhận → `analysis_coverage` (status complete/limited/partial, gap_kind PLANNING_GAP/SOURCE_UNAVAILABLE/CAPACITY_LIMITED/LIMITED_BY_MISSION/LIMITED_DATA/LIMITED_BY_SOURCE_CAPABILITY) + `quality_assessment.analysis_breadth` tách khỏi điểm đúng-số. PLANNING_GAP chặn trạng thái verified.
5. Lỗi phụ phát hiện khi chạy ma trận: op supporting trùng op requested chạy 2 lần (nay dùng chung); multi_line theo thực thể có identity bị đếm category sai; scatter quan hệ bị vẽ 2 lần (đảo trục); lens id trùng giữa 2 câu hỏi; cơ cấu trên chỉ số có thể âm.
6. Hiệu năng: memo `referenced_columns`, `domain_for` không deepcopy toàn bộ hồ sơ → report comprehensive 8,3s → 4,4s (fixture, container 0,5 CPU). Full suite cô lập 1 CPU: 548s (V3.5 ghi 741s).

**Bằng chứng:**
- `tests/test_ai_final_depth_contract.py` 13/13 (oracle độc lập, đơn điệu F⊆D⊆C, giả mạo bị phát hiện, ca giới hạn trung thực, 6 lớp metric/miền khác).
- Ma trận `evals/ai_final_acceptance.py` (manifest hash trong receipt): **66/66 case** (32 domain · 18 family · 16 edge), 190 lượt; 146 lượt đủ 4/6/8; còn lại: CAPACITY_LIMITED 18, LIMITED_BY_SOURCE_CAPABILITY 18, LIMITED_DATA 4, lỗi có kiểu 4 (no-data, snapshot→trend, filtered ratio cần làm rõ). 0 PLANNING_GAP, 0 view lạc đề, 0 trùng. Receipt: `evaluation/ai-data-final-20261019/acceptance-matrix-offline.json`.
- Test cũ được cập nhật (giữ ý định gốc, ghi lý do trong code): focused không còn “0 supporting”; đếm query requested thay vì tổng; line 1 điểm → công bố insufficient_periods; đếm metric public 43 (+9 component_only).

**Giới hạn nguồn (không bịa):** customers chỉ có trục vai trò (customer_count bị ghim CUSTOMER) → 1 view; inventory/shipper là snapshot (không trend); wishlist chỉ product/category; relationship shipper (snapshot, trục driver_id) 2 view.


## P4–P8 (2026-10-20) — kết quả cuối phiên

**Thêm/sửa sau P3:** reserve lens 0-chi-phí (tối đa 2/vai trò); ước lượng cardinality từ value profile + hint (thứ=7, giờ=24) để heatmap/scatter tránh trục hàng nghìn nhóm; trục yêu cầu được dùng cho câu hỏi khác nghĩa (diễn biến theo nhóm/tương tác/exposure/đóng góp); họ relationship lập lens cho từng biến; mission grammar áp dụng trước SQL (`LIMITED_BY_MISSION`); lens id gắn requirement khi nhiều câu hỏi; trục bị ghim + có KPI cùng phạm vi → không vẽ cột 1 nhóm; hai yêu cầu alias cùng biểu thức vật lý (store_revenue/revenue) không còn bị coi là thiếu view; Pareto cho đóng góp >8 nhóm; nhãn nghiệp vụ còn thiếu (Đã hủy, Tiền mặt, Đi trễ…).

**Gate local tại checkpoint trước vòng hardening (source lịch sử, không thay receipt mới):**

| Gate | Kết quả |
|---|---|
| Backend full (container cô lập, network none, 1 CPU/1 GiB) | 1344/1344 OK, 617 s |
| Contract FINAL (`test_ai_final_depth_contract` 15, `test_ai_final_alias_views` 1) | PASS |
| Semantic eval offline | 146 ca, 0 failure (v33 33/33, v34 120/120) |
| Web | 187/187, typecheck PASS, build PASS |
| Browser e2e | 37/37 (thêm `ai-final-depth.spec.ts`: 8 view comprehensive, 4 view focused, chip, không “Xem thêm”, không tràn 768/390) |
| Ma trận offline (`evals/ai_final_acceptance.py`, manifest sha 604276178bb5…) | 67/67 case, 193 lượt: 155 complete · 34 limited (source 18, capacity 12, data 4) · 4 lỗi có kiểu đúng kỳ vọng · 0 PLANNING_GAP · 0 view lạc đề/trùng |
| Metadata `regenerate_pipeline_metadata --check`, `git diff --check` | PASS |
| gitleaks thư mục evidence | no leaks |
| Bundle 8501 | `index-C7zfsowg.js` sha256 3b0b8e6e…, có chuỗi mới |

**Live (người dùng cho phép, ledger bền 457 → 515, +58 lượt gửi, không reset):** lượt cuối 12 câu: 10 thành công verified + đủ 4/6/8; L05/L12 provider_timeout (2 lượt gửi mỗi câu, recovery giới hạn) → chạy lại: L12 4/4, L05 8/8 verified. Câu hủy HCM 09/2026: 4,68% ở cả 3 mức, focused 4/4 · deep 6/6 · comprehensive 8/8, 1 lượt gửi, ~3,3 s. Receipts: `live-acceptance-final*.json` (chỉ enum/đếm/ID, không SQL/rows/secret).

**Hiệu năng:** report comprehensive fixture 8,3 s → 4,4 s (container 0,5 CPU); ≤8 logical ops/report (đo trong ma trận); live 2,6–6,8 s/câu khi provider bình thường. Test latency preflight chỉ fail trong container API 0,5 CPU đang phục vụ (CPU p95 ~20 ms); trong container cô lập 1 CPU PASS.

**Anti-hardcode:** grep diff production (services/routers/web) không có “hủy/cancel/Hồ Chí Minh/2026-09/DA_HUY/test id/fixture”. Hành vi theo lớp metric + metadata; tên metric chỉ xuất hiện trong catalog.

**Còn mở tại checkpoint trước hardening:** P6 cross-filter typed/drilldown breadcrumb/batch Apply chưa làm; histogram chưa làm; customers/inventory/shipper/wishlist giới hạn bởi nguồn; remote CI chưa chạy; semantic live (diễn giải model) chỉ đo 12 câu.

**Trạng thái checkpoint trước hardening:** LOCAL IMPLEMENTATION COMPLETE / REMOTE CI PENDING — chưa FINAL_VERIFIED.

## Hardening 2026-10-20 — checkpoint mới

Báo cáo hiện hành: `AI_DATA_HARDENING_ACCEPTANCE_20261020.md`; receipt: `evaluation/ai-data-hardening-20261020/`. P6 đã đóng bằng production owners hiện có; acceptance 78/78 (32 domain + 18 family + 28 edge), không tạo engine/provider flow song song. Live cũ phải đọc đúng: FIRST_ATTEMPT10/12, retry L12 rồi L05 → EVENTUAL12/12; không có live send mới.

Trạng thái hiện tại **LOCAL_ACCEPTED_REMOTE_PENDING**, marker **LOCAL_READY_FOR_USER_PUSH**: local gates xanh, bundle8501 đã cập nhật, source/evidence Gitleaks0 và synthetic control exit42. Không commit/push/trigger CI; remote exact-SHA pending.
