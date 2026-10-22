# Triển khai PLAN reliability 21/10/2026 — biên bản nghiệm thu (phiên 1–2)

**Goal tổng: xem mục “Trạng thái” cuối file.** Mọi kết luận dưới đây có test tái hiện (đỏ trước → xanh sau) và/hoặc
receipt live trên localhost:8501 (tài khoản `admin`, Gemini theo quyền PLAN 0.2). Không lấy HTTP 200/“completed” làm pass.

## 1. Lỗi đã sửa (theo họ, không theo câu)

| Incident | Gốc lỗi | Sửa (file) | Bằng chứng |
|---|---|---|---|
| I01/I09 view phụ toàn quốc gắn vào Bottom 5 | supporting op chỉ so `filters==[]` với parent | **G04 compiler cohort**: `compile_cohort_scoped` (semi-join CTE kết quả xếp hạng + gộp lại theo grain gốc, alias tách namespace) cho aggregate/trend/distribution/cross_tab với chỉ số `additive`; resolver gắn `cohort_scope_query_id`; view không gộp được → nhãn `scope_benchmark` “toàn phạm vi (không riêng Bottom 5)” | `test_I01_*` (oracle: tổng mỗi view phụ = tổng cohort, 3 family tỉnh/chi nhánh/sản phẩm). Live: Bottom 5 tổng **1.071.000đ**; trước sửa supporting 440.072.000đ, sau sửa 7/7 view phụ (kể cả donut/cross-tab) = 1.071.000đ |
| G04 mục tiêu phụ thuộc (“chi nhánh và thanh toán chỉ trong 5 tỉnh này”) | không có khái niệm tham chiếu cohort | anchors `cohort_references` (chiều + đại từ chỉ định) + `coordinated_dimensions`; resolver `bind_dependent_goals`; chuẩn hóa `normalize_cohort_cross_tabs` (cross_tab/ranking/aggregate chứa chiều cohort → phân tích trong cohort), `complete_coordinated_axes`, bỏ filter cohort giả của model | 4 test theo đúng 3 shape Gemini trả thật; live multi-clause **completed 2/2**, store/payment “trong Bottom 5” |
| I16 model tự thêm `store_revenue` | luật bỏ mục tiêu trùng so cả `ranking.metric_id` | `request_anchors.normalize_explicit_metrics` so shape bỏ metric của ranking | `test_I16_*` đỏ→xanh; live bottom-five chỉ còn `revenue` |
| I02 bản đồ lấy 55 tỉnh/1.215 cửa hàng | panel dùng mạng lưới toàn bộ | `reportGeography.rankedCohort/cohortSummary`, `GeographicReportPanel` (mặc định cohort, nút xem toàn mạng lưới có nhãn bối cảnh) | node test; **browser thật**: “5 tỉnh/thành trong Bottom 5 · 1.071.000 ₫” |
| I03 tỉnh hiếm READY rồi bị từ chối | enum 16 tỉnh bị coi là toàn bộ ở 5 tầng | `value_grounding.lookup_fallback` (chỉ cho phạm vi người dùng chọn, `allow_fallback`), ngân sách lookup theo số member, planner nhận giá trị đã ground, `AnalysisCatalog.ground` | `test_I03_*` (control: alias không tốn lookup, “Atlantis”, giá trị model bịa `PRIVATE_UNKNOWN` không chạm DB); live completed, 4/4 chart lọc đúng 5 tỉnh |
| I04/I05 risk deep đi AI → products | `question_filters`/chiều đầu-bộ-lọc làm bỏ hợp đồng tất định; vượt trần 8 op | `merge_question_filters`, preflight bỏ qua chiều chỉ là đầu bộ lọc, `max_operations=12` cho hợp đồng do server sinh | `test_I04_*` 3 độ sâu × 2 cờ + scope trong câu; live risk-explicit-scope & risk-edited: `auto_upgrade`, **0 lượt AI** |
| I06 refinement 409 | cache `preflight_catalog` không key theo access | key gồm `access_fingerprint` | `test_I06_*`; live refinement-preflight trên báo cáo mới: **200** (trước 409) |
| I07 “giữa Hồ Chí Minh” | thiếu `giữa` trong assignment terms | policy | `test_I07_*`; live READY |
| I08 Bottom hiển thị “Top”/“đứng đầu” | hard-code ở renderer, insight, KPI, caveat | `ranking_label`, `selection_code` (Bottom N), `selected_total_label`, câu “thấp nhất trong Bottom 5”, verifier dùng chung helper; web-ui `Bottom N` | test; browser: không còn “Top 5 —” cho tập Bottom |
| I10 snapshot + kỳ cụ thể READY rồi lỗi | không kiểm “đồng hồ” chỉ số | `check_metric_clocks` (guided, preflight + pipeline), chặn free-text toàn-snapshot có kỳ | `test_I10_*`; live relationship: chặn trước AI, **0 lượt gửi** (trước 1 lượt rồi lỗi) |
| I11 yêu cầu xóa/ghi READY | intake không phân loại | slot `mutation` / `input_write_unsupported` | test + control; live NEEDS_INPUT |
| I12 thiếu góc nhìn đổ cho mission | `singleton` xếp vào nguồn/mission | `gap_kind` → LIMITED_DATA, tóm tắt nêu tối đa 2 nguyên nhân | `test_I12_*` |
| Anaphora “5 tỉnh này”, “hai thành phố trên” | đại từ bị coi là tên tỉnh (cũng là 4 lỗi baseline `test_comparison_score_v282`) | `anaphora_terms` (chỉ khi đứng cuối cụm), ranh giới “chỉ” | test + control “Trên Mây”, “Qzxn” vẫn chặn |
| G06 lời giải thích | caveat “Top N… dùng toàn bộ phạm vi” sai cho cohort | `scope_note` dẫn đầu caveat, `[data-insight-scope]` trong “Nhận định từ biểu đồ”; chip “Trong Bottom 5 / Toàn phạm vi” trên thẻ; donut “Tổng trong Bottom 5”; `validate_cohort_scoped` (verifier độc lập: tổng view cohort = tổng xếp hạng) | browser: 5/5 chip, 0 request AI khi mở/đóng nhận định |
| G07 cache kế hoạch | khóa cache không gồm phiên bản policy → kế hoạch cũ bị verifier chặn sau khi đổi luật | `PLAN_POLICY_VERSION` + `input_integrity.policy_fingerprint` trong khóa `plan:` | live: sau đổi luật lượt đầu gọi AI, lượt sau cache hit và completed |
| Feature model sai shape | `concentration` gắn sai shape làm hỏng cả lượt | `drop_unrequested_feature_conflicts`, đích feature xếp hạng = chỉ số xếp hạng | `FeatureNormalizationTests` |

