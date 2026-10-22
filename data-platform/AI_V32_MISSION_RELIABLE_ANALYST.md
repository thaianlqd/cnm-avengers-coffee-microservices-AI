# AI Data Analyst V3.2 — "Mission-Driven Reliable Analyst"

> Phạm vi: `data-platform/` (analytics-api + web-ui). Nhánh `branch_thaian`. V3.0/V3.1 được giữ nguyên;
> V3.2 làm chắc hành vi sản phẩm quan sát được khi kiểm thử UI thủ công.
> Đặc tả gốc: `AI_V32_MISSION_RELIABLE_ANALYST_PLAN.md` (có checkpoint thực thi ở cuối file).

## 1. Sự cố đã tái hiện và nguyên nhân gốc

| # | Sự cố | Tái hiện (P0, offline) | Nguyên nhân gốc | Cách sửa V3.2 |
|---|---|---|---|---|
| A | "dsdasds" hiện "Câu hỏi hợp lệ" | preflight `status=ok`, `can_submit=true` | Preflight chỉ chặn quyền riêng tư/độ dài; không có khái niệm "nhận ra bài toán" | Trạng thái trung thực + `unrecognized_question` (BLOCKED, 0 lượt AI), từ vựng nghiệp vụ được quản trị |
| B | Đổi tab So sánh → Xếp hạng giữ câu cũ | `mission=ranking` + câu "So sánh…" vẫn `ok` | Một ô câu hỏi dùng chung mọi nhiệm vụ; nhiệm vụ chỉ là nhãn trình bày | Draft riêng từng nhiệm vụ; đổi nhiệm vụ xoá preflight/rủi ro/kế hoạch/báo cáo; phát hiện `mission_mismatch` |
| C | Điều khiển Thời gian/Phạm vi/Độ sâu chung | `ScopeDepthBar` dùng cho mọi nhiệm vụ, mặc định "Sản phẩm" | Không có hợp đồng đầu vào theo nhiệm vụ | `input_contract` trong registry; `MissionInputBuilder` chỉ hiện slot của nhiệm vụ; phạm vi **tự nhận diện từ câu hỏi** |
| D | Preflight hiểu "doanh thu", planner báo thiếu metric | LLM trả `product_revenue` → báo cáo thành công với `product_revenue`; LLM bỏ metric → liệt kê 6 metric doanh thu | Preflight và planner diễn giải độc lập; không có khoá ngữ nghĩa | `SemanticPreflightContract` + `enforce_metric_locks` (khôi phục tất định) + `semantic_contract_drift` |
| E | "Doanh thu · +5 chỉ số cùng tên" | "doanh thu" neo 6 metric ngang hàng | 6 metric cùng khai alias "doanh thu" | `metric_alias_policy` (canonical/ambiguous) + `qualifier_dimensions` + bộ kiểm va chạm alias |
| F | Dự báo hỏng rồi thử lại mới được | builder sinh chữ → bắt Gemini diễn giải lại | UI biết ID chuẩn nhưng vẫn gửi văn bản cho AI | Chế độ **guided** (0 lượt AI) + nâng cấp tất định câu tự do đủ thông tin |
| G | Rủi ro hiện biểu đồ doanh thu sản phẩm | supporting thêm `aov`, lens liên miền | View hỗ trợ không bị ràng buộc theo nhiệm vụ | `mission_relevant` (resolver) + cổng `chart_relevance_service` (báo cáo) |
| H | Biểu đồ không giải thích vì sao có mặt | tiêu đề trùng "Doanh thu — Đơn hàng và doanh thu" | Không có khối nhận định; tiêu đề không nêu chiều | `chart_insight_service` + tiêu đề nêu chiều/tỷ trọng |
| I | "86,8/100" trông như độ chính xác AI | UI "Kiểm chứng & độ chính xác" | Điểm hoàn tất nội bộ được trình bày như độ chính xác | Đổi tên "Mức hoàn tất kiểm chứng nội bộ"; khung đo lường tách riêng |
| J | Kiểm chứng làm rối báo cáo | quality nằm giữa báo cáo | Một trang duy nhất | 4 tab: Báo cáo · Kiểm chứng & nguồn · Dữ liệu / SQL · Lưu & xuất |
| K | Hết quota Gemini | — | Một credential duy nhất | Pool credential: chính + 1 lần dự phòng (cùng model) |
| Độ sâu | 3 chế độ cho cùng kết quả | focused/deep/comprehensive → cùng 6 biểu đồ | `support_limit`/`target_views` cố định; test V2.12 ép focused ≥ 4 view | `depth_budgets` trong registry: số view hỗ trợ, số chiều tự khám phá, miền liên quan |

