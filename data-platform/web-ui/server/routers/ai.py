import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException

from common import AiSummarizeRequest, AiTextToReportRequest
from services.llm_service import call_llm, provider_configuration
from services.metadata_service import cache_status, get_combined_metadata, get_local_metadata, sql_references_sensitive_columns
from services.semantic_service import semantic_service
from services.sql_service import QueryExecutionError, SqlSafetyError, execute_read_only


router = APIRouter(prefix="/api/ai", tags=["AI Data Assistant"])
logger = logging.getLogger("ai-analytics")


def json_serial(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return str(value)


def _time_selection(payload: AiTextToReportRequest) -> Dict[str, Any]:
    text = (payload.prompt or "").lower()
    assumptions: List[str] = []
    requested = payload.time_range
    mode = requested.mode if requested else "auto"
    if mode == "auto":
        if any(term in text for term in ("hôm nay", "hom nay", "today")):
            mode = "today"
        elif re.search(r"\b7\s*(ngày|ngay|days?)\b", text):
            mode = "7d"
        elif re.search(r"\b30\s*(ngày|ngay|days?)\b", text):
            mode = "30d"
        elif payload.date_range in {"today", "7days", "30days"}:
            mode = {"today": "today", "7days": "7d", "30days": "30d"}[payload.date_range]
        else:
            mode = "30d"
            assumptions.append("Không có thời gian được chỉ định nên sử dụng 30 ngày gần nhất.")

    if mode == "today":
        return {"mode": mode, "sql": "{alias}.ngay_tao::date = CURRENT_DATE", "label": "hôm nay", "assumptions": assumptions}
    if mode == "7d":
        return {"mode": mode, "sql": "{alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '6 days' AND {alias}.ngay_tao::date <= CURRENT_DATE", "label": "7 ngày gần nhất", "assumptions": assumptions}
    if mode == "custom":
        if not requested or not requested.start or not requested.end:
            raise HTTPException(status_code=422, detail="Khoảng thời gian tùy chỉnh cần cả ngày bắt đầu và ngày kết thúc.")
        if requested.start > requested.end:
            raise HTTPException(status_code=422, detail="Ngày bắt đầu không được sau ngày kết thúc.")
        return {
            "mode": mode,
            "sql": f"{{alias}}.ngay_tao::date BETWEEN DATE '{requested.start.isoformat()}' AND DATE '{requested.end.isoformat()}'",
            "label": f"{requested.start.strftime('%d/%m/%Y')}–{requested.end.strftime('%d/%m/%Y')}",
            "assumptions": assumptions,
        }
    return {"mode": "30d", "sql": "{alias}.ngay_tao::date >= CURRENT_DATE - INTERVAL '29 days' AND {alias}.ngay_tao::date <= CURRENT_DATE", "label": "30 ngày gần nhất", "assumptions": assumptions}


def _base_kpi_sql(time_filter: str) -> str:
    return f"""
        SELECT COUNT(*) AS total_orders,
               COALESCE(SUM(d.tong_tien), 0) AS total_revenue,
               ROUND(COALESCE(AVG(d.tong_tien), 0), 0) AS aov,
               ROUND(100.0 * COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'HOAN_THANH')
                     / NULLIF(COUNT(*), 0), 1) AS completion_rate
        FROM orders.don_hang d
        WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
    """


def _deterministic_plan(resolution: Dict[str, Any], time_info: Dict[str, Any]) -> Dict[str, Any]:
    entity_ids = resolution["entity_ids"]
    time_filter = time_info["sql"].format(alias="d")
    label = time_info["label"]
    common_trend = f"""
        SELECT d.ngay_tao::date::text AS date, COUNT(*) AS orders,
               COALESCE(SUM(d.tong_tien), 0) AS revenue
        FROM orders.don_hang d
        WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
        GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date
    """

    if "products" in entity_ids or "order_items" in entity_ids:
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
                       COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS "Doanh Thu (VNĐ)"
                FROM orders.chi_tiet_don_hang ct
                JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY sp.ma_san_pham, sp.ten_san_pham, dm.ten_danh_muc
                ORDER BY "Số Lượng Đã Bán" DESC, "Doanh Thu (VNĐ)" DESC LIMIT 20
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT COALESCE(dm.ten_danh_muc, 'Khác') AS name,
                       COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS value
                FROM orders.chi_tiet_don_hang ct
                JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY dm.ten_danh_muc ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "ranking"},
        }

    if "stores" in entity_ids:
        return {
            "intent": "store_performance",
            "title": f"Hiệu suất Chi nhánh — {label}",
            "description": "So sánh doanh thu, số đơn và AOV của từng điểm bán.",
            "metrics": ["store_revenue", "store_aov", "order_count"],
            "dimensions": ["store", "city"],
            "main_sql": f"""
                SELECT COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS "Chi Nhánh",
                       COALESCE(cn.thanh_pho, 'Chưa xác định') AS "Thành Phố",
                       COUNT(*) AS "Số Đơn", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)",
                       ROUND(AVG(d.tong_tien), 0) AS "AOV (VNĐ)"
                FROM orders.don_hang d
                LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.co_so_ma, cn.ten_chi_nhanh, cn.thanh_pho
                ORDER BY "Doanh Thu (VNĐ)" ASC, "AOV (VNĐ)" DESC LIMIT 20
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT COALESCE(cn.thanh_pho, 'Chưa xác định') AS name,
                       COALESCE(SUM(d.tong_tien), 0) AS value
                FROM orders.don_hang d LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY cn.thanh_pho ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "bar", "table": "comparison"},
        }

    if "hourly" in entity_ids:
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
                FROM orders.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY EXTRACT(HOUR FROM d.ngay_tao) ORDER BY "Số Đơn" DESC
            """,
            "trend_sql": f"""
                SELECT LPAD(EXTRACT(HOUR FROM d.ngay_tao)::int::text, 2, '0') || ':00' AS date,
                       COUNT(*) AS revenue
                FROM orders.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY EXTRACT(HOUR FROM d.ngay_tao) ORDER BY EXTRACT(HOUR FROM d.ngay_tao)
            """,
            "breakdown_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name, COUNT(*) AS value
                FROM orders.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC LIMIT 8
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "bar", "breakdown": "donut", "table": "ranking"},
        }

    if "payments" in entity_ids:
        return {
            "intent": "payment_performance",
            "title": f"Cơ cấu Thanh toán — {label}",
            "description": "Phân tích số giao dịch và doanh thu theo hình thức thanh toán.",
            "metrics": ["payment_count", "payment_revenue"],
            "dimensions": ["payment_method"],
            "main_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS "Phương Thức",
                       COUNT(*) AS "Số Giao Dịch", COALESCE(SUM(d.tong_tien), 0) AS "Doanh Thu (VNĐ)"
                FROM orders.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY "Doanh Thu (VNĐ)" DESC
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name,
                       COALESCE(SUM(d.tong_tien), 0) AS value
                FROM orders.don_hang d
                WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
        }

    if "customers" in entity_ids:
        customer_cte = f"""
            WITH customer_orders AS (
                SELECT d.ma_nguoi_dung, COUNT(*) AS order_count,
                       COALESCE(SUM(d.tong_tien), 0) AS lifetime_value
                FROM orders.don_hang d
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
                SELECT d.ngay_tao::date::text AS date, COUNT(DISTINCT d.ma_nguoi_dung) AS revenue
                FROM orders.don_hang d
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

    if "delivery" in entity_ids:
        return {
            "intent": "delivery_performance",
            "title": f"Hiệu suất Giao hàng — {label}",
            "description": "Đánh giá khối lượng, tỷ lệ hoàn tất và thời gian giao hàng.",
            "metrics": ["delivery_count", "delivery_time", "delivery_success_rate"],
            "dimensions": ["delivery_status"],
            "main_sql": f"""
                SELECT sd.status AS "Trạng Thái", COUNT(*) AS "Số Lượt Giao",
                       ROUND(AVG(EXTRACT(EPOCH FROM (sd.delivered_at - sd.assigned_at)) / 60.0), 1) AS "Phút Giao TB",
                       COALESCE(SUM(sd.delivery_fee), 0) AS "Phí Giao (VNĐ)"
                FROM orders.shipper_delivery sd JOIN orders.don_hang d ON sd.ma_don_hang = d.ma_don_hang
                WHERE {time_filter} GROUP BY sd.status ORDER BY "Số Lượt Giao" DESC
            """,
            "trend_sql": common_trend,
            "breakdown_sql": f"""
                SELECT sd.status AS name, COUNT(*) AS value
                FROM orders.shipper_delivery sd JOIN orders.don_hang d ON sd.ma_don_hang = d.ma_don_hang
                WHERE {time_filter} GROUP BY sd.status ORDER BY value DESC
            """,
            "kpi_sql": _base_kpi_sql(time_filter),
            "visualizations": {"trend": "area", "breakdown": "donut", "table": "comparison"},
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
            FROM orders.don_hang d
            WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date DESC LIMIT 30
        """,
        "trend_sql": common_trend,
        "breakdown_sql": f"""
            SELECT COALESCE(d.phuong_thuc_thanh_toan, 'Chưa xác định') AS name,
                   COALESCE(SUM(d.tong_tien), 0) AS value
            FROM orders.don_hang d
            WHERE {time_filter} AND d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
            GROUP BY d.phuong_thuc_thanh_toan ORDER BY value DESC LIMIT 8
        """,
        "kpi_sql": _base_kpi_sql(time_filter),
        "visualizations": {"trend": "area", "breakdown": "donut", "table": "timeseries"},
    }


