# Avengers Coffee — hướng dẫn cho Claude

Hệ thống bán cà phê đa chi nhánh dạng microservices (KLTN): backend NestJS (identity/menu/inventory/order/news + api-gateway),
chatbot đặt hàng `ai-service` (Python/FastAPI, kiến trúc **Hybrid**: LLM chỉ hiểu ý, server giữ nghiệp vụ),
web/mobile (React+Vite, Expo) và `data-platform` (AI Data Analyst / BI: Kafka, Spark, Airflow, analytics-api, web-ui).

## Bản đồ thư mục
- `avengers-coffee-system/services/{identity,menu,inventory,order,news}-service` — NestJS + Jest; `api-gateway/gateway-root`.
- `avengers-coffee-system/services/ai-service` — chatbot; code ở `src/agents`, `src/common`, `src/function_calling/tools`, `src/rag`; test ở `tests/`.
- `avengers-coffee-system/apps/` — `customer-mobile`, `admin-mobile`, `shipper-mobile` (Expo), `web-customer`, `web-admin`, `web-shipper`, `shipper-launcher` (Vite), `shared-ui`.
- `avengers-coffee-system/contracts/` — case dùng chung giữa ai-service và web (test Python đọc file này).
- `data-platform/` — `analytics-api` (FastAPI, unittest), `web-ui` (React+TS), `airflow`, `spark-jobs`, `kafka-*`, `data-sync`, `init-db`.
- `docker-compose.yml` (app) · `docker-compose.data.yml` (data platform) · `k8s/`, `load-tests/`, `scripts/` · CI: `.github/workflows/api-ci.yml`.

## ai-service: production vs legacy (đã kiểm bằng phân tích import)
- Vào: `main.py` → `agent_service.run_agent` → `AI_AGENT_ARCHITECTURE` (mặc định `hybrid`) → `hybrid_commerce_orchestrator.run_hybrid_turn`.
- **Production (Hybrid)**: `src/agents/hybrid_*.py`, `product_snapshot.py`, `product_collections.py`, `tool_policy.py`, `tool_artifacts.py`,
  `customer_flow_presentation.py`, `product_display.py`, `order_management.py`, `semantic_protocol/registry/control.py`, `tier1.py`, `src/common/*`, `src/function_calling/tools/*`.
- **Legacy** (chỉ chạy khi `AI_AGENT_ARCHITECTURE=semantic_legacy`): `order_flow_graph.py` (~4.700 dòng), `llm_tool_orchestrator.py`, phần còn lại của `agent_service.py`.
  `AI_CHAT_ORCHESTRATOR_MODE` chỉ có tác dụng ở nhánh legacy.
- ⚠️ Legacy **chưa chết**: Hybrid vẫn import lười helper `_...` từ `order_flow_graph.py` (qua `tool_policy`, `product_display`, `shopping_turn_control`,
  `knowledge_consultation`, `rag/product_context`) và từ `agent_service.py`. Sửa các helper đó = sửa production
  (được tự sửa khi đủ 4 điều kiện trong `.claude/rules/ai-chatbot.md`; phần chỉ-legacy thì phải hỏi).
- `tests/conftest.py` mặc định ép `semantic_legacy`; test Hybrid (`tests/test_hybrid_*.py`) tự bật lại hybrid.

## Lệnh thật
- ai-service test OFFLINE (Python 3.11, mạng tắt, key rỗng): `.claude/scripts/test-ai-offline.sh [đối số pytest]`
  - Baseline 2026-10-15: **5979 passed, 1 skipped, 0 failed, ~36s**. `.venv` local là Python 3.9 → lỗi collection, đừng dùng (đã chốt: dùng Docker, không dựng venv mới).
  - Nhóm Hybrid nhanh (~11s, 438 test): `.claude/scripts/test-ai-offline.sh tests -q -k hybrid`. Một file: `... tests/test_hybrid_journeys.py -q`.
- NestJS service (thư mục service): `npm test`, `npm run build`; e2e cần Postgres + `NODE_ENV=test E2E_DB_SAFE=1 DB_SCHEMA=<service>_ci_*` (xem CI).
  `npm run lint` ở NestJS có `--fix` (sửa file!) → kiểm tra thuần: `npx eslint "src/**/*.ts"`.
- Mobile Expo: `npm run lint`, `node --test tests/*.test.mjs` (customer/shipper-mobile). Không có typecheck (JS thuần).
- web-admin: `npm run lint`, `npm test`, `npm run build` · web-customer: `npm run lint`, `npm run build`.
- data-platform/analytics-api: `docker compose -f docker-compose.data.yml exec -T analytics-api python -m tools.run_tests_v29`
  (runner cô lập env; baseline V3.1: 876 test, 4 lỗi có sẵn). Eval: `... python -m evals.semantic_eval_v30 --mode offline`.
  data-platform/web-ui: `npm run typecheck`, `npm run build`, `node --test src/utils/*.test.mjs`.
- Stack: `docker compose up -d --build <service>` · data: `docker compose -f docker-compose.data.yml up -d`. Không bao giờ `down -v`.

## Tài liệu (đọc khi cần, đừng nạp cả file)
- Tổng quan ngắn: `docs/SYSTEM_OVERVIEW.md` (skill explain-system tạo/cập nhật).
- Chatbot: `avengers-coffee-system/services/ai-service/docs/HYBRID_COMMERCE_AGENT_MIGRATION.md`, `.../docs/HYBRID_CURRENT_PROBLEMS.md`,
  `docs/ai-chat/SYSTEM_AUDIT.md`, `docs/ai-chat/CONVERSATION_TEST_PLAN.md`.
- Kiến trúc/bối cảnh lớn (30–45KB, chỉ đọc đoạn cần): `ARCHITECTURE.md`, `PROJECT_CONTEXT.md`, `SETUP.md`, `ENV-SETUP.md`.

## Quy tắc cốt lõi (chi tiết: `.claude/rules/`)
- Trả lời tiếng Việt. Không commit/push/reset/stash/clean/rebase/restore — người dùng tự commit.
- Không đọc/in `.env` hay secret; không lệnh phá hủy; không hoàn tác thay đổi không do mình tạo.
- Chatbot: LLM chỉ hiểu ý; giá/tồn kho/giỏ/voucher/thanh toán/quyền ghi thuộc server. Mỗi lỗi sửa phải có test tái hiện.
- Test mặc định offline; gọi LLM thật chỉ khi PLAN yêu cầu rõ.
- Skills: `/execute-plan`, `/verify-changes`, `/debug-failure`, `/review-changes`, `/explain-system`; subagent `code-reviewer`.
