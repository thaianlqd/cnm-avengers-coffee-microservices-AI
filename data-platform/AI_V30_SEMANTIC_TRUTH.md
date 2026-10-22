# Data Platform AI V3.0 — Semantic truth, fail-fast, dự báo

Ngày: 15/10/2026 · Nhánh: `branch_thaian` · Phạm vi: `data-platform/` (analytics-api, web-ui, data-sync).
Prompt gốc bị cắt sau mục 91 ("Implement in phases…"); các giai đoạn dưới đây do người thực hiện tự chia.

## 1. Bản đồ kiến trúc (trước khi sửa)
- HTTP: `routers/ai.py` — `/analysis-jobs` (một lần bấm, mặc định UI), `/propose-plan` + `/generate-executive-report` (hai bước).
- Điều phối: `services/agent_pipeline.py::AnalysisPipeline` → planner production `services/hybrid_analyst_planner.py`
  (kế thừa `one_shot_planner.py`; `OneShotPlanner`/`DataAnalystAgent` chỉ còn dùng qua test lưu trữ `tests/archive_planner.py`).
- Ngữ nghĩa: `request_anchors.py` (anchor tất định), `semantic_candidate_service.py` (gói ứng viên), `analysis_intent.py` (hợp đồng),
  `analytical_resolver.py` (giải ID/khả năng/phân rã), `analysis_catalog.py` (registry + schema vật lý + join an toàn).
- Thực thi: `analysis_query.py::compile_sql` (sqlglot, alias bảng, allowlist `silver.*`), `query_execution_batch.py`
  (`READ ONLY` + `statement_timeout`), `validate_results`, `dashboard_planner_service.py`, `analysis_quality_service.assess_report`.
- Ngân sách: `provider_budget.py` (tối đa 3 lượt/turn, deadline 28s); lỗi: `analysis_pipeline.safe_failure`, `analysis_issue_service`.

## 2. Hiện trạng đã xác minh (khác/đúng với giả định trong prompt)
| # | Giả định | Kết quả kiểm tra |
|---|---|---|
| 1–2 | Ngân sách ~3 lượt; sửa lỗi tốn nhiều lượt khi không giải được | Đúng. `recovery_progress` có ghi nhưng **không** dùng để dừng |
| 3 | Lỗi ngân sách bị coi là lỗi kết nối provider | Đúng: `provider_call_budget_exceeded` khớp `startswith('provider_')` → "Cần khôi phục kết nối hoặc cấu hình dịch vụ AI" + nút "Lập lại kế hoạch" |
| 5–7 | Catalog lệch dữ liệu; có dữ liệu tỷ lệ giao | Đúng. Profile giao hàng ghi "không có… tỷ lệ thành công"; fact `orders.shipper_delivery` có đủ trạng thái/mốc giờ nhưng **không có view silver** |
| 8 | Gold shipper bị cắt Top-N | Đúng: `spark-jobs/gold_aggregation.py` `head(20)`; cột `failed` đếm `FAILED` (dữ liệu thật: 0 bản ghi) và mẫu số gồm cả chuyến đang xử lý |
| — | Gold dùng cho GenBI? | Không: GenBI chỉ đọc `silver.*`. Rủi ro là ở dashboard và nếu sau này ai đó đăng ký gold làm nguồn metric |

Dữ liệu thật giao hàng: `DELIVERED` 7511, `CANCELLED` 335, `IN_TRANSIT` 2, `CONFIRMED` 1; 288 shipper có chuyến; mart gold 20 dòng.
Theo code order-service: `FAILED` = shipper báo thất bại; `CANCELLED` = chuyến bị hủy do hủy đơn hoặc phân công lại.

## 3. Thay đổi
**Sự thật dữ liệu**
- `data-sync/sync.py`: VIEW `silver.giao_hang` (một dòng/chuyến). Không có địa chỉ, tọa độ, ghi chú, ảnh bằng chứng.
- Catalog: subject `delivery_assignments`; metric `delivery_count`, `delivered_count`, `failed_or_cancelled_delivery_count`,
  `delivery_success_rate` (ratio, 0–100), `avg_delivery_minutes`; dimension `delivery_status`; lens `delivery_success`, `delivery_outcomes`.
  Định nghĩa: **tỷ lệ giao thành công = DELIVERED / (DELIVERED + FAILED + CANCELLED)** theo thời điểm nhận chuyến; chuyến đang xử lý
  không vào mẫu số; caveat: CANCELLED gồm cả hủy đơn/phân công lại.