def _planner_prompt(payload: AiTextToReportRequest, resolution: Dict[str, Any], time_info: Dict[str, Any], context: Dict[str, Any]) -> str:
    return f"""
Yêu cầu: {payload.prompt}
Ngữ cảnh người dùng: {payload.context or '(không có)'}
Khoảng thời gian đã chuẩn hóa: {time_info['label']}
Miền nghiệp vụ đã phân giải: {', '.join(resolution['entity_ids'])}

Chỉ sử dụng metadata liên quan dưới đây, không suy đoán cột hoặc quan hệ khác:
{json.dumps(context, ensure_ascii=False, default=json_serial)}

Trả về đúng một JSON object có các trường:
intent, interpreted_request, assumptions (array), metrics (array), dimensions (array), tables (array),
joins (array), needs_clarification (boolean), clarification_question (string hoặc null), title, description,
main_sql, trend_sql, breakdown_sql, kpi_sql, visualizations.

Mỗi SQL phải là một SELECT hoặc WITH...SELECT PostgreSQL chỉ đọc. main_sql tối đa 20 dòng;
trend_sql trả nhãn `date` và số `revenue`; breakdown_sql trả `name` và `value`;
kpi_sql trả total_orders, total_revenue, aov, completion_rate. Áp dụng đúng khoảng thời gian và quy tắc doanh thu.
Không xuất cột PII và không tạo số liệu giả.
"""