Test mới: `analytics-api/tests/test_reliability_20261021.py`. Test cũ đổi kỳ vọng theo PLAN (ghi rõ trong code):
`test_ai_final_depth_contract.test_ranking_question_keeps_its_top_n_and_labels_full_population_lenses`,
`test_v32_mission_reliability.test_risk_mission_supporting_views_use_risk_metrics_only` (risk free-text = 0 lượt AI).

## 2. I13 — điều tra nguồn, không sửa dữ liệu

`i13-store-city-suffix-check.sql` (read-only, 0,04s): 19/1.215 cửa hàng có tên kết thúc bằng tỉnh khác `thanh_pho`. Phần lớn khớp
đợt **sáp nhập tỉnh 2025** (Bình Dương→TP.HCM, Long An→Tây Ninh, Bắc Giang→Bắc Ninh…), nên ca audit “Bau Bang Dinh Duong → HCM”
nhiều khả năng **đúng**. Đáng ngờ thật: “Ga Da Nang”→Hải Phòng, “Hòa Bình - Bạc Liêu”→Hòa Bình. Cần chủ dữ liệu xác nhận; không đưa
heuristic vào điểm chất lượng (sẽ báo lỗi sai khi chưa có bảng sáp nhập chính thức). Mẫu: `i13-store-city-suffix-check.txt`.

## 3. Live Gemini (receipts trong `../ai-system-audit-20261021/live-*.json`)

Campaign `live-after-fix-20261022` (12 case, 13 lượt gửi): 8 completed, risk-explicit-scope partial (0 AI), 1 failed, 1 insufficient, 1 HTTP400.
Soi ngữ nghĩa từng case → sửa tiếp risk-edited, relationship, multi-clause, bottom-five; replay sau sửa: risk-edited 0 AI;
relationship chặn trước AI; bottom-five chỉ `revenue` + mọi view “trong Bottom 5”; multi-clause completed (`live-final6/7-*`).
Các lần thất bại trung gian được giữ nguyên receipt (`live-after-fix2..5-*`, `live-final..final5-*`).

## 4. Còn lại / giới hạn

- Risk deep tháng 9: `partial_available` vì tín hiệu “vị trí món tạm ngưng” là snapshot; báo cáo chờ người dùng duyệt phạm vi thu hẹp
  (tab Risk tất định vẫn đánh giá hiện trạng). Đã thử cho đọc hiện trạng trong báo cáo sâu → vướng kiểm tra kỳ ở tầng query, đã hoàn tác.
- View chỉ số tỷ lệ/trung bình (vd. tỷ lệ hủy) cạnh Top N: chưa gộp lại theo cohort (cần tử/mẫu), đang là benchmark có nhãn.
- 2 test độ trễ p95 (~60ms > 50ms, p50 8ms): bật/tắt từng thay đổi preflight không đổi kết quả → nghi do tải máy, **chưa kiểm chứng**.
- Playwright e2e có sẵn (API giả lập) cần browser revision 1208, máy chỉ có 1223 → dùng headless 1223 cho hành trình thật; chưa chạy bộ e2e cũ.
- Gemini không tất định: luật chuẩn hóa phủ 3 shape đã quan sát; shape mới vẫn có thể bị verifier chặn (fail-closed, không trả sai).

## 5. Cách tự kiểm tra trên localhost:8501

1. Trợ lý AI → “Bottom 5 tỉnh/thành trong dữ liệu theo doanh thu tháng 9 năm 2026” → Toàn diện → Phân tích: chart chính “Bottom 5”,
   mọi chart khác có chip **Trong Bottom 5**; donut “Tổng trong Bottom 5” ≈ 1,1M; tab bản đồ “5 tỉnh/thành trong Bottom 5 · 1.071.000 ₫”.
2. “Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này” → hai chart
   chi nhánh/thanh toán “Trong Bottom 5”.
3. “So sánh doanh thu theo tỉnh/thành giữa Hồ Chí Minh và Hà Nội tháng 9/2026” → gửi được. “Xóa toàn bộ dữ liệu…” → bị chặn.
4. Rủi ro, phạm vi HCM, độ sâu sâu → không gọi AI; màn duyệt nêu tín hiệu snapshot.
5. Mở/đóng “Nhận định từ biểu đồ” → có dòng “Phạm vi số liệu”, không phát sinh request AI.

## 6. Tiếp nhận Codex (21/10/2026) — đang thực hiện, chưa nghiệm thu

- Goal tổng **IN_PROGRESS**. Không dùng ước lượng 70% như phép đo.
- T1 chạy lại từ đầu bằng `python3 .../run_codex_regression.py`, mỗi module một process Docker, offline và memory stores;
  giữ source cố định, ghi hash đầu/cuối. Log từng module, `modules.json`, `source-start.json` và bảng đối chiếu
  `comparison.json` ở `codex-regression-20261021/`. Dùng `summarize_codex_regression.py` cập nhật bảng đối chiếu với baseline audit.
  Đây là module isolation, không phải monolithic qualification.
- Đã xác định regression Claude còn chạy khi tiếp nhận và dừng đúng runner/test cũ để tránh chạy chồng. Log cũ giữ nguyên.
  Hai failure của `tests.test_analysis_jobs` trong log cũ là subtest tải `count=5`, `count=10`, **không phải** hai test p95 của T2.
