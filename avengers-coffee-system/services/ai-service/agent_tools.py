"""
agent_tools.py
--------------
Các Tool Functions để Groq LLM gọi qua Function Calling.

Mỗi Tool gồm 2 phần:
  1. SCHEMA (dict) – JSON Schema OpenAI-compatible để đăng ký với Groq API.
  2. Hàm Python thực thi (execute_*) – Code thật gọi DB / cart_manager.

Quy tắc quan trọng:
  - Tool check_price_and_stock LUÔN nhận branch_id. Nếu thiếu, trả lỗi
    để LLM biết phải gọi ask_branch trước.
  - Giá và tồn kho được query TRỰC TIẾP từ DB tại thời điểm gọi,
    không bao giờ tin giá LLM tự sinh ra.
"""
import logging
import unicodedata
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import text

import cart_manager

logger = logging.getLogger(__name__)


# ── DB engine (lazy import để tránh circular) ────────────────────────────────

def _get_engine():
    from db import get_db_engine
    return get_db_engine()


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 1: ask_branch  –  Yêu cầu LLM hỏi khách chọn chi nhánh
# ─────────────────────────────────────────────────────────────────────────────

TOOL_ASK_BRANCH = {
    "type": "function",
    "function": {
        "name": "ask_branch",
        "description": (
            "Gọi tool này khi khách hàng chưa đề cập chi nhánh / cơ sở nào. "
            "Trả về danh sách chi nhánh đang hoạt động để LLM hỏi lại khách chọn. "
            "KHÔNG được tự giả định chi nhánh."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


def execute_ask_branch() -> Dict[str, Any]:
    """Lấy danh sách chi nhánh từ DB để LLM trình bày cho khách."""
    try:
        engine = _get_engine()
        import os
        schema = os.getenv("IDENTITY_SCHEMA", "identity")
        with engine.connect() as conn:
            rows = conn.execute(text(
                f"SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi "
                f"FROM {schema}.chi_nhanh "
                f"WHERE trang_thai = 'ACTIVE' "
                f"ORDER BY ten_chi_nhanh ASC LIMIT 10"
            )).mappings().all()
        branches = [dict(r) for r in rows]
        return {
            "status": "need_branch_selection",
            "branches": branches,
            "message": "Vui lòng hỏi khách chọn một trong các chi nhánh trên trước khi tiếp tục.",
        }
    except Exception as e:
        logger.warning("[AgentTools] ask_branch error: %s", e)
        return {"status": "error", "message": "Không thể lấy danh sách chi nhánh."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 2: set_session_branch  –  Lưu lựa chọn chi nhánh vào session
# ─────────────────────────────────────────────────────────────────────────────

TOOL_SET_SESSION_BRANCH = {
    "type": "function",
    "function": {
        "name": "set_session_branch",
        "description": (
            "Gọi tool này ngay sau khi khách đã xác nhận chọn chi nhánh cụ thể. "
            "Lưu lựa chọn vào session để các tool tiếp theo dùng."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "ID session của khách hàng.",
                },
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh (ma_chi_nhanh) khách đã chọn.",
                },
                "branch_name": {
                    "type": "string",
                    "description": "Tên chi nhánh cho dễ hiển thị.",
                },
            },
            "required": ["session_id", "branch_id", "branch_name"],
        },
    },
}


def execute_set_session_branch(session_id: str, branch_id: str, branch_name: str) -> Dict[str, Any]:
    cart_manager.set_branch(session_id, branch_id, branch_name)
    return {
        "status": "ok",
        "message": f"Đã ghi nhận chi nhánh: {branch_name}. Bây giờ có thể tra cứu giá và tồn kho.",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 3: check_price_and_stock  –  Query giá + tồn kho theo chi nhánh
# ─────────────────────────────────────────────────────────────────────────────

TOOL_CHECK_PRICE_AND_STOCK = {
    "type": "function",
    "function": {
        "name": "check_price_and_stock",
        "description": (
            "Kiểm tra giá bán và tình trạng tồn kho của sản phẩm tại chi nhánh cụ thể. "
            "Phải biết branch_id trước khi gọi. Nếu chưa có branch_id, gọi ask_branch trước. "
            "Giá được lấy TRỰC TIẾP từ database, không tin giá do LLM tự sinh ra."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_name_query": {
                    "type": "string",
                    "description": "Tên sản phẩm khách nhắc đến (tên gần đúng cũng được, sẽ fuzzy-match).",
                },
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh (ma_chi_nhanh) đã được xác nhận trong session.",
                },
                "size": {
                    "type": "string",
                    "enum": ["S", "M", "L"],
                    "description": "Kích cỡ khách muốn (nếu có). Ảnh hưởng đến phụ thu giá.",
                },
            },
            "required": ["product_name_query", "branch_id"],
        },
    },
}


