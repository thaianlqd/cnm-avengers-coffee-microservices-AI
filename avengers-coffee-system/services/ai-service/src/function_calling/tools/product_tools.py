import logging
from typing import Any, Dict, Optional
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict, _norm
from src.common import cart_manager

logger = logging.getLogger(__name__)

TOOL_GET_PRODUCT_OPTIONS = {
    "type": "function",
    "function": {
        "name": "get_product_options",
        "description": "Lấy danh sách các tùy chọn (Kích thước, Lượng đá, Độ ngọt, Topping...) của sản phẩm. BẮT BUỘC gọi tool này trước khi hỏi khách muốn chọn size, đá, đường gì để biết chính xác các lựa chọn thật trong database. TUYỆT ĐỐI KHÔNG TỰ BỊA RA TÙY CHỌN.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_name": {
                    "type": "string",
                    "description": "Tên sản phẩm khách muốn hỏi hoặc đặt (ví dụ: 'Americano Mơ').",
                }
            },
            "required": ["product_name"]
        }
    }
}

def execute_get_product_options(product_name: str) -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        import re
        menu_schema = os.getenv("MENU_SCHEMA", "menu")

        query_norm = product_name.lower()
        words = [w for w in query_norm.split() if len(w) > 1]
        if not words:
            return {"status": "error", "message": "Tên sản phẩm không hợp lệ."}
        
        conditions = " AND ".join([f"LOWER(ten_san_pham) LIKE :w_{i}" for i in range(len(words))])
        params = {f"w_{i}": f"%{w}%" for i, w in enumerate(words)}
        
        with engine.connect() as conn:
            row = conn.execute(text(
                f"""
                SELECT ma_san_pham::text, ten_san_pham
                FROM {menu_schema}.san_pham
                WHERE trang_thai = TRUE 
                  AND {conditions}
                ORDER BY la_hot DESC, ten_san_pham ASC
                LIMIT 1
                """
            ), params).fetchone()
            
            if not row:
                return {"status": "not_found", "message": f"Không tìm thấy sản phẩm '{product_name}'."}
                
            product_id = row[0]
            found_name = row[1]

            opts = conn.execute(text(
                f"""
                SELECT tt.ten_thuoc_tinh, bt.gia_tri
                FROM {menu_schema}.bien_the_san_pham bt
                JOIN {menu_schema}.thuoc_tinh tt ON bt.ma_thuoc_tinh = tt.ma_thuoc_tinh
                WHERE bt.ma_san_pham::text = :pid
                """
            ), {"pid": product_id}).fetchall()
            
            from collections import defaultdict
            options_dict = defaultdict(list)
            for r in opts:
                options_dict[r[0]].append(r[1])
                
            if not options_dict:
                return {
                    "status": "ok", 
                    "product_name": found_name, 
                    "options": {},
                    "message": f"Sản phẩm {found_name} không có tùy chọn (size, đá, đường) nào. Cứ đặt mặc định."
                }
                
            opts_str = ", ".join([f"{k}: [{', '.join(v)}]" for k, v in options_dict.items()])
            return {
                "status": "ok",
                "product_name": found_name,
                "options": {key: list(values) for key, values in options_dict.items()},
                "message": f"BẮT BUỘC: Khi hỏi khách về tùy chọn của {found_name}, bạn CHỈ ĐƯỢC PHÉP dùng y hệt các nhãn này (không dịch, không đổi). Các tùy chọn là: {opts_str}"
            }
    except Exception as e:
        logger.warning("[AgentTools] get_product_options error: %s", e)
        return {"status": "error", "message": "Không thể lấy tùy chọn sản phẩm."}

