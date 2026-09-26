import logging
from typing import Any, Dict
from sqlalchemy import text
from src.common import cart_manager
from src.function_calling.helpers import _get_engine, _clean_dict, _check_business_hours, _require_valid_session
from src.common.inventory_validation import validate_cart_at_branch

logger = logging.getLogger(__name__)

TOOL_ASK_BRANCH = {
    "type": "function",
    "function": {
        "name": "ask_branch",
        "description": (
            "Gọi tool này khi khách hàng chưa đề cập chi nhánh / cơ sở nào. "
            "Trả về danh sách chi nhánh đang hoạt động để LLM hỏi lại khách chọn. "
            "TUYỆT ĐỐI KHÔNG gọi tool này nếu khách đang chọn từ danh sách đã được bạn liệt kê trước đó (vd: 'chi nhánh 1'). Khi đó, hãy đọc lịch sử chat lấy TÊN chi nhánh và gọi thẳng set_session_branch."
        ),
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_ask_branch(session_id: str = "") -> Dict[str, Any]:
    """Lấy danh sách chi nhánh từ DB để LLM trình bày cho khách (có check giờ)."""
    try:
        prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
        delivery_type = prefs.get("delivery_type")
        if not delivery_type:
            return {
                "status": "branch_not_needed_yet",
                "message": "Chưa đến bước chọn chi nhánh. Hãy tiếp tục gợi ý/chọn món, sau đó hỏi hình thức nhận hàng trước.",
            }
        if delivery_type == "GIAO_TAN_NOI":
            return {
                "status": "auto_branch_for_delivery",
                "message": "Khách chọn giao tận nơi nên không hỏi khách chọn chi nhánh. Hãy lấy/xác nhận địa chỉ, gọi find_nearest_branch rồi tự set_session_branch.",
            }

        hours_check = _check_business_hours()
        if hours_check:
            return hours_check

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                WITH ratings AS (
                    SELECT ma_chi_nhanh, ROUND(AVG(diem_tong_quan), 1) as avg_rating, COUNT(*) as total_reviews
                    FROM {order_schema}.danh_gia_chi_nhanh
                    WHERE trang_thai = 'APPROVED'
                    GROUP BY ma_chi_nhanh
                ),
                branches_and_kiosks AS (
                    SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, 'CHI_NHANH_CHINH' as loai
                    FROM {identity_schema}.chi_nhanh
                    WHERE trang_thai = 'ACTIVE'
                )
                SELECT b.ma_chi_nhanh, b.ten_chi_nhanh, b.dia_chi, b.loai,
                       COALESCE(r.avg_rating, 0)::float as avg_rating,
                       COALESCE(r.total_reviews, 0)::int as total_reviews
                FROM branches_and_kiosks b
                LEFT JOIN ratings r ON b.ma_chi_nhanh = r.ma_chi_nhanh
                ORDER BY r.avg_rating DESC NULLS LAST, b.ten_chi_nhanh ASC LIMIT 3
                """
            )).mappings().all()
        branches = [_clean_dict(dict(r)) for r in rows]
        return {
            "status": "need_branch_selection",
            "branches": branches,
            "message": "Vui lòng hỏi ngắn gọn khách hàng xem họ đang ở khu vực/quận nào để tìm chi nhánh gần nhất, hoặc có thể gợi ý tạm 3 chi nhánh phổ biến trên thay vì liệt kê dài dòng.",
        }
    except Exception as e:
        logger.warning("[AgentTools] ask_branch error: %s", e)
        return {"status": "error", "message": "Không thể lấy danh sách chi nhánh."}


def _customer_session_id(session_id: str) -> str:
    return str(session_id).split(":conversation:", 1)[0]

TOOL_FIND_NEAREST_BRANCH = {
    "type": "function",
    "function": {
        "name": "find_nearest_branch",
        "description": "Tìm kiếm chi nhánh (cửa hàng cà phê) gần nhất. Nếu khách yêu cầu tìm chi nhánh gần nhất trong số một vài chi nhánh cụ thể (ví dụ: 'trong 2 chi nhánh này cái nào gần tôi hơn?'), BẮT BUỘC phải truyền tên các chi nhánh đó vào tham số target_branches. Nếu khách hỏi 'gần tôi' hoặc không nói rõ địa điểm, hãy ĐỂ TRỐNG tham số location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Địa điểm Quận, Huyện, hoặc Thành phố (ví dụ: 'Hải Châu', 'Quận 1'). Để trống nếu muốn tìm theo địa chỉ của khách."
                },
                "target_branches": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "BẮT BUỘC SỬ DỤNG nếu khách yêu cầu tìm chi nhánh gần nhất TRONG SỐ các chi nhánh cụ thể (ví dụ: 'trong 2 chi nhánh này'). Truyền tên hoặc mã các chi nhánh đó vào mảng này (ví dụ: ['Kiosk Avengers', 'Highlands Indochina'])."
                }
            },
            "required": [],
        },
    },
}

def execute_find_nearest_branch(location: str = "", session_id: str = "", target_branches: list = None) -> Dict[str, Any]:
    """Tìm chi nhánh gần nhất dựa trên geocoding và khoảng cách Haversine."""
    try:
        hours_check = _check_business_hours()
        if hours_check:
            return hours_check

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        from utils.geo import geocode_address, haversine_distance

        prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
        target_address = location.strip() if location else str(prefs.get("location_address") or "").strip()
        user_lat, user_lon = None, None

        with engine.connect() as conn:
            from src.function_calling.helpers import _norm
            generic_words = {"toi", "gan", "day", "nao", "nhat", "nha", "dia", "chi", "mac", "dinh", "cua", "hien", "tai"}
            norm_loc = _norm(location).lower().replace(",", " ") if location else ""
            is_generic = all(w in generic_words for w in norm_loc.split()) if norm_loc else not bool(target_address)
            
            if (not target_address or is_generic) and session_id:
                valid_uid = _require_valid_session(_customer_session_id(session_id))
                if not valid_uid:
                    return {
                        "status": "need_location",
                        "message": "Bạn đang ở địa chỉ nào? Mình sẽ dùng địa chỉ đó chỉ để tìm cửa hàng gần nhất.",
                    }
                addr = conn.execute(text(
                    f"""
                    SELECT dia_chi_day_du, vi_do, kinh_do
                    FROM {identity_schema}.dia_chi_giao_hang 
                    WHERE ma_nguoi_dung::text = :uid AND mac_dinh = true
                    LIMIT 1
                    """
                ), {"uid": valid_uid}).fetchone()
                
                if addr and addr[0]:
                    cart_manager.set_checkout_context(session_id, suggested_address=str(addr[0]))
                    return {
                        "status": "need_address_confirmation",
                        "suggested_address": str(addr[0]),
                        "message": f"Mình thấy địa chỉ đã lưu là {addr[0]}. Bạn đang ở địa chỉ này hay muốn dùng một địa chỉ khác để tìm cửa hàng gần nhất?",
                    }

            if not target_address:
                return {
                    "status": "need_location",
                    "message": "Hệ thống AI hiện chưa được cấp quyền truy cập GPS của khách hàng, và bạn chưa có địa chỉ mặc định. Hãy hỏi khách hàng đang ở địa chỉ nào để tìm chi nhánh gần nhất."
                }

            if user_lat is None or user_lon is None:
                coords = geocode_address(target_address)
                if not coords:
                    return {
                        "status": "not_found",
                        "message": f"Rất tiếc, hệ thống bản đồ không thể xác định được vị trí của '{target_address}'. Bạn có thể cung cấp địa chỉ cụ thể hơn không?"
                    }
                user_lat, user_lon = coords
                
            query = f"""
                WITH ratings AS (
                    SELECT ma_chi_nhanh, ROUND(AVG(diem_tong_quan), 1) as avg_rating, COUNT(*) as total_reviews
                    FROM {order_schema}.danh_gia_chi_nhanh
                    WHERE trang_thai = 'APPROVED'
                    GROUP BY ma_chi_nhanh
                ),
                branches_and_kiosks AS (
                    SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, vi_do, kinh_do, 'CHI_NHANH_CHINH' as loai
                    FROM {identity_schema}.chi_nhanh
                    WHERE trang_thai = 'ACTIVE' AND vi_do IS NOT NULL AND kinh_do IS NOT NULL
                )
                SELECT b.ma_chi_nhanh, b.ten_chi_nhanh, b.dia_chi, b.vi_do, b.kinh_do, b.loai,
                       COALESCE(r.avg_rating, 0)::float as avg_rating,
                       COALESCE(r.total_reviews, 0)::int as total_reviews
                FROM branches_and_kiosks b
                LEFT JOIN ratings r ON b.ma_chi_nhanh = r.ma_chi_nhanh
            """
            rows = conn.execute(text(query)).mappings().all()

            if not rows:
                return {
                    "status": "not_found",
                    "message": "Hiện tại hệ thống chưa có chi nhánh nào được cập nhật tọa độ trên bản đồ."
                }

            branches = []
            for r in rows:
                if target_branches:
                    # Kiểm tra xem tên hoặc mã chi nhánh có khớp với bất kỳ từ khoá nào trong target_branches không
                    match = False
                    for tb in target_branches:
                        if tb.lower() in r["ten_chi_nhanh"].lower() or tb.lower() in r["ma_chi_nhanh"].lower():
                            match = True
                            break
                    if not match:
                        continue
                        
                dist = haversine_distance(user_lat, user_lon, float(r["vi_do"]), float(r["kinh_do"]))
                branch_dict = _clean_dict(dict(r))
                branch_dict["khoang_cach_km"] = round(dist, 1)
                branches.append(branch_dict)

            branches.sort(key=lambda x: x["khoang_cach_km"])
            delivery_type = prefs.get("delivery_type")
            cart = cart_manager.get_cart(session_id) if session_id else {"items": []}
            inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")
            eligible_branches = []
            annotated_branches = []
            # Inventory validation is comparatively expensive. Validate the
            # nearest candidates only; scanning every branch caused the chat
            # request to exceed the frontend timeout and trigger stale fallback.
            for item in branches[:12]:
                cart_for_branch = dict(cart)
                cart_for_branch["branch_id"] = item["ma_chi_nhanh"]
                availability = validate_cart_at_branch(engine, cart_for_branch, inventory_schema)
                conflicts = availability["unavailable"]
                annotated = dict(item)
                annotated["availability_status"] = (
                    "unavailable" if availability["unavailable"]
                    else "unknown" if availability["unverified"]
                    else "available"
                )
                annotated["unavailable_products"] = conflicts
                annotated["unverified_products"] = availability["unverified"]
                annotated_branches.append(annotated)
                # Missing override rows inherit normal menu availability.
                # Explicit inactive/insufficient rows remain hard conflicts.
                if not availability["unavailable"] and not availability["unverified"]:
                    eligible_branches.append(annotated)

            # Delivery is assigned automatically only among branches that can
            # fulfill every cart line. Pickup/dine-in shows nearby branches with
            # exact conflicts, but a conflicting branch remains unselectable.
            if delivery_type == "GIAO_TAN_NOI" and cart.get("items"):
                top_branches = eligible_branches[:3]
                if not top_branches:
                    return {
                        "status": "stock_conflict",
                        "branches": annotated_branches[:5],
                        "message": "Không có cửa hàng gần địa chỉ này đủ toàn bộ món trong giỏ. Đơn chưa được chốt; bạn có thể đổi món hoặc địa chỉ giao.",
                    }
            elif delivery_type in {"MANG_DI", "TAI_CHO"} and cart.get("items"):
                # Pickup/dine-in needs an explainable nearest-five comparison:
                # keep distance order and annotate unavailable outlets instead
                # of hiding them. Selection is rejected later for conflicts.
                top_branches = annotated_branches[:5]
            else:
                top_branches = annotated_branches[:5]

            if not top_branches:
                return {
                    "status": "not_found",
                    "message": "Không tìm thấy cửa hàng phù hợp trong danh sách cần so sánh.",
                }

            if delivery_type in {"MANG_DI", "TAI_CHO"} and not target_branches:
                cart_manager.set_checkout_context(
                    session_id,
                    branch_candidates=[{
                        "branch_id": item["ma_chi_nhanh"],
                        "branch_name": item["ten_chi_nhanh"],
                        "address": item.get("dia_chi"),
                        "distance_km": item.get("khoang_cach_km"),
                        "availability_status": item.get("availability_status"),
                        "unavailable_products": item.get("unavailable_products") or [],
                        "unverified_products": item.get("unverified_products") or [],
                    } for item in top_branches],
                )
                try:
                    cart_manager.set_pending_action(session_id, "select_branch", {"count": len(top_branches)})
                except Exception as e:
                    logger.warning("[AgentTools] set_pending_action select_branch failed: %s", e)

            nearest_dist = top_branches[0]["khoang_cach_km"]
            
            msg = f"Dựa vào địa chỉ của khách ({target_address}), đây là chi nhánh gần nhất. BẮT BUỘC: Bạn PHẢI đọc TÊN CỤ THỂ của chi nhánh và BÁO SỐ KM (khoang_cach_km) kèm chữ '(đường chim bay)' cho khách."
            
            if nearest_dist > 15:
                msg += f" WARNING: Chi nhánh gần nhất cũng cách tới {nearest_dist}km. Hãy báo rõ cho khách là khu vực của khách khá xa các chi nhánh hiện tại."

            return {
                "status": "need_branch_selection" if delivery_type in {"MANG_DI", "TAI_CHO"} else "ok",
                "branches": top_branches,
                "message": (
                    msg + " Khách dùng tại chỗ/mang đi nên hãy liệt kê đủ tối đa 5 cửa hàng theo khoảng cách, ghi rõ cửa hàng còn đủ món và món nào bị thiếu; chỉ cửa hàng còn đủ món mới được chọn."
                    if delivery_type in {"MANG_DI", "TAI_CHO"} else msg
                )
            }

    except Exception as e:
        logger.warning("[AgentTools] find_nearest_branch error: %s", e)
        return {"status": "error", "message": "Không thể tìm kiếm chi nhánh lúc này."}

TOOL_SET_SESSION_BRANCH = {
    "type": "function",
    "function": {
        "name": "set_session_branch",
        "description": (
            "Gọi tool này ngay sau khi khách đã xác nhận chọn chi nhánh cụ thể. "
            "Lưu lựa chọn vào session để các tool tiếp theo dùng. "
            "QUAN TRỌNG: Nếu bạn chỉ biết tên chi nhánh từ lịch sử chat (vd: 'Highlands Coffee D9 Tân Phú') mà không biết mã branch_id, hãy cứ truyền TÊN ĐÓ vào trường branch_id, hệ thống sẽ tự động tìm kiếm."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh (ma_chi_nhanh) khách đã chọn, hoặc tên chi nhánh nếu không biết mã.",
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

def execute_set_session_branch(
    session_id: str,
    branch_id: str,
    branch_name: str,
    customer_selected: bool = False,
) -> Dict[str, Any]:
    engine = _get_engine()
    import os
    identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
    inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")

    def save_and_validate(real_branch_id: str, real_branch_name: str, location_label: str) -> Dict[str, Any]:
        prefs = cart_manager.get_checkout_prefs(session_id)
        if (
            prefs.get("delivery_type") in {"MANG_DI", "TAI_CHO"}
            and prefs.get("branch_candidates")
            and not customer_selected
        ):
            return {
                "status": "branch_selection_required",
                "branches": prefs["branch_candidates"],
                "message": "Khách chưa chọn cửa hàng trong danh sách vừa gợi ý. Hãy liệt kê và chờ khách chọn; không tự chốt cửa hàng gần nhất.",
            }
        cart = cart_manager.get_cart(session_id)
        cart_for_branch = dict(cart)
        cart_for_branch["branch_id"] = real_branch_id
        stock_result = validate_cart_at_branch(engine, cart_for_branch, inventory_schema)
        unavailable = stock_result["unavailable"]
        unverified = stock_result["unverified"]

        if unavailable or unverified:
            blockers = unavailable + unverified
            cart_manager.set_stock_conflicts(session_id, blockers)
            return {
                "status": "stock_conflict",
                "branch_id": real_branch_id,
                "branch_name": real_branch_name,
                "unavailable_products": blockers,
                "message": (
                    f"{location_label} {real_branch_name} tạm ngưng phục vụ các món sau: "
                    f"{', '.join(blockers)}. "
                    "Hãy báo khách chọn điểm bán khác hoặc bỏ món đó ra khỏi giỏ; không được chốt đơn tại đây."
                ),
            }
        cart_manager.set_branch(session_id, real_branch_id, real_branch_name)
        cart_manager.set_stock_conflicts(session_id, [])
        message = f"Đã ghi nhận {location_label.lower()}: {real_branch_name}. Các món trong giỏ hiện còn hàng."
        return {
            "status": "ok",
            "branch_id": real_branch_id,
            "branch_name": real_branch_name,
            "message": message,
        }
    
    with engine.connect() as conn:
        # Tìm chính xác theo mã hoặc tìm tương đối theo tên
        row = conn.execute(
            text(f"SELECT ma_chi_nhanh, ten_chi_nhanh FROM {identity_schema}.chi_nhanh WHERE ma_chi_nhanh = :bid OR ten_chi_nhanh ILIKE :bname LIMIT 1"),
            {"bid": branch_id, "bname": f"%{branch_id}%"}
        ).fetchone()
        
        # Nếu chưa ra, tìm theo branch_name
        if not row and branch_name:
            row = conn.execute(
                text(f"SELECT ma_chi_nhanh, ten_chi_nhanh FROM {identity_schema}.chi_nhanh WHERE ten_chi_nhanh ILIKE :bname LIMIT 1"),
                {"bname": f"%{branch_name}%"}
            ).fetchone()
            
        if row:
            real_branch_id = str(row[0])
            real_branch_name = str(row[1])
            return save_and_validate(real_branch_id, real_branch_name, "Chi nhánh")
        
        # Nếu chưa ra, tìm trong Kiosk
        row_kiosk = conn.execute(
            text(f"SELECT ma_kiosk, ten_kiosk FROM franchise.kiosk WHERE ma_kiosk = :bid OR ten_kiosk ILIKE :bname LIMIT 1"),
            {"bid": branch_id, "bname": f"%{branch_id}%"}
        ).fetchone()
        
        if not row_kiosk and branch_name:
            row_kiosk = conn.execute(
                text(f"SELECT ma_kiosk, ten_kiosk FROM franchise.kiosk WHERE ten_kiosk ILIKE :bname LIMIT 1"),
                {"bname": f"%{branch_name}%"}
            ).fetchone()
            
        if row_kiosk:
            real_branch_id = str(row_kiosk[0])
            real_branch_name = str(row_kiosk[1])
            return save_and_validate(real_branch_id, real_branch_name, "Kiosk")
        
    return {
        "status": "error",
        "message": f"Không tìm thấy chi nhánh/kiosk nào khớp với '{branch_id}' hay '{branch_name}'. Bạn có thể gọi lại ask_branch hoặc báo lại cho khách.",
    }


TOOL_GET_TOP_RATED_STORES = {
    "type": "function",
    "function": {
        "name": "get_top_rated_stores",
        "description": "Gọi tool này CHỈ KHI khách yêu cầu xem danh sách các chi nhánh (cửa hàng/kiosk) được đánh giá cao. NẾU khách hỏi về 'món' (đồ ăn/thức uống) được đánh giá cao tại cửa hàng, tuyệt đối KHÔNG dùng tool này, mà hãy dùng get_recommendations.",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}

def execute_get_top_rated_stores() -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        
        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                WITH ratings AS (
                    SELECT ma_chi_nhanh, ROUND(AVG(diem_tong_quan), 1) as avg_rating, COUNT(*) as total_reviews
                    FROM {order_schema}.danh_gia_chi_nhanh
                    WHERE trang_thai = 'APPROVED'
                    GROUP BY ma_chi_nhanh
                ),
                branches_and_kiosks AS (
                    SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, 'CHI_NHANH_CHINH' as loai
                    FROM {identity_schema}.chi_nhanh
                    WHERE trang_thai = 'ACTIVE'
                    UNION ALL
                    SELECT ma_kiosk as ma_chi_nhanh, ten_kiosk as ten_chi_nhanh, dia_chi, loai_kiosk as loai
                    FROM franchise.kiosk
                    WHERE trang_thai = 'DANG_HOAT_DONG'
                )
                SELECT b.ma_chi_nhanh, b.ten_chi_nhanh, b.dia_chi, b.loai,
                       COALESCE(r.avg_rating, 0)::float as avg_rating,
                       COALESCE(r.total_reviews, 0)::int as total_reviews
                FROM branches_and_kiosks b
                JOIN ratings r ON b.ma_chi_nhanh = r.ma_chi_nhanh
                WHERE r.avg_rating >= 4.0
                ORDER BY r.avg_rating DESC, r.total_reviews DESC LIMIT 5
                """
            )).mappings().all()
            
        stores = [_clean_dict(dict(r)) for r in rows]
        if not stores:
            return {
                "status": "ok",
                "stores": [],
                "message": "Hiện chưa có chi nhánh hoặc kiosk nào nhận được đánh giá cao trong hệ thống.",
            }
            
        return {
            "status": "ok",
            "stores": stores,
            "message": "Trả về danh sách các điểm bán được đánh giá cao nhất. Hãy tóm tắt ngắn gọn tên chi nhánh/kiosk, số sao, và địa chỉ cho khách.",
        }
    except Exception as e:
        logger.warning("[AgentTools] get_top_rated_stores error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu danh sách chi nhánh được đánh giá cao lúc này."}


