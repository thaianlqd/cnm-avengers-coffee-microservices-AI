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


def _clean_dict(d: dict) -> dict:
    import decimal
    res = {}
    import uuid
    for k, v in d.items():
        if isinstance(v, decimal.Decimal):
            res[k] = float(v)
        elif isinstance(v, uuid.UUID):
            res[k] = str(v)
        else:
            res[k] = v
    return res


def execute_ask_branch() -> Dict[str, Any]:
    """Lấy danh sách chi nhánh từ DB để LLM trình bày cho khách (có check giờ)."""
    try:
        import datetime
        # Fix Timezone: UTC+7 (Vietnam)
        now_vn = datetime.datetime.utcnow() + datetime.timedelta(hours=7)
        now = now_vn.time()
        # Mocking business hours 07:00 to 22:30
        open_time = datetime.time(7, 0)
        close_time = datetime.time(22, 30)
        if not (open_time <= now <= close_time):
            return {
                "status": "closed",
                "message": f"Hiện tại là {now.strftime('%H:%M')}, hệ thống cửa hàng chỉ mở cửa từ 07:00 đến 22:30. Xin quý khách thông cảm đặt hàng vào lúc khác."
            }

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi,
                       ROUND(COALESCE(AVG(d.diem_tong_quan), 0)::numeric, 1)::float as avg_rating,
                       COUNT(d.id) as total_reviews
                FROM {identity_schema}.chi_nhanh c
                LEFT JOIN {order_schema}.danh_gia_chi_nhanh d ON c.ma_chi_nhanh::text = d.ma_chi_nhanh::text
                WHERE c.trang_thai = 'ACTIVE'
                GROUP BY c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi
                ORDER BY avg_rating DESC, c.ten_chi_nhanh ASC LIMIT 10
                """
            )).mappings().all()
        branches = [_clean_dict(dict(r)) for r in rows]
        return {
            "status": "need_branch_selection",
            "branches": branches,
            "message": "Vui lòng hỏi khách chọn một trong các chi nhánh trên trước khi tiếp tục.",
        }
    except Exception as e:
        logger.warning("[AgentTools] ask_branch error: %s", e)
        return {"status": "error", "message": "Không thể lấy danh sách chi nhánh."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 1b: find_nearest_branch  –  Tìm chi nhánh theo Quận/Huyện
# ─────────────────────────────────────────────────────────────────────────────

TOOL_FIND_NEAREST_BRANCH = {
    "type": "function",
    "function": {
        "name": "find_nearest_branch",
        "description": "Tìm kiếm chi nhánh (cửa hàng cà phê) gần nhất. Nếu khách hỏi 'gần tôi' hoặc không nói rõ địa điểm, hãy ĐỂ TRỐNG tham số location (location='') để hệ thống tự động lấy địa chỉ mặc định của khách. KHÔNG dùng tool này để trả lời câu hỏi 'địa chỉ của tôi ở đâu' (hãy dùng get_user_profile).",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Địa điểm Quận, Huyện, hoặc Thành phố (ví dụ: 'Hải Châu', 'Quận 1'). Để trống nếu muốn tìm theo địa chỉ của khách."
                },
            },
            "required": [],
        },
    },
}

def execute_find_nearest_branch(location: str = "", session_id: str = "") -> Dict[str, Any]:
    """Tìm chi nhánh gần nhất dựa trên geocoding và khoảng cách Haversine."""
    try:
        import datetime
        # Fix Timezone: UTC+7 (Vietnam)
        now_vn = datetime.datetime.utcnow() + datetime.timedelta(hours=7)
        now = now_vn.time()
        open_time = datetime.time(7, 0)
        close_time = datetime.time(22, 30)
        if not (open_time <= now <= close_time):
            return {
                "status": "closed",
                "message": f"Hiện tại là {now.strftime('%H:%M')}, cửa hàng chỉ mở cửa từ 07:00 đến 22:30."
            }

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        from sqlalchemy import text
        from utils.geo import geocode_address, haversine_distance

        target_address = location.strip() if location else ""
        user_lat, user_lon = None, None

        with engine.connect() as conn:
            # 1. Tìm địa chỉ mặc định của người dùng nếu location trống hoặc quá chung chung
            generic_words = {"toi", "gan", "day", "nao", "nhat"}
            is_generic = all(w in generic_words for w in location.lower().replace(",", " ").split()) if location else True
            
            if (not target_address or is_generic) and session_id:
                addr = conn.execute(text(
                    f"""
                    SELECT dia_chi_day_du, vi_do, kinh_do
                    FROM {identity_schema}.dia_chi_giao_hang 
                    WHERE ma_nguoi_dung::text = :uid AND mac_dinh = true
                    LIMIT 1
                    """
                ), {"uid": session_id}).fetchone()
                
                if addr and addr[0]:
                    target_address = addr[0]
                    if addr[1] is not None and addr[2] is not None:
                        user_lat = float(addr[1])
                        user_lon = float(addr[2])

            if not target_address:
                return {
                    "status": "need_location",
                    "message": "Hệ thống AI hiện chưa được cấp quyền truy cập GPS của khách hàng, và bạn chưa có địa chỉ mặc định. Hãy hỏi khách hàng đang ở địa chỉ nào để tìm chi nhánh gần nhất."
                }

            # 2. Geocode nếu chưa có tọa độ (hoặc user tự gõ location)
            if user_lat is None or user_lon is None:
                coords = geocode_address(target_address)
                if not coords:
                    return {
                        "status": "not_found",
                        "message": f"Rất tiếc, hệ thống bản đồ không thể xác định được vị trí của '{target_address}'. Bạn có thể cung cấp địa chỉ cụ thể hơn không?"
                    }
                user_lat, user_lon = coords
                
                # Nếu là địa chỉ mặc định trong DB mà chưa có tọa độ -> Lưu lại cache
                if session_id and not location:
                    conn.execute(text(
                        f"""
                        UPDATE {identity_schema}.dia_chi_giao_hang 
                        SET vi_do = :lat, kinh_do = :lng 
                        WHERE ma_nguoi_dung::text = :uid AND mac_dinh = true
                        """
                    ), {"lat": user_lat, "lng": user_lon, "uid": session_id})
                    conn.commit()

            # 3. Lấy tất cả chi nhánh ĐÃ CÓ tọa độ
            query = f"""
                SELECT c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi, c.vi_do, c.kinh_do,
                       ROUND(COALESCE(AVG(d.diem_tong_quan), 0)::numeric, 1)::float as avg_rating,
                       COUNT(d.id) as total_reviews
                FROM {identity_schema}.chi_nhanh c
                LEFT JOIN {order_schema}.danh_gia_chi_nhanh d ON c.ma_chi_nhanh::text = d.ma_chi_nhanh::text
                WHERE c.trang_thai = 'ACTIVE' AND c.vi_do IS NOT NULL AND c.kinh_do IS NOT NULL
                GROUP BY c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi, c.vi_do, c.kinh_do
            """
            rows = conn.execute(text(query)).mappings().all()

            if not rows:
                return {
                    "status": "not_found",
                    "message": "Hiện tại hệ thống chưa có chi nhánh nào được cập nhật tọa độ trên bản đồ."
                }

            # 4. Tính khoảng cách Haversine và Sort
            import decimal
            branches = []
            for r in rows:
                dist = haversine_distance(user_lat, user_lon, float(r["vi_do"]), float(r["kinh_do"]))
                branch_dict = {}
                for k, v in r.items():
                    if isinstance(v, decimal.Decimal):
                        branch_dict[k] = float(v)
                    else:
                        branch_dict[k] = v
                branch_dict["khoang_cach_km"] = round(dist, 1)
                branches.append(branch_dict)

            # Sort theo khoảng cách tăng dần, lấy Top 3
            branches.sort(key=lambda x: x["khoang_cach_km"])
            top_branches = branches[:3]

            nearest_dist = top_branches[0]["khoang_cach_km"]
            
            msg = f"Dựa vào địa chỉ của khách ({target_address}), đây là top 3 chi nhánh gần nhất. BẮT BUỘC: Bạn PHẢI đọc TÊN CỤ THỂ của chi nhánh và BÁO SỐ KM (khoang_cach_km) cho khách."
            
            if nearest_dist > 15:
                msg += f" WARNING: Chi nhánh gần nhất cũng cách tới {nearest_dist}km. Hãy báo rõ cho khách là khu vực của khách khá xa các chi nhánh hiện tại."

            return {
                "status": "ok",
                "branches": top_branches,
                "message": msg
            }

    except Exception as e:
        logger.warning("[AgentTools] find_nearest_branch error: %s", e)
        return {"status": "error", "message": "Không thể tìm kiếm chi nhánh lúc này."}


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
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh (ma_chi_nhanh) khách đã chọn.",
                },
                "branch_name": {
                    "type": "string",
                    "description": "Tên chi nhánh cho dễ hiển thị.",
                },
            },
            "required": ["branch_id", "branch_name"],
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

        # Postgres SIMILAR TO search for semantic matching
        query_norm = _norm(product_name_query)
        words = [w for w in query_norm.split() if len(w) > 1]
        
        if words:
            pattern = "%(" + "|".join(words) + ")%"
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
                      AND LOWER(sp.ten_san_pham) SIMILAR TO :pattern
                    ORDER BY sp.la_hot DESC, sp.ten_san_pham ASC
                    LIMIT 3
                    """
                ), {"pattern": pattern}).mappings().all()
            top = [_clean_dict(dict(r)) for r in rows]
        else:
            top = []

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
#  TOOL 3b: get_product_insights  –  Xem Đánh giá / Review sản phẩm
# ─────────────────────────────────────────────────────────────────────────────

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
    """Truy vấn bảng danh_gia_san_pham để lấy avg rating và top bình luận (dựa trên tên sản phẩm)."""
    try:
        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        menu_schema = os.getenv("MENU_SCHEMA", "menu")

        query_norm = _norm(product_name)
        words = [w for w in query_norm.split() if len(w) > 1]
        if not words:
            return {"status": "error", "message": "Tên sản phẩm không hợp lệ."}
        
        pattern = "%(" + "|".join(words) + ")%"
        with engine.connect() as conn:
            # Tìm product_id
            row = conn.execute(text(
                f"""
                SELECT ma_san_pham::text, ten_san_pham
                FROM {menu_schema}.san_pham
                WHERE trang_thai = TRUE 
                  AND LOWER(ten_san_pham) SIMILAR TO :pattern
                ORDER BY la_hot DESC, ten_san_pham ASC
                LIMIT 1
                """
            ), {"pattern": pattern}).fetchone()
            
            if not row:
                return {"status": "not_found", "message": f"Không tìm thấy món '{product_name}' trong menu."}
                
            product_id = row[0]
            found_name = row[1]

            # 1. Get average rating and count
            stats = conn.execute(text(
                f"""
                SELECT 
                    ROUND(COALESCE(AVG(so_sao), 0)::numeric, 1) as avg_rating,
                    COUNT(id) as total_reviews
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid
                """
            ), {"pid": product_id}).fetchone()

            # 2. Get top 2 recent comments
            reviews = conn.execute(text(
                f"""
                SELECT binh_luan
                FROM {order_schema}.danh_gia_san_pham
                WHERE ma_san_pham::text = :pid AND binh_luan IS NOT NULL AND LENGTH(binh_luan) >= 2
                ORDER BY ngay_tao DESC
                LIMIT 2
                """
            ), {"pid": product_id}).fetchall()

        if not stats or stats[1] == 0:
            return {
                "status": "ok",
                "product_name": found_name,
                "avg_rating": 0,
                "total_reviews": 0,
                "recent_reviews": [],
                "message": f"BẮT BUỘC: Bạn phải thông báo Y HỆT câu sau: 'Hiện tại món {found_name} chưa có đánh giá nào'. TUYỆT ĐỐI KHÔNG tự bịa ra số sao (như 4.8 hay 5 sao) hay tự bịa số lượng đánh giá (như 100 đánh giá). Nếu bạn bịa, hệ thống sẽ lỗi."
            }

        # Pre-format reviews in code so LLM doesn't have to invent phrasing
        formatted_reviews = []
        for r in reviews:
            cmt = str(r[0]).strip()
            if len(cmt) > 100:
                cmt = cmt[:97] + "..."
            formatted_reviews.append(f'Khách hàng nhận xét: "{cmt}"')
            
        review_text = " và ".join(formatted_reviews)

        return {
            "status": "ok",
            "product_name": found_name,
            "avg_rating": float(stats[0]),
            "total_reviews": int(stats[1]),
            "recent_reviews_formatted": review_text,
            "message": f"BẮT BUỘC: Bạn phải đọc đúng thông số: món này có {float(stats[0])} sao dựa trên {int(stats[1])} đánh giá. Sau đó chèn y hệt đoạn nhận xét: [{review_text}]. TUYỆT ĐỐI KHÔNG làm tròn hay bịa thêm."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_product_insights error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thông tin đánh giá sản phẩm."}



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
                "product_id": {"type": "string", "description": "Mã sản phẩm (từ check_price_and_stock)."},
                "product_name": {"type": "string", "description": "Tên sản phẩm (để hiển thị)."},
                "unit_price": {"type": "number", "description": "Giá đơn vị (từ final_price của check_price_and_stock)."},
                "quantity": {"type": "integer", "description": "Số lượng (mặc định 1)."},
                "size": {"type": "string", "enum": ["S", "M", "L"], "description": "Kích cỡ (nếu có)."},
                "note": {"type": "string", "description": "Ghi chú thêm (ít đường, không đá...)."},
            },
            "required": ["product_id", "product_name", "unit_price"],
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
        "description": "Lấy danh sách và tổng tiền giỏ hàng hiện tại (chưa thanh toán/chưa đặt) của phiên chat. KHÔNG dùng để tra cứu đơn hàng đã đặt thành công.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
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
            "required": [],
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
                    JOIN {order_schema}.danh_gia_san_pham dg ON sp.ma_san_pham::text = dg.ma_san_pham::text
                    WHERE sp.trang_thai = TRUE
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham
                    ORDER BY avg_rating DESC, sp.ten_san_pham ASC
                    LIMIT :top_k
                    """
                ), {"top_k": top_k}).mappings().all()
            if not rows:
                return {
                    "status": "not_found", 
                    "message": "BẮT BUỘC: Bạn phải nói với khách Y HỆT câu này: 'Hiện tại chưa có sản phẩm nào có đánh giá trên hệ thống'. TUYỆT ĐỐI KHÔNG được tự ý lấy món bất kỳ và gán cho nó rating cao."
                }
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
#  TOOL 9: track_order_status  –  Kiểm tra trạng thái đơn hàng (Chống IDOR)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_TRACK_ORDER_STATUS = {
    "type": "function",
    "function": {
        "name": "track_order_status",
        "description": (
            "Kiểm tra trạng thái của một đơn hàng cụ thể bằng mã đơn hàng. "
            "Chỉ gọi khi khách hàng cung cấp mã đơn hàng."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng (ma_don_hang) mà khách muốn kiểm tra."
                },
            },
            "required": ["order_id"],
        },
    },
}

def execute_track_order_status(order_id: str, session_id: str) -> Dict[str, Any]:
    """
    Tra cứu trạng thái đơn hàng.
    [SECURITY]: Bắt buộc kiểm tra ma_nguoi_dung = session_id để chống IDOR.
    """
    try:
        import uuid
        try:
            uuid.UUID(session_id)
        except ValueError:
            return {
                "status": "denied",
                "message": "Xin lỗi, mình chỉ có thể tra cứu đơn hàng thuộc tài khoản của bạn. Vui lòng đăng nhập để sử dụng tính năng này."
            }

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            row = conn.execute(text(
                f"""
                SELECT ma_don_hang, trang_thai_don_hang, trang_thai_thanh_toan, tong_tien
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :order_id AND ma_nguoi_dung = :session_id
                """
            ), {"order_id": order_id, "session_id": session_id}).mappings().fetchone()

        if not row:
            return {
                "status": "not_found",
                "message": "Xin lỗi, đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."
            }

        return {
            "status": "ok",
            "order_info": _clean_dict(dict(row)),
            "message": f"Đơn hàng {order_id} của bạn hiện đang ở trạng thái: {row['trang_thai_don_hang']}."
        }
    except Exception as e:
        logger.error("[AgentTools] track_order_status error: %s", e)
        return {"status": "error", "message": "Lỗi khi kiểm tra trạng thái đơn hàng."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 10: get_order_history  –  Xem lịch sử đơn hàng
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_ORDER_HISTORY = {
    "type": "function",
    "function": {
        "name": "get_order_history",
        "description": (
            "Xem danh sách đơn hàng đã đặt của khách (bao gồm đơn hàng mới tạo, đang giao, lịch sử). "
            "Dùng khi khách hỏi: 'Tôi có đơn hàng nào không', 'Kiểm tra đơn hàng của tôi', 'Tôi từng uống gì', 'Đơn hàng cũ của tôi'. "
            "ĐỪNG nhầm lẫn với get_cart (giỏ hàng chưa đặt)."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}

def execute_get_order_history(session_id: str) -> Dict[str, Any]:
    """
    Lấy lịch sử đơn hàng dựa vào session_id.
    """
    try:
        import uuid
        try:
            uuid.UUID(session_id)
        except ValueError:
            return {
                "status": "denied",
                "message": "Bạn cần đăng nhập để mình có thể xem lịch sử mua hàng nhé."
            }

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT ma_don_hang, tong_tien, trang_thai_don_hang, ngay_tao
                FROM {order_schema}.don_hang
                WHERE ma_nguoi_dung = :session_id
                ORDER BY ngay_tao DESC
                LIMIT 5
                """
            ), {"session_id": session_id}).mappings().all()

        if not rows:
            return {
                "status": "not_found",
                "message": "Bạn chưa có đơn hàng nào trong lịch sử."
            }

        history = [_clean_dict(dict(r)) for r in rows]
        # format date slightly
        for h in history:
            if h.get('ngay_tao'):
                h['ngay_tao'] = str(h['ngay_tao'])
                
        return {
            "status": "ok",
            "orders": history,
        }
    except Exception as e:
        logger.error("[AgentTools] get_order_history error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy lịch sử đơn hàng."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 11: get_order_details  –  Xem chi tiết đơn hàng
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_ORDER_DETAILS = {
    "type": "function",
    "function": {
        "name": "get_order_details",
        "description": "Lấy thông tin chi tiết từng món đồ uống, topping và phương thức thanh toán của một đơn hàng cụ thể.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng cần xem chi tiết."
                },
            },
            "required": ["order_id"],
        },
    },
}

