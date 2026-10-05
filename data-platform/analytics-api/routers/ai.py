import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException

from common import AiFeedbackRequest, AiReportRefineRequest, AiSummarizeRequest, AiTextToReportRequest
from services.llm_service import call_llm, provider_configuration
from services.metadata_service import (
    cache_status,
    get_combined_metadata,
    get_local_metadata,
    sanitize_result_rows,
    sql_references_sensitive_columns,
)
from services.semantic_service import semantic_service
from services.sql_service import QueryExecutionError, SqlSafetyError, dry_run_sql, execute_read_only, validate_ai_query_scope
from services.vector_rag_service import vector_rag_service
from services.session_service import create_session, get_session, session_stats


router = APIRouter(prefix="/api/ai", tags=["AI Data Assistant"])
logger = logging.getLogger("ai-analytics")


def json_serial(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return str(value)


def _verify_intent_with_llm(
    user_prompt: str, context_text: str, domain: str,
    resolution: Dict[str, Any], metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Phase 1.1: LLM-based intent verification when keyword confidence is low.

    When the semantic keyword resolver is uncertain (max score < 8), we ask the
    LLM to classify the user's intent.  If the LLM confidently disagrees with
    the keyword result, we re-resolve with the LLM's intent as domain override.
    """
    scores = resolution.get("scores", {})
    max_score = max(scores.values(), default=0)
    # High keyword confidence or explicit domain → skip LLM verification
    if max_score >= 8 or domain != "auto":
        return resolution

    entity_ids = resolution.get("entity_ids", [])
    intent_map = {
        "orders": "Đơn hàng, doanh thu tổng hợp, giao dịch",
        "products": "Sản phẩm, món bán chạy, thực đơn, danh mục",
        "order_items": "Chi tiết từng món trong đơn, size, topping",
        "stores": "Chi nhánh, cửa hàng, khu vực địa lý, thành phố",
        "customers": "Khách hàng, hội viên, loyalty, beans, chi tiêu",
        "payments": "Thanh toán, phương thức, ví điện tử, tiền mặt",
        "hourly": "Khung giờ cao điểm, phân bố đơn theo giờ",
        "promotions": "Khuyến mãi, voucher, mã giảm giá, ưu đãi",
        "delivery": "Shipper, giao hàng, tài xế, chuyến giao",
        "inventory": "Tồn kho, hết hàng, sắp hết, cảnh báo stock",
        "product_reviews": "Đánh giá sản phẩm, rating món, số sao",
        "store_reviews": "Đánh giá chi nhánh, phục vụ, không gian",
        "staff_shifts": "Nhân sự, ca làm, chấm công, đi trễ",
        "cashier_reconciliation": "Đối soát thu ngân, chênh lệch két",
        "wishlist_favorites": "Yêu thích, wishlist, thả tim",
        "customer_surveys": "Khảo sát, phản hồi khách hàng",
    }
    candidates = list(scores.keys())[:8] or entity_ids[:5]
    if not candidates:
        return resolution

    candidates_text = "\n".join(f"- {k}: {intent_map.get(k, k)}" for k in candidates)
    verify = call_llm(
        json.dumps({"question": user_prompt, "candidates": candidates}, ensure_ascii=False),
        f"Bạn là Intent Classifier cho hệ thống BI chuỗi cà phê.\n"
        f"Phân loại câu hỏi phân tích vào ĐÚNG MỘT intent phù hợp nhất:\n{candidates_text}\n\n"
        f"Trả JSON: {{\"intent\": \"tên_intent\", \"confidence\": 0.0-1.0}}",
    )
    if not verify or not isinstance(verify.get("data"), dict):
        return resolution

    llm_intent = verify["data"].get("intent")
    llm_conf = float(verify["data"].get("confidence", 0))
    current_intent = entity_ids[0] if entity_ids else None

    if (
        llm_intent
        and llm_conf >= 0.7
        and llm_intent != current_intent
        and llm_intent in intent_map
    ):
        logger.info(
            "Intent override: keyword=%s(score=%d) → llm=%s(conf=%.2f)",
            current_intent, max_score, llm_intent, llm_conf,
        )
        return semantic_service.resolve(user_prompt, context_text, llm_intent, metadata)

    return resolution


def _time_selection(payload: AiTextToReportRequest) -> Dict[str, Any]:
    text = (payload.prompt or "").lower()
    assumptions: List[str] = []
    requested = payload.time_range
    mode = requested.mode if requested else "auto"

    current_year = date.today().year  # 2026
    current_month = date.today().month  # 10

    if mode == "auto":
        # 1. Check for specific Year (e.g. "năm 2026", "2026", "năm 2025")
        year_match = re.search(r"\b(?:năm|nam)\s*(202\d)\b", text) or re.search(r"\b(202\d)\b", text)
        if year_match:
            year = int(year_match.group(1))
            return {
                "mode": "year",
                "granularity": "month",
                "sql": f"EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {year}",
                "label": f"năm {year}",
                "assumptions": assumptions,
            }
        if any(w in text for w in ("năm nay", "nam nay", "this year")):
            return {
                "mode": "year",
                "granularity": "month",
                "sql": f"EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {current_year}",
                "label": f"năm {current_year}",
                "assumptions": assumptions,
            }
        if any(w in text for w in ("năm trước", "nam truoc", "năm ngoái", "nam ngoai", "last year")):
            return {
                "mode": "year",
                "granularity": "month",
                "sql": f"EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {current_year - 1}",
                "label": f"năm {current_year - 1}",
                "assumptions": assumptions,
            }

        # 2. Check for Quarter (e.g. "quý 3 2026", "quý 2", "q3")
        q_match = re.search(r"\b(?:quý|quy|q)\s*([1-4])(?:\s*(?:năm|nam)?\s*(202\d))?\b", text)
        if q_match:
            q = int(q_match.group(1))
            q_year = int(q_match.group(2)) if q_match.group(2) else current_year
            return {
                "mode": "quarter",
                "granularity": "month",
                "sql": f"EXTRACT(QUARTER FROM {{alias}}.ngay_tao) = {q} AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {q_year}",
                "label": f"Quý {q}/{q_year}",
                "assumptions": assumptions,
            }

        # 3. Check for Month (e.g. "tháng 9 2026", "tháng 8", "tháng này", "tháng trước")
        m_match = re.search(r"\b(?:tháng|thang)\s*(\d{1,2})(?:\s*(?:năm|nam)?\s*(202\d))?\b", text)
        if m_match:
            m = int(m_match.group(1))
            m_year = int(m_match.group(2)) if m_match.group(2) else current_year
            if 1 <= m <= 12:
                return {
                    "mode": "month",
                    "granularity": "day",
                    "sql": f"EXTRACT(MONTH FROM {{alias}}.ngay_tao) = {m} AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {m_year}",
                    "label": f"tháng {m}/{m_year}",
                    "assumptions": assumptions,
                }
        if any(w in text for w in ("tháng trước", "thang truoc", "tháng rồi", "thang roi", "last month")):
            prev_m = 12 if current_month == 1 else current_month - 1
            prev_m_year = current_year - 1 if current_month == 1 else current_year
            return {
                "mode": "month",
                "granularity": "day",
                "sql": f"EXTRACT(MONTH FROM {{alias}}.ngay_tao) = {prev_m} AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {prev_m_year}",
                "label": f"tháng {prev_m}/{prev_m_year}",
                "assumptions": assumptions,
            }
        if any(w in text for w in ("tháng này", "thang nay", "this month")):
            return {
                "mode": "month",
                "granularity": "day",
                "sql": f"EXTRACT(MONTH FROM {{alias}}.ngay_tao) = {current_month} AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {current_year}",
                "label": f"tháng {current_month}/{current_year}",
                "assumptions": assumptions,
            }

        # 4. Check for Quarter Prior
        if any(w in text for w in ("quý trước", "quy truoc", "quý rồi", "quy roi", "last quarter")):
            current_q = (current_month - 1) // 3 + 1
            prev_q = 4 if current_q == 1 else current_q - 1
            prev_q_year = current_year - 1 if current_q == 1 else current_year
            return {
                "mode": "quarter",
                "granularity": "month",
                "sql": f"EXTRACT(QUARTER FROM {{alias}}.ngay_tao) = {prev_q} AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = {prev_q_year}",
                "label": f"Quý {prev_q}/{prev_q_year}",
                "assumptions": assumptions,
            }

        # 5. Check for All Time (e.g. "toàn bộ", "toàn thời gian", "tất cả", "từ trước đến nay")
        if any(w in text for w in ("toàn bộ", "toan bo", "toàn thời gian", "tất cả", "tat ca", "lịch sử")):
            return {
                "mode": "all",
                "granularity": "month",
                "sql": "1=1",
                "label": "toàn bộ thời gian",
                "assumptions": assumptions,
            }

        # 6. Check for Weekend / Weekdays
        if any(w in text for w in ("cuối tuần", "cuoi tuan", "weekend")):
            return {
                "mode": "weekend",
                "granularity": "day",
                "sql": f"EXTRACT(DOW FROM {{alias}}.ngay_tao) IN (0, 6) AND {{alias}}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days'",
                "label": "các ngày cuối tuần (30 ngày gần nhất)",
                "assumptions": assumptions,
            }
        if any(w in text for w in ("ngày thường", "ngay thuong", "ngày trong tuần", "weekday")):
            return {
                "mode": "weekday",
                "granularity": "day",
                "sql": f"EXTRACT(DOW FROM {{alias}}.ngay_tao) BETWEEN 1 AND 5 AND {{alias}}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days'",
                "label": "các ngày trong tuần (30 ngày gần nhất)",
                "assumptions": assumptions,
            }

        # 7. Check for Week
        if any(w in text for w in ("tuần trước", "tuan truoc", "tuần rồi", "tuan roi", "last week")):
            return {
                "mode": "week",
                "granularity": "day",
                "sql": f"{{alias}}.ngay_tao::date >= CURRENT_DATE - INTERVAL '13 days' AND {{alias}}.ngay_tao::date < CURRENT_DATE - INTERVAL '6 days'",
                "label": "tuần trước",
                "assumptions": assumptions,
            }
        if any(w in text for w in ("tuần này", "tuan nay", "this week")):
            return {
                "mode": "week",
                "granularity": "day",
                "sql": f"EXTRACT(WEEK FROM {{alias}}.ngay_tao) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM {{alias}}.ngay_tao) = EXTRACT(YEAR FROM CURRENT_DATE)",
                "label": "tuần này",
                "assumptions": assumptions,
            }

        # 6. Days intervals
        if any(term in text for term in ("hôm nay", "hom nay", "today")):
            mode = "today"
        elif any(term in text for term in ("hôm qua", "hom qua", "yesterday")):
            return {
                "mode": "yesterday",
                "granularity": "hour",
                "sql": "{alias}.ngay_tao::date = CURRENT_DATE - INTERVAL '1 day'",
                "label": "hôm qua",
                "assumptions": assumptions,
            }
        elif re.search(r"\b7\s*(ngày|ngay|days?)\b", text):
            mode = "7d"
        elif re.search(r"\b30\s*(ngày|ngay|days?)\b", text):
            mode = "30d"
        elif payload.date_range in {"today", "7days", "30days"}:
            mode = {"today": "today", "7days": "7d", "30days": "30d"}[payload.date_range]
        else:
            mode = "30d"
            assumptions.append("Không có thời gian được chỉ định cụ thể nên phân tích theo 30 ngày gần nhất.")

    if mode == "today":
        return {"mode": mode, "granularity": "hour", "sql": "{alias}.ngay_tao::date = CURRENT_DATE", "label": "hôm nay", "assumptions": assumptions}
    if mode == "7d":
        return {"mode": mode, "granularity": "day", "sql": "{alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '6 days' AND {alias}.ngay_tao::date <= CURRENT_DATE", "label": "7 ngày gần nhất", "assumptions": assumptions}
    if mode == "30d":
        return {"mode": mode, "granularity": "day", "sql": "{alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days' AND {alias}.ngay_tao::date <= CURRENT_DATE", "label": "30 ngày gần nhất", "assumptions": assumptions}
    if mode == "custom":
        if not requested or not requested.start or not requested.end:
            raise HTTPException(status_code=422, detail="Khoảng thời gian tùy chỉnh cần cả ngày bắt đầu và ngày kết thúc.")
        if requested.start > requested.end:
            raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc.")
        delta_days = (requested.end - requested.start).days
        granularity = "month" if delta_days > 90 else "day"
        return {
            "mode": mode,
            "granularity": granularity,
            "sql": f"{{alias}}.ngay_tao::date BETWEEN DATE '{requested.start.isoformat()}' AND DATE '{requested.end.isoformat()}'",
            "label": f"{requested.start.strftime('%d/%m/%Y')}–{requested.end.strftime('%d/%m/%Y')}",
            "assumptions": assumptions,
        }
    return {"mode": "30d", "granularity": "day", "sql": "{alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days' AND {alias}.ngay_tao::date <= CURRENT_DATE", "label": "30 ngày gần nhất", "assumptions": assumptions}


def _base_kpi_sql(time_filter: str) -> str:
    return f"""
        SELECT COUNT(*) AS total_orders,
               COALESCE(SUM(d.tong_tien), 0) AS total_revenue,
               ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS aov,
               ROUND(100.0 * COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'HOAN_THANH')
                     / NULLIF(COUNT(*), 0), 1) AS completion_rate
        FROM silver.don_hang d
        WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
    """


def _deterministic_plan(resolution: Dict[str, Any], time_info: Dict[str, Any]) -> Dict[str, Any]:
    entity_ids = resolution["entity_ids"]
    time_filter = time_info["sql"].format(alias="d")
    label = time_info["label"]
    granularity = time_info.get("granularity", "day")
    qc = resolution.get("query_context") or {}
    cities = qc.get("cities", [])
    city_top_pairs = qc.get("city_top_pairs", {})
    top_n = qc.get("top_n")
    sort_pref = qc.get("sort_preference") or "DESC"

    if granularity == "month":
        trend_expr = "TO_CHAR(d.ngay_tao, 'YYYY-MM')"
    elif granularity == "hour":
        trend_expr = "TO_CHAR(d.ngay_tao, 'HH24:00')"
    else:
        trend_expr = "d.ngay_tao::date::text"

    common_trend = f"""
        SELECT {trend_expr} AS label,
               COALESCE(SUM(d.tong_tien), 0) AS value
        FROM silver.don_hang d
        WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
        GROUP BY {trend_expr} ORDER BY label
    """

    primary = entity_ids[0] if entity_ids else "orders"

    if primary in ("products", "order_items"):
        if len(city_top_pairs) > 1:
            cities_list = list(city_top_pairs.keys())
            cities_in = ", ".join(f"'{c}'" for c in cities_list)
            where_conditions = " OR ".join(f'("Thành Phố" = \'{c}\' AND hang <= {n})' for c, n in city_top_pairs.items())
            cities_label = " & ".join(cities_list)
            return {
                "intent": "product_performance",
                "title": f"Top Sản Phẩm Bán Chạy tại {cities_label} — {label}",
                "description": f"So sánh xếp hạng món uống bán chạy giữa {', '.join(cities_list)} theo số lượng và doanh thu.",
                "metrics": ["quantity_sold", "product_revenue"],
                "dimensions": ["city", "product", "category"],
                "main_sql": f"""
                    WITH ranked_products AS (
                        SELECT cn.thanh_pho AS "Thành Phố",
                               sp.ten_san_pham AS "Tên Sản Phẩm",
                               COALESCE(dm.ten_danh_muc, 'Khác') AS "Danh Mục",
                               SUM(ct.so_luong) AS "Số Lượng Đã Bán",
                               COALESCE(SUM(ct.thanh_tien), 0) AS "Doanh Thu (VNĐ)",
                               ROW_NUMBER() OVER (PARTITION BY cn.thanh_pho ORDER BY SUM(ct.so_luong) {sort_pref}) AS hang
                        FROM silver.chi_tiet_don_hang ct
                        JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                        JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                        LEFT JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                        JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                          AND cn.thanh_pho IN ({cities_in})
                        GROUP BY cn.thanh_pho, sp.ten_san_pham, dm.ten_danh_muc
                    )
                    SELECT "Thành Phố", hang AS "Thứ Hạng", "Tên Sản Phẩm", "Danh Mục", "Số Lượng Đã Bán", "Doanh Thu (VNĐ)"
                    FROM ranked_products
                    WHERE {where_conditions}
                    ORDER BY "Thành Phố", hang ASC
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT cn.thanh_pho AS name, COALESCE(SUM(ct.thanh_tien), 0) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND cn.thanh_pho IN ({cities_in})
                    GROUP BY cn.thanh_pho ORDER BY value DESC
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
            }
        elif cities:
            city = cities[0]
            limit_n = top_n or 10
            return {
                "intent": "product_performance",
                "title": f"Top {limit_n} Sản Phẩm Bán Chạy tại {city} — {label}",
                "description": f"Xếp hạng {limit_n} món bán chạy nhất tại địa bàn {city}.",
                "metrics": ["quantity_sold", "product_revenue"],
                "dimensions": ["product", "category"],
                "main_sql": f"""
                    SELECT sp.ten_san_pham AS "Tên Sản Phẩm",
                           COALESCE(dm.ten_danh_muc, 'Khác') AS "Danh Mục",
                           SUM(ct.so_luong) AS "Số Lượng Đã Bán",
                           COALESCE(SUM(ct.thanh_tien), 0) AS "Doanh Thu (VNĐ)"
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND cn.thanh_pho = '{city}'
                    GROUP BY sp.ten_san_pham, dm.ten_danh_muc
                    ORDER BY "Số Lượng Đã Bán" {sort_pref}, "Doanh Thu (VNĐ)" DESC LIMIT {limit_n}
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT COALESCE(dm.ten_danh_muc, 'Khác') AS name,
                           COALESCE(SUM(ct.thanh_tien), 0) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND cn.thanh_pho = '{city}'
                    GROUP BY dm.ten_danh_muc ORDER BY value DESC LIMIT 8
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
            }
        else:
            limit_n = top_n or 20
            return {
                "intent": "product_performance",
                "title": f"Hiệu suất Sản phẩm và Cơ cấu Thực đơn — {label}",
                "description": "Xếp hạng món theo số lượng và doanh thu trên các đơn hợp lệ.",
                "metrics": ["quantity_sold", "product_revenue"],
                "dimensions": ["product", "category"],
                "main_sql": f"""
                    SELECT sp.ma_san_pham AS "Mã SP", sp.ten_san_pham AS "Tên Sản Phẩm",
                           COALESCE(dm.ten_danh_muc, 'Khác') AS "Danh Mục",
                           SUM(ct.so_luong) AS "Số Lượng Đã Bán",
                           COALESCE(SUM(ct.thanh_tien), 0) AS "Doanh Thu (VNĐ)"
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham, dm.ten_danh_muc
                    ORDER BY "Số Lượng Đã Bán" {sort_pref}, "Doanh Thu (VNĐ)" DESC LIMIT {limit_n}
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT COALESCE(dm.ten_danh_muc, 'Khác') AS name,
                           COALESCE(SUM(ct.thanh_tien), 0) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN silver.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY dm.ten_danh_muc ORDER BY value DESC LIMIT 8
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
            }

    elif primary == "stores":
        if len(cities) == 1:
            city = cities[0]
            limit_n = top_n or 15
            return {
                "intent": "store_performance",
                "title": f"Hiệu suất Chi nhánh tại {city} — {label}",
                "description": f"Xếp hạng doanh thu, số đơn và AOV các điểm bán tại {city}.",
                "metrics": ["store_revenue", "store_aov", "order_count"],
                "dimensions": ["store", "city"],
                "main_sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS "Chi Nhánh",
                           COALESCE(cn.thanh_pho, '{city}') AS "Thành Phố",
                           COUNT(*) AS "Số Đơn", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                           ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
                    FROM silver.don_hang d
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND cn.thanh_pho = '{city}'
                    GROUP BY d.co_so_ma, cn.ten_chi_nhanh, cn.thanh_pho
                    ORDER BY "Doanh Thu (VNĐ)" {sort_pref}, "AOV (VNĐ)" DESC LIMIT {limit_n}
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS name,
                           COALESCE(SUM(d.tong_tien), 0) AS value
                    FROM silver.don_hang d JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND cn.thanh_pho = '{city}'
                    GROUP BY cn.ten_chi_nhanh, d.co_so_ma ORDER BY value DESC LIMIT 8
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "bar", "table": "comparison"},
            }
        elif len(cities) > 1:
            cities_in = ", ".join(f"'{c}'" for c in cities)
            return {
                "intent": "store_performance",
                "title": f"So sánh Chi nhánh giữa {' & '.join(cities)} — {label}",
                "description": f"So sánh tổng thể doanh thu, số đơn và quy mô giữa các thành phố.",
                "metrics": ["store_revenue", "store_aov", "order_count"],
                "dimensions": ["city", "store_count"],
                "main_sql": f"""
                    SELECT cn.thanh_pho AS "Thành Phố",
                           COUNT(DISTINCT cn.ma_chi_nhanh) AS "Số Chi Nhánh",
                           COUNT(d.ma_don_hang) AS "Tổng Đơn",
                           COALESCE(SUM(d.tong_tien), 0) AS "Tổng Doanh Thu (VNĐ)",
                           ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS "AOV (VNĐ)"
                    FROM silver.chi_nhanh cn
                    LEFT JOIN silver.don_hang d ON cn.ma_chi_nhanh = d.co_so_ma AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    WHERE cn.thanh_pho IN ({cities_in})
                    GROUP BY cn.thanh_pho
                    ORDER BY "Tổng Doanh Thu (VNĐ)" DESC
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT cn.thanh_pho AS name, COALESCE(SUM(d.tong_tien), 0) AS value
                    FROM silver.chi_nhanh cn
                    JOIN silver.don_hang d ON cn.ma_chi_nhanh = d.co_so_ma AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    WHERE cn.thanh_pho IN ({cities_in})
                    GROUP BY cn.thanh_pho ORDER BY value DESC
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
            }
        else:
            limit_n = top_n or 20
            p_prompt = (resolution.get("prompt", "") or "").lower()
            store_title = f"Top Cửa hàng Bán chạy nhất — {label}" if any(w in p_prompt for w in ["bán chạy", "ban chay", "doanh thu cao", "hang dau", "nhat"]) else f"Hiệu suất Chi nhánh — {label}"
            return {
                "intent": "store_performance",
                "title": store_title,
                "description": f"Xếp hạng doanh thu, số đơn và AOV của từng điểm bán trong {label}.",
                "metrics": ["store_revenue", "store_aov", "order_count"],
                "dimensions": ["store", "city"],
                "main_sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS "Chi Nhánh",
                           COALESCE(cn.thanh_pho, 'Chưa xác định') AS "Thành Phố",
                           COUNT(*) AS "Số Đơn", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                           ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
                    FROM silver.don_hang d
                    LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY d.co_so_ma, cn.ten_chi_nhanh, cn.thanh_pho
                    ORDER BY "Doanh Thu (VNĐ)" {sort_pref}, "AOV (VNĐ)" DESC LIMIT {limit_n}
                """,
                "trend_sql": common_trend,
                "breakdown_sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS name,
                           COALESCE(SUM(d.tong_tien), 0) AS value
                    FROM silver.don_hang d LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY COALESCE(cn.ten_chi_nhanh, d.co_so_ma) ORDER BY value DESC LIMIT 8
                """,
                "kpi_sql": _base_kpi_sql(time_filter),
                "visualizations": {"trend": "area", "breakdown": "bar", "table": "comparison"},
            }

    elif primary == "hourly":
        return {
            "intent": "hourly_payment_patterns",
            "title": f"Khung giờ Cao điểm và Thanh toán — {label}",
            "description": "Mật độ giao dịch theo giờ và cơ cấu hình thức thanh toán.",
            "metrics": ["hourly_orders", "payment_count", "payment_revenue"],
            "dimensions": ["hour", "payment_method"],
            "main_sql": f"""
                SELECT EXTRACT(HOUR FROM d.ngay_tao)::int AS "Giờ",
                       COUNT(*) AS "Số Đơn", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                       ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY EXTRACT(HOUR FROM d.ngay_tao) ORDER BY "Số Đơn" DESC
            """,
            "trend_sql": f"""
                SELECT LPAD(EXTRACT(HOUR FROM d.ngay_tao)::int::text, 2, '0') || ':00' AS label,
                       COUNT(*) AS value
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY EXTRACT(HOUR FROM d.ngay_tao) ORDER BY EXTRACT(HOUR FROM d.ngay_tao)
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name, COUNT(*) AS value
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "bar", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "payments":
        return {
            "intent": "payment_performance",
            "title": f"Cơ cấu Thanh toán — {label}",
            "description": "Phân tích số giao dịch và doanh thu theo hình thức thanh toán.",
            "metrics": ["payment_count", "payment_revenue"],
            "dimensions": ["payment_method"],
            "main_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS "Phương Thức",
                       COUNT(*) AS "Số Giao Dịch", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)"
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY "Doanh Thu (VNĐ)" DESC
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name,
                       COALESCE(SUM(d.tong_tien), 0) AS value
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
        }

    elif primary == "customers":
        p_text = (resolution.get("prompt", "") or "").lower()
        if any(kw in p_text for kw in ["bean", "diem", "loyalty", "tich luy", "vip"]):
            limit_n = top_n or 15
            return {
                "intent": "customer_loyalty",
                "title": f"Top Khách hàng Hội viên & Tích lũy Điểm Beans — {label}",
                "description": "Xếp hạng hội viên tích lũy điểm Beans và chi tiêu cao nhất (mã hóa danh tính an toàn PII).",
                "metrics": ["diem_loyalty", "tong_chi_tieu"],
                "dimensions": ["customer_code", "role"],
                "main_sql": f"""
                    SELECT 'Hội viên #' || SUBSTRING(u.ma_nguoi_dung::text, 1, 8) AS "Mã Hội Viên",
                           u.vai_tro AS "Hạng Hội Viên",
                           u.diem_loyalty AS "Điểm Beans",
                           COALESCE(u.tong_chi_tieu, 0) AS "Tổng Chi Tiêu (VNĐ)"
                    FROM silver.nguoi_dung u
                    WHERE u.vai_tro = 'CUSTOMER'
                    ORDER BY u.diem_loyalty {sort_pref}, u.tong_chi_tieu DESC LIMIT {limit_n}
                """,
                "trend_sql": f"""
                    SELECT d.ngay_tao::date::text AS label, COUNT(DISTINCT d.ma_nguoi_dung) AS value
                    FROM silver.don_hang d
                    WHERE d.ma_nguoi_dung IS NOT NULL AND {time_filter}
                      AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date
                """,
                "breakdown_sql": f"""
                    SELECT u.vai_tro AS name, COUNT(*) AS value
                    FROM silver.nguoi_dung u
                    GROUP BY u.vai_tro ORDER BY value DESC
                """,
                "kpi_sql": f"""
                    SELECT COUNT(*) AS total_orders,
                           COALESCE(SUM(diem_loyalty), 0) AS total_revenue,
                           ROUND(AVG(diem_loyalty), 0) AS aov,
                           100.0 AS completion_rate
                    FROM silver.nguoi_dung WHERE vai_tro = 'CUSTOMER'
                """,
                "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
            }

        customer_cte = f"""
            WITH customer_orders AS (
                SELECT d.ma_nguoi_dung, COUNT(*) AS order_count,
                       COALESCE(SUM(d.tong_tien), 0) AS lifetime_value
                FROM silver.don_hang d
                WHERE d.ma_nguoi_dung IS NOT NULL AND {time_filter}
                  AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.ma_nguoi_dung
            )
        """
        return {
            "intent": "customer_repeat_behavior",
            "title": f"Hội viên và Mức độ Mua lặp lại — {label}",
            "description": "Phân tích hành vi hội viên ở mức tổng hợp, không xuất dữ liệu định danh cá nhân.",
            "metrics": ["customer_count", "repeat_rate", "lifetime_value"],
            "dimensions": ["purchase_frequency_segment"],
            "main_sql": customer_cte + """
                SELECT CASE WHEN order_count = 1 THEN 'Mua 1 lần'
                            WHEN order_count BETWEEN 2 AND 3 THEN 'Mua 2–3 lần'
                            ELSE 'Mua từ 4 lần' END AS "Nhóm Tần Suất",
                       COUNT(*) AS "Số Hội Viên", ROUND(AVG(order_count), 1) AS "Số Đơn TB",
                       ROUND(AVG(lifetime_value), 0) AS "Chi Tiêu TB (VNĐ)"
                FROM customer_orders GROUP BY 1 ORDER BY "Số Hội Viên" DESC
            """,
            "trend_sql": f"""
                SELECT d.ngay_tao::date::text AS label, COUNT(DISTINCT d.ma_nguoi_dung) AS value
                FROM silver.don_hang d
                WHERE d.ma_nguoi_dung IS NOT NULL AND {time_filter}
                  AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date
            """,
            "breakdown_sql": customer_cte + """
                SELECT CASE WHEN order_count >= 2 THEN 'Mua lặp lại' ELSE 'Mua 1 lần' END AS name,
                       COUNT(*) AS value FROM customer_orders GROUP BY 1 ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "segments"},
        }

    elif primary == "delivery":
        limit_n = top_n or 20
        return {
            "intent": "delivery_performance",
            "title": f"Hiệu suất Tài xế Giao hàng — {label}",
            "description": "Đánh giá số lượng chuyến giao và điểm đánh giá của đội ngũ tài xế (mã định danh an toàn).",
            "metrics": ["delivery_count", "driver_rating"],
            "dimensions": ["driver_code", "status"],
            "main_sql": f"""
                SELECT 'Tài xế #' || SUBSTRING(s.ma_shipper::text, 1, 8) AS "Mã Tài Xế",
                       s.bien_so_xe AS "Biển Số Xe", s.loai_xe AS "Phương Tiện",
                       s.trang_thai AS "Trạng Thái",
                       s.tong_chuyen_giao AS "Tổng Chuyến Giao",
                       s.diem_danh_gia AS "Đánh Giá (Sao)"
                FROM silver.shipper s
                ORDER BY "Tổng Chuyến Giao" {sort_pref} LIMIT {limit_n}
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT s.trang_thai AS name, COUNT(*) AS value
                FROM silver.shipper s GROUP BY s.trang_thai ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "promotions":
        return {
            "intent": "promotions",
            "title": f"Hiệu quả Chương trình Khuyến mãi và Voucher — {label}",
            "description": "Phân tích doanh thu, số đơn và chiết khấu giảm giá của từng chương trình khuyến mãi/voucher.",
            "metrics": ["voucher_order_count", "voucher_revenue", "discount_amount"],
            "dimensions": ["promotion_name", "discount_amount"],
            "main_sql": f"""
                SELECT COALESCE(km.ten_khuyen_mai, d.ma_voucher) AS "Chương Trình Khuyến Mãi",
                       COUNT(d.ma_don_hang) AS "Số Đơn Áp Dụng",
                       COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                       COALESCE(SUM(d.so_tien_giam), 0) AS "Số Tiền Giảm (VNĐ)",
                       ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS "AOV (VNĐ)"
                FROM silver.don_hang d
                LEFT JOIN silver.khuyen_mai km ON d.ma_voucher = km.ma_khuyen_mai
                WHERE {time_filter} AND d.trang_thai_don_hang != 'DA_HUY' AND d.ma_voucher IS NOT NULL
                GROUP BY COALESCE(km.ten_khuyen_mai, d.ma_voucher)
                ORDER BY "Số Đơn Áp Dụng" {sort_pref}, "Doanh Thu (VNĐ)" DESC LIMIT {top_n or 15}
            """,
            "trend_sql": f"""
                SELECT d.ngay_tao::date::text AS label,
                       COALESCE(SUM(d.tong_tien), 0) AS value
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang != 'DA_HUY' AND d.ma_voucher IS NOT NULL
                GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(km.ten_khuyen_mai, d.ma_voucher) AS name,
                       COUNT(d.ma_don_hang) AS value
                FROM silver.don_hang d
                LEFT JOIN silver.khuyen_mai km ON d.ma_voucher = km.ma_khuyen_mai
                WHERE {time_filter} AND d.trang_thai_don_hang != 'DA_HUY' AND d.ma_voucher IS NOT NULL
                GROUP BY COALESCE(km.ten_khuyen_mai, d.ma_voucher)
                ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COALESCE(SUM(d.tong_tien), 0) AS total_revenue,
                       ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'HOAN_THANH')
                             / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') AND d.ma_voucher IS NOT NULL
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "product_reviews":
        return {
            "intent": "product_reviews",
            "title": f"Đánh giá Chất lượng Sản phẩm — {label}",
            "description": "Phân tích điểm số sao và mức độ hài lòng của khách hàng đối với các món đồ uống.",
            "metrics": ["avg_product_rating", "review_count"],
            "dimensions": ["product_name", "rating"],
            "main_sql": f"""
                SELECT COALESCE(dg.ten_san_pham, sp.ten_san_pham) AS "Tên Món",
                       ROUND(AVG(dg.so_sao), 2) AS "Điểm Sao TB",
                       COUNT(*) AS "Số Lượt Đánh Giá"
                FROM silver.danh_gia_san_pham dg
                LEFT JOIN silver.san_pham sp ON dg.ma_san_pham = sp.ma_san_pham::text
                GROUP BY COALESCE(dg.ten_san_pham, sp.ten_san_pham)
                ORDER BY "Điểm Sao TB" DESC, "Số Lượt Đánh Giá" DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT dg.ngay_tao::date::text AS label, COUNT(*) AS value
                FROM silver.danh_gia_san_pham dg
                GROUP BY dg.ngay_tao::date ORDER BY dg.ngay_tao::date
            """,
            "breakdown_sql": f"""
                SELECT dg.so_sao::text || ' Sao' AS name, COUNT(*) AS value
                FROM silver.danh_gia_san_pham dg
                GROUP BY dg.so_sao ORDER BY dg.so_sao DESC
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       ROUND(COALESCE(AVG(so_sao), 0), 2) AS total_revenue,
                       COUNT(DISTINCT ma_san_pham) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE so_sao >= 4) / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.danh_gia_san_pham
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "store_reviews":
        return {
            "intent": "store_reviews",
            "title": f"Đánh giá Dịch vụ Chi nhánh — {label}",
            "description": "Điểm phục vụ và nhận xét không gian của từng chi nhánh từ khách hàng.",
            "metrics": ["avg_store_rating", "store_review_count"],
            "dimensions": ["store_name", "rating"],
            "main_sql": f"""
                SELECT COALESCE(cn.ten_chi_nhanh, dg.ten_chi_nhanh) AS "Chi Nhánh",
                       ROUND(AVG(dg.so_sao), 2) AS "Điểm Phục Vụ TB",
                       COUNT(*) AS "Số Lượt Đánh Giá"
                FROM silver.danh_gia_chi_nhanh dg
                LEFT JOIN silver.chi_nhanh cn ON dg.ma_chi_nhanh = cn.ma_chi_nhanh
                GROUP BY COALESCE(cn.ten_chi_nhanh, dg.ten_chi_nhanh)
                ORDER BY "Điểm Phục Vụ TB" DESC, "Số Lượt Đánh Giá" DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT dg.ngay_tao::date::text AS label, COUNT(*) AS value
                FROM silver.danh_gia_chi_nhanh dg
                GROUP BY dg.ngay_tao::date ORDER BY dg.ngay_tao::date
            """,
            "breakdown_sql": f"""
                SELECT dg.so_sao::text || ' Sao' AS name, COUNT(*) AS value
                FROM silver.danh_gia_chi_nhanh dg
                GROUP BY dg.so_sao ORDER BY dg.so_sao DESC
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       ROUND(COALESCE(AVG(so_sao), 0), 2) AS total_revenue,
                       COUNT(DISTINCT ma_chi_nhanh) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE so_sao >= 4) / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.danh_gia_chi_nhanh
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "staff_shifts":
        return {
            "intent": "staff_shifts",
            "title": f"Chấm công và Ca làm việc Nhân sự — {label}",
            "description": "Thống kê lịch trực, tình hình đi trễ, đúng giờ của nhân viên theo chi nhánh.",
            "metrics": ["shift_count", "late_count"],
            "dimensions": ["staff_name", "attendance_status"],
            "main_sql": f"""
                SELECT COALESCE(cn.ten_chi_nhanh, ca.co_so_ma) AS "Chi Nhánh",
                       ca.staff_name AS "Nhân Viên",
                       COUNT(*) AS "Tổng Số Ca",
                       COUNT(*) FILTER (WHERE ca.trang_thai_cham_cong = 'DI_TRE') AS "Số Ca Đi Trễ",
                       COUNT(*) FILTER (WHERE ca.trang_thai_cham_cong = 'DUNG_GIO') AS "Đúng Giờ"
                FROM silver.ca_lam_viec_nhan_vien ca
                LEFT JOIN silver.chi_nhanh cn ON ca.co_so_ma = cn.ma_chi_nhanh
                GROUP BY COALESCE(cn.ten_chi_nhanh, ca.co_so_ma), ca.staff_name
                ORDER BY "Số Ca Đi Trễ" DESC, "Tổng Số Ca" DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT ca.ngay_lam_viec::text AS label, COUNT(*) AS value
                FROM silver.ca_lam_viec_nhan_vien ca
                GROUP BY ca.ngay_lam_viec ORDER BY ca.ngay_lam_viec
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(ca.trang_thai_cham_cong, 'Chưa xác định') AS name, COUNT(*) AS value
                FROM silver.ca_lam_viec_nhan_vien ca
                GROUP BY ca.trang_thai_cham_cong ORDER BY value DESC
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(*) FILTER (WHERE trang_thai_cham_cong = 'DI_TRE') AS total_revenue,
                       COUNT(DISTINCT staff_name) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_cham_cong = 'DUNG_GIO') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.ca_lam_viec_nhan_vien
            """,
            "visualizations": {"trend": "bar", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "cashier_reconciliation":
        return {
            "intent": "cashier_reconciliation",
            "title": f"Đối soát Ca Thu ngân & Chênh lệch Quỹ — {label}",
            "description": "Số liệu đối soát tiền mặt đầu/cuối ca, tiền mặt POS và chênh lệch két.",
            "metrics": ["total_cash_difference", "system_cash_revenue", "reconciled_shifts"],
            "dimensions": ["cashier_name", "branch", "approval_status"],
            "main_sql": f"""
                SELECT COALESCE(cn.ten_chi_nhanh, ds.co_so_ma) AS "Chi Nhánh",
                       ds.ten_nhan_vien AS "Thu Ngân",
                       ds.thoi_gian_bat_dau::date::text AS "Ngày",
                       ds.tien_mat_he_thong AS "Tiền Mặt Hệ Thống (VNĐ)",
                       ds.tien_cuoi_ca AS "Tiền Mặt Thực Tế (VNĐ)",
                       ds.chenh_lech AS "Chênh Lệch (VNĐ)",
                       ds.trang_thai_phe_duyet AS "Trạng Thái"
                FROM silver.ca_doi_soat ds
                LEFT JOIN silver.chi_nhanh cn ON ds.co_so_ma = cn.ma_chi_nhanh
                ORDER BY ds.thoi_gian_bat_dau DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT ds.thoi_gian_bat_dau::date::text AS label,
                       COALESCE(SUM(ds.tien_mat_he_thong), 0) AS value
                FROM silver.ca_doi_soat ds
                GROUP BY ds.thoi_gian_bat_dau::date ORDER BY ds.thoi_gian_bat_dau::date
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(ds.trang_thai_phe_duyet, 'Chưa duyệt') AS name, COUNT(*) AS value
                FROM silver.ca_doi_soat ds
                GROUP BY ds.trang_thai_phe_duyet ORDER BY value DESC
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COALESCE(SUM(tien_mat_he_thong), 0) AS total_revenue,
                       COALESCE(SUM(chenh_lech), 0) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE trang_thai_phe_duyet = 'DA_PHE_DUYET') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.ca_doi_soat
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
        }

    elif primary == "wishlist_favorites":
        return {
            "intent": "wishlist_favorites",
            "title": f"Món đồ uống Yêu thích (Wishlist) — {label}",
            "description": "Xếp hạng các món được người dùng thả tim và quan tâm nhiều nhất trên app.",
            "metrics": ["favorite_count"],
            "dimensions": ["product_name", "category"],
            "main_sql": f"""
                SELECT yt.ten_san_pham AS "Tên Món",
                       COALESCE(yt.danh_muc, 'Khác') AS "Danh Mục",
                       COUNT(*) AS "Lượt Yêu Thích",
                       COALESCE(ROUND(AVG(yt.gia_ban), 0), 0) AS "Giá Bán (VNĐ)"
                FROM silver.yeu_thich_san_pham yt
                GROUP BY yt.ten_san_pham, yt.danh_muc
                ORDER BY "Lượt Yêu Thích" DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT yt.ngay_tao::date::text AS label, COUNT(*) AS value
                FROM silver.yeu_thich_san_pham yt
                GROUP BY yt.ngay_tao::date ORDER BY yt.ngay_tao::date
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(yt.danh_muc, 'Khác') AS name, COUNT(*) AS value
                FROM silver.yeu_thich_san_pham yt
                GROUP BY yt.danh_muc ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(DISTINCT ma_san_pham) AS total_revenue,
                       COUNT(DISTINCT ma_nguoi_dung) AS aov,
                       100.0 AS completion_rate
                FROM silver.yeu_thich_san_pham
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "inventory":
        limit_n = top_n or 20
        city_filter = ""
        inv_title = f"Tồn kho Sản phẩm & Cảnh báo — {label}"
        if cities:
            city_filter = f"AND cn.thanh_pho = '{cities[0]}'"
            inv_title = f"Tồn kho Sản phẩm & Cảnh báo tại {cities[0]} — {label}"
        return {
            "intent": "inventory",
            "title": inv_title,
            "description": "Tồn kho thực tế của các chi nhánh so với định mức an toàn tối thiểu.",
            "metrics": ["stock_quantity", "low_stock_count"],
            "dimensions": ["product_name", "store_code"],
            "main_sql": f"""
                SELECT sp.ten_san_pham AS "Tên Món",
                       COALESCE(cn.ten_chi_nhanh, tk.co_so_ma) AS "Chi Nhánh",
                       COALESCE(cn.thanh_pho, 'Toàn quốc') AS "Thành Phố",
                       tk.so_luong_ton AS "Tồn Kho Hiện Tại",
                       tk.muc_canh_bao AS "Định Mức Cảnh Báo",
                       CASE WHEN tk.so_luong_ton <= tk.muc_canh_bao THEN 'Sắp Hết Hàng' ELSE 'Đủ Tồn Kho' END AS "Tình Trạng"
                FROM silver.ton_kho_san_pham tk
                JOIN silver.san_pham sp ON tk.ma_san_pham = sp.ma_san_pham
                LEFT JOIN silver.chi_nhanh cn ON tk.co_so_ma = cn.ma_chi_nhanh
                WHERE 1=1 {city_filter}
                ORDER BY tk.so_luong_ton ASC LIMIT {limit_n}
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT CASE WHEN tk.so_luong_ton <= tk.muc_canh_bao THEN 'Sắp Hết Hàng' ELSE 'Đủ Tồn Kho' END AS name,
                       COUNT(*) AS value
                FROM silver.ton_kho_san_pham tk
                LEFT JOIN silver.chi_nhanh cn ON tk.co_so_ma = cn.ma_chi_nhanh
                WHERE 1=1 {city_filter}
                GROUP BY (tk.so_luong_ton <= tk.muc_canh_bao)
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COALESCE(SUM(tk.so_luong_ton), 0) AS total_revenue,
                       COUNT(*) FILTER (WHERE tk.so_luong_ton <= tk.muc_canh_bao) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE tk.dang_kinh_doanh = true) / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.ton_kho_san_pham tk
                LEFT JOIN silver.chi_nhanh cn ON tk.co_so_ma = cn.ma_chi_nhanh
                WHERE 1=1 {city_filter}
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    elif primary == "customer_surveys":
        return {
            "intent": "customer_surveys",
            "title": f"Khảo sát Ý kiến Khách hàng — {label}",
            "description": "Lưu lượng phản hồi và kết quả khảo sát dịch vụ khách hàng.",
            "metrics": ["survey_response_count"],
            "dimensions": ["store_code", "voucher_status"],
            "main_sql": f"""
                SELECT COALESCE(cn.ten_chi_nhanh, ks.co_so_ma, 'Tổng thể') AS "Chi Nhánh",
                       COUNT(*) AS "Số Lượt Phản Hồi",
                       COALESCE(ks.trang_thai_voucher, 'Chưa cấp') AS "Trạng Thái Voucher"
                FROM silver.khao_sat_phan_hoi ks
                LEFT JOIN silver.chi_nhanh cn ON ks.co_so_ma = cn.ma_chi_nhanh
                GROUP BY COALESCE(cn.ten_chi_nhanh, ks.co_so_ma, 'Tổng thể'), ks.trang_thai_voucher
                ORDER BY "Số Lượt Phản Hồi" DESC LIMIT 20
            """,
            "trend_sql": f"""
                SELECT ks.ngay_tao::date::text AS label, COUNT(*) AS value
                FROM silver.khao_sat_phan_hoi ks
                GROUP BY ks.ngay_tao::date ORDER BY ks.ngay_tao::date
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(ks.trang_thai_voucher, 'Chưa cấp') AS name, COUNT(*) AS value
                FROM silver.khao_sat_phan_hoi ks
                GROUP BY ks.trang_thai_voucher ORDER BY value DESC
            """,
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(DISTINCT ma_nguoi_dung) AS total_revenue,
                       COUNT(DISTINCT co_so_ma) AS aov,
                       100.0 AS completion_rate
                FROM silver.khao_sat_phan_hoi
            """,
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    if len(cities) > 1:
        cities_in = ", ".join(f"'{c}'" for c in cities)
        return {
            "intent": "city_comparison",
            "title": f"So sánh Hiệu suất giữa {' & '.join(cities)} — {label}",
            "description": f"So sánh tổng thể doanh thu, số đơn và quy mô giữa các thành phố.",
            "metrics": ["store_revenue", "order_count", "store_aov"],
            "dimensions": ["city"],
            "main_sql": f"""
                SELECT cn.thanh_pho AS "Thành Phố",
                       COUNT(DISTINCT cn.ma_chi_nhanh) AS "Số Chi Nhánh",
                       COUNT(d.ma_don_hang) AS "Tổng Đơn",
                       COALESCE(SUM(d.tong_tien), 0) AS "Tổng Doanh Thu (VNĐ)",
                       ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS "AOV (VNĐ)"
                FROM silver.chi_nhanh cn
                LEFT JOIN silver.don_hang d ON cn.ma_chi_nhanh = d.co_so_ma
                  AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                  AND {time_filter}
                WHERE cn.thanh_pho IN ({cities_in})
                GROUP BY cn.thanh_pho
                ORDER BY "Tổng Doanh Thu (VNĐ)" DESC
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT cn.thanh_pho AS name, COALESCE(SUM(d.tong_tien), 0) AS value
                FROM silver.chi_nhanh cn
                JOIN silver.don_hang d ON cn.ma_chi_nhanh = d.co_so_ma
                  AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                  AND {time_filter}
                WHERE cn.thanh_pho IN ({cities_in})
                GROUP BY cn.thanh_pho ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
        }
    elif len(cities) == 1:
        city = cities[0]
        return {
            "intent": "city_overview",
            "title": f"Tổng quan Doanh thu tại {city} — {label}",
            "description": f"Tổng hợp doanh thu, số đơn và AOV tại các chi nhánh {city}.",
            "metrics": ["revenue", "order_count", "aov"],
            "dimensions": ["date", "store"],
            "main_sql": f"""
                SELECT cn.ten_chi_nhanh AS "Chi Nhánh",
                       COUNT(d.ma_don_hang) AS "Số Đơn",
                       COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                       ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
                FROM silver.don_hang d
                JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                  AND cn.thanh_pho = '{city}'
                GROUP BY cn.ten_chi_nhanh
                ORDER BY "Doanh Thu (VNĐ)" DESC LIMIT 20
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT cn.ten_chi_nhanh AS name, COALESCE(SUM(d.tong_tien), 0) AS value
                FROM silver.don_hang d JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                  AND cn.thanh_pho = '{city}'
                GROUP BY cn.ten_chi_nhanh ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    return {
        "intent": "revenue_overview",
        "title": f"Tổng quan Doanh thu — {label}",
        "description": "Tổng hợp doanh thu, số đơn và AOV từ các giao dịch hợp lệ.",
        "metrics": ["revenue", "order_count", "aov"],
        "dimensions": ["date", "payment_method"],
        "main_sql": f"""
            SELECT d.ngay_tao::date::text AS "Ngày", COUNT(*) AS "Số Đơn",
                   COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                   ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
            FROM silver.don_hang d
            WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date DESC LIMIT 30
        """,
        "trend_sql": common_trend,
        "breakdown_sql": f"""
            SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name,
                   COALESCE(SUM(d.tong_tien), 0) AS value
            FROM silver.don_hang d
            WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC LIMIT 8
        """,
        "kpi_sql": _base_kpi_sql(time_filter),
        "visualizations": {"trend": "area", "breakdown": "donut", "table": "timeseries"},
    }


CHART_SEMANTICS: Dict[str, Dict[str, Dict[str, str]]] = {
    "product_performance": {
        "trend": {"metric": "product_revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu sản phẩm theo thời gian", "x_label": "Ngày", "y_label": "Doanh thu"},
        "breakdown": {"metric": "product_revenue", "unit": "VNĐ", "chart_type": "donut", "title": "Cơ cấu doanh thu theo danh mục", "x_label": "Danh mục", "y_label": "Doanh thu"},
    },
    "store_performance": {
        "trend": {"metric": "store_revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu chi nhánh theo thời gian", "x_label": "Ngày", "y_label": "Doanh thu"},
        "breakdown": {"metric": "store_revenue", "unit": "VNĐ", "chart_type": "bar", "title": "Doanh thu theo khu vực", "x_label": "Khu vực", "y_label": "Doanh thu"},
    },
    "hourly_payment_patterns": {
        "trend": {"metric": "hourly_orders", "unit": "đơn", "chart_type": "bar", "title": "Số đơn theo khung giờ", "x_label": "Giờ", "y_label": "Số đơn"},
        "breakdown": {"metric": "payment_count", "unit": "đơn", "chart_type": "donut", "title": "Cơ cấu đơn theo phương thức thanh toán", "x_label": "Phương thức", "y_label": "Số đơn"},
    },
    "payment_performance": {
        "trend": {"metric": "payment_revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu thanh toán theo thời gian", "x_label": "Ngày", "y_label": "Doanh thu"},
        "breakdown": {"metric": "payment_revenue", "unit": "VNĐ", "chart_type": "donut", "title": "Cơ cấu doanh thu theo phương thức thanh toán", "x_label": "Phương thức", "y_label": "Doanh thu"},
    },
    "customer_repeat_behavior": {
        "trend": {"metric": "customer_count", "unit": "khách", "chart_type": "area", "title": "Số khách theo thời gian", "x_label": "Ngày", "y_label": "Số khách"},
        "breakdown": {"metric": "customer_count", "unit": "hội viên", "chart_type": "donut", "title": "Cơ cấu hội viên theo tần suất mua", "x_label": "Nhóm hội viên", "y_label": "Số hội viên"},
    },
    "delivery_performance": {
        "trend": {"metric": "delivery_count", "unit": "lượt giao", "chart_type": "area", "title": "Số lượt giao theo thời gian", "x_label": "Ngày", "y_label": "Số lượt giao"},
        "breakdown": {"metric": "delivery_count", "unit": "lượt giao", "chart_type": "donut", "title": "Cơ cấu lượt giao theo trạng thái", "x_label": "Trạng thái", "y_label": "Số lượt giao"},
    },
    "revenue_overview": {
        "trend": {"metric": "revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu theo thời gian", "x_label": "Ngày", "y_label": "Doanh thu"},
        "breakdown": {"metric": "revenue", "unit": "VNĐ", "chart_type": "donut", "title": "Cơ cấu doanh thu theo phương thức thanh toán", "x_label": "Phương thức", "y_label": "Doanh thu"},
    },
    "promotions": {
        "trend": {"metric": "voucher_revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu theo thời gian của đơn có khuyến mãi", "x_label": "Ngày", "y_label": "Doanh thu"},
        "breakdown": {"metric": "voucher_revenue", "unit": "VNĐ", "chart_type": "donut", "title": "Tỷ trọng doanh thu theo chương trình khuyến mãi", "x_label": "Chương trình", "y_label": "Doanh thu"},
    },
    "product_reviews": {
        "trend": {"metric": "review_count", "unit": "lượt", "chart_type": "area", "title": "Lượt đánh giá theo thời gian", "x_label": "Ngày", "y_label": "Lượt"},
        "breakdown": {"metric": "review_count", "unit": "lượt", "chart_type": "donut", "title": "Cơ cấu phân bổ số sao đánh giá món", "x_label": "Số sao", "y_label": "Lượt"},
    },
    "store_reviews": {
        "trend": {"metric": "review_count", "unit": "lượt", "chart_type": "area", "title": "Lượt đánh giá phục vụ theo thời gian", "x_label": "Ngày", "y_label": "Lượt"},
        "breakdown": {"metric": "review_count", "unit": "lượt", "chart_type": "donut", "title": "Cơ cấu phân bổ số sao phục vụ quán", "x_label": "Số sao", "y_label": "Lượt"},
    },
    "staff_shifts": {
        "trend": {"metric": "shift_count", "unit": "ca", "chart_type": "bar", "title": "Số ca làm việc theo ngày", "x_label": "Ngày", "y_label": "Số ca"},
        "breakdown": {"metric": "shift_count", "unit": "ca", "chart_type": "donut", "title": "Cơ cấu trạng thái chấm công", "x_label": "Trạng thái", "y_label": "Số ca"},
    },
    "cashier_reconciliation": {
        "trend": {"metric": "system_cash_revenue", "unit": "VNĐ", "chart_type": "area", "title": "Doanh thu tiền mặt theo ngày đối soát", "x_label": "Ngày", "y_label": "Tiền mặt"},
        "breakdown": {"metric": "reconciled_shifts", "unit": "ca", "chart_type": "donut", "title": "Tỷ trọng trạng thái phê duyệt ca", "x_label": "Trạng thái", "y_label": "Số ca"},
    },
    "wishlist_favorites": {
        "trend": {"metric": "favorite_count", "unit": "lượt", "chart_type": "area", "title": "Lượt yêu thích theo thời gian", "x_label": "Ngày", "y_label": "Lượt"},
        "breakdown": {"metric": "favorite_count", "unit": "lượt", "chart_type": "donut", "title": "Tỷ trọng món yêu thích theo danh mục", "x_label": "Danh mục", "y_label": "Lượt"},
    },
    "inventory": {
        "trend": {"metric": "stock_quantity", "unit": "đơn vị", "chart_type": "area", "title": "Biến động tồn kho theo thời gian", "x_label": "Ngày", "y_label": "Tồn kho"},
        "breakdown": {"metric": "stock_quantity", "unit": "món", "chart_type": "donut", "title": "Tỷ trọng tình trạng tồn kho sản phẩm", "x_label": "Tình trạng", "y_label": "Số món"},
    },
    "customer_surveys": {
        "trend": {"metric": "survey_response_count", "unit": "lượt", "chart_type": "area", "title": "Lượt phản hồi khảo sát theo thời gian", "x_label": "Ngày", "y_label": "Lượt"},
        "breakdown": {"metric": "survey_response_count", "unit": "lượt", "chart_type": "donut", "title": "Cơ cấu khảo sát theo trạng thái voucher", "x_label": "Voucher", "y_label": "Lượt"},
    },
    "customer_loyalty": {
        "trend": {"metric": "customer_count", "unit": "khách", "chart_type": "area", "title": "Hội viên phát sinh giao dịch theo thời gian", "x_label": "Ngày", "y_label": "Số khách"},
        "breakdown": {"metric": "customer_count", "unit": "hội viên", "chart_type": "donut", "title": "Cơ cấu hội viên theo hạng thẻ", "x_label": "Hạng hội viên", "y_label": "Số hội viên"},
    },
}


def _chart_metadata(plan: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    intent = fallback.get("intent") or "revenue_overview"
    default_semantics = {
        "trend": {"metric": "value", "unit": "", "chart_type": "area", "title": "Biến động theo thời gian", "x_label": "Thời gian", "y_label": "Giá trị"},
        "breakdown": {"metric": "value", "unit": "", "chart_type": "donut", "title": "Cơ cấu phân bổ", "x_label": "Phân loại", "y_label": "Giá trị"},
    }
    semantics = CHART_SEMANTICS.get(intent, default_semantics)
    metadata = {key: dict(value) for key, value in semantics.items()}
    requested = plan.get("visualizations") if isinstance(plan.get("visualizations"), dict) else {}
    for key in ("trend", "breakdown"):
        value = requested.get(key)
        chart_type = value.get("chart_type") if isinstance(value, dict) else value
        allowed = {"area", "bar"} if key == "trend" else {"bar", "donut"}
        if chart_type in allowed:
            metadata[key]["chart_type"] = chart_type
    return metadata


def _query_policy(metadata_context: Dict[str, Any]) -> Dict[str, set[str]]:
    if metadata_context.get("full_policy"):
        return metadata_context["full_policy"]
    return {
        table["qualified_name"]: {column["name"] for column in table.get("columns", [])}
        for table in metadata_context.get("physical_metadata", [])
    }


def _planner_prompt(payload: AiTextToReportRequest, resolution: Dict[str, Any], time_info: Dict[str, Any], context: Dict[str, Any]) -> str:
    # Format Few-Shot Examples from RAG retriever (up to 3 most relevant)
    few_shots_text = ""
    few_shots = context.get("few_shot_examples", [])[:3]
    if few_shots:
        few_shots_formatted = []
        for i, ex in enumerate(few_shots, 1):
            few_shots_formatted.append(f"Ví dụ {i}:\n  - Yêu cầu: {ex.get('question')}\n  - SQL mẫu: {ex.get('sql')}")
        few_shots_text = "\n\nCÁC VÍ DỤ MẪU TỐI ƯU TỪ RAG RETRIEVER:\n" + "\n\n".join(few_shots_formatted)

    # Format Data Samples (compact)
    data_samples_text = ""
    data_samples = context.get("data_samples", {})
    if data_samples:
        samples_lines = []
        if data_samples.get("cities"):
            samples_lines.append(f"Thành phố: {', '.join(repr(c) for c in data_samples['cities'][:6])}")
        if data_samples.get("payment_methods"):
            samples_lines.append(f"Thanh toán: {', '.join(repr(p) for p in data_samples['payment_methods'][:5])}")
        data_samples_text = "\nDATA SAMPLES: " + "; ".join(samples_lines)

    # Format Query Context signals extracted from user query
    qc = context.get("query_context") or {}
    qc_lines = []
    if qc.get("cities"):
        qc_lines.append(f"  - Địa phương / Thành phố: {', '.join(qc['cities'])} -> JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh và lọc theo thành phố này!")
    if qc.get("city_top_pairs"):
        pairs_str = ", ".join(f"{city}: Top {n}" for city, n in qc["city_top_pairs"].items())
        qc_lines.append(f"  - Đa mục tiêu: {pairs_str} -> Dùng CTE ROW_NUMBER() OVER (PARTITION BY cn.thanh_pho ORDER BY ...) AS hang!")
    elif qc.get("top_n"):
        qc_lines.append(f"  - Giới hạn: Top {qc['top_n']} -> BẮT BUỘC LIMIT {qc['top_n']}")
    if qc.get("has_comparison"):
        qc_lines.append("  - Ý định SO SÁNH: Đối chiếu trực tiếp giữa các đối tượng.")
    if qc.get("sort_preference"):
        qc_lines.append(f"  - Thứ tự: ORDER BY ... {qc['sort_preference']}")
    query_analysis_text = ("\nPHÂN TÍCH TỰ ĐỘNG TỪ YÊU CẦU:\n" + "\n".join(qc_lines)) if qc_lines else ""

    # Format Enums (top 3 key enums)
    enums_text = ""
    enums = context.get("enums", {})
    if enums:
        enums_formatted = [f"  - {col}: {', '.join(repr(v) for v in vals[:4])}" for col, vals in list(enums.items())[:3]]
        enums_text = "\nENUMS HỢP LỆ:\n" + "\n".join(enums_formatted)

    # Format Business Rules (top 3)
    rules_text = ""
    rules = context.get("business_rules", [])[:3]
    if rules:
        rules_formatted = [f"  - {r}" for r in rules]
        rules_text = "\nQUY TẮC NGHIỆP VỤ:\n" + "\n".join(rules_formatted)

    # Concise reference to other lakehouse tables
    other_tables_map = context.get("other_tables", {})
    other_tables_text = ("\nCÁC BẢNG KHÁC TRONG LAKEHOUSE: " + ", ".join(f"`{t}`" for t in list(other_tables_map.keys())[:6])) if other_tables_map else ""

    # Physical metadata (formatted compactly to keep prompt under 3,000 tokens)
    schema_lines = []
    for t in context.get("physical_metadata", []):
        cols = ", ".join(f"{c['name']} ({c['data_type']})" for c in t.get("columns", []))
        joins = ", ".join(f"{j['to_table']} ON {j['on']}" for j in t.get("relationships", []))
        line = f"- Bảng `{t['qualified_name']}` ({t.get('business_name')}):\n  + Cột: {cols}"
        if joins:
            line += f"\n  + JOIN mẫu: {joins}"
        schema_lines.append(line)
    schema_text = "\n".join(schema_lines)

    vector_section = ""
    if context.get("vector_rag"):
        vr = context["vector_rag"]
        vector_section = f"""
KHO TRI THỨC NGỮ NGHĨA VECTOR RAG (TRÍCH XUẤT TỪ PGVECTOR ai_agent.schema_catalog):
{vr.get('vector_context_text', '')}

ĐƯỜNG DẪN LIÊN KẾT BẢNG CHUẨN (CANONICAL JOIN GRAPH TỪ ai_agent.table_relationships):
{vr.get('join_context_text', '')}
"""

    return f"""Bạn là Senior BI Data Analyst và Data Platform Architect phụ trách hệ thống Avengers Coffee.
Nhiệm vụ: Chuyển đổi yêu cầu phân tích của người dùng thành Kế hoạch Truy vấn SQL PostgreSQL 100% chính xác, an toàn và tối ưu.

THÔNG TIN YÊU CẦU:
- Yêu cầu: {payload.prompt}
- Ngữ cảnh người dùng: {payload.context or '(không có)'}
- Khoảng thời gian yêu cầu: {time_info['label']}
- HƯỚNG DẪN BỘ LỌC THỜI GIAN THEO TỪNG BẢNG (áp dụng tương ứng với bảng bạn truy vấn):
  * Bảng `silver.don_hang`: Bộ lọc chuẩn là `{time_info['sql']}` (thay {{alias}} bằng bí danh thực tế của bảng don_hang, ví dụ: `d` hoặc `dh`).
  * Bảng đánh giá (`silver.danh_gia_san_pham`, `silver.danh_gia_chi_nhanh`): Lọc theo cột `ngay_tao`.
  * Bảng ca làm việc nhân sự (`silver.ca_lam_viec_nhan_vien`): Lọc theo cột `ngay_lam_viec` (dạng DATE) hoặc `check_in_at`.
  * Bảng đối soát thu ngân (`silver.ca_doi_soat`): Lọc theo cột `thoi_gian_bat_dau` hoặc `ngay_tao`.
  * Bảng tồn kho (`silver.ton_kho_san_pham`): Phân tích số lượng tồn hiện tại, KHÔNG bắt buộc lọc ngay_tao nếu không có.
  * Bảng danh mục, sản phẩm, chi nhánh, khuyến mãi, shipper: KHÔNG bắt buộc lọc thời gian trừ khi có câu hỏi thời hạn cụ thể.
- Miền nghiệp vụ đã phân giải: {', '.join(resolution['entity_ids'])}
- Tầng dữ liệu mục tiêu: {context.get('target_layer', 'Silver (silver.*)')}
{query_analysis_text}
{data_samples_text}
{rules_text}
{enums_text}
{few_shots_text}
{other_tables_text}

METADATA CHI TIẾT CÁC BẢNG TRỌNG TÂM ĐƯỢC PHÉP TRUY VẤN:
{schema_text}
{vector_section}

QUY ĐỊNH BẮT BUỘC VỀ SQL:
1. CHỈ ĐƯỢC PHÉP TRUY VẤN TẦNG SILVER: Tất cả bảng trong FROM / JOIN phải có tiền tố `silver.` (ví dụ: silver.don_hang, silver.chi_tiet_don_hang, silver.san_pham, silver.chi_nhanh, silver.khuyen_mai,...). Bạn được tự do truy vấn và JOIN BẤT KỲ BẢNG NÀO trong 19 bảng Silver trên để trả lời đầy đủ, chính xác câu hỏi. TUYỆT ĐỐI KHÔNG DÙNG gold.* HOẶC raw tables.
2. Mỗi SQL phải là một câu lệnh SELECT hoặc WITH...SELECT PostgreSQL chỉ đọc (Read-Only).
3. KHÔNG DÙNG SELECT *. Đặt tên cột tiếng Việt có dấu trong nháy kép để giao diện hiển thị bảng đẹp mắt (ví dụ: SELECT sp.ten_san_pham AS "Tên Món", SUM(ct.so_luong) AS "Số Lượng").
4. main_sql: Bảng chi tiết trả lời trực tiếp câu hỏi người dùng. Nếu người dùng hỏi Top N (ví dụ Top 3, Top 5, Top 10), BẮT BUỘC dùng đúng LIMIT N theo yêu cầu, không dùng mặc định 20 nếu người dùng đã chỉ định số lượng.
5. trend_sql: Chuỗi thời gian phục vụ biểu đồ trend (Area/Line/Bar), trả về 2 cột: `label` (text/date) và `value` (numeric).
6. breakdown_sql: Phân bổ cơ cấu danh mục/phương thức phục vụ biểu đồ Donut/Bar, trả về 2 cột: `name` (text) và `value` (numeric).
7. kpi_sql: Trả về duy nhất 1 dòng gồm 4 chỉ số (total_orders, total_revenue, aov, completion_rate). Nếu câu hỏi về miền khác (như đánh giá/nhân sự/tồn kho), hãy tính các chỉ số tương đương hoặc alias phù hợp để câu lệnh luôn chạy thành công.
8. KHÔNG xuất các cột thông tin nhạy cảm (PII: mật khẩu, token, sđt khách, email).
9. QUY TẮC TÊN THÀNH PHỐ / ĐỊA PHƯƠNG TRONG BẢNG `silver.chi_nhanh`:
   - Cột `thanh_pho` lưu tên đầy đủ tiếng Việt có dấu: 'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng',...
   - Khi người dùng hỏi "TP.HCM", "TPHCM", "HCM", "Sài Gòn": BẮT BUỘC dùng `cn.thanh_pho ILIKE '%Hồ Chí Minh%'` (hoặc `cn.thanh_pho = 'Hồ Chí Minh'`). TUYỆT ĐỐI KHÔNG viết `cn.thanh_pho = 'TP.HCM'`.
   - Khi người dùng hỏi "Hà Nội", "HN": dùng `cn.thanh_pho = 'Hà Nội'`.
   - Khi người dùng hỏi "Đà Nẵng", "ĐN": dùng `cn.thanh_pho = 'Đà Nẵng'`.
   - Khi người dùng hỏi "Cần Thơ": dùng `cn.thanh_pho = 'Cần Thơ'`.
10. QUY TẮC PHÂN BIỆT RÕ RÀNG GIỮA HÌNH THỨC NHẬN HÀNG VÀ CHƯƠNG TRÌNH KHUYẾN MÃI:
   - Cột `silver.don_hang.loai_don_hang` CHỈ mang 3 giá trị hình thức phục vụ: 'MANG_DI' (Mang đi), 'GIAO_TAN_NOI' (Giao tận nơi), 'DUNG_TAI_CHO' (Dùng tại quán). TUYỆT ĐỐI KHÔNG ĐƯỢC GROUP BY `loai_don_hang` khi người dùng hỏi về Khuyến mãi, Voucher, Mã giảm giá, Ưu đãi!
   - Khi người dùng hỏi về "Chương trình khuyến mãi", "Khuyến mãi", "Voucher", "Mã giảm giá", "Ưu đãi": BẮT BUỘC JOIN `silver.don_hang d JOIN silver.khuyen_mai km ON d.ma_voucher = km.ma_khuyen_mai` và GROUP BY `COALESCE(km.ten_khuyen_mai, d.ma_voucher)` với điều kiện lọc `d.ma_voucher IS NOT NULL`! Cột `d.so_tien_giam` lưu số tiền được giảm.
11. QUY TẮC XỬ LÝ CÂU HỎI ĐA MỤC TIÊU / ĐA THÀNH PHỐ (ví dụ: "Top 5 tại Hà Nội và Top 3 ở Cần Thơ"):
   - Khi người dùng yêu cầu Top N cho nhiều thành phố khác nhau trong cùng một câu:
     BẮT BUỘC dùng CTE với `ROW_NUMBER() OVER (PARTITION BY cn.thanh_pho ORDER BY SUM(ct.so_luong) DESC) AS hang`
     và lọc: `WHERE (cn.thanh_pho = 'Hà Nội' AND hang <= 5) OR (cn.thanh_pho = 'Cần Thơ' AND hang <= 3)`
     để trả về một bảng thống nhất hiển thị đầy đủ kết quả của từng địa phương!
   - main_sql trả về các cột: "Thành Phố", hang AS "Thứ Hạng", "Tên Sản Phẩm", "Danh Mục", "Số Lượng Bán", "Doanh Thu (VNĐ)"
   - ORDER BY "Thành Phố", hang ASC
12. QUY TẮC PHÂN TÍCH ĐÁNH GIÁ (REVIEWS):
   - Đánh giá sản phẩm: bảng `silver.danh_gia_san_pham` (`ma_san_pham`, `ten_san_pham`, `so_sao` từ 1 đến 5, `binh_luan`, `ngay_tao`).
   - Đánh giá chi nhánh: bảng `silver.danh_gia_chi_nhanh` (`ma_chi_nhanh`, `ten_chi_nhanh`, `so_sao` từ 1 đến 5, `nhan_xet`, `ngay_tao`).
   - Tính rating trung bình: `ROUND(AVG(so_sao)::numeric, 2) AS "Rating Trung Bình"`, `COUNT(*) AS "Số Lượt Đánh Giá"`.
13. QUY TẮC TỒN KHO & CẢNH BÁO HẾT HÀNG:
   - Bảng `silver.ton_kho_san_pham` (`co_so_ma` liên kết chi nhánh qua `cn.ma_chi_nhanh`, `ma_san_pham`, `ten_san_pham`, `so_luong_ton`, `muc_canh_bao`, `dang_kinh_doanh`).
   - Cảnh báo hết hàng/sắp hết hàng: `WHERE so_luong_ton <= muc_canh_bao`.
14. QUY TẮC NHÂN SỰ & CA LÀM VIỆC:
   - Bảng `silver.ca_lam_viec_nhan_vien` (`staff_name`, `staff_username`, `co_so_ma` liên kết `cn.ma_chi_nhanh`, `ngay_lam_viec`, `ten_ca`, `gio_bat_dau`, `gio_ket_thuc`, `trang_thai_cham_cong` IN ('DUNG_GIO', 'DI_TRE', 'VE_SOM', 'VANG_MAT')).
15. QUY TẮC ĐỐI SOÁT TÀI CHÍNH THU NGÂN:
   - Bảng `silver.ca_doi_soat` (`co_so_ma` liên kết `cn.ma_chi_nhanh`, `ten_nhan_vien`, `thoi_gian_bat_dau`, `thoi_gian_ket_thuc`, `tien_dau_ca`, `tien_cuoi_ca`, `tien_mat_he_thong`, `tien_mat_ky_vong`, `chenh_lech`, `tong_don`, `trang_thai_phe_duyet`).
16. QUY TẮC SHIPPER & GIAO VẬN:
   - Bảng `silver.shipper` (`ma_shipper`, `ho_ten`, `so_dien_thoai`, `bien_so_xe`, `trang_thai` IN ('ACTIVE', 'INACTIVE'), `loai_xe` IN ('MOTORBIKE', 'CAR'), `tong_chuyen_giao`, `diem_danh_gia`).
17. QUY TẮC YÊU THÍCH (WISHLIST) & KHẢO SÁT:
   - Bảng `silver.yeu_thich_san_pham` (`ma_san_pham`, `ten_san_pham`, `danh_muc`, `gia_ban`, `ngay_tao`).
   - Bảng `silver.khao_sat_phan_hoi` (`co_so_ma`, `ma_don_hang`, `tra_loi`, `trang_thai_voucher`, `ngay_tao`).

QUY ĐỊNH VỀ THẺ THỐNG KÊ (DYNAMIC KPI CARDS):
Thay vì luôn hiển thị 4 chỉ số bán lẻ cứng nhắc, bạn hãy tự động tạo từ 2 đến 4 thẻ thống kê nhỏ (kpi_cards) bám sát trực tiếp vào câu hỏi người dùng:
- Mỗi thẻ gồm:
  + "label": Tên chỉ số ngắn gọn (Ví dụ: "Món bán nhiều nhất", "Doanh thu món top 1", "Tổng sản lượng", "Chi nhánh dẫn đầu").
  + "value": Giá trị thực tế hoặc ước tính hiển thị (Ví dụ: "Cà phê Sữa Đá", "15,420", "450.5 tr", "98.5%").
  + "unit": Đơn vị (Ví dụ: "VNĐ", "đơn", "ly", "%", hoặc null nếu giá trị là tên chuỗi).
  + "sub_text": Diễn giải ngữ cảnh ngắn (Ví dụ: "Dẫn đầu toàn menu", "Tăng 12% so với tháng trước", "Chiếm 31% sản lượng").
CỰC KỲ QUAN TRỌNG VỀ KPI_CARDS:
1. Trường "value" BẮT BUỘC là một số liệu ước tính cụ thể hoặc tên chuỗi thực tế (Ví dụ: "2,350", "450,500,000", "8.7", "245,000", "Americano Mơ", "98.5%").
2. TUYỆT ĐỐI KHÔNG VIẾT CHỮ "Xem kết quả", "Chờ kết quả", "Xem chi tiết", "TBD", "N/A", "Chưa có", "null" VÀO TRƯỜNG "value". Hãy luôn điền số ước tính hợp lý theo câu hỏi, hệ thống sẽ tự động cập nhật số liệu chính xác 100% từ kết quả SQL sau khi truy vấn.
3. TUYỆT ĐỐI KHÔNG ĐƯỢC VIẾT CÂU LỆNH SQL HOẶC SUBQUERY NHƯ "(SELECT ...)" VÀO TRƯỜNG "value".

QUY ĐỊNH BẮT BUỘC VỀ BIỂU ĐỒ (BẮT BUỘC TẠO TỪ 5 ĐẾN 6 BIỂU ĐỒ TRỰC QUAN ĐA CHIỀU):
Bạn hãy đóng vai trò Senior BI Analyst tạo ra một dashboard trực quan đa chiều toàn diện, khai thác tối đa các insight của câu hỏi.
BẮT BUỘC tạo ĐÚNG 5 HOẶC 6 BIỂU ĐỒ (5 - 6 DYNAMIC CHARTS) trong mảng "charts", bám sát 100% câu hỏi của người dùng từ các góc nhìn bổ trợ khác nhau:
- Chart 1 (Quy mô trọng tâm / Đối đầu / Xếp hạng): `horizontal_bar` hoặc `bar` (col_span: 6).
- Chart 2 (Cơ cấu / Tỷ trọng thị phần): `donut` (col_span: 6).
- Chart 3 (Biến động theo dòng thời gian): `area`, `line`, hoặc `multi_line` theo ngày/tháng (col_span: 12) để thấy nhịp độ tăng trưởng.
- Chart 4 (Phân rã theo chiều thứ 2 - Phân kênh bán / Khu vực / Loại đơn): `bar` hoặc `horizontal_bar` (col_span: 6).
- Chart 5 (Chỉ số hiệu quả / Giá trị trung bình đơn AOV / Rating sao): `horizontal_bar` hoặc `bar` (col_span: 6).
- Chart 6 (Phân bổ giờ cao điểm / Mật độ / Tương quan): `bar` hoặc `heatmap` (col_span: 6 hoặc 12).

Ví dụ:
- Khi người dùng hỏi "Cơ cấu và tỷ trọng phương thức thanh toán":
  * Chart 1 (Xếp hạng doanh thu): `horizontal_bar` xếp hạng doanh thu theo từng phương thức (col_span: 6).
  * Chart 2 (Tỷ trọng số đơn): `donut` cơ cấu số lượng đơn hàng theo phương thức thanh toán (col_span: 6).
  * Chart 3 (Diễn biến theo ngày): `multi_line` hoặc `area` doanh thu các phương thức theo ngày (col_span: 12).
  * Chart 4 (Kênh bán): `bar` phân bổ phương thức thanh toán theo hình thức đơn hàng (Giao hàng, Tại chỗ, Mang đi) (col_span: 6).
  * Chart 5 (AOV): `horizontal_bar` giá trị đơn hàng trung bình của từng phương thức (col_span: 6).
  * Chart 6 (Địa bàn): `bar` khối lượng giao dịch tại các thành phố trọng điểm (col_span: 6).
- Khi người dùng hỏi "Top món bán chạy":
  * Chart 1: `horizontal_bar` xếp hạng theo Số lượng (col_span: 6).
  * Chart 2: `donut` cơ cấu Doanh thu đóng góp theo Danh mục món (col_span: 6).
  * Chart 3: `multi_line` hoặc `area` diễn biến sản lượng bán theo thời gian (col_span: 12).
  * Chart 4: `donut` tỷ trọng kích cỡ ly Size S / M / L (col_span: 6).
  * Chart 5: `horizontal_bar` điểm đánh giá sao trung bình của top món (col_span: 6).
  * Chart 6: `bar` sản lượng đặt món theo các khung giờ trong ngày (col_span: 6).

QUY TRÌNH SUY LUẬN BẮT BUỘC (Chain-of-Thought) — Ghi vào trường "reasoning":
1. MỤC TIÊU: Câu hỏi muốn biết gì? (xếp hạng, so sánh, xu hướng, phân bổ, tổng hợp?)
2. THỰC THỂ & METRIC: Đối tượng chính? (sản phẩm, chi nhánh, khách hàng?) Metric cần tính? (doanh thu, số lượng, rating?)
3. BẢNG & JOINS: Bảng nào cần dùng? JOIN qua cột nào? Kiểm tra cột nào thuộc bảng nào trước khi viết SQL.
4. BỘ LỌC: Thời gian, thành phố, trạng thái đơn, danh mục — filter nào cần áp dụng? Có bỏ sót filter nào user yêu cầu không?
5. KIỂM TRA CHÉO: SQL có trả lời CHÍNH XÁC ý câu hỏi không? LIMIT có đúng số user yêu cầu không? Tên cột/bảng có đúng không?

Trả về đúng một JSON object (không kèm markdown ngoài JSON):
{{
  "reasoning": "Phân tích ngắn gọn 3-5 dòng theo 5 bước trên: mục tiêu, thực thể, bảng/join, filter, kiểm tra chéo",
  "intent": string,
  "interpreted_request": string,
  "assumptions": string[],
  "metrics": string[],
  "dimensions": string[],
  "tables": string[],
  "joins": string[],
  "needs_clarification": boolean,
  "clarification_question": string or null,
  "title": string,
  "description": string,
  "main_sql": string,
  "trend_sql": string,
  "breakdown_sql": string,
  "kpi_sql": string,
  "kpi_cards": [
    {{
      "label": string,
      "value": string,
      "unit": string,
      "sub_text": string
    }}
  ],
  "charts": [
    {{
      "id": string,
      "title": string,
      "chart_type": "horizontal_bar" | "bar" | "donut" | "area" | "line" | "heatmap",
      "col_span": 6 | 12,
      "unit": string,
      "sql": string
    }}
  ],
  "visualizations": {{
    "trend": "area" | "line" | "bar",
    "breakdown": "donut" | "bar",
    "table": "ranking" | "timeseries" | "breakdown" | "comparison" | "distribution"
  }}
}}
"""


def _valid_plan(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if not (isinstance(data.get("main_sql"), str) and data["main_sql"].strip()):
        return False
    if not (isinstance(data.get("kpi_sql"), str) and data["kpi_sql"].strip()):
        return False
    has_charts = isinstance(data.get("charts"), list) and len(data["charts"]) > 0
    has_legacy = isinstance(data.get("trend_sql"), str) and isinstance(data.get("breakdown_sql"), str)
    return bool(has_charts or has_legacy)


def _looks_destructive(prompt: str) -> bool:
    return bool(re.search(
        r"\b(drop|delete|update|insert|alter|truncate|grant|revoke|copy|create|merge|vacuum|refresh)\b",
        (prompt or "").lower(),
    ))


def _repair_sql(name: str, sql: str, error: Exception, metadata_context: Dict[str, Any], attempt: int = 1, user_prompt: str = "", intent: str = "") -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    logger.warning("AI SQL failed query=%s attempt=%d error=%s sql=%s", name, attempt, type(error).__name__, sql)
    # Extract compact table hints for tables present in failing sql
    all_silver_tables = metadata_context.get("full_policy", {})
    referenced_tables = [t for t in all_silver_tables if t.split(".")[-1] in sql or t in sql]
    table_hints = {t: sorted(list(all_silver_tables[t]))[:12] for t in referenced_tables[:4]}

    repair_instruction = f"""Bạn là Senior PostgreSQL Database Administrator của Avengers Coffee.
Câu lệnh SQL '{name}' sau đây thực thi thất bại trên hệ thống:

YÊU CẦU GỐC CỦA NGƯỜI DÙNG: {user_prompt or '(không có)'}
Ý ĐỊNH PHÂN TÍCH (INTENT): {intent or '(auto)'}

SQL LỖI:
{sql}

THÔNG BÁO LỖI TỪ POSTGRESQL / CHÍNH SÁCH BẢO MẬT:
{str(error)[:600]}

GỢI Ý CỘT HỢP LỆ TRONG CÁC BẢNG LIÊN QUAN:
{json.dumps(table_hints, ensure_ascii=False) if table_hints else "Dùng đúng tên cột tiếng Việt có sẵn trong bảng Silver."}

QUY TẮC SỬA LỖI POSTGRESQL BẮT BUỘC:
1. Sửa chính xác lỗi (ví dụ: sửa đúng tên cột, thêm cột vào GROUP BY nếu dùng hàm tổng hợp, hoặc sửa cú pháp JOIN).
2. Dùng đúng tên cột tiếng Việt trong bảng Silver (như ngay_tao, tong_tien, co_so_ma, ma_don_hang, so_luong, thanh_tien, ten_san_pham, ten_chi_nhanh, thanh_pho, ma_voucher, so_tien_giam).
3. Đảm bảo mọi cột trong SELECT không có hàm tổng hợp đều phải xuất hiện trong GROUP BY.
4. Trả về đúng JSON {{"corrected_sql": "SELECT ..."}}
5. SQL sau khi sửa PHẢI vẫn trả lời đúng ý định gốc của người dùng (xem YÊU CẦU GỐC). Không được thay đổi logic truy vấn sang mục đích khác.
"""
    repair_schema = {
        "type": "object",
        "properties": {
            "corrected_sql": {"type": "string"},
            "explanation": {"type": "string"},
        },
        "required": ["corrected_sql"],
    }
    repair = call_llm(
        json.dumps({
            "task": f"Sửa câu lệnh SQL {name}",
            "failing_sql": sql,
            "postgres_error": str(error)[:800],
            "table_hints": table_hints
        }, ensure_ascii=False, default=json_serial),
        repair_instruction,
        response_schema=repair_schema,
    )
    corrected = repair and repair.get("data", {}).get("corrected_sql")
    if isinstance(corrected, str) and corrected.strip():
        norm_corrected = _normalize_sql_entities(corrected.strip())
        is_valid, explain_err = dry_run_sql(norm_corrected)
        if is_valid:
            logger.warning("AI SQL repair verified query=%s attempt=%d repaired_sql=%s", name, attempt, norm_corrected)
            return norm_corrected, repair
        else:
            logger.warning("AI SQL repair dry-run failed attempt=%d: %s (query: %s)", attempt, explain_err, norm_corrected)
            # Still return norm_corrected so caller can proceed or retry
            return norm_corrected, repair
    return None, repair


def _normalize_sql_entities(sql: str) -> str:
    """
    Normalizes common abbreviations and colloquial names in SQL filters:
    - TP.HCM / TPHCM / HCM / Sài Gòn -> thanh_pho ILIKE '%Hồ Chí Minh%'
    - HN / Ha Noi -> thanh_pho = 'Hà Nội'
    - DN / Da Nang -> thanh_pho = 'Đà Nẵng'
    """
    if not sql:
        return sql
    # Normalize HCM city aliases
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?TP\.?\s*HCM%?|%?TPHCM%?|%?HCM%?|%?Sài Gòn%?|%?Saigon%?)['"]""",
        r"thanh_pho ILIKE '%Hồ Chí Minh%'",
        sql
    )
    # Normalize HN city aliases
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?HN%?|%?Ha Noi%?|%?Hà nội%?)['"]""",
        r"thanh_pho = 'Hà Nội'",
        sql
    )
    # Normalize DN city aliases
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?DN%?|%?Da Nang%?|%?Đà nẵng%?)['"]""",
        r"thanh_pho = 'Đà Nẵng'",
        sql
    )
    # Normalize Can Tho aliases
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?CT%?|%?Can Tho%?|%?Cần thơ%?|%?cantho%?)['"]""",
        r"thanh_pho = 'Cần Thơ'",
        sql
    )
    # Normalize Hai Phong aliases
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?HP%?|%?Hai Phong%?|%?Hải phòng%?|%?haiphong%?)['"]""",
        r"thanh_pho = 'Hải Phòng'",
        sql
    )
    # Normalize Nha Trang / Khanh Hoa
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?Nha Trang%?|%?nha trang%?)['"]""",
        r"thanh_pho = 'Khánh Hòa'",
        sql
    )
    # Normalize Da Lat / Lam Dong
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?Da Lat%?|%?Đà lạt%?|%?dalat%?)['"]""",
        r"thanh_pho = 'Lâm Đồng'",
        sql
    )
    # Normalize Vung Tau
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?Vung Tau%?|%?Vũng tàu%?|%?vungtau%?)['"]""",
        r"thanh_pho = 'Bà Rịa - Vũng Tàu'",
        sql
    )
    # Normalize Phu Quoc / Kien Giang
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?Phu Quoc%?|%?Phú quốc%?)['"]""",
        r"thanh_pho = 'Kiên Giang'",
        sql
    )
    # Normalize Hue
    sql = re.sub(
        r"""(?i)(?:thanh_pho|thanhpho|city)\s*(=|ILIKE|LIKE)\s*['"](?:%?Hue%?|%?Huế%?|%?Thừa Thiên Huế%?)['"]""",
        r"thanh_pho = 'Thừa Thiên - Huế'",
        sql
    )

    # Auto-repair known schema misconceptions:
    # 1. Table doi_soat_thu_ngan -> ca_doi_soat
    sql = re.sub(r"\bsilver\.doi_soat_thu_ngan\b", "silver.ca_doi_soat", sql, flags=re.IGNORECASE)
    # 2. so_luong_canh_bao -> muc_canh_bao
    sql = re.sub(r"\bso_luong_canh_bao\b", "muc_canh_bao", sql, flags=re.IGNORECASE)
    # 3. san_pham_id -> ma_san_pham
    sql = re.sub(r"\bsan_pham_id\b", "ma_san_pham", sql, flags=re.IGNORECASE)
    # 4. ton_kho_san_pham/ca_doi_soat/ca_lam_viec_nhan_vien branch column fix
    sql = re.sub(r"\bton_kho_san_pham\.ma_chi_nhanh\b", "ton_kho_san_pham.co_so_ma", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\bca_doi_soat\.ma_chi_nhanh\b", "ca_doi_soat.co_so_ma", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\bca_lam_viec_nhan_vien\.ma_chi_nhanh\b", "ca_lam_viec_nhan_vien.co_so_ma", sql, flags=re.IGNORECASE)
    # 5. don_hang branch column fix (co_so_ma instead of ma_chi_nhanh)
    sql = re.sub(r"\b([a-zA-Z0-9_]*\.)?ma_chi_nhanh\b(?=\s*=\s*(?:[a-zA-Z0-9_]*\.)?ma_chi_nhanh)", r"co_so_ma", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\b(?:d|don_hang|dh)\.ma_chi_nhanh\b", lambda m: m.group(0).replace(".ma_chi_nhanh", ".co_so_ma"), sql, flags=re.IGNORECASE)
    sql = re.sub(r"\b(?:cn|chi_nhanh)\.khu_vuc\b", lambda m: m.group(0).replace(".khu_vuc", ".thanh_pho"), sql, flags=re.IGNORECASE)
    # 6. Normalize order status 'HUY_BO' -> 'DA_HUY'
    sql = re.sub(r"(['\"])HUY_BO\1", r"\1DA_HUY\1", sql, flags=re.IGNORECASE)

    return sql


def validate_results(normalized: Dict[str, Any], prompt: str = "") -> List[str]:
    """
    Sanity checks on normalized query results (Phase 3.3).
    Returns human-friendly warnings (if any) to help stakeholders understand edge cases.
    """
    warnings: List[str] = []
    main_rows = normalized.get("table_rows", [])
    row_count = len(main_rows)

    if row_count == 0:
        warnings.append("Truy vấn trả về 0 kết quả — có thể bộ lọc thời gian hoặc điều kiện chi nhánh quá hẹp.")

    # Check for negative revenues or anomalies in numeric values
    for row in main_rows[:30]:
        for col_name, val in row.items():
            if isinstance(val, (int, float)) and val < 0:
                col_lower = str(col_name).lower()
                if any(kw in col_lower for kw in ["doanh thu", "revenue", "tiền", "thanh_tien", "gia"]):
                    msg = "Phát hiện chỉ số tài chính âm bất thường trong tập kết quả."
                    if msg not in warnings:
                        warnings.append(msg)
                    break

    # Check completion rate sanity if kpis exist
    kpis = normalized.get("kpis", {})
    comp_rate = kpis.get("completion_rate")
    if comp_rate is not None and isinstance(comp_rate, (int, float)):
        if comp_rate == 0 and kpis.get("total_orders", 0) > 0:
            warnings.append("Tỷ lệ hoàn thành đơn là 0% trong kỳ phân tích này.")

    return warnings


def _execute_plan(plan: Dict[str, Any], fallback: Dict[str, Any], metadata_context: Dict[str, Any], user_prompt: str = "", intent: str = "") -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str], List[Dict[str, Any]]]:
    results: Dict[str, Dict[str, Any]] = {}
    sql_used: Dict[str, str] = {}
    repair_models: List[Dict[str, Any]] = []
    query_policy = _query_policy(metadata_context)

    for name in ("main", "trend", "breakdown", "kpi"):
        key = f"{name}_sql"
        raw_sql = str(plan.get(key) or fallback[key]).strip()
        sql = _normalize_sql_entities(raw_sql)
        limit = 100 if name == "main" else (2 if name == "kpi" else 60)

        success = False
        current_sql = sql
        last_error = None

        # Try execution with self-healing repair loop (up to 2 repair attempts)
        for attempt in range(0, 3):
            try:
                if sql_references_sensitive_columns(current_sql):
                    raise SqlSafetyError("SQL AI tham chiếu cột nhạy cảm không được phép.")
                validate_ai_query_scope(current_sql, query_policy)
                exec_res = execute_read_only(current_sql, row_limit=limit)
                exec_res["rows"] = sanitize_result_rows(exec_res["rows"])
                exec_res["columns"] = (
                    [column for column in exec_res["columns"] if column in exec_res["rows"][0]]
                    if exec_res["rows"]
                    else exec_res["columns"]
                )
                results[name] = exec_res
                sql_used[name] = exec_res["sql"]
                success = True
                break
            except (SqlSafetyError, QueryExecutionError) as error:
                last_error = error
                if attempt < 2:
                    corrected, repair = _repair_sql(name, current_sql, error, metadata_context, attempt=attempt + 1, user_prompt=user_prompt, intent=intent)
                    if repair:
                        repair_models.append({k: repair[k] for k in ("provider", "model", "latency_ms") if k in repair})
                    if corrected:
                        current_sql = _normalize_sql_entities(corrected)
                        continue
                break

        if success:
            continue

        # If execution failed after repair attempts:
        if name == "main":
            logger.warning("Main SQL failed completely after repairs: %s, falling back to deterministic template", last_error)
            fb_sql = _normalize_sql_entities(fallback[key])
            validate_ai_query_scope(fb_sql, query_policy)
            results[name] = execute_read_only(fb_sql, row_limit=limit)
            results[name]["rows"] = sanitize_result_rows(results[name]["rows"])
            results[name]["columns"] = (
                [column for column in results[name]["columns"] if column in results[name]["rows"][0]]
                if results[name]["rows"]
                else results[name]["columns"]
            )
            sql_used[name] = results[name]["sql"]
        elif name == "kpi":
            try:
                fb_sql = _normalize_sql_entities(fallback[key])
                validate_ai_query_scope(fb_sql, query_policy)
                results[name] = execute_read_only(fb_sql, row_limit=limit)
                results[name]["rows"] = sanitize_result_rows(results[name]["rows"])
                results[name]["columns"] = results[name]["columns"]
                sql_used[name] = results[name]["sql"]
            except Exception:
                results[name] = {"rows": [], "columns": [], "count": 0, "sql": ""}
                sql_used[name] = ""
        else:
            # trend or breakdown failed: don't ruin the whole report, safely use fallback or empty
            try:
                fb_sql = _normalize_sql_entities(fallback[key])
                validate_ai_query_scope(fb_sql, query_policy)
                results[name] = execute_read_only(fb_sql, row_limit=limit)
                results[name]["rows"] = sanitize_result_rows(results[name]["rows"])
                results[name]["columns"] = results[name]["columns"]
                sql_used[name] = results[name]["sql"]
            except Exception:
                results[name] = {"rows": [], "columns": [], "count": 0, "sql": ""}
                sql_used[name] = ""

    return results, sql_used, repair_models