- T2 mới thử nghiệm trên bản sao `/tmp/codex-reliability-t2` trong container, chưa áp source sản phẩm:
  matcher gộp vocabulary giữ kết quả như thuật toán cũ qua 4 test, bao gồm mọi phép gọi matcher trên corpus 240 câu.
  Các benchmark có hậu tố `exploratory` chạy khi regression còn hoạt động, **không được dùng làm SLA hoặc kết luận nguyên nhân**.
  HEAD và các backup `.bak` hiện có không khớp hash source trước phiên audit, nên chưa có baseline trước phiên đáng tin để quy nguyên nhân.
- I13: người dùng chưa có bảng mapping do chủ dữ liệu xác nhận và đồng ý tìm nguồn công khai. Nguồn chính thức + mapping giới hạn
  cho các tên trong mẫu ở [i13-official-reference.json](i13-official-reference.json). Không đổi dữ liệu, schema, phạm vi query hay điểm chất lượng.
  Mẫu txt ghi tổng 19 nhưng chỉ có 14 dòng chi tiết: không công bố đã phân loại đủ 19. Các cặp khớp sáp nhập chỉ là “phù hợp với sáp nhập”,
  không xác nhận vị trí cửa hàng; tên thương mại không phải địa chỉ.

### Điều chỉnh môi trường T1

Lượt đầu trong `codex-regression-20261021/` dừng sau 15 module hoàn tất (598 test, source chưa đổi): hai subtest tải job timeout.
Kiểm tra Docker cho thấy API phục vụ chỉ có **0,5 CPU / 1 GiB RAM**. Giữ nguyên receipt này; không coi đó là regression đầy đủ hay
quy lỗi cho source khi chưa có control. Chuyển sang container `avengers_reliability_offline_codex`, cùng image ID, **network none**,
**2 CPU / 1,5 GiB RAM**, source mount read-only, output tạm writable. Chạy lại toàn bộ từ đầu, không đổi assertions/timeouts.
Receipt nghiệm thu T1 mới ở `codex-regression-isolated-20261021/`, có `environment.json` để công bố chính xác điều kiện chạy.
Lệnh mặc định runner/summarizer hiện trỏ tới lượt isolated này. API localhost giữ nguyên tài nguyên và cấu hình.

### Sự cố đăng nhập trong phiên Codex

Người dùng báo login treo ở `localhost:8501`. Đã tạm pause container test; API phục vụ vẫn timeout readiness sau 12 giây,
Docker ghi `unhealthy` và `OOMKilled=true` (chưa xác định thời điểm/root cause của cờ OOM). Không có sửa code sản phẩm/auth trong phiên
đến thời điểm này. Vì lượt đầu chạy trong container phục vụ, chưa loại trừ ảnh hưởng tài nguyên từ lượt đó.
Restart **riêng** `avengers_analytics_api`, không đổi credentials/config/data: health 200 (16 ms), readiness 200 (97 ms),
Playwright submit form tại **localhost:8501** login 200, form biến mất, vào workspace trong 1.335 ms.
Bằng chứng: `codex-login-recovered.json`, `codex-login-recovered.png` (chỉ ảnh sau đăng nhập, không mật khẩu/token).
Người dùng đã xác nhận vào được và yêu cầu tiếp tục PLAN. Tiếp tục chỉ trong container test offline riêng.
Lượt T1 bị pause sau 55 module hoàn tất; module đang chạy lúc pause phải được recheck trước khi tính kết quả cuối.

### Fixture của container isolated

`/app/evaluation` tmpfs đã che 4 fixture `one_click_captured_*.json`, gây 5 `FileNotFoundError` ở `test_one_click_semantics`.
Đã seed đúng 4 fixture từ source vào tmpfs (source không đổi). Giữ log đỏ gốc và phải recheck module sau lượt chính;
không coi các lỗi này là source regression hay tự đánh dấu pass khi chưa chạy lại.

### T1 đã chốt trước các sửa sản phẩm kế tiếp

`codex-regression-isolated-20261021/comparison.json`: **101/101 module, 1.639 testsRun, 2 failures + 7 errors/subtest errors**,
toàn bộ failed/error IDs còn lại khớp baseline audit; **0 lỗi mới**. `test_one_click_semantics` recheck 14/14;
`test_v32_mission_reliability` (bị pause) recheck 43/43; không cộng đôi rechecks. `source-drift.json` của cả hai lượt đều `[]`,
hash đầu lượt recheck khớp hash lượt chính. `test_analysis_jobs` 12/12 và cả hai test p95 đều xanh trên source hiện tại.
Không có sửa source sản phẩm để làm xanh. Các lỗi baseline vẫn còn: comparison 4E, natural 1E, dashboards 1F+2E, capability fixture 1F.
Đây là qualification theo module isolation trên container có tài nguyên công bố, **không phải all-green hoặc monolithic qualification**.

### T2 đối chứng quota CPU, không sửa source

Đo khi regression đã kết thúc, mỗi lần 33 case × 12 = 396 request, cold init tách riêng:

| Container test CPU | warm p50 | warm p95 | Receipt |
|---|---:|---:|---|
| 2 CPU | 7,64 ms | 17,86 ms | `codex-t2-preflight-2cpu.json` |
| 0,5 CPU | 7,84 ms | 60,01 ms | `codex-t2-preflight-half-cpu.json` |
| Trở lại 2 CPU | 7,66 ms | 18,10 ms | `codex-t2-preflight-2cpu-control.json` |

Cùng source và corpus, không regression/provider song song; chỉ đổi quota của container test offline, không đổi API phục vụ.
Kết quả tái hiện p95 ~60 ms khi quota bằng API hiện tại (0,5 CPU). Hai test p95 đã pass trong lượt T1 2 CPU.
Đây là bằng chứng tác động quota trong môi trường hiện tại, **không xác nhận source trước phiên giống hiện tại**:
HEAD/backup không khớp hash baseline audit nên không đủ chứng cứ quy nguyên nhân thay đổi giữa các phiên.
Không áp prototype matcher vào source vì chưa có bằng chứng cần sửa nghĩa/thuật toán để qua gate trong môi trường test đủ tài nguyên.
API 0,5 CPU vẫn có giới hạn dưới tải dồn; không công bố SLA 50 ms cho cấu hình đó.

