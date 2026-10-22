# HANDOFF AI Data Analyst reliability — đã nghiệm thu 22/10/2026

**Goal tổng: DONE trong phạm vi hữu hạn của PLAN.** Bản localhost `.33`, input `1.2.5`, verifier `2.8.8`.
Kết quả cuối: [MD nghiệm thu](AI_DATA_ANALYST_NGHIEM_THU_20261022.md) và [qualification](AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md).
T1–T9 đã có evidence cuối: backend107module/1704test hiệu lực; Gemini9/9AI first-pass,9sends; ma trận54/54; nativeWord12pages; browser12/12; bundle/source khớp.
I13 là giới hạn dữ liệu còn được cảnh báo, không sửa nguồn. Không mở thêm campaign để thay kết quả. Các mục bên dưới là **bàn giao và lệnh lịch sử**, bao gồm trạng thái chưa xong ở thời điểm Claude dừng; không dùng chúng thay receipt33. Web package hiện không có script lint.

## 0. Quy tắc bắt buộc (giữ nguyên từ repo)
- Trả lời tiếng Việt. KHÔNG commit/push/reset/stash/clean/restore; working tree có thay đổi của người dùng — không hoàn tác thứ không do mình tạo.
- Không đọc/in `.env`, key. Đăng nhập test localhost: `DP_AUDIT_USER=admin DP_AUDIT_PASSWORD=<do người dùng cung cấp>` qua biến môi trường, không ghi vào file.
- Header bắt buộc khi gọi API: `Origin: http://127.0.0.1:8501` (thiếu → 403 “Nguồn đăng nhập không hợp lệ”).
- Offline luôn `AI_OFFLINE=1`. Không nới READ ONLY / statement_timeout / auth / stale checks để làm test xanh.
- Mỗi lỗi: test tái hiện đỏ trước → sửa ở tầng chung → xanh + control ở family khác. Không vá theo câu mẫu.
- Đổi luật diễn giải/resolver ⇒ **tăng `PLAN_POLICY_VERSION`** trong `services/analytical_resolver.py` (khóa cache kế hoạch, G07).

## 1. Lệnh
```bash
# 1 module (trong data-platform/analytics-api):
docker exec -i avengers_analytics_api env -u DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN -u DATA_ANALYST_ENABLE_CONTRACT_REPAIR \
  -u DATA_ANALYST_GEMINI_SECONDARY_KEY AI_OFFLINE=1 DATA_ANALYST_ENV=development DATA_ANALYST_ALLOW_BROWSER_OWNER=1 \
  DATA_ANALYST_SESSION_STORE=memory DATA_ANALYST_ARTIFACT_STORE=memory python -m unittest tests.<module>
# Toàn bộ: chạy TỪNG module một process (monolithic run bị OOM exit 137). Đừng chạy song song với live Gemini (gây provider_timeout).
# Web: (data-platform/web-ui) npm run typecheck && npm run lint && node --test src/utils/*.test.mjs
# Đổi web-ui ⇒ docker compose -f docker-compose.data.yml up -d --build web-ui (tạo lại cả analytics-api → đừng làm khi test đang chạy),
#   rồi xác minh bundle: curl các assets/*.js của :8501 và grep chuỗi mới.
# Live Gemini (data-platform/evaluation/ai-system-audit-20261021):
DP_AUDIT_USER=admin DP_AUDIT_PASSWORD=... python3 audit_runtime.py live --allow-provider [--case <id>] --receipt-name <tên-mới>
# Browser thật: Playwright của web-ui cần revision 1208 (chưa cài); dùng
#   chromium.launch({executablePath: ~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell})
#   login bằng ctx.request.post('/api/auth/login', {headers:{Origin}}), tab “Trợ lý AI”, textarea, nút “Toàn diện”, nút “Phân tích”.
```

## 2. Đã làm (đừng làm lại — chi tiết trong README evidence)
I01/I09 compiler cohort (`analysis_query.compile_cohort_scoped`, `validate_cohort_scoped`, resolver `cohort_scopable`/`bind_dependent_goals`,
field `cohort_scope_query_id`), mục tiêu phụ thuộc “… trong 5 tỉnh này” (anchors `cohort_references`/`coordinated_dimensions`,
`normalize_cohort_cross_tabs`, `complete_coordinated_axes`), I02 bản đồ theo cohort, I03, I04/I05, I06, I07, I08, I10, I11, I12, I16,
anaphora, nhãn/chip phạm vi + `scope_note` trong “Nhận định từ biểu đồ”, G07 khóa cache theo policy. Test: `tests/test_reliability_20261021.py`.
Offline eval 146/146. Web 224/224. Live: Bottom 5 = 1.071.000đ ở mọi view (trước 440.072.000đ).

