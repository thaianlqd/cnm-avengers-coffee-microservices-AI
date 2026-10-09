import re
import logging
import html
import unicodedata
from typing import Any, Dict, Optional
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict, _norm
from src.common import cart_manager

logger = logging.getLogger(__name__)

# Menu currently has no scope/type column. Its category hierarchy is the
# canonical classification source; keep root/leaf mapping in this one place.
_DRINK_ROOTS = ("Cà Phê", "Trà", "Thức Uống Đá Xay")
_FOOD_ROOTS = ("Bánh & Đồ Ăn",)


def _category_hierarchy_cte(menu_schema: str) -> str:
    """Authoritative full category ancestry shared by catalog read providers."""
    return f"""
        WITH RECURSIVE ancestors AS (
            SELECT ma_danh_muc AS leaf_id, ma_danh_muc AS ancestor_id, ma_danh_muc_cha, ten_danh_muc, 0 AS depth
            FROM {menu_schema}.danh_muc
            UNION ALL
            SELECT a.leaf_id, parent.ma_danh_muc, parent.ma_danh_muc_cha, parent.ten_danh_muc, a.depth + 1
            FROM ancestors a JOIN {menu_schema}.danh_muc parent
              ON parent.ma_danh_muc = a.ma_danh_muc_cha
            WHERE a.depth < 8
        ), category_paths AS (
            SELECT leaf_id,
                   STRING_AGG(LOWER(ten_danh_muc), ' ' ORDER BY depth) AS category_path,
                   ARRAY_AGG(ancestor_id::text ORDER BY depth DESC) AS category_ids,
                   ARRAY_AGG(ten_danh_muc ORDER BY depth DESC) AS category_names,
                   (ARRAY_AGG(ten_danh_muc ORDER BY depth DESC))[1] AS root_name
            FROM ancestors
            GROUP BY leaf_id
        )
    """


def _catalog_name_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").replace("đ", "d")

TOOL_FILTER_CATALOG = {
    "type": "function",
    "function": {
        "name": "filter_catalog",
        "description": "Filter actual Menu products by sellable scope and SQL price bounds; never use knowledge search for shopping constraints.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": ["all", "drink", "food"]},
                "category_id": {"type": "string"},
                "sellable_scope": {"type": "string", "enum": ["normal", "topping"]},
                "min_price": {"type": "number"},
                "min_price_inclusive": {"type": "boolean"},
                "max_price": {"type": "number"},
                "max_price_inclusive": {"type": "boolean"},
                "search_text": {"type": "string"},
                "sort_by": {"type": "string", "enum": ["menu", "price_asc", "price_desc", "sold_desc", "new", "rating_desc", "rating_asc"]},
                "period": {"type": "string", "enum": ["day", "week", "month", "year", "all"]},
                "period_anchor": {"type": "string", "description": "YYYY-MM-DD within the requested Vietnam calendar period; omit for current period."},
                "limit": {"type": "integer"},
            },
        },
    },
}