def execute_get_order_details(session_id: str, order_id: str) -> Dict[str, Any]:
    """Lấy chi tiết đơn hàng (có kiểm tra quyền sở hữu bằng session_id)."""
    try:
        import uuid
        try:
            uuid_obj = uuid.UUID(session_id)
        except ValueError:
            return {"status": "unauthorized", "message": "Bạn cần đăng nhập để xem chi tiết đơn hàng."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            # 1. Fetch order info
            order_info = conn.execute(text(
                f"""
                SELECT ma_don_hang, tong_tien, phuong_thuc_thanh_toan, trang_thai_don_hang, co_so_ma
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :oid AND ma_nguoi_dung = :uid
                """
            ), {"oid": order_id, "uid": str(uuid_obj)}).fetchone()

            if not order_info:
                return {"status": "not_found", "message": "Xin lỗi, không tìm thấy đơn hàng này hoặc đơn hàng không thuộc về bạn."}

            # 2. Fetch order items
            items = conn.execute(text(
                f"""
                SELECT ma_san_pham, ten_san_pham, so_luong, gia_ban, kich_co, toppings, luong_da, do_ngot, ghi_chu
                FROM {order_schema}.chi_tiet_don_hang
                WHERE ma_don_hang = :oid
                """
            ), {"oid": order_id}).fetchall()
            
            items_list = []
            for item in items:
                items_list.append({
                    "product_id": item[0],
                    "product_name": item[1],
                    "quantity": item[2],
                    "unit_price": float(item[3]) if item[3] else 0.0,
                    "size": item[4],
                    "toppings": item[5] if item[5] else [],
                    "ice": item[6],
                    "sugar": item[7],
                    "note": item[8]
                })

        return {
            "status": "ok",
            "order_id": str(order_info[0]),
            "total_price": float(order_info[1]),
            "payment_method": order_info[2],
            "order_status": order_info[3],
            "branch_id": order_info[4],
            "items": items_list,
            "message": "Đây là chi tiết đơn hàng của bạn."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_order_details error: %s", e)
        return {"status": "error", "message": "Lỗi hệ thống khi lấy chi tiết đơn hàng."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 12: cancel_order  –  Hủy đơn hàng (Human-in-the-loop & API call)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_CANCEL_ORDER = {
    "type": "function",
    "function": {
        "name": "cancel_order",
        "description": "Yêu cầu hủy đơn hàng. LLM bắt buộc phải gọi lần 1 với is_confirmed=False để lấy câu hỏi xác nhận. Sau khi khách đồng ý, gọi lần 2 với is_confirmed=True để hủy thật.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng cần hủy."
                },
                "is_confirmed": {
                    "type": "boolean",
                    "description": "Để False nếu chưa xác nhận với khách. Để True nếu khách đã ĐỒNG Ý hủy."
                }
            },
            "required": ["order_id", "is_confirmed"],
        },
    },
}