## 2. Kiến trúc hai đường vào

```
Guided (nhiệm vụ + ID chuẩn)            Free text (ngôn ngữ tự nhiên)
  registry → validate_guided              preflight (0 AI) → khoá ngữ nghĩa → LLM (1 lượt logic)
  → guided_intent (0 AI)                  → enforce_metric_locks → validate (bounded repair V3.0)
                 ╲                        ╱
                  AnalysisIntentEnvelope (cùng một hợp đồng)
                  → resolver (depth budget + mission evidence) → compiler → READ ONLY SQL
                  → cổng liên quan biểu đồ → nhận định tất định → báo cáo → kiểm chứng
```

- Guided: `input_mode="guided"`, `guided_contract` (metric, dimension, group_a/b, n, direction, granularity, horizon,
  cadence, signals). Máy chủ kiểm lại **mọi** trường với registry (`mission_contract_service.validate_guided`).
- Nâng cấp tất định: client V3.2 gửi `allow_deterministic_upgrade=true`; máy chủ tự chạy preflight. Chỉ dự báo, xu hướng
  1 metric và Rủi ro mặc định được nâng cấp khi **mọi** trường bắt buộc đã rõ, không cảnh báo, không bộ lọc mơ hồ.
- Cổng precheck phía máy chủ (cùng cờ trên): câu vô nghĩa / lệch nhiệm vụ / thiếu tiêu chí bị chặn **trước** mọi lượt AI.
- Sau khi kế hoạch được duyệt: thực thi, chọn biểu đồ, nhận định, kiểm chứng, báo cáo đều tất định (không gọi LLM).

## 3. Trạng thái preflight

`READY_GUIDED` "Đã đủ thông tin để phân tích" · `READY_FOR_AI` "Có thể gửi để AI diễn giải" ·
`NEEDS_INPUT` "Cần bổ sung thông tin" · `BLOCKED` "Chưa thể gửi yêu cầu này" (gibberish: "Chưa nhận ra bài toán phân tích";
lệch nhiệm vụ: "Yêu cầu chưa phù hợp với nhiệm vụ đang chọn") · `CHECKING` (client). Không còn nhãn "Câu hỏi hợp lệ".
Nhận diện dựa trên tín hiệu được quản trị: alias metric/chiều, giá trị chiều, khái niệm chưa hỗ trợ, từ vựng nghiệp vụ,
từ vựng ý định nhiệm vụ, thời gian, chu kỳ, Top-N. Câu thân mật ("hôm nay bán được bao nhiêu?") vẫn được chấp nhận.
Câu chỉ nêu khái niệm chưa được quản trị (vd. "Phân tích lợi nhuận tháng 9") → `NEEDS_INPUT` + `unsupported_only` kèm
nút thay bằng chỉ số gần nhất (0 lượt AI); nếu có thêm chỉ số hợp lệ thì chỉ cảnh báo `unsupported_concept`.

## 4. Hợp đồng nhiệm vụ & độ sâu

- `analysis_missions[].input_contract`: `required`, `optional`, `time_control`, `accepts_intents`, `intent_vocabulary`,
  `chart_roles`, `evidence_roles`, `supporting{metrics, kinds}` (Rủi ro: chỉ metric của tín hiệu rủi ro).
