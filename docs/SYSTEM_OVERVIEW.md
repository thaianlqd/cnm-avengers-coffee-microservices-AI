# Avengers Coffee — Tổng quan hệ thống

> Tài liệu ngắn, bám theo code tại thời điểm cập nhật (15/10/2026). Chỗ chưa kiểm chứng được đánh dấu *(chưa kiểm chứng)*.
> Chi tiết lớn: `ARCHITECTURE.md`, `PROJECT_CONTEXT.md` (root) · Data Platform AI V3.0: `data-platform/AI_V30_SEMANTIC_TRUTH.md` · V3.1: `data-platform/AI_V31_ANALYST_WORKSPACE_PLAN.md` (mục EXECUTION RECORD).

## 1. Mục đích
Chuỗi cà phê đa chi nhánh: đặt món (web/mobile/kiosk, chatbot đặt hàng AI), vận hành cửa hàng và giao hàng (shipper),
và nền tảng dữ liệu phân tích có trợ lý AI trả lời câu hỏi kinh doanh bằng tiếng Việt (GenBI) trên số liệu đã kiểm chứng.

## 2. Thành phần & cổng
| Khối | Vị trí | Ghi chú |
|---|---|---|
| NestJS services (identity, menu, inventory, order, news) | `avengers-coffee-system/services/*-service` | Postgres `avengers_coffee`, Jest |
| API gateway | `avengers-coffee-system/api-gateway/gateway-root` | |
| Chatbot đặt hàng `ai-service` | `avengers-coffee-system/services/ai-service` | FastAPI, kiến trúc Hybrid, cổng 8009→8000 |
| Web/mobile | `avengers-coffee-system/apps/*` | Vite (web-admin 5174, web-customer 5175), Expo |
| Data platform | `data-platform/*`, `docker-compose.data.yml` | analytics-api (FastAPI, reload), web-ui (React+TS, nginx) |

## 3. Luồng dữ liệu phân tích
```
DB vận hành (orders/identity/menu/...) ──data-sync──► postgres-analytics: schema thô + VIEW silver.* (data-sync/sync.py)
        └─kafka-producer → kafka → kafka-consumer → MinIO ──spark-jobs (bronze→silver→gold)──► gold.* (mart dashboard)
analytics-api: chỉ đọc silver.* cho GenBI (allowlist), gold.* cho dashboard; web-ui hiển thị.
```
- `silver.*` là VIEW trên bản sync (độ tươi: batch theo chu kỳ data-sync, không thời gian thực).
- `gold.*` là mart trình bày; một số là Top-N (ví dụ `gold.shipper_performance` chỉ 20 shipper) — không dùng cho tổng toàn hệ thống.

## 4. Data Platform AI (GenBI) — luồng một lần bấm
```
web-ui ──POST /api/ai/analysis-jobs (Idempotency-Key)──► AnalysisJobs (accepted→planning→repairing→validating→executing→verifying→terminal)
  AnalysisPipeline.propose:
    request_anchors (tất định) + semantic_candidate_packet (truy hồi theo domain/registry)
    → LLM 1 lượt: AnalysisIntentEnvelope (chỉ ngữ nghĩa; không SQL, không số liệu)
    → AnalyticalResolver: ID chuẩn, khả năng, thời gian, dự báo (kiểm trước, không gọi lại LLM)
    → sửa lỗi có giới hạn & theo tiến triển (dừng khi lặp) → preflight/compiler (sqlglot, allowlist, read-only)
  AnalysisPipeline.generate: thực thi READ ONLY + statement_timeout → validate_results → dashboard tất định
    → forecast_service (nếu có) → assess_report (kiểm chứng độc lập: replay resolver, fingerprint)
```
- Registry ngữ nghĩa: `data-platform/analytics-api/metadata/semantic_catalog.json` (metric/dimension/subject/domain/lens,
  `source_scope`, `presentation_marts`, `forecast`), được kiểm bằng máy (`services/semantic_catalog_validation.py`) và
  đối chiếu schema vật lý (`registry_drift`, hiển thị ở `/api/ai/status`).