TOOL_CHECK_PRICE_AND_STOCK = {
    "type": "function",
    "function": {
        "name": "check_price_and_stock",
        "description": (
            "Tra giá menu của sản phẩm. Khi có branch_id hợp lệ, kiểm tra tồn kho theo điểm bán. "
            "NẾU KHÁCH CHƯA CHỌN CHI NHÁNH, hãy truyền tham số branch_id='Chưa chọn'. TUYỆT ĐỐI KHÔNG ĐƯỢC hỏi khách chọn chi nhánh lúc này. "
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
                    "description": "Mã chi nhánh đã xác nhận. Bỏ trống khi khách chưa chọn hình thức nhận; hệ thống vẫn báo giá nhưng tồn kho sẽ ở trạng thái chưa kiểm tra.",
                },
                "size": {
                    "type": "string",
                    "description": "Kích cỡ khách muốn. BẮT BUỘC sử dụng chính xác chuỗi từ kết quả của get_product_options (ví dụ: 'Nhỏ', 'Vừa', 'Lớn'). Bỏ trống nếu không có.",
                },
                "quantity": {"type": "integer", "description": "Số lượng cần kiểm tra, mặc định 1."},
                "toppings": {"type": "array", "items": {"type": "string"}, "description": "Topping khách đã chọn."},
                "luong_da": {"type": "string", "description": "Lượng đá khách đã chọn."},
                "do_ngot": {"type": "string", "description": "Độ ngọt khách đã chọn."},
                "loai_sua": {"type": "string", "description": "Loại sữa khách đã chọn."},
            },
            "required": ["product_name_query"],
        },
    },
}