def execute_cancel_order(session_id: str, order_id: str, is_confirmed: bool = False) -> Dict[str, Any]:
    """Hủy đơn hàng thông qua gọi HTTP API để đảm bảo logic hoàn tiền/cập nhật an toàn (Anti-TOCTOU)."""
    try:
        import uuid
        try:
            uuid_obj = uuid.UUID(session_id)
        except ValueError:
            return {"status": "unauthorized", "message": "Bạn cần đăng nhập để hủy đơn hàng."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        # 1. Kiểm tra trạng thái đơn hàng (sơ bộ)
        with engine.connect() as conn:
            order_info = conn.execute(text(
                f"""
                SELECT trang_thai_don_hang
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :oid AND ma_nguoi_dung = :uid
                """
            ), {"oid": order_id, "uid": str(uuid_obj)}).fetchone()

        if not order_info:
            return {"status": "not_found", "message": "Xin lỗi, không tìm thấy đơn hàng này hoặc đơn hàng không thuộc về bạn."}
            
        status = order_info[0]
        # Chỉ cho phép hủy nếu là MOI_TAO, PENDING hoặc CHO_XAC_NHAN
        if status not in ['MOI_TAO', 'PENDING', 'CHO_XAC_NHAN', 'pending']:
            return {"status": "rejected", "message": f"Không thể hủy đơn hàng vì trạng thái hiện tại là {status}. Đơn hàng có thể đã được chuẩn bị hoặc đang giao."}

        # 2. Human-in-the-loop: Chờ xác nhận
        if not is_confirmed:
            return {
                "status": "require_cancel_confirmation",
                "message": f"Vui lòng hỏi khách hàng: 'Bạn có chắc chắn muốn hủy đơn hàng {order_id} không? Gõ ĐỒNG Ý để xác nhận hủy.'"
            }

        # 3. Thực hiện Hủy thật qua HTTP API để Backend (order-service) lo liệu TOCTOU và Hoàn tiền
        import requests
        import jwt
        import datetime
        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
        jwt_secret = os.getenv("JWT_SECRET", "your_strong_jwt_secret_here")
        
        # Forge a valid JWT token for this user to bypass AuthGuard in nestjs
        token = jwt.encode({
            "sub": str(uuid_obj),
            "role": "CUSTOMER",
            "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
        }, jwt_secret, algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{order_service_url}/customers/{str(uuid_obj)}/orders/{order_id}/cancel"
        
        response = requests.patch(url, headers=headers, json={"reason": "Khách hàng yêu cầu hủy qua AI"}, timeout=10)
        
        if response.status_code in [200, 201]:
            return {"status": "success", "message": "Đã hủy đơn hàng thành công và hệ thống đang xử lý hoàn tiền (nếu có)."}
        else:
            return {"status": "error", "message": f"Lỗi từ server khi hủy: {response.text}"}
            
    except Exception as e:
        logger.warning("[AgentTools] cancel_order error: %s", e)
        return {"status": "error", "message": "Lỗi hệ thống khi hủy đơn hàng."}


# ─────────────────────────────────────────────────────────────────────────────
#  TOOL 13: get_user_preferences  –  Lấy thói quen thanh toán & chi nhánh
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_USER_PREFERENCES = {
    "type": "function",
    "function": {
        "name": "get_user_preferences",
        "description": "Lấy thông tin thói quen đặt hàng của khách (phương thức thanh toán thường dùng, chi nhánh hay đến) để điền tự động khi chốt đơn.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}

def execute_get_user_preferences(session_id: str) -> Dict[str, Any]:
    """Phân tích 5 đơn hàng gần nhất để đưa ra preferred payment & branch."""
    try:
        import uuid
        try:
            uuid_obj = uuid.UUID(session_id)
        except ValueError:
            return {"status": "unauthorized", "message": "Khách ẩn danh, không có thói quen."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT phuong_thuc_thanh_toan, co_so_ma
                FROM {order_schema}.don_hang
                WHERE ma_nguoi_dung = :uid
                ORDER BY ngay_tao DESC
                LIMIT 5
                """
            ), {"uid": str(uuid_obj)}).fetchall()
            
        if not rows:
            return {"status": "no_history", "message": "Khách chưa có lịch sử mua hàng."}

        payments = [r[0] for r in rows if r[0]]
        branches = [r[1] for r in rows if r[1]]
        
        # Hàm tìm phần tử phổ biến nhất
        def most_frequent(lst):
            return max(set(lst), key=lst.count) if lst else None
            
        preferred_payment = most_frequent(payments)
        preferred_branch = most_frequent(branches)

        return {
            "status": "ok",
            "preferred_payment": preferred_payment,
            "preferred_branch_id": preferred_branch,
            "message": f"Đây là thói quen của khách. Khi khách muốn 'chốt đơn', hãy điền thông tin này vào tool request_checkout, nhưng VẪN PHẢI TÓM TẮT để khách confirm qua UI."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_user_preferences error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thói quen khách hàng."}

# ─────────────────────────────────────────────────────────────────────────────
#  TOOL: get_user_profile  –  Lấy thông tin cá nhân và địa chỉ của khách
# ─────────────────────────────────────────────────────────────────────────────

TOOL_GET_USER_PROFILE = {
    "type": "function",
    "function": {
        "name": "get_user_profile",
        "description": (
            "Lấy thông tin cá nhân (tên, email, SĐT) và sổ địa chỉ của người dùng. "
            "Sử dụng tool này khi khách hàng hỏi về địa chỉ của họ, tên của họ, hoặc các thông tin cá nhân khác."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}

def execute_get_user_profile(session_id: str) -> Dict[str, Any]:
    """Lấy thông tin cá nhân và địa chỉ của khách hàng."""
    try:
        import uuid
        try:
            uuid_obj = uuid.UUID(session_id)
        except ValueError:
            return {"status": "unauthorized", "message": "Khách ẩn danh, không có thông tin cá nhân."}

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")

        with engine.connect() as conn:
            # Lấy thông tin cơ bản
            user_info = conn.execute(text(
                f"""
                SELECT ho_ten, email, so_dien_thoai
                FROM {identity_schema}.nguoi_dung
                WHERE ma_nguoi_dung = :id
                """
            ), {"id": session_id}).fetchone()

            if not user_info:
                return {"status": "not_found", "message": "Không tìm thấy thông tin người dùng."}
                
            # Lấy sổ địa chỉ
            addresses = conn.execute(text(
                f"""
                SELECT ten_dia_chi, dia_chi_day_du, mac_dinh
                FROM {identity_schema}.dia_chi_giao_hang
                WHERE ma_nguoi_dung = :uid
                ORDER BY mac_dinh DESC
                """
            ), {"uid": str(uuid_obj)}).fetchall()

        address_list = []
        for addr in addresses:
            address_list.append(f"- {addr[0] or 'Địa chỉ'}: {addr[1]} {'(Mặc định)' if addr[2] else ''}")
            
        address_text = "\n".join(address_list) if address_list else "Chưa lưu địa chỉ nào."

        return {
            "status": "ok",
            "name": user_info[0] or "Chưa cập nhật",
            "email": user_info[1] or "Chưa cập nhật",
            "phone": user_info[2] or "Chưa cập nhật",
            "addresses": address_text,
            "message": "Đây là thông tin của khách hàng. Hãy trả lời thân thiện dựa trên thông tin này."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_user_profile error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thông tin cá nhân."}


# ─────────────────────────────────────────────────────────────────────────────
#  Registry – Danh sách Tools đăng ký với Groq API
# ─────────────────────────────────────────────────────────────────────────────

ALL_TOOL_SCHEMAS: List[Dict[str, Any]] = [
    TOOL_ASK_BRANCH,
    TOOL_FIND_NEAREST_BRANCH,
    TOOL_SET_SESSION_BRANCH,
    TOOL_CHECK_PRICE_AND_STOCK,
    TOOL_GET_PRODUCT_INSIGHTS,
    TOOL_ADD_TO_CART,
    TOOL_GET_CART,
    TOOL_REQUEST_CHECKOUT,
    TOOL_SEARCH_KNOWLEDGE_BASE,
    TOOL_GET_RECOMMENDATIONS,
    TOOL_TRACK_ORDER_STATUS,
    TOOL_GET_ORDER_HISTORY,
    TOOL_GET_ORDER_DETAILS,
    TOOL_CANCEL_ORDER,
    TOOL_GET_USER_PREFERENCES,
    TOOL_GET_USER_PROFILE,
]

# Dispatch map: tool_name -> executor function
# Backend injection for session_id via lambda args, session_id
TOOL_EXECUTORS = {
    "ask_branch": lambda args, session_id: execute_ask_branch(),
    "find_nearest_branch": lambda args, session_id: execute_find_nearest_branch(session_id=session_id, **args),
    "set_session_branch": lambda args, session_id: execute_set_session_branch(session_id=session_id, **args),
    "check_price_and_stock": lambda args, session_id: execute_check_price_and_stock(**args),
    "get_product_insights": lambda args, session_id: execute_get_product_insights(**args),
    "add_to_cart": lambda args, session_id: execute_add_to_cart(session_id=session_id, **args),
    "get_cart": lambda args, session_id: execute_get_cart(session_id=session_id),
    "request_checkout": lambda args, session_id: execute_request_checkout(session_id=session_id, **args),
    "search_knowledge_base": lambda args, session_id: execute_search_knowledge_base(**args),
    "get_recommendations": lambda args, session_id: execute_get_recommendations(**args),
    "track_order_status": lambda args, session_id: execute_track_order_status(session_id=session_id, **args),
    "get_order_history": lambda args, session_id: execute_get_order_history(session_id=session_id),
    "get_order_details": lambda args, session_id: execute_get_order_details(session_id=session_id, **args),
    "cancel_order": lambda args, session_id: execute_cancel_order(session_id=session_id, **args),
    "get_user_preferences": lambda args, session_id: execute_get_user_preferences(session_id=session_id),
    "get_user_profile": lambda args, session_id: execute_get_user_profile(session_id=session_id),
}

