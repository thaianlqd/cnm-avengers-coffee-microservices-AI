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
import re
import unicodedata
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
1. KHÔNG hỏi chi nhánh khi khách mới đang xin gợi ý, chọn món hoặc chọn tùy chọn. Trình tự là chọn món → hỏi hình thức nhận → mới xác định chi nhánh:
   - Nếu khách muốn "đổi món", "sửa đơn", hoặc CHỈ HỎI XEM ĐƠN HÀNG, TUYỆT ĐỐI KHÔNG gọi ask_branch() mà hãy đi lấy mã đơn hàng.
   - PHẢI ưu tiên giải quyết yêu cầu chính của khách (ví dụ: gợi ý món ăn/nước uống bằng `get_recommendations`, hoặc tìm thông tin) TRƯỚC KHI hỏi thông tin chi nhánh.
   - Có thể kiểm tra giá và thêm món nháp với branch_id="Chưa chọn". Sau khi khách chọn hình thức nhận mới xác định chi nhánh và kiểm tra tồn kho thực tế.
   - Giao tận nơi: lấy/xác nhận địa chỉ, tự tìm và chốt chi nhánh phục vụ phù hợp; không hỏi khách chọn chi nhánh.
   - Mang đi hoặc dùng tại chỗ: cho khách tìm/chọn cửa hàng, sau đó kiểm tra tồn kho tại cửa hàng đó.
