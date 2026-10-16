---
paths:
  - "avengers-coffee-system/services/ai-service/**"
---

# Quy tắc chatbot AI (ai-service, kiến trúc Hybrid)

## Bất biến (checklist review — vi phạm một mục là chặn)
1. **LLM chỉ hiểu ý.** Giá, tồn kho, giỏ, voucher, phí ship, thanh toán, quyền ghi DB/đơn hàng do server quyết định
   (`src/common/cart_manager.py`, `checkout_service.py`, `src/function_calling/tools/*`). Không trao thêm quyền giao dịch cho LLM,
   không để số tiền/ID do LLM sinh ra đi thẳng vào thao tác ghi.
2. **Grounding từ snapshot đóng băng đầu lượt.** Tham chiếu "#1", "món đó", "đơn đó", "cái thứ hai" phải resolve qua
   `product_snapshot.py` / `product_collections.py` / `hybrid_workflow.py` (log `[HybridGrounding]`), không qua dữ liệu tải lại giữa lượt.
3. **Xác nhận hai lượt** trước khi đặt đơn: tóm tắt → khách xác nhận ở lượt sau. Không gộp làm một.
4. **Idempotency**: giữ `client_message_id` (chặn lượt trùng / `client_message_id_conflict` trong `run_hybrid_turn`) và các
   `action_id` (vd `checkout_action_id` gắn với bản tóm tắt đang chờ xác nhận trong `hybrid_workflow.py`). Không bỏ, không đổi ý nghĩa;
   xác nhận cũ/thiếu tóm tắt phải bị từ chối (`test_checkout_confirmation_rejects_stale_or_missing_prior_summary`).
5. **Không thêm intent mới hay câu mới vào prompt interpreter** (`hybrid_semantic_interpreter.py`, `hybrid_command_schema.py`)
   khi chưa có test hồi quy chứng minh lỗi nằm ở tầng hiểu ý.
6. **Mỗi lỗi chatbot được sửa phải kèm một test tái hiện** (fail trước khi sửa, pass sau khi sửa) trong `tests/`.

## Production vs legacy
- Production: `run_agent` → `run_hybrid_turn` (`hybrid_commerce_orchestrator.py`) khi `AI_AGENT_ARCHITECTURE=hybrid` (mặc định).
- Legacy: `order_flow_graph.py`, `llm_tool_orchestrator.py`, nhánh `semantic_legacy` trong `agent_service.py`.
- **Phần chỉ-legacy** (luồng `run_order_flow`, `llm_tool_orchestrator.py`, nhánh `semantic_legacy` trong `run_agent`):
  **không sửa khi chưa hỏi người dùng.**
- **Helper legacy mà Hybrid đang gọi** (import lười `_...` từ `order_flow_graph.py` và `agent_service.py`; liệt kê bằng
  `grep -rn "from src.agents.order_flow_graph import\|from src.agents.agent_service import" src`): là code production,
  **được sửa không cần hỏi** khi đủ cả 4 điều kiện:
  1. có test Hybrid (fixture `hybrid`) tái hiện lỗi, fail trước và pass sau khi sửa;
  2. toàn bộ suite vẫn xanh (suite mặc định chạy `semantic_legacy` nên chính nó bảo vệ nhánh legacy);
  3. không đổi chữ ký hàm hay ý nghĩa giá trị trả về mà caller khác đang dựa vào;
  4. không có cách sửa tương đương, gọn hơn ở tầng Hybrid (ưu tiên sửa ở tầng Hybrid).
  Ghi lần sửa vào "Quyết định đã tự đưa ra". Thiếu điều kiện nào thì hỏi.
- `tests/conftest.py` ép `AI_AGENT_ARCHITECTURE=semantic_legacy` mặc định; test cho Hybrid phải bật lại hybrid
  (fixture `hybrid` trong `tests/hybrid_support.py`; mẫu ở `tests/test_hybrid_*.py`). Test mới cho production mà quên bật hybrid = test nhánh sai.

## Test
- Offline: `.claude/scripts/test-ai-offline.sh tests -q` (baseline 5979 passed / 1 skipped). Nhanh: `... tests -q -k hybrid`.
- Hành trình chuẩn cần giữ xanh: hỏi món → chọn/cấu hình → giỏ → voucher → nhận hàng + thanh toán → tóm tắt → xác nhận
  (`tests/test_hybrid_journeys.py`, `test_hybrid_order_checkout_followups.py`).
- Gọi LLM thật (Gemini/Groq/OpenAI) chỉ khi PLAN yêu cầu rõ; giới hạn số lượt, ghi chú chi phí. Không dùng `.env` thật trong test.

## Log lượt để chẩn đoán
`[HybridInterpretation]` (intent_names, command_count, repair_count, context_fingerprint) → tầng hiểu ý ·
`[HybridGrounding]` → tham chiếu · `[HybridTurn]` (client_message_id, request_count, business_operation_count) → điều phối.
Xem bằng `docker compose logs ai-service --since 10m | grep Hybrid`.