def execute_filter_catalog(category: str = "all", sellable_scope: str = "normal",
                           min_price: Optional[float] = None, min_price_inclusive: bool = True,
                           max_price: Optional[float] = None, max_price_inclusive: bool = True,
                           search_text: Optional[str] = None, sort_by: str = "price_asc",
                           limit: int = 16, constraint_type: Optional[str] = None,
                           approx_price: Optional[int] = None, period: str = "month",
                           period_anchor: Optional[str] = None, category_id: Optional[str] = None,
                           product_ids: Optional[list[str]] = None) -> Dict[str, Any]:
    import os
    if category not in {"all", "drink", "food"} or sellable_scope not in {"normal", "topping"}:
        return {"status": "error", "message": "Bộ lọc danh mục không hợp lệ."}
    menu_schema = os.getenv("MENU_SCHEMA", "menu")
    root_names = (_DRINK_ROOTS + _FOOD_ROOTS if category == "all" else
                  _DRINK_ROOTS if category == "drink" else _FOOD_ROOTS)
    params: Dict[str, Any] = {"roots": list(root_names), "limit": max(1, min(50, int(limit or 16)))}
    predicates = ["sp.trang_thai = TRUE"]
    if product_ids is not None:
        if not product_ids:
            return {'status': 'not_found', 'products': []}
        predicates.append('sp.ma_san_pham::text = ANY(:product_ids)')
        params['product_ids'] = [str(key) for key in product_ids]
    if sellable_scope == "topping":
        predicates.append("LOWER(dm.ten_danh_muc) = 'topping'")
    else:
        predicates.append("paths.root_name = ANY(:roots)")
    if category_id:
        predicates.append(":category_id = ANY(paths.category_ids)")
        params["category_id"] = category_id
    if min_price is not None:
        predicates.append("sp.gia_ban " + (">=" if min_price_inclusive else ">") + " :min_price")
        params["min_price"] = float(min_price)
    if max_price is not None:
        predicates.append("sp.gia_ban " + ("<=" if max_price_inclusive else "<") + " :max_price")
        params["max_price"] = float(max_price)
    ranking = sort_by == "sold_desc"
    rating_ranking = sort_by in {"rating_desc", "rating_asc"}
    if sort_by not in {"menu", "price_asc", "price_desc", "sold_desc", "new", "rating_desc", "rating_asc"}:
        return {"status": "error", "message": "Tiêu chí sắp xếp không hợp lệ."}
    sales_cte, sales_join, sales_columns = "", "", ""
    if ranking:
        from .sales_period import sales_window
        try:
            params["period_start"], params["period_end"] = sales_window(period, period_anchor)
        except (ValueError, TypeError, OverflowError):
            return {"status": "error", "message": "Bạn chọn ngày hợp lệ theo dạng YYYY-MM-DD nhé."}
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        sales_cte = f""", sales AS (
            SELECT ct.ma_san_pham::text AS product_id, SUM(ct.so_luong)::bigint AS sold_count,
                   COUNT(DISTINCT d.ma_don_hang)::integer AS order_count
            FROM {order_schema}.chi_tiet_don_hang ct JOIN {order_schema}.don_hang d USING (ma_don_hang)
            WHERE d.trang_thai_don_hang = 'HOAN_THANH' AND d.trang_thai_thanh_toan = 'DA_THANH_TOAN'
              AND ct.so_luong > 0 AND (CAST(:period_start AS timestamptz) IS NULL OR d.ngay_tao >= CAST(:period_start AS timestamptz))
              AND d.ngay_tao < CAST(:period_end AS timestamptz) GROUP BY ct.ma_san_pham)"""
        sales_join = "JOIN sales ON sales.product_id = sp.ma_san_pham::text"
        sales_columns = ", sales.sold_count, sales.order_count"
    if rating_ranking:
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        sales_cte = f""", ratings AS (
            SELECT TRIM(ma_san_pham::text) AS product_id, AVG(so_sao)::float AS avg_rating,
                   COUNT(*)::integer AS total_reviews
            FROM {order_schema}.danh_gia_san_pham
            WHERE so_sao BETWEEN 1 AND 5 GROUP BY TRIM(ma_san_pham::text))"""
        sales_join = "JOIN ratings ON ratings.product_id = sp.ma_san_pham::text"
        sales_columns = ", ratings.avg_rating, ratings.total_reviews"
    if sort_by == "new":
        predicates.append("sp.la_moi = TRUE")
    terms = _catalog_name_key(search_text).split() if search_text else []
    order = "DESC" if sort_by == "price_desc" else "ASC"
    sort_sql = ("sales.sold_count DESC, sp.ma_san_pham ASC" if ranking else
                ("ratings.avg_rating " + ("ASC" if sort_by == "rating_asc" else "DESC") +
                 ", ratings.total_reviews DESC, sp.ten_san_pham ASC, sp.ma_san_pham ASC") if rating_ranking else
                "sp.ten_san_pham ASC, sp.ma_san_pham ASC" if sort_by in {"menu", "new"} else
                f"sp.gia_ban {order}, sp.ten_san_pham ASC, sp.ma_san_pham ASC")
    try:
        products = []
        page_size = 256 if terms else params["limit"]
        offset = 0
        with _get_engine().connect() as conn:
            query = text(f"""
                {_category_hierarchy_cte(menu_schema)}{sales_cte}
                SELECT sp.ma_san_pham::text AS product_id, sp.ten_san_pham AS product_name,
                       sp.hinh_anh_url,
                       sp.gia_ban AS final_price, dm.ten_danh_muc AS category,
                       paths.root_name AS parent_category,
                       CASE WHEN LOWER(dm.ten_danh_muc) = 'topping' THEN 'topping'
                            WHEN paths.root_name = ANY(:drink_roots) THEN 'drink'
                            WHEN paths.root_name = ANY(:food_roots) THEN 'food'
                            ELSE 'unknown' END AS menu_bucket {sales_columns}, sp.la_moi
                FROM {menu_schema}.san_pham sp
                JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                JOIN category_paths paths ON paths.leaf_id = dm.ma_danh_muc
                {sales_join}
                WHERE {' AND '.join(predicates)}
                ORDER BY {sort_sql}
                LIMIT :page_size OFFSET :page_offset
            """)
            while True:
                rows = conn.execute(query, {**params, "drink_roots": list(_DRINK_ROOTS),
                    "food_roots": list(_FOOD_ROOTS), "page_size": page_size,
                    "page_offset": offset}).mappings().all()
                for row in rows:
                    product = _clean_dict(dict(row))
                    haystack = " ".join(_catalog_name_key(product.get(field)) for field in
                                        ("product_name", "category", "parent_category"))
                    def _term_matches(t, text):
                        if t == "mat":
                            return bool(re.search(r'(?<!\w)mat(?!\w)', text)) or "nong" not in text
                        if t in {"nong", "lanh"}:
                            return bool(re.search(r'(?<!\w)' + re.escape(t) + r'(?!\w)', text))
                        return t in text
                    if not terms or all(_term_matches(term, haystack) for term in terms):
                        products.append(product)
                        if len(products) >= params["limit"]:
                            break
                if len(products) >= params["limit"] or len(rows) < page_size:
                    break
                offset += page_size
        return {"status": "ok" if products else "not_found", "products": products[:params["limit"]],
            **({"ordering_basis": "canonical_menu_name_id"} if sort_by == "menu" else {}),
            **({"ranking": "recorded_product_rating", "message":
                "Xếp theo điểm trung bình từ đánh giá sản phẩm trong hệ thống; khi bằng điểm, ưu tiên nhiều lượt đánh giá hơn." if products else
                "Chưa có sản phẩm phù hợp có đánh giá để xếp hạng."} if rating_ranking else {}),
            **({"ranking": "completed_paid_quantity", "period": period, "period_anchor": period_anchor,
                "period_start": str(params["period_start"]), "period_end": str(params["period_end"]),
                "message": "Xếp theo số lượng đã bán trong đơn hoàn thành, đã thanh toán." if products else
                    "Chưa có món đã bán từ đơn hoàn thành, đã thanh toán trong khoảng này."} if ranking else {}),
            **({"new_product_basis": "Menu.la_moi", "message": "Các món được Menu đánh dấu mới; chưa có ngày ra mắt để xếp theo thời gian."} if sort_by == "new" else {})}
    except Exception as error:
        logger.warning("catalog filter failed: %s", type(error).__name__)
        return {"status": "error", "message": "Chưa thể tra cứu menu lúc này."}

