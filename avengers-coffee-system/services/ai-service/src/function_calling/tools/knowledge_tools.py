import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

TOOL_SEARCH_KNOWLEDGE_BASE = {
    "type": "function",
    "function": {
        "name": "search_knowledge_base",
        "description": (
            "Tra cứu thông tin chính sách, FAQ, thành phần nguyên liệu, "
            "khuyến mãi từ tài liệu nội bộ của Avengers Coffee. "
            "Gọi tool này khi khách hỏi về: chính sách đổi trả, giờ mở cửa, "
            "mô tả sản phẩm, hương vị đồ uống, nhượng quyền thương hiệu (franchise), "
            "tuyển dụng (careers), thẻ quà tặng (gift card), liên hệ hotline/email, "
            "hay bất kỳ thông tin nào tĩnh, không liên quan đến giá/tồn kho trực tiếp."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Câu truy vấn ngắn gọn để tìm kiếm (ví dụ: 'chính sách đổi trả', 'thành phần Americano Mơ'). BẮT BUỘC CHỈ TÓM TẮT THÀNH TỪ KHÓA CHÍNH (dưới 5 từ), KHÔNG bê nguyên câu hỏi dài của khách vào đây vì hệ thống dùng keyword matching.",
                },
            },
            "required": ["query"],
        },
    },
}

def execute_search_knowledge_base(query: str) -> Dict[str, Any]:
    """Tìm kiếm trong knowledge base và trả về các đoạn tài liệu liên quan."""
    try:
        from src.rag.rag_service import get_rag_service
        rag = get_rag_service()
        if not rag.is_loaded:
            return {
                "status": "unavailable",
                "message": "Hệ thống tra cứu tài liệu chưa sẵn sàng. Vui lòng thử lại sau.",
            }
        
        words = query.split()
        if len(words) > 10:
            query = " ".join(words[:10])
            
        results = rag.search(query, top_k=5)
        if not results:
            logger.info("[AgentTools] search_knowledge_base returned NOT_FOUND for query: '%s'", query)
            return {
                "status": "not_found",
                "message": f"Không tìm thấy thông tin liên quan đến '{query}' trong tài liệu nội bộ.",
            }
        logger.info("[AgentTools] search_knowledge_base returned %d results for query: '%s'", len(results), query)
        return {
            "status": "ok",
            "results": results,
        }
    except Exception as e:
        logger.error("[AgentTools] search_knowledge_base error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu tài liệu lúc này."}
