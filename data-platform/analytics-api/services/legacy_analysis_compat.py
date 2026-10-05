"""Legacy helper compatibility for pre-V2 unit tests; never invoked by V2 routes.

No report/proposal/refinement endpoint uses these phrase/template helpers.
They remain temporarily to preserve regression coverage while callers migrate.
"""
import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from common import AiTextToReportRequest
from services.semantic_service import semantic_service
logger = logging.getLogger("ai-legacy-compat")


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


def _looks_destructive(prompt: str) -> bool:
    return bool(re.search(
        r"\b(drop|delete|update|insert|alter|truncate|grant|revoke|copy|create|merge|vacuum|refresh)\b",
        (prompt or "").lower(),
    ))


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