def execute_get_menu_categories() -> Dict[str, Any]:
    """Only leaf categories with active sellable products, from Menu authority."""
    import os
    menu_schema = os.getenv("MENU_SCHEMA", "menu")
    try:
        with _get_engine().connect() as conn:
            rows = conn.execute(text(f"""
                {_category_hierarchy_cte(menu_schema)}
                SELECT DISTINCT dm.ma_danh_muc::text AS category_id,
                    dm.ten_danh_muc AS category_name,
                    paths.category_ids, paths.category_names,
                    CASE WHEN paths.root_name = ANY(:drink_roots) THEN 'drink'
                         ELSE 'food' END AS menu_bucket
                FROM {menu_schema}.danh_muc dm
                JOIN category_paths paths ON paths.leaf_id = dm.ma_danh_muc
                JOIN {menu_schema}.san_pham sp ON sp.ma_danh_muc = dm.ma_danh_muc
                WHERE sp.trang_thai = TRUE AND paths.root_name = ANY(:roots)
                ORDER BY menu_bucket, category_name
            """), {"drink_roots": list(_DRINK_ROOTS),
                    "roots": list(_DRINK_ROOTS + _FOOD_ROOTS)}).mappings().all()
        return {"status": "ok", "menu_categories": [_clean_dict(dict(row)) for row in rows]}
    except Exception as error:
        logger.warning("menu categories failed: %s", type(error).__name__)
        return {"status": "error", "message": "Mình chưa đọc được danh mục menu. Bạn thử lại nhé."}


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


