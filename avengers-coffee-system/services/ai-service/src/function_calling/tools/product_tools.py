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
            SELECT ma_danh_muc AS leaf_id, ma_danh_muc_cha, ten_danh_muc, 0 AS depth
            FROM {menu_schema}.danh_muc
            UNION ALL
            SELECT a.leaf_id, parent.ma_danh_muc_cha, parent.ten_danh_muc, a.depth + 1
            FROM ancestors a JOIN {menu_schema}.danh_muc parent
              ON parent.ma_danh_muc = a.ma_danh_muc_cha
            WHERE a.depth < 8
        ), category_paths AS (
            SELECT leaf_id,
                   STRING_AGG(LOWER(ten_danh_muc), ' ' ORDER BY depth) AS category_path,
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
                "sort_by": {"type": "string", "enum": ["price_asc", "price_desc", "sold_desc", "new"]},
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
        predicates.append("dm.ma_danh_muc::text = :category_id")
        params["category_id"] = category_id
    if min_price is not None:
        predicates.append("sp.gia_ban " + (">=" if min_price_inclusive else ">") + " :min_price")
        params["min_price"] = float(min_price)
    if max_price is not None:
        predicates.append("sp.gia_ban " + ("<=" if max_price_inclusive else "<") + " :max_price")
        params["max_price"] = float(max_price)
    ranking = sort_by == "sold_desc"
    if sort_by not in {"price_asc", "price_desc", "sold_desc", "new"}:
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
    if sort_by == "new":
        predicates.append("sp.la_moi = TRUE")
    terms = _catalog_name_key(search_text).split() if search_text else []
    order = "DESC" if sort_by == "price_desc" else "ASC"
    sort_sql = ("sales.sold_count DESC, sp.ma_san_pham ASC" if ranking else
                "sp.ten_san_pham ASC, sp.ma_san_pham ASC" if sort_by == "new" else
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
            clean_comments = [re.sub(r"^\[.*?\]\s*(?:[^:]+:\s*)?", "", c).strip() for c in comments]
            clean_comments = [c for c in clean_comments if c]

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

def execute_get_recommendations(user_id: Optional[str] = None, criteria: str = "hot", category: str = "all", top_k: int = 5, search_text: Optional[str] = None, period: str = "month", period_anchor: Optional[str] = None, preference_query: Optional[str] = None, preference_concepts: Optional[list] = None) -> Dict[str, Any]:
    if criteria == 'preferences':
        from .description_recommendations import recommend_from_descriptions
        return recommend_from_descriptions(preference_query, category, top_k, search_text, preference_concepts)
    if criteria in {"hot", "bestsellers", "new"}:
        return execute_filter_catalog(category=category, search_text=search_text, limit=top_k,
            sort_by="sold_desc" if criteria in {"hot", "bestsellers"} else "new", period=period, period_anchor=period_anchor)
    try:
        engine = _get_engine()
        import os
        import sys
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        category = str(category or "all").lower()
        if category not in {"drink", "food", "all"}:
            return {"status": "error", "message": "Danh mục gợi ý không hợp lệ."}

        # Category IDs differ between seed data and deployed databases. Reuse
        # the same recursive ancestry contract as execute_filter_catalog.
        category_cte = _category_hierarchy_cte(menu_schema)
        category_join = f"""
            LEFT JOIN {menu_schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
            JOIN category_paths paths ON paths.leaf_id = sp.ma_danh_muc
        """
        category_path = "COALESCE(paths.category_path, '')"
        category_where = ""
        category_params: Dict[str, Any] = {}
        if category == "drink":
            category_where = " AND paths.root_name = ANY(:category_roots)"
            category_params["category_roots"] = list(_DRINK_ROOTS)
        elif category == "food":
            category_where = " AND paths.root_name = ANY(:category_roots)"
            category_params["category_roots"] = list(_FOOD_ROOTS)

        search_where = ""
        search_params: Dict[str, Any] = {}
        if str(search_text or "").strip():
            search_where = """
                AND (
                    """ + category_path + """ LIKE :search_text
                    OR LOWER(sp.ten_san_pham) LIKE :search_text
                )
            """
            search_params["search_text"] = f"%{str(search_text).strip().lower()}%"

        def get_by_rating():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    {category_cte}
                    SELECT sp.ten_san_pham, COALESCE(AVG(dg.so_sao), 0) as avg_rating
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    JOIN {order_schema}.danh_gia_san_pham dg ON TRIM(sp.ma_san_pham::text) = TRIM(dg.ma_san_pham::text)
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham
                    ORDER BY avg_rating DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **category_params, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_hot():
            cf_model = getattr(sys.modules.get("__main__"), "cf_model", None)
            if cf_model is not None and user_id and category == "all":
                recs = cf_model.recommend(user_id=user_id, limit=top_k, category_filter=category)
                return [r["name"] for r in recs]
            else:
                with engine.connect() as conn:
                    rows = conn.execute(text(f"""
                        {category_cte}
                        SELECT sp.ten_san_pham
                        FROM {menu_schema}.san_pham sp
                        {category_join}
                        WHERE sp.trang_thai = TRUE {category_where} {search_where}
                        ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                        LIMIT :top_k
                    """), {"top_k": top_k, **category_params, **search_params}).mappings().all()
                    return [r["ten_san_pham"] for r in rows]

        def get_all_alphabet():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    {category_cte}
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.ten_san_pham ASC
                """), {**category_params, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_price_desc():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    {category_cte}
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.gia_ban DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **category_params, **search_params}).mappings().all()
                return [r["ten_san_pham"] for r in rows]

        def get_by_price_asc():
            with engine.connect() as conn:
                rows = conn.execute(text(f"""
                    {category_cte}
                    SELECT sp.ten_san_pham
                    FROM {menu_schema}.san_pham sp
                    {category_join}
                    WHERE sp.trang_thai = TRUE {category_where} {search_where}
                    ORDER BY sp.gia_ban ASC, sp.ten_san_pham ASC
                    LIMIT :top_k
                """), {"top_k": top_k, **category_params, **search_params}).mappings().all()
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
                {category_cte}
                SELECT sp.ma_san_pham::text AS product_id,
                       sp.ten_san_pham AS product_name,
                       sp.gia_ban AS final_price,
                       sp.hinh_anh_url,
                       dm.ten_danh_muc AS category,
                       paths.root_name AS parent_category
                FROM {menu_schema}.san_pham sp
                {category_join}
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