### T3 — campaign mới và các lỗi phát hiện sau T1

Campaign `../ai-system-audit-20261021/codex-t3-live-20261021.json`: 12 ca, 10 physical sends, 8 completed, 2 Risk partial,
1 unsupported, 1 internal. Bottom 5 đối chiếu mọi view phụ = **1.071.000đ**; HCM overview giữ HCM ở mọi query.
Không suy completed là semantic pass. Đã bổ sung `--semantic-evidence` để giữ facts/rows/scope, không cộng các rates/averages trong summary.

- Lỗi serialization repair: `coordinated_dimensions` là list các cặp, bộ đóng gói cũ gọi `.items()` như dict → AttributeError.
  `t3-repair-red-before.log` tái hiện; serializer chung giữ list/scalar, bỏ lexical spans của dict, không đổi budgets.
- Ba replay `codex-t3-multi-replay-1..3`: completed sai cohort, completed đúng, provider_timeout (7 sends).
  Đã GET lại artifact ca sai vào `t3-wrong-repaired-shape.json`: dependent goal thành ranking thứ hai trên city/store/payment.
- Lỗi normalization chỉ chạy primary: đưa cohort/coordination normalization về mọi candidate sau repair; tăng policy `.10`.
  `t3-cohort-repair-red-before.log` → `t3-cohort-repair-green-after.log` **31/31**.
- Ba replay `codex-t3-cohort-repair-replay-1..3`: timeout, completed đúng cohort, bị chặn `untargeted_field_changed` (0 SQL), 6 sends.
  **T3/G10 chưa đạt**. Tổng T3 = **23 sends** (10+7+6), giữ cả attempts thất bại, không retry tiếp cùng source.

### T4 — clock snapshot và budget hợp đồng server

`test_reliability_codex_20261021.RiskSnapshotClockTests`: snapshot được yêu cầu clock hiện trạng có nhãn;
chỉ marker server sau `validate_guided` mới cấp quyền này. Resolver, query service, UI guard và anchor verifier dùng chung phép kiểm;
mọi signal lịch sử giữ kỳ, các mission khác vẫn bị I10 chặn khi đòi snapshot lịch sử.
Test đỏ: `t4-current-red-valid.log` (`approval_required`). Kiểm với rich fixture đủ nguồn delivery (fixture tối giản không có delivery).
`t4-related-regression-final.log` **90/90**.

Live đầu (`codex-t4-risk-*`) còn capacity: hợp đồng có 10 core operations/totals, catalog Risk cap **12**, physical QueryBudget lấy
generic operations **8** → 19 attempts cho 20 lượt dry-run/execute. Thử giới hạn planner 8 làm mất core views, đã bỏ thay đổi đó và giữ log.
Test đỏ chính xác: `t4-governed-budget-red-before.log` (19 < 23).
Adapter admission mới dùng cùng catalog cap cho mission server đã xác thực (`guided_mission_id`); generic model contract vẫn 8,
row/byte/fetch limits giữ nguyên; budget không đổi sau khi execution bắt đầu. Policy `.13`.
`t4-governed-budget-related-final.log`: **112/112** (clock, authority, mission/input, QueryBudget/observability).
Live `codex-t4-budget-fixed-risk-edited.json` và `codex-t4-budget-fixed-risk-explicit-scope.json`: **completed**, 0 physical sends,
10 logical queries mỗi ca. Đã kiểm tất cả queries giữ HCM, historical giữ 01–30/09, snapshot all_time và chart có “(hiện trạng)”. T4 đạt ca live mục tiêu.

### T5–T8 — kiểm tiếp trong container riêng

T5: `t5-rollups-red-before.log` (12 subfailures) → `t5-rollups-controls-attempt-2.log` **39/39**.
Compiler dùng tử/mẫu additive cùng source/grain/clock/business filters/null policy rồi thay aggregate AST trong công thức catalog;
không cộng tỷ lệ hay trung bình nhóm. AOV khai báo revenue/valid_order_count cùng quần thể. AVG chưa có cặp chứng minh vẫn là benchmark.
Oracle tính trực tiếp từ đơn hàng và đọc full immutable artifact (transport preview 50 dòng). Policy `.14`.

T6: `t6-narrative-red-valid.log` tái hiện hai lỗi thực (scope_ref bỏ qua, export nhận fact sai).
`t6-narrative-controls-attempt-1.log` **54/54**, `t6-mutations-attempt-1.log` **4/4** (7 mutations trong một test).
Facts/summary/conclusion bind query/metric/unit; evidence thêm population_scope và cohort_scope_query_id, statement nêu cohort/benchmark.
Publication/export chặn factual verification thất bại. **Chưa có render Word**: container test thiếu LibreOffice/Poppler, chưa đủ bằng chứng QA hình thức.

T7: `t7-structured-scope-red-before.log` (READY sai ở 2 ca) → `t7-scope-controls-attempt-1.log` **53/53**.
Structured scope dùng SemanticTools.resolve(allow_fallback=True), typing chỉ đọc owner/access/catalog/policy cache;
explicit resolve-input mới lookup có đếm. Không gọi AI. Policy `.15`. Cần kiểm HTTP/live ở gate cuối.

T8: nguồn chính thức trong `i13-official-reference.json` chỉ là tham khảo, không xác nhận địa chỉ cửa hàng.
`t8-geography-warning-red-before.log` tái hiện thiếu cảnh báo; thêm limitation metadata cho city, đưa vào verifier/kết luận.
Không sửa dữ liệu/schema, không thêm heuristic vào điểm. Chưa có mapping được chủ dữ liệu xác nhận; không tuyên bố I13 đã sửa nguồn.

### Checkpoint 22/10 Codex — source policy .18

- Regression `codex-regression-final-20261022/` đã **dừng chủ động ở 31 module/756 tests** để sửa góc cạnh rare5 trước final;
  chỉ có 4E comparison baseline ở các module đã xong. Đây là intermediate receipt, không dùng làm regression cuối.