- `source_scope` cho mọi bảng silver (FULL_FACT/SNAPSHOT) và `presentation_marts` cho 4 mart gold (TOP_N_MART/FILTERED_MART/FULL_AGGREGATE).
- Ngữ nghĩa `ratio` (không cộng được, xử lý như trung bình trong dashboard).

**Kiểm tra registry bằng máy** (`semantic_catalog_validation.py`)
- Từ chối: metric lấy nguồn mart Top-N/đã lọc/chỉ trình bày; mart Top-N đánh dấu an toàn toàn cục hoặc thiếu N; thiếu `source_scope`
  (catalog production); tỷ lệ cộng được hoặc thiếu khoảng giá trị; cột thời gian ngoài nguồn/join trực tiếp; snapshot khai báo lịch sử;
  dự báo không có chuỗi thời gian/không cộng được/tầm vượt 2× lịch sử tối thiểu.
- `registry_drift(catalog)`: metric/dimension/join tham chiếu bảng/cột không còn trong kho → `/api/ai/status.registry_drift`.
- `registry_fingerprint` (chỉ phần ngữ nghĩa) trong diagnostics, provenance báo cáo, capabilities, kết quả eval.

**Fail-fast & lỗi có kiểu**
- Planner: dấu vân tay issue `(requirement, field, code)` — đổi tên ID bịa không tính là tiến triển; dừng khi lặp vân tay hoặc
  output thô trùng; `DATA_ANALYST_MAX_SEMANTIC_REPAIRS` (0–2, mặc định 2, chỉ dùng khi có tiến triển); `provider_call_reasons`
  (`INITIAL_UNDERSTANDING`/`CONTRACT_REPAIR`/`TRANSPORT_RETRY`); `semantic_stop_reason`; `capability_status`.
- Khái niệm không có trong registry → `unsupported_metric` + gợi ý metric liên quan; `decision: unsupported` không cần lý do từ LLM.
- `error_taxonomy.py`: 7 trạng thái của PLAN (+ UNDERSTANDING_FAILURE, SYSTEM_FAILURE), `retryable` chỉ cho lỗi truyền tải tạm thời;
  `provider_call_budget_exceeded` → SEMANTIC_RESOLUTION_FAILED; job one-click lấy trạng thái kết thúc từ taxonomy.

**Dự báo** (`forecast_service.py`)
- LLM chỉ nêu `forecast{horizon, unit}`; resolver kiểm khả năng **trước** mọi lượt sửa/SQL; lịch sử chạy qua compiler/validator sẵn có.
- Ứng viên: naive, seasonal naive, trung bình trượt 3/7, SES, Holt; chọn theo MAE backtest rolling-origin; so với naive; MAE/RMSE/sMAPE
  (bỏ điểm 0/0); khoảng 80% từ sai số backtest. Loại kỳ chưa trọn; điền 0 cho kỳ đã trọn không có dữ liệu; nêu rõ sụt hoạt động.
- Metric dự báo được: `revenue`, `order_count`, `store_revenue`, `store_order_count`, `delivery_count` (ngày ≤31, tuần ≤13, tháng ≤6).

**Truy hồi ngữ cảnh**
- Anchor đơn nghĩa kèm metric cùng subject (id+nhãn); truy hồi không tự tin → danh mục metric nén thay vì 3 domain chọn theo bảng chữ cái.
- Alias quản trị: bỏ value-alias "giao thành công"→lọc DELIVERED (biến tỷ lệ thành 100%); "giao thành công" chuyển sang `non_anchor_aliases`.

**UI** (`web-ui`): retry theo hợp đồng có kiểu; tông thẻ theo trạng thái; mã tham chiếu cho lỗi thực thi; metric liên quan khi không hỗ trợ;
gợi ý câu hỏi sinh từ `/api/ai/capabilities`; `ForecastPanel`.

## 4. Kết quả kiểm chứng
| Hạng mục | Trước | Sau |
|---|---|---|
| analytics-api (`tools.run_tests_v29`) | 754 test, 3 fail + 1 error | 810 test, **cùng 4 lỗi cũ**, 0 lỗi mới |
| web-ui node test | 115, 1 fail | 124, cùng 1 lỗi cũ; typecheck + build đạt |
| data-sync | — | 3/3 |
| Eval offline (113 ca) | — | dữ liệu 0 lỗi; truy hồi domain/metric 97,7%; hồi quy shipper 6/6; biên dịch L2 83/83; từ chối dự báo 3/3 |
| Live smoke (12 ca, Gemini thật) | — | 11/12; **12 lượt gọi cho 12 câu**; median/p95 lượt (câu hỗ trợ) = 1/1; 0 vòng sửa vô ích |
| E2E shipper (live, kho thật) | — | 95,73% = oracle độc lập 7511/7846; Top-20 mart sẽ cho 96,68% trên 1717 chuyến |