class CanonicalProductOptionRef(str):
    """String-compatible product reference that also carries canonical ID."""

    def __new__(cls, product_name: str, product_id: str):
        value = super().__new__(cls, product_name)
        value.product_id = str(product_id)
        return value

def execute_get_product_options(product_name: str = "", product_id: Optional[str] = None) -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        menu_schema = os.getenv("MENU_SCHEMA", "menu")

        # Cart edit callers use a string-compatible reference so legacy tool
        # adapters still see the display name while this provider queries by
        # the authoritative product ID.
        product_id = product_id or getattr(product_name, "product_id", None)

        if product_id is not None:
            conditions = "ma_san_pham::text = :product_id"
            params = {"product_id": str(product_id)}
            logger.debug("[ProductOptions] lookup=product_id requested_id=%s", product_id)
        else:
            query_norm = product_name.lower()
            words = [w for w in query_norm.split() if len(w) > 1]
            if not words:
                return {"status": "error", "message": "Tên sản phẩm không hợp lệ."}
            conditions = " AND ".join([f"LOWER(ten_san_pham) LIKE :w_{i}" for i in range(len(words))])
            params = {f"w_{i}": f"%{w}%" for i, w in enumerate(words)}
        
        with engine.connect() as conn:
            row = conn.execute(text(
                f"""
                SELECT ma_san_pham::text, ten_san_pham, bien_the, sizes,
                       toppings, luong_da, do_ngot, loai_sua, gia_ban
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
            logger.debug("[ProductOptions] lookup=%s resolved_id=%s",
                         "product_id" if "product_id" in params else "product_name", product_id)
            product_data = dict(zip(
                ("bien_the", "sizes", "toppings", "luong_da", "do_ngot", "loai_sua", "gia_ban"),
                list(row)[2:],
            ))

            opts = conn.execute(text(
                f"""
                SELECT tt.ten_thuoc_tinh, bt.gia_tri
                FROM {menu_schema}.bien_the_san_pham bt
                JOIN {menu_schema}.thuoc_tinh tt ON bt.ma_thuoc_tinh = tt.ma_thuoc_tinh
                WHERE bt.ma_san_pham::text = :pid
                ORDER BY bt.id
                """
            ), {"pid": product_id}).fetchall()
            
            from collections import defaultdict
            options_dict = defaultdict(list)
            for r in opts:
                group = " ".join(html.unescape(str(r[0] or "")).replace("\xa0", " ").split())
                value = " ".join(html.unescape(str(r[1] or "")).replace("\xa0", " ").split())
                if group and value and value not in options_dict[group]:
                    options_dict[group].append(value)
                
            if not options_dict:
                return {
                    "status": "ok", 
                    "product_id": product_id,
                    "product_name": found_name, 
                    "options": {},
                    "message": f"Sản phẩm {found_name} không có tùy chọn (size, đá, đường) nào. Cứ đặt mặc định."
                }
                
            opts_str = ", ".join([f"{k}: [{', '.join(v)}]" for k, v in options_dict.items()])
            from src.agents.option_state import option_schema_from_result, option_field
            result = {
                "status": "ok",
                "product_id": product_id,
                "product_name": found_name,
                "options": {key: list(values) for key, values in options_dict.items()},
                "option_groups": [
                    {
                        "name": key,
                        "values": list(values),
                        "required": option_field(key) == "size",
                        "multiple": option_field(key) == "toppings",
                        "fixed": len(values) == 1,
                    }
                    for key, values in options_dict.items()
                ],
                "message": f"BẮT BUỘC: Khi hỏi khách về tùy chọn của {found_name}, bạn CHỈ ĐƯỢC PHÉP dùng y hệt các nhãn này (không dịch, không đổi). Các tùy chọn là: {opts_str}"
            }
            result["option_groups"] = option_schema_from_result({**result, "product_data": product_data})
            return result
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
                        dm.ten_danh_muc AS category,
                        dm_cha.ten_danh_muc AS parent_category
                    FROM {menu_schema}.san_pham sp
                    LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                    LEFT JOIN {menu_schema}.danh_muc dm_cha ON dm_cha.ma_danh_muc = dm.ma_danh_muc_cha
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
                           dm.ten_danh_muc AS category,
                           dm_cha.ten_danh_muc AS parent_category
                    FROM {menu_schema}.san_pham sp
                    LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                    LEFT JOIN {menu_schema}.danh_muc dm_cha ON dm_cha.ma_danh_muc = dm.ma_danh_muc_cha
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

        inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")
        prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
        fulfillment_selected = bool(prefs.get("delivery_type"))
        has_outlet = fulfillment_selected and branch_id.strip().lower() not in {"chưa chọn", "chua chon", "none", "null"}
        results = []
        for p in top:
            base_price = float(p["gia_ban"] or 0)
            from src.function_calling.tools.cart_tools import _variant_unit_price
            extra_values = [value for value in [*(toppings or []), luong_da, do_ngot, loai_sua] if value]
            variant_rows = []
            if size or extra_values:
                with engine.connect() as conn:
                    variant_rows = conn.execute(text(f"""
                        SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
                        FROM {menu_schema}.bien_the_san_pham bt
                        JOIN {menu_schema}.thuoc_tinh tt ON bt.ma_thuoc_tinh = tt.ma_thuoc_tinh
                        WHERE bt.ma_san_pham::text = :pid
                    """), {"pid": str(p["product_id"])}).fetchall()
            final_price = _variant_unit_price(base_price, variant_rows, size, extra_values)
            availability_status = "unknown"
            in_stock = None
            stock_quantity = None
            if has_outlet and str(p["product_id"]).isdigit():
                from src.common.inventory_validation import availability_at_branch
                availability = availability_at_branch(engine, branch_id, [{
                    "product_id": str(p["product_id"]), "product_name": p["ten_san_pham"],
                }], inventory_schema)
                availability_status = ("unavailable" if availability["unavailable"] else
                                       "unknown" if availability["unverified"] else "available")
                in_stock = (None if availability_status == "unknown" else availability_status == "available")
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

            results.append({
                "product_id": p["product_id"],
                "product_name": p["ten_san_pham"],
                "category": p.get("category"),
                "parent_category": p.get("parent_category"),
                "base_price": base_price,
                "size": size,
                "size_surcharge": next((float(row[2] or 0) - base_price for row in variant_rows
                                        if ("size" in _norm(row[0]) or "kich thuoc" in _norm(row[0]))
                                        and _norm(row[1]) == _norm(size)), 0.0),
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
            rows = conn.execute(text(
                f"""
                SELECT ma_san_pham::text, ten_san_pham
                FROM {menu_schema}.san_pham
                WHERE trang_thai = TRUE AND {conditions}
                ORDER BY ten_san_pham ASC
                LIMIT 16
                """
            ), params).fetchall()
            exact = [row for row in rows if _catalog_name_key(row[1]).strip() == _catalog_name_key(product_name).strip()]
            matches = exact or rows
            if not matches:
                return {"status": "not_found", "message": f"Không tìm thấy món '{product_name}' trong menu."}
            if len(matches) != 1:
                return {'status': 'ambiguous_reference', 'unresolved_namespace': 'PRODUCT',
                    'products': [{'product_id': str(row[0]), 'product_name': row[1]} for row in matches],
                    'message': 'Có nhiều món phù hợp. Bạn chọn đúng tên món để mình đọc đánh giá nhé.'}
            product_id, found_name = matches[0]

            stats = conn.execute(text(
                f"""
                SELECT 
                    ROUND(COALESCE(AVG(so_sao), 0)::numeric, 1) as avg_rating,
                    COUNT(id) as total_reviews,
                    COUNT(*) FILTER (WHERE so_sao = 5),
                    COUNT(*) FILTER (WHERE so_sao = 4),
                    COUNT(*) FILTER (WHERE so_sao = 3),
                    COUNT(*) FILTER (WHERE so_sao = 2),
                    COUNT(*) FILTER (WHERE so_sao = 1)
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid
                """
            ), {"pid": product_id}).fetchone()

            reviews = conn.execute(text(
                f"""
                SELECT binh_luan, so_sao, ngay_tao
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid AND binh_luan IS NOT NULL AND LENGTH(binh_luan) >= 2
                ORDER BY ngay_tao DESC, id DESC
                LIMIT 5
                """
            ), {"pid": product_id}).fetchall()

            avg_rating = float(stats[0])
            total_reviews = stats[1]
            review_rows = [{'comment': str(r[0]).strip(), 'rating': int(r[1]),
                            'created_at': r[2].isoformat() if r[2] else None} for r in reviews if str(r[0]).strip()]
            # Preserve source labels such as [Dữ liệu mẫu] and the complete
            # comment. Neither a prefix nor text before a colon is disposable.
            clean_comments = [r['comment'] for r in review_rows]

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
            "recent_comments": clean_comments,
            "reviews": review_rows,
            "rating_distribution": {str(star): int(stats[7 - star]) for star in range(5, 0, -1)},
            "message": f"Món {found_name} được đánh giá trung bình {avg_rating}/5 sao (từ {total_reviews} lượt)."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_product_insights error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thông tin đánh giá sản phẩm."}

TOOL_GET_RECOMMENDATIONS = {
    "type": "function",
    "function": {
        "name": "get_recommendations",
        "description": (
            "Gợi ý theo tiêu chí rõ ràng: preferences tìm nhu cầu/hương vị trong mô tả sản phẩm; "
            "bestsellers xếp theo doanh số khi khách yêu cầu bán chạy; rating/price/new theo yêu cầu tương ứng. "
            "Câu xã giao không tự động yêu cầu danh sách sản phẩm. Không đổi nhu cầu thành bán chạy nếu thiếu mô tả."
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
                    "enum": ["hot", "bestsellers", "preferences", "rating", "price_desc", "price_asc", "new"],
                    "description": "preferences: nhu cầu/hương vị (cần preference_query); bestsellers: yêu cầu bán chạy; rating: đánh giá; price_desc/price_asc: giá; new: món mới. hot là tên tương thích cũ của bestsellers."
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
                "category_id": {"type": "string"},
                "min_price": {"type": "number"}, "max_price": {"type": "number"},
                "min_price_inclusive": {"type": "boolean"}, "max_price_inclusive": {"type": "boolean"},
                "preference_query": {"type": "string", "description": "Nhu cầu/hương vị để tìm trong mô tả sản phẩm; chỉ dùng với preferences."},
                "preference_concepts": {"type": "array", "minItems": 1, "maxItems": 4,
                    "items": {"type": "string"}, "description": "preferences: separate concise taste/comfort concepts, without social filler; all need description evidence."},
                "period": {"type": "string", "enum": ["day", "week", "month", "year", "all"]},
                "period_anchor": {"type": "string"},
                "top_k": {
                    "type": "integer",
                    "description": "Số lượng món gợi ý (mặc định 5)."
                },
            },
        },
    },
}

def execute_get_recommendations(user_id: Optional[str] = None, criteria: str = "hot", category: str = "all", top_k: int = 5, search_text: Optional[str] = None, period: str = "month", period_anchor: Optional[str] = None, preference_query: Optional[str] = None, preference_concepts: Optional[list] = None,
                                category_id: Optional[str] = None, min_price: Optional[float] = None,
                                max_price: Optional[float] = None, min_price_inclusive: bool = True,
                                max_price_inclusive: bool = True) -> Dict[str, Any]:
    constraints = dict(category_id=category_id, min_price=min_price, max_price=max_price,
                       min_price_inclusive=min_price_inclusive, max_price_inclusive=max_price_inclusive)
    if criteria in {'rating', 'price_asc', 'price_desc'}:
        return execute_filter_catalog(category=category, search_text=search_text, limit=top_k,
            sort_by='rating_desc' if criteria == 'rating' else criteria, **constraints)
    if criteria == 'preferences':
        from .description_recommendations import recommend_from_descriptions
        return recommend_from_descriptions(preference_query, category, top_k, search_text, preference_concepts, **constraints)
    if criteria in {"hot", "bestsellers", "new"}:
        return execute_filter_catalog(category=category, search_text=search_text, limit=top_k,
            sort_by="sold_desc" if criteria in {"hot", "bestsellers"} else "new", period=period, period_anchor=period_anchor,
            **{k: v for k, v in constraints.items() if v is not None and (not k.endswith("_inclusive") or v is False)})
    return {'status': 'error', 'products': [], 'message': 'Tiêu chí gợi ý không hợp lệ.'}