def _norm(s: str) -> str:
    nfd = unicodedata.normalize("NFD", str(s).lower())
    return re.sub(r"\s+", " ", "".join(c for c in nfd if unicodedata.category(c) != "Mn")).strip()


def execute_check_price_and_stock(
    product_name_query: str,
    branch_id: str,
    size: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fuzzy-match sản phẩm trong DB và trả về giá + tồn kho.
    Trả về top 3 kết quả phù hợp nhất để LLM chọn đúng món.
    """
    if not branch_id:
        return {
            "status": "need_branch",
            "message": "Chưa có thông tin chi nhánh. Hãy gọi ask_branch để hỏi khách chọn chi nhánh.",
        }
    try:
        import os
        engine = _get_engine()
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")

        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT
                    sp.ma_san_pham::text AS product_id,
                    sp.ten_san_pham,
                    sp.gia_ban,
                    sp.trang_thai AS is_active,
                    dm.ten_danh_muc AS category
                FROM {menu_schema}.san_pham sp
                LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                WHERE sp.trang_thai = TRUE
                ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                LIMIT 200
                """
            )).mappings().all()
        all_products = [dict(r) for r in rows]

        # Fuzzy match bằng word-overlap (không dùng vector để tránh dependency)
        query_norm = _norm(product_name_query)
        query_words = set(query_norm.split())
        scored = []
        for p in all_products:
            p_norm = _norm(p["ten_san_pham"])
            p_words = set(p_norm.split())
            overlap = len(query_words & p_words)
            if query_norm in p_norm or p_norm in query_norm:
                overlap += 3
            if overlap > 0:
                scored.append((overlap, p))
        scored.sort(key=lambda x: -x[0])
        top = [p for _, p in scored[:3]]

        if not top:
            return {
                "status": "not_found",
                "message": f"Không tìm thấy sản phẩm nào khớp với '{product_name_query}' trong hệ thống.",
            }

        # Lấy phụ thu size nếu có
        size_surcharge = 0.0
        if size and top:
            try:
                with engine.connect() as conn:
                    r = conn.execute(text(
                        f"""
                        SELECT bt.phu_thu
                        FROM {menu_schema}.bien_the_san_pham bt
                        JOIN {menu_schema}.thuoc_tinh tt ON bt.ma_thuoc_tinh = tt.ma_thuoc_tinh
                        WHERE bt.ma_san_pham = :pid
                          AND UPPER(bt.gia_tri) = UPPER(:size)
                          AND LOWER(tt.ten_thuoc_tinh) LIKE '%size%'
                        LIMIT 1
                        """
                    ), {"pid": top[0]["product_id"], "size": size}).fetchone()
                    if r:
                        size_surcharge = float(r[0] or 0)
            except Exception:
                pass

        results = []
        for p in top:
            base_price = float(p["gia_ban"] or 0)
            final_price = base_price + size_surcharge
            results.append({
                "product_id": p["product_id"],
                "product_name": p["ten_san_pham"],
                "category": p.get("category"),
                "base_price": base_price,
                "size": size,
                "size_surcharge": size_surcharge,
                "final_price": final_price,
                "in_stock": True,  # TODO: tích hợp inventory-service nếu có bảng tồn kho riêng
                "branch_id": branch_id,
            })

        return {"status": "ok", "products": results}

    except Exception as e:
        logger.error("[AgentTools] check_price_and_stock error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu giá/tồn kho lúc này."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 4: add_to_cart  –  Thêm sản phẩm vào giỏ
# ─────────────────────────────────────────────────────────────────────────────

TOOL_ADD_TO_CART = {
    "type": "function",
    "function": {
        "name": "add_to_cart",
        "description": (
            "Thêm một sản phẩm vào giỏ hàng của phiên chat hiện tại. "
            "Chỉ gọi sau khi đã xác nhận product_id và final_price từ check_price_and_stock. "
            "KHÔNG tự bịa giá – lấy final_price từ kết quả check_price_and_stock trước đó."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "ID session của khách."},
                "product_id": {"type": "string", "description": "Mã sản phẩm (từ check_price_and_stock)."},
                "product_name": {"type": "string", "description": "Tên sản phẩm (để hiển thị)."},
                "unit_price": {"type": "number", "description": "Giá đơn vị (từ final_price của check_price_and_stock)."},
                "quantity": {"type": "integer", "description": "Số lượng (mặc định 1)."},
                "size": {"type": "string", "enum": ["S", "M", "L"], "description": "Kích cỡ (nếu có)."},
                "note": {"type": "string", "description": "Ghi chú thêm (ít đường, không đá...)."},
            },
            "required": ["session_id", "product_id", "product_name", "unit_price"],
        },
    },
}