def _valid_plan(data: Any) -> bool:
    return isinstance(data, dict) and all(isinstance(data.get(key), str) and data[key].strip() for key in ("main_sql", "trend_sql", "breakdown_sql", "kpi_sql"))


def _looks_destructive(prompt: str) -> bool:
    return bool(re.search(
        r"\b(drop|delete|update|insert|alter|truncate|grant|revoke|copy|create|merge|vacuum|refresh)\b",
        (prompt or "").lower(),
    ))


def _repair_sql(name: str, sql: str, error: Exception, metadata_context: Dict[str, Any]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    logger.warning("AI SQL failed query=%s attempt=0 error=%s sql=%s", name, type(error).__name__, sql)
    repair = call_llm(
        json.dumps({
            "task": f"Sửa duy nhất SQL {name}. Trả JSON {{\"corrected_sql\": \"...\"}}.",
            "failing_sql": sql,
            "postgres_error": str(error)[:800],
            "relevant_metadata": metadata_context,
        }, ensure_ascii=False, default=json_serial),
        "Bạn sửa PostgreSQL analytics. Chỉ trả JSON và chỉ tạo một SELECT hoặc WITH...SELECT an toàn.",
    )
    corrected = repair and repair.get("data", {}).get("corrected_sql")
    if isinstance(corrected, str) and corrected.strip():
        logger.warning("AI SQL repair query=%s attempt=1 repaired_sql=%s", name, corrected)
        return corrected, repair
    return None, repair


def _execute_plan(plan: Dict[str, Any], fallback: Dict[str, Any], metadata_context: Dict[str, Any]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str], List[Dict[str, Any]]]:
    results: Dict[str, Dict[str, Any]] = {}
    sql_used: Dict[str, str] = {}
    repair_models: List[Dict[str, Any]] = []
    for name in ("main", "trend", "breakdown", "kpi"):
        key = f"{name}_sql"
        sql = str(plan.get(key) or fallback[key]).strip()
        limit = 100 if name == "main" else (2 if name == "kpi" else 60)
        try:
            if sql_references_sensitive_columns(sql):
                raise SqlSafetyError("SQL AI tham chiếu cột nhạy cảm không được phép.")
            results[name] = execute_read_only(sql, row_limit=limit)
            sql_used[name] = results[name]["sql"]
            continue
        except (SqlSafetyError, QueryExecutionError) as error:
            corrected, repair = _repair_sql(name, sql, error, metadata_context)
            if repair:
                repair_models.append({key: repair[key] for key in ("provider", "model", "latency_ms")})
            if corrected:
                try:
                    if sql_references_sensitive_columns(corrected):
                        raise SqlSafetyError("SQL sửa lại vẫn tham chiếu cột nhạy cảm.")
                    results[name] = execute_read_only(corrected, row_limit=limit)
                    sql_used[name] = results[name]["sql"]
                    continue
                except (SqlSafetyError, QueryExecutionError) as repaired_error:
                    logger.warning("AI SQL failed query=%s attempt=1 error=%s", name, type(repaired_error).__name__)
            if sql.strip() != fallback[key].strip():
                if sql_references_sensitive_columns(fallback[key]):
                    raise SqlSafetyError("Mẫu SQL dự phòng tham chiếu cột nhạy cảm.")
                results[name] = execute_read_only(fallback[key], row_limit=limit)
                sql_used[name] = results[name]["sql"]
            else:
                raise
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


