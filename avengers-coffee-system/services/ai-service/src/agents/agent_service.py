"""
agent_service.py
----------------
Orchestrator cho Agentic Chat của Avengers Coffee.

Chịu trách nhiệm:
  - Xây dựng System Prompt phù hợp với ngữ cảnh (giỏ hàng, chi nhánh, lịch sử)
  - [Phase 2] Inject RAG context vào system prompt nếu câu hỏi liên quan FAQ/chính sách
  - [Phase 3] Guardrails: kiểm tra input/output trước và sau khi gọi LLM
  - Gọi groq_agent_chat (Function Calling loop)
  - Trả về reply text + checkout_payload (nếu có) cho API endpoint

KHÔNG chứa business logic DB hoặc cart logic — những thứ đó nằm ở
agent_tools.py và cart_manager.py.
"""
import logging
from typing import Any, Dict, List, Optional

from src.common import cart_manager
from src.function_calling.tools import ALL_TOOL_SCHEMAS, TOOL_EXECUTORS
from src.common.groq_service import groq_agent_chat
from src.agents import guardrails

logger = logging.getLogger(__name__)

# ── System Prompt ──────────────────────────────────────────────────────────────
_AGENT_SYSTEM_PROMPT = """Bạn là trợ lý ảo của Avengers Coffee — một chuỗi cà phê tại Việt Nam.
Nhiệm vụ của bạn là tư vấn và hỗ trợ khách đặt đồ uống qua hội thoại.

QUY TẮC BẮT BUỘC:
1. LUÔN hỏi chi nhánh trước khi báo giá hoặc thêm vào giỏ hàng (cart). TUY NHIÊN:
   - Nếu khách muốn "đổi món", "sửa đơn", hoặc CHỈ HỎI XEM ĐƠN HÀNG, TUYỆT ĐỐI KHÔNG gọi ask_branch() mà hãy đi lấy mã đơn hàng.
   - PHẢI ưu tiên giải quyết yêu cầu chính của khách (ví dụ: gợi ý món ăn/nước uống bằng `get_recommendations`, hoặc tìm thông tin) TRƯỚC KHI hỏi thông tin chi nhánh.
   - CHỈ gọi `ask_branch` khi thực sự cần thiết để thêm món vào giỏ (`add_to_cart`) hoặc tiến hành chốt đơn. Tuyệt đối không đòi chi nhánh khi khách chỉ đang nhờ tư vấn.
2. Giá bán phải lấy từ tool check_price_and_stock. KHÔNG được tự bịa giá.
3. Chỉ thêm vào giỏ sau khi đã biết product_id và giá thật từ check_price_and_stock.
4. Khi khách muốn chốt đơn, gọi request_checkout() để hệ thống xác nhận tổng tiền.
5. Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Không dùng Markdown quá phức tạp.
6. Khi khách hỏi về chính sách, FAQ, thành phần, khuyến mãi: gọi tool search_knowledge_base trước.
[QUAN TRỌNG NHẤT VỀ TRA CỨU]: 
- NẾU tool search_knowledge_base trả về kết quả hợp lệ (status="ok"): BẠN PHẢI dựa vào thông tin đó để trả lời tự nhiên. Tuyệt đối không tự suy diễn thêm thành phần hay hương vị ngoài dữ liệu được cung cấp.
- CHỈ KHI tool trả về rỗng (status="not_found"): BẠN BẮT BUỘC PHẢI DỪNG LẠI và trả lời ĐÚNG NGUYÊN VĂN câu sau: "Hiện mình chưa có thông tin mô tả chi tiết cho món này, bạn có thể xem trực tiếp trên trang sản phẩm hoặc hỏi nhân viên nhé". KHÔNG xin lỗi, KHÔNG giải thích thêm.
7. Khi khách hỏi gợi ý món ngon hoặc bán chạy: gọi tool get_recommendations (mặc định criteria="hot"). NẾU khách hỏi món "đánh giá cao", "5 sao", phải truyền criteria="rating".
8. Khi khách hỏi ĐÁNH GIÁ (review) về một món CỤ THỂ (ví dụ: "Americano Mơ đánh giá sao"): BẮT BUỘC phải gọi trực tiếp `get_product_insights` với tham số `product_name` là tên món đó (ví dụ "Americano Mơ"). NẾU tool báo chưa có đánh giá, BẠN PHẢI TRẢ LỜI THẲNG THẮN VÀ TRUNG THỰC cho khách biết là chưa có đánh giá nào, TUYỆT ĐỐI KHÔNG nói vòng vo hay lảng tránh sang chuyện khác.
9. KHÔNG cam kết hoàn tiền, giảm giá hay điều chỉnh giá ngoài những gì hệ thống cho phép.
10. Khi gợi ý thêm món (Upsell), TUYỆT ĐỐI KHÔNG tự ý bịa ra topping cho đồ ăn (ví dụ: cấm gợi ý thêm hạt sen, trân châu, socola... vào bánh mì, bánh ngọt). Topping chỉ dành cho đồ uống nếu món đó thực sự có. Chỉ báo giá thực tế lấy từ hệ thống chứ không tự bịa khuyến mãi.
11. BẢO MẬT: TUYỆT ĐỐI KHÔNG tiết lộ tên các công cụ (tools) nội bộ cho khách. Việc gọi tool là nhiệm vụ ngầm của bạn.
12. QUY TRÌNH CHỐT ĐƠN (QUAN TRỌNG):
    - Khi khách bảo "chốt đơn" hoặc muốn đặt hàng, TRƯỚC TIÊN hãy hỏi khách phương thức thanh toán (Tiền mặt/VNPay/Chuyển khoản/Ví) và hình thức giao hàng (Giao tận nơi/Mang đi/Tại chỗ) nếu chưa biết.
    - Sau khi khách chọn xong, HÃY gọi `request_checkout` để TÓM TẮT đơn hàng. KHÔNG TỰ Ý ĐẶT TRƯỚC KHI TÓM TẮT.
    - [TỐI QUAN TRỌNG] Nếu bạn VỪA tóm tắt đơn hàng (request_checkout) và khách phản hồi "ĐỒNG Ý", "XÁC NHẬN", "OK", "CHỐT"... => BẠN BẮT BUỘC PHẢI GỌI NGAY TOOL `confirm_checkout` ĐỂ HỆ THỐNG TẠO ĐƠN HÀNG THẬT.
    - TUYỆT ĐỐI KHÔNG TỰ BỊA RA MÃ ĐƠN HÀNG (như ORD-...) nếu chưa gọi `confirm_checkout`. Chỉ báo thành công khi tool trả về kết quả.
    - KHÔNG YÊU CẦU khách phải thao tác bấm nút trên màn hình. Bạn tự lo hoàn tất đơn hàng bằng tool `confirm_checkout`.
13. Khi khách yêu cầu hủy/sửa đơn, gọi `get_order_history` tìm mã đơn. Nếu khách CHƯA xác nhận, gọi `cancel_order` hoặc `update_order` với `is_confirmed=False` và BÁO KHÁCH. NẾU KHÁCH ĐÃ NHẮN "ĐỒNG Ý" hoặc xác nhận hủy, BẮT BUỘC gọi với `is_confirmed=True` để thực thi. KHÔNG gọi ask_branch.
14. Khi tư vấn quán gần nhất từ tool `find_nearest_branch`, BẢT BUỘC phải đọc đúng số km (`khoang_cach_km`) mà tool trả về (ví dụ "cách bạn khoảng 2.3km"). TUYỆT ĐỐI KHÔNG tự bịa khoảng cách hay làm tròn sai lệch. Nếu tool có trả về warning "Chi nhánh gần nhất cũng cách tới...", HÃY báo rõ là khu vực của khách không có chi nhánh, và các gợi ý này khá xa.
15. NẾU MỘT TOOL BÁO LỖI (status="error") thì HÃY BÁO LỖI ĐÓ CHO KHÁCH, TUYỆT ĐỐI KHÔNG GỌI LẠI TOOL ĐÓ NỮA VÀ DỪNG LẠI NGAY.
16. [QUAN TRỌNG NHẤT VỀ ĐẶT HÀNG] NẾU khách muốn đặt món nhưng chưa nói rõ Kích cỡ, Lượng đá, Độ ngọt, BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI KHÁCH VỘI! Bạn PHẢI GỌI TOOL `get_product_options` TRƯỚC TIÊN để kiểm tra xem món đó có tùy chọn hay không.
    - NẾU kết quả trả về là KHÔNG CÓ TÙY CHỌN, bạn KHÔNG ĐƯỢC hỏi khách về size/đá/đường, mà hãy tiến hành gọi `check_price_and_stock` và `add_to_cart` luôn.
    - NẾU kết quả trả về CÓ tùy chọn, bạn MỚI ĐƯỢC PHÉP hỏi khách, và BẮT BUỘC PHẢI DÙNG CHÍNH XÁC Y HỆT những nhãn tùy chọn mà tool trả về (TUYỆT ĐỐI KHÔNG tự bịa ra các size như Nhỏ/Vừa/Lớn hay S/M/L nếu tool không có).
    - Gom tất cả yêu cầu về đá, đường, topping vào tham số `note` khi gọi `add_to_cart`.
17. Khi `get_recommendations` trả rỗng thật sự (báo lỗi status=not_found), BẠN BẮT BUỘC phải chủ động gợi ý khách chuyển sang tham khảo danh mục khác (ví dụ từ thức uống sang đồ ăn) thay vì trả lời cụt lủn.
18. TUYỆT ĐỐI KHÔNG gọi `get_recommendations` nhiều lần cho các danh mục khác nhau trong cùng một câu hỏi. Chỉ gọi đúng 1 lần cho danh mục mà khách yêu cầu.

THÔNG TIN PHIÊN HIỆN TẠI:
{session_context}"""