- `dashboard_policy.depth_budgets` (độ sâu chỉ điều khiển **bằng chứng hỗ trợ**, không đổi nghĩa yêu cầu):

| Độ sâu | View hỗ trợ tối đa | Chiều diễn biến tự khám phá | Miền liên quan | Biểu đồ hỗ trợ hiển thị |
|---|---|---|---|---|
| Tập trung | 0 | 0 | không | 0 |
| Phân tích sâu | 6 | 1 | có | ≤ 4 |
| Toàn diện | 8 | 3 | có | ≤ 6 |

Bằng chứng (offline, cùng câu "Doanh thu theo chi nhánh tháng 9/2026", cùng số liệu chính): Tập trung 2 → Sâu 4 → Toàn diện 7
biểu đồ trước cổng hiển thị; test `test_one_question_three_depths_are_measurably_different`.
Nghiệm thu API trên kho thật (guided, 0 lượt AI): Tập trung 2 biểu đồ / 0 view hỗ trợ · Sâu 5 / 3 · Toàn diện 7 / 5.

## 5. Failover credential (không phải failover model/ngữ nghĩa)

- Chính: `GEMINI_API_KEY` của Data Platform. Phụ: `DATA_ANALYST_GEMINI_SECONDARY_KEY`, được `docker-compose.data.yml` ánh xạ
  mặc định tới secret Gemini của Chatbot ở `.env` gốc (đặt rỗng để tắt). Không import/gọi/chia sẻ trạng thái với chatbot.
- Chỉ khi lỗi credential/vận chuyển (`429`, quota ngày, timeout, connection, 5xx). Không bao giờ cho lỗi ngữ nghĩa/JSON/400.
- Một lượt logic tối đa 2 HTTP (chính + 1 phụ, cùng model, cùng body); không tính là lượt sửa ngữ nghĩa; cả hai hỏng →
  lỗi provider có kiểu ngay, không thử lại vòng mới. Ghi `logical_provider_calls`, `provider_http_attempts`,
  `credential_failover_used`, `credential_slot` (tên slot, không bao giờ là khoá).
- Trạng thái UI: Sẵn sàng · Đang chuyển dự phòng · Giới hạn quota · Không khả dụng.

## 6. Biểu đồ: liên quan, nhận định, trình bày

- `chart_relevance_service.apply`: mỗi biểu đồ mang `requirement_id`, `relevance_role`, `metric_ids`, `dimension_ids`,
  `query_id`, `evidence_refs`; bị loại nếu không ánh xạ yêu cầu, ngoài bằng chứng nhiệm vụ, hoặc vượt ngân sách hỗ trợ.
- `chart_insight_service`: "Nhận định từ biểu đồ" = vì sao có mặt · thể hiện gì · số liệu chính (tham chiếu dòng
  `query:metric:key`) · diễn giải mô tả · lưu ý (kỳ chưa trọn, Top-N, tỷ lệ không cộng, mẫu nhỏ) · "Điểm nên kiểm tra tiếp".
  Tương quan luôn kèm "Tương quan không phải nhân quả". 0 lượt AI.
- Trình bày: tiêu đề nêu chiều/tỷ trọng; vạch ngưỡng rủi ro + màu đèn giao thông; focus bàn phím; `prefers-reduced-motion`.

## 7. Phương pháp kiểm chứng

- Không dùng AI để chấm AI; không gộp thành một "độ chính xác AI" cho một báo cáo.
- Báo cáo có `verification.metrics`: đối chiếu số liệu độc lập, đối chiếu xếp hạng, yêu cầu được đáp ứng, nhận định có
  bằng chứng, biểu đồ đúng yêu cầu; kèm backtest dự báo (MAE/RMSE/sMAPE/MASE khi có), cấu trúc xu hướng, snapshot
  (fingerprint registry/catalog, phiên bản kiểm chứng, định nghĩa metric, ánh xạ biểu đồ→yêu cầu, ngày tham chiếu).