- T7 bổ sung `t7-five-rare-red-before.log`: member thứ5 bị chặn vì helper dùng cap4. Shared `selected_scope_lookup_allowance`
  giữ nguyên policy execution (base + tối đa16 selected-member lookups); pipeline tái dùng proof server, không tin browser.
  `t7-five-rare-green-controls-2.log`: **46/46**, policy .16.
- T6 browser phát hiện KPI compare cũ dùng row evidence_ref, verifier canonical không kiểm được. Guard mới đã chặn đúng.
  `t6-compare-cards-red-before.log` → `t6-compare-cards-green-controls-final.log`: **101/101**.
  KPI A/B/gap/% có canonical evidence_id và value_field; verifier tính lại từ fact cùng query/metric/population. Policy .17.
- `codex-semantic-final.json`: eval offline **146/146**; `codex-web-typecheck-final.log` xanh, `codex-web-utils-final.log` **224/224**.
- `codex-browser-final-v3/receipt.json`: **12/12 real served UI + API**, 3 depths × ranking/compare/risk/trend, mở/đóng **59 chart explanations**,
  **0 provider calls / 0 analytic requests phát sinh khi mở/đóng**, resize mobile không overflow. Structured-scope HTTP negative/rare5/cache có receipt riêng.
  Compare/trend còn quality partially_verified do coverage được công bố; critical evidence/semantic/result checks đều passed. Không đổi partially thành verified.
  V1 dừng ở compare publication guard, V2 dừng vì harness dùng sai label deep; giữ các log/ảnh, không tính failed selector là lỗi source.
- `codex-docx-export-content-final.json`: endpoint export HTTP200, XML khớp summary/conclusion/findings/cohort/geography warning, không lưu DB.
  **Content only**, chưa render visual vì không có bundled rendering runtime. Không giao một DOCX chưa render làm thành phẩm.
- `codex-served-bundle-final.json`: hash JS/CSS thật sau rebuild, API healthy. Backend sau đó restart để nạp policy18; cần refresh manifest cuối.
- Campaign `codex-final-policy17-live-20261022.json`: **12 cases, 10 completed, 1 unsupported incompatible clock, 1 semantic repair failure, 10 physical sends**.
  Không timeout. Scope HCM giữ trong mọi query của các case scoped; Bottom5 và risk-followup phải soi số tiếp.
- Multi failure root: req_2 malformed filters; repair đổi shape ngoài target khi chưa canonicalize. `t3-canonical-repair-red-before.log`
  → `t3-canonical-repair-green-controls-attempt1.log` **50/50**, gồm control đổi kỳ vẫn chặn. Policy .18 chuẩn hóa hai shape bằng cùng cohort rule trước frozen-field guard.
  Ba live replays đang chạy ở `codex-policy18-multi-replay-1..3.json`, cùng campaign đã dùng10 sends, trần48 có `--physical-spent` admission.
- H02 acceptance seed thử thực hiện, chưa đạt: `codex-h02-distinct-fixture-fixed.log` bị explicit_metrics_missing(customer_count/purchasing_customer_count)
  trước SQL. Chưa coi H02 pass và chưa chứng minh distinct cohort. Harness ở `codex_holdout_cohorts.py`; raw fixture names đã sửa voucher→promotion.

Goal **IN_PROGRESS**, G10/T9 **NOT_YET_QUALIFIED**. Tiếp: soi ba replay .18 → independent live arithmetic → còn H02/matrix → final backend fresh processes
(không song song Gemini), mock/browser checks, refresh manifests/checkpoints. Chưa dùng receipt cũ để chứng nhận source mới.

### Checkpoint tiếp T9 — policy .24, verifier 2.8.6

- Policy18 multi replays: 2 completed đúng cohort, 1 failed derived_features; tổng campaign14 sends. Optional-feature repair trên malformed/unaccepted sibling
  chỉ được bỏ model additions không có user anchors; explicit features và kỳ vẫn chặn. `t3-optional-feature-repair-green-controls.log` **52/52**.
- H02 thật sự đỏ sau sửa annotation harness (cả hai là requested): `codex-h02-requested-goal-valid.log` không có cohort_scope_query_id.
  Compiler distinct mới join raw fact population với ranking unique-key trước COUNT(DISTINCT), giữ READ ONLY/SQL allowlist nguyên vẹn.
  EXISTS prototype bị AST allowlist chặn, đã thay bằng inner join key-unique, **không nới allowlist**. `t9-h01-h02-cohort-properties-final.log` **2/2**:
  H01 selected product order lines=1400, H02 một khách chung hai voucher=1. `t9-distinct-cohort-related.log` **56/56**.
- Alias overlap `số khách`/`khách đã mua`: `t9-qualified-overlap-red-before.log` → `t9-qualified-overlap-green-controls.log` **50/50**,
  metric qualification dùng chung preflight/anchors, không yêu cầu thêm customer_count ngoài ý muốn.
- M20/A10 independent national scalar cạnh branch trong Bottom5: test đỏ `t9-independent-national-with-cohort-red-before.log`.
  Back-reference giờ mang goal_dimensions/goal_metrics của clause; không thu hẹp scalar toàn quốc. `t9-cohort-properties-clause-binding.log` **4/4**,
  có national101520/cohort1520 và outside/inside/membership metamorphic values+facts.
- Mutation export: `t9-chart-full-mutations-red-before.log` (scope_ref, unit, chart fact/caveat/stale reference). Verifier replays toàn block insight,
  scope_ref phải khớp query. `publication_checks.chart_contract` là cổng riêng, không đổi weights/thang điểm; coverage thiếu/NULL vẫn công bố đúng giới hạn.
  `t9-publication-mutations-controls-v2.log` **14/14**. `t9-related-policy23-final.log` **44/44**.
