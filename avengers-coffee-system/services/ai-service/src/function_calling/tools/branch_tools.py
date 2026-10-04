import logging
import re
from typing import Any, Dict
from sqlalchemy import text
from src.common import cart_manager
from src.function_calling.helpers import _get_engine, _clean_dict, _check_business_hours
from src.common.inventory_validation import validate_cart_at_branch, availability_for_branches

logger = logging.getLogger(__name__)
MAX_DELIVERY_RADIUS_KM = 5.0  # Existing customer delivery radius.

def _availability_fields(result):
    return {
        "availability_status": ("unavailable" if result["unavailable"] else
                                "unknown" if result["unverified"] else "available"),
        "available_products": result["available"],
        "unavailable_products": result["unavailable"],
        "unverified_products": result["unverified"],
        "product_availability": result["product_statuses"],
        "is_fully_available": result["is_fully_available"],
    }


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
        items = (cart_manager.get_cart(session_id).get("items") or []) if session_id else []
        if items:
            checked = availability_for_branches(engine, [b["ma_chi_nhanh"] for b in branches], items,
                                               os.getenv("INVENTORY_SCHEMA", "inventory"))
            branches = [{**b, **_availability_fields(checked[str(b["ma_chi_nhanh"])])} for b in branches]
        return {
            "status": "need_branch_selection",
            "branches": branches,
            "message": "Vui lòng hỏi ngắn gọn khách hàng xem họ đang ở khu vực/quận nào để tìm chi nhánh gần nhất, hoặc có thể gợi ý tạm 3 chi nhánh phổ biến trên thay vì liệt kê dài dòng.",
        }
    except Exception as e:
        logger.warning("[AgentTools] ask_branch error: %s", e)
        return {"status": "error", "message": "Không thể lấy danh sách chi nhánh."}


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