- Lỗi có kiểu: `services/error_taxonomy.py` (error_type, analysis_state, retryable) → UI chỉ hiện "Thử lại" khi retryable.
- Năng lực công khai: `GET /api/ai/capabilities` (domain, metric + chiều hợp lệ, 8 mission, giới hạn server, coverage dữ liệu
  cache, khái niệm chưa hỗ trợ, tín hiệu rủi ro) — `services/workspace_service.py`, coverage `services/data_coverage_service.py`
  (luồng nền 60s, request chỉ đọc bộ nhớ).
- V3.1 Analyst Workspace (trước khi gọi AI): `POST /api/ai/preflight` (`services/preflight_service.py`, tất định, 0 lượt AI,
  0 truy vấn kho; chặn cứng chỉ privacy/quá dài/sai cấu trúc) · `POST /api/ai/risk-watch` (`services/risk_watch_service.py`,
  chỉ số chuẩn so ngưỡng mặc định, qua compiler READ ONLY, không điểm tổng hợp) · `analysis_mission` là gợi ý bố cục, không vào LLM.
- web-ui: `components/workspace/*` (AnalystWorkspace ghép coverage, mission, mẫu câu hỏi, "Hỏi được gì?", preflight,
  Thời gian/Phạm vi/Độ sâu); logic trình bày ở `utils/workspacePresentation.mjs`, `preflightPresentation.mjs`, `dashboardPresentation.mjs`.

## 5. Chatbot đặt hàng (ai-service)
`main.py` → `agent_service.run_agent` → `AI_AGENT_ARCHITECTURE` (mặc định `hybrid`) → `hybrid_commerce_orchestrator.run_hybrid_turn`.
LLM chỉ hiểu ý; giá/tồn kho/giỏ/voucher/thanh toán do server. Legacy `order_flow_graph.py` vẫn có helper được Hybrid gọi.
Chi tiết và quy tắc: `.claude/rules/ai-chatbot.md`.

## 6. Chạy & kiểm thử
| Phần | Lệnh | Baseline/kết quả gần nhất |
|---|---|---|
| ai-service | `.claude/scripts/test-ai-offline.sh tests -q` | 5979 passed, 1 skipped (15/10/2026) |
| analytics-api | `docker compose -f docker-compose.data.yml exec -T analytics-api python -m tools.run_tests_v29` | 876 test (16/10/2026, V3.1), 4 lỗi có sẵn từ trước V3.0, 0 lỗi mới |
| analytics-api eval offline | `... analytics-api python -m evals.semantic_eval_v30 --mode offline` (ghi `evaluation/v31/`) | 146 ca (113 V3.0 + 33 V3.1); tập V3.0 không đổi; V3.1 biên dịch 25/25, preflight 17/17 |
| analytics-api eval live (tốn lượt AI) | `... analytics-api python -m evals.semantic_eval_v30 --mode live --cases smoke --max-calls 30 --execute` | smoke 11/12 |
| data-platform web-ui | `npm run typecheck && node --test src/utils/*.test.mjs && npm run build` | 138 test, 0 lỗi (16/10/2026) |
| data-sync | `docker run --rm --network none -v $PWD/data-platform/data-sync:/t:ro -w /t <image data-sync> python -m unittest test_sync` | 5/5 |

## 7. Lịch sử cập nhật
- 15/10/2026 — Data Platform AI V3.0: fact giao hàng `silver.giao_hang` + tỷ lệ giao thành công chuẩn hoá; phân loại nguồn
  (FULL_FACT/SNAPSHOT/TOP_N_MART…); dừng sửa khi không tiến triển; lỗi có kiểu & retry đúng chỗ; dự báo tất định có backtest;
  bộ đánh giá NL 113 ca (offline + live có giới hạn). Xem `data-platform/AI_V30_SEMANTIC_TRUTH.md`.
- 16/10/2026 — Data Platform AI V3.1 Analyst Workspace: metric tỷ lệ hủy/hoàn thành đơn, tỷ lệ ca đi trễ, ca lệch tiền lớn,
  lượt dùng khuyến mãi (`silver.khuyen_mai_su_dung`), chiều thứ trong tuần; mission/limits/coverage/risk trong capabilities;
  preflight 0 lượt AI; Risk Watch; dashboard theo mission; sửa nhãn/đơn vị/dữ liệu giả trên "Báo cáo & Phân tích".