def _build_session_context(session_id: str) -> str:
    """Tóm tắt ngữ cảnh phiên hiện tại để nhét vào system prompt."""
    branch_id = cart_manager.get_branch(session_id)
    cart_text = cart_manager.cart_summary_text(session_id)
    branch_info = f"Chi nhánh đang chọn: {branch_id}" if branch_id else "Chi nhánh: Chưa chọn"
    return f"{branch_info}\nGiỏ hàng hiện tại:\n{cart_text}"





def _build_messages(
    session_id: str,
    history: List[Dict[str, str]],
    user_message: str,
) -> List[Dict[str, Any]]:
    """
    Xây dựng danh sách messages gửi lên Groq.

    Args:
        session_id: ID phiên chat của khách.
        history:    Lịch sử chat [{"role": "user"|"assistant", "content": str}].
                    Tối đa 8 lượt gần nhất để tránh tràn context.
        user_message: Tin nhắn mới nhất của khách.
    """
    session_ctx = _build_session_context(session_id)
    system_content = _AGENT_SYSTEM_PROMPT.format(
        session_context=session_ctx,
    )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_content}
    ]

    # Tăng tối đa 10 lượt lịch sử (20 messages) để AI nhớ được lâu hơn
    trimmed_history = history[-20:] if len(history) > 20 else history
    for h in trimmed_history:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            # Cắt ngắn text (tăng lên 1500 ký tự) để nhớ chi tiết đơn hàng
            content = h["content"]
            if len(content) > 1500:
                content = content[:1500] + "... [TRUNCATED]"
            messages.append({"role": h["role"], "content": content})

    messages.append({"role": "user", "content": user_message})
    return messages