- Independent reader SELECTs (`codex_warehouse_oracles.py`) trong READ ONLY REPEATABLE READ, timeout12s, rollback:
  `codex-independent-warehouse-oracles.json`: Bottom5=1071000 / **12 valid orders**, Top5 cancellation=8/12, HCM revenue154577000/1364valid.
  Oracle epoch khác browserv3 epoch; số khớp **chưa chứng minh cùng generation**. Không bỏ guard epoch.
- Oracle phát hiện map AOV frontend dùng **16 all orders** ⇒ 66938đ, sai định nghĩa. `t9-map-aov-red-before.log` →
  `t9-map-aov-green-web-controls.log` **225/225**, typecheck xanh. Dùng valid_orders; thiếu denominator trả null.
  Đã rebuild localhost. `codex-browser-final-v4/receipt.json` **12/12**, 59 explanations0AI, mọi độ sâu ranking hiển thị **89250đ** đúng 1071000/12.
- Policy23 multi replays: 1 completed, 2 failed frozen metric_ids/analysis_kind (root vẫn malformed filters), tổng campaign **19/48 physical sends**.
  Không retry thêm cùng source. Thêm cohort_contract vào primary+repair provider payload để nêu rõ back-reference không phải literal filter;
  thêm bounded draft_shapes (catalog IDs/type, không raw values) trước schema parse để chẩn đoán được shape lỗi. Policy **.24**.
  `t3-provider-cohort-contract-red-before.log` đỏ đúng thiếu contract; controls đang chạy `t3-provider-cohort-contract-green-controls.log`.

Goal vẫn IN_PROGRESS. Tiếp: kiểm controls .24 + sanitized diagnostics test mới; restart API→health200; đo bounded multi trên source mới;
final12 semantic campaign với `--physical-spent 19` (cộng sends thực replay), rồi **full regression mới từ đầu** trên source freeze, mạng none/từng process.
Kết quả cũ/intermediate không chứng nhận source .24. Cần matrix54 với coverage thật, oracle epoch proof, DOCX visual render vẫn chưa có runtime.


### Checkpoint qualification policy .27 — 22/10 Codex

- Kiểm độc lập policy24 phát hiện **2/3 completed sai scope**: duplicate equivalent rankings làm binder bỏ qua cohort;
  một shape khác thêm scalar national ngoài câu hỏi. Không tính completed là PASS. Campaign12 policy24 đã dừng sau5 receipts;
  job cuối đang chạy đã hoàn thành và lưu `policy24-interrupted-campaign-last-job.json`. Tổng repair campaign lúc đó27 sends.
- `t3-policy25-red.log` → selection identity, default cohort scalar và independent-clause scalar rules. Bảo vệ ambiguity:
  hai cohort thật sự khác nhau trả `ranking_scope_ambiguous`, không publish whole-scope ngầm.
  `t3-policy25-related-final.log`: **58/58**; `t9-policy25-independent-controls.log`: **4/4**.
- Policy25 replay1 đúng, replay2 blocked trước SQL (2 sends, missing explicit store/payment); campaign30.
  Thêm control model gắn explicit axes thành optional; `t3-dependent-role-red.log` → `t3-policy26-role-controls.log` **35/35**.
  Đây là reproduction boundary, không tuyên bố raw provider body của failed25 được lưu đầy đủ.
  Bounded draft diagnostics giờ giữ supporting_for/availability/ranking catalog-only, không raw filter values.
- Policy26 multi **3/3 first-pass, đúng ngữ nghĩa**; campaign33. Final12 source26 completed11+unsupported1,
  nhưng semantic review chỉ **11/12**, compare thêm store_revenue ngoài yêu cầu; campaign42. Giữ receipt thất bại nguyên vẹn.
- `t3-compare-companion-red.log`: city + payment variants. Shared canonical metric locks collapse unasked siblings
  khi canonical metric đã hiện diện và cùng shape expressible; lexical explicit specialized companion vẫn giữ.
  `t3-policy27-canonical-controls-final.log` **25/25**. Policy **.27**.
  Compare replay + multi3 trên .27 **4/4 first-pass đúng**, kết thúc repair campaign **46/48 physical sends**.
- Campaign qualification RIÊNG được đóng băng đúng12 câu, tối đa36 sends (receipt runner reserves12/48), không thêm prompt/không retry full campaign:
  `codex-qualification-policy27-live-20261022-manifest.json`, receipt trong audit cùng tên.
  **12/12 semantic outcomes đúng**, 11completed +1unsupported incompatible clock; guided2 dùng0AI.
  Positive AI9: **8 first-pass +1 repaired =88.89% first-pass**, **9/9 after bounded repair**; physical10, không timeout.
  Mục tiêu >=95% first-pass **CHƯA ĐẠT** trên tập hữu hạn này; không đổi denominator hoặc bỏ compare repaired.
  Repair campaign46 + qualification10 =56 sends giữa hai campaign, không ghi lại lịch sử thành0.
- Independent SELECTs mới `codex-qualification-policy27-warehouse-oracles.json` và full report captures:
  `codex-qualification-policy27-epoch-comparison.json`: **5/5 same observed source generations** cho risk-followup,
  overview HCM, compare, Bottom5, multi-clause. Fresh semantic/arithmetic review **12/12**.
  Đây là observed replica-generation consistency, không tuyên bố source-wide transactional completeness.

Goal vẫn **IN_PROGRESS**; G10 first-pass gate **NOT_QUALIFIED**. Full regression source27, matrix attribution,
final browser/bundle/export verification đang tiếp tục; chưa dùng các receipts intermediate để đóng GOALS.


### T9 mở rộng source .28 — matrix và export

- `codex-family-matrix-policy27.log`: ma trận độc lập đã tìm ra lỗi thật guided distinct
  “Số khách mua hàng tháng 9” bị lexical cadence `hàng tháng` cắt qua metric boundary. Snapshot `stock_quantity` trong harness
  không được capability hiện tại quảng bá; đổi sang `paused_sale_positions` đúng registry, giữ attempt cũ.
  Empty COUNT có thể trả typed insufficient_data thay vì success0; đây là outcome data-limited có khai báo.
