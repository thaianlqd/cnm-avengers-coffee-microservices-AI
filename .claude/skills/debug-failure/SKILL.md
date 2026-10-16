---
name: debug-failure
description: Gỡ lỗi có phương pháp - tái hiện, viết test fail trước, sửa nhỏ nhất đúng tầng. Debug failure, failing test, bug, chatbot trả lời sai, wrong reply, regression, root cause. Dùng khi có test đỏ, lỗi runtime, hoặc chatbot hành xử sai.
---

# Gỡ lỗi

## Quy trình
1. **Tái hiện**: chạy đúng test/kịch bản lỗi, lưu output. Không tái hiện được → thu thêm dữ liệu (log, input), đừng sửa mò.
2. **Test fail trước**: viết test nhỏ nhất tái hiện lỗi (ai-service: trong `tests/`, dùng fixture `hybrid` nếu là production).
   Chạy để thấy nó **đỏ đúng lý do**.
3. **Định vị tầng** (xem mục chatbot bên dưới) → đọc đúng đoạn code (grep + offset/limit).
4. **Sửa nhỏ nhất** ở đúng tầng gây lỗi. Không vá triệu chứng ở tầng trình bày nếu gốc ở tầng dưới.
5. **Chạy lại**: test mới xanh + cả bộ test liên quan (`verify-changes`). Không có lỗi mới so với baseline.
6. Cùng một lỗi sau **3 hướng sửa khác nhau** vẫn còn → dừng, báo đã thử gì, giả thuyết, cần gì.

## Chatbot: xác định lỗi ở tầng nào
Lấy log của lượt lỗi: `docker compose logs ai-service --since 30m | grep -E "Hybrid(Interpretation|Grounding|Turn)"`
(lọc theo `client_message_id` hoặc `conversation_id_hash`). Trong test offline, dùng `caplog` để đọc cùng các log này.

| Dấu hiệu trong log | Tầng | Nơi sửa |
|---|---|---|
| `[HybridInterpretation]`: `intent_names` sai/thiếu, `parse_valid=false`, `repair_count` cao | **Hiểu ý** (interpreter) | `hybrid_semantic_interpreter.py`, `hybrid_command_schema.py` |
| Intent đúng nhưng `[HybridGrounding]` resolve sai món/đơn ("#1", "món đó"), sai `reference_kind` | **Tham chiếu** (grounding) | `hybrid_workflow.py`, `hybrid_reference_repair.py`, `product_snapshot.py`, `product_collections.py` |
| Grounding đúng nhưng chọn sai bước / lặp / bỏ bước; `[HybridTurn]` `business_operation_count` bất thường | **Điều phối** | `hybrid_commerce_orchestrator.py`, `tool_policy.py` |
| Thao tác đúng nhưng giá/tồn/voucher/giỏ/đơn sai | **Dịch vụ nghiệp vụ** | `src/common/cart_manager.py`, `checkout_service.py`, `src/function_calling/tools/*`, service NestJS |
| Dữ liệu đúng nhưng câu trả lời/nút/thẻ hiển thị sai | **Trình bày** | `customer_flow_presentation.py`, `product_display.py`, `*_presentation.py`, `tool_artifacts.py`, frontend |

- `context_fingerprint` giống nhau giữa hai lần chạy mà kết quả khác → nghi provider/không tất định; khác nhau → so ngữ cảnh đầu lượt.
- **Không thêm câu vào prompt interpreter** trừ khi có test chứng minh lỗi nằm ở tầng hiểu ý (log cho thấy `intent_names` sai
  với ngữ cảnh đúng). Ưu tiên sửa ở tầng tất định (grounding/điều phối/nghiệp vụ).
- Lỗi nằm trong helper legacy (`order_flow_graph.py`, `agent_service.py`) mà Hybrid gọi → được sửa nếu đủ 4 điều kiện trong
  `.claude/rules/ai-chatbot.md` (test Hybrid tái hiện, toàn bộ suite xanh, không đổi chữ ký, không sửa gọn hơn được ở tầng Hybrid).
  Lỗi nằm ở phần chỉ-legacy → hỏi người dùng.

## Lỗi môi trường thường gặp
- `TypeError: unsupported operand type(s) for |` khi collect → đang dùng `.venv` Python 3.9; dùng `.claude/scripts/test-ai-offline.sh`.
- `ModuleNotFoundError` trong container → image cũ; `docker compose build ai-service` rồi chạy lại.
- `FileNotFoundError .../contracts/...` hoặc `docker-compose.yml` → test cần cấu trúc repo; script đã mount sẵn.

## Đầu ra
Nguyên nhân gốc (tầng + file:dòng) · test tái hiện (tên) · thay đổi · kết quả test trước → sau.