def execute_check_price_and_stock(
    product_name_query: str,
    branch_id: str = "Chưa chọn",
    size: Optional[str] = None,
    quantity: int = 1,
    session_id: str = "",
    toppings: Optional[list] = None,
    luong_da: Optional[str] = None,
    do_ngot: Optional[str] = None,
    loai_sua: Optional[str] = None,
) -> Dict[str, Any]:
    if not branch_id:
        return {
            "status": "need_branch",
            "message": "Chưa có thông tin chi nhánh. Hãy gọi ask_branch để hỏi khách chọn chi nhánh.",
        }
    try:
        import os
        import re
        engine = _get_engine()
        menu_schema = os.getenv("MENU_SCHEMA", "menu")

        query_norm = product_name_query.lower()
        words = [w for w in query_norm.split() if len(w) > 1]
        
        if words:
            conditions = " AND ".join([f"LOWER(sp.ten_san_pham) LIKE :w_{i}" for i in range(len(words))])
            params = {f"w_{i}": f"%{w}%" for i, w in enumerate(words)}
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
                      AND {conditions}
                    ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                    LIMIT 3
                    """
                ), params).mappings().all()
            top = [_clean_dict(dict(r)) for r in rows]
        else:
            top = []

        # Recommendations may include a leading capacity token such as "1 Lít"
        # that is absent from the canonical database name. Retry without it and
        # resolve to the closest matching full name instead of a random product.
        normalized_query = _norm(product_name_query)
        stripped_query = re.sub(r"^\s*(?:\d+\s*)?(?:lit|ly|chai)\s+", "", normalized_query).strip()
        exact_product_mode = False
        # Only retry without a capacity prefix when the canonical full-name
        # lookup failed. A real catalog name may itself begin with "1 Lít".
        if not top and stripped_query and stripped_query != normalized_query:
            exact_product_mode = True
            top = []
            retry_words = [word for word in stripped_query.split() if len(word) > 1]
            if not retry_words:
                retry_words = [stripped_query]
            retry_conditions = " AND ".join(
                f"LOWER(sp.ten_san_pham) LIKE :retry_{index}"
                for index, _word in enumerate(retry_words)
            )
            retry_params = {f"retry_{index}": f"%{word}%" for index, word in enumerate(retry_words)}
            with engine.connect() as conn:
                rows = conn.execute(text(
                    f"""
                    SELECT sp.ma_san_pham::text AS product_id, sp.ten_san_pham,
                           sp.gia_ban, sp.trang_thai AS is_active,
                           dm.ten_danh_muc AS category
                    FROM {menu_schema}.san_pham sp
                    LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                    WHERE sp.trang_thai = TRUE AND {retry_conditions}
                    ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                    LIMIT 10
                    """
                ), retry_params).mappings().all()
            candidates = [_clean_dict(dict(row)) for row in rows]
            query_tokens = set(stripped_query.split())
            candidates = sorted(
                candidates,
                key=lambda item: (
                    len(query_tokens.intersection(set(_norm(item.get("ten_san_pham")).split()))),
                    len(_norm(item.get("ten_san_pham"))),
                ),
                reverse=True,
            )[:10]
            if candidates:
                # Prefer an exact canonical match. If only close candidates
                # exist, ask for clarification rather than inventing a price.
                exact = [
                    item for item in candidates
                    if _norm(item.get("ten_san_pham")) == stripped_query
                ]
                top = exact[:1] if exact else []
                if not top:
                    return {
                        "status": "ambiguous",
                        "message": "Tên món được gợi ý chưa khớp duy nhất với menu. Mình chưa thể xác nhận giá; bạn chọn tên món đúng trong danh sách giúp mình nhé.",
                        "products": [
                            {"product_id": item["product_id"], "product_name": item["ten_san_pham"]}
                            for item in candidates[:3]
                        ],
                    }
            else:
                return {
                    "status": "not_found",
                    "message": f"Không tìm thấy sản phẩm nào khớp chính xác với '{product_name_query}'.",
                }

        if not top:
            return {
                "status": "not_found",
                "message": f"Không tìm thấy sản phẩm nào khớp với '{product_name_query}' trong hệ thống.",
            }

        size_price = None
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
                        size_price = float(r[0] or 0)
            except Exception:
                pass

        inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")
        prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
        fulfillment_selected = bool(prefs.get("delivery_type"))
        has_outlet = fulfillment_selected and branch_id.strip().lower() not in {"chưa chọn", "chua chon", "none", "null"}
        results = []
        for p in top:
            base_price = float(p["gia_ban"] or 0)
            # bien_the_san_pham.phu_thu stores the complete selling price for
            # Size rows (for example Small=49k, Medium=55k, Large=59k).
            # Other attributes use it as a surcharge.
            final_price = size_price if size_price is not None else base_price
            availability_status = "unknown"
            in_stock = None
            stock_quantity = None
            if has_outlet and str(p["product_id"]).isdigit():
                with engine.connect() as conn:
                    stock = conn.execute(text(
                        f"""
                        SELECT so_luong_ton, dang_kinh_doanh
                        FROM {inventory_schema}.ton_kho_san_pham
                        WHERE co_so_ma = :branch_id AND ma_san_pham = :product_id
                        LIMIT 1
                        """
                    ), {"branch_id": branch_id, "product_id": int(p["product_id"])}).mappings().first()
                if stock:
                    stock_quantity = int(stock["so_luong_ton"] or 0)
                    in_stock = bool(stock["dang_kinh_doanh"]) and stock_quantity >= max(1, int(quantity or 1))
                    availability_status = "available" if in_stock else "unavailable"

            results.append({
                "product_id": p["product_id"],
                "product_name": p["ten_san_pham"],
                "category": p.get("category"),
                "base_price": base_price,
                "size": size,
                "size_surcharge": (final_price - base_price) if size_price is not None else 0.0,
                "final_price": final_price,
                "in_stock": in_stock,
                "availability_status": availability_status,
                "stock_quantity": stock_quantity,
                "branch_id": branch_id,
            })

        return {"status": "ok", "products": results}

    except Exception as e:
        logger.error("[AgentTools] check_price_and_stock error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu giá/tồn kho lúc này."}

TOOL_GET_PRODUCT_INSIGHTS = {
    "type": "function",
    "function": {
        "name": "get_product_insights",
        "description": "Lấy thông tin đánh giá (review), số sao trung bình của một sản phẩm để tư vấn cho khách.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_name": {
                    "type": "string",
                    "description": "Tên sản phẩm khách hàng đang hỏi."
                },
            },
            "required": ["product_name"],
        },
    },
}

def execute_get_product_insights(product_name: str) -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        menu_schema = os.getenv("MENU_SCHEMA", "menu")

        query_norm = product_name.lower()
        words = [w for w in query_norm.split() if len(w) > 1]
        if not words:
            return {"status": "error", "message": "Tên sản phẩm không hợp lệ."}
        
        conditions = " AND ".join([f"LOWER(ten_san_pham) LIKE :w_{i}" for i in range(len(words))])
        params = {f"w_{i}": f"%{w}%" for i, w in enumerate(words)}
        
        with engine.connect() as conn:
            row = conn.execute(text(
                f"""
                SELECT ma_san_pham::text, ten_san_pham
                FROM {menu_schema}.san_pham
                WHERE trang_thai = TRUE 
                  AND {conditions}
                ORDER BY la_hot DESC, ten_san_pham ASC
                LIMIT 1
                """
            ), params).fetchone()
            
            if not row:
                return {"status": "not_found", "message": f"Không tìm thấy món '{product_name}' trong menu."}
                
            product_id = row[0]
            found_name = row[1]

            stats = conn.execute(text(
                f"""
                SELECT 
                    ROUND(COALESCE(AVG(so_sao), 0)::numeric, 1) as avg_rating,
                    COUNT(id) as total_reviews
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid
                """
            ), {"pid": product_id}).fetchone()

            reviews = conn.execute(text(
                f"""
                SELECT binh_luan
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid AND binh_luan IS NOT NULL AND LENGTH(binh_luan) >= 2
                ORDER BY ngay_tao DESC
                LIMIT 2
                """
            ), {"pid": product_id}).fetchall()

            avg_rating = float(stats[0])
            total_reviews = stats[1]
            comments = [r[0] for r in reviews]

        if total_reviews == 0:
            return {
                "status": "ok",
                "product_name": found_name,
                "message": f"Món {found_name} hiện chưa có đánh giá nào trên hệ thống."
            }

        return {
            "status": "ok",
            "product_name": found_name,
            "avg_rating": avg_rating,
            "total_reviews": total_reviews,
            "recent_comments": comments,
            "message": f"Món {found_name} được đánh giá trung bình {avg_rating}/5 sao (từ {total_reviews} lượt). Hãy dùng thông tin bình luận để tư vấn thêm."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_product_insights error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thông tin đánh giá sản phẩm."}

TOOL_GET_RECOMMENDATIONS = {
    "type": "function",
    "function": {
        "name": "get_recommendations",
        "description": (
            "Lấy danh sách gợi ý món uống cho khách. Có thể lấy theo độ phổ biến (bán chạy) "
            "hoặc theo đánh giá cao (5 sao) (ví dụ: 'món đánh giá cao', 'món ngon nhất cửa hàng'). NẾU khách hỏi 'món ... cửa hàng' thì vẫn là hỏi về món, CHỨ KHÔNG phải hỏi về chi nhánh. "
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
                    "enum": ["hot", "rating", "price_desc", "price_asc"],
                    "description": "Tiêu chí lọc. 'hot' cho món bán chạy, 'rating' cho món đánh giá cao nhất (NẾU khách nói 'cao nhất' sau khi vừa nhắc đến đánh giá, PHẢI DÙNG 'rating'). 'price_desc' cho món giá cao nhất, 'price_asc' cho món giá rẻ nhất."
                },
                "category": {
                    "type": "string",
                    "enum": ["drink", "food", "all"],
                    "description": "Loại món: 'drink' (chỉ lấy nước/đồ uống), 'food' (chỉ lấy bánh/đồ ăn), 'all' (lấy tất cả). MẶC ĐỊNH BẮT BUỘC LÀ 'all' NẾU KHÁCH KHÔNG YÊU CẦU CỤ THỂ."
                },
                "search_text": {
                    "type": "string",
                    "description": "Nhóm món cụ thể khách yêu cầu, ví dụ 'trà trái cây', 'cold brew', 'bánh ngọt'. Bỏ trống nếu khách chỉ hỏi chung.",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Số lượng món gợi ý (mặc định 5)."
                },
            },
        },
    },
}

def execute_get_recommendations(user_id: Optional[str] = None, criteria: str = "hot", category: str = "all", top_k: int = 5, search_text: Optional[str] = None) -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        import sys
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        category = str(category or "all").lower()
        if category not in {"drink", "food", "all"}:
            return {"status": "error", "message": "Danh mục gợi ý không hợp lệ."}

        # Category IDs differ between seed data and deployed databases.  Filter by
        # the category's business name, and never let products without a category
        # leak into a food/drink-specific recommendation.
        category_join = f"LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc"
        category_where = ""
        if category == "drink":
            category_where = """
                AND (
                    LOWER(COALESCE(dm.ten_danh_muc, '')) LIKE ANY (ARRAY[
                        '%đồ uống%', '%do uong%', '%thức uống%', '%thuc uong%',
                        '%nước%', '%nuoc%', '%cà phê%', '%ca phe%', '%coffee%',
                        '%trà%', '%tra%', '%tea%', '%matcha%', '%sinh tố%', '%sinh to%', '%juice%'
                    ])
                )
            """
        elif category == "food":
            category_where = """
                AND (
                    LOWER(COALESCE(dm.ten_danh_muc, '')) LIKE ANY (ARRAY[
                        '%bánh%', '%banh%', '%đồ ăn%', '%do an%', '%thức ăn%',
                        '%thuc an%', '%snack%', '%món ăn%', '%mon an%'
                    ])
                )
            """

        search_where = ""
        search_params: Dict[str, Any] = {}
        if str(search_text or "").strip():
            search_where = """
                AND (
                    LOWER(COALESCE(dm.ten_danh_muc, '')) LIKE :search_text
                    OR LOWER(sp.ten_san_pham) LIKE :search_text
                )
            """
            search_params["search_text"] = f"%{str(search_text).strip().lower()}%"

        def get_by_rating():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    SELECT sp.ten_san_pham, COALESCE(AVG(dg.so_sao), 0) as avg_rating
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    JOIN {order_schema}.danh_gia_san_pham dg ON TRIM(sp.ma_san_pham::text) = TRIM(dg.ma_san_pham::text)
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham
                    ORDER BY avg_rating DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_hot():
            cf_model = getattr(sys.modules.get("__main__"), "cf_model", None)
            if cf_model is not None and user_id and category == "all":
                recs = cf_model.recommend(user_id=user_id, limit=top_k, category_filter=category)
                return [r["name"] for r in recs]
            else:
                with engine.connect() as conn:
                    rows = conn.execute(text(f"""
                        SELECT sp.ten_san_pham
                        FROM {menu_schema}.san_pham sp
                        {category_join}
                        WHERE sp.trang_thai = TRUE {category_where} {search_where}
                        ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                        LIMIT :top_k
                    """), {"top_k": top_k, **search_params}).mappings().all()
                    return [r["ten_san_pham"] for r in rows]

        def get_all_alphabet():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.ten_san_pham ASC
                """), search_params).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_price_desc():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.gia_ban DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_price_asc():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.gia_ban ASC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        # Lớp 1
        products = []
        source = criteria
        if criteria == "rating":
            products = get_by_rating()
            if not products: # Lớp 2 (Fallback)
                products = get_by_hot()
                source = "hot"
        elif criteria == "price_desc":
            products = get_by_price_desc()
        elif criteria == "price_asc":
            products = get_by_price_asc()
        else:
            products = get_by_hot()

        # Lớp 3 (Fallback cuối cùng)
        if not products:
            products = get_all_alphabet()
            source = "alphabet"

        if not products:
            return {
                "status": "not_found", 
                "message": f"BẮT BUỘC BÁO KHÁCH: Hiện hệ thống thực sự không có món nào thuộc danh mục này. Hãy chủ động gợi ý khách chuyển sang danh mục khác (ví dụ: 'Bạn có muốn tham khảo menu {'đồ ăn' if category == 'drink' else 'đồ uống'} không?')!"
            }

        final_recommendation = ", ".join(products)
        note = ""
        if criteria == "rating" and source == "hot":
            note = "BẮT BUỘC BÁO KHÁCH: Hiện tại danh mục này chưa có sản phẩm nào có đánh giá. Đây là các món BÁN CHẠY (hot) thay thế. TUYỆT ĐỐI KHÔNG được nói đây là món đánh giá cao."
        elif source == "alphabet":
            note = f"BẮT BUỘC BÁO KHÁCH: Món này chưa có đánh giá hoặc lượt mua nổi bật, đây là danh sách {len(products)} món có sẵn trong menu."
        elif len(products) < top_k:
            note = f"Lưu ý: Chỉ tìm thấy {len(products)} sản phẩm phù hợp."

        if note:
            final_recommendation = f"{final_recommendation}. {note}"

        with engine.connect() as conn:
            product_rows = conn.execute(text(f"""
                SELECT sp.ma_san_pham::text AS product_id,
                       sp.ten_san_pham AS product_name,
                       sp.gia_ban AS final_price,
                       sp.hinh_anh_url,
                       dm.ten_danh_muc AS category
                FROM {menu_schema}.san_pham sp
                LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                WHERE sp.ten_san_pham = ANY(:product_names)
            """), {"product_names": products}).mappings().all()
        product_by_name = {row["product_name"]: _clean_dict(dict(row)) for row in product_rows}
        structured_products = [product_by_name[name] for name in products if name in product_by_name]

        # Strip image URLs from the AI-visible product list to prevent the model
        # from rendering markdown images in the chat reply.  The frontend picks
        # up images from cache.current.products (fetched at /menu/san-pham).
        ai_products = [
            {k: v for k, v in p.items() if k != "hinh_anh_url"}
            for p in structured_products
        ]

        return {
            "status": "ok",
            "source": source,
            "recommendations": final_recommendation,
            "products": ai_products,
        }

    except Exception as e:
        logger.error("[AgentTools] get_recommendations error: %s", e)
        return {"status": "error", "message": "Không thể lấy gợi ý lúc này."}