## 3. VIỆC CÒN LẠI (theo thứ tự ưu tiên)

### T1 — Chốt regression backend (P0, làm đầu tiên)
- Full run cuối của Claude **chỉ chạy được 15/101 module** rồi dừng: 14 OK, `tests.test_analysis_jobs` FAILED (failures=2)
  — đã đọc log tạm: hai subtest `test_load_one_five_ten_jobs_without_provider_network` (`count=5`, `count=10`), **khác hai test p95 của T2**. 86 module còn lại chưa chạy → chạy lại toàn bộ 101 module, mỗi module một process.
- So với baseline audit `evaluation/ai-system-audit-20261021/offline-modules/*.log` (`AUDIT_RESULT`). Lỗi có sẵn được phép:
  `test_comparison_score_v282` (4E — **có thể đã hết** nhờ sửa anaphora, kiểm tra), `test_v35_dashboards` 2E+1F, `test_natural_v26` 1E,
  `test_workspace_v31.test_web_ui_fixture_matches_current_capabilities`.
- Đã sửa trong vòng cuối (cần xác nhận xanh trong full run): ranh giới “chỉ” → “chỉ trong/chỉ xét/chỉ tính” (từng cắt “Hồ Chí Minh”);
  `drop_unrequested_feature_conflicts` chỉ còn `concentration`,`relationship_strength`; `AnalysisCatalog.ground(..., grounded_values=)`;
  `plan_fingerprint` chuẩn hóa `cohort_scope_query_id`; alias `cohort_scope_query_id` khi dedupe; `restore_artifacts` giữ thứ tự báo cáo.
- `test_analysis_jobs.test_load_one_five_ten_jobs_without_provider_network` từng đỏ khi máy tải, xanh khi chạy riêng → chạy lại để xác nhận.
- Nghiệm thu: không còn lỗi mới so với baseline; ghi bảng vào README evidence.

### T2 — 2 test độ trễ preflight (P1)
`test_workspace_v31.PreflightTests.test_hot_path_latency_and_no_io`, `test_final_hardening_v33...p95_under_50ms`: p95 ~60ms, p50 8ms.
Đã thử bật/tắt từng thay đổi preflight của phiên (policy “giữa”, chặn ghi, anaphora, cache key) — không đổi. Profile: `request_anchors`
~34ms/lượt, `exact_mentions` ~154 lần/lượt (có sẵn). Việc cần làm: (a) đo baseline thật bằng cách chạy benchmark trên bản sao thư mục
analytics-api với các file liên quan lấy từ trạng thái trước phiên (KHÔNG dùng git restore/stash); (b) nếu là regression của phiên →
cache `cohort_references`/`coordinated_dimensions` theo stamp policy; (c) nếu có sẵn → tối ưu `request_anchors` (gộp vocabulary thành 1 regex
alternation theo độ dài) và giữ nguyên kết quả (`test_input_integrity`, corpus 240 ca phải xanh).

### T3 — Live Gemini campaign cuối (P0 cho G10)
Lần chạy cuối bị 7 `provider_timeout` vì chạy song song regression (receipt `live-final-campaign-20261022.json`, KHÔNG tính pass).
Chạy lại khi máy rảnh, receipt mới. Với MỖI case completed phải soi ngữ nghĩa (không lấy “completed” làm pass):
op/metric/group_by/filters, `cohort_scope_query_id`, tổng view phụ = tổng cohort, nhãn chart. Giới hạn ≤ 48 physical sends/campaign.
Case bất ổn đã biết: `multi-clause` (Gemini trả 3 shape khác nhau; đã chuẩn hóa cả 3) — chạy ≥3 lần, ghi tỉ lệ.
Nếu shape mới: lấy `interpreted_shapes` qua `GET /api/ai/analysis-jobs/<job_id>` (`result.diagnostics`), thêm test mock đúng shape đó.