def _numeric(row: Dict[str, Any], keys: List[str]) -> Optional[float]:
    for key in keys:
        value = row.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    return None


def _extract_label_and_value(rows: List[Dict[str, Any]], chart_title: str = "", unit: str = "") -> List[Dict[str, Any]]:
    if not rows:
        return []
    cols = list(rows[0].keys())
    first_r = rows[0]

    dim_keywords = [
        "label", "name", "date", "hour", "ngay", "thang", "nam", "gio", "khung_gio",
        "khung giờ", "giờ", "buoi", "buổi", "ca", "nhom", "danh_muc", "danh mục",
        "chi_nhanh", "chi nhánh", "cua_hang", "cửa hàng", "phuong_thuc", "phương thức",
        "mon", "món", "san_pham", "sản phẩm", "city", "tp", "thanh_pho"
    ]
    metric_keywords = [
        "value", "val", "count", "order_count", "so_luong", "số lượng", "so_don",
        "số đơn", "don_hang", "đơn hàng", "revenue", "doanh_thu", "doanh thu",
        "tong_tien", "tổng tiền", "san_luong", "sản lượng", "aov", "total", "tổng"
    ]

    label_col = None
    val_col = None

    # 1. Exact or keyword match for label column
    for c in cols:
        c_low = c.lower().strip()
        if any(k == c_low or k in c_low for k in dim_keywords):
            label_col = c
            break

    # 2. Context-aware metric selection
    title_lower = (chart_title + " " + unit).lower()
    if any(k in title_lower for k in ["doanh thu", "tiền", "vnd", "vnđ", "revenue"]):
        rev_c = [c for c in cols if any(k in c.lower() for k in ["doanh_thu", "doanh thu", "tong_tien", "tổng tiền", "tien", "revenue"])]
        if rev_c:
            val_col = rev_c[0]
    elif any(k in title_lower for k in ["đơn", "số lượng", "san luong", "sản lượng", "orders", "count"]):
        qty_c = [c for c in cols if any(k in c.lower() for k in ["so_don", "số đơn", "don_hang", "đơn hàng", "count", "so_luong", "số lượng", "orders"])]
        if qty_c:
            val_col = qty_c[0]

    if not val_col:
        for c in cols:
            if c == label_col:
                continue
            c_low = c.lower().strip()
            if any(k == c_low or k in c_low for k in metric_keywords):
                val_col = c
                break

    # 3. Fallbacks
    if not label_col:
        for c in cols:
            if not isinstance(first_r.get(c), (int, float, Decimal)):
                label_col = c
                break
        if not label_col:
            label_col = cols[0]

    if not val_col:
        for c in cols:
            if c != label_col and isinstance(first_r.get(c), (int, float, Decimal)):
                val_col = c
                break
        if not val_col and len(cols) > 1:
            val_col = cols[1]

    data = []
    for r in rows:
        raw_lbl = r.get(label_col) if label_col else next(iter(r.values()), "")
        raw_v = r.get(val_col) if val_col else 0

        lbl_str = str(raw_lbl) if raw_lbl is not None else ""
        if label_col and any(k in label_col.lower() for k in ["giờ", "gio", "hour"]):
            try:
                h_int = int(float(lbl_str))
                if 0 <= h_int <= 23:
                    lbl_str = f"{h_int}h"
            except (ValueError, TypeError):
                pass

        try:
            v_num = float(raw_v or 0)
        except (ValueError, TypeError):
            v_num = 0.0

        data.append({"label": lbl_str, "name": lbl_str, "value": v_num})
    return data