def execute_add_to_cart(
    session_id: str,
    product_id: str,
    product_name: str,
    unit_price: float,
    quantity: int = 1,
    size: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    cart = cart_manager.add_item(
        session_id=session_id,
        product_id=product_id,
        product_name=product_name,
        unit_price=float(unit_price),
        quantity=max(1, int(quantity)),
        size=size,
        note=note,
    )
    return {
        "status": "ok",
        "message": f"Đã thêm {product_name} x{quantity} vào giỏ.",
        "cart": cart,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 5: get_cart  –  Lấy tóm tắt giỏ hàng hiện tại
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_CART = {
    "type": "function",
    "function": {
        "name": "get_cart",
        "description": "Lấy danh sách và tổng tiền giỏ hàng hiện tại của phiên chat.",
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "ID session của khách."},
            },
            "required": ["session_id"],
        },
    },
}


def execute_get_cart(session_id: str) -> Dict[str, Any]:
    return cart_manager.get_cart(session_id)


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 6: request_checkout  –  Yêu cầu xác nhận đặt hàng (Guardrail trigger)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_REQUEST_CHECKOUT = {
    "type": "function",
    "function": {
        "name": "request_checkout",
        "description": (
            "Gọi tool này khi khách xác nhận muốn đặt hàng (chốt đơn). "
            "Tool sẽ tổng hợp giỏ hàng và trả về tín hiệu 'require_confirmation' "
            "để Frontend hiển thị bước xác nhận cuối cho khách. "
            "KHÔNG tự tạo đơn hàng thật – việc đó do Frontend/Backend làm sau khi khách bấm xác nhận."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "ID session của khách."},
                "payment_method": {
                    "type": "string",
                    "enum": ["TIEN_MAT", "VNPAY", "ZALOPAY", "THANH_TOAN_KHI_NHAN_HANG"],
                    "description": "Phương thức thanh toán khách chọn.",
                },
                "delivery_type": {
                    "type": "string",
                    "enum": ["DELIVERY", "PICKUP"],
                    "description": "Giao hàng hay tự đến lấy.",
                },
            },
            "required": ["session_id"],
        },
    },
}