### T4 — Risk deep `partial_available` (P1, I05)
Tín hiệu “vị trí món tạm ngưng” (`paused_positions_exist`, metric snapshot) không có lịch sử → báo cáo sâu đòi duyệt phạm vi thu hẹp,
trong khi tab Risk (`risk_watch_service.evaluate`) đọc hiện trạng. Đã thử ngoại lệ trong resolver (`required_period` bỏ qua cho snapshot)
→ vướng `time_range_ambiguous` ở `analytical_query_service.prepare` → ĐÃ HOÀN TÁC. Hướng đúng: để hợp đồng risk tách requirement snapshot
thành “hiện trạng” có nhãn ở cả resolver lẫn query service (kiểm tra kỳ chấp nhận `all_time` khi metric snapshot VÀ mission risk_watch do
server sinh), cập nhật verifier; test: risk HCM deep → completed, 0 AI, tín hiệu snapshot ghi “(hiện trạng)”. Không áp cho luồng khác (I10 vẫn chặn).

### T5 — View tỷ lệ/trung bình cạnh Top N (P1, G04)
Hiện chỉ gộp lại theo cohort cho metric `additive`. View tỷ lệ (vd. `order_cancellation_rate` theo hình thức) cạnh “Top 5 chi nhánh hủy cao”
vẫn là benchmark có nhãn. Làm: với metric có thành phần tử/mẫu khai báo (catalog `component`/ratio), compile inner với tử+mẫu, gộp
`SUM(num)/SUM(den)`; thêm oracle test so với tính tay trên fixture; live case `risk-followup`.

### T6 — Verifier lời giải thích (P1, G06/§19.4)
`chart_insight_service` đã đặt `scope_note` đầu caveat. Còn thiếu: claim/fact trong `key_findings`, `conclusion`, `executive_summary`
phải kiểm phạm vi — mỗi fact có `scope_ref`; fact từ view `scope_benchmark` không được diễn đạt như số của cohort. Thêm kiểm tra trong
`analysis_quality_service.assess_report` + mutation test (cố ý đổi `scope_ref`/mẫu số → phải bị chặn). Export DOCX (`docx_service`) phải mang
cùng nhãn phạm vi — chưa kiểm.

### T7 — Preflight ground giá trị scope có cấu trúc (P2, I03 phần còn lại)
Giá trị thật sự không tồn tại trong `analysis_scope.filters` vẫn READY rồi execution báo `filter_value_unknown`. Dùng cùng
`SemanticTools.resolve(..., allow_fallback=True)` trong preflight (có đếm lookup, không gọi AI) để READY ⇔ execution chấp nhận.

### T8 — I13 nguồn dữ liệu (P2, cần người dùng)
`evaluation/ai-system-reliability-impl-20261021/i13-store-city-suffix-check.{sql,txt}`: phần lớn lệch khớp sáp nhập tỉnh 2025. Hỏi người dùng
có bảng sáp nhập chính thức không; nếu có → thêm cảnh báo mapping (không sửa dữ liệu, không đưa heuristic vào điểm chất lượng).

### T9 — Nghiệm thu cuối G09–G12
- Ma trận bổ sung `evaluation/ai-system-reliability-plan-addendum-20261021/acceptance-addendum.json` (14 ca) và 40 ca cũ: chạy/đo, ghi kết quả.
- Mutation tests §17.3 cho chart + lời giải thích.
- Browser thật: 3 độ sâu × (ranking, compare, risk, trend) — ảnh chụp vào thư mục evidence; kiểm “Nhận định từ biểu đồ” mở/đóng 0 request AI.
- Rebuild web-ui, xác minh bundle, cập nhật README evidence + checkpoint trong GOALS. Chỉ ghi `DONE` khi mọi gate §12/§19 đạt; còn đỏ → `NOT_QUALIFIED` + lý do.

## 4. Bẫy đã gặp (tiết kiệm thời gian)
- zsh không tách từ biến: dùng `${=M}` khi truyền danh sách module.
- Planner (`hybrid_analyst_planner`) chạy trên BẢN SAO `context` → giá trị cần cho verifier phải đặt ở `agent_pipeline` (vd. `cohort_references`).
- Verifier dựng lại kế hoạch từ `quality_context.ui_constraints`; mọi thay đổi resolver phải idempotent (đừng sửa `parent_id` của op dùng chung).
- So khớp policy là KHÔNG DẤU: từ ngắn (“chỉ”) có thể trùng một phần tên riêng (“Chí”).
- Live job chỉ có `provider_calls 0` + lỗi verifier ⇒ thường là cache kế hoạch cũ → tăng `PLAN_POLICY_VERSION`.
- Log chẩn đoán `[QualityNotScored]` đã có trong `agent_pipeline.report`.