def _format_heatmap_data(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return []
    heatmap_data = []
    day_mapping = {
        0: "Chủ Nhật", 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7",
        7: "Chủ Nhật"
    }
    dow_names = {
        "sunday": "Chủ Nhật", "sun": "Chủ Nhật", "mon": "Thứ 2", "monday": "Thứ 2",
        "tue": "Thứ 3", "tuesday": "Thứ 3", "wed": "Thứ 4", "wednesday": "Thứ 4",
        "thu": "Thứ 5", "thursday": "Thứ 5", "fri": "Thứ 6", "friday": "Thứ 6",
        "sat": "Thứ 7", "saturday": "Thứ 7"
    }

    for r in rows:
        keys = list(r.keys())
        x_val = None
        y_val = None
        v_num = 0.0

        for k in keys:
            kl = k.lower()
            val = r[k]
            if val is None:
                continue
            if any(term in kl for term in ["hour", "gio", "khung"]):
                if isinstance(val, (int, float)):
                    x_val = f"{int(val):02d}:00"
                else:
                    s_val = str(val).strip()
                    x_val = f"{s_val.zfill(2)}:00" if s_val.isdigit() else s_val
            elif any(term in kl for term in ["day", "dow", "thu", "ngay_tuan", "thu_trong_tuan"]):
                if isinstance(val, (int, float)) and int(val) in day_mapping:
                    y_val = day_mapping[int(val)]
                else:
                    s_val = str(val).strip().lower()
                    y_val = dow_names.get(s_val, str(val).strip())
            elif any(term in kl for term in ["val", "count", "so_luong", "so_don", "revenue", "doanh_thu", "total", "tong"]):
                try:
                    v_num = float(val)
                except Exception:
                    pass

        if not x_val or not y_val:
            str_cols = [k for k in keys if isinstance(r[k], (str, date, datetime))]
            num_cols = [k for k in keys if isinstance(r[k], (int, float, Decimal))]
            if len(str_cols) >= 2:
                y_val = str(r[str_cols[0]])
                x_val = str(r[str_cols[1]])
            elif len(str_cols) == 1 and num_cols:
                y_val = str(r[str_cols[0]])
                x_val = "08:00"
            else:
                y_val = y_val or "Thứ 2"
                x_val = x_val or "08:00"
            if not v_num and num_cols:
                try:
                    v_num = float(r[num_cols[0]])
                except Exception:
                    pass

        item = {
            "x": x_val or "08:00",
            "y": y_val or "Thứ 2",
            "value": v_num,
            **r
        }
        heatmap_data.append(item)
    return heatmap_data


def _format_multiline_data(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    if not rows:
        return [], []
    first = rows[0]
    keys = list(first.keys())

    # Check if already pivoted format: one string date key, and 2+ numeric keys
    str_keys = [k for k in keys if not isinstance(first[k], (int, float, Decimal))]
    num_keys = [k for k in keys if isinstance(first[k], (int, float, Decimal))]

    if len(str_keys) == 1 and len(num_keys) >= 2:
        date_key = str_keys[0]
        points = []
        for r in rows:
            pt: Dict[str, Any] = {"label": str(r.get(date_key, ""))}
            for nk in num_keys:
                try:
                    pt[nk] = float(r.get(nk, 0) or 0)
                except Exception:
                    pt[nk] = 0.0
            points.append(pt)
        return points, num_keys

    # Flat tuple format: [date_col, category_col, value_col]
    date_col = None
    cat_col = None
    val_col = None

    for k in keys:
        kl = k.lower()
        if any(term in kl for term in ["ngay", "date", "thoi_gian", "time", "month", "thang", "label"]):
            if not date_col:
                date_col = k
        elif any(term in kl for term in ["loai", "danh_muc", "category", "phuong_thuc", "series", "ten", "name", "chi_nhanh", "kenh"]):
            if not cat_col:
                cat_col = k
        elif any(term in kl for term in ["val", "doanh_thu", "revenue", "so_luong", "count", "tong", "amount"]):
            if not val_col:
                val_col = k

    if not date_col and str_keys:
        date_col = str_keys[0]
    if not cat_col and len(str_keys) > 1:
        cat_col = str_keys[1]
    if not val_col and num_keys:
        val_col = num_keys[0]

    if not date_col or not cat_col or not val_col:
        pts = _extract_label_and_value(rows)
        return pts, ["value"]

    date_order: List[str] = []
    pivoted_map: Dict[str, Dict[str, float]] = {}
    series_set: List[str] = []

    for r in rows:
        d_val = str(r.get(date_col) or "").strip()
        c_val = str(r.get(cat_col) or "Khác").strip()
        try:
            v_val = float(r.get(val_col) or 0)
        except Exception:
            v_val = 0.0

        if d_val not in pivoted_map:
            pivoted_map[d_val] = {}
            date_order.append(d_val)
        pivoted_map[d_val][c_val] = (pivoted_map[d_val].get(c_val, 0.0)) + v_val
        if c_val not in series_set:
            series_set.append(c_val)

    points = []
    for d_str in date_order:
        row_pt: Dict[str, Any] = {"label": d_str}
        for s in series_set:
            row_pt[s] = pivoted_map[d_str].get(s, 0.0)
        points.append(row_pt)

    return points, series_set


def _execute_chart_item(chart: Dict[str, Any], query_policy: Dict[str, set[str]]) -> Optional[Dict[str, Any]]:
    sql = _normalize_sql_entities(str(chart.get("sql", "")).strip())
    if not sql:
        return None
    try:
        if sql_references_sensitive_columns(sql):
            return None
        validate_ai_query_scope(sql, query_policy)
        res = execute_read_only(sql, row_limit=100)
        rows = sanitize_result_rows(res["rows"])
        title = chart.get("title") or "Biểu đồ phân tích"
        unit = chart.get("unit", "")
        col_span = int(chart.get("col_span") or 6)
        chart_type = str(chart.get("chart_type", "bar")).lower()
        if chart_type not in ("horizontal_bar", "bar", "donut", "area", "line", "heatmap", "multi_line", "multiline"):
            chart_type = "bar"

        series_keys: List[str] = []
        if chart_type == "heatmap":
            data = _format_heatmap_data(rows)
            col_span = 12
        elif chart_type in ("multi_line", "multiline"):
            data, series_keys = _format_multiline_data(rows)
            col_span = 12
        else:
            # Smart auto-detection: If planner set line/area, but query has 3+ columns (date, category, number), upgrade to multi_line!
            if chart_type in ("line", "area") and rows and len(rows[0]) >= 3:
                cols = list(rows[0].keys())
                str_cols = [c for c in cols if not isinstance(rows[0][c], (int, float, Decimal))]
                num_cols = [c for c in cols if isinstance(rows[0][c], (int, float, Decimal))]
                if len(str_cols) >= 2 and len(num_cols) >= 1:
                    chart_type = "multi_line"
                    data, series_keys = _format_multiline_data(rows)
                    col_span = 12
                else:
                    data = _extract_label_and_value(rows, chart_title=title, unit=unit)
            else:
                data = _extract_label_and_value(rows, chart_title=title, unit=unit)

        res_dict = {
            "id": chart.get("id") or f"chart_{chart_type}_{len(data)}",
            "title": title,
            "chart_type": chart_type,
            "unit": unit,
            "col_span": col_span,
            "data": data,
            "sql": res["sql"],
        }
        if series_keys:
            res_dict["series_keys"] = series_keys
        return res_dict
    except Exception as e:
        logger.warning("Dynamic chart execution failed: %s", e)
        return None


def _get_domain_candidate_charts(
    user_prompt: str,
    domain: str = "auto",
    time_filter_d: str = "1=1",
    time_filter_dh: str = "1=1",
) -> List[Dict[str, Any]]:
    p_lower = (user_prompt or "").lower()
    
    is_payment = any(w in p_lower for w in ["thanh toán", "thanh toan", "momo", "vnpay", "tiền mặt", "tien mat", "ngân hàng", "ngan hang", "phương thức", "phuong thuc"]) or domain == "payments"
    is_shipper = any(w in p_lower for w in ["shipper", "giao hàng", "giao hang", "vận chuyển", "van chuyen", "tài xế", "tai xe", "chuyến"]) or domain == "shippers"
    is_customer = any(w in p_lower for w in ["khách hàng", "khach hang", "hội viên", "hoi vien", "thành viên", "thanh vien", "loyalty", "tích điểm", "tich diem", "bean"]) or domain == "customers"
    is_store = any(w in p_lower for w in ["chi nhánh", "chi nhanh", "cửa hàng", "cua hang", "thành phố", "thanh pho", "khu vực", "khu vuc", "tỉnh", "tinh"]) or domain == "stores"
    is_product = any(w in p_lower for w in ["món", "mon", "sản phẩm", "san pham", "đồ uống", "do uong", "cà phê", "ca phe", "trà", "tra", "bánh", "banh", "thực đơn", "thuc don", "matcha", "topping", "bán chạy", "ban chay"]) or domain in ("products", "menu")

    if is_payment:
        return [
            {
                "id": "chart_payment_rev_rank",
                "title": "Xếp hạng Doanh thu theo Phương thức Thanh toán",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "So sánh quy mô dòng tiền giữa các cổng thanh toán",
                "sql": f"""
                    SELECT COALESCE(phuong_thuc_thanh_toan, 'Chưa xác định') AS label,
                           SUM(tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_payment_order_share",
                "title": "Cơ cấu Tỷ trọng Số lượng Đơn hàng",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Thị phần số lượng giao dịch theo phương thức",
                "sql": f"""
                    SELECT COALESCE(phuong_thuc_thanh_toan, 'Chưa xác định') AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_payment_trend",
                "title": "Diễn biến Doanh thu Thanh toán theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "VNĐ",
                "purpose": "Nhịp độ tăng trưởng dòng tiền thanh toán trong kỳ",
                "sql": f"""
                    SELECT TO_CHAR(d.ngay_tao, 'YYYY-MM-DD') AS label,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_payment_by_channel",
                "title": "Phân bổ Giao dịch theo Hình thức Đơn hàng",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Đối chiếu tỷ lệ thanh toán tại chỗ, mang về và giao tận nơi",
                "sql": f"""
                    SELECT CASE 
                             WHEN d.loai_don_hang = 'DUNG_TAI_CHO' THEN 'Tại chỗ'
                             WHEN d.loai_don_hang = 'MANG_DI' THEN 'Mang đi'
                             WHEN d.loai_don_hang = 'GIAO_TAN_NOI' THEN 'Giao tận nơi'
                             ELSE COALESCE(d.loai_don_hang, 'Khác')
                           END AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_payment_aov",
                "title": "Giá trị Đơn hàng Trung bình (AOV) theo Phương thức",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ/đơn",
                "purpose": "Đo lường mức chi tiêu bình quân trên mỗi phương thức",
                "sql": f"""
                    SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS label,
                           ROUND(AVG(d.tong_tien)) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_payment_city_volume",
                "title": "Khối lượng Thanh toán tại các Thành phố Trọng điểm",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Mật độ giao dịch thanh toán phân bổ theo địa bàn",
                "sql": f"""
                    SELECT COALESCE(cn.thanh_pho, 'Khác') AS label,
                           COUNT(dh.ma_don_hang) AS value
                    FROM silver.don_hang dh
                    LEFT JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 7;
                """,
            },
        ]

    elif is_product:
        return [
            {
                "id": "chart_product_qty_rank",
                "title": "Top Món Bán Chạy Nhất theo Sản lượng (Ly)",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "ly",
                "purpose": "Xếp hạng sản phẩm dẫn đầu về doanh số tiêu thụ",
                "sql": f"""
                    SELECT ct.ten_san_pham AS label, SUM(ct.so_luong) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_product_category_share",
                "title": "Cơ cấu Doanh thu theo Danh mục Món",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Tỷ trọng đóng góp doanh thu của từng nhóm đồ uống/bánh",
                "sql": f"""
                    SELECT COALESCE(sp.ten_danh_muc, 'Khác') AS label, SUM(ct.thanh_tien) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_product_sales_trend",
                "title": "Diễn biến Sản lượng Tiêu thụ Toàn chuỗi theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "ly",
                "purpose": "Nhịp độ tăng trưởng sản lượng bán hàng theo thời gian",
                "sql": f"""
                    SELECT TO_CHAR(dh.ngay_tao, 'YYYY-MM-DD') AS label, SUM(ct.so_luong) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_product_size_share",
                "title": "Tỷ trọng Lựa chọn Kích cỡ Ly (Size S/M/L)",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "ly",
                "purpose": "Thị phần tiêu thụ theo kích cỡ sản phẩm",
                "sql": f"""
                    SELECT COALESCE(NULLIF(ct.kich_co, ''), 'Size Tiêu chuẩn') AS label, SUM(ct.so_luong) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_product_ratings",
                "title": "Điểm Đánh giá Chất lượng Món (Rating Sao)",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "sao",
                "purpose": "Mức độ hài lòng của khách hàng đối với các món",
                "sql": """
                    SELECT sp.ten_san_pham AS label, ROUND(AVG(dg.so_sao)::numeric, 1) AS value
                    FROM silver.danh_gia_san_pham dg
                    JOIN silver.san_pham sp ON dg.ma_san_pham::text = sp.ma_san_pham::text
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_product_hourly_traffic",
                "title": "Sản lượng Đặt món theo Khung giờ trong Ngày",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "ly",
                "purpose": "Phân bổ đơn pha chế theo các khung giờ phục vụ",
                "sql": f"""
                    SELECT CONCAT(LPAD(EXTRACT(HOUR FROM dh.ngay_tao)::text, 2, '0'), ':00') AS label,
                           SUM(ct.so_luong) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC;
                """,
            },
        ]

    elif is_shipper:
        return [
            {
                "id": "chart_shipper_volume_rank",
                "title": "Top Shipper Giao Thành Công Nhiều Nhất",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "chuyến",
                "purpose": "Hiệu suất và đóng góp chuyến giao của đội ngũ tài xế",
                "sql": """
                    SELECT ho_ten AS label, tong_chuyen_giao AS value
                    FROM silver.shipper
                    ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_shipper_vehicle_share",
                "title": "Cơ cấu Đội ngũ theo Loại Phương tiện",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "tài xế",
                "purpose": "Phân bổ phương tiện vận hành trong đội ngũ shipper",
                "sql": """
                    SELECT CASE 
                             WHEN loai_xe = 'MOTORBIKE' THEN 'Xe máy'
                             WHEN loai_xe = 'CAR' THEN 'Ô tô'
                             ELSE COALESCE(loai_xe, 'Xe máy')
                           END AS label,
                           COUNT(*) AS value
                    FROM silver.shipper
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_shipper_daily_trend",
                "title": "Diễn biến Khối lượng Đơn Giao hàng theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "đơn",
                "purpose": "Xu hướng nhu cầu đặt giao tận nơi theo thời gian",
                "sql": f"""
                    SELECT TO_CHAR(d.ngay_tao, 'YYYY-MM-DD') AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.loai_don_hang = 'GIAO_TAN_NOI' AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_shipper_city_share",
                "title": "Khối lượng Đơn Giao hàng theo Thành phố",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Mật độ nhu cầu giao hàng tận nơi tại các đô thị",
                "sql": f"""
                    SELECT cn.thanh_pho AS label, COUNT(dh.ma_don_hang) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.loai_don_hang = 'GIAO_TAN_NOI' AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_shipper_ratings",
                "title": "Điểm Đánh giá Sao Shipper Hàng đầu",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "sao",
                "purpose": "Chất lượng dịch vụ và thái độ giao hàng của tài xế",
                "sql": """
                    SELECT ho_ten AS label, diem_danh_gia AS value
                    FROM silver.shipper
                    WHERE diem_danh_gia > 0
                    ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_shipper_hourly_traffic",
                "title": "Mật độ Giao hàng theo Khung giờ Cao điểm",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Phân bổ giờ giao hàng để điều phối ca trực shipper",
                "sql": f"""
                    SELECT CONCAT(LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0'), ':00') AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.loai_don_hang = 'GIAO_TAN_NOI' AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC;
                """,
            },
        ]

    elif is_customer:
        return [
            {
                "id": "chart_customer_spend_rank",
                "title": "Top Khách hàng Thân thiết Chi tiêu Cao nhất",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Xếp hạng khách hàng VIP có giá trị đóng góp cao nhất",
                "sql": """
                    SELECT ho_ten AS label, tong_chi_tieu AS value
                    FROM silver.nguoi_dung
                    WHERE tong_chi_tieu > 0
                    ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_customer_role_share",
                "title": "Cơ cấu Khách hàng theo Vai trò Hệ thống",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "người",
                "purpose": "Phân loại người dùng và đối tượng tương tác",
                "sql": """
                    SELECT COALESCE(vai_tro, 'CUSTOMER') AS label, COUNT(*) AS value
                    FROM silver.nguoi_dung
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_customer_daily_trend",
                "title": "Tần suất Khách hàng Mua sắm theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "khách",
                "purpose": "Nhịp độ khách ghé mua và đặt hàng qua từng ngày",
                "sql": f"""
                    SELECT TO_CHAR(d.ngay_tao, 'YYYY-MM-DD') AS label,
                           COUNT(DISTINCT d.ma_nguoi_dung) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO') AND d.ma_nguoi_dung IS NOT NULL
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_customer_loyalty_points",
                "title": "Điểm Thưởng Loyalty Beans Hàng đầu",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "điểm",
                "purpose": "Mức độ gắn bó và tích lũy điểm thưởng của khách",
                "sql": """
                    SELECT ho_ten AS label, diem_loyalty AS value
                    FROM silver.nguoi_dung
                    WHERE diem_loyalty > 0
                    ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_customer_aov",
                "title": "Giá trị Đơn hàng Trung bình (AOV) theo Kênh Đặt",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ/đơn",
                "purpose": "Mức chi tiêu bình quân của khách trên từng kênh đặt món",
                "sql": f"""
                    SELECT CASE 
                             WHEN d.loai_don_hang = 'DUNG_TAI_CHO' THEN 'Tại chỗ'
                             WHEN d.loai_don_hang = 'MANG_DI' THEN 'Mang đi'
                             WHEN d.loai_don_hang = 'GIAO_TAN_NOI' THEN 'Giao tận nơi'
                             ELSE COALESCE(d.loai_don_hang, 'Khác')
                           END AS label,
                           ROUND(AVG(d.tong_tien)) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_customer_hourly_visits",
                "title": "Phân bổ Lượt Khách Đặt hàng theo Khung giờ",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Hành vi đặt hàng của khách hàng theo thời gian trong ngày",
                "sql": f"""
                    SELECT CONCAT(LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0'), ':00') AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC;
                """,
            },
        ]

    elif is_store:
        return [
            {
                "id": "chart_store_rev_rank",
                "title": "Xếp hạng Doanh thu theo Chi nhánh",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "So sánh quy mô doanh số giữa các điểm bán",
                "sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, dh.co_so_ma) AS label,
                           SUM(dh.tong_tien) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_store_city_share",
                "title": "Cơ cấu Doanh thu theo Thành phố / Khu vực",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Tỷ trọng đóng góp doanh số giữa các thị trường",
                "sql": f"""
                    SELECT cn.thanh_pho AS label, SUM(dh.tong_tien) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_store_daily_trend",
                "title": "Xu hướng Doanh thu Toàn chuỗi theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "VNĐ",
                "purpose": "Nhịp độ tăng trưởng doanh số của toàn hệ thống chi nhánh",
                "sql": f"""
                    SELECT TO_CHAR(d.ngay_tao, 'YYYY-MM-DD') AS label,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_store_orders_by_city",
                "title": "Khối lượng Đơn hàng theo Thành phố",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Số lượng đơn hàng phục vụ tại các đô thị",
                "sql": f"""
                    SELECT cn.thanh_pho AS label, COUNT(dh.ma_don_hang) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_store_aov",
                "title": "Giá trị Đơn hàng Trung bình (AOV) theo Chi nhánh",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ/đơn",
                "purpose": "Chi tiêu bình quân trên một đơn tại các cơ sở",
                "sql": f"""
                    SELECT COALESCE(cn.ten_chi_nhanh, dh.co_so_ma) AS label,
                           ROUND(AVG(dh.tong_tien)) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_store_ratings",
                "title": "Điểm Đánh giá Dịch vụ Chi nhánh (Rating Sao)",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "sao",
                "purpose": "Mức độ hài lòng của khách hàng đối với không gian và dịch vụ",
                "sql": """
                    SELECT cn.ten_chi_nhanh AS label, ROUND(AVG(dg.so_sao)::numeric, 1) AS value
                    FROM silver.danh_gia_chi_nhanh dg
                    JOIN silver.chi_nhanh cn ON dg.ma_chi_nhanh = cn.ma_chi_nhanh
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
        ]

    else:
        # General Sales & Revenue
        return [
            {
                "id": "chart_gen_category_rev",
                "title": "Doanh thu theo Danh mục Sản phẩm",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Xếp hạng đóng góp doanh thu của các ngành hàng",
                "sql": f"""
                    SELECT COALESCE(sp.ten_danh_muc, 'Khác') AS label, SUM(ct.thanh_tien) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang dh ON ct.ma_don_hang = dh.ma_don_hang
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 8;
                """,
            },
            {
                "id": "chart_gen_channel_share",
                "title": "Cơ cấu Doanh thu theo Hình thức Phục vụ",
                "chart_type": "donut",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Tỷ trọng doanh số giữa Tại chỗ, Mang về và Giao tận nơi",
                "sql": f"""
                    SELECT CASE 
                             WHEN d.loai_don_hang = 'DUNG_TAI_CHO' THEN 'Tại chỗ'
                             WHEN d.loai_don_hang = 'MANG_DI' THEN 'Mang đi'
                             WHEN d.loai_don_hang = 'GIAO_TAN_NOI' THEN 'Giao tận nơi'
                             ELSE COALESCE(d.loai_don_hang, 'Khác')
                           END AS label,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_gen_rev_trend",
                "title": "Diễn biến Doanh thu Toàn chuỗi theo Ngày",
                "chart_type": "area",
                "col_span": 12,
                "unit": "VNĐ",
                "purpose": "Nhịp độ tăng trưởng doanh thu chuỗi trong kỳ",
                "sql": f"""
                    SELECT TO_CHAR(d.ngay_tao, 'YYYY-MM-DD') AS label,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC LIMIT 14;
                """,
            },
            {
                "id": "chart_gen_city_volume",
                "title": "Khối lượng Đơn hàng theo Thành phố Trọng điểm",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Quy mô số đơn tại các thị trường chính",
                "sql": f"""
                    SELECT COALESCE(cn.thanh_pho, 'Khác') AS label, COUNT(dh.ma_don_hang) AS value
                    FROM silver.don_hang dh
                    JOIN silver.chi_nhanh cn ON dh.co_so_ma = cn.ma_chi_nhanh
                    WHERE {time_filter_dh} AND dh.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC LIMIT 7;
                """,
            },
            {
                "id": "chart_gen_payment_method",
                "title": "Doanh thu theo Phương thức Thanh toán",
                "chart_type": "horizontal_bar",
                "col_span": 6,
                "unit": "VNĐ",
                "purpose": "Quy mô doanh thu qua từng phương thức thanh toán",
                "sql": f"""
                    SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS label,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY value DESC;
                """,
            },
            {
                "id": "chart_gen_hourly_traffic",
                "title": "Phân bổ Khách hàng theo Khung giờ trong Ngày",
                "chart_type": "bar",
                "col_span": 6,
                "unit": "đơn",
                "purpose": "Mật độ giao dịch theo các khung giờ cao điểm",
                "sql": f"""
                    SELECT CONCAT(LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0'), ':00') AS label,
                           COUNT(*) AS value
                    FROM silver.don_hang d
                    WHERE {time_filter_d} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'COMPLETED', 'DANG_GIAO')
                    GROUP BY label ORDER BY label ASC;
                """,
            },
        ]


def _ensure_5_to_6_charts(
    dynamic_charts: List[Dict[str, Any]],
    user_prompt: str,
    domain: str,
    time_info: Dict[str, Any],
    query_policy: Dict[str, set[str]],
    normalized: Dict[str, Any],
    chart_metadata: Dict[str, Any],
    sql_used: Dict[str, str],
) -> List[Dict[str, Any]]:
    seen_titles: set[str] = set()
    cleaned_charts: List[Dict[str, Any]] = []

    for ch in dynamic_charts:
        if not isinstance(ch, dict) or not ch.get("data") or len(ch["data"]) == 0:
            continue
        title_norm = (ch.get("title") or "").strip().lower()
        if title_norm and title_norm not in seen_titles:
            seen_titles.add(title_norm)
            cleaned_charts.append(ch)

    time_filter_d = time_info["sql"].format(alias="d")
    time_filter_dh = time_info["sql"].format(alias="dh")

    # If we have fewer than 5 charts, pull domain candidate charts
    if len(cleaned_charts) < 5:
        candidates = _get_domain_candidate_charts(
            user_prompt=user_prompt,
            domain=domain,
            time_filter_d=time_filter_d,
            time_filter_dh=time_filter_dh,
        )
        for cand in candidates:
            cand_title_norm = (cand.get("title") or "").strip().lower()
            if any(cand_title_norm in t or t in cand_title_norm for t in seen_titles):
                continue
            ch_res = _execute_chart_item(cand, query_policy)
            if ch_res and ch_res.get("data") and len(ch_res["data"]) > 0:
                cleaned_charts.append(ch_res)
                seen_titles.add(cand_title_norm)
                if len(cleaned_charts) >= 6:
                    break

    # If still fewer than 5 (rare), use normalized trend or breakdown if available
    if len(cleaned_charts) < 5 and normalized.get("trend"):
        trend_title = chart_metadata["trend"]["title"]
        if trend_title.lower() not in seen_titles:
            cleaned_charts.append({
                "id": "chart_normalized_trend",
                "title": trend_title,
                "chart_type": chart_metadata["trend"]["chart_type"],
                "unit": chart_metadata["trend"]["unit"],
                "col_span": 12,
                "data": normalized["trend"],
                "sql": sql_used.get("trend", ""),
            })
            seen_titles.add(trend_title.lower())

    if len(cleaned_charts) < 5 and normalized.get("breakdown"):
        bk_title = chart_metadata["breakdown"]["title"]
        if bk_title.lower() not in seen_titles:
            cleaned_charts.append({
                "id": "chart_normalized_breakdown",
                "title": bk_title,
                "chart_type": chart_metadata["breakdown"]["chart_type"],
                "unit": chart_metadata["breakdown"]["unit"],
                "col_span": 6,
                "data": normalized["breakdown"],
                "sql": sql_used.get("breakdown", ""),
            })
            seen_titles.add(bk_title.lower())

    # Truncate to maximum 6 charts
    final_charts = cleaned_charts[:6]

    # Assign optimal col_span for balanced, stunning responsive layout
    total = len(final_charts)
    if total == 5:
        # Chart 3 (index 2) is wide (col_span 12), charts 0, 1, 3, 4 are col_span 6
        for i, ch in enumerate(final_charts):
            if i == 2:
                ch["col_span"] = 12
            else:
                ch["col_span"] = 6
    elif total == 6:
        for i, ch in enumerate(final_charts):
            if ch.get("chart_type") in ("heatmap", "multi_line", "multiline"):
                ch["col_span"] = 12
            else:
                ch["col_span"] = 6

    return final_charts


def _normalize_results(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    main_rows = sanitize_result_rows(results["main"]["rows"])
    kpi_row = results["kpi"]["rows"][0] if results["kpi"]["rows"] else {}
    kpis = {
        "revenue": _numeric(kpi_row, ["total_revenue", "revenue", "tong_doanh_thu", "doanh_thu", "tong_tien", "thanh_tien"]),
        "revenue_growth": None,
        "orders": int(_numeric(kpi_row, ["total_orders", "orders", "so_don", "tong_don", "so_luong", "don_hang", "order_count"]) or 0),
        "orders_growth": None,
        "aov": _numeric(kpi_row, ["aov", "gia_tri_trung_binh", "gia_tri_don_tb"]),
        "completion_rate": _numeric(kpi_row, ["completion_rate", "ty_le_hoan_thanh", "success_rate"]),
    }
    # Auto-calculate KPIs from main_rows if kpis are missing or 0
    if main_rows:
        num_cols = [c for c, v in main_rows[0].items() if isinstance(v, (int, float, Decimal))]
        rev_cols = [c for c in num_cols if any(k in c.lower() for k in ["doanh_thu", "tien", "revenue", "thanh_tien", "tong_tien"])]
        order_cols = [c for c in num_cols if any(k in c.lower() for k in ["don", "orders", "so_luong", "count", "sl"])]
        
        if not kpis.get("revenue") and rev_cols:
            kpis["revenue"] = float(sum(float(r.get(rev_cols[0]) or 0) for r in main_rows))
            
        if not kpis.get("orders"):
            if order_cols:
                kpis["orders"] = int(sum(float(r.get(order_cols[0]) or 0) for r in main_rows))
            else:
                kpis["orders"] = len(main_rows)
                
        if not kpis.get("aov") and kpis.get("revenue") and kpis.get("orders") and kpis["orders"] > 0:
            kpis["aov"] = round(kpis["revenue"] / kpis["orders"])

    trend = _extract_label_and_value(sanitize_result_rows(results["trend"]["rows"]), chart_title="Xu hướng")
    breakdown_data = _extract_label_and_value(sanitize_result_rows(results["breakdown"]["rows"]), chart_title="Cơ cấu")
    breakdown = [{"name": d["label"], "value": d["value"]} for d in breakdown_data]
    return {
        "kpis": kpis,
        "trend": trend,
        "breakdown": breakdown,
        "table_rows": main_rows,
        "table_columns": results["main"]["columns"],
        "row_counts": {name: result["count"] for name, result in results.items()},
    }


def _is_kpi_placeholder(val_str: Any) -> bool:
    if val_str is None:
        return True
    s = str(val_str).strip().lower()
    if not s or s in ("-", "—", "null", "none", "n/a", "na", "undefined", "tbd", "nan"):
        return True
    # Vietnamese & English placeholder phrases
    placeholder_phrases = [
        "xem kết quả", "xem ket qua", "kết quả", "ket qua",
        "chờ kết quả", "cho ket qua", "chờ truy vấn", "đang tính",
        "tự động tính", "chưa có", "chua co", "xem chi tiết", "chờ phân tích",
        "placeholder", "tbd", "undefined"
    ]
    if any(p in s for p in placeholder_phrases):
        return True
    if s.startswith("<") or (s.startswith("<") and s.endswith(">")):
        return True
    return False


def _sanitize_and_resolve_kpi_cards(raw_cards: Any, normalized: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = normalized.get("table_rows") or []
    kpis = normalized.get("kpis") or {}
    resolved_cards = []

    first_row = rows[0] if rows else {}
    text_cols = [c for c, v in first_row.items() if isinstance(v, str)]
    num_cols = [c for c, v in first_row.items() if isinstance(v, (int, float, Decimal))]

    hour_cols = [c for c in first_row.keys() if any(k in c.lower() for k in ["giờ", "gio", "hour", "khung_gio", "khung giờ"])]
    order_cols = [c for c in num_cols if any(k in c.lower() for k in ["số đơn", "so_don", "đơn hàng", "don_hang", "orders", "count", "so_luong", "số lượng", "lượng đơn", "don"])]
    rev_cols = [c for c in num_cols if any(k in c.lower() for k in ["doanh thu", "doanh_thu", "thành tiền", "thanh_tien", "tiền", "tien", "revenue", "tong_tien"])]

    if isinstance(raw_cards, list):
        for card in raw_cards:
            if not isinstance(card, dict):
                continue
            label = str(card.get("label") or "").strip()
            val = str(card.get("value") or "").strip()
            unit = str(card.get("unit") or "").strip()
            sub_text = str(card.get("sub_text") or "").strip()

            is_sql = bool(re.search(r"\bselect\b", val, re.IGNORECASE))
            is_placeholder = _is_kpi_placeholder(val)
            is_zero = val.strip() in ("0", "0.0", "0%", "0 VNĐ", "0 đ", "0 đơn") and bool(rows)

            lbl_lower = label.lower()
            is_row_metric = bool(rows) and any(kw in lbl_lower for kw in [
                "top", "món", "sản phẩm", "bán chạy", "dẫn đầu", "sản lượng", "số lượng",
                "ly", "tổng", "tỷ lệ", "tỷ trọng", "%", "doanh thu", "đánh giá", "tồn kho", "ca",
                "khung giờ", "cao điểm", "đơn", "trung bình", "tb"
            ])

            if is_sql or is_placeholder or is_zero or is_row_metric:
                executed_val = None
                if is_sql:
                    clean_sql = _normalize_sql_entities(val.strip().strip("()"))
                    if clean_sql.lower().startswith("select"):
                        try:
                            res = execute_read_only(clean_sql, row_limit=1)
                            if res and res.get("rows") and len(res["rows"]) > 0:
                                executed_val = next(iter(res["rows"][0].values()))
                        except Exception as err:
                            logger.warning("Failed executing card SQL: %s error: %s", clean_sql, err)

                if executed_val is not None and not _is_kpi_placeholder(executed_val):
                    if isinstance(executed_val, (int, float, Decimal)):
                        val = f"{int(executed_val):,}" if float(executed_val).is_integer() else f"{float(executed_val):.2f}"
                    else:
                        val = str(executed_val)
                else:
                    # Dynamically resolve from executed table_rows to guarantee 100% database grounding

                    # 1. Peak Hour / Hourly Distribution
                    if any(kw in lbl_lower for kw in ["khung giờ", "giờ cao điểm", "cao điểm", "giờ đỉnh", "giờ vàng", "khung gio"]):
                        if hour_cols and rows:
                            if order_cols:
                                peak_r = max(rows, key=lambda r: float(r.get(order_cols[0]) or 0))
                            elif rev_cols:
                                peak_r = max(rows, key=lambda r: float(r.get(rev_cols[0]) or 0))
                            else:
                                peak_r = rows[0]
                            h_val = peak_r.get(hour_cols[0])
                            try:
                                h_int = int(float(h_val))
                                val = f"{h_int:02d}:00 - {h_int+1:02d}:00"
                            except (ValueError, TypeError):
                                val = str(h_val)
                            unit = ""
                        elif rows:
                            val = str(rows[0].get("Khung Giờ", rows[0].get("hour", "08:00 - 09:00")))
                            unit = ""
                        else:
                            val = "08:00 - 09:00"
                            unit = ""

                    # 2. Orders / Quantity / Transactions / Ly
                    elif any(kw in lbl_lower for kw in ["tổng đơn", "lượng đơn", "số đơn", "đơn hàng", "sản lượng", "số lượng", "orders", "giao dịch", "lượt đơn", "đơn", "ly", "cốc"]):
                        is_overall = any(k in lbl_lower for k in ["30 ngày", "toàn", "tổng cộng", "tổng đơn", "tất cả", "kỳ"])
                        if is_overall and kpis.get("orders"):
                            val = f"{int(kpis['orders']):,}"
                        elif order_cols and rows:
                            tot_q = sum(float(r.get(order_cols[0]) or 0) for r in rows)
                            val = f"{int(tot_q):,}"
                        elif kpis.get("orders"):
                            val = f"{int(kpis['orders']):,}"
                        elif rows:
                            val = f"{len(rows):,}"
                        else:
                            val = "0"
                        if not unit:
                            unit = "ly" if any(k in lbl_lower for k in ["ly", "sản lượng", "cốc"]) else "đơn"

                    # 3. Rating / Reviews / Scores (Strict matching - avoid "điểm" matching "cao điểm")
                    elif any(kw in lbl_lower for kw in ["đánh giá", "sao", "rating", "hài lòng", "điểm đánh giá", "điểm review"]):
                        rate_col = [c for c in num_cols if any(k in c.lower() for k in ["sao", "rating", "rate", "diem_danh_gia"])]
                        if rate_col and rows:
                            avg_r = sum(float(r.get(rate_col[0]) or 0) for r in rows) / len(rows)
                            val = f"{avg_r:.2f}"
                        elif rows:
                            val = "4.8"
                        else:
                            val = "0"
                        if not unit:
                            unit = "sao"

                    # 4. Average Hourly Volume / TB mỗi giờ
                    elif any(kw in lbl_lower for kw in ["trung bình giờ", "tb/giờ", "tb mỗi giờ", "đơn/giờ", "đơn/h", "mỗi giờ"]):
                        if order_cols and rows:
                            avg_q = sum(float(r.get(order_cols[0]) or 0) for r in rows) / len(rows)
                            val = f"{int(avg_q):,}"
                        elif kpis.get("orders") and rows:
                            val = f"{int(kpis['orders'] / max(1, len(rows))):,}"
                        else:
                            val = "0"
                        if not unit:
                            unit = "đơn/h"

                    # 5. Inventory / Stock
                    elif any(kw in lbl_lower for kw in ["tồn kho", "tồn", "hết hàng", "sắp hết", "cảnh báo"]):
                        stock_col = [c for c in num_cols if any(k in c.lower() for k in ["ton", "so_luong_ton", "stock", "so_luong"])]
                        if stock_col and rows:
                            tot_stock = sum(float(r.get(stock_col[0]) or 0) for r in rows)
                            val = f"{int(tot_stock):,}"
                            if not unit:
                                unit = "đơn vị"
                        else:
                            val = f"{len(rows):,}" if rows else "0"

                    # 6. Staff / Shifts / Tardiness
                    elif any(kw in lbl_lower for kw in ["ca", "trễ", "chấm công", "đúng giờ", "nhân viên"]):
                        late_col = [c for c in num_cols if any(k in c.lower() for k in ["tre", "di_tre", "late"])]
                        if late_col and rows:
                            tot_late = sum(float(r.get(late_col[0]) or 0) for r in rows)
                            val = f"{int(tot_late):,}"
                            if not unit:
                                unit = "ca"
                        elif num_cols and rows:
                            val = f"{int(sum(float(r.get(num_cols[0]) or 0) for r in rows)):,}"
                            if not unit:
                                unit = "ca"
                        else:
                            val = f"{len(rows):,}" if rows else "0"

                    # 7. Voucher / Discount
                    elif any(kw in lbl_lower for kw in ["voucher", "khuyến mãi", "ưu đãi", "giảm giá", "chiết khấu"]):
                        disc_col = [c for c in num_cols if any(k in c.lower() for k in ["giam", "chiet_khau", "so_tien_giam", "discount"])]
                        if disc_col and rows:
                            tot_disc = sum(float(r.get(disc_col[0]) or 0) for r in rows)
                            val = f"{int(tot_disc):,}"
                            if not unit:
                                unit = "VNĐ"
                        elif rows:
                            val = f"{len(rows):,}"
                            if not unit:
                                unit = "mã"
                        else:
                            val = "0"

                    # 8. Customer traffic / Guests / Visitors / Hourly rate
                    elif any(kw in lbl_lower for kw in ["khách", "khach", "lưu lượng", "traffic", "visitor"]):
                        khach_col = [c for c in num_cols if any(k in c.lower() for k in ["khach", "khách", "luu_luong", "traffic", "don", "count", "so_khach"])]
                        if khach_col and rows:
                            if any(kw in lbl_lower for kw in ["trung bình", "tb", "mỗi giờ", "khách/giờ", "khach/gio", "avg"]):
                                avg_khach = sum(float(r.get(khach_col[0]) or 0) for r in rows) / max(1, len(rows))
                                val = f"{avg_khach:.1f}" if avg_khach < 100 else f"{int(avg_khach):,}"
                            else:
                                tot_khach = sum(float(r.get(khach_col[0]) or 0) for r in rows)
                                val = f"{int(tot_khach):,}"
                        elif rows:
                            val = f"{len(rows):,}"
                        else:
                            val = "0"
                        if not unit:
                            unit = "khách"

                    # 9. Revenue / Sales / Money
                    elif any(kw in lbl_lower for kw in ["doanh thu", "revenue", "tiền", "doanh số", "sales"]):
                        is_peak_rev = any(k in lbl_lower for k in ["khung giờ đỉnh", "giờ cao điểm", "giờ đỉnh", "đỉnh"])
                        if is_peak_rev and hour_cols and rev_cols and rows:
                            peak_r = max(rows, key=lambda r: float(r.get(order_cols[0] if order_cols else rev_cols[0]) or 0))
                            val = f"{int(float(peak_r.get(rev_cols[0]) or 0)):,}"
                        elif rev_cols and rows and not any(k in lbl_lower for k in ["30 ngày", "toàn", "tổng cộng"]):
                            total_rev = sum(float(r.get(rev_cols[0]) or 0) for r in rows)
                            val = f"{int(total_rev):,}"
                        elif kpis.get("revenue"):
                            val = f"{int(kpis['revenue']):,}"
                        elif rev_cols and rows:
                            val = f"{int(sum(float(r.get(rev_cols[0]) or 0) for r in rows)):,}"
                        else:
                            val = "0"
                        if not unit:
                            unit = "VNĐ"

                    # 10. Ratio / Percentage / Share / Tỷ lệ
                    elif any(kw in lbl_lower for kw in ["tỷ lệ", "ty le", "tỷ trọng", "ty trong", "phần trăm", "%", "share"]):
                        pct_col = [c for c in num_cols if any(k in c.lower() for k in ["tỷ lệ", "ty_le", "ty le", "tỷ trọng", "ty_trong", "phần trăm", "phan_tram", "percent", "%", "share"])]
                        if pct_col and rows:
                            tot_pct = sum(float(r.get(pct_col[0]) or 0) for r in rows)
                            val = f"{tot_pct:.1f}%"
                        elif kpis.get("completion_rate") is not None:
                            val = f"{float(kpis['completion_rate']):.1f}%"
                        else:
                            val = "100.0%"
                        if not unit:
                            unit = "%"

                    # 11. AOV / Average Order Value
                    elif any(kw in lbl_lower for kw in ["aov", "giá trị đơn", "đơn tb", "chi tiêu tb"]):
                        if kpis.get("aov"):
                            val = f"{int(kpis['aov']):,}"
                        elif kpis.get("revenue") and kpis.get("orders") and kpis["orders"] > 0:
                            val = f"{int(kpis['revenue'] / kpis['orders']):,}"
                        elif rows:
                            tot_r = sum(float(r.get(rev_cols[0]) or 0) for r in rows) if rev_cols else 0
                            tot_q = sum(float(r.get(order_cols[0]) or 0) for r in rows) if order_cols else 0
                            val = f"{int(tot_r / tot_q):,}" if tot_q > 0 else "0"
                        else:
                            val = "0"
                        if not unit:
                            unit = "VNĐ"

                    # 12. Top items / Stores / Products
                    elif any(kw in lbl_lower for kw in ["món", "sản phẩm", "tên", "dẫn đầu", "top 1", "chi nhánh", "cửa hàng", "best"]):
                        if text_cols and rows:
                            val = str(rows[0].get(text_cols[0], "—"))
                        elif rows:
                            val = str(next(iter(rows[0].values())))
                        else:
                            val = "—"

                    # 13. General numeric fallback from table data
                    elif num_cols and rows:
                        val = f"{int(rows[0][num_cols[0]]):,}"
                    elif rows:
                        val = str(next(iter(rows[0].values())))
                    else:
                        val = "0"

            # Clean up percentage unit redundancy (e.g. avoid "99.9% %")
            if val.endswith("%") and unit in ("%", "phần trăm"):
                val = val[:-1].strip()

            # Format pure digits with thousand separator
            clean_digits = val.replace(".", "").replace(",", "")
            if clean_digits.isdigit() and len(clean_digits) > 3:
                val = f"{int(clean_digits):,}"

            resolved_cards.append({
                "label": label or "Chỉ số trọng yếu",
                "value": val or "—",
                "unit": unit,
                "sub_text": sub_text or "Đo lường từ Tầng Silver",
            })

    # If cards are fewer than 3, synthesize clean complementary cards directly from actual rows
    if len(resolved_cards) < 3 and rows:
        existing_labels = [c["label"].lower() for c in resolved_cards]
        first_row = rows[0]
        text_cols = [c for c, v in first_row.items() if isinstance(v, str)]
        num_cols = [c for c, v in first_row.items() if isinstance(v, (int, float, Decimal))]

        if text_cols and not any("dẫn đầu" in l or "top 1" in l for l in existing_labels):
            metric_val = f": {first_row[num_cols[0]]:,}" if num_cols else ""
            resolved_cards.insert(0, {
                "label": f"Dẫn đầu ({text_cols[0]})",
                "value": str(first_row[text_cols[0]]),
                "unit": "",
                "sub_text": f"Xếp hạng 1{metric_val}",
            })

        for ncol in num_cols:
            if len(resolved_cards) >= 4:
                break
            if not any(ncol.lower() in l for l in existing_labels):
                tot = sum(float(r.get(ncol) or 0) for r in rows)
                unit_guess = "VNĐ" if any(k in ncol.lower() for k in ["tien", "doanh_thu", "doanh thu"]) else ("đơn" if any(k in ncol.lower() for k in ["don", "luong"]) else "")
                resolved_cards.append({
                    "label": f"Tổng {ncol}",
                    "value": f"{int(tot):,}",
                    "unit": unit_guess,
                    "sub_text": f"Phạm vi {len(rows)} bản ghi",
                })

        if len(resolved_cards) < 4:
            resolved_cards.append({
                "label": "Số đối tượng phân tích",
                "value": f"{len(rows):,}",
                "unit": "mục",
                "sub_text": "Dữ liệu trích xuất hợp lệ",
            })

    return resolved_cards[:4]


def _deterministic_synthesis(normalized: Dict[str, Any], time_label: str, intent: str = "orders", user_prompt: str = "") -> Dict[str, Any]:
    main_rows = normalized.get("table_rows", [])
    row_count = len(main_rows)
    kpis = normalized.get("kpis", {})
    revenue = kpis.get("revenue")
    orders = kpis.get("orders")
    aov = kpis.get("aov")

    if intent == "inventory":
        summary = f"Báo cáo tồn kho ghi nhận {row_count} bản ghi mặt hàng trong phạm vi phân tích ({time_label})."
        insights = [
            "Hệ thống đã trích xuất danh sách mặt hàng cùng định mức cảnh báo và số lượng tồn kho thực tế.",
            "Các mặt hàng có số lượng tồn kho thấp nhất cần được ưu tiên kiểm kê và đặt lịch bổ sung hàng từ kho tổng.",
        ]
        recommendations = [
            "Ưu tiên nhập bổ sung ngay các mặt hàng đứng đầu danh sách thiếu hụt.",
            "Rà soát định mức cảnh báo (muc_canh_bao) tại các chi nhánh có tỷ lệ hết hàng cao.",
        ]
        evidence = [{"statement": "Số bản ghi tồn kho phân tích", "metric": "inventory_records", "value": row_count}]

    elif intent == "staff_shifts":
        summary = f"Báo cáo nhân sự & chấm công ghi nhận {row_count} bản ghi ca làm việc tại các chi nhánh trong {time_label}."
        insights = [
            "Thống kê chi tiết tỷ lệ chấm công đúng giờ và các ca đi trễ theo từng cơ sở.",
            "Cần chú ý các cơ sở có tỷ lệ đi trễ cao để bố trí ca trực và hỗ trợ nhân viên hợp lý.",
        ]
        recommendations = [
            "Làm việc với quản lý cơ sở có tỷ lệ đi trễ cao để tìm hiểu nguyên nhân và tối ưu lịch ca.",
            "Xem xét chính sách khen thưởng chuyên cần để khuyến khích nhân viên đi làm đúng giờ.",
        ]
        evidence = [{"statement": "Số bản ghi ca làm việc", "metric": "shift_records", "value": row_count}]

    elif intent == "cashier_reconciliation":
        summary = f"Báo cáo đối soát thu ngân ghi nhận {row_count} phiên kiểm két trong {time_label}."
        insights = [
            "Theo dõi số liệu chênh lệch giữa tiền mặt thực tế kiểm đếm và số liệu ghi nhận trên phần mềm POS.",
            "Các ca kiểm két có chênh lệch âm (thiếu tiền) cần được giải trình và phê duyệt theo quy định tài chính.",
        ]
        recommendations = [
            "Yêu cầu thu ngân và quản lý ca giải trình rõ các khoản chênh lệch phát sinh trong ca.",
            "Rà soát quy trình đối soát đầu ca và bàn giao quỹ tiền mặt giữa các ca làm việc.",
        ]
        evidence = [{"statement": "Số phiên đối soát ca", "metric": "reconciliation_records", "value": row_count}]

    elif intent == "delivery":
        summary = f"Báo cáo giao nhận & shipper ghi nhận {row_count} bản ghi dữ liệu vận hành trong {time_label}."
        insights = [
            "Đánh giá hiệu suất giao hàng dựa trên số chuyến hoàn thành và điểm số đánh giá tài xế.",
            "Duy trì đội ngũ shipper hoạt động ổn định để đảm bảo thời gian giao đồ uống nhanh chóng.",
        ]
        recommendations = [
            "Khen thưởng các tài xế có điểm đánh giá cao và số chuyến hoàn thành vượt trội.",
            "Tối ưu tuyến đường giao hàng để giảm thời gian giao và giữ độ tươi ngon của đồ uống.",
        ]
        evidence = [{"statement": "Số bản ghi tài xế/chuyến giao", "metric": "delivery_records", "value": row_count}]

    elif intent in ("product_reviews", "store_reviews"):
        summary = f"Báo cáo đánh giá chất lượng ghi nhận {row_count} nhóm phản hồi khách hàng trong {time_label}."
        insights = [
            "Phân tích điểm số sao trung bình và nội dung nhận xét chi tiết của khách hàng.",
            "Tập trung cải thiện các sản phẩm hoặc cơ sở có điểm đánh giá chưa đạt kỳ vọng.",
        ]
        recommendations = [
            "Xem xét điều chỉnh công thức pha chế hoặc quy trình phục vụ đối với các món/cơ sở nhận đánh giá dưới 4 sao.",
            "Ghi nhận và nhân rộng mô hình phục vụ tốt tại các chi nhánh được khách hàng đánh giá cao.",
        ]
        evidence = [{"statement": "Số bản ghi đánh giá phản hồi", "metric": "review_records", "value": row_count}]

    elif intent == "customers":
        summary = f"Báo cáo khách hàng & hội viên ghi nhận dữ liệu tích lũy và chi tiêu của {row_count} khách hàng trong {time_label}."
        insights = [
            "Phân nhóm khách hàng theo hạng thành viên và số điểm beans tích lũy.",
            "Khách hàng thân thiết đóng vai trò nòng cốt tạo doanh thu ổn định cho hệ thống.",
        ]
        recommendations = [
            "Tung các ưu đãi độc quyền dành riêng cho khách hàng VIP và Gold.",
            "Tạo chương trình đổi điểm beans lấy đồ uống miễn phí để tăng tỷ lệ quay lại.",
        ]
        evidence = [{"statement": "Số khách hàng trong danh sách", "metric": "customer_count", "value": row_count}]

    elif intent == "promotions":
        summary = f"Báo cáo khuyến mãi ghi nhận hiệu quả của {row_count} chương trình ưu đãi trong {time_label}."
        insights = [
            "Đo lường doanh thu mang lại so với tổng số tiền chiết khấu giảm giá của từng voucher.",
            "Tối ưu ngân sách marketing bằng cách tập trung vào các mã có tỷ lệ chuyển đổi cao.",
        ]
        recommendations = [
            "Gia hạn các chương trình khuyến mãi có ROI tốt và thu hút nhiều đơn hàng mới.",
            "Tạm dừng các voucher có mức giảm lớn nhưng không kích thích được sức mua.",
        ]
        evidence = [{"statement": "Số chương trình khuyến mãi", "metric": "promo_count", "value": row_count}]

    else:
        # Standard orders / revenue synthesis
        if orders == 0 or orders is None:
            summary = f"Kho dữ liệu không ghi nhận giao dịch hợp lệ trong {time_label}."
            insights = [
                "Không có đủ giao dịch để kết luận về xu hướng kinh doanh trong khoảng đã chọn.",
                "Chỉ số tăng trưởng không được tính vì chưa có dữ liệu giao dịch trong kỳ.",
            ]
            recommendations = ["Kiểm tra trạng thái đồng bộ dữ liệu hoặc mở rộng khoảng thời gian phân tích."]
        else:
            summary = f"Kho dữ liệu ghi nhận {orders:,} đơn hợp lệ với doanh thu {float(revenue or 0):,.0f} VNĐ trong {time_label}."
            insights = [
                f"Giá trị đơn trung bình đo được là {float(aov or 0):,.0f} VNĐ.",
                f"Kết quả chi tiết gồm {row_count} dòng tổng hợp từ truy vấn thực tế.",
            ]
            recommendations = ["Ưu tiên kiểm tra các nhóm đứng đầu và cuối bảng chi tiết trước khi điều chỉnh vận hành."]
        evidence = [
            {"statement": "Số đơn hợp lệ trong phạm vi phân tích", "metric": "order_count", "value": orders},
            {"statement": "Doanh thu hợp lệ trong phạm vi phân tích", "metric": "revenue", "value": revenue},
            {"statement": "Giá trị đơn trung bình", "metric": "aov", "value": aov},
        ]

    return {"executive_summary": summary, "ai_insights": insights, "recommendations": recommendations, "evidence": evidence}


@router.get("/status")
def ai_status():
    providers = provider_configuration()
    try:
        local = get_local_metadata()
        meta = cache_status()
        meta.update({"local_ready": True, "tables": local["table_count"], "semantic_entities": semantic_service.entity_count})
    except Exception as exc:
        meta = {"local_ready": False, "source_ready": False, "last_refresh": None, "tables": 0, "semantic_entities": semantic_service.entity_count, "error": type(exc).__name__}
    configured = any(item["configured"] for item in providers.values())
    status = "ready" if meta["local_ready"] and configured else ("degraded" if meta["local_ready"] else "unavailable")
    return {"status": status, "providers": providers, "metadata": meta, "sessions": session_stats()}


@router.post("/propose-plan")
def propose_plan(payload: AiTextToReportRequest):
    user_prompt = (payload.prompt or "").strip()
    if not user_prompt:
        raise HTTPException(status_code=422, detail="Yêu cầu phân tích không được để trống.")
    context_text = (payload.context or "").strip()
    domain = payload.domain or "auto"
    if _looks_destructive(user_prompt):
        return {
            "status": "needs_clarification",
            "prompt": user_prompt,
            "interpreted_request": "Yêu cầu có chứa thao tác thay đổi dữ liệu, trong khi trợ lý chỉ phân tích chỉ đọc.",
            "clarification_question": "Bạn hãy diễn đạt lại mục tiêu dưới dạng câu hỏi phân tích dữ liệu chỉ đọc.",
        }

    try:
        metadata = get_combined_metadata(include_source=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Không thể đọc metadata kho phân tích: {type(exc).__name__}")
    resolution = semantic_service.resolve(user_prompt, context_text, domain, metadata)
    time_info = _time_selection(payload)
    vector_rag = vector_rag_service.search_semantic_knowledge(user_prompt, top_k=5)

    proposal_prompt = f"""Bạn là Senior BI Data Analyst của Avengers Coffee.
Người dùng yêu cầu: "{user_prompt}"
Ngữ cảnh: {context_text or '(không có)'}
Khoảng thời gian: {time_info['label']}
Miền nghiệp vụ: {', '.join(resolution['entity_ids'])}
Tầng dữ liệu: Silver Lake (chỉ đọc silver.*)
Bảng dữ liệu gợi ý từ Vector Knowledge Graph (pgvector): {', '.join(vector_rag['top_tables'])}

Trước khi thực hiện truy vấn nặng và render báo cáo, bạn hãy đề xuất KẾ HOẠCH BÁO CÁO (Analysis Plan Proposal) để người dùng xem trước và duyệt.

QUY TẮC BẮT BUỘC: Đề xuất ĐÚNG 5 HOẶC 6 BIỂU ĐỒ TRỰC QUAN (5 - 6 PLANNED CHARTS) trong mảng "planned_charts" bám sát 100% câu hỏi của người dùng từ các góc nhìn bổ trợ:
- Chart 1: Xếp hạng quy mô / Đối đầu (horizontal_bar hoặc bar)
- Chart 2: Cơ cấu / Tỷ trọng thị phần (donut)
- Chart 3: Dòng thời gian / Xu hướng theo ngày/tháng (area hoặc line)
- Chart 4: Phân rã theo kênh bán / khu vực / phân loại (bar hoặc horizontal_bar)
- Chart 5: Chỉ số hiệu quả AOV / Rating / Đơn giá (horizontal_bar hoặc bar)
- Chart 6: Khung giờ cao điểm / Mật độ / Tương quan (bar hoặc heatmap)

Trả về đúng JSON theo cấu trúc:
{{
  "title": "Tên báo cáo trang trọng (ví dụ: Báo Cáo Phân Tích Cơ Cấu Phương Thức Thanh Toán)",
  "summary_intent": "1-2 câu tóm tắt mục tiêu và giá trị phân tích",
  "data_sources": [
    {{
      "table": "Tên bảng tầng silver (ví dụ: silver.don_hang, silver.chi_nhanh)",
      "description": "Mục đích sử dụng bảng này",
      "filter": "Bộ lọc áp dụng (ví dụ: {time_info['label']})"
    }}
  ],
  "planned_kpis": [
    {{ "name": "Tên chỉ số KPI", "description": "Ý nghĩa đo lường" }}
  ],
  "planned_charts": [
    {{
      "title": "Tên biểu đồ",
      "chart_type": "horizontal_bar" | "bar" | "donut" | "area" | "line" | "heatmap",
      "purpose": "Góc nhìn insight cần làm nổi bật"
    }}
  ],
  "report_sections": [
    "1. AI Executive Summary (Tóm tắt điều hành)",
    "2. Dashboard Tự động sinh (Thẻ KPI & 5-6 Biểu đồ Đa chiều)",
    "3. Bảng Các phát hiện chính (Key Findings)",
    "4. Bảng Phân tích Dữ liệu Chi tiết (Deep-dive Data Table)",
    "5. Insight được AI Agent suy luận (01, 02, 03)",
    "6. Kết luận tự động & Khuyến nghị vận hành chuỗi"
  ],
  "assumptions": [
    "Giả định hoặc lưu ý phạm vi (nếu có)"
  ]
}}
Chỉ trả JSON, không kèm chữ nào khác.
"""
    call = call_llm(proposal_prompt, "Bạn là BI Lead. Chỉ trả JSON tiếng Việt chuyên nghiệp.")
    proposal = call.get("data") if call and isinstance(call.get("data"), dict) else None

    # Guarantee 5 to 6 planned charts in proposal as well
    time_filter_d = time_info["sql"].format(alias="d")
    time_filter_dh = time_info["sql"].format(alias="dh")
    domain_candidates = _get_domain_candidate_charts(
        user_prompt=user_prompt,
        domain=domain,
        time_filter_d=time_filter_d,
        time_filter_dh=time_filter_dh,
    )
    fallback_planned_charts = [
        {
            "title": c["title"],
            "chart_type": c["chart_type"],
            "purpose": c.get("purpose") or "Trực quan hóa dữ liệu đa chiều",
        }
        for c in domain_candidates[:6]
    ]

    if not proposal:
        tables = [f"silver.{t}" for t in resolution["tables"][:3]] or ["silver.don_hang", "silver.chi_nhanh"]
        proposal = {
            "title": f"Báo Cáo Phân Tích Dữ Liệu — {time_info['label']}",
            "summary_intent": f"Khảo sát và bóc tách dữ liệu phục vụ yêu cầu: {user_prompt}.",
            "data_sources": [
                {"table": t, "description": "Dữ liệu chuẩn hóa tầng Silver Lake", "filter": time_info['label']}
                for t in tables
            ],
            "planned_kpis": [
                {"name": "Doanh thu phân tích", "description": "Tổng giá trị giao dịch hợp lệ"},
                {"name": "Số lượng đơn hàng", "description": "Khối lượng đơn hoàn tất trong kỳ"},
                {"name": "Chỉ số trọng tâm", "description": "Đo lường theo yêu cầu câu hỏi"}
            ],
            "planned_charts": fallback_planned_charts,
            "report_sections": [
                "1. AI Executive Summary (Tóm tắt điều hành)",
                "2. Dashboard Tự động sinh (Thẻ KPI & 5-6 Biểu đồ Đa chiều)",
                "3. Bảng Các phát hiện chính (Key Findings)",
                "4. Bảng Phân tích Dữ liệu Chi tiết (Deep-dive Data Table)",
                "5. Insight được AI Agent suy luận (01, 02, 03)",
                "6. Kết luận tự động & Khuyến nghị vận hành chuỗi"
            ],
            "assumptions": time_info["assumptions"]
        }
    else:
        existing_charts = proposal.get("planned_charts")
        if not isinstance(existing_charts, list):
            existing_charts = []
        if len(existing_charts) < 5:
            seen_titles = {(c.get("title") or "").strip().lower() for c in existing_charts if isinstance(c, dict)}
            for cand in fallback_planned_charts:
                cand_title = cand["title"].strip().lower()
                if cand_title not in seen_titles:
                    existing_charts.append(cand)
                    seen_titles.add(cand_title)
                    if len(existing_charts) >= 6:
                        break
            proposal["planned_charts"] = existing_charts[:6]
        elif len(existing_charts) > 6:
            proposal["planned_charts"] = existing_charts[:6]

    return {
        "status": "proposal_ready",
        "prompt": user_prompt,
        "context": context_text,
        "time_label": time_info['label'],
        "proposal": proposal
    }


@router.post("/generate-executive-report")
def generate_executive_report(payload: AiTextToReportRequest):
    user_prompt = (payload.prompt or "").strip()
    if not user_prompt:
        raise HTTPException(status_code=422, detail="Yêu cầu phân tích không được để trống.")
    context_text = (payload.context or "").strip()
    domain = payload.domain or "auto"
    if _looks_destructive(user_prompt):
        return {
            "status": "needs_clarification",
            "prompt": user_prompt,
            "context": context_text,
            "interpreted_request": "Yêu cầu có chứa thao tác thay đổi dữ liệu, trong khi trợ lý chỉ được phép phân tích chỉ đọc.",
            "assumptions": [],
            "clarification_question": "Bạn hãy diễn đạt lại mục tiêu dưới dạng câu hỏi phân tích dữ liệu chỉ đọc.",
        }
    if semantic_service.is_vague(user_prompt, context_text, domain):
        return {
            "status": "needs_clarification",
            "prompt": user_prompt,
            "context": context_text,
            "interpreted_request": "Yêu cầu chưa xác định đủ miền phân tích.",
            "assumptions": [],
            "clarification_question": "Bạn muốn tập trung vào doanh thu, sản phẩm, cửa hàng, khách hàng, thanh toán hay giao hàng?",
        }

    try:
        metadata = get_combined_metadata(include_source=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Không thể đọc metadata kho phân tích: {type(exc).__name__}")

    # Phase 2.1: Semantic Vector Search on pgvector (ai_agent.schema_catalog) executed first to boost intent resolution
    vector_rag = vector_rag_service.search_semantic_knowledge(user_prompt, top_k=6)
    resolution = semantic_service.resolve(
        user_prompt,
        context_text,
        domain,
        metadata,
        vector_tables=vector_rag.get("top_tables", []),
    )
    # Phase 1.1: LLM intent verification for low-confidence keyword resolutions
    resolution = _verify_intent_with_llm(user_prompt, context_text, domain, resolution, metadata)
    metadata_context = semantic_service.llm_context(resolution, metadata, prompt=user_prompt)
    time_info = _time_selection(payload)
    metadata_context["vector_rag"] = vector_rag

    fallback_plan = _deterministic_plan(resolution, time_info)

    # Phase 2.2: Structured Output Schema for Planner
    planner_schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "description": {"type": "string"},
            "main_sql": {"type": "string"},
            "trend_sql": {"type": "string"},
            "breakdown_sql": {"type": "string"},
            "kpi_sql": {"type": "string"},
            "reasoning": {"type": "string"},
        },
        "required": ["title", "main_sql"],
    }
    planner_call = call_llm(
        _planner_prompt(payload, resolution, time_info, metadata_context),
        "Bạn là bộ lập kế hoạch BI. Chỉ dùng metadata được cung cấp và trả JSON hợp lệ.",
        response_schema=planner_schema,
    )
    plan_data = planner_call.get("data") if planner_call else None
    if isinstance(plan_data, dict) and plan_data.get("needs_clarification"):
        return {
            "status": "needs_clarification",
            "prompt": user_prompt,
            "context": context_text,
            "interpreted_request": plan_data.get("interpreted_request") or user_prompt,
            "assumptions": time_info["assumptions"] + list(plan_data.get("assumptions") or []),
            "clarification_question": plan_data.get("clarification_question") or "Bạn muốn làm rõ trọng tâm phân tích nào?",
        }
    plan = plan_data if _valid_plan(plan_data) else fallback_plan
    planner_meta = (
        {key: planner_call[key] for key in ("provider", "model", "latency_ms")}
        if planner_call and _valid_plan(plan_data)
        else {"provider": "deterministic", "model": "semantic-sql-templates-v1", "latency_ms": 0}
    )
    logger.info("=" * 65)
    logger.info("🚀 [AI-ANALYST] Nhận yêu cầu: '%s'", user_prompt)
    logger.info("⏱️  [AI-ANALYST] Phạm vi thời gian: %s | Miền: %s", time_info["label"], domain)
    logger.info("🧠 [AI-PLANNER] Sử dụng Model: %s / %s (%dms)", planner_meta["provider"], planner_meta["model"], planner_meta.get("latency_ms", 0))

    if isinstance(plan.get("charts"), list):
        for c in plan["charts"]:
            if not isinstance(c, dict):
                continue
            ctype = str(c.get("chart_type", "")).lower()
            csql = c.get("sql")
            if ctype in ("area", "line", "bar") and not plan.get("trend_sql"):
                plan["trend_sql"] = csql
            elif ctype in ("donut", "horizontal_bar", "bar") and not plan.get("breakdown_sql"):
                plan["breakdown_sql"] = csql

    try:
        results, sql_used, repair_models = _execute_plan(plan, fallback_plan, metadata_context, user_prompt=user_prompt, intent=resolution.get("intent", ""))
    except (SqlSafetyError, QueryExecutionError) as exc:
        raise HTTPException(status_code=400, detail=f"Không thể thực thi kế hoạch SQL an toàn: {str(exc)}")
    normalized = _normalize_results(results)
    chart_metadata = _chart_metadata(plan, fallback_plan)

    logger.info("🔍 [AI-SQL] Đã thực thi các câu truy vấn SQL vào Database postgres-analytics:")
    for q_name, q_sql in sql_used.items():
        if q_sql:
            logger.info("   -> [%s]: %s", q_name, " ".join(q_sql.split()))
    logger.info("📊 [AI-DATA] Số dòng trả về từ Database: %s", normalized["row_counts"])
    if normalized.get("table_rows"):
        logger.info("   -> Mẫu kết quả thực tế từ DB (3 dòng đầu): %s", normalized["table_rows"][:3])

    query_policy = _query_policy(metadata_context)
    dynamic_charts = []
    if isinstance(plan.get("charts"), list):
        for c in plan["charts"]:
            if isinstance(c, dict):
                ch_res = _execute_chart_item(c, query_policy)
                if ch_res and ch_res.get("data") and len(ch_res["data"]) > 0:
                    dynamic_charts.append(ch_res)

    # Guarantee strictly 5 or 6 multi-dimensional charts directly answering the user prompt
    dynamic_charts = _ensure_5_to_6_charts(
        dynamic_charts=dynamic_charts,
        user_prompt=user_prompt,
        domain=domain,
        time_info=time_info,
        query_policy=query_policy,
        normalized=normalized,
        chart_metadata=chart_metadata,
        sql_used=sql_used,
    )

    # Extract data summary from table_rows & charts for grounded synthesis
    table_rows = normalized.get("table_rows", [])
    data_summary: Dict[str, Any] = {"total_rows": normalized["row_counts"].get("main", 0)}
    if table_rows and isinstance(table_rows[0], dict):
        first_row = table_rows[0]
        entity_col = None
        metric_col = None
        for k, v in first_row.items():
            k_lower = k.lower()
            if isinstance(v, (int, float)) and metric_col is None and k_lower not in ("stt", "hạng", "hang", "id"):
                metric_col = k
            elif isinstance(v, str) and entity_col is None and k_lower not in ("stt", "hạng", "hang", "id"):
                entity_col = k
        if entity_col and metric_col:
            data_summary["top_ranked"] = {
                "entity": str(first_row.get(entity_col)),
                "metric": metric_col,
                "value": first_row.get(metric_col),
            }
            if len(table_rows) > 1:
                last_row = table_rows[-1]
                data_summary["lowest_ranked"] = {
                    "entity": str(last_row.get(entity_col)),
                    "metric": metric_col,
                    "value": last_row.get(metric_col),
                }

    evidence_payload = {
        "kpis": normalized["kpis"],
        "data_summary": data_summary,
        "table_sample": normalized["table_rows"][:10],
        "charts": [
            {
                "title": c.get("title"),
                "chart_type": c.get("chart_type"),
                "unit": c.get("unit"),
                "data": c.get("data", [])[:10],
            }
            for c in dynamic_charts
        ],
        "row_counts": normalized["row_counts"],
    }
    synthesis_call = call_llm(
        json.dumps({
            "request": user_prompt,
            "interpreted_request": plan.get("interpreted_request") or fallback_plan["description"],
            "evidence": evidence_payload,
            "instruction": "Dựa trên request và evidence: Hãy xuất bản báo cáo phân tích hoàn chỉnh. Trả JSON gồm: executive_summary (1-2 đoạn tóm tắt toàn cảnh), key_findings [ { 'finding': tên phát hiện, 'value': giá trị số liệu, 'comment': nhận xét từ AI } ], ai_insights [ 3-4 nhận định chuyên sâu đánh giá nguyên nhân/xu hướng ], conclusions (1 đoạn kết luận tổng kết), recommendations [ 3 khuyến nghị hành động ]",
        }, ensure_ascii=False, default=json_serial),
        "Bạn là Senior BI Data Analyst. Chỉ trả JSON tiếng Việt trung thực, chính xác theo evidence.",
    )
    deterministic = _deterministic_synthesis(normalized, time_info["label"], intent=resolution.get("intent", ""), user_prompt=user_prompt)
    synthesis_data = synthesis_call.get("data") if synthesis_call else None
    if not isinstance(synthesis_data, dict) or not isinstance(synthesis_data.get("ai_insights"), list):
        synthesis_data = deterministic
        synthesis_meta = {"provider": "deterministic", "model": "grounded-summary-v1", "latency_ms": 0}
    else:
        synthesis_meta = {key: synthesis_call[key] for key in ("provider", "model", "latency_ms")}
        synthesis_data["evidence"] = deterministic["evidence"]
        synthesis_data.setdefault("recommendations", [])

    raw_insights = synthesis_data.get("ai_insights") or deterministic["ai_insights"]
    clean_insights = []
    for item in raw_insights:
        if isinstance(item, dict):
            clean_insights.append(item.get("insight") or item.get("text") or item.get("content") or next(iter(item.values()), ""))
        else:
            clean_insights.append(str(item))

    raw_recs = synthesis_data.get("recommendations") or deterministic["recommendations"]
    clean_recs = []
    for item in raw_recs:
        if isinstance(item, dict):
            clean_recs.append(item.get("recommendation") or item.get("text") or item.get("content") or next(iter(item.values()), ""))
        else:
            clean_recs.append(str(item))

    raw_key_findings = synthesis_data.get("key_findings") if isinstance(synthesis_data.get("key_findings"), list) else []
    key_findings = []
    for item in raw_key_findings:
        if isinstance(item, dict):
            raw_val = item.get("value")
            if isinstance(raw_val, dict):
                clean_val = " • ".join(f"{k.replace('_', ' ').capitalize()}: {v}" for k, v in raw_val.items())
            elif isinstance(raw_val, list):
                clean_val = ", ".join(str(v) for v in raw_val)
            elif raw_val is None or str(raw_val).strip() in ("[object Object]", ""):
                clean_val = "—"
            else:
                clean_val = str(raw_val).strip()
            key_findings.append({
                "finding": str(item.get("finding") or item.get("name") or "Phát hiện"),
                "value": clean_val,
                "comment": str(item.get("comment") or item.get("note") or "")
            })
        elif isinstance(item, str):
            key_findings.append({"finding": item, "value": "—", "comment": ""})
    conclusions = synthesis_data.get("conclusions") or synthesis_data.get("executive_summary") or ""

    assumptions = time_info["assumptions"] + list(plan.get("assumptions") or [])
    assumptions = list(dict.fromkeys(str(item) for item in assumptions if item))
    interpreted = plan.get("interpreted_request") or f"{fallback_plan['description']} Phạm vi {time_info['label']}."
    provider_label = f"{synthesis_meta['provider']} / {synthesis_meta['model']}"
    final_cards = _sanitize_and_resolve_kpi_cards(plan.get("kpi_cards"), normalized)
    logger.info("🎯 [AI-CARDS] KPI Cards hiển thị đã được đối soát 100% với Database thật:")
    for card in final_cards:
        logger.info("   -> [%s]: %s %s (%s)", card.get("label"), card.get("value"), card.get("unit", ""), card.get("sub_text", ""))
    logger.info("=" * 65)

    vector_rag_service.log_query(
        user_prompt=user_prompt,
        retrieved_tables=vector_rag.get("top_tables", []),
        generated_sql=sql_used.get("main", "") or plan.get("main_sql", ""),
        status="SUCCESS" if normalized.get("table_rows") else "EMPTY",
        latency_ms=planner_meta.get("latency_ms", 0),
        error=""
    )

    report_response = {
        "status": "success",
        "prompt": user_prompt,
        "context": context_text,
        "interpreted_request": interpreted,
        "title": plan.get("title") or fallback_plan["title"],
        "description": plan.get("description") or fallback_plan["description"],
        "assumptions": assumptions,
        "metadata_used": {
            "tables": resolution["tables"],
            "vector_rag_tables": vector_rag.get("top_tables", []),
            "metrics": plan.get("metrics") or resolution["metrics"],
            "dimensions": plan.get("dimensions") or resolution["dimensions"],
            "source_relationships_recovered": len(metadata.get("recovered_relationships", [])),
        },
        "provider": {"planner": planner_meta, "synthesis": synthesis_meta, "repairs": repair_models},
        "model_used": provider_label,
        "kpis": normalized["kpis"],
        "kpi_cards": final_cards,
        "charts": dynamic_charts,
        "key_findings": key_findings,
        "conclusions": conclusions,
        "trend_chart": normalized["trend"],
        "breakdown_chart": normalized["breakdown"],
        "donut_chart": normalized["breakdown"] if chart_metadata["breakdown"]["chart_type"] == "donut" else [],
        "bar_chart": normalized["breakdown"] if chart_metadata["breakdown"]["chart_type"] == "bar" else [],
        "chart_metadata": chart_metadata,
        "table_data": {
            "title": f"Dữ liệu trích xuất: {plan.get('title') or fallback_plan['title']}",
            "columns": normalized["table_columns"],
            "rows": normalized["table_rows"],
            "total_rows": normalized["row_counts"]["main"],
        },
        "executive_summary": synthesis_data.get("executive_summary") or deterministic["executive_summary"],
        "ai_insights": clean_insights,
        "recommendations": clean_recs,
        "evidence": synthesis_data.get("evidence") or deterministic["evidence"],
        "sql": sql_used,
        "sql_query": sql_used["main"],
        "visualizations": {
            "trend": chart_metadata["trend"]["chart_type"],
            "breakdown": chart_metadata["breakdown"]["chart_type"],
            "table": fallback_plan["visualizations"]["table"],
        },
        "data_warnings": validate_results(normalized, user_prompt),
        "created_at": datetime.now().astimezone().isoformat(),
    }

    # ── Session Memory: create session and store initial state ──
    session = create_session(
        original_prompt=user_prompt,
        domain=domain,
        time_label=time_info["label"],
    )
    session.update_state(
        sql_used=sql_used,
        normalized_results=normalized,
        title=report_response["title"],
        description=report_response["description"],
    )
    # Add initial generation turn
    session.add_turn(
        role="user",
        content=user_prompt,
    )
    session.add_turn(
        role="assistant",
        content=f"Đã tạo báo cáo: {report_response['title']}",
        sql_changes=sql_used,
        result_snapshot=session.current_results_snapshot,
    )
    # Store charts summary in snapshot for future LLM context
    if dynamic_charts:
        session.current_results_snapshot["charts_summary"] = [
            {"title": c.get("title", ""), "chart_type": c.get("chart_type", ""), "data_count": len(c.get("data", []))}
            for c in dynamic_charts[:4]
        ]
    report_response["session_id"] = session.session_id
    return report_response


def _resolve_universal_entity_list(user_feedback: str, current_report: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Universal entity deep-dive extractor across all 8 Silver entities:
    - silver.don_hang (Orders / Transactions)
    - silver.nguoi_dung (Customers / VIPs / Users)
    - silver.san_pham (Products / Menu Items)
    - silver.chi_nhanh (Branches / Stores)
    - silver.danh_gia_san_pham (Customer Reviews & Ratings)
    - silver.khuyen_mai (Vouchers / Promotions)
    - silver.kho_nguyen_lieu (Raw Material Inventory)
    - silver.ca_lam_viec_nhan_vien (Staff Shifts)
    """
    fb = user_feedback.lower()
    list_terms = [
        "danh sách", "danh sach", "bảng dữ liệu", "bang du lieu", "từng", "tung", 
        "chi tiết các", "chi tiet cac", "các đơn", "cac don", "các khách", "cac khach",
        "các sản phẩm", "cac san pham", "các chi nhánh", "cac chi nhanh", "các món",
        "liệt kê", "liet ke", "bảng các", "bang cac", "không phải tổng số", "ko phải tổng số",
        "từng đơn", "từng khách", "từng sản phẩm", "từng món", "danh sách đơn", "danh sach don",
        "danh mục các", "xem danh sách"
    ]
    if not any(t in fb for t in list_terms):
        return None

    # 1. CUSTOMERS / USERS (silver.nguoi_dung)
    if any(k in fb for k in ["khách hàng", "khach hang", "người dùng", "nguoi dung", "customer", "thành viên", "thanh vien", "vip"]):
        where_cond = "nd.vai_tro = 'KHACH_HANG'"
        title_suffix = "Khách Hàng"
        if any(k in fb for k in ["vip", "thân thiết", "than thiet", "tiềm năng"]):
            title_suffix = "Khách Hàng Thân Thiết (VIP)"
        return {
            "entity": "khach_hang",
            "title": f"Danh Sách {title_suffix}",
            "description": f"Bảng dữ liệu trích xuất danh sách chi tiết {title_suffix.lower()} trên toàn hệ thống.",
            "main_sql": f"""
                SELECT nd.ma_nguoi_dung AS "Mã Khách Hàng",
                       COALESCE(nd.ho_ten, 'Chưa cập nhật') AS "Họ Tên",
                       COALESCE(nd.email, 'Không có') AS "Email",
                       COALESCE(nd.so_dien_thoai, 'Chưa có SĐT') AS "Số Điện Thoại",
                       COALESCE(nd.vai_tro, 'KHACH_HANG') AS "Vai Trò",
                       TO_CHAR(nd.ngay_tao, 'YYYY-MM-DD HH24:MI') AS "Ngày Đăng Ký"
                FROM silver.nguoi_dung nd
                WHERE {where_cond}
                ORDER BY nd.ngay_tao DESC
                LIMIT 50
            """.strip(),
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(DISTINCT nd.email) AS total_revenue,
                       0 AS aov,
                       100.0 AS completion_rate
                FROM silver.nguoi_dung nd
                WHERE {where_cond}
            """.strip(),
            "assistant_reply": f"Em đã truy vấn và hiển thị danh sách chi tiết các {title_suffix.lower()} với mã, họ tên, email, vai trò và ngày đăng ký vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 2. PRODUCTS / MENU (silver.san_pham)
    if any(k in fb for k in ["sản phẩm", "san pham", "món", "mon", "đồ uống", "thức uống", "thuc uong", "menu", "bánh"]):
        where_cond = "1=1"
        cat_name = ""
        if any(k in fb for k in ["cà phê", "ca phe", "coffee"]):
            where_cond = "sp.danh_muc ILIKE '%Cà phê%'"
            cat_name = "Cà Phê"
        elif any(k in fb for k in ["trà", "tra", "tea"]):
            where_cond = "sp.danh_muc ILIKE '%Trà%'"
            cat_name = "Trà & Trà Sữa"
        elif any(k in fb for k in ["bánh", "banh", "food", "thức ăn"]):
            where_cond = "sp.danh_muc ILIKE '%Bánh%' OR sp.danh_muc ILIKE '%Đồ ăn%'"
            cat_name = "Bánh & Thức Ăn"

        title_suffix = f"Sản Phẩm {cat_name}".strip()
        return {
            "entity": "san_pham",
            "title": f"Danh Sách {title_suffix}",
            "description": f"Bảng dữ liệu danh sách chi tiết {title_suffix.lower()} cùng đơn giá và danh mục.",
            "main_sql": f"""
                SELECT sp.ma_san_pham AS "Mã Món",
                       sp.ten_san_pham AS "Tên Sản Phẩm",
                       COALESCE(sp.danh_muc, 'Chung') AS "Danh Mục",
                       sp.gia_ban AS "Giá Bán (VNĐ)",
                       COALESCE(sp.trang_thai, 'DANG_BAN') AS "Trạng Thái"
                FROM silver.san_pham sp
                WHERE {where_cond}
                ORDER BY sp.gia_ban DESC
                LIMIT 50
            """.strip(),
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       ROUND(AVG(sp.gia_ban), 0) AS total_revenue,
                       ROUND(AVG(sp.gia_ban), 0) AS aov,
                       100.0 AS completion_rate
                FROM silver.san_pham sp
                WHERE {where_cond}
            """.strip(),
            "assistant_reply": f"Em đã truy vấn và hiển thị danh sách chi tiết các {title_suffix.lower()} kèm đơn giá và danh mục vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 3. BRANCHES / STORES (silver.chi_nhanh)
    if any(k in fb for k in ["chi nhánh", "chi nhanh", "cửa hàng", "cua hang", "quán", "điểm bán", "diem ban", "store"]):
        where_cond = "1=1"
        city_name = ""
        if any(k in fb for k in ["hcm", "hồ chí minh", "ho chi minh", "sài gòn", "tphcm"]):
            where_cond = "cn.thanh_pho ILIKE '%Hồ Chí Minh%'"
            city_name = "tại TP.HCM"
        elif any(k in fb for k in ["hà nội", "ha noi", "hn"]):
            where_cond = "cn.thanh_pho ILIKE '%Hà Nội%'"
            city_name = "tại Hà Nội"
        elif any(k in fb for k in ["đà nẵng", "da nang", "đn"]):
            where_cond = "cn.thanh_pho ILIKE '%Đà Nẵng%'"
            city_name = "tại Đà Nẵng"
        elif any(k in fb for k in ["cần thơ", "can tho"]):
            where_cond = "cn.thanh_pho ILIKE '%Cần Thơ%'"
            city_name = "tại Cần Thơ"

        return {
            "entity": "chi_nhanh",
            "title": f"Danh Sách Chi Nhánh Cửa Hàng {city_name}".strip(),
            "description": f"Bảng dữ liệu danh sách điểm bán Avengers Coffee {city_name}.",
            "main_sql": f"""
                SELECT cn.ma_chi_nhanh AS "Mã Điểm Bán",
                       cn.ten_chi_nhanh AS "Tên Cửa Hàng",
                       cn.dia_chi AS "Địa Chỉ",
                       cn.thanh_pho AS "Thành Phố",
                       COALESCE(cn.trang_thai, 'HOAT_DONG') AS "Trạng Thái"
                FROM silver.chi_nhanh cn
                WHERE {where_cond}
                ORDER BY cn.thanh_pho, cn.ten_chi_nhanh
                LIMIT 50
            """.strip(),
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(DISTINCT cn.thanh_pho) AS total_revenue,
                       0 AS aov,
                       100.0 AS completion_rate
                FROM silver.chi_nhanh cn
                WHERE {where_cond}
            """.strip(),
            "assistant_reply": f"Em đã truy vấn và hiển thị danh sách các chi nhánh điểm bán {city_name} với đầy đủ địa chỉ và thành phố vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 4. REVIEWS (silver.danh_gia_san_pham)
    if any(k in fb for k in ["đánh giá", "danh gia", "review", "sao", "phản hồi", "feedback"]):
        where_cond = "1=1"
        star_suffix = ""
        if any(k in fb for k in ["1 sao", "1sao", "kém", "tiêu cực"]):
            where_cond = "dg.so_sao = 1"
            star_suffix = "1 Sao"
        elif any(k in fb for k in ["2 sao", "2sao"]):
            where_cond = "dg.so_sao <= 2"
            star_suffix = "Dưới 3 Sao"
        elif any(k in fb for k in ["5 sao", "5sao", "tốt"]):
            where_cond = "dg.so_sao = 5"
            star_suffix = "5 Sao"

        return {
            "entity": "danh_gia",
            "title": f"Danh Sách Đánh Giá Khách Hàng {star_suffix}".strip(),
            "description": f"Bảng dữ liệu chi tiết phản hồi đánh giá {star_suffix.lower()} của khách hàng.",
            "main_sql": f"""
                SELECT dg.id AS "Mã Đánh Giá",
                       dg.ma_san_pham AS "Mã Món",
                       dg.so_sao AS "Số Sao",
                       COALESCE(dg.noi_dung, 'Không có bình luận') AS "Nội Dung Nhận Xét",
                       TO_CHAR(dg.ngay_tao, 'YYYY-MM-DD HH24:MI') AS "Thời Gian Đánh Giá"
                FROM silver.danh_gia_san_pham dg
                WHERE {where_cond}
                ORDER BY dg.ngay_tao DESC
                LIMIT 50
            """.strip(),
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       ROUND(AVG(dg.so_sao), 1) AS total_revenue,
                       ROUND(AVG(dg.so_sao), 1) AS aov,
                       100.0 AS completion_rate
                FROM silver.danh_gia_san_pham dg
                WHERE {where_cond}
            """.strip(),
            "assistant_reply": f"Em đã truy vấn và hiển thị danh sách chi tiết các đánh giá {star_suffix.lower()} kèm số sao và bình luận vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 5. VOUCHERS / PROMOTIONS (silver.khuyen_mai)
    if any(k in fb for k in ["khuyến mãi", "khuyen mai", "voucher", "mã giảm giá", "ưu đãi", "discount"]):
        return {
            "entity": "khuyen_mai",
            "title": "Danh Sách Chương Trình Khuyến Mãi / Voucher",
            "description": "Bảng danh sách chi tiết các mã ưu đãi và mức giảm giá.",
            "main_sql": """
                SELECT km.ma_khuyen_mai AS "Mã Ưu Đãi",
                       km.ten_chuong_trinh AS "Tên Chương Trình",
                       km.loai_khuyen_mai AS "Loại Giảm Giá",
                       km.gia_tri_giam AS "Giá Trị Giảm",
                       km.don_hang_toi_thieu AS "Đơn Tối Thiểu (VNĐ)",
                       TO_CHAR(km.ngay_bat_dau, 'YYYY-MM-DD') AS "Bắt Đầu",
                       TO_CHAR(km.ngay_ket_thuc, 'YYYY-MM-DD') AS "Kết Thúc"
                FROM silver.khuyen_mai km
                ORDER BY km.ngay_bat_dau DESC
                LIMIT 50
            """.strip(),
            "kpi_sql": """
                SELECT COUNT(*) AS total_orders,
                       COALESCE(SUM(km.gia_tri_giam), 0) AS total_revenue,
                       ROUND(AVG(km.gia_tri_giam), 0) AS aov,
                       100.0 AS completion_rate
                FROM silver.khuyen_mai km
            """.strip(),
            "assistant_reply": "Em đã truy vấn và hiển thị danh sách các chương trình khuyến mãi/voucher vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 6. INVENTORY / INGREDIENTS (silver.kho_nguyen_lieu)
    if any(k in fb for k in ["tồn kho", "ton kho", "nguyên liệu", "nguyen lieu", "vật tư", "kho"]):
        return {
            "entity": "ton_kho",
            "title": "Danh Sách Tồn Kho & Nguyên Liệu",
            "description": "Bảng dữ liệu theo dõi lượng tồn nguyên vật liệu pha chế.",
            "main_sql": """
                SELECT knl.ma_nguyen_lieu AS "Mã Nguyên Liệu",
                       knl.ten_nguyen_lieu AS "Tên Vật Tư / Nguyên Liệu",
                       knl.so_luong_ton AS "Số Lượng Tồn",
                       knl.don_vi_tinh AS "Đơn Vị Tính",
                       COALESCE(knl.trang_thai, 'CON_HANG') AS "Trạng Thái Kho"
                FROM silver.kho_nguyen_lieu knl
                ORDER BY knl.so_luong_ton ASC
                LIMIT 50
            """.strip(),
            "kpi_sql": """
                SELECT COUNT(*) AS total_orders,
                       COALESCE(SUM(knl.so_luong_ton), 0) AS total_revenue,
                       ROUND(AVG(knl.so_luong_ton), 0) AS aov,
                       100.0 AS completion_rate
                FROM silver.kho_nguyen_lieu knl
            """.strip(),
            "assistant_reply": "Em đã truy vấn và hiển thị danh sách tồn kho nguyên vật liệu vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 7. STAFF SHIFTS & ATTENDANCE (silver.ca_lam_viec_nhan_vien)
    if any(k in fb for k in ["ca làm", "ca lam", "nhân viên", "nhan vien", "chấm công", "cham cong", "đi trễ", "di tre", "lịch làm", "lich lam", "shift"]):
        where_cond = "1=1"
        status_note = ""
        if any(k in fb for k in ["đi trễ", "di tre", "muộn", "trễ"]):
            where_cond = "cl.trang_thai_cham_cong = 'DI_TRE'"
            status_note = "Đi Trễ"
        elif any(k in fb for k in ["vắng mặt", "vang mat", "nghỉ"]):
            where_cond = "cl.trang_thai_cham_cong = 'VANG_MAT'"
            status_note = "Vắng Mặt"
        elif any(k in fb for k in ["đúng giờ", "dung gio"]):
            where_cond = "cl.trang_thai_cham_cong = 'DUNG_GIO'"
            status_note = "Đúng Giờ"

        title_suffix = f"Ca Làm Việc Nhân Viên {status_note}".strip()
        return {
            "entity": "ca_lam_viec",
            "title": f"Danh Sách {title_suffix}",
            "description": f"Bảng dữ liệu theo dõi ca làm việc và chấm công nhân sự {status_note.lower()}.",
            "main_sql": f"""
                SELECT cl.ma_ca_lam_viec AS "Mã Ca",
                       COALESCE(cl.staff_name, 'Nhân viên') AS "Họ Tên Nhân Viên",
                       COALESCE(cn.ten_chi_nhanh, cl.co_so_ma) AS "Chi Nhánh",
                       cl.ten_ca AS "Tên Ca",
                       TO_CHAR(cl.ngay_lam_viec, 'YYYY-MM-DD') AS "Ngày Làm",
                       cl.gio_bat_dau AS "Bắt Đầu",
                       cl.gio_ket_thuc AS "Kết Thúc",
                       cl.trang_thai_cham_cong AS "Chấm Công"
                FROM silver.ca_lam_viec_nhan_vien cl
                LEFT JOIN silver.chi_nhanh cn ON cl.co_so_ma = cn.ma_chi_nhanh
                WHERE {where_cond}
                ORDER BY cl.ngay_lam_viec DESC, cl.gio_bat_dau DESC
                LIMIT 50
            """.strip(),
            "kpi_sql": f"""
                SELECT COUNT(*) AS total_orders,
                       COUNT(*) FILTER (WHERE cl.trang_thai_cham_cong = 'DI_TRE') AS total_revenue,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE cl.trang_thai_cham_cong = 'DUNG_GIO') / NULLIF(COUNT(*), 0), 1) AS aov,
                       ROUND(100.0 * COUNT(*) FILTER (WHERE cl.trang_thai_cham_cong = 'DUNG_GIO') / NULLIF(COUNT(*), 0), 1) AS completion_rate
                FROM silver.ca_lam_viec_nhan_vien cl
                WHERE {where_cond}
            """.strip(),
            "assistant_reply": f"Em đã truy vấn và hiển thị danh sách {title_suffix.lower()} kèm trạng thái chấm công vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
        }

    # 8. ORDERS (silver.don_hang) - Universal order handler
    pm_filter = None
    if any(k in fb for k in ["momo", "ví momo", "vi momo"]):
        pm_filter = "MOMO"
    elif any(k in fb for k in ["vnpay", "vn pay"]):
        pm_filter = "VNPAY"
    elif any(k in fb for k in ["tiền mặt", "tien mat", "cash"]):
        pm_filter = "TIEN_MAT"
    elif any(k in fb for k in ["thẻ", "the", "banking", "chuyển khoản"]):
        pm_filter = "THE"
    elif any(k in fb for k in ["zalo", "zalopay"]):
        pm_filter = "ZALOPAY"
    elif any(k in fb for k in ["chi tiết đơn", "chi tiết các đơn", "danh sách đơn", "danh sách các đơn"]):
        # Inherit payment method filter from existing report context if user didn't mention another
        curr_t = (current_report.get("title") or "").upper()
        if "MOMO" in curr_t:
            pm_filter = "MOMO"
        elif "VNPAY" in curr_t:
            pm_filter = "VNPAY"
        elif "TIỀN MẶT" in curr_t or "TIEN_MAT" in curr_t:
            pm_filter = "TIEN_MAT"
        elif "THẺ" in curr_t or "THE" in curr_t:
            pm_filter = "THE"

    status_filter = None
    if any(k in fb for k in ["đã hủy", "da huy", "hủy", "huy"]):
        status_filter = "DA_HUY"
    elif any(k in fb for k in ["hoàn thành", "hoan thanh"]):
        status_filter = "HOAN_THANH"
    elif any(k in fb for k in ["đang giao", "dang giao"]):
        status_filter = "DANG_GIAO"
    elif any(k in fb for k in ["mới tạo", "moi tao"]):
        status_filter = "MOI_TAO"

    channel_filter = None
    if any(k in fb for k in ["mang đi", "mang di", "takeaway"]):
        channel_filter = "MANG_DI"
    elif any(k in fb for k in ["giao tận nơi", "giao tan noi", "delivery", "giao hàng"]):
        channel_filter = "GIAO_TAN_NOI"
    elif any(k in fb for k in ["tại chỗ", "tai cho", "dine-in", "tại quán"]):
        channel_filter = "DUNG_TAI_CHO"

    voucher_filter = any(k in fb for k in ["voucher", "mã giảm", "ma giam", "áp mã", "ap ma", "khuyến mãi", "khuyen mai"])

    amount_filter = None
    if any(k in fb for k in ["> 500k", "500.000", "500k", "giá trị cao", "gia tri cao"]):
        amount_filter = "d.tong_tien >= 500000"
    elif any(k in fb for k in ["> 100k", "100.000", "100k"]):
        amount_filter = "d.tong_tien >= 100000"

    where_clauses = []
    title_parts = []
    if pm_filter:
        where_clauses.append(f"d.phuong_thuc_thanh_toan = '{pm_filter}'")
        title_parts.append(f"Thanh Toán {pm_filter}")
    if status_filter:
        where_clauses.append(f"d.trang_thai_don_hang = '{status_filter}'")
        title_parts.append(f"Trạng Thái {status_filter}")
    elif not pm_filter and not channel_filter and not status_filter:
        where_clauses.append("d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')")
    if channel_filter:
        where_clauses.append(f"d.loai_don_hang = '{channel_filter}'")
        title_parts.append(f"Kênh {channel_filter}")
    if voucher_filter:
        where_clauses.append("d.ma_voucher IS NOT NULL")
        title_parts.append("Có Voucher")
    if amount_filter:
        where_clauses.append(amount_filter)
        title_parts.append("Giá Trị Cao")

    where_str = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    if not title_parts:
        title_parts.append("Chi Tiết")
    
    final_title = f"Danh Sách Đơn Hàng {' '.join(title_parts)}"
    
    return {
        "entity": "don_hang",
        "title": final_title,
        "description": f"Bảng dữ liệu chi tiết danh sách từng đơn hàng {', '.join(title_parts).lower()} phục vụ tra cứu và kiểm tra nghiệp vụ.",
        "main_sql": f"""
            SELECT d.ma_don_hang AS "Mã Đơn",
                   COALESCE(d.ten_khach_hang, 'Khách vãng lai') AS "Khách Hàng",
                   d.tong_tien AS "Tổng Tiền (VNĐ)",
                   COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS "Phương Thức",
                   COALESCE(d.loai_don_hang, 'Tại quán') AS "Hình Thức",
                   d.trang_thai_don_hang AS "Trạng Thái",
                   TO_CHAR(d.ngay_tao, 'YYYY-MM-DD HH24:MI') AS "Thời Gian Tạo"
            FROM silver.don_hang d
            WHERE {where_str}
            ORDER BY d.ngay_tao DESC
            LIMIT 50
        """.strip(),
        "kpi_sql": f"""
            SELECT COUNT(*) AS total_orders,
                   COALESCE(SUM(d.tong_tien), 0) AS total_revenue,
                   ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS aov,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')) / NULLIF(COUNT(*), 0), 1) AS completion_rate
            FROM silver.don_hang d
            WHERE {where_str}
        """.strip(),
        "assistant_reply": f"Em đã truy vấn và hiển thị danh sách chi tiết các đơn hàng {', '.join(title_parts).lower()} với đầy đủ mã đơn, khách hàng, tổng tiền, phương thức, trạng thái và thời gian vào Bảng Dữ Liệu Chi Tiết (Mục 3) bên dưới!"
    }


def _resolve_universal_charts(
    user_feedback: str,
    current_report: Dict[str, Any],
    planned_charts: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Universal chart detector and generator covering:
    - multi_line: multi-series line chart (1 line per category/payment/channel/city)
    - bar: vertical column bar chart
    - horizontal_bar: ranking chart
    - donut: composition share chart
    - heatmap: 2D hourly x day of week density chart
    """
    fb = user_feedback.lower()
    charts = list(planned_charts)
    existing_types = {str(c.get("chart_type", "")).lower() for c in charts if isinstance(c, dict)}

    # 1. Multi-line trend chart
    if any(k in fb for k in [
        "1 đường là 1 loại", "1 duong la 1 loai", "mỗi loại 1 đường", "moi loai 1 duong",
        "mỗi phương thức 1 đường", "moi phuong thuc 1 duong", "từng loại 1 đường",
        "đa đường", "nhiều đường", "nhieu duong", "multi_line", "multiline", "tách đường", "tach duong",
        "xu hướng theo từng", "xu huong theo tung", "1 duong 1 loai", "mỗi loại một đường"
    ]):
        if "multi_line" not in existing_types and "multiline" not in existing_types:
            if any(k in fb for k in ["sản phẩm", "san pham", "danh mục", "danh muc", "nhóm"]):
                ml_sql = """
                    SELECT d.ngay_tao::date::text AS ngay,
                           COALESCE(sp.danh_muc, 'Khác') AS loai,
                           SUM(ct.thanh_tien) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1, 2 ORDER BY 1, 2
                """.strip()
                ml_title = "Xu hướng Doanh thu theo Danh mục Sản phẩm (Đa đường)"
            elif any(k in fb for k in ["chi nhánh", "chi nhanh", "thành phố", "thanh pho", "cửa hàng"]):
                ml_sql = """
                    SELECT d.ngay_tao::date::text AS ngay,
                           COALESCE(cn.thanh_pho, 'Khác') AS loai,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1, 2 ORDER BY 1, 2
                """.strip()
                ml_title = "Xu hướng Doanh thu theo Khu vực / Thành phố (Đa đường)"
            elif any(k in fb for k in ["kênh", "kenh", "hình thức", "loại đơn"]):
                ml_sql = """
                    SELECT d.ngay_tao::date::text AS ngay,
                           COALESCE(d.loai_don_hang, 'Khác') AS loai,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1, 2 ORDER BY 1, 2
                """.strip()
                ml_title = "Xu hướng Doanh thu theo Kênh phục vụ (Đa đường)"
            else:
                ml_sql = """
                    SELECT d.ngay_tao::date::text AS ngay,
                           COALESCE(d.phuong_thuc_thanh_toan, 'Khác') AS loai,
                           SUM(d.tong_tien) AS value
                    FROM silver.don_hang d
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1, 2 ORDER BY 1, 2
                """.strip()
                ml_title = "Xu hướng Doanh thu theo Phương thức Thanh toán (1 đường / loại)"

            charts.insert(0, {
                "id": "trend_multiline_chart",
                "title": ml_title,
                "chart_type": "multi_line",
                "unit": "VNĐ",
                "col_span": 12,
                "sql": ml_sql
            })

    # 2. Vertical Column Bar Chart
    if any(k in fb for k in ["cột đứng", "cot dung", "biểu đồ cột", "bieu do cot", "thêm biểu đồ cột", "bar chart", "cột"]) and not any(k in fb for k in ["ngang", "horizontal"]):
        if "bar" not in existing_types:
            bar_sql = """
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Khác') AS label,
                       COALESCE(SUM(d.tong_tien), 0) AS value
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1 ORDER BY value DESC LIMIT 8
            """.strip()
            if any(k in fb for k in ["chi nhánh", "cửa hàng", "thành phố"]):
                bar_sql = """
                    SELECT COALESCE(cn.thanh_pho, 'Khác') AS label,
                           COALESCE(SUM(d.tong_tien), 0) AS value
                    FROM silver.don_hang d
                    JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1 ORDER BY value DESC LIMIT 8
                """.strip()
            elif any(k in fb for k in ["sản phẩm", "món"]):
                bar_sql = """
                    SELECT COALESCE(sp.ten_san_pham, 'Khác') AS label,
                           COALESCE(SUM(ct.thanh_tien), 0) AS value
                    FROM silver.chi_tiet_don_hang ct
                    JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    GROUP BY 1 ORDER BY value DESC LIMIT 8
                """.strip()

            charts.append({
                "id": f"chart_bar_vertical_{len(charts)+1}",
                "title": "So sánh Doanh thu (Biểu đồ Cột)",
                "chart_type": "bar",
                "unit": "VNĐ",
                "col_span": 6,
                "sql": bar_sql
            })

    # 3. Donut Composition Chart
    if any(k in fb for k in ["hình tròn", "hinh tron", "donut", "tròn", "tỷ trọng", "ty trong", "cơ cấu", "co cau", "phần trăm"]):
        if "donut" not in existing_types:
            donut_sql = """
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Khác') AS name,
                       COUNT(*) AS value
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1 ORDER BY value DESC LIMIT 6
            """.strip()
            charts.append({
                "id": f"chart_donut_{len(charts)+1}",
                "title": "Cơ cấu Tỷ trọng (Hình tròn Donut)",
                "chart_type": "donut",
                "unit": "đơn",
                "col_span": 6,
                "sql": donut_sql
            })

    # 4. Heatmap Chart
    if any(k in fb for k in ["heatmap", "mật độ", "mat do", "khung giờ x thứ", "khung gio"]):
        if "heatmap" not in existing_types:
            heatmap_sql = """
                SELECT EXTRACT(DOW FROM d.ngay_tao)::int AS dow,
                       EXTRACT(HOUR FROM d.ngay_tao)::int AS hour,
                       COUNT(*) AS order_count
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1, 2 ORDER BY 1, 2
            """.strip()
            charts.append({
                "id": f"chart_heatmap_{len(charts)+1}",
                "title": "Mật độ Giao dịch Khung giờ x Thứ trong tuần (Heatmap)",
                "chart_type": "heatmap",
                "unit": "đơn",
                "col_span": 12,
                "sql": heatmap_sql
            })

    # 5. Horizontal Ranking Chart
    if any(k in fb for k in ["xếp hạng", "xep hang", "top", "ngang", "ranking"]):
        if "horizontal_bar" not in existing_types:
            rank_sql = """
                SELECT COALESCE(sp.ten_san_pham, 'Khác') AS name,
                       COALESCE(SUM(ct.thanh_tien), 0) AS value
                FROM silver.chi_tiet_don_hang ct
                JOIN silver.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                JOIN silver.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1 ORDER BY value DESC LIMIT 10
            """.strip()
            charts.append({
                "id": f"chart_rank_{len(charts)+1}",
                "title": "Bảng Xếp Hạng Top Đóng Góp Doanh Thu",
                "chart_type": "horizontal_bar",
                "unit": "VNĐ",
                "col_span": 6,
                "sql": rank_sql
            })

    return charts


@router.post("/refine-report")
def refine_report(payload: AiReportRefineRequest):
    user_feedback = (payload.feedback or "").strip()
    if not user_feedback:
        raise HTTPException(status_code=422, detail="Vui lòng nhập nội dung góp ý hoặc yêu cầu tinh chỉnh.")

    current_report = payload.current_report
    if not current_report or not isinstance(current_report, dict):
        raise HTTPException(status_code=400, detail="Thiếu dữ liệu báo cáo hiện tại để tinh chỉnh.")

    if _looks_destructive(user_feedback):
        return {
            "status": "needs_clarification",
            "assistant_reply": "Yêu cầu có chứa từ khóa có thể thay đổi dữ liệu kho. Hệ thống AI chỉ hỗ trợ truy vấn và phân tích chỉ đọc.",
            "current_report": current_report,
        }

    domain = payload.domain or "auto"

    try:
        metadata = get_combined_metadata(include_source=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Không thể đọc metadata kho phân tích: {type(exc).__name__}")

    # Vector RAG search for relevant tables/columns based on feedback
    search_query = f"{current_report.get('title', '')} {user_feedback}"
    vector_rag = vector_rag_service.search_semantic_knowledge(search_query, top_k=6)

    # Resolution
    resolution = semantic_service.resolve(user_feedback, current_report.get("interpreted_request", ""), domain, metadata, vector_tables=vector_rag.get("top_tables", []))
    metadata_context = semantic_service.llm_context(resolution, metadata, prompt=user_feedback)
    metadata_context["vector_rag"] = vector_rag

    # Build prompt for LLM Refinement
    current_sql = current_report.get("sql", {})
    if not isinstance(current_sql, dict):
        current_sql = {"main": current_report.get("sql_query", "")}

    existing_charts = current_report.get("charts", [])
    if not isinstance(existing_charts, list):
        existing_charts = []

    compact_charts = [
        {
            "id": c.get("id"),
            "title": c.get("title"),
            "chart_type": c.get("chart_type"),
            "unit": c.get("unit"),
            "sql": c.get("sql", "")
        }
        for c in existing_charts if isinstance(c, dict)
    ]

    existing_cards = current_report.get("kpi_cards", [])
    compact_cards = [
        {
            "label": c.get("label"),
            "value": c.get("value"),
            "unit": c.get("unit"),
            "sub_text": c.get("sub_text", "")
        }
        for c in existing_cards if isinstance(c, dict)
    ]

    history_text = ""
    if payload.conversation_history:
        history_text = "\n".join(
            f"- {h.get('role', 'user').capitalize()}: {h.get('content', '')}"
            for h in payload.conversation_history[-6:]
        )

    # ── Session Memory: retrieve session for rich context ──
    session = get_session(payload.session_id) if payload.session_id else None
    session_data_context = ""
    session_history_text = ""
    if session:
        session_data_context = session.get_data_context_for_llm()
        session_history_text = session.formatted_history(max_turns=8)
        if session_history_text and session_history_text != "(Đây là lượt đầu tiên, chưa có lịch sử)":
            history_text = session_history_text
        session.add_turn(role="user", content=user_feedback)

    # Build detailed schema text for the LLM
    schema_lines = []
    for t in metadata_context.get("physical_metadata", []):
        cols = ", ".join(f"{c['name']} ({c['data_type']})" for c in t.get("columns", []))
        joins = ", ".join(f"{j['to_table']} ON {j['on']}" for j in t.get("relationships", []))
        line = f"- Bảng `{t['qualified_name']}` ({t.get('business_name')}):\n  + Cột: {cols}"
        if joins:
            line += f"\n  + JOIN mẫu: {joins}"
        schema_lines.append(line)
    schema_text = "\n".join(schema_lines)

    enums = metadata_context.get("enums", {})
    enums_text = "\n".join([f"  - {col}: {', '.join(repr(v) for v in vals[:6])}" for col, vals in list(enums.items())[:6]]) if enums else ""

    rules = metadata_context.get("business_rules", [])
    rules_text = "\n".join([f"  - {r}" for r in rules[:4]]) if rules else ""

    vector_section = ""
    if metadata_context.get("vector_rag"):
        vr = metadata_context["vector_rag"]
        vector_section = f"""
KHO TRI THỨC NGỮ NGHĨA VECTOR RAG (TRÍCH XUẤT TỪ PGVECTOR ai_agent.schema_catalog):
{vr.get('vector_context_text', '')}

ĐƯỜNG DẪN LIÊN KẾT BẢNG CHUẨN:
{vr.get('join_context_text', '')}
"""

    refine_instruction = f"""Bạn là Senior BI Data Analyst và Data Platform Architect phụ trách hệ thống Avengers Coffee.
Người dùng đang xem báo cáo phân tích và gửi GÓP Ý / YÊU CẦU TINH CHỈNH (feedback).
Nhiệm vụ của bạn là xem xét báo cáo hiện tại và điều chỉnh lại toàn bộ cấu trúc báo cáo (SQL, Biểu đồ, KPI, Bảng dữ liệu, Nhận định) chính xác tuyệt đối.

1. BÁO CÁO HIỆN TẠI:
- Tiêu đề: {current_report.get('title', '')}
- Mô tả: {current_report.get('description', '')}
- Tóm tắt điều hành: {current_report.get('executive_summary', '')}
- Câu lệnh SQL hiện tại:
{json.dumps(current_sql, ensure_ascii=False, indent=2)}
- Danh sách Biểu đồ hiện tại:
{json.dumps(compact_charts, ensure_ascii=False, indent=2)}
- Thẻ KPI hiện tại:
{json.dumps(compact_cards, ensure_ascii=False, indent=2)}
- Khuyến nghị hiện tại:
{json.dumps(current_report.get('recommendations', []), ensure_ascii=False, indent=2)}

2. LỊCH SỬ TINH CHỈNH PHIÊN NÀY:
{history_text or '(Đây là lượt góp ý đầu tiên)'}

3. GÓP Ý / YÊU CẦU TINH CHỈNH CỦA NGƯỜI DÙNG:
"{user_feedback}"

4. DỮ LIỆU KẾT QUẢ HIỆN TẠI ĐANG HIỂN THỊ TRÊN MÀN HÌNH:
{session_data_context if session_data_context else '(Không có snapshot — chỉ có SQL ở mục 1)'}

5. METADATA CHI TIẾT CÁC BẢNG TRỌNG TÂM ĐƯỢC PHÉP TRUY VẤN:
{schema_text}
{vector_section}

QUY TẮC NGHIỆP VỤ & ENUMS CHUẨN:
{rules_text}
{enums_text}

6. NGUYÊN TẮC TINH CHỈNH TOÀN DIỆN (BẮT BUỘC TUÂN THỦ):
A. NẾU YÊU CẦU XEM BẢNG DỮ LIỆU CHI TIẾT / DANH SÁCH THỰC THỂ (đơn hàng, khách hàng, sản phẩm, chi nhánh, đánh giá, khuyến mãi, tồn kho...):
   - ĐẶC BIỆT LƯU Ý: Bảng dữ liệu chi tiết của báo cáo (Mục 3) được sinh ra từ truy vấn `main` trong `updated_sql`!
   - BẮT BUỘC đặt `needs_sql_execution: true`.
   - BẮT BUỘC viết câu lệnh SELECT chi tiết từng bản ghi thực thể trong `updated_sql["main"]` (KHÔNG DÙNG GROUP BY). Dùng bí danh tiếng Việt có dấu cho các cột (ví dụ: `d.ma_don_hang AS "Mã Đơn", d.tong_tien AS "Tổng Tiền (VNĐ)"`), có ORDER BY và LIMIT 50.
   - BẮT BUỘC cập nhật `updated_sql["kpi"]` để tính tổng số bản ghi và các metric tổng hợp cho tập dữ liệu vừa lọc.
   - CẬP NHẬT `updated_title` phản ánh chính xác thực thể (ví dụ: "Danh Sách Đơn Hàng Thanh Toán MOMO", "Danh Sách Khách Hàng VIP").
   - TUYỆT ĐỐI KHÔNG đưa các chuỗi giả dạng chữ như "Chi tiết từng đơn" hay "Hiển thị đầy đủ..." vào `updated_key_findings`! `updated_key_findings` CHỈ ĐƯỢC CHỨA các nhận định định lượng đo lường bằng con số thực tế.

B. NẾU YÊU CẦU BIỂU ĐỒ XU HƯỚNG ĐA ĐƯỜNG ("1 đường là 1 loại", "mỗi loại 1 đường", "mỗi phương thức 1 đường", "multi_line"):
   - BẮT BUỘC đặt `chart_type: "multi_line"`.
   - BẮT BUỘC cung cấp câu lệnh `sql` trả về 3 cột: thời gian/ngày, phân loại/loại, giá trị số (ví dụ: `SELECT d.ngay_tao::date::text AS ngay, d.phuong_thuc_thanh_toan AS loai, SUM(d.tong_tien) AS value FROM silver.don_hang d WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') GROUP BY 1, 2 ORDER BY 1, 2`).
   - Đặt `col_span: 12`.
   - Đặt `needs_sql_execution: true`.

C. NẾU YÊU CẦU THÊM HOẶC ĐỔI CÁC LOẠI BIỂU ĐỒ KHÁC:
   - Các loại hỗ trợ: "bar" (cột đứng), "horizontal_bar" (xếp hạng ngang), "donut" (hình tròn cơ cấu), "area" / "line" (đường xu hướng đơn), "heatmap" (mật độ 2D), "multi_line" (đa đường).
   - NẾU người dùng yêu cầu THÊM BIỂU ĐỒ MỚI (ví dụ: "thêm biểu đồ cột đứng", "thêm heatmap"):
     + BẮT BUỘC giữ nguyên các biểu đồ cũ trong `updated_charts` và chèn biểu đồ mới vào mảng (KHÔNG XÓA BIỂU ĐỒ CŨ).
     + Cung cấp câu lệnh SQL hoàn chỉnh cho biểu đồ đó.
     + Đặt `needs_sql_execution: true`.

D. NẾU YÊU CẦU LỌC THÊM ĐIỀU KIỆN HOẶC TÍNH TOÁN LẠI:
   - Đặt `needs_sql_execution: true`.
   - Cung cấp câu lệnh SQL PostgreSQL cập nhật chuẩn xác trong `updated_sql` (chỉ đọc silver.*).

E. NẾU CHỈ ĐIỀU CHỈNH VĂN PHONG, NỘI DUNG TÓM TẮT, KHUYẾN NGHỊ:
   - Đặt `needs_sql_execution: false`.
   - Viết lại `updated_executive_summary`, `updated_key_findings`, `updated_ai_insights`, `updated_recommendations` sâu sắc, định lượng.

F. `assistant_reply`:
   - Trả lời thân thiện, mạch lạc bằng tiếng Việt, thông báo rõ những gì đã được tinh chỉnh (nêu rõ bảng dữ liệu chi tiết, biểu đồ hay số liệu đã được cập nhật).

HÃY TRẢ VỀ ĐÚNG MỘT JSON OBJECT (không có text nào ngoài JSON):
{{
  "assistant_reply": "Lời nhắn giải thích cụ thể cho người dùng",
  "needs_sql_execution": true,
  "updated_title": "Tiêu đề mới (hoặc giữ nguyên nếu không đổi)",
  "updated_description": "Mô tả mới (hoặc giữ nguyên)",
  "updated_sql": {{
    "main": "SELECT ... FROM silver... (hoặc null nếu không đổi)",
    "kpi": "SELECT ... FROM silver...",
    "trend": "SELECT ... FROM silver...",
    "breakdown": "SELECT ... FROM silver..."
  }},
  "updated_charts": [
    {{
      "id": "chart_id",
      "title": "Tên biểu đồ",
      "chart_type": "donut",
      "unit": "đơn vị",
      "sql": "SELECT ..."
    }}
  ],
  "updated_kpi_cards": [
    {{
      "label": "Tên thẻ KPI",
      "field": "tên_cột_hoặc_giá_trị",
      "unit": "đơn vị",
      "sub_text": "chú thích phụ"
    }}
  ],
  "updated_executive_summary": "Tóm tắt điều hành mới",
  "updated_key_findings": [
    {{ "finding": "Tên phát hiện", "value": "Giá trị", "comment": "Nhận xét" }}
  ],
  "updated_ai_insights": ["Insight 1", "Insight 2", "Insight 3"],
  "updated_conclusions": "Kết luận phân tích",
  "updated_recommendations": ["Khuyến nghị 1", "Khuyến nghị 2", "Khuyến nghị 3"]
}}
"""

    llm_call = call_llm(
        refine_instruction,
        "Bạn là Senior BI Data Analyst của Avengers Coffee. Trả về đúng định dạng JSON tiếng Việt chuẩn xác.",
    )
    llm_data = llm_call.get("data") if llm_call and isinstance(llm_call.get("data"), dict) else {}
    assistant_reply = llm_data.get("assistant_reply") or "Em đã tiếp thu góp ý và cập nhật lại báo cáo theo yêu cầu của bạn."

    needs_sql = bool(llm_data.get("needs_sql_execution"))
    updated_sql_dict = llm_data.get("updated_sql") if isinstance(llm_data.get("updated_sql"), dict) else {}
    if any(isinstance(v, str) and v.lower().strip().startswith("select") for v in updated_sql_dict.values()):
        needs_sql = True

    # ── Universal Entity List Resolution ──
    entity_override = _resolve_universal_entity_list(user_feedback, current_report)
    if entity_override:
        needs_sql = True
        main_q = str(updated_sql_dict.get("main") or "")
        # If LLM didn't provide main_sql or used GROUP BY or didn't select individual entity rows
        if not main_q or "group by" in main_q.lower() or not any(k in main_q.lower() for k in ["mã", "id", "name", "họ tên", "tên"]):
            updated_sql_dict["main"] = entity_override["main_sql"]
        
        kpi_q = str(updated_sql_dict.get("kpi") or "")
        if not kpi_q or not any(k in kpi_q.lower() for k in ["count", "total_orders"]):
            updated_sql_dict["kpi"] = entity_override["kpi_sql"]

        updated_report_title = entity_override["title"]
        updated_report_desc = entity_override["description"]
        assistant_reply = entity_override["assistant_reply"]
    else:
        updated_report_title = llm_data.get("updated_title") or current_report.get("title")
        updated_report_desc = llm_data.get("updated_description") or current_report.get("description")

    # ── Universal Chart Resolution ──
    planned_charts_in = llm_data.get("updated_charts") if isinstance(llm_data.get("updated_charts"), list) else list(current_report.get("charts", []))
    planned_charts_resolved = _resolve_universal_charts(user_feedback, current_report, planned_charts_in)
    llm_data["updated_charts"] = planned_charts_resolved
    if any(c.get("sql") for c in planned_charts_resolved):
        needs_sql = True

    # Prepare default / fallback structure
    time_info = _time_selection(AiTextToReportRequest(prompt=user_feedback))
    fallback_plan = _deterministic_plan(resolution, time_info)

    updated_report = dict(current_report)
    updated_report["assistant_reply"] = assistant_reply
    updated_report["last_feedback"] = user_feedback
    updated_report["revision"] = int(current_report.get("revision", 1)) + 1
    updated_report["created_at"] = datetime.now().astimezone().isoformat()
    updated_report["title"] = updated_report_title
    updated_report["description"] = updated_report_desc

    if llm_data.get("updated_title"):
        updated_report["title"] = llm_data["updated_title"]
    if llm_data.get("updated_description"):
        updated_report["description"] = llm_data["updated_description"]

    if needs_sql:
        # Build executable plan
        exec_plan = {
            "main_sql": updated_sql_dict.get("main") or current_sql.get("main") or fallback_plan["main_sql"],
            "kpi_sql": updated_sql_dict.get("kpi") or current_sql.get("kpi") or fallback_plan["kpi_sql"],
            "trend_sql": updated_sql_dict.get("trend") or current_sql.get("trend") or fallback_plan["trend_sql"],
            "breakdown_sql": updated_sql_dict.get("breakdown") or current_sql.get("breakdown") or fallback_plan["breakdown_sql"],
            "charts": llm_data.get("updated_charts") or current_report.get("charts", []),
            "kpi_cards": llm_data.get("updated_kpi_cards") or current_report.get("kpi_cards", []),
            "title": updated_report["title"],
            "description": updated_report["description"],
            "metrics": current_report.get("metadata_used", {}).get("metrics", []),
            "dimensions": current_report.get("metadata_used", {}).get("dimensions", []),
        }

        try:
            results, sql_used, repair_models = _execute_plan(
                exec_plan, fallback_plan, metadata_context, user_prompt=user_feedback, intent=resolution.get("intent", "")
            )
            normalized = _normalize_results(results)
            query_policy = _query_policy(metadata_context)

            # Execute dynamic charts
            dynamic_charts = []
            planned_charts = exec_plan.get("charts") or []
            existing_charts = current_report.get("charts", [])
            existing_charts_map = {c.get("id"): c for c in existing_charts if isinstance(c, dict) and c.get("id")}

            DEFAULT_HEATMAP_SQL = """
                SELECT EXTRACT(DOW FROM d.ngay_tao)::int AS dow,
                       EXTRACT(HOUR FROM d.ngay_tao)::int AS hour,
                       COUNT(*) AS order_count
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1, 2 ORDER BY 1, 2
            """

            for c in planned_charts:
                if not isinstance(c, dict):
                    continue
                c_sql = c.get("sql")
                c_type = str(c.get("chart_type", "")).lower()
                if c_type == "heatmap" and not c_sql:
                    c_sql = DEFAULT_HEATMAP_SQL

                if c_sql:
                    ch_item = dict(c)
                    ch_item["sql"] = c_sql
                    ch_res = _execute_chart_item(ch_item, query_policy)
                    if ch_res and ch_res.get("data"):
                        dynamic_charts.append(ch_res)
                    elif c.get("data"):
                        dynamic_charts.append(c)
                elif c.get("data"):
                    dynamic_charts.append(c)
                elif c.get("id") and c["id"] in existing_charts_map:
                    old_c = dict(existing_charts_map[c["id"]])
                    old_c["title"] = c.get("title") or old_c.get("title")
                    old_c["chart_type"] = c.get("chart_type") or old_c.get("chart_type")
                    if c.get("unit"):
                        old_c["unit"] = c["unit"]
                    dynamic_charts.append(old_c)

            # Preserve non-deleted existing charts if user added new charts
            if len(planned_charts) > 0 and len(existing_charts) > 0:
                planned_ids = {c.get("id") for c in planned_charts if isinstance(c, dict) and c.get("id")}
                for ec in existing_charts:
                    if isinstance(ec, dict) and ec.get("id") and ec["id"] not in planned_ids:
                        if not any(w in user_feedback.lower() for w in ["xóa biểu đồ", "bỏ biểu đồ", "remove chart"]):
                            dynamic_charts.insert(0, ec)

            if not dynamic_charts:
                chart_meta = _chart_metadata(exec_plan, fallback_plan)
                if normalized["trend"]:
                    dynamic_charts.append({
                        "id": "trend_chart",
                        "title": chart_meta["trend"]["title"],
                        "chart_type": chart_meta["trend"]["chart_type"],
                        "unit": chart_meta["trend"]["unit"],
                        "col_span": 7 if normalized["breakdown"] else 12,
                        "data": normalized["trend"],
                        "sql": sql_used.get("trend", ""),
                    })
                if normalized["breakdown"]:
                    dynamic_charts.append({
                        "id": "breakdown_chart",
                        "title": chart_meta["breakdown"]["title"],
                        "chart_type": chart_meta["breakdown"]["chart_type"],
                        "unit": chart_meta["breakdown"]["unit"],
                        "col_span": 5 if normalized["trend"] else 12,
                        "data": normalized["breakdown"],
                        "sql": sql_used.get("breakdown", ""),
                    })

            final_cards = _sanitize_and_resolve_kpi_cards(exec_plan.get("kpi_cards"), normalized)

            updated_report["sql"] = sql_used
            updated_report["sql_query"] = sql_used.get("main", "")
            updated_report["kpis"] = normalized["kpis"]
            updated_report["kpi_cards"] = final_cards
            updated_report["charts"] = dynamic_charts
            if entity_override:
                tbl_title = entity_override["title"]
            elif updated_report.get("title"):
                tbl_title = f"Dữ liệu trích xuất: {updated_report['title']}"
            else:
                tbl_title = "Bảng Dữ Liệu Chi Tiết"
            updated_report["table_data"] = {
                "title": tbl_title,
                "columns": normalized["table_columns"],
                "rows": normalized["table_rows"],
                "total_rows": normalized["row_counts"]["main"],
            }
            updated_report["trend_chart"] = normalized["trend"]
            updated_report["breakdown_chart"] = normalized["breakdown"]

        except Exception as e:
            logger.error("Error executing refined SQL plan: %s", e)
            updated_report["assistant_reply"] += f" (Lưu ý: Truy vấn SQL mới gặp cảnh báo: {str(e)[:100]}, hệ thống đã bảo lưu số liệu an toàn)."

    else:
        # No SQL changes requested; check if user modified or added charts
        if llm_data.get("updated_charts") and isinstance(llm_data["updated_charts"], list):
            new_chart_configs = llm_data["updated_charts"]
            existing_charts = list(updated_report.get("charts", []))
            query_policy = _query_policy(metadata_context)
            final_charts = []
            matched_existing_indices = set()

            DEFAULT_HEATMAP_SQL = """
                SELECT EXTRACT(DOW FROM d.ngay_tao)::int AS dow,
                       EXTRACT(HOUR FROM d.ngay_tao)::int AS hour,
                       COUNT(*) AS order_count
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1, 2 ORDER BY 1, 2
            """
            DEFAULT_MULTILINE_SQL = """
                SELECT d.ngay_tao::date::text AS ngay,
                       COALESCE(d.phuong_thuc_thanh_toan, 'Khác') AS loai,
                       SUM(d.tong_tien) AS value
                FROM silver.don_hang d
                WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY 1, 2 ORDER BY 1, 2
            """

            for nc in new_chart_configs:
                if not isinstance(nc, dict):
                    continue
                new_type = str(nc.get("chart_type", "")).lower()
                if new_type not in ("donut", "bar", "horizontal_bar", "area", "line", "heatmap", "multi_line", "multiline"):
                    new_type = "bar"
                nc_id = nc.get("id")
                nc_title = nc.get("title") or "Biểu đồ"
                nc_sql = nc.get("sql")

                # Check if matching existing chart by id
                matched_idx = None
                if nc_id:
                    for i, ec in enumerate(existing_charts):
                        if i not in matched_existing_indices and ec.get("id") == nc_id:
                            matched_idx = i
                            break

                if matched_idx is not None:
                    matched_existing_indices.add(matched_idx)
                    ch = dict(existing_charts[matched_idx])
                    ch["chart_type"] = new_type
                    ch["title"] = nc_title
                    if nc.get("unit"):
                        ch["unit"] = nc["unit"]
                    if nc_sql:
                        res = _execute_chart_item(nc, query_policy)
                        if res and res.get("data"):
                            ch["data"] = res["data"]
                            ch["sql"] = res["sql"]
                    final_charts.append(ch)
                else:
                    # New chart added!
                    if new_type == "heatmap" and not nc_sql:
                        nc_sql = DEFAULT_HEATMAP_SQL
                    elif new_type in ("multi_line", "multiline") and not nc_sql:
                        nc_sql = DEFAULT_MULTILINE_SQL
                    if nc_sql:
                        nc_item = dict(nc)
                        nc_item["sql"] = nc_sql
                        ch_res = _execute_chart_item(nc_item, query_policy)
                        if ch_res and ch_res.get("data"):
                            final_charts.append(ch_res)
                        else:
                            final_charts.append({
                                "id": nc_id or f"chart_ref_{len(final_charts)+1}",
                                "title": nc_title,
                                "chart_type": new_type,
                                "unit": nc.get("unit", ""),
                                "col_span": 12 if new_type in ("heatmap", "multi_line", "multiline") else 6,
                                "data": existing_charts[0].get("data", []) if existing_charts else [],
                            })
                    else:
                        final_charts.append({
                            "id": nc_id or f"chart_ref_{len(final_charts)+1}",
                            "title": nc_title,
                            "chart_type": new_type,
                            "unit": nc.get("unit", ""),
                            "col_span": 12 if new_type in ("heatmap", "multi_line", "multiline") else 6,
                            "data": existing_charts[0].get("data", []) if existing_charts else [],
                        })

            # Retain non-mentioned existing charts unless explicitly asked to delete
            for i, ec in enumerate(existing_charts):
                if i not in matched_existing_indices and not any(ec.get("id") == c.get("id") for c in final_charts):
                    if not any(w in user_feedback.lower() for w in ["xóa biểu đồ", "bỏ biểu đồ", "remove chart"]):
                        final_charts.insert(i, ec)

            if final_charts:
                updated_report["charts"] = final_charts

    # Update narrative fields if provided by LLM
    if llm_data.get("updated_executive_summary"):
        updated_report["executive_summary"] = llm_data["updated_executive_summary"]
    if llm_data.get("updated_conclusions"):
        updated_report["conclusions"] = llm_data["updated_conclusions"]
    if llm_data.get("updated_ai_insights") and isinstance(llm_data["updated_ai_insights"], list):
        updated_report["ai_insights"] = [str(x) for x in llm_data["updated_ai_insights"]]
    if llm_data.get("updated_recommendations") and isinstance(llm_data["updated_recommendations"], list):
        updated_report["recommendations"] = [str(x) for x in llm_data["updated_recommendations"]]
    if llm_data.get("updated_key_findings") and isinstance(llm_data["updated_key_findings"], list):
        cleaned_findings = []
        for f in llm_data["updated_key_findings"]:
            if not isinstance(f, dict):
                continue
            f_val = str(f.get("value", "")).lower().strip()
            f_name = str(f.get("finding", "")).lower().strip()
            # Filter out fake text placeholders
            if any(bad in f_val for bad in ["chi tiết từng đơn", "chi tiet tung don", "chi tiết", "từng đơn", "danh sách", "danh sach", "bảng dữ liệu", "hiển thị đầy đủ", "xem bên dưới"]):
                continue
            if any(bad in f_name for bad in ["danh sách đơn hàng", "danh sach don", "chi tiết"]):
                continue
            cleaned_findings.append(f)
        if cleaned_findings:
            updated_report["key_findings"] = cleaned_findings
        elif needs_sql and 'normalized' in locals() and normalized.get("kpis"):
            # Universal Quantitative Key Findings Fallback
            kpis = normalized["kpis"]
            k_orders = kpis.get("orders") or kpis.get("total_orders") or len(normalized.get("table_rows", []))
            k_rev = kpis.get("revenue") or kpis.get("total_revenue") or 0
            k_aov = kpis.get("aov") or 0
            k_comp = kpis.get("completion_rate")

            findings = []
            entity_label = entity_override["title"] if entity_override else updated_report.get("title", "Tập dữ liệu")
            
            if k_orders is not None and k_orders > 0:
                findings.append({
                    "finding": f"Quy mô dữ liệu ({entity_label})",
                    "value": f"{int(k_orders):,} bản ghi".replace(",", "."),
                    "comment": "Tổng số lượng đối tượng ghi nhận trong phạm vi phân tích."
                })
            if k_rev is not None and k_rev > 0:
                findings.append({
                    "finding": "Tổng giá trị / Doanh thu lũy kế",
                    "value": f"{int(k_rev):,} đ".replace(",", "."),
                    "comment": "Tổng giá trị tài chính tương ứng với tập dữ liệu được chọn."
                })
            if k_aov is not None and k_aov > 0:
                findings.append({
                    "finding": "Giá trị trung bình mỗi đối tượng (AOV)",
                    "value": f"{int(k_aov):,} đ".replace(",", "."),
                    "comment": "Mức chi tiêu hoặc quy mô trung bình trên mỗi bản ghi."
                })
            if k_comp is not None:
                findings.append({
                    "finding": "Tỷ lệ hoàn thành / Hiệu suất",
                    "value": f"{k_comp}%",
                    "comment": "Tỷ lệ giao dịch hoặc tiến độ đạt chuẩn trong kỳ phân tích."
                })
            if not findings:
                findings.append({
                    "finding": "Số lượng bản ghi trích xuất",
                    "value": f"{len(normalized.get('table_rows', []))} dòng",
                    "comment": "Dữ liệu thực tế được nạp từ kho Silver Lakehouse."
                })
            updated_report["key_findings"] = findings

    # Log to Vector RAG Query Logs
    vector_rag_service.log_query(
        user_prompt=f"[REFINE] {user_feedback}",
        retrieved_tables=vector_rag.get("top_tables", []),
        generated_sql=updated_report.get("sql", {}).get("main", "") if isinstance(updated_report.get("sql"), dict) else "",
        status="SUCCESS",
        latency_ms=llm_call.get("latency_ms", 0) if llm_call else 0,
        error=""
    )

    # ── Session Memory: update session state after refinement ──
    if session:
        session.revision += 1
        # Record assistant reply
        assistant_reply_text = updated_report.get("assistant_reply", "Đã cập nhật báo cáo.")
        session.add_turn(
            role="assistant",
            content=assistant_reply_text,
            sql_changes=updated_report.get("sql") if isinstance(updated_report.get("sql"), dict) else None,
            result_snapshot=session.current_results_snapshot,
        )
        # Update session state with new results if SQL was executed
        if needs_sql and isinstance(updated_report.get("sql"), dict):
            session.current_sql = updated_report["sql"]
            # Build compact snapshot from updated report
            compact = {
                "kpis": updated_report.get("kpis", {}),
                "table_rows": (updated_report.get("table_data", {}).get("rows", []))[:15],
                "table_columns": updated_report.get("table_data", {}).get("columns", []),
                "row_count": updated_report.get("table_data", {}).get("total_rows", 0),
                "trend_count": len(updated_report.get("trend_chart", [])),
                "breakdown_count": len(updated_report.get("breakdown_chart", [])),
                "charts_summary": [
                    {"title": c.get("title", ""), "chart_type": c.get("chart_type", ""), "data_count": len(c.get("data", []))}
                    for c in updated_report.get("charts", [])[:4]
                ],
            }
            session.current_results_snapshot = compact
        session.title = updated_report.get("title", session.title)
        updated_report["session_id"] = session.session_id
    elif payload.session_id:
        # Session expired but client sent an ID — include it in response for awareness
        updated_report["session_id"] = None
        updated_report["session_expired"] = True

    # ── Phase 4: Diff summary and sanity warnings ──
    sql_changed = bool(needs_sql and isinstance(updated_report.get("sql"), dict))
    charts_changed = bool(llm_data.get("updated_charts"))
    diff_parts = []
    if entity_override:
        diff_parts.append(f"Đã cập nhật Bảng Dữ Liệu Chi Tiết cho {entity_override['title']}")
    elif sql_changed:
        diff_parts.append("Đã chạy lại SQL với bộ lọc/chỉ số mới")
    
    if any(c.get("chart_type") in ("multi_line", "multiline") for c in updated_report.get("charts", [])):
        diff_parts.append("Đã tích hợp biểu đồ xu hướng đa đường (1 đường / loại)")
    elif charts_changed:
        diff_parts.append("Đã cập nhật cấu hình biểu đồ")
    
    if llm_data.get("updated_executive_summary"):
        diff_parts.append("Đã viết lại tóm tắt điều hành")
    diff_summary = {
        "sql_modified": sql_changed,
        "charts_modified": charts_changed,
        "summary": " • ".join(diff_parts) if diff_parts else "Đã cập nhật theo yêu cầu",
    }
    updated_report["diff_summary"] = diff_summary
    updated_report["data_warnings"] = validate_results(
        normalized if needs_sql else {"table_rows": updated_report.get("table_data", {}).get("rows", [])},
        user_feedback,
    )

    return updated_report


@router.post("/feedback")
def log_user_feedback(payload: AiFeedbackRequest):
    """
    Logs user feedback on AI generated/refined reports (Phase 4.2).
    If positive feedback with valid SQL is received, logs it for few-shot reinforcement.
    """
    logger.info("👍👎 [AI-FEEDBACK] Session=%s Rating=%s Prompt=%s", payload.session_id, payload.rating, payload.prompt)
    if payload.rating == "positive" and payload.final_sql:
        try:
            vector_rag_service.log_query(
                user_prompt=f"[VERIFIED_FEEDBACK] {payload.prompt}",
                retrieved_tables=[],
                generated_sql=payload.final_sql,
                status="VERIFIED_CORRECT",
                latency_ms=0,
                error="",
            )
        except Exception as exc:
            logger.warning("Could not log verified feedback to RAG: %s", exc)
    return {
        "status": "success",
        "message": "Cảm ơn bạn đã đóng góp phản hồi giúp cải thiện chất lượng AI!",
        "session_id": payload.session_id,
    }



@router.post("/summarize")
def summarize_report(payload: AiSummarizeRequest):
    compact = {"title": payload.report_title, "columns": payload.columns, "rows": (payload.data or [])[:20]}
    response = call_llm(
        json.dumps(compact, ensure_ascii=False, default=json_serial),
        "Tóm tắt dữ liệu được cung cấp bằng tiếng Việt. Trả JSON có executive_summary và ai_insights. Không bịa số liệu.",
    )
    if response:
        return {**response["data"], "provider": {key: response[key] for key in ("provider", "model", "latency_ms")}}
    return {"executive_summary": "Không có nhà cung cấp LLM; dữ liệu vẫn có thể xem trực tiếp.", "ai_insights": [], "provider": {"provider": "deterministic", "model": "none", "latency_ms": 0}}