- `t9-cadence-boundary-red.log` → metric-token/cadence overlap exclusion chung, giữ control “mua hàng hàng tháng”;
  `t9-policy28-cadence-controls.log` **49/49**, gồm corpus240/holdout60. Policy **.28**.
  `codex-family-matrix-policy28.json` **63/63**: sum/count/distinct/average/order ratio/staff ratio/snapshot ×3depths ×rich/sparse/empty,
  raw-record oracle,0provider, typed no_data riêng; đây là7 families hữu hạn, chưa chứng minh mọi metric/preset quảng bá.
- `t9-h04-h05-h08-policy28-final.log` **3/3**: delivery worst-low raw terminal oracle,
  staff miền Nam raw weighted shifts cả3depths, exclusion trước TopN và dependent scopes.
  H08 attempt đầu lỗi HARNESS dùng `ne` ngoài filter schema; sửa fixture thành governed IN complement, không nới schema/guards.
- H06/export preview phát hiện lỗi thật: Word mô tả len(preview) là tổng hợp lệ trong khi chỉ in15 dòng.
  `t9-word-preview-red.log` → dùng total_rows server và nêu rõ displayed/total + bảng trích;
  `t9-word-preview-green-controls.log` **25/25**. Không thay số liệu/claim/artifact, chưa có visual render.
- Regression `codex-regression-policy28-final/` dừng ở10modules579tests để sửa export; KHÔNG phải final.
  Full source cố định mới: `codex-regression-policy28-word-final/`, container dùng chính image serving,
  networknone,2CPU/1.5GiB,readonly source, mỗi module processriêng. Đang chạy; chưa coi xanh trước kết quả.
- Browser source27 **12/12**,0AI/59explanations; source28 đang chạy receipts riêng.
- Playwright all UI attempt1: **69pass/8fail/2skip**. WebGL probe headlessfalse, SwiftShadertrue; opt-in PW_SOFTWARE_WEBGL
  chỉ trong harness, real MapLibre tests giữ nguyên, SVG fallback test vẫn chạy.
  Ba assertions lỗi thời được đối chiếu DOM/current contracts (preflight trước Enter, quantified source proof0/2,
  empty SeriesBar message); tiny pickup bar được kiểm complete accessible title và giá trị3.
  Attempt2: **76pass/1fail/2skip**, remaining resize assertion đọc layout trước ResizeObserver; recheck dùng polling cùng điều kiện stack.
  Không sửa source UI sản phẩm hoặc hạ điều kiện cohort/security để làm các test xanh.


### T9 chốt lexical scope source .29

- Word HTTP source28 `codex-docx-export-policy28-content-final.json`:200, summary/conclusion/findings/cohort/geography/preview label khớp;
  chỉ content QA, không tạo DOCX bàn giao chưa render. UI thật source28 **12/12**,59 explanations0AI/0newrequests.
- Playwright attempt2 **76pass/1fail/2skip**: resize900px đọc boundingBox trước ResizeObserver; polling giữ cùng điều kiện xếp dọc.
  `codex-web-e2e-policy28-recheck.log` **10/10** related layouts. Union kết quả:77distinct tests passed,2optional tests skipped;
  chưa có một full rerun all-green trên harness sửa cuối. Typecheck và webutils225/225 pass.
- Oracle bổ sung M16/M21 phát hiện lexical bug repeated references trước dấu chấm phẩy.
  `t9-policy28-independent-final.log` bị chặn bởi “này” dù câu hợp lệ, không xuất sai số liệu.
  `t9-repeated-cohort-boundaries-red.log` → anchors nhận back-reference theo raw punctuation segments;
  input integrity dùng lại anchors để tránh hai luật bất nhất, giữ unknown “Trên Mây”/“Này Khác” bị chặn.
  Input policy **1.2.2**, plan policy **.29**. `t9-policy29-reference-controls.log` **63/63**.
- `t9-policy29-independent-final.log` **5/5**: A–F all3depths, outside/inside/membership metamorphic,
  national101520 riêng, exactselectedpayments COD100/QR700/WALLET320/VNPAY400, daily700/300/520,
  mixedrevenue1520/allorders8/AOV1520÷6. Đây là raw-record numerical qualification, không live LLM.
- Regression source28-word dừng22modules658tests (4E comparison baseline), giữ nguyên receipts; KHÔNG là final.
  Final mới duy nhất đang chạy: `codex-regression-policy29-final/` trên source cố định.
  Ma trận attribution54: `codex_acceptance_matrix_review.py`/`codex-acceptance-matrix-policy29.json`; partial gaps không được nâng thànhpass.


### Nghiệm thu bổ sung source29 trong khi final regression chạy

- Eval `codex-semantic-policy29-final.json`:146cases, dataseterrors0/failures0; V33 contracts33/33, V34deterministic120/120.
  Các denominator riêng, không cộng chồng thành một accuracy hoặc gọi đây là chất lượng hiểu của model.
- `codex-authoritative-city-inventory.json`:1SELECT DISTINCT READONLY/rollback,55labels nguồn.
  `t9-all55-cities-policy29-final.json`/`.log`: **55/55** preflight +executedfixture, mỗi tỉnh một fixture137đ,
  mọi querygiữ exactcityfilter,0AI. Đây làfixture bằng source-label proof; không phải55 livewarehouse endtoend reports.
- `t9-identity-holdouts-policy29.log` **2/2** H03NFC/NFD +storeIDthật từoracle không cósuggestions, M10hai key khác city cùnglabel
  vẫn ra137/223 riêng. Source IDs chỉ làm khóa fixture, không thay dữ liệu nguồn.
- `t9-ties-actual-empty-policy29.log` **1/1**, tieA/B stable, Bottom10chỉ6observedcities, Gkhông bịdựng0, empty honest no_data.
- `t9-risk-equivalence-policy29.log` **1/1**: cả6directRisk values =deepreport requested values cùngscopeHCM,
  clocks/threshold/operator khớp registry; snapshotall_time, historicalSeptember,0AI.
- Browsercurrent `codex-browser-policy29-final/receipt.json`: **12/12**,59explanations,0AI/0newanalyticrequests khi mở/đóng.
  `codex-refinement-http-policy29-final.json`: **2/2**, reportmới→validrefinement200/submittrue,
  unknownscope200/submitfalse; không schema409 giả.