- Oracle độc lập (`POST /api/ai/sessions/{id}/reconcile`, chủ sở hữu, read-only, 0 AI): truy vấn tổng hợp riêng từ cùng
  định nghĩa metric nhưng khác cấu trúc (scalar toàn phạm vi; nhóm không giới hạn cho Top-K). Sai số theo đơn vị:
  số đếm khớp tuyệt đối, tiền ≤ 0,01, % ≤ 0,05 điểm. Tỷ lệ/trung bình không đối chiếu bằng cộng/trung bình nhóm.
  Chưa chạy → `independent_oracle = null` ("Chưa đo đối chiếu độc lập"), không bao giờ suy ra 100%.
- Điểm có trọng số cũ được giữ, đổi tên "Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)".

## 8. Kiểm thử

- Backend: `tests/test_v32_mission_reliability.py` (sự cố A–K, độ sâu, failover giả lập HTTP, relevance, insight,
  oracle, gợi ý chạy được). Web-ui: `missionWorkspace.test.mjs`, `reportV32.test.mjs` (+ cập nhật có chủ đích các test
  V2.12/V3.0/V3.1 bị V3.2 thay thế — xem mục 10).
- Lệnh: xem `.claude/rules/data-platform.md`.
- Kết quả cuối (16/10/2026): backend **913 test, 4 lỗi có sẵn** (giống baseline V3.1 876/4, không hồi quy);
  web-ui **153/153**, typecheck PASS, build PASS; eval offline 146 ca: domain 110/113, metric 109/113, compile 108/108,
  preflight 17/17, unsupported 5/5, forecast rejection 6/6 (4 ca lỗi giống hệt baseline); `git diff --check` sạch.

## 9. Nghiệm thu thủ công (trình duyệt)

Trình duyệt: **NOT RUN** (phiên thực thi không có công cụ trình duyệt). Đã nghiệm thu ở mức API trên stack đang chạy,
chỉ các đường 0 lượt AI: gibberish BLOCKED · lệch nhiệm vụ có 2 nút sửa · quyền riêng tư BLOCKED · lợi nhuận NEEDS_INPUT +
chỉ số gần nhất · câu thân mật được chấp nhận · "doanh thu" = revenue chuẩn · xu hướng tự do tự nâng cấp guided (0 AI) →
báo cáo + oracle 1/1 khớp · dự báo guided 3 tháng (SES) · Rủi ro 6 tín hiệu (0 AI) · tương quan scatter + "không phải nhân
quả" · 3 độ sâu khác nhau đo được. Cần người dùng tự kiểm tra giao diện trên trình duyệt.

## 10. Thay đổi có chủ đích với hành vi cũ

- V2.12 "focused không được bỏ sàn 4 view" → thay bằng ngân sách độ sâu thật (focused = chỉ view yêu cầu).
- V3.0 drift của "doanh thu" bị AI bỏ rơi → kiểu `semantic_contract_drift` (vẫn dừng không tiến triển, không thử lại).
- V3.1 bố cục báo cáo một trang → tab; nhãn trạng thái provider theo §118; nhãn điểm theo §53.

## 11. Giới hạn còn lại

- Oracle độc lập dùng chung compiler (khác cấu trúc truy vấn, cùng định nghĩa) — độc lập về phép tổng hợp, chưa độc lập
  về mã nguồn SQL; dữ liệu nhóm > 100 không đối chiếu xếp hạng được (ghi "Chưa đo").
- Tỷ lệ theo nhóm chưa đối chiếu tử/mẫu số vì registry chưa khai báo metric thành phần.
- Nâng cấp tất định câu tự do mới hỗ trợ dự báo, xu hướng 1 metric và Rủi ro mặc định.
- Từ vựng nhận diện nghiệp vụ là danh sách được quản trị; câu chỉ có lỗi chính tả nặng có thể bị coi là "cần bổ sung".