2. Giá bán phải lấy từ tool check_price_and_stock. KHÔNG được tự bịa giá.
3. Chỉ thêm vào giỏ sau khi đã biết product_id và giá thật từ check_price_and_stock.
4. Khi khách muốn chốt đơn, gọi request_checkout() để hệ thống xác nhận tổng tiền.
5. Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Không dùng Markdown quá phức tạp.
5.1. TUYỆT ĐỐI KHÔNG nhúng ảnh hoặc URL ảnh vào câu trả lời chat (ví dụ: CẤM viết ![tên](url) hoặc dán URL https://... vào chat). Hình ảnh sản phẩm do giao diện web hiển thị riêng; bạn chỉ cần liệt kê tên và giá.
6. Khi khách hỏi về chính sách, FAQ, thành phần, khuyến mãi: gọi tool search_knowledge_base trước.
[QUAN TRỌNG NHẤT VỀ TRA CỨU]: 
- NẾU tool search_knowledge_base trả về kết quả hợp lệ (status="ok"): BẠN PHẢI dựa vào thông tin đó để trả lời tự nhiên. Tuyệt đối không tự suy diễn thêm thành phần hay hương vị ngoài dữ liệu được cung cấp.
- CHỈ KHI tool trả về rỗng (status="not_found"): BẠN BẮT BUỘC PHẢI DỪNG LẠI và trả lời ĐÚNG NGUYÊN VĂN câu sau: "Hiện mình chưa có thông tin mô tả chi tiết cho món này, bạn có thể xem trực tiếp trên trang sản phẩm hoặc hỏi nhân viên nhé". KHÔNG xin lỗi, KHÔNG giải thích thêm.
7. Khi khách hỏi gợi ý món ngon hoặc bán chạy: gọi tool get_recommendations (mặc định criteria="hot"). Nếu khách nêu nhóm cụ thể như "trà trái cây", "cold brew", "bánh ngọt", bắt buộc truyền nguyên nhóm đó vào `search_text`; không được lấy đồ uống chung rồi tự gắn nhãn nhóm. NẾU khách hỏi món "đánh giá cao", "5 sao", phải truyền criteria="rating". Tương tự, nếu khách hỏi chi nhánh hoặc kiosk nào được đánh giá cao, BẠN BẮT BUỘC gọi tool get_top_rated_stores. Khách có thể hỏi "kiosk nhượng quyền đánh giá cao", lúc này dùng get_top_rated_stores chứ KHÔNG dùng search_knowledge_base. Nếu khách yêu cầu xem/đọc NỘI DUNG bình luận, đánh giá, nhận xét của một chi nhánh/kiosk cụ thể (hoặc các chi nhánh vừa liệt kê), BẠN BẮT BUỘC gọi tool get_store_reviews (truyền tên chi nhánh/kiosk vào).
8. Khi khách hỏi ĐÁNH GIÁ (review) về một món CỤ THỂ (ví dụ: "Americano Mơ đánh giá sao"): BẮT BUỘC phải gọi trực tiếp `get_product_insights` với tham số `product_name` là tên món đó (ví dụ "Americano Mơ"). NẾU tool báo chưa có đánh giá, BẠN PHẢI TRẢ LỜI THẲNG THẮN VÀ TRUNG THỰC cho khách biết là chưa có đánh giá nào, TUYỆT ĐỐI KHÔNG nói vòng vo hay lảng tránh sang chuyện khác.
9. KHÔNG cam kết hoàn tiền, giảm giá hay điều chỉnh giá ngoài những gì hệ thống cho phép.
10. Khi gợi ý thêm món (Upsell), TUYỆT ĐỐI KHÔNG tự ý bịa ra topping cho đồ ăn (ví dụ: cấm gợi ý thêm hạt sen, trân châu, socola... vào bánh mì, bánh ngọt). Topping chỉ dành cho đồ uống nếu món đó thực sự có. Chỉ báo giá thực tế lấy từ hệ thống chứ không tự bịa khuyến mãi. TUYỆT ĐỐI KHÔNG tự bịa ra các gói nhượng quyền (franchise).
11. BẢO MẬT: TUYỆT ĐỐI KHÔNG tiết lộ tên các công cụ (tools) nội bộ cho khách. Việc gọi tool là nhiệm vụ ngầm của bạn.
12. QUY TRÌNH ĐẶT HÀNG (STATE MACHINE - ĐỌC KỸ TRƯỚC KHI LÀM):
    [GUARDRAIL GIỎ TRỐNG]: NẾU giỏ hàng hiện tại TRỐNG (xem "THÔNG TIN PHIÊN HIỆN TẠI" phía dưới) mà khách yêu cầu "thanh toán", "chốt đơn", "đặt hàng", "checkout": BẠN BẮT BUỘC PHẢI nói "Hiện giỏ hàng đang trống. Bạn muốn chọn món trước không?" và gợi ý. TUYỆT ĐỐI KHÔNG được hỏi phương thức thanh toán, hình thức nhận hàng, hoặc hiện nút thanh toán khi giỏ hàng chưa có món nào.
    Khi khách yêu cầu mua hàng hoặc chốt đơn, BẠN BẮT BUỘC phải làm ĐÚNG TRÌNH TỰ SAU:
    - BƯỚC 1 (CHỌN MÓN & GIỎ HÀNG): 
        + Khi khách chọn món, ĐỐI VỚI ĐỒ UỐNG, BẠN BẮT BUỘC gọi `get_product_options` để liệt kê các tùy chọn (size, topping, lượng đá, độ ngọt...) và hỏi khách trước khi thêm vào giỏ. TUYỆT ĐỐI KHÔNG tự ý gán tùy chọn mặc định nếu chưa hỏi khách.
        + Sau khi khách đã chọn đủ tùy chọn, gọi `check_price_and_stock` và `add_to_cart` cho TỪNG MÓN. (Nếu có 2 món, gọi tool 2 lần riêng biệt, TUYỆT ĐỐI KHÔNG gộp chung). KHÔNG báo cáo đã thêm nếu chưa gọi tool thành công.
        + Khi đã thêm món vào giỏ, TUYỆT ĐỐI KHÔNG tự động nhảy sang hỏi Hình thức nhận hàng hay Phương thức thanh toán. CHỈ TÓM TẮT GIỎ HÀNG VÀ CHỜ KHÁCH YÊU CẦU ĐẶT HÀNG / THANH TOÁN (hoặc hỏi khách có muốn thêm món gì không). TUYỆT ĐỐI KHÔNG HỎI khách chọn chi nhánh trong BƯỚC 1.
    - BƯỚC 2 (HÌNH THỨC NHẬN HÀNG): CHỈ KHI khách bảo "tiến hành đặt hàng", "thanh toán", "chốt đơn", BẠN MỚI BẮT ĐẦU hỏi khách chọn hình thức nhận hàng (Giao tận nơi, Mang đi, hay Dùng tại chỗ).
    - BƯỚC 3 (ĐỊA CHỈ & CHI NHÁNH):
        + NẾU KHÁCH CHỌN GIAO TẬN NƠI: NGAY LẬP TỨC gọi `get_user_profile` lấy địa chỉ giao hàng. KHÔNG ĐƯỢC PHÉP HỎI KHÁCH CHI NHÁNH NÀO CẢ. Sau khi có địa chỉ, BẠN CHỈ ĐƯỢC HỎI: "Bạn có muốn giao đến địa chỉ [địa chỉ] không?". Nếu khách đồng ý, dùng địa chỉ đó gọi `find_nearest_branch` rồi NGAY LẬP TỨC gọi `set_session_branch` để chốt chi nhánh.
        + NẾU KHÁCH CHỌN MANG ĐI / TẠI CHỖ: Nếu hồ sơ có địa chỉ mặc định, hỏi tự nhiên "Bạn đang ở địa chỉ [địa chỉ đã lưu] hay một địa chỉ khác?". Nếu khách xác nhận thì dùng địa chỉ đó; nếu không thì nhận địa chỉ mới. Gọi `find_nearest_branch`, liệt kê các cửa hàng gần nhất và BẮT BUỘC chờ khách chọn một cửa hàng rồi mới gọi `set_session_branch`. Không tự chọn cửa hàng gần nhất hộ khách.
    - BƯỚC 4 (MÃ GIẢM GIÁ & THANH TOÁN): 
        + NẾU khách yêu cầu áp mã giảm giá, gọi `get_applicable_vouchers` để liệt kê, khách chọn thì gọi `apply_voucher`.
        + Hỏi khách chọn phương thức thanh toán (VNPAY, QR ngân hàng, Ví Avengers, Tiền mặt/COD). Ghi nhận đúng lựa chọn của khách.
    - BƯỚC 5 (TÓM TẮT & CHỐT ĐƠN): Khi đã đủ Món, Hình thức nhận, Chi nhánh và Thanh toán, BẠN BẮT BUỘC phải gọi tool `request_checkout` (truyền ĐÚNG tham số `payment_method` và `delivery_type` khách đã chọn) để hệ thống tóm tắt đơn hàng thay bạn. NẾU khách thay đổi phương thức thanh toán hoặc giao hàng sau khi đã tóm tắt, BẠN BẮT BUỘC phải gọi LẠI `request_checkout` để cập nhật. Khi khách nói "Đồng ý/Chốt đơn" với bản tóm tắt CUỐI CÙNG, BẠN BẮT BUỘC phải gọi `confirm_checkout` để sinh mã đơn.
13. Khi khách yêu cầu hủy/sửa đơn, gọi `get_order_history` tìm mã đơn. Nếu khách CHƯA xác nhận, gọi `cancel_order` hoặc `update_order` với `is_confirmed=False` và BÁO KHÁCH. NẾU KHÁCH ĐÃ NHẮN "ĐỒNG Ý" hoặc xác nhận hủy, BẮT BUỘC gọi với `is_confirmed=True` để thực thi. KHÔNG gọi ask_branch.
14. Khi tư vấn quán gần nhất từ tool `find_nearest_branch`, BẢT BUỘC phải đọc đúng số km (`khoang_cach_km`) mà tool trả về (ví dụ "cách bạn khoảng 2.3km"). TUYỆT ĐỐI KHÔNG tự bịa khoảng cách hay làm tròn sai lệch. Nếu tool có trả về warning "Chi nhánh gần nhất cũng cách tới...", HÃY báo rõ là khu vực của khách không có chi nhánh, và các gợi ý này khá xa.
15. NẾU KHÁCH YÊU CẦU SO SÁNH khoảng cách giữa các chi nhánh CỤ THỂ (ví dụ: "giữa 2 chi nhánh này cái nào gần tôi hơn", "chọn 1 trong 2 chi nhánh trên"), BẠN BẮT BUỘC PHẢI TRUYỀN tên các chi nhánh đó vào tham số `target_branches` của tool `find_nearest_branch`. TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG tham số này khi khách yêu cầu so sánh.
16. NẾU MỘT TOOL BÁO LỖI (status="error") thì HÃY BÁO LỖI ĐÓ CHO KHÁCH, TUYỆT ĐỐI KHÔNG GỌI LẠI TOOL ĐÓ NỮA VÀ DỪNG LẠI NGAY.
17. [QUAN TRỌNG VỀ TÌM CHI NHÁNH]: Nếu khách yêu cầu tìm chi nhánh (để uống tại quán/mang đi) mà CHƯA CUNG CẤP ĐỊA CHỈ, dùng địa chỉ hồ sơ như một GỢI Ý và hỏi khách có đang ở đó không; không mặc định vị trí hiện tại của khách. Nếu khách nhập địa chỉ mới, truyền đúng địa chỉ đó vào `find_nearest_branch`. Nếu bản đồ không xác định được địa chỉ, yêu cầu khách bổ sung số nhà/đường/phường/quận; không tự chọn một tọa độ gần đúng.
18. [QUAN TRỌNG NHẤT VỀ TÙY CHỌN SẢN PHẨM]: BẠN PHẢI GỌI TOOL `get_product_options` TRƯỚC TIÊN ĐỂ KIỂM TRA MÓN CÓ TÙY CHỌN KHÔNG.
    - NẾU CÓ, BẠN BẮT BUỘC PHẢI HỎI KHÁCH VÀ CHỜ KHÁCH CHỌN. TUYỆT ĐỐI KHÔNG được tự ý chọn đại, mặc định (ví dụ: tự chọn size M, tự chọn ít đá) hoặc bịa ra lựa chọn nếu khách chưa nói.
    - NẾU KHÔNG CÓ TÙY CHỌN HOẶC KHÁCH ĐÃ CHỌN XONG, tiến hành `check_price_and_stock` và `add_to_cart`. Phải truyền topping, lượng đá, độ ngọt và loại sữa vào đúng trường có cấu trúc; `note` chỉ dành cho ghi chú tự do khác.
19. Khi `get_recommendations` trả rỗng thật sự (báo lỗi status=not_found), BẠN BẮT BUỘC phải chủ động gợi ý khách chuyển sang tham khảo danh mục khác (ví dụ từ thức uống sang đồ ăn) thay vì trả lời cụt lủn.
20. Khi khách chỉ hỏi một danh mục, gọi `get_recommendations` đúng 1 lần với danh mục đó. Khi khách yêu cầu cả bánh/đồ ăn VÀ nước/đồ uống, gọi 2 lần: một lần `category="food"` và một lần `category="drink"`. Chỉ được gắn nhãn “Bánh/Đồ ăn” hoặc “Nước/Đồ uống” theo đúng kết quả từng tool; không được tự phân loại tên món.
21. Khi hệ thống cung cấp dòng “LỰA CHỌN THEO SỐ ĐÃ GIẢI”, đó là ánh xạ chính xác từ danh sách bạn vừa đưa. Phải xử lý TẤT CẢ món trong dòng này, gọi `get_product_options` cho từng món và không được bỏ sót món thứ hai.
22. “Món đang chờ hoàn tất” là các món khách đã chọn nhưng chưa vào giỏ. Khi khách trả lời tùy chọn cho một món, vẫn phải tiếp tục xử lý các món còn lại; không được quên hoặc tự loại chúng.
23. Hệ thống hiện chưa có trường đặt giờ/giữ bàn. Nếu khách nói sẽ đến sau một khoảng thời gian hoặc vào một giờ cụ thể, phải nói rõ giới hạn này và hỏi khách muốn đặt ngay hay quay lại chốt gần giờ; không được âm thầm bỏ qua thời gian khách yêu cầu.
24. [VOUCHER / MÃ GIẢM GIÁ]:
    - TRƯỚC KHI gọi `request_checkout`, BẮT BUỘC gọi `get_applicable_vouchers` để kiểm tra xem có mã giảm giá nào áp dụng được không.
    - Nếu có mã khả dụng: liệt kê ngắn gọn (Tên [Mã: {{ma_voucher}}] + giảm dự kiến) và hỏi khách có muốn áp dụng không.
    - Nếu khách chọn mã hoặc tự nhập mã voucher: gọi `apply_voucher` với MÃ VOUCHER (`ma_voucher`), KHÔNG dùng tên voucher. Thực hiện TRƯỚC KHI gọi `request_checkout`.
    - Nếu khách muốn bỏ mã: gọi `remove_voucher`.
    - Trong tóm tắt đơn, luôn hiển thị: tổng gốc, số giảm (nếu có) và tổng thanh toán cuối cùng.
    - TUYỆT ĐỐI KHÔNG tự bịa ra mã giảm giá hay số tiền giảm.

THÔNG TIN PHIÊN HIỆN TẠI:
{session_context}"""


def _build_session_context(session_id: str) -> str:
    """Tóm tắt ngữ cảnh phiên hiện tại để nhét vào system prompt."""
    branch_id = cart_manager.get_branch(session_id)
    cart_text = cart_manager.cart_summary_text(session_id)
    prefs = cart_manager.get_checkout_prefs(session_id)
    branch_info = f"Chi nhánh đang chọn: {branch_id}" if branch_id else "Chi nhánh: Chưa chọn"
    choices = []
    if prefs.get("payment_method"):
        choices.append(f"Khách đã chọn thanh toán: {prefs['payment_method']}")
    if prefs.get("delivery_type"):
        choices.append(f"Khách đã chọn hình thức nhận: {prefs['delivery_type']}")
    pending_products = prefs.get("pending_products") or []
    if pending_products:
        choices.append(
            "Món đang chờ hoàn tất: "
            + ", ".join(str(item.get("product_name")) for item in pending_products)
        )
    choice_context = "\n".join(choices) if choices else "Thanh toán/hình thức nhận: Chưa được khách chọn"
    return f"{branch_info}\nGiỏ hàng hiện tại:\n{cart_text}\n{choice_context}"


def _payment_methods_text() -> str:
    return (
        "Phương thức thanh toán:\n"
        "1. VNPAY — ATM / Internet Banking\n"
        "2. Chuyển khoản QR ngân hàng\n"
        "3. Ví Avengers\n"
        "4. Tiền mặt (COD)"
    )


def _checkout_choices_prompt(session_id: str, prefix: str = "") -> str:
    prefs = cart_manager.get_checkout_prefs(session_id)
    blocks: List[str] = []
    if not prefs.get("delivery_type"):
        blocks.append(
            "Hình thức nhận hàng:\n"
            "1. Giao tận nơi\n2. Lấy tại quán\n3. Dùng tại chỗ"
        )
    if not prefs.get("payment_method"):
        blocks.append(_payment_methods_text())
    if not blocks:
        return prefix.strip()
    question = "Bạn chọn giúp mình " + (
        "hình thức nhận hàng và phương thức thanh toán nhé."
        if len(blocks) == 2 else
        ("hình thức nhận hàng nhé." if not prefs.get("delivery_type") else "phương thức thanh toán nhé.")
    )
    return "\n\n".join(part for part in [prefix.strip(), *blocks, question] if part)


def _format_cart_quote(session_id: str, quote_result: Dict[str, Any]) -> str:
    quote = quote_result.get("quote") or {}
    items = quote.get("items") or quote_result.get("cart", {}).get("items") or []
    lines = ["Giỏ hàng hiện tại:"]
    for item in items:
        name = item.get("ten_san_pham") or item.get("product_name") or "Sản phẩm"
        quantity = int(item.get("so_luong") or item.get("quantity") or 1)
        unit_price = float(item.get("unit_price") or item.get("gia_ban") or 0)
        option_parts = []
        size = item.get("size") or item.get("kich_co")
        if size:
            option_parts.append(f"Size: {size}")
        toppings = item.get("toppings") or []
        if toppings:
            option_parts.append("Topping: " + ", ".join(str(value) for value in toppings))
        if item.get("luong_da"):
            option_parts.append(str(item["luong_da"]))
        if item.get("do_ngot"):
            option_parts.append(str(item["do_ngot"]))
        options = f" ({'; '.join(option_parts)})" if option_parts else ""
        line_total = float(item.get("line_total") or unit_price * quantity)
        lines.append(f"- {name} x{quantity}{options}: {line_total:,.0f}đ".replace(",", "."))

    subtotal = float(quote.get("subtotal") or 0)
    discount = float(quote.get("discount_amount") or 0)
    final_total = float(quote.get("final_total") if quote.get("final_total") is not None else subtotal - discount)
    lines.append(f"Tổng gốc: {subtotal:,.0f}đ".replace(",", "."))
    voucher_code = quote.get("voucher_code")
    if voucher_code or discount:
        lines.append(f"Giảm giá{f' ({voucher_code})' if voucher_code else ''}: -{discount:,.0f}đ".replace(",", "."))
    delivery_fee = float(quote.get("delivery_fee") or 0)
    if delivery_fee:
        lines.append(f"Phí giao hàng: {delivery_fee:,.0f}đ".replace(",", "."))
    lines.append(f"Tổng thanh toán: {final_total + delivery_fee:,.0f}đ".replace(",", "."))
    return "\n".join(lines)


def _conversation_scope_session_id(session_id: str, conversation_id: Optional[str]) -> str:
    """Namespace AI-only draft state by conversation; order cart stays user-scoped."""
    if not conversation_id:
        return session_id
    return f"{session_id}:conversation:{conversation_id}"


def _normalize_chat_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").lower())
    without_marks = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", without_marks.replace("đ", "d")).strip()


def _explicit_checkout_choices(message: str) -> Dict[str, str]:
    """Capture clear choices early; questions and negated choices are not selections."""
    text = _normalize_chat_text(message)
    result: Dict[str, str] = {}
    question = text.endswith("?") or bool(re.search(r"\b(co|duoc|phai)\b.*\b(khong|ko)\s*$", text))

    cash_terms = ("tien mat", "cod", "cash", "thanh toan khi nhan hang")
    wallet_terms = ("vnpay", "ngan hang qr", "chuyen khoan", "vi dien tu", "vi avengers")
    delivery_map = {
        "GIAO_TAN_NOI": ("giao tan noi", "giao hang", "ship toi", "ship tan nha"),
        "MANG_DI": ("mang di", "den lay", "tu den lay", "lay tai quan", "nhan tai quan", "takeaway"),
        "TAI_CHO": ("tai cho", "dung tai quan", "uong tai quan", "dine in"),
    }

    if not question:
        if any(term in text for term in cash_terms) and not re.search(
            r"\b(?:khong|ko)\s+(?:(?:muon|chon|dung)\s+)?(?:tien mat|cod|cash)\b",
            text,
        ):
            result["payment_method"] = "THANH_TOAN_KHI_NHAN_HANG"
        elif "vnpay" in text and not re.search(r"\b(?:khong|ko|dung dung)\s+(?:dung\s+)?vnpay\b", text):
            result["payment_method"] = "VNPAY"
        elif ("ngan hang qr" in text or "chuyen khoan" in text) and not re.search(r"\b(?:khong|ko|dung dung)\s+(?:dung\s+)?(ngan hang|chuyen khoan)\b", text):
            result["payment_method"] = "NGAN_HANG_QR"
        elif ("vi avengers" in text or "vi dien tu" in text) and not re.search(r"\b(?:khong|ko|dung dung)\s+(?:dung\s+)?vi\b", text):
            result["payment_method"] = "VI_DIEN_TU"

        delivery_candidates = []
        for method, terms in delivery_map.items():
            for term in terms:
                start = text.rfind(term)
                if start < 0:
                    continue
                prefix = text[max(0, start - 24):start]
                if re.search(r"\b(khong|ko|dung dung)\b[^,;.!?]{0,20}$", prefix):
                    continue
                delivery_candidates.append((start, method))
        if delivery_candidates:
            result["delivery_type"] = max(delivery_candidates)[1]
    return result


def _is_plain_confirmation(message: str) -> bool:
    text = _normalize_chat_text(message).strip(" !.,")
    if not text or "?" in str(message or ""):
        return False
    if re.search(r"\b(nhung|doi|them|bot|bo|sua|huy|khoan|chua|khong|dung lai|dung dat)\b", text):
        return False

    exact_phrases = {
        "dong y", "dong y chot don", "dong y dat hang",
        "xac nhan", "xac nhan dat hang", "xac nhan chot don",
        "ok", "oke", "okay", "chot", "chot don", "dat di", "dat luon",
        "tien hanh", "on roi", "dung roi", "chuan roi",
    }
    if text in exact_phrases:
        return True

    has_affirmation = bool(re.search(
        r"\b(dong y|xac nhan|ok|oke|okay|duoc roi|on roi|dung roi|chuan roi|yes)\b",
        text,
    ))
    has_checkout_action = bool(re.search(
        r"\b(chot|chot don|dat hang|dat don|dat di|dat luon|tien hanh)\b",
        text,
    ))
    has_imperative = bool(re.search(r"\b(di|luon|nhe|thoi)\b", text))
    return has_checkout_action and (has_affirmation or has_imperative)


def _last_assistant_content(history: List[Dict[str, str]]) -> str:
    return next((str(item.get("content") or "") for item in reversed(history) if item.get("role") == "assistant"), "")


def _extract_additional_product_name(message: str) -> Optional[str]:
    """Extract an explicit product from requests such as 'mua thêm Bánh X nữa'."""
    if "topping" in _normalize_chat_text(message):
        return None
    match = re.search(r"(?:mua\s+thêm|thêm\s+món)\s+(.+)$", str(message or ""), re.IGNORECASE)
    if not match:
        return None
    name = re.sub(
        r"\s+(?:nữa|với|đi|nhé|nha|cho\s+(?:mình|tôi))\s*[.!?]*$",
        "",
        match.group(1).strip(),
        flags=re.IGNORECASE,
    ).strip(" ,.!?")
    return name or None


def _future_fulfillment_request(message: str) -> Optional[str]:
    normalized = _normalize_chat_text(message)
    match = re.search(
        r"\b(\d+\s*(?:tieng|gio|phut)\s*nua|(?:luc|vao)\s*\d{1,2}(?::\d{2})?\s*(?:gio|h)?)\b",
        normalized,
    )
    return match.group(1) if match else None


def _wants_checkout(message: str) -> bool:
    normalized = _normalize_chat_text(message)
    return bool(re.search(
        r"\b(chot(?:\s+don)?|dat\s+(?:hang|don|luon|di)|thanh\s+toan|checkout|tien\s+hanh)\b",
        normalized,
    )) and not bool(re.search(r"\b(chua|khong|dung|khoan|dung lai|dung dat)\b", normalized))


def _allows_cart_add(message: str, session_id: str) -> bool:
    normalized = _normalize_chat_text(message)
    explicit = bool(re.search(
        r"\b(mua|them(?:\s+mon)?|cho\s+(?:toi|minh)|lay|chon|dat)\b",
        normalized,
    ))
    pending = bool(cart_manager.get_checkout_prefs(session_id).get("pending_products"))
    supplies_options = bool(re.search(
        r"\b(size|nho|vua|lon|da|duong|ngot|sua|topping|hat|foam|tran chau|mac dinh|theo cong thuc)\b",
        normalized,
    ))
    return explicit or (pending and supplies_options)


def _product_review_query(message: str) -> Optional[str]:
    normalized = _normalize_chat_text(message)
    if not re.search(r"\b(danh gia|review|nhan xet|bao nhieu sao)\b", normalized):
        return None
    if re.search(r"\b(chi nhanh|cua hang|quan|kiosk)\b", normalized):
        return None
    raw = str(message or "").strip()
    patterns = [
        r"(?:sản phẩm|món)\s+(.+?)(?:\s+(?:được\s+)?(?:đánh giá|review|nhận xét|bao nhiêu sao).*)?$",
        r"(?:cho\s+(?:tôi|mình)\s+)?(?:đánh giá|review|nhận xét)\s+(?:chi tiết\s+)?(?:về|cho)\s+(.+)$",
        r"(?:đánh giá|review|nhận xét)(?:\s+của)?(?:\s+sản phẩm|\s+món)?\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw, re.IGNORECASE)
        if match:
            query = re.sub(r"[?.!]+$", "", match.group(1)).strip()
            query = re.sub(
                r"\s+(?:thế\s+nào|ra\s+sao|như\s+thế\s+nào|đi|nhé|nha|vậy)$",
                "",
                query,
                flags=re.IGNORECASE,
            ).strip()
            if query and _normalize_chat_text(query) not in {"cao", "cao nhat", "tot", "nao"}:
                return query
    return None


def _has_product_review_intent(message: str) -> bool:
    normalized = _normalize_chat_text(message)
    return bool(re.search(r"\b(danh gia|review|nhan xet|bao nhieu sao)\b", normalized)) and not bool(
        re.search(r"\b(chi nhanh|cua hang|quan|kiosk)\b", normalized)
    )


def _advance_checkout_if_ready(session_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministically continue a previously requested checkout in one turn."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    if not prefs.get("checkout_requested") or result.get("checkout_payload"):
        return result
    cart = cart_manager.get_cart(session_id)
    if cart.get("is_empty") or prefs.get("pending_products"):
        return result
    required = [prefs.get("payment_method"), prefs.get("delivery_type"), cart.get("branch_id")]
    if prefs.get("delivery_type") == "GIAO_TAN_NOI":
        required.append(prefs.get("delivery_address"))
    if not all(required):
        return result

    # Customer has now supplied the choices that begin checkout; a new draft
    # must not keep the previous chat's staged products or payment/location asks.
    cart_manager.set_checkout_context(session_id, pending_products=None)

    logs = list(result.get("tool_calls_log") or [])
    if not prefs.get("voucher_decided"):
        from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
        voucher_result = execute_get_applicable_vouchers(session_id)
        logs.append({"tool": "get_applicable_vouchers", "result": voucher_result})
        if voucher_result.get("status") == "ok" and voucher_result.get("vouchers"):
            cart_manager.set_checkout_context(
                session_id,
                voucher_offer_pending=True,
                voucher_candidates=[
                    {
                        "ma_voucher": voucher.get("ma_voucher"),
                        "ten_voucher": voucher.get("ten_voucher"),
                        "so_tien_giam_du_kien": voucher.get("so_tien_giam_du_kien"),
                    }
                    for voucher in voucher_result["vouchers"][:4]
                ],
            )
            try:
                cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(voucher_result["vouchers"])})
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("set_pending_action select_voucher failed: %s", e)
            lines = ["Giỏ hiện có các mã dùng được:"]
            for voucher in voucher_result["vouchers"][:4]:
                discount = f"{float(voucher.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
                lines.append(f"- {voucher.get('ten_voucher')} [Mã: {voucher.get('ma_voucher')}] — giảm dự kiến {discount}đ")
            lines.append("Bạn chọn mã nào, hay không dùng mã để mình chốt tóm tắt?")
            return {**result, "reply": "\n".join(lines), "tool_calls_log": logs}
        cart_manager.set_checkout_context(session_id, voucher_decided=True, voucher_offer_pending=None)
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action select_voucher (no_more_vouchers early) failed: %s", e)

    from src.function_calling.tools.cart_tools import execute_request_checkout
    cart_manager.set_checkout_context(session_id, checkout_requested=None)
    checkout = execute_request_checkout(session_id)
    logs.append({"tool": "request_checkout", "result": checkout})
    if checkout.get("status") == "require_confirmation":
        return {
            **result,
            "reply": checkout.get("message", "Bạn kiểm tra và xác nhận đơn hàng."),
            "checkout_payload": checkout.get("order_summary"),
            "tool_calls_log": logs,
        }
    return {**result, "reply": checkout.get("message", result.get("reply", "")), "tool_calls_log": logs}


def _resolve_pending_voucher_choice(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve “mã số 2” against the last server-stored voucher offer.

    Voucher ordinals must never fall through to the product ordinal parser.
    """
    prefs = cart_manager.get_checkout_prefs(session_id)
    candidates = list(prefs.get("voucher_candidates") or [])
    normalized = _normalize_chat_text(message)
    asks_best = bool(re.search(r"\b(tot nhat|ma tot|voucher tot|ap dung.*tot)\b", normalized))
    explicit_voucher_choice = asks_best or bool(re.search(
        r"\b(?:ap dung|chon|dung)\s+(?:ma|voucher)|\b(?:ma|voucher)\s*(?:so|thu)\s*\d+\b",
        normalized,
    ))
    if not candidates and asks_best:
        from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
        listed = execute_get_applicable_vouchers(session_id)
        candidates = list(listed.get("vouchers") or [])
        if candidates:
            cart_manager.set_checkout_context(session_id, voucher_candidates=candidates, voucher_offer_pending=True)
    if not candidates or (not prefs.get("voucher_offer_pending") and not explicit_voucher_choice):
        return None

    selected = candidates[0] if asks_best else None
    ordinal = re.search(r"\b(?:(?:ma|voucher)\s*(?:(?:so|thu)\s*)?|(?:so|thu)\s*)(\d+)\b", normalized)
    if ordinal:
        index = int(ordinal.group(1)) - 1
        if index < 0 or index >= len(candidates):
            return {
                "reply": f"Danh sách hiện có {len(candidates)} mã; bạn chọn lại số từ 1 đến {len(candidates)} nhé.",
                "checkout_payload": None,
                "tool_calls_log": [],
                "error": None,
            }
        selected = candidates[index]
    elif not selected:
        selected = next(
            (
                item for item in candidates
                if _normalize_chat_text(item.get("ma_voucher")) in normalized
                and item.get("ma_voucher")
            ),
            None,
        )
    if not selected:
        return None

    from src.function_calling.tools.voucher_tools import execute_apply_voucher
    code = str(selected.get("ma_voucher") or "").strip().upper()
    applied = execute_apply_voucher(session_id, code)
    logs = [{"tool": "apply_voucher", "args": {"voucher_code": code}, "result": applied}]
    if applied.get("status") not in {"ok", "already_applied"}:
        return {
            "reply": applied.get("message", f"Mã {code} hiện không áp dụng được; mình chưa gắn mã vào đơn."),
            "checkout_payload": None,
            "tool_calls_log": logs,
            "error": None,
        }

    cart_manager.set_checkout_context(
        session_id,
        voucher_decided=True,
        voucher_offer_pending=None,
        voucher_candidates=candidates,
    )
    try:
        cart_manager.clear_pending_action(session_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("clear_pending_action select_voucher (applied) failed: %s", e)
    result = {
        "reply": _checkout_choices_prompt(
            session_id,
            applied.get("message", f"Đã áp dụng mã {code}."),
        ),
        "checkout_payload": None,
        "tool_calls_log": logs,
        "error": None,
    }
    return _advance_checkout_if_ready(session_id, result)


def _handle_additional_product(session_id: str, product_query: str) -> Optional[Dict[str, Any]]:
    """Deterministically add a no-option product or ask for real options.

    This path prevents an LLM sentence saying "đã thêm" from getting ahead of
    the actual cart write, especially after a checkout summary already exists.
    """
    from src.function_calling.tools.product_tools import (
        execute_check_price_and_stock,
        execute_get_product_options,
    )
    from src.function_calling.tools.cart_tools import execute_add_to_cart

    cart = cart_manager.get_cart(session_id)
    if cart.get("is_empty"):
        return None

    option_result = execute_get_product_options(product_query)
    log = [{
        "tool": "get_product_options",
        "args": {"product_name": product_query},
        "result": option_result,
    }]
    if option_result.get("status") != "ok":
        return {
            "reply": option_result.get("message", "Mình chưa tìm thấy món bạn muốn thêm."),
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }

    found_name = str(option_result.get("product_name") or product_query)
    option_groups = option_result.get("options") or _parse_option_groups(option_result)
    if option_groups:
        cart_manager.set_pending_products(session_id, [{
            "product_name": found_name,
            "category": None,
            "options": {"groups": option_groups},
        }])
        try:
            cart_manager.set_pending_action(session_id, "fill_options", {})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("set_pending_action fill_options failed: %s", e)
        options = "\n".join(f"- {name}: {', '.join(values)}" for name, values in option_groups.items())
        return {
            "reply": f"{found_name} có các tùy chọn:\n{options}\nBạn chọn giúp mình trước khi thêm vào giỏ nhé.",
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }

    price_result = execute_check_price_and_stock(
        found_name,
        branch_id=str(cart.get("branch_id") or "Chưa chọn"),
        session_id=session_id,
    )
    log.append({
        "tool": "check_price_and_stock",
        "args": {"product_name_query": found_name, "branch_id": cart.get("branch_id") or "Chưa chọn"},
        "result": price_result,
    })
    products = price_result.get("products") or []
    exact = next(
        (item for item in products if _normalize_chat_text(item.get("product_name")) == _normalize_chat_text(found_name)),
        products[0] if len(products) == 1 else None,
    )
    if price_result.get("status") != "ok" or not exact:
        return {
            "reply": price_result.get("message", "Mình chưa xác định chắc chắn món cần thêm; bạn cho mình tên đầy đủ nhé."),
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }
    if exact.get("in_stock") is False:
        return {
            "reply": f"{found_name} hiện không đủ hàng tại {cart.get('branch_name')}. Mình chưa thêm món này vào giỏ.",
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }

    add_result = execute_add_to_cart(
        session_id=session_id,
        product_id=str(exact["product_id"]),
        product_name=str(exact["product_name"]),
        unit_price=float(exact["final_price"]),
    )
    log.append({"tool": "add_to_cart", "result": add_result})
    if add_result.get("status") != "ok":
        return {
            "reply": add_result.get("message", "Món chưa được thêm vào giỏ."),
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }
    updated = add_result["cart"]
    total = f"{float(updated['total_price']):,.0f}".replace(",", ".")
    return {
        "reply": (
            f"Mình đã thêm {exact['product_name']} vào giỏ sau khi kiểm tra tại "
            f"{updated.get('branch_name') or 'cửa hàng đã chọn'}. Tổng giỏ hiện là {total}đ. "
            "Mình sẽ lập lại bản tóm tắt trước khi bạn xác nhận."
        ),
        "checkout_payload": None,
        "tool_calls_log": log,
        "error": None,
    }


def _resolve_pending_branch_choice(
    session_id: str,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Optional[Dict[str, Any]]:
    prefs = cart_manager.get_checkout_prefs(session_id)
    candidates = prefs.get("branch_candidates") or []
    if not candidates:
        return None
    normalized = _normalize_chat_text(message)

    # If the user is referring to drinks, food, toppings or selecting menu items, do NOT match branch
    if re.search(r"\b(?:nuoc|do uong|banh|do an|mon|ly|phan|chai|size|da|duong|topping|thuc don|menu|tra|ca phe|matcha)\b", normalized):
        return None

    last_assistant_msg = _last_assistant_content(history or [])
    last_assistant_norm = _normalize_chat_text(last_assistant_msg)

    # Check whether the assistant was prompting for branch selection
    is_branch_prompt = any(
        kw in last_assistant_norm
        for kw in ["cua hang gan ban", "chon cua hang", "chon chi nhanh", "so may de minh", "cac cua hang", "chi nhanh"]
    )

    chosen = None
    number_match = re.search(r"\b(?:cua hang|chi nhanh|quan|so|thu)\s*(\d+)\b", normalized)
    if number_match:
        is_explicit_branch_word = bool(re.search(r"\b(?:cua hang|chi nhanh|quan)\s*(\d+)\b", normalized))
        if is_explicit_branch_word or is_branch_prompt:
            index = int(number_match.group(1)) - 1
            if 0 <= index < len(candidates):
                chosen = candidates[index]

    # Natural Vietnamese ordinal choices are common after the numbered branch
    # list. Resolve them here so they cannot fall through to the model and call
    # set_session_branch without the explicit-customer-selection flag.
    if not chosen and is_branch_prompt:
        ordinal_patterns = (
            (0, r"\b(?:dau tien|thu nhat|so mot|so 1|thu 1)\b"),
            (1, r"\b(?:thu hai|so hai|so 2|thu 2)\b"),
            (2, r"\b(?:thu ba|so ba|so 3|thu 3)\b"),
        )
        for index, pattern in ordinal_patterns:
            if re.search(pattern, normalized) and index < len(candidates):
                chosen = candidates[index]
                break

    if not chosen and is_branch_prompt:
        chosen = next(
            (
                item for item in candidates
                if _normalize_chat_text(item.get("branch_name")) in normalized
                or (
                    bool(str(item.get("branch_id") or "").strip())
                    and str(item.get("branch_id")).lower() in str(message or "").lower()
                )
            ),
            None,
        )
    if not chosen:
        return None

    from src.function_calling.tools.branch_tools import execute_set_session_branch
    branch_result = execute_set_session_branch(
        session_id,
        str(chosen["branch_id"]),
        str(chosen["branch_name"]),
        customer_selected=True,
    )
    if branch_result.get("status") == "ok":
        cart_manager.set_checkout_context(session_id, branch_candidates=None)
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action select_branch failed: %s", e)
    return {
        "reply": branch_result.get("message", "Mình chưa thể ghi nhận cửa hàng này."),
        "checkout_payload": None,
        "tool_calls_log": [{"tool": "set_session_branch", "result": branch_result}],
        "error": None,
    }


def _confirm_saved_location(
    session_id: str,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Optional[Dict[str, Any]]:
    prefs = cart_manager.get_checkout_prefs(session_id)
    suggested = str(prefs.get("suggested_address") or "").strip()
    if not suggested:
        return None
    normalized = _normalize_chat_text(message)

    # Do not treat product choices or options as address confirmations
    if re.search(
        r"\b(?:nuoc|do uong|banh|do an|mon|ly|phan|chai|size|it da|da rieng|luong da|duong|topping)\b",
        normalized,
    ):
        return None

    last_assistant_msg = _last_assistant_content(history or [])
    last_assistant_norm = _normalize_chat_text(last_assistant_msg)
    if not any(kw in last_assistant_norm for kw in ["dia chi da luu", "dang o dia chi", "dia chi nay hay", "dia chi cua ban"]):
        return None

    confirms = bool(re.search(
        r"\b(dung|dung roi|dia chi do|o do|dang o do|hien tai.*o do|dia chi da luu)\b",
        normalized,
    ))
    if not confirms:
        return None

    context = {"suggested_address": None, "location_address": suggested}
    if prefs.get("delivery_type") == "GIAO_TAN_NOI":
        cart_manager.set_checkout_prefs(session_id, delivery_address=suggested)
    cart_manager.set_checkout_context(session_id, **context)

    from src.function_calling.tools.branch_tools import (
        execute_find_nearest_branch,
        execute_set_session_branch,
    )
    nearest = execute_find_nearest_branch(location=suggested, session_id=session_id)
    log = [{"tool": "find_nearest_branch", "result": nearest}]
    branches = nearest.get("branches") or []
    if nearest.get("status") == "need_branch_selection" and branches:
        lines = [f"Mình đã dùng địa chỉ đã lưu: {suggested}. Các cửa hàng gần bạn:"]
        for index, item in enumerate(branches, 1):
            availability = ""
            if item.get("availability_status") == "unavailable":
                missing = ", ".join(item.get("unavailable_products") or [])
                availability = f" — chưa đủ hàng: {missing}"
            elif item.get("availability_status") == "unknown":
                availability = " — hệ thống chưa có dữ liệu tồn kho cho một số món"
            lines.append(
                f"{index}. {item['ten_chi_nhanh']} — {item.get('dia_chi') or 'chưa có địa chỉ'} "
                f"({item.get('khoang_cach_km')} km đường chim bay){availability}"
            )
        lines.append("Bạn chọn cửa hàng số mấy để mình kiểm tra tồn kho và chốt nơi phục vụ?")
        try:
            cart_manager.set_pending_action(session_id, "select_branch", {"count": len(branches)})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("set_pending_action select_branch failed: %s", e)
        return {"reply": "\n".join(lines), "checkout_payload": None, "tool_calls_log": log, "error": None}
    if nearest.get("status") == "ok" and branches and prefs.get("delivery_type") == "GIAO_TAN_NOI":
        chosen = branches[0]
        selected = execute_set_session_branch(
            session_id,
            str(chosen["ma_chi_nhanh"]),
            str(chosen["ten_chi_nhanh"]),
            customer_selected=True,
        )
        log.append({"tool": "set_session_branch", "result": selected})
        return {
            "reply": selected.get("message", "Mình chưa thể xác định cửa hàng phục vụ địa chỉ này."),
            "checkout_payload": None,
            "tool_calls_log": log,
            "error": None,
        }
    return {
        "reply": nearest.get("message", "Mình chưa xác định được cửa hàng gần địa chỉ này."),
        "checkout_payload": None,
        "tool_calls_log": log,
        "error": None,
    }


def _resolve_numbered_product_choices(
    user_message: str,
    history: List[Dict[str, str]],
) -> List[Dict[str, Any]]:
    """Resolve references such as 'nước số 1 và bánh số 1' or 'cho tôi nước số 1' from the last list."""
    requested_text = _normalize_chat_text(user_message)
    requested: List[tuple] = []
    for category, pattern in (
        ("drink", r"\b(?:nuoc|do uong|ly|chai)\s*(?:thi\s*)?(?:so|thu|#)?\s*(\d+)\b"),
        ("food", r"\b(?:banh|do an|mon an|dia|to|hop)\s*(?:thi\s*)?(?:so|thu|#)?\s*(\d+)\b"),
    ):
        matches = list(re.finditer(pattern, requested_text))
        if matches:
            requested.append((category, int(matches[-1].group(1))))

    # If the user explicitly named one category and says they mean two products,
    # infer the same ordinal in the other category (e.g. drink #1 + cake #1).
    if len(requested) == 1 and re.search(r"\b(?:2|hai)\s+(?:san pham|mon)\b", requested_text):
        mentioned_categories = [category for category, _ in requested]
        other_category = "food" if mentioned_categories[0] == "drink" else "drink"
        implicit_number = requested[0][1]
        requested.append((other_category, implicit_number))

    # Generic numbers like "cho tôi số 1", "chọn món 1", "lấy số 1"
    if not requested:
        for match in re.finditer(r"\b(?:mon|so|thu|#|chon|lay)\s*(\d+)\b", requested_text):
            requested.append(("any", int(match.group(1))))

    if not requested:
        return []

    # A customer may ask for reviews between the recommendation and the actual
    # numbered choice. Search backwards for the latest assistant message that
    # still contains a numbered food/drink menu instead of looking only at the
    # immediately previous review answer.
    assistant_text = ""
    for entry in reversed(history):
        if entry.get("role") != "assistant":
            continue
        content = str(entry.get("content") or "")
        content_norm = _normalize_chat_text(content)
        if re.search(r"(?:^|\n|\s)\d+[\.\)]\s*\S", content) and re.search(
            r"\b(banh|do an|mon an|nuoc|do uong|thuc uong|ca phe|tra)\b",
            content_norm,
        ):
            assistant_text = content
            break
    if not assistant_text:
        return []

    sections: Dict[str, Dict[int, str]] = {}
    drink_headings = r"Nước|Đồ uống|Thức uống|Trà(?:\s+trái\s+cây)?|Cà phê|Sinh tố"
    food_headings = r"(?:Món\s+)?Bánh|Đồ ăn|Thức ăn|Món ăn"
    all_headings = rf"{drink_headings}|{food_headings}"
    def _clean_extracted_product_name(raw_name: str) -> str:
        c_name = re.sub(r"\s+", " ", raw_name).strip(" \n\r\t-*")
        # Remove price info if any, e.g. " - 39.000đ" or "(39k)"
        c_name = re.sub(r"\s*[\(\-–—:]\s*\d+[\.,]?\d*\s*[kKđĐ].*$", "", c_name).strip(" \n\r\t-*")
        c_name = re.sub(r"\s+\d+[\.,]?\d*\s*[kKđĐ]\s*$", "", c_name).strip(" \n\r\t-*")
        return c_name

    # Accept both Markdown headings and compact one-line lists. Splitting by
    # headings first prevents duplicate ordinals in the food section from
    # overwriting drink ordinals (and vice versa).
    section_text = re.sub(r"\*{1,2}|#+\s*", "", assistant_text)
    heading_pattern = re.compile(
        rf"(?:^|\n|\s)({all_headings})\s*:\s*",
        re.IGNORECASE,
    )
    heading_matches = list(heading_pattern.finditer(section_text))
    for position, match in enumerate(heading_matches):
        heading = match.group(1)
        body_start = match.end()
        body_end = heading_matches[position + 1].start() if position + 1 < len(heading_matches) else len(section_text)
        body = re.split(r"\bBạn muốn\b", section_text[body_start:body_end], maxsplit=1, flags=re.IGNORECASE)[0]
        normalized_heading = _normalize_chat_text(heading)
        category = "food" if re.search(r"\b(banh|do an|thuc an|mon an)\b", normalized_heading) else "drink"
        items: Dict[int, str] = {}
        for number, name in re.findall(r"(?:^|\s)(\d+)\.\s*(.*?)(?=\s+\d+\.\s+|$)", body, re.DOTALL):
            cleaned_name = _clean_extracted_product_name(name)
            if cleaned_name:
                items[int(number)] = cleaned_name
        sections[category] = items

    all_numbered: Dict[int, str] = {}
    for number, name in re.findall(r"(?:^|\n|\s)(\d+)[\.\)]\s*([^\n\r]+)", assistant_text):
        cleaned_name = _clean_extracted_product_name(name)
        if cleaned_name and not cleaned_name.isdigit():
            all_numbered[int(number)] = cleaned_name

    norm_assist = _normalize_chat_text(assistant_text)
    inferred_category = "drink" if any(w in norm_assist for w in ["nuoc", "do uong", "ca phe", "tra", "latte", "bac xiu"]) else "food"

    resolved = []
    for category, number in requested:
        product_name = None
        if category in sections:
            product_name = sections[category].get(number)
        if not product_name and (category == inferred_category or category == "any"):
            product_name = all_numbered.get(number)
        # Never cross-fallback between explicitly named categories: duplicate
        # ordinals in the later section would otherwise overwrite the drink.
        if not product_name and category == "any":
            product_name = all_numbered.get(number)
        if product_name:
            final_cat = category if category in {"drink", "food"} else inferred_category
            resolved.append({"category": final_cat, "number": number, "product_name": product_name})
    # De-duplicate repeated product references while preserving customer order.
    seen = set()
    resolved = [item for item in resolved if not (
        _normalize_chat_text(item["product_name"]) in seen
        or seen.add(_normalize_chat_text(item["product_name"]))
    )]
    return resolved


def _parse_option_groups(option_result: Dict[str, Any]) -> Dict[str, List[str]]:
    groups = option_result.get("options")
    if isinstance(groups, dict):
        return {str(key): [str(value) for value in values] for key, values in groups.items()}
    message = str(option_result.get("message") or "")
    suffix = message.split("Các tùy chọn là:", 1)[-1]
    parsed: Dict[str, List[str]] = {}
    for name, values in re.findall(r"([^,:]+):\s*\[([^\]]*)\]", suffix):
        parsed[name.strip()] = [item.strip() for item in values.split(",") if item.strip()]
    return parsed


def _complete_pending_products_from_options(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Add all selected pending products once their options are answered."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    pending = list(prefs.get("pending_products") or [])
    if not pending:
        return None
    normalized = _normalize_chat_text(message)
    option_terms = r"\b(size|nho|vua|lon|da|duong|ngot|sua|topping|hat|foam|tran chau|khong chon|mac dinh|theo cong thuc)\b"
    if not re.search(option_terms, normalized):
        return None

    from src.function_calling.tools.product_tools import execute_check_price_and_stock
    from src.function_calling.tools.cart_tools import execute_add_to_cart

    logs: List[Dict[str, Any]] = []
    not_ready: List[str] = []
    added: List[Dict[str, Any]] = []
    remaining: List[Dict[str, Any]] = []
    prepared: List[tuple] = []
    use_defaults = bool(re.search(r"\b(theo mac dinh|mac dinh|theo cong thuc|khong can chinh)\b", normalized))
    for item in pending:
        product_name = str(item.get("product_name") or "")
        options = item.get("options") or {}
        selected: Dict[str, Any] = dict(item.get("selected_options") or {})
        option_groups = options.get("groups") or {}
        missing_required = []
        for group_name, values in option_groups.items():
            values = [str(value) for value in values]
            group_norm = _normalize_chat_text(group_name)
            is_size = "size" in group_norm or "kich thuoc" in group_norm
            matches = [value for value in values if _normalize_chat_text(value) in normalized]
            if is_size and len(values) == 1:
                matches = values
            if is_size and len(values) > 1 and not matches:
                missing_required.append(f"kích thước ({', '.join(values)})")
            elif len(values) > 1 and not matches and not use_defaults:
                if "topping" in group_norm and re.search(r"\b(khong topping|bo topping|khong them topping)\b", normalized):
                    selected["toppings"] = []
                else:
                    missing_required.append(f"{group_name} ({', '.join(values)})")
            if not matches:
                continue
            if is_size:
                selected["size"] = matches[0]
            elif "topping" in group_norm:
                selected["toppings"] = matches
            elif "da" in group_norm:
                selected["luong_da"] = matches[0]
            elif "ngot" in group_norm or "duong" in group_norm:
                selected["do_ngot"] = matches[0]
            elif "sua" in group_norm:
                selected["loai_sua"] = matches[0]

        if missing_required:
            not_ready.append(f"{product_name}: chọn {', '.join(missing_required)}")
            remaining.append({**item, "selected_options": selected})
            continue

        prepared.append((item, product_name, selected))

    # Keep all selected products pending until every required option has been
    # answered. This prevents adding only the easy line and silently dropping
    # another selected product.
    if not_ready:
        cart_manager.set_pending_products(session_id, remaining + [
            {**item, "selected_options": selected}
            for item, _product_name, selected in prepared
        ])
        return {
            "reply": "Mình vẫn đang giữ đủ các món bạn chọn. Cần chọn thêm:\n- " + "\n- ".join(not_ready),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    for item, product_name, selected in prepared:
        price_result = execute_check_price_and_stock(
            product_name_query=product_name,
            branch_id="Chưa chọn",
            size=selected.get("size"),
            quantity=max(1, int(item.get("quantity") or 1)),
            session_id=session_id,
        )
        logs.append({"tool": "check_price_and_stock", "args": {"product_name_query": product_name}, "result": price_result})
        products = price_result.get("products") or []
        exact = next(
            (product for product in products if _normalize_chat_text(product.get("product_name")) == _normalize_chat_text(product_name)),
            products[0] if len(products) == 1 else None,
        )
        if price_result.get("status") != "ok" or not exact:
            not_ready.append(f"{product_name}: chưa lấy được giá chính xác")
            remaining.append({**item, "selected_options": selected})
            continue
        add_result = execute_add_to_cart(
            session_id=session_id,
            product_id=str(exact["product_id"]),
            product_name=str(exact["product_name"]),
            unit_price=float(exact["final_price"]),
            quantity=max(1, int(item.get("quantity") or 1)),
            size=selected.get("size"),
            toppings=selected.get("toppings") or [],
            luong_da=selected.get("luong_da"),
            do_ngot=selected.get("do_ngot"),
            loai_sua=selected.get("loai_sua"),
        )
        logs.append({"tool": "add_to_cart", "args": {"product_name": product_name, "quantity": max(1, int(item.get("quantity") or 1)), **selected}, "result": add_result})
        if add_result.get("status") == "ok":
            added.append(add_result)
        else:
            not_ready.append(f"{product_name}: {add_result.get('message', 'chưa thêm được')}")
            remaining.append({**item, "selected_options": selected})

    cart_manager.set_pending_products(session_id, remaining)
    if not remaining:
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action fill_options failed: %s", e)
    if not_ready:
        return {
            "reply": "Mình vẫn đang giữ các món bạn chọn. Cần hoàn tất thêm:\n- " + "\n- ".join(not_ready),
            "checkout_payload": None,
            "tool_calls_log": logs,
            "error": None,
        }
    if not added:
        return None

    latest_cart = added[-1].get("cart") or cart_manager.get_cart(session_id)
    total = f"{float(latest_cart.get('total_price') or 0):,.0f}".replace(",", ".")
    reply_lines = [f"Mình đã thêm đủ {len(added)} món bạn chọn vào giỏ.", "Giỏ hàng hiện tại:"]
    for cart_item in latest_cart.get("items") or []:
        quantity = int(cart_item.get("quantity") or 1)
        line_total = float(cart_item.get("unit_price") or 0) * quantity
        line_total_text = f"{line_total:,.0f}".replace(",", ".")
        reply_lines.append(f"- {cart_item.get('product_name')} x{quantity}: {line_total_text}đ")
    reply_lines.append(f"Tổng giỏ hiện tại: {total}đ.")
    reply_lines.append("Bạn có muốn thêm món gì nữa không?")
    try:
        cart_manager.set_pending_action(session_id, "ask_more_items", {})
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("set_pending_action ask_more_items failed: %s", e)
    reply = "\n".join(reply_lines)
    return {"reply": reply, "checkout_payload": None, "tool_calls_log": logs, "error": None}





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

def _run_agent_impl(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
    max_tool_rounds: int = 10,
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

    # The customer cart is authoritative. Refresh before building context so
    # manual web-cart changes and chat changes cannot diverge.
    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        authoritative_cart = sync_authoritative_cart(session_id)
    except Exception as exc:
        logger.warning("[AgentService] Cannot refresh authoritative cart: %s", exc)
        authoritative_cart = cart_manager.get_cart(session_id)

    if _wants_checkout(user_message) and authoritative_cart.get("is_empty"):
        return {
            "reply": "Hiện giỏ hàng đang trống. Bạn muốn chọn món trước không? Mình có thể gợi ý bánh và nước cho bạn.",
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    if _wants_checkout(user_message) and not cart_manager.get_checkout_prefs(session_id).get("summary_fingerprint"):
        cart_manager.set_checkout_context(session_id, checkout_requested=True)

    user_norm = _normalize_chat_text(user_message)
    voucher_skipped = bool(re.search(r"\b(khong dung|bo qua|khong can)\b.*\b(ma|voucher|giam gia)\b", user_norm))
    if voucher_skipped:
        cart_manager.set_checkout_context(
            session_id,
            voucher_decided=True,
            voucher_offer_pending=None,
            voucher_candidates=None,
            voucher_code=None,
            discount_amount=None,
        )

    if _has_product_review_intent(user_message):
        review_choices = _resolve_numbered_product_choices(user_message, history or [])
        if review_choices:
            from src.function_calling.tools.product_tools import (
                execute_get_product_insights,
                execute_get_product_options,
            )
            logs = []
            reply_lines = []
            requested_to_buy = bool(re.search(
                r"\b(mua|them|chon|lay|dat)\b|\bcho toi\s+(?:nuoc|do uong|banh|do an)\b",
                _normalize_chat_text(user_message),
            ))
            option_questions = []
            enriched_review_choices = []
            if requested_to_buy:
                cart_manager.set_pending_products(session_id, review_choices, merge=True)
            for choice in review_choices:
                product_name = str(choice.get("product_name") or "").strip()
                review = execute_get_product_insights(product_name)
                logs.append({
                    "tool": "get_product_insights",
                    "args": {"product_name": product_name},
                    "result": review,
                })
                label = "Nước" if choice.get("category") == "drink" else "Bánh/đồ ăn"
                reply_lines.append(f"- {label} — {product_name}: {review.get('message', 'Chưa có dữ liệu đánh giá.')}")
                if requested_to_buy:
                    options = execute_get_product_options(product_name)
                    logs.append({"tool": "get_product_options", "args": {"product_name": product_name}, "result": options})
                    option_groups = _parse_option_groups(options)
                    enriched_review_choices.append({**choice, "options": {"groups": option_groups}})
                    if option_groups:
                        rendered = "; ".join(
                            f"{name}: {', '.join(str(value) for value in values)}"
                            for name, values in option_groups.items()
                        )
                        option_questions.append(f"- {product_name}: {rendered}")
                    else:
                        option_questions.append(f"- {product_name}: không có tùy chọn; dùng cấu hình mặc định của món.")
            if requested_to_buy:
                cart_manager.set_pending_products(session_id, enriched_review_choices)
                try:
                    cart_manager.set_pending_action(session_id, "fill_options", {"count": len(enriched_review_choices)})
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("set_pending_action fill_options failed: %s", e)
                reply_lines.append("Mình cũng đã giữ lại đủ các món bạn chọn để đặt. Đây là toàn bộ tùy chọn:")
                for choice, option_line in zip(enriched_review_choices, option_questions):
                    reply_lines.append(f"- {choice['product_name']}: {option_line}")
                reply_lines.append("Bạn chọn các tùy chọn mong muốn; món nào không cần chỉnh thì ghi rõ ‘theo mặc định’ nhé.")
            return {
                "reply": ("Đánh giá các món bạn hỏi:\n" if not requested_to_buy else "") + "\n".join(reply_lines),
                "checkout_payload": None,
                "tool_calls_log": logs,
                "error": None,
            }

    review_query = _product_review_query(user_message)
    if review_query:
        from src.function_calling.tools.product_tools import execute_get_product_insights
        review = execute_get_product_insights(review_query)
        return {
            "reply": review.get("message", "Mình chưa tra được đánh giá món này."),
            "checkout_payload": None,
            "tool_calls_log": [{"tool": "get_product_insights", "args": {"product_name": review_query}, "result": review}],
            "error": None,
        }

    wants_cart_summary = bool(re.search(
        r"\b(xac nhan lai|kiem tra lai|tom tat|xem lai)\b.*\b(gio|gio hang|gia|don)\b|\b(gio hang hien tai)\b",
        user_norm,
    ))
    if wants_cart_summary:
        from src.function_calling.tools.cart_tools import execute_get_cart_quote
        quote_result = execute_get_cart_quote(session_id)
        if quote_result.get("status") != "ok":
            reply = quote_result.get("message", "Mình chưa thể kiểm tra giỏ hàng lúc này.")
        else:
            reply = _checkout_choices_prompt(session_id, _format_cart_quote(session_id, quote_result))
        return {
            "reply": reply,
            "checkout_payload": None,
            "tool_calls_log": [{"tool": "get_cart_quote", "result": quote_result}],
            "error": None,
        }

    # A clear "nothing else" response closes product selection. It must not be
    # interpreted by the model as another add-to-cart request.
    no_more_items = bool(re.search(
        r"\b(khong them gi nua|khong can them gi|khong them mon nao|het roi)\b",
        _normalize_chat_text(user_message),
    ))
    if no_more_items and not cart_manager.get_cart(session_id).get("is_empty"):
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action ask_more_items (no_more_items) failed: %s", e)
        current_voucher = cart_manager.get_checkout_prefs(session_id).get("voucher_code")
        if current_voucher:
            return {
                "reply": _checkout_choices_prompt(
                    session_id,
                    f"Mình giữ nguyên giỏ hàng hiện tại. Mã {current_voucher} vẫn đang được áp dụng.",
                ),
                "checkout_payload": None,
                "tool_calls_log": [],
                "error": None,
            }
        from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
        voucher_result = execute_get_applicable_vouchers(session_id)
        logs = [{"tool": "get_applicable_vouchers", "result": voucher_result}]
        vouchers = voucher_result.get("vouchers") or []
        if voucher_result.get("status") == "ok" and vouchers:
            cart_manager.set_checkout_context(
                session_id,
                voucher_offer_pending=True,
                voucher_candidates=[{
                    "ma_voucher": item.get("ma_voucher"),
                    "ten_voucher": item.get("ten_voucher") or item.get("ten_chuong_trinh"),
                    "discount_amount": item.get("discount_amount") or item.get("so_tien_giam_du_kien") or item.get("so_tien_giam"),
                } for item in vouchers],
            )
            try:
                cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(vouchers)})
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("set_pending_action select_voucher failed: %s", e)
            lines = ["Mình giữ nguyên giỏ hàng hiện tại, không thêm món nào nữa.", "Các mã đang áp dụng được:"]
            for item in vouchers:
                code = item.get("ma_voucher") or ""
                name = item.get("ten_voucher") or item.get("ten_chuong_trinh") or code
                discount = item.get("discount_amount") or item.get("so_tien_giam_du_kien") or item.get("so_tien_giam")
                lines.append(f"- {name} [Mã: {code}]" + (f" — giảm {discount:,.0f}đ" if isinstance(discount, (int, float)) else ""))
            lines.append("Bạn muốn áp dụng mã nào? Nếu chưa muốn dùng mã, cứ nói bỏ qua.")
            return {"reply": "\n".join(lines), "checkout_payload": None, "tool_calls_log": logs, "error": None}
        cart_manager.set_checkout_context(session_id, voucher_decided=True)
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action select_voucher (no_more_items) failed: %s", e)
        return {
            "reply": _checkout_choices_prompt(
                session_id,
                "Mình giữ nguyên giỏ hàng hiện tại. Hiện không có mã giảm giá phù hợp.",
            ),
            "checkout_payload": None,
            "tool_calls_log": logs,
            "error": None,
        }

    # Keep explicit payment/delivery choices even when the customer mentions them
    # before choosing any products. Questions do not count as a selection.
    choices = _explicit_checkout_choices(user_message)
    if choices:
        old_delivery = cart_manager.get_checkout_prefs(session_id).get("delivery_type")
        if choices.get("delivery_type") and choices["delivery_type"] != old_delivery:
            cart_manager.clear_branch(session_id)
            try:
                cart_manager.clear_pending_action(session_id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("clear_pending_action for changed delivery_type failed: %s", e)
        cart_manager.set_checkout_prefs(session_id, **choices)

    voucher_choice = _resolve_pending_voucher_choice(session_id, user_message)
    if voucher_choice:
        return voucher_choice

    if voucher_skipped:
        return {
            "reply": _checkout_choices_prompt(session_id, "Mình sẽ không áp dụng mã giảm giá cho đơn này."),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    if _wants_checkout(user_message):
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action ask_more_items (wants_checkout) failed: %s", e)
        prefs_now = cart_manager.get_checkout_prefs(session_id)
        if not prefs_now.get("voucher_decided"):
            from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
            voucher_result = execute_get_applicable_vouchers(session_id)
            vouchers = list(voucher_result.get("vouchers") or [])
            if vouchers:
                cart_manager.set_checkout_context(
                    session_id,
                    voucher_offer_pending=True,
                    voucher_candidates=vouchers,
                )
                try:
                    cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(vouchers)})
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("set_pending_action select_voucher (wants_checkout) failed: %s", e)
                lines = ["Trước khi đặt hàng, bạn có các mã dùng được:"]
                for voucher in vouchers[:4]:
                    discount = f"{float(voucher.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
                    lines.append(f"- {voucher.get('ten_voucher')} [Mã: {voucher.get('ma_voucher')}] — giảm {discount}đ")
                lines.append("Bạn chọn mã nào, chọn mã tốt nhất, hoặc nói bỏ qua mã nhé.")
                return {
                    "reply": "\n".join(lines),
                    "checkout_payload": None,
                    "tool_calls_log": [{"tool": "get_applicable_vouchers", "result": voucher_result}],
                    "error": None,
                }
            cart_manager.set_checkout_context(session_id, voucher_decided=True)
            try:
                cart_manager.clear_pending_action(session_id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("clear_pending_action select_voucher (before checkout) failed: %s", e)
        missing_prompt = _checkout_choices_prompt(session_id)
        if missing_prompt:
            return {"reply": missing_prompt, "checkout_payload": None, "tool_calls_log": [], "error": None}

    if choices and not (choices.get("delivery_type") or cart_manager.get_checkout_prefs(session_id).get("delivery_type")):
        return {
            "reply": _checkout_choices_prompt(session_id, "Mình đã ghi nhận phương thức thanh toán."),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    requested_time = _future_fulfillment_request(user_message)
    selected_delivery = choices.get("delivery_type") or cart_manager.get_checkout_prefs(session_id).get("delivery_type")
    if requested_time and selected_delivery in {"MANG_DI", "TAI_CHO"}:
        return {
            "reply": (
                "Mình đã ghi nhận hình thức nhận tại cửa hàng. Tuy nhiên hệ thống hiện chưa hỗ trợ "
                "đặt giờ hoặc giữ bàn, nên mình không thể cam kết chuẩn bị đúng thời điểm bạn nêu. "
                "Bạn muốn đặt ngay, hay quay lại chốt đơn gần giờ bạn đến?"
            ),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    last_assistant_msg = _last_assistant_content(history or [])
    last_msg_lower = _normalize_chat_text(last_assistant_msg)

    # Resolve a pending cancellation before looking for checkout confirmation.
    # This prevents "đồng ý" from a cancel preview creating an unrelated order.
    if "xac nhan huy" in last_msg_lower:
        import os
        use_t1 = os.getenv("USE_T1_CONFIRM", "false").lower() == "true"
        if use_t1:
            pending = cart_manager.get_pending_action(session_id)
            pending_type = pending.get("type") if pending else "confirm_cancel"
            from src.agents.tier1 import classify_confirmation
            classification = classify_confirmation(user_message, pending_type)
            is_yes = (classification == "YES")
            is_ambiguous = (classification == "AMBIGUOUS")
        else:
            is_yes = _is_plain_confirmation(user_message)
            is_ambiguous = False

        if is_ambiguous:
            return {
                "reply": "Bạn có xác nhận hủy đơn hay không? Vui lòng trả lời rõ 'có' hoặc 'không' nhé.",
                "gate": "confirm_cancel_ambiguous",
                "checkout_payload": None,
                "tool_calls_log": [],
                "error": None
            }

        if is_yes:
            match = re.search(r"don hang ([\w\-]+) khong", last_msg_lower)
            if not match:
                match = re.search(r"([\w\-]{36})", last_assistant_msg)
            if match:
                from src.function_calling.tools.order_tools import execute_cancel_order
                order_id = match.group(1)
                cancel_res = execute_cancel_order(session_id, order_id, is_confirmed=True)
                reply = (f"✅ Đơn hàng **{order_id}** đã được hủy thành công."
                         if cancel_res.get("status") == "success"
                         else f"❌ Chưa thể hủy đơn hàng: {cancel_res.get('message', 'Lỗi không xác định')}.")
                return {"reply": reply, "gate": "confirm_cancel", "checkout_payload": None,
                        "tool_calls_log": [{"tool": "cancel_order", "result": cancel_res}], "error": None}

    prefs = cart_manager.get_checkout_prefs(session_id)

    # Clear stale checkout context if cart is empty so previous location/branch candidates cannot hijack item selection
    cart = cart_manager.get_cart(session_id)
    if cart.get("is_empty"):
        cart_manager.set_checkout_context(session_id, branch_candidates=None, suggested_address=None)

    # Start fulfillment deterministically as soon as the customer selects it.
    # This stores the exact full profile address instead of letting the model
    # shorten it to a ward/city and geocode the wrong place.
    if (
        choices.get("delivery_type")
        and not cart.get("is_empty")
        and not cart.get("branch_id")
        and not prefs.get("suggested_address")
    ):
        from src.function_calling.tools.user_tools import execute_get_user_profile
        profile = execute_get_user_profile(session_id)
        default_address = str(profile.get("default_address") or "").strip()
        payment_line = ""
        if not cart_manager.get_checkout_prefs(session_id).get("payment_method"):
            payment_line = "\n\n" + _payment_methods_text() + "\nBạn chọn giúp mình một phương thức nhé."
        if default_address:
            cart_manager.set_checkout_context(session_id, suggested_address=default_address)
            if choices["delivery_type"] == "GIAO_TAN_NOI":
                question = f"Bạn có muốn giao đến địa chỉ đã lưu này không?\n{default_address}"
            else:
                question = f"Bạn đang ở địa chỉ đã lưu này hay muốn dùng địa chỉ khác để tìm cửa hàng gần nhất?\n{default_address}"
            return {
                "reply": question + payment_line,
                "checkout_payload": None,
                "tool_calls_log": [{"tool": "get_user_profile", "result": profile}],
                "error": None,
            }
        return {
            "reply": "Bạn đang ở địa chỉ nào để mình tìm cửa hàng gần nhất?" + payment_line,
            "checkout_payload": None,
            "tool_calls_log": [{"tool": "get_user_profile", "result": profile}],
            "error": None,
        }

    saved_location_result = _confirm_saved_location(session_id, user_message, history=history)
    if saved_location_result:
        return _advance_checkout_if_ready(session_id, saved_location_result)

    branch_choice_result = _resolve_pending_branch_choice(session_id, user_message, history=history)
    if branch_choice_result:
        return _advance_checkout_if_ready(session_id, branch_choice_result)

    # Confirmation is resolved from the server-side pending checkout state.
    # Frontend history is presentation data and may be truncated, reformatted or
    # omitted, so it must not decide whether a real checkout can proceed.
    if prefs.get("summary_fingerprint"):
        import os
        use_t1 = os.getenv("USE_T1_CONFIRM", "false").lower() == "true"
        if use_t1:
            pending = cart_manager.get_pending_action(session_id)
            pending_type = pending.get("type") if pending else "confirm_checkout"
            from src.agents.tier1 import classify_confirmation
            classification = classify_confirmation(user_message, pending_type)
            is_yes = (classification == "YES")
            is_ambiguous = (classification == "AMBIGUOUS")
        else:
            is_yes = _is_plain_confirmation(user_message)
            is_ambiguous = False

        if is_ambiguous:
            return {
                "reply": "Bạn có xác nhận chốt đơn hay không? Vui lòng trả lời rõ 'có' hoặc 'không' nhé.",
                "gate": "confirm_checkout_ambiguous",
                "checkout_payload": None,
                "tool_calls_log": [],
                "error": None
            }

        if is_yes:
            from src.function_calling.tools.cart_tools import execute_confirm_checkout
            checkout_res = execute_confirm_checkout(session_id)
            if checkout_res.get("status") in {"success", "already_processed"}:
                order_id = checkout_res.get("order_id", "")
                reply = f"🎉 Đặt hàng thành công! Mã đơn hàng của bạn là: **{order_id}**. Cảm ơn bạn đã ủng hộ!"
            else:
                reply = checkout_res.get("message", "Đơn hàng chưa được tạo. Bạn có thể kiểm tra lại giỏ hàng và thử lại.")
            return {"reply": reply, "gate": "confirm_checkout", "checkout_payload": None,
                    "tool_calls_log": [{"tool": "confirm_checkout", "result": checkout_res}], "error": None}

    completed_pending = _complete_pending_products_from_options(session_id, user_message)
    if completed_pending:
        return completed_pending

    additional_product = _extract_additional_product_name(user_message)
    if additional_product:
        handled = _handle_additional_product(session_id, additional_product)
        if handled:
            return handled

    # Resolve ordinal references deterministically from the assistant's last
    # numbered recommendation. This prevents the model from handling only the
    # first item in requests such as "nước số 1 và bánh số 1".
    resolved_choices = _resolve_numbered_product_choices(user_message, history or [])
    model_user_message = user_message
    if resolved_choices:
        from src.function_calling.tools.product_tools import (
            execute_get_product_options,
            execute_get_recommendations,
        )

        user_norm = _normalize_chat_text(user_message)
        option_logs = []
        reply_lines = [f"Mình đã ghi nhận đủ {len(resolved_choices)} món bạn chọn:"]
        needs_choice = False
        enriched_choices = []
        for item in resolved_choices:
            option_result = execute_get_product_options(item["product_name"])
            option_logs.append({
                "tool": "get_product_options",
                "args": {"product_name": item["product_name"]},
                "result": option_result,
            })
            label = "Nước" if item["category"] == "drink" else "Bánh/đồ ăn"
            option_groups = _parse_option_groups(option_result)
            enriched = {**item, "options": {"groups": option_groups}}
            enriched_choices.append(enriched)
            if option_result.get("status") == "ok" and option_groups:
                reply_lines.append(f"- {label}: {item['product_name']}")
                for name, values in option_groups.items():
                    reply_lines.append(f"  - {name}: {', '.join(values)}")
                needs_choice = True
            elif option_result.get("status") == "ok":
                reply_lines.append(f"- {label}: {item['product_name']} — không có tùy chọn thêm")
            else:
                reply_lines.append(f"- {label}: {item['product_name']} — {option_result.get('message') or 'chưa lấy được tùy chọn'}")

        cart_manager.set_pending_products(session_id, enriched_choices, merge=True)
        try:
            cart_manager.set_pending_action(session_id, "fill_options", {"count": len(enriched_choices)})
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("set_pending_action fill_options failed: %s", e)

        # Check if customer also requested cake/food recommendations.
        has_cake_request = bool(re.search(
            r"\b(?:them|cho|goi y|chon|muon|kem)\s*(?:\d+\s*)?(?:mon\s+)?(?:banh|do an)\b",
            user_norm,
        ))
        has_resolved_food = any(item["category"] == "food" for item in resolved_choices)
        if has_cake_request and not has_resolved_food:
            rec_result = execute_get_recommendations(category="food", top_k=3)
            option_logs.append({
                "tool": "get_recommendations",
                "args": {"category": "food", "top_k": 3},
                "result": rec_result,
            })
            if rec_result.get("status") == "ok" and rec_result.get("recommendations"):
                cakes = [c.strip() for c in rec_result["recommendations"].split(",") if c.strip()]
                reply_lines.append("\nVề món bánh bạn muốn thêm, Avengers Coffee có các món ngon sau:")
                for idx, cake_name in enumerate(cakes, 1):
                    reply_lines.append(f"{idx}. {cake_name}")
                reply_lines.append("\nMình đã giữ món nước bạn chọn. Bạn muốn chọn bánh nào? Sau đó mình sẽ thêm đủ các món cùng lúc.")
                return {
                    "reply": "\n".join(reply_lines),
                    "checkout_payload": None,
                    "tool_calls_log": option_logs,
                    "error": None,
                }

        if needs_choice:
            reply_lines.append("Mình đã giữ đủ các món bạn chọn. Hãy chọn các tùy chọn cần thiết cho từng món ở trên, hoặc nói ‘theo mặc định’ để dùng cấu hình món.")
        else:
            reply_lines.append("Các món này không có tùy chọn cần chọn. Mình sẽ dùng cấu hình mặc định của menu.")
            completed = _complete_pending_products_from_options(session_id, "theo mặc định")
            if completed:
                completed["tool_calls_log"] = option_logs + completed.get("tool_calls_log", [])
                return completed
        if re.search(r"\b(size|nho|vua|lon|da|duong|ngot|sua|topping|hat sen|foam|mac dinh|theo cong thuc)\b", user_norm):
            completed = _complete_pending_products_from_options(session_id, user_message)
            if completed:
                completed["tool_calls_log"] = option_logs + completed.get("tool_calls_log", [])
                return completed
        return {
            "reply": "\n".join(reply_lines),
            "checkout_payload": None,
            "tool_calls_log": option_logs,
            "error": None,
        }

    # ── Build messages (bao gồm RAG context nếu cần) ──────────────────────────
    messages = _build_messages(
        session_id=session_id,
        history=history or [],
        user_message=model_user_message,
    )

    # ── Gọi Groq Agent ────────────────────────────────────────────────────────
    tools_for_turn = ALL_TOOL_SCHEMAS
    if not _allows_cart_add(user_message, session_id):
        tools_for_turn = [
            schema for schema in ALL_TOOL_SCHEMAS
            if schema.get("function", {}).get("name") != "add_to_cart"
        ]
    result = groq_agent_chat(
        messages=messages,
        tools=tools_for_turn,
        tool_executors=TOOL_EXECUTORS,
        session_id=session_id,
        max_tool_rounds=max_tool_rounds,
        max_tokens=800,
    )

    # Never present a cart mutation as successful unless the corresponding
    # backend write actually succeeded in this turn.
    # Only intercept past-tense CLAIMS of having added (e.g. "đã thêm ... vào giỏ",
    # "mình đã thêm món"), NOT instructional mentions like "bạn có thể thêm vào giỏ".
    reply_norm = _normalize_chat_text(result.get("reply") or "")
    claimed_add = bool(re.search(
        r"\b(minh da them|da them vao gio|da them mon|da them san pham|them thanh cong vao gio)\b",
        reply_norm,
    ))
    if claimed_add:
        successful_add = any(
            entry.get("tool") == "add_to_cart"
            and isinstance(entry.get("result"), dict)
            and entry["result"].get("status") == "ok"
            for entry in result.get("tool_calls_log", [])
        )
        if not successful_add:
            result["reply"] = (
                "Mình chưa ghi được món đó vào giỏ nên chưa thể xác nhận là đã thêm. "
                "Bạn cho mình thử lại tên món hoặc tùy chọn nhé."
            )

    successful_adds = [
        entry for entry in result.get("tool_calls_log", [])
        if entry.get("tool") == "add_to_cart"
        and isinstance(entry.get("result"), dict)
        and entry["result"].get("status") == "ok"
    ]
    if successful_adds:
        try:
            cart_manager.clear_pending_action(session_id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("clear_pending_action ask_more_items (add_to_cart) failed: %s", e)
        lines = ["Mình đã thêm vào giỏ:"]
        for entry in successful_adds:
            args = entry.get("args") or {}
            add_result = entry["result"]
            price = f"{float(add_result.get('unit_price') or 0):,.0f}".replace(",", ".")
            lines.append(
                f"- {args.get('product_name') or 'Sản phẩm'} x{int(args.get('quantity') or 1)}: {price}đ/món"
            )
        final_cart = successful_adds[-1]["result"].get("cart") or {}
        lines.append("Giỏ hàng sau khi thêm:")
        for item in final_cart.get("items") or []:
            item_total = float(item.get("unit_price") or 0) * int(item.get("quantity") or 1)
            item_total_text = f"{item_total:,.0f}".replace(",", ".")
            lines.append(f"- {item.get('product_name')} x{int(item.get('quantity') or 1)}: {item_total_text}đ")
        total = f"{float(final_cart.get('total_price') or 0):,.0f}".replace(",", ".")
        lines.append(f"Tổng giỏ hiện tại: {total}đ.")
        result["reply"] = "\n".join(lines)
    # Bỏ qua việc tự động nhồi nhắc nhở checkout ở đây để LLM quyết định dựa vào prompt

    # ── [Phase 3] Lớp 2: Guardrails — Kiểm tra Output ────────────────────────
    if result.get("reply"):
        fulfillment = cart_manager.get_checkout_prefs(session_id).get("delivery_type")
        if fulfillment in {"MANG_DI", "TAI_CHO"}:
            result["reply"] = re.sub(
                r"Bạn có muốn giao đến (?:địa chỉ|chi nhánh|cửa hàng) này không\??",
                "Bạn có muốn chọn cửa hàng này để nhận món không?",
                result["reply"],
                flags=re.IGNORECASE,
            )
        safe_reply, was_modified = guardrails.check_output(result["reply"])
        if was_modified:
            logger.warning(
                "[AgentService] Output was modified by guardrails: session=%s", session_id
            )
        result["reply"] = safe_reply
    elif not result.get("reply") and not result.get("error"):
        # LLM generated empty reply
        result["reply"] = "Xin lỗi, hiện tại hệ thống AI đang bị quá tải hoặc gặp sự cố phản hồi. Vui lòng thử lại sau ít phút."
        result["error"] = "empty_reply"

    logger.info(
        "[AgentService] session=%s tools_called=%d checkout=%s error=%s",
        session_id,
        len(result.get("tool_calls_log", [])),
        "yes" if result.get("checkout_payload") else "no",
        result.get("error"),
    )
    logger.info(
        "[AgentService] FINAL REPLY TEXT: %s",
        result.get("reply")
    )
    successful_voucher = any(
        entry.get("tool") == "apply_voucher"
        and isinstance(entry.get("result"), dict)
        and entry["result"].get("status") in {"ok", "already_applied"}
        for entry in result.get("tool_calls_log", [])
    )
    if successful_voucher:
        cart_manager.set_checkout_context(
            session_id, voucher_decided=True, voucher_offer_pending=None
        )
        result["reply"] = _checkout_choices_prompt(session_id, result.get("reply") or "")

    return _advance_checkout_if_ready(session_id, result)

run_agent = _run_agent_impl