# ── Public API ────────────────────────────────────────────────────────────────

def run_agent(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
    max_tool_rounds: int = 5,
) -> Dict[str, Any]:
    """
    Điểm vào chính của Agent. Được gọi từ FastAPI endpoint.

    Args:
        session_id:     ID phiên chat (từ frontend, ví dụ: user_id hoặc anon_id).
        user_message:   Tin nhắn mới nhất của khách.
        history:        Lịch sử hội thoại (list of {role, content}).
        max_tool_rounds: Số vòng tool tối đa (default 5).

    Returns:
        {
          "reply":            str,       # Câu trả lời dạng text cho khách
          "checkout_payload": dict|None, # Nếu khách muốn chốt đơn (Guardrail trigger)
          "tool_calls_log":   list,      # Debug log các tool đã gọi
          "error":            str|None,
        }
    """
    if not session_id or not user_message:
        return {
            "reply": "Xin lỗi, mình không nhận được tin nhắn của bạn. Bạn thử lại nhé!",
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": "missing_input",
        }

    is_safe, block_reason = guardrails.check_input(user_message, session_id)
    if not is_safe:
        safe_reply = guardrails.get_block_reply(block_reason or "")
        logger.info(
            "[AgentService] Input blocked: session=%s reason=%s",
            session_id, block_reason
        )
        return {
            "reply": safe_reply,
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": f"blocked:{block_reason}",
        }

    # ── [NEW] INTERCEPT: Khách xác nhận chốt đơn ─────────────────────────────
    user_msg_lower = user_message.strip().lower()
    confirm_keywords = ["đồng ý", "xác nhận", "ok", "oke", "chốt", "đặt đi", "tiến hành", "okela", "chốt đơn"]
    # Kiểm tra xem user_msg có trùng hoặc bắt đầu bằng keyword không
    is_confirming = any(user_msg_lower == kw or user_msg_lower.startswith(kw + " ") or user_msg_lower.startswith(kw + "!") for kw in confirm_keywords)
    
    if is_confirming and history:
        last_assistant_msg = next((h["content"] for h in reversed(history) if h.get("role") == "assistant"), "")
        if "Khách cần xác nhận trước khi tôi tiến hành đặt" in last_assistant_msg:
            logger.info("[AgentService] Intercepted checkout confirmation from user: '%s'", user_message)
            from src.function_calling.tools.cart_tools import execute_confirm_checkout
            
            checkout_res = execute_confirm_checkout(session_id)
            if checkout_res.get("status") == "success":
                order_id = checkout_res.get("order_id", "Không rõ")
                total = checkout_res.get("total_price", 0)
                reply = f"🎉 Đặt hàng thành công! Mã đơn hàng của bạn là: **{order_id}**.\nTổng cộng: {total:,.0f}đ. Cảm ơn bạn đã ủng hộ!".replace(',', '.')
            else:
                reply = f"❌ Rất tiếc, quá trình tạo đơn hàng thất bại: {checkout_res.get('message', 'Lỗi không xác định')}."
            
            return {
                "reply": reply,
                "checkout_payload": None,
                "tool_calls_log": [{"tool": "confirm_checkout", "result": checkout_res}],
                "error": None,
            }
            
        elif "xác nhận hủy" in last_assistant_msg.lower():
            logger.info("[AgentService] Intercepted cancel_order confirmation from user: '%s'", user_message)
            from src.function_calling.tools.order_tools import execute_cancel_order
            import re
            
            # Extract order_id from text: "hủy đơn hàng {order_id} không"
            match = re.search(r"đơn hàng ([\w\-]+) không", last_assistant_msg.lower())
            if not match:
                match = re.search(r"([\w\-]{36})", last_assistant_msg)
                
            if match:
                order_id = match.group(1)
                cancel_res = execute_cancel_order(session_id, order_id, is_confirmed=True)
                if cancel_res.get("status") == "success":
                    reply = f"✅ Đơn hàng **{order_id}** đã được hủy thành công."
                else:
                    reply = f"❌ Rất tiếc, không thể hủy đơn hàng: {cancel_res.get('message', 'Lỗi không xác định')}."
                    
                return {
                    "reply": reply,
                    "checkout_payload": None,
                    "tool_calls_log": [{"tool": "cancel_order", "result": cancel_res}],
                    "error": None,
                }

    # ── Build messages (bao gồm RAG context nếu cần) ──────────────────────────
    messages = _build_messages(
        session_id=session_id,
        history=history or [],
        user_message=user_message,
    )

    # ── Gọi Groq Agent ────────────────────────────────────────────────────────
    result = groq_agent_chat(
        messages=messages,
        tools=ALL_TOOL_SCHEMAS,
        tool_executors=TOOL_EXECUTORS,
        session_id=session_id,
        max_tool_rounds=max_tool_rounds,
    )

    # ── [Phase 3] Lớp 2: Guardrails — Kiểm tra Output ────────────────────────
    if result.get("reply"):
        safe_reply, was_modified = guardrails.check_output(result["reply"])
        if was_modified:
            logger.warning(
                "[AgentService] Output was modified by guardrails: session=%s", session_id
            )
        result["reply"] = safe_reply

    logger.info(
        "[AgentService] session=%s tools_called=%d checkout=%s error=%s",
        session_id,
        len(result.get("tool_calls_log", [])),
        "yes" if result.get("checkout_payload") else "no",
        result.get("error"),
    )
    return result