def _normalize_results(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    main_rows = results["main"]["rows"]
    kpi_row = results["kpi"]["rows"][0] if results["kpi"]["rows"] else {}
    kpis = {
        "revenue": _numeric(kpi_row, ["total_revenue", "revenue"]),
        "revenue_growth": None,
        "orders": int(_numeric(kpi_row, ["total_orders", "orders"]) or 0),
        "orders_growth": None,
        "aov": _numeric(kpi_row, ["aov"]),
        "completion_rate": _numeric(kpi_row, ["completion_rate"]),
    }
    trend = []
    for row in results["trend"]["rows"]:
        label = row.get("date") or row.get("hour") or row.get("label") or ""
        value = _numeric(row, ["revenue", "value", "orders", "order_count"]) or 0
        trend.append({"date": str(label), "revenue": value})
    breakdown = []
    for row in results["breakdown"]["rows"]:
        label = row.get("name") or row.get("label") or next(iter(row.values()), "Mục")
        value = _numeric(row, ["value", "revenue", "count", "order_count"]) or 0
        breakdown.append({"name": str(label), "value": value})
    return {
        "kpis": kpis,
        "trend": trend,
        "breakdown": breakdown,
        "table_rows": main_rows,
        "table_columns": results["main"]["columns"],
        "row_counts": {name: result["count"] for name, result in results.items()},
    }


def _deterministic_synthesis(normalized: Dict[str, Any], time_label: str) -> Dict[str, Any]:
    kpis = normalized["kpis"]
    revenue = kpis["revenue"]
    orders = kpis["orders"]
    aov = kpis["aov"]
    if orders == 0:
        summary = f"Kho dữ liệu không ghi nhận giao dịch hợp lệ trong {time_label}."
        insights = [
            "Không có đủ giao dịch để kết luận về xu hướng kinh doanh trong khoảng đã chọn.",
            "Chỉ số tăng trưởng không được tính vì chưa có truy vấn kỳ so sánh.",
        ]
        recommendations = ["Kiểm tra trạng thái đồng bộ dữ liệu hoặc mở rộng khoảng thời gian phân tích."]
    else:
        summary = f"Kho dữ liệu ghi nhận {orders:,} đơn hợp lệ với doanh thu {float(revenue or 0):,.0f} VNĐ trong {time_label}."
        insights = [
            f"Giá trị đơn trung bình đo được là {float(aov or 0):,.0f} VNĐ.",
            f"Kết quả chi tiết gồm {normalized['row_counts']['main']} dòng tổng hợp từ truy vấn thực tế.",
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
    return {"status": status, "providers": providers, "metadata": meta}


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
    resolution = semantic_service.resolve(user_prompt, context_text, domain, metadata)
    metadata_context = semantic_service.llm_context(resolution, metadata)
    time_info = _time_selection(payload)
    fallback_plan = _deterministic_plan(resolution, time_info)

    planner_call = call_llm(
        _planner_prompt(payload, resolution, time_info, metadata_context),
        "Bạn là bộ lập kế hoạch BI. Chỉ dùng metadata được cung cấp và trả JSON hợp lệ.",
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

    try:
        results, sql_used, repair_models = _execute_plan(plan, fallback_plan, metadata_context)
    except (SqlSafetyError, QueryExecutionError) as exc:
        raise HTTPException(status_code=400, detail=f"Không thể thực thi kế hoạch SQL an toàn: {str(exc)}")
    normalized = _normalize_results(results)
    evidence_payload = {
        "kpis": normalized["kpis"],
        "table_sample": normalized["table_rows"][:8],
        "trend": normalized["trend"][:30],
        "breakdown": normalized["breakdown"][:10],
        "row_counts": normalized["row_counts"],
    }
    synthesis_call = call_llm(
        json.dumps({
            "request": user_prompt,
            "interpreted_request": plan.get("interpreted_request") or fallback_plan["description"],
            "evidence": evidence_payload,
            "instruction": "Chỉ nêu kết luận được chứng minh bởi evidence. Không nói tăng trưởng nếu không có kỳ so sánh. Trả executive_summary, ai_insights[], recommendations[], evidence[].",
        }, ensure_ascii=False, default=json_serial),
        "Bạn là chuyên gia BI. Chỉ trả JSON tiếng Việt, tuyệt đối không bịa số liệu.",
    )
    deterministic = _deterministic_synthesis(normalized, time_info["label"])
    synthesis_data = synthesis_call.get("data") if synthesis_call else None
    if not isinstance(synthesis_data, dict) or not isinstance(synthesis_data.get("ai_insights"), list):
        synthesis_data = deterministic
        synthesis_meta = {"provider": "deterministic", "model": "grounded-summary-v1", "latency_ms": 0}
    else:
        synthesis_meta = {key: synthesis_call[key] for key in ("provider", "model", "latency_ms")}
        synthesis_data["evidence"] = deterministic["evidence"]
        synthesis_data.setdefault("recommendations", [])

    assumptions = time_info["assumptions"] + list(plan.get("assumptions") or [])
    assumptions = list(dict.fromkeys(str(item) for item in assumptions if item))
    interpreted = plan.get("interpreted_request") or f"{fallback_plan['description']} Phạm vi {time_info['label']}."
    provider_label = f"{synthesis_meta['provider']} / {synthesis_meta['model']}"
    return {
        "status": "success",
        "prompt": user_prompt,
        "context": context_text,
        "interpreted_request": interpreted,
        "title": plan.get("title") or fallback_plan["title"],
        "description": plan.get("description") or fallback_plan["description"],
        "assumptions": assumptions,
        "metadata_used": {
            "tables": resolution["tables"],
            "metrics": plan.get("metrics") or resolution["metrics"],
            "dimensions": plan.get("dimensions") or resolution["dimensions"],
            "source_relationships_recovered": len(metadata.get("recovered_relationships", [])),
        },
        "provider": {"planner": planner_meta, "synthesis": synthesis_meta, "repairs": repair_models},
        "model_used": provider_label,
        "kpis": normalized["kpis"],
        "trend_chart": normalized["trend"],
        "donut_chart": normalized["breakdown"],
        "bar_chart": normalized["breakdown"],
        "table_data": {
            "title": f"Dữ liệu trích xuất: {plan.get('title') or fallback_plan['title']}",
            "columns": normalized["table_columns"],
            "rows": normalized["table_rows"],
            "total_rows": normalized["row_counts"]["main"],
        },
        "executive_summary": synthesis_data.get("executive_summary") or deterministic["executive_summary"],
        "ai_insights": synthesis_data.get("ai_insights") or deterministic["ai_insights"],
        "recommendations": synthesis_data.get("recommendations") or deterministic["recommendations"],
        "evidence": synthesis_data.get("evidence") or deterministic["evidence"],
        "sql": sql_used,
        "sql_query": sql_used["main"],
        "visualizations": plan.get("visualizations") or fallback_plan["visualizations"],
        "created_at": datetime.now().astimezone().isoformat(),
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
