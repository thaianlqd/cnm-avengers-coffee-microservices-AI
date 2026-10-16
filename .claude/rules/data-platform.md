---
paths:
  - "data-platform/**"
  - "docker-compose.data.yml"
---

# Quy tắc data-platform (AI Data Analyst / BI)

## Stack
- `analytics-api/` — FastAPI (Python), server `server.py`, `routers/`, `services/`, `migrations/`, `evals/`; test **unittest** ở `tests/` (35 file).
  Container `analytics-api` mount code `./data-platform/analytics-api:/app` → sửa code là container thấy ngay.
- `web-ui/` — React 18 + TypeScript + Vite + zustand. Test logic ở `src/utils/*.test.mjs` (node:test).
- Pipeline: `kafka-producer` → `kafka` → `kafka-consumer` → MinIO → `spark-jobs` (bronze → silver → gold) điều phối bởi `airflow/dags`;
  `data-sync/` đồng bộ từ DB app sang `postgres-analytics`; schema khởi tạo ở `init-db/*.sql`.
- Kết quả đánh giá lịch sử: `evaluation/v27..v29/*.json`, tài liệu `AI_V2*_*.md` ở thư mục này (của người dùng — không di chuyển/xoá).

## Lệnh (đã kiểm chứng 2026-10-15)
- Toàn bộ test analytics-api (runner chuẩn, cô lập env của container, ~7,5 phút):
  `docker compose -f docker-compose.data.yml exec -T analytics-api python -m tools.run_tests_v29`
  - Baseline 16/10/2026 (sau V3.2): **913 test, 4 lỗi có sẵn** (V3.1: 876, V3.0: 810) (`test_default_native_budget_blocks_reentry_without_reset`,
    `test_distribution_and_correlation_observational`, `test_native_provider_gemini_signature_and_groq_fallback`,
    `test_native_transport_failure_never_retries_or_falls_back`).
  - ĐỪNG dùng `unittest discover` trực tiếp: env của container (provider policy, Redis) gây ~200 lỗi giả.
  - Một module (bỏ env provider của container như runner, nếu không các test planner cũ tốn thêm lượt sửa giả):
    `docker compose -f docker-compose.data.yml exec -T analytics-api env -u DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN -u DATA_ANALYST_ENABLE_CONTRACT_REPAIR AI_OFFLINE=1 DATA_ANALYST_ENV=development DATA_ANALYST_SESSION_STORE=memory DATA_ANALYST_ARTIFACT_STORE=memory python -m unittest tests.<module>`
- Eval ngữ nghĩa: offline `python -m evals.semantic_eval_v30 --mode offline` (CI-safe; 146 ca V3.0+V3.1, ghi `evaluation/v31/`); live (tốn lượt AI, có giới hạn)
  `python -m evals.semantic_eval_v30 --mode live --cases smoke --max-calls 30 [--execute]` — chỉ khi PLAN yêu cầu.
- web-ui (thư mục `data-platform/web-ui`): `npm run typecheck`, `npm run build`, `node --test src/utils/*.test.mjs`
  (hoặc từng nhóm `npm run test:ai-quality|test:ai-charts|test:ai-understanding|test:ai-agent|test:ai-input`).
- data-sync (image không chứa test; mount read-only, tắt mạng — 5/5 sau V3.1):
  `docker run --rm --network none -v "$PWD/data-platform/data-sync":/t:ro -w /t cnm-avengers-coffee-microservices-ai-data-sync:latest python -m unittest test_sync`
  Đổi `sync.py` (view silver mới) → `docker compose -f docker-compose.data.yml build data-sync && ... up -d data-sync` để áp vào kho.
- `up -d --build web-ui` tạo lại cả `analytics-api` (phụ thuộc) → đừng chạy khi bộ test analytics-api đang chạy.

## Điểm cần cẩn thận
- `data-platform/.env` chứa secret → không đọc; dùng `data-platform/.env.example`.
- Thiếu `AI_OFFLINE=1` thì test/eval có thể gọi LLM thật (tốn tiền). Luôn đặt biến này trừ khi PLAN yêu cầu chạy thật.
- SQL phân tích chạy trong transaction `READ ONLY` + `statement_timeout` (`services/query_execution_batch.py`). Không nới lỏng,
  không cho câu SQL do LLM sinh chạy ngoài lớp này.
- Eval offline (`evals/run_eval*.py`) tự chặn HTTP và `psycopg2.connect` — giữ nguyên cơ chế chặn đó khi sửa eval.
- Không `down -v` hay xoá volume `avengers_analytics_data`, `avengers_minio_data`, `avengers_kafka_data`, `avengers_airflow_data`.
- Sửa `init-db/*.sql` hoặc `migrations/` = đổi schema dữ liệu → phải hỏi người dùng trước.