TOOL_GET_STORE_REVIEWS = {
    "type": "function",
    "function": {
        "name": "get_store_reviews",
        "description": "Gọi tool này khi khách yêu cầu đọc nội dung các bình luận, đánh giá, nhận xét thực tế về một chi nhánh hoặc kiosk cụ thể.",
        "parameters": {
            "type": "object",
            "properties": {
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh/kiosk (ví dụ: 'KSK-016', 'DN_INDOCHINA_RIVERSIDE') hoặc tên chi nhánh nếu không biết mã.",
                },
            },
            "required": ["branch_id"],
        },
    },
}

def execute_get_store_reviews(branch_id: str) -> Dict[str, Any]:
    try:
        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        
        with engine.connect() as conn:
            # Tìm chính xác mã chi nhánh hoặc tìm gần đúng theo tên (kể cả trong kiosk)
            query_branch = f"""
                SELECT ma_chi_nhanh as ma, ten_chi_nhanh as ten FROM {identity_schema}.chi_nhanh 
                WHERE ma_chi_nhanh = :bid OR ten_chi_nhanh ILIKE :bname
                UNION ALL
                SELECT ma_kiosk as ma, ten_kiosk as ten FROM franchise.kiosk
                WHERE ma_kiosk = :bid OR ten_kiosk ILIKE :bname
                LIMIT 1
            """
            row = conn.execute(text(query_branch), {"bid": branch_id, "bname": f"%{branch_id}%"}).fetchone()
            
            if not row:
                return {
                    "status": "not_found",
                    "message": f"Không tìm thấy chi nhánh/kiosk nào khớp với tên/mã '{branch_id}'. Vui lòng yêu cầu khách làm rõ tên chi nhánh."
                }
                
            real_branch_id = str(row[0])
            real_branch_name = str(row[1])
            
            # Lấy các bình luận mới nhất
            query_reviews = f"""
                SELECT p.ho_ten, d.diem_tong_quan, d.nhan_xet, d.ngay_tao
                FROM {order_schema}.danh_gia_chi_nhanh d
                LEFT JOIN {identity_schema}.nguoi_dung p ON d.ma_nguoi_dung = p.ma_nguoi_dung::text
                WHERE d.ma_chi_nhanh = :bid AND d.trang_thai = 'APPROVED' AND d.nhan_xet IS NOT NULL AND d.nhan_xet != ''
                ORDER BY d.ngay_tao DESC LIMIT 5
            """
            reviews_rows = conn.execute(text(query_reviews), {"bid": real_branch_id}).mappings().all()
            
            reviews = []
            for r in reviews_rows:
                reviews.append({
                    "user": r["ho_ten"] or "Khách hàng ẩn danh",
                    "rating": float(r["diem_tong_quan"]) if r["diem_tong_quan"] else 0,
                    "comment": str(r["nhan_xet"]),
                    "date": str(r["ngay_tao"]) if r["ngay_tao"] else ""
                })
                
            if not reviews:
                return {
                    "status": "ok",
                    "branch_name": real_branch_name,
                    "reviews": [],
                    "message": f"Chi nhánh '{real_branch_name}' hiện chưa có lời bình luận/nhận xét bằng chữ nào từ khách hàng."
                }
                
            return {
                "status": "ok",
                "branch_name": real_branch_name,
                "reviews": reviews,
                "message": f"Dưới đây là các bình luận thực tế của khách hàng về chi nhánh '{real_branch_name}'. Hãy trích dẫn một vài nhận xét tiêu biểu cho khách xem."
            }
    except Exception as e:
        logger.warning("[AgentTools] get_store_reviews error: %s", e)
        return {"status": "error", "message": "Không thể tra cứu bình luận lúc này."}