Ca live chưa đạt: "Chỉ số hạnh phúc của khách hàng" → hỏi lại metric (kèm lựa chọn được hỗ trợ) thay vì "không hỗ trợ".
Bộ live đầy đủ **chưa chạy** (tránh tiêu quota dùng chung); lệnh: `python -m evals.semantic_eval_v30 --mode live --cases all --max-calls 250`.

## 5. Review độc lập (chỉ đọc) và chỉnh sửa sau review
Đã sửa (kèm test hồi quy):
- Dự báo: `seasonal_naive`/trung bình trượt bỏ qua origin backtest ngắn hơn mùa/cửa sổ (trước: IndexError với 24 tháng, tầm 6;
  MA bị phạt sai); chuỗi lịch sử tôn trọng cửa sổ đã duyệt (bỏ kỳ đầu bị cắt, không điền 0 quá `period.end`); cửa sổ kết thúc trước
  kỳ hoàn tất gần nhất → `forecast_insufficient_history` thay vì dự báo xuyên khoảng trống.
- Thiếu lịch sử cho một dự báo chỉ đánh dấu dự báo đó `status: insufficient_history` khi còn yêu cầu khác (do người dùng hỏi) trả lời
  được; câu chỉ hỏi dự báo vẫn là INSUFFICIENT_DATA. UI hiện thẻ "Chưa đủ lịch sử…".
- Transport tự retry bên trong → mã riêng `provider_transport_nested` (lỗi provider, retry được), không còn bị gắn "không tiến triển".
- Chỉ kết luận "chỉ số chưa hỗ trợ" sau ít nhất một lượt sửa vẫn trả ID lạ; lượt đầu không sửa được → `semantic_resolution_failed`.
- Sửa được 1 trong 2 ID sai (số ID lạ giảm) được tính là tiến triển.
- `/api/readiness` chỉ trả số lượng + mã drift; chi tiết bảng/cột ghi log `[RegistryDrift]`.
- Thêm trạng thái `PENDING` (mặc định của entity) vào cột/enum giao hàng.

Chưa sửa (ghi nhận): yêu cầu phụ trợ có dự báo không hợp lệ vẫn làm hỏng cả phân tích (fail-fast có chủ đích);
`not_analytical_request` → trạng thái job `unsupported` (UI không ảnh hưởng); env `DATA_ANALYST_MAX_SEMANTIC_REPAIRS` sai chỉ phát hiện
lúc có lỗi ngữ nghĩa; dự báo chưa trừ độ trễ đồng bộ batch; `assess_report` chưa tính lại `forecasts`.

## 6. Quyết định đã tự đưa ra
- Mẫu số tỷ lệ giao gồm CANCELLED (dữ liệu thật: mọi CANCELLED gắn với đơn DA_HUY) và có caveat; có thể đổi trong catalog.
- Ngân sách manifest của planner cũ 10.000 → 12.000 ký tự (thân request vẫn 24.000); ngưỡng chừa trống 1.000 ký tự của một test planner
  cũ hạ về ≥0 (production dùng truy hồi, không gửi cả manifest).
- Cập nhật kỳ vọng các test ghim "3 lượt gọi với cùng output sai" thành 2, và các test ghim nút retry cho lỗi tất định.
- Không sửa `spark-jobs/gold_aggregation.py` (dashboard); khai báo mart là Top-N kèm caveat.

## 7. Rủi ro còn lại / bước tiếp theo
- Mart gold `shipper_performance` vẫn tính `failed`/`success_rate` sai định nghĩa cho dashboard; 6 mart gold khác chưa khai báo phạm vi.
- Câu nối tiếp (follow-up) chỉ kiểm offline; refine live chưa đo. Câu "tb 1 đơn…", "Món nào được đánh giá cao nhất?" còn hụt truy hồi offline.
- Dự báo theo nhóm (theo chi nhánh) chưa hỗ trợ (chỉ lọc); dữ liệu demo dừng ~02/10/2026 nên dự báo ngày gần đây ≈ 0 (đã cảnh báo).
- UI chưa kiểm thủ công trên trình duyệt.