def execute_request_checkout(
    session_id: str,
    payment_method: str = "THANH_TOAN_KHI_NHAN_HANG",
    delivery_type: str = "PICKUP",
) -> Dict[str, Any]:
    """
    GUARDRAIL: Tổng hợp giỏ hàng và trả về tín hiệu xác nhận.
    Tính lại tổng tiền từ cart_manager (source of truth),
    KHÔNG tin con số nào LLM tự tính giữa hội thoại.
    Frontend nhận 'require_confirmation' và hiển thị popup xác nhận.
    """
    cart = cart_manager.get_cart(session_id)
    if cart["is_empty"]:
        return {
            "status": "empty_cart",
            "message": "Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.",
        }
    if not cart["branch_id"]:
        return {
            "status": "need_branch",
            "message": "Chưa chọn chi nhánh. Vui lòng chọn chi nhánh trước khi đặt hàng.",
        }

    # Tính lại tổng tiền từ cart (source of truth, không tin LLM)
    total = sum(float(i["unit_price"]) * int(i["quantity"]) for i in cart["items"])

    return {
        "status": "require_confirmation",
        "order_summary": {
            "branch_id": cart["branch_id"],
            "branch_name": cart["branch_name"],
            "items": cart["items"],
            "item_count": cart["item_count"],
            "total_price": total,
            "payment_method": payment_method,
            "delivery_type": delivery_type,
        },
        "message": (
            f"Tổng đơn hàng: {total:,.0f}đ tại {cart['branch_name']}. "
            f"Khách cần xác nhận trước khi tôi tiến hành đặt."
        ),
    }




# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 7: search_knowledge_base  –  RAG: Tra cứu tài liệu nội bộ
# ─────────────────────────────────────────────────────────────────────────────

TOOL_SEARCH_KNOWLEDGE_BASE = {
    "type": "function",
    "function": {
        "name": "search_knowledge_base",
        "description": (
            "Tra cứu thông tin chính sách, FAQ, thành phần nguyên liệu, "
            "khuyến mãi từ tài liệu nội bộ của Avengers Coffee. "
            "Gọi tool này khi khách hỏi về: chính sách đổi trả, giờ mở cửa, "
            "thành phần đồ uống, chương trình khuyến mãi, tích điểm, hay bất kỳ "
            "thông tin nào không liên quan đến giá/tồn kho trực tiếp."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Nội dung cần tra cứu (câu hỏi của khách hoặc từ khóa liên quan).",
                },
            },
            "required": ["query"],
        },
    },
}


def execute_search_knowledge_base(query: str) -> Dict[str, Any]:
    """Tìm kiếm trong knowledge base và trả về các đoạn tài liệu liên quan."""
    try:
        from rag_service import get_rag_service
        rag = get_rag_service()
        if not rag.is_loaded:
            return {
                "status": "unavailable",
                "message": "Hệ thống tra cứu tài liệu chưa sẵn sàng. Vui lòng thử lại sau.",
            }
        results = rag.search(query, top_k=3)
        if not results:
            return {
                "status": "not_found",
                "message": f"Không tìm thấy thông tin liên quan đến '{query}' trong tài liệu nội bộ.",
            }
        return {
            "status": "ok",
            "results": results,
        }
    except Exception as e:
        logger.error("[AgentTools] search_knowledge_base error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu tài liệu lúc này."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 8: get_recommendations  –  Gợi ý món dựa trên CF model
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_RECOMMENDATIONS = {
    "type": "function",
    "function": {
        "name": "get_recommendations",
        "description": (
            "Lấy danh sách gợi ý món uống cho khách. Có thể lấy theo độ phổ biến (bán chạy) "
            "hoặc theo đánh giá cao (5 sao). "
            "LƯU Ý QUAN TRỌNG: Câu trả lời của bạn PHẢI tự nhiên như một người tư vấn. "
            "TUYỆT ĐỐI KHÔNG SỬ DỤNG BẢNG (TABLE) DƯỚI MỌI HÌNH THỨC."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "string",
                    "description": "ID người dùng (nếu có, để cá nhân hóa gợi ý).",
                },
                "criteria": {
                    "type": "string",
                    "enum": ["hot", "rating"],
                    "description": "Tiêu chí lọc. 'hot' cho món bán chạy, 'rating' cho món đánh giá cao."
                },
                "top_k": {
                    "type": "integer",
                    "description": "Số lượng món gợi ý (mặc định 5)."
                },
            },
            "required": [],
        },
    },
}