def execute_find_nearest_branch(location: str = "", session_id: str = "", target_branches: list = None,
                                resolved_location: dict = None, cart_items: list = None,
                                location_purpose: str = None) -> Dict[str, Any]:
    """Tìm chi nhánh gần nhất dựa trên geocoding và khoảng cách Haversine."""
    try:
        from src.agents.location_parser import parse_location
        candidate = location or (cart_manager.get_checkout_prefs(session_id).get("location_address") if session_id else "")
        if parse_location(candidate or "").kind in {"reference", "reference_question", "change_reference"}:
            return {"status": "need_location", "message":
                    "Mình chưa có địa chỉ nào đang được tham chiếu. Bạn cho mình khu vực hoặc địa chỉ nhé."}
        hours_check = _check_business_hours()
        if hours_check:
            return hours_check

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        from utils.geo import geocode_address, haversine_distance, resolve_location

        prefs = cart_manager.get_checkout_prefs(session_id) if session_id else {}
        from src.agents.location_parser import clean_location_clause
        target_address = clean_location_clause(location if location else str(prefs.get("location_address") or ""))
        parsed_location = parse_location(target_address)
        location_kind = parsed_location.kind
        user_lat, user_lon = None, None
        distance_basis = "unavailable"
        location_estimate = None
        selected_location = resolved_location or (
            prefs.get("selected_location_candidate") if session_id else None
        )
        if isinstance(selected_location, dict):
            try:
                user_lat = float(selected_location["lat"])
                user_lon = float(selected_location["lng"])
            except (KeyError, TypeError, ValueError):
                selected_location = None
                user_lat, user_lon = None, None
            else:
                target_address = str(
                    selected_location.get("normalized_label")
                    or selected_location.get("display_address") or target_address
                ).strip()
                location_kind = "poi"
                distance_basis = "provider_candidate"

        with engine.connect() as conn:
            from src.function_calling.helpers import _norm
            generic_words = {"toi", "gan", "day", "nao", "nhat", "nha", "dia", "chi", "mac", "dinh", "cua", "hien", "tai"}
            norm_loc = _norm(location).lower().replace(",", " ") if location else ""
            is_generic = all(w in generic_words for w in norm_loc.split()) if norm_loc else not bool(target_address)

            if (not target_address or is_generic) and prefs.get("delivery_type") in {"MANG_DI", "TAI_CHO"}:
                return {
                    "status": "need_location",
                    "message": "Bạn muốn tìm quán ở khu vực/phường/quận nào?",
                }

            if not target_address:
                return {
                    "status": "need_location",
                    "message": "Bạn cho mình địa chỉ giao đầy đủ để tìm chi nhánh phục vụ nhé."
                    if prefs.get("delivery_type") == "GIAO_TAN_NOI" else
                    "Bạn cho mình khu vực/phường/quận để tìm cửa hàng gần nhất nhé."
                }

            delivery_type = prefs.get("delivery_type")
            locality_rows = []
            locality_ids = set()
            area_only = not selected_location and location_kind in {"area", "branch_query", "none"} and not re.match(
                r"^\d+[A-Za-z]?(?:[/.-]\d+[A-Za-z]?)?\s", target_address)
            if area_only and delivery_type != "GIAO_TAN_NOI" and not target_branches:
                from src.agents.location_parser import locality_matches, normalize, infer_city_from_addresses
                area = normalize(target_address.split(",", 1)[0])
                if len(area) >= 4:
                    active = conn.execute(text(f"""
                        SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, vi_do, kinh_do
                        FROM {identity_schema}.chi_nhanh
                        WHERE trang_thai = 'ACTIVE'
                    """)).mappings().all()
                    locality_rows = [row for row in active if locality_matches(
                        f"{row['ten_chi_nhanh']}, {row['dia_chi'] or ''}", target_address)]
                    locality_ids = {str(row["ma_chi_nhanh"]) for row in locality_rows}
                    if locality_rows and not re.search(r"\b(?:thành phố|tp\.?|tỉnh)\b", target_address, re.IGNORECASE):
                        city, ambiguous = infer_city_from_addresses(
                            target_address, [str(row["dia_chi"] or "") for row in locality_rows])
                        if ambiguous:
                            return {"status": "need_city", "normalized_location": target_address, "message":
                                    f"Mình nhận ra khu vực {target_address}, nhưng cần thêm tỉnh/thành phố để chọn đúng cửa hàng. Bạn không cần gửi số nhà vì đang lấy tại quán."}
                        if city:
                            target_address = f"{target_address}, {city}"

            if user_lat is None or user_lon is None:
                resolution = None
                structured_address = location_kind == "address" and "," in target_address
                if location_kind == "poi" or structured_address:
                    resolution = resolve_location(
                        target_address, location_kind, getattr(parsed_location, "admin_hints", ()))
                    if (resolution.status == "rejected" and location_kind == "address"
                            and delivery_type != "GIAO_TAN_NOI"
                            and (delivery_type in {"MANG_DI", "TAI_CHO"}
                                 or location_purpose == "nearby_branches")):
                        from utils.geo import nearby_address_origin
                        estimate = nearby_address_origin(target_address, resolution)
                        if estimate:
                            resolution = estimate
                            location_estimate = estimate.normalized_label
                    coords = ((resolution.lat, resolution.lng) if resolution.status == "ok" else None)
                    if resolution.status == "ambiguous":
                        location_candidates = list(getattr(resolution, "candidates", ()) or ())
                        listed = "\n".join(
                            f"{index}. {row.get('normalized_label') or 'Địa điểm'}"
                            + (f" — {row['display_address']}" if row.get("display_address")
                               and row.get("display_address") != row.get("normalized_label") else "")
                            for index, row in enumerate(location_candidates, 1)
                        )
                        return {
                            "status": "ambiguous", "normalized_location": target_address,
                            "location_candidates": location_candidates,
                            "message": ("Mình tìm thấy vài địa điểm phù hợp:\n" + listed
                                        + "\nBạn đang ở địa điểm số mấy?" if listed else
                                        "Mình tìm thấy nhiều địa điểm phù hợp. Bạn cho mình thêm phường/quận hoặc thành phố nhé."),
                        }
                    if resolution.status == "provider_error":
                        return {
                            "status": "provider_error", "normalized_location": target_address,
                            "message": "Mình chưa thể kiểm tra bản đồ lúc này. Vị trí bạn vừa nhập vẫn được giữ; bạn có thể thử lại.",
                        }
                    if resolution.status == "not_found":
                        return {
                            "status": "not_found", "normalized_location": target_address,
                            "message": "Mình chưa tìm thấy địa điểm này trên bản đồ. Bạn kiểm tra lại tên hoặc cho mình thêm khu vực nhé.",
                        }
                    if resolution.status == "rejected":
                        location_candidates = list(getattr(resolution, "candidates", ()) or ())
                        listed = "\n".join(
                            f"{index}. {row.get('normalized_label') or 'Địa điểm'}"
                            + (f" — {row['display_address']}" if row.get("display_address")
                               and row.get("display_address") != row.get("normalized_label") else "")
                            for index, row in enumerate(location_candidates, 1)
                        )
                        return {
                            "status": "rejected", "normalized_location": target_address,
                            "location_candidates": location_candidates,
                            "message": ("Mình tìm thấy một số địa điểm tên gần giống, nhưng khu vực chưa khớp hoàn toàn:\n"
                                        + listed + "\nBạn có phải một trong các địa điểm này không?" if listed else
                                        "Mình tìm thấy kết quả nhưng chưa khớp khu vực bạn cung cấp. Bạn cho mình thêm phường/quận hoặc kiểm tra lại thành phố nhé."),
                        }
                else:
                    coords = geocode_address(target_address)
                if not coords:
                    if locality_rows:
                        positioned = [row for row in locality_rows
                                      if row["vi_do"] is not None and row["kinh_do"] is not None]
                        if positioned:
                            user_lat = sum(float(row["vi_do"]) for row in positioned) / len(positioned)
                            user_lon = sum(float(row["kinh_do"]) for row in positioned) / len(positioned)
                            distance_basis = "area_centroid"
                            logger.info("[AgentTools] Geocoder unavailable; ranking around exact locality branches")
                        else:
                            logger.info("[AgentTools] Exact locality found without coordinates; returning exact matches only")
                    else:
                        return {
                            "status": "not_found",
                            "message": f"Mình chưa xác định chính xác khu vực {target_address} trên bản đồ. Bạn cho mình thêm quận/thành phố hoặc địa chỉ cụ thể hơn nhé."
                        }
                else:
                    user_lat, user_lon = coords
                    distance_basis = "street_area_estimate" if location_estimate else (
                        "poi_resolved" if location_kind == "poi" else
                        "address_resolved" if location_kind == "address" else
                        "geocoded_user"
                    )

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
            all_rows = conn.execute(text(query)).mappings().all()
            # Exact administrative-component matches lead the list; nearby
            # branches supplement them instead of being discarded.
            rows = (
                locality_rows + [row for row in all_rows if str(row["ma_chi_nhanh"]) not in locality_ids]
                if user_lat is not None and user_lon is not None
                else locality_rows
            )

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

            dist = haversine_distance(user_lat, user_lon, float(r["vi_do"]), float(r["kinh_do"])) if user_lat is not None and user_lon is not None and r["vi_do"] is not None and r["kinh_do"] is not None else None
            if delivery_type == "GIAO_TAN_NOI" and (dist is None or dist > MAX_DELIVERY_RADIUS_KM):
                continue
            branch_dict = _clean_dict(dict(r))
            branch_dict["khoang_cach_km"] = round(dist, 1) if dist is not None else None
            branch_dict["distance_basis"] = distance_basis
            branch_dict["distance_estimated"] = distance_basis in {"area_centroid", "street_area_estimate"}
            branch_dict["exact_area_match"] = str(r["ma_chi_nhanh"]) in locality_ids
            branches.append(branch_dict)

        branches.sort(key=lambda x: (
            not x.get("exact_area_match"),
            x["khoang_cach_km"] is None,
            x["khoang_cach_km"] or 0,
            x["ten_chi_nhanh"],
        ))
        logger.debug("[BranchSearch] location_basis=%s exact_match_count=%d geocode_basis=%s",
                     "exact_locality" if locality_rows else "geocode", len(locality_rows), distance_basis)
        cart = cart_manager.get_cart(session_id) if session_id else {"items": cart_items or []}
        inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")
        eligible_branches = []
        annotated_branches = []
        candidates = branches[:12 if delivery_type == "GIAO_TAN_NOI" else 5]
        checked = availability_for_branches(engine,
            [item["ma_chi_nhanh"] for item in candidates], cart.get("items") or [], inventory_schema)
        for item in candidates:
            availability = checked[str(item["ma_chi_nhanh"])]
            annotated = dict(item)
            if cart.get("items"):
                annotated.update(_availability_fields(availability))
            annotated_branches.append(annotated)
            if availability["is_fully_available"]:
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
                    "distance_basis": item.get("distance_basis"),
                    "distance_estimated": item.get("distance_estimated"),
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

        msg = (f"Các cửa hàng có địa chỉ thuộc khu vực {target_address}; chưa có tọa độ khách đáng tin nên không tính khoảng cách."
               if nearest_dist is None else
               f"Khoảng cách chỉ ước tính quanh {location_estimate}; bản đồ chưa xác minh vị trí số nhà của khách."
               if distance_basis == "street_area_estimate" else
               f"Khoảng cách chỉ ước tính theo khu vực {target_address}, không phải khoảng cách từ vị trí của khách."
               if distance_basis == "area_centroid" else
               f"Dựa vào vị trí đã xác định của khách ({target_address}), đây là chi nhánh gần nhất. Có thể báo số km đường chim bay.")

        if nearest_dist is not None and nearest_dist > 15:
            msg += (f" Chi nhánh gần nhất ước tính cách tâm khu vực khoảng {nearest_dist}km."
                    if distance_basis in {"area_centroid", "street_area_estimate"} else
                    f" Chi nhánh gần nhất cách vị trí đã xác định khoảng {nearest_dist}km.")

        return {
            "status": "need_branch_selection" if delivery_type in {"MANG_DI", "TAI_CHO"} else "ok",
            "branches": top_branches,
            "availability_branches": annotated_branches if delivery_type == "GIAO_TAN_NOI" else top_branches,
            "normalized_location": target_address,
            "location_provider_ref_id": (
                selected_location.get("provider_ref_id") if selected_location else None
            ),
            "location_basis": "exact_locality" if locality_rows else distance_basis,
            **({"location_estimate": location_estimate} if location_estimate else {}),
            "message": (
                msg + " Khách dùng tại chỗ/mang đi nên hãy liệt kê tối đa 5 cửa hàng trong khu vực, ghi rõ cửa hàng còn đủ món và món nào bị thiếu; chỉ cửa hàng còn đủ món mới được chọn."
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

def branch_identity_available(engine, branch_id: str) -> bool:
    """Fresh exact identity read for an unchanged selection; no session writes.

    Main branches must remain ACTIVE. Kiosks retain the existing identity
    contract (exact existence); sellability is checked separately for both.
    """
    import os
    identity_schema = os.getenv('IDENTITY_SCHEMA', 'identity')
    try:
        with engine.connect() as conn:
            row = conn.execute(text(
                f'SELECT trang_thai FROM {identity_schema}.chi_nhanh WHERE ma_chi_nhanh = :bid LIMIT 1'),
                {'bid': branch_id}).fetchone()
            if row is not None:
                return str(row[0]) == 'ACTIVE'
            return conn.execute(text(
                'SELECT ma_kiosk FROM franchise.kiosk WHERE ma_kiosk = :bid LIMIT 1'),
                {'bid': branch_id}).fetchone() is not None
    except Exception:
        return False


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
                **_availability_fields(stock_result),
                "branch_id": real_branch_id,
                "branch_name": real_branch_name,
                "unavailable_products": unavailable,
                "unverified_products": unverified,
                "message": (
                    f"{location_label} {real_branch_name}: "
                    + (f"Tạm ngưng: {', '.join(unavailable)}. " if unavailable else "")
                    + (f"Chưa xác minh: {', '.join(unverified)}. " if unverified else "")
                    + "Hãy báo khách chọn điểm bán khác hoặc bỏ món đó ra khỏi giỏ; không được chốt đơn tại đây."
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

        row_kiosk = None
        if not row:
            row_kiosk = conn.execute(
                text("SELECT ma_kiosk, ten_kiosk FROM franchise.kiosk WHERE ma_kiosk = :bid OR ten_kiosk ILIKE :bname LIMIT 1"),
                {"bid": branch_id, "bname": f"%{branch_id}%"}
            ).fetchone()
            if not row_kiosk and branch_name:
                row_kiosk = conn.execute(
                    text("SELECT ma_kiosk, ten_kiosk FROM franchise.kiosk WHERE ten_kiosk ILIKE :bname LIMIT 1"),
                    {"bname": f"%{branch_name}%"}
                ).fetchone()
    # Return the identity connection before acquiring the inventory connection.
    # This avoids nested pool acquisition under concurrent customer requests.
    if row:
        return save_and_validate(str(row[0]), str(row[1]), "Chi nhánh")
    if row_kiosk:
        return save_and_validate(str(row_kiosk[0]), str(row_kiosk[1]), "Kiosk")

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