- `codex-docx-export-policy29-content-final.json`:HTTP200,6contentassertionspass,save_to_dbfalse,visualNOT_RUN.
- Accountingnote `codex-qualification-policy27-accounting-note.json`: actualqualification10sends, priorqualification0;
  legacy --physical-spent12 trong command chỉ là reservedadmissionoffset để hard48 thành actual36, KHÔNG phải12sends.
  Runner đã có --physical-limit36 để không dùng offset ở campaign sau. Receipts cũ không sửa; repair46 +qualification10 =56actualgiữa2campaign.
- FullUI source29 attempt1:76pass/1fail/2skip, còn mapinit5s trênSwiftShader. NativeMapLibre bắtbuộc vẫn giữ;
  limitinit15s → `codex-web-e2e-policy29-map-recheck.log` **9/9** (3tests×3replays), đang chạy allUIreceipts mới.


### Kết quả cuối lượt Codex source29

**Full regression đã xong**, không còn chạy nền: `codex-regression-policy29-final/comparison.json`.
105/105modules,1676tests,2F+3E tất cảbaseline,0newfailureIDs,source-drift[]. Comparison_score4errors cũ đã pass.
Test load1/5/10 và hai p95 tests pass trong container2CPU/1.5GiB; không suy SLA cho serving0.5CPU.
Playwright một fullrun cuối `codex-web-e2e-policy29-all-final.log`: **77pass/2optionalSkip**.
Browsercurrent29 **12/12**,59explanations0newrequests; artifactreview59charts136keyfacts pass.
`codex-policy29-immediate-ranked-oracle-review.json`: Bottom5fresh0AI đúngoracle vàsameobservedgenerations.
Các browsercaptures trước đó khácgeneration sooracle sau (`codex-policy29-final-browser-epoch-check.json`) vẫn **INCOMPARABLE**, không đổi guard.
`codex-refinement-http-policy29-final.json`2/2, `codex-docx-export-policy29-content-final.json`content6/6,visualNOT_RUN.

Oracle A–F cuối `t9-policy29-independent-all-final.log` **6/6**, gồmnational101520→151520 khiF+50000,
branchcohort vẫn1520, payment/day/allorders/AOV, ties/actual<N/empty, metamorphic.
All55sourcecitymembers và H03/M10fixture pass; riskdirect/deep6signals value/clock/threshold/operator khớp.
Ma trận54 cuối: **40PASS_FINITE_ASSERTIONS /14PARTIAL /0pending**, xemreceipt từngassertion, không gọi54/54pass.
Sourcefinalmanifest426files vàfullsuite source-drift đều[]; servingbundlemanifesthashcurrent, APIhealthy.
Goal **IN_PROGRESS / NOT_QUALIFIED**: firstpasslive88.89%<95%,14partialassertions, Wordvisualruntime thiếu,
I13 chưadata-owner-mapping. Báo cáo tự chứa: `../../AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md`.


## Nghiệm thu cuối policy33 — DONE (22/10/2026)

- Source sản phẩm đóng băng `.33`/input1.2.5/verifier2.8.8; 432filehashes khớp manifest test-updated, productdrift[]. Test-only delta V23 có before/after hashes và attempts rõ ràng.
- Full107module1704unique tests có1obsolete cosmetic assertion; lần fixture đầu dùng nhầm modern verifier cho legacyreport, giữ StopIteration. Lần cuối toànmodule24/24 đạt với actual scoped evidence positive/unsupported causal negative. `codex-regression-policy33-final/effective-final.json` true; không tuyên bố originalfullallgreen hay monolithic.
- Offline external hoàn tất:146/33/120 denominators riêng; authored120;448outcomes(429compile19missingcompare); domains234; families63; cities55. AF/identity initialmissingtmpfixture được reseed immutable rồi recheck nguyên assertions; lịch sử giữ nguyên.
- Web231/typecheck;95unique browserpass2optional skip, giữ1WebGL startup timeout +unchanged module idle recheck. Extra realpipeline ranking18/18. Servedv2 đủ12/12,59charts136facts,52fullartifactpages; initial10/12harnessfails giữ nguyên. RefinementHTTP3/3; saved/reopen/Word cùngrevision.
- Native Wordfinal 10cohort+2preview pages đã xem; renderPNG/PDF/DOCXhashes ởcodex-word-policy33-final-native. ExactHTTPcontent6/6 kiểm riêng; không nói exactHTTPfileđãnative-render.
- Paid action lần đầu autoreview từ chối trướcprocess,0sends. User cho phép cụ thể fixed12/cost/destination/max36; receiptcodex-live-policy33-authorization.json. Chạycampaign đúng1lần sau regressionidle:11completed1unsupported đúng,9/9positiveAI first-pass,2deterministic0AI,0repair0timeout,9sends. Reported31471input1321outputtokens; không suy bill. Ledger46+10+9=65 cho3namedcampaigns, không gọi lifetimeallbilling.
- Live reviewer initial11/12 do chỉ accepts evidence_id, chưa hỗ trợ forecast_ref. V2 KeyError tênbacktestfield; V3 đã kiểm riêng modelcùngrevision/provenance/horizon/fitperiod/intervals/MAEimprovement/statementnumbers,12/12đạt. Không sửa sản phẩm/gọi thêm AI. Receipt+logs retained. 51charts117facts/34fullartifactpages. 11report có orders/directory matching before/after oracle sameobservedgeneration (risk-followup usesafter); không claim raw6risk sources/upstream completeness.
- Ma trận54/54finiteassertions; finalsource/bundle/APIhealthy/OOMfalse. `codex-qualification-policy33-final.json` goalDONE. MDnghiệmthu và GOALS/qualification/handoff đã cập nhật. I13warning/dataownerunverified, externaltile/optionalcatalogUI skips,2CPU latency/monolithic/finiteknowncorpus limits ghi rõ. Không commit/push/sửa source data/schema/quyền.