def execute_get_recommendations(user_id: Optional[str] = None, criteria: str = "hot", top_k: int = 5) -> Dict[str, Any]:
    """Lấy gợi ý món từ CF model (đã có sẵn trong main.py)."""
    try:
        engine = _get_engine()
        import os
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        products = []
        note = ""
        if criteria == "rating":
            # Lấy top sản phẩm theo đánh giá từ DB
            with engine.connect() as conn:
                rows = conn.execute(text(
                    f"""
                    SELECT sp.ten_san_pham, COALESCE(AVG(dg.so_sao), 0) as avg_rating
                    FROM {menu_schema}.san_pham sp
                    JOIN {order_schema}.danh_gia_san_pham dg ON sp.ma_san_pham::text = dg.ma_san_pham
                    WHERE sp.trang_thai = TRUE
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham
                    ORDER BY avg_rating DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                    """
                ), {"top_k": top_k}).mappings().all()
            if not rows:
                products = []
                note = "Hiện tại chưa có sản phẩm nào được đánh giá."
            else:
                products = [r["ten_san_pham"] for r in rows]
                if len(products) < top_k:
                    note = f"Lưu ý: Hiện tại hệ thống chỉ có {len(products)} sản phẩm đã được khách hàng đánh giá."
        else:
            # Import lazy để tránh circular dependency
            import sys
            cf_model = getattr(sys.modules.get("__main__"), "cf_model", None)

            if cf_model is not None and user_id:
                recs = cf_model.recommend(user_id=user_id, top_k=top_k)
                products = [r["name"] for r in recs]
            else:
                with engine.connect() as conn:
                    rows = conn.execute(text(
                        f"""
                        SELECT ten_san_pham
                        FROM {menu_schema}.san_pham
                        WHERE trang_thai = TRUE
                        ORDER BY la_hot DESC, ten_san_pham ASC
                        LIMIT :top_k
                        """
                    ), {"top_k": top_k}).mappings().all()
                products = [r["ten_san_pham"] for r in rows]
                
            if len(products) < top_k:
                note = f"Lưu ý: Chỉ tìm thấy {len(products)} sản phẩm phù hợp."

        final_recommendation = ", ".join(products)
        if note:
            final_recommendation = f"{final_recommendation}. {note} (Tuyệt đối không tự bịa thêm món khác để đủ số lượng)."

        return {
            "status": "ok",
            "source": "rating" if criteria == "rating" else "popular",
            "recommendations": final_recommendation
        }

    except Exception as e:
        logger.error("[AgentTools] get_recommendations error: %s", e)
        return {"status": "error", "message": "Không thể lấy gợi ý lúc này."}


# ─────────────────────────────────────────────────────────────────────────────
#  Registry – Danh sách Tools đăng ký với Groq API
# ─────────────────────────────────────────────────────────────────────────────

ALL_TOOL_SCHEMAS: List[Dict[str, Any]] = [
    TOOL_ASK_BRANCH,
    TOOL_SET_SESSION_BRANCH,
    TOOL_CHECK_PRICE_AND_STOCK,
    TOOL_ADD_TO_CART,
    TOOL_GET_CART,
    TOOL_REQUEST_CHECKOUT,
    TOOL_SEARCH_KNOWLEDGE_BASE,
    TOOL_GET_RECOMMENDATIONS,
]

# Dispatch map: tool_name -> executor function
TOOL_EXECUTORS = {
    "ask_branch": lambda args: execute_ask_branch(),
    "set_session_branch": lambda args: execute_set_session_branch(**args),
    "check_price_and_stock": lambda args: execute_check_price_and_stock(**args),
    "add_to_cart": lambda args: execute_add_to_cart(**args),
    "get_cart": lambda args: execute_get_cart(**args),
    "request_checkout": lambda args: execute_request_checkout(**args),
    "search_knowledge_base": lambda args: execute_search_knowledge_base(**args),
    "get_recommendations": lambda args: execute_get_recommendations(**args),
}

