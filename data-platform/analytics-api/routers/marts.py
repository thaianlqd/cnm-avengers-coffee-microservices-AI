from fastapi import APIRouter, HTTPException, Query
from db import get_db_conn
from common import get_filter_clauses

router = APIRouter(prefix="/api/marts", tags=["Data Marts"])


@router.get("/all")
def get_all_marts(
    date_range: str = Query("30days"),
    branch: str = Query("all"),
    payment_method: str = Query("all")
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                date_cond, date_params, prev_date_cond, prev_date_params, branch_cond, branch_params, ref_date = get_filter_clauses(cur, date_range, branch, "d")
                is_today = date_range == "today"

                # Payment method condition for Daily Chart
                pm_lower = (payment_method or "all").lower().strip()
                if pm_lower in ("all", "", "tat_ca"):
                    pm_cond = "1=1"
                    pm_params = []
                elif pm_lower in ("qr", "chuyen_khoan"):
                    pm_cond = "d.phuong_thuc_thanh_toan IN ('NGAN_HANG_QR', 'CHUYEN_KHOAN')"
                    pm_params = []
                elif pm_lower == "vnpay":
                    pm_cond = "d.phuong_thuc_thanh_toan = 'VNPAY'"
                    pm_params = []
                elif pm_lower in ("cod", "tien_mat"):
                    pm_cond = "d.phuong_thuc_thanh_toan IN ('TIEN_MAT', 'THANH_TOAN_KHI_NHAN_HANG')"
                    pm_params = []
                elif pm_lower in ("card", "the_vi"):
                    pm_cond = "d.phuong_thuc_thanh_toan IN ('THE_NGAN_HANG', 'VI_DIEN_TU')"
                    pm_params = []
                else:
                    pm_cond = "d.phuong_thuc_thanh_toan = %s"
                    pm_params = [payment_method]

                # 1. KPIs
                kpi_query = f"""
                    SELECT
                        COUNT(*) AS total_orders_all_time,
                        COALESCE(SUM(d.tong_tien) FILTER (WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS revenue_all_time,
                        COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'HOAN_THANH') AS completed_orders,
                        ROUND(100.0 * COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'HOAN_THANH') / NULLIF(COUNT(*), 0), 1) AS completion_rate,
                        COUNT(*) FILTER (WHERE d.trang_thai_don_hang = 'DANG_GIAO') AS active_deliveries
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {date_cond} AND {branch_cond};
                """
                cur.execute(kpi_query, date_params + branch_params)
                kpi_res = cur.fetchone()
                kpi_dict = dict(kpi_res) if kpi_res else {}

                # Calculate growth compared to previous period
                prev_rev = 0
                prev_orders = 0
                if date_range != "all":
                    prev_kpi_query = f"""
                        SELECT
                            COUNT(*) AS prev_orders,
                            COALESCE(SUM(d.tong_tien) FILTER (WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS prev_rev
                        FROM orders.don_hang d
                        LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE {prev_date_cond} AND {branch_cond};
                    """
                    cur.execute(prev_kpi_query, prev_date_params + branch_params)
                    prev_row = cur.fetchone()
                    if prev_row:
                        prev_orders = prev_row.get("prev_orders") or 0
                        prev_rev = float(prev_row.get("prev_rev") or 0)

                curr_rev = float(kpi_dict.get("revenue_all_time") or 0)
                curr_orders = int(kpi_dict.get("total_orders_all_time") or 0)
                curr_aov = round(curr_rev / curr_orders) if curr_orders > 0 else 0
                prev_aov = round(prev_rev / prev_orders) if prev_orders > 0 else 0

                if prev_rev > 0:
                    kpi_dict["revenue_growth"] = round(((curr_rev - prev_rev) / prev_rev) * 100, 1)
                else:
                    kpi_dict["revenue_growth"] = 0.0

                if prev_orders > 0:
                    kpi_dict["orders_growth"] = round(((curr_orders - prev_orders) / prev_orders) * 100, 1)
                else:
                    kpi_dict["orders_growth"] = 0.0

                if prev_aov > 0:
                    kpi_dict["aov_growth"] = round(((curr_aov - prev_aov) / prev_aov) * 100, 1)
                else:
                    kpi_dict["aov_growth"] = 0.0

                kpi_dict["aov"] = curr_aov
                kpi_dict["completion_rate"] = float(kpi_dict.get("completion_rate") or 0.0)

                # Real store counts from identity.chi_nhanh
                cur.execute("SELECT COUNT(*) AS total_stores, COUNT(*) FILTER (WHERE trang_thai = 'ACTIVE') AS active_stores FROM identity.chi_nhanh;")
                st_data = cur.fetchone() or {}
                kpi_dict["total_stores"] = int(st_data.get("total_stores") or 0)
                kpi_dict["active_stores"] = int(st_data.get("active_stores") or 0)

                # Real new customers count in last 30 days
                cur.execute("""
                    SELECT COUNT(DISTINCT CASE
                        WHEN ma_nguoi_dung IS NOT NULL THEN ma_nguoi_dung
                        WHEN guest_email IS NOT NULL THEN guest_email
                        WHEN ten_khach_hang IS NOT NULL THEN ten_khach_hang
                        WHEN guest_phone IS NOT NULL THEN guest_phone
                        ELSE NULL
                    END) AS new_customers
                    FROM orders.don_hang
                    WHERE ngay_tao >= (SELECT MAX(ngay_tao) - INTERVAL '30 days' FROM orders.don_hang);
                """)
                nc_row = cur.fetchone() or {}
                kpi_dict["new_customers"] = int(nc_row.get("new_customers") or 0)

                # 2. Revenue daily / hourly
                if is_today:
                    chart_sql = f"""
                        SELECT 
                            LPAD(EXTRACT(HOUR FROM d.ngay_tao)::text, 2, '0') || ':00' AS date,
                            COUNT(*) AS total_orders,
                            COALESCE(SUM(d.tong_tien), 0) AS revenue
                        FROM orders.don_hang d
                        LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                          AND {date_cond} AND {branch_cond} AND {pm_cond}
                        GROUP BY EXTRACT(HOUR FROM d.ngay_tao)
                        ORDER BY EXTRACT(HOUR FROM d.ngay_tao) ASC;
                    """
                else:
                    chart_sql = f"""
                        SELECT 
                            d.ngay_tao::date::text AS date,
                            COUNT(*) AS total_orders,
                            COALESCE(SUM(d.tong_tien), 0) AS revenue
                        FROM orders.don_hang d
                        LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                          AND {date_cond} AND {branch_cond} AND {pm_cond}
                        GROUP BY d.ngay_tao::date
                        ORDER BY date ASC;
                    """
                cur.execute(chart_sql, date_params + branch_params + pm_params)
                revenue_trend = [dict(r) for r in cur.fetchall()]

                # 3. Top products
                top_prods_sql = f"""
                    SELECT 
                        ct.ma_san_pham, 
                        ct.ten_san_pham, 
                        SUM(ct.so_luong) AS total_quantity, 
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS total_revenue
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY ct.ma_san_pham, ct.ten_san_pham
                    ORDER BY total_quantity DESC
                    LIMIT 15;
                """
                cur.execute(top_prods_sql, date_params + branch_params)
                top_products = [dict(r) for r in cur.fetchall()]

                # 4. Payment methods
                pm_sql = f"""
                    SELECT 
                        d.phuong_thuc_thanh_toan AS payment_method, 
                        COUNT(*) AS count, 
                        COALESCE(SUM(d.tong_tien), 0) AS revenue
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY d.phuong_thuc_thanh_toan
                    ORDER BY count DESC;
                """
                cur.execute(pm_sql, date_params + branch_params)
                payment_methods = [dict(r) for r in cur.fetchall()]

                # 5. Order status
                order_status_sql = f"""
                    SELECT 
                        d.trang_thai_don_hang AS status, 
                        COUNT(*) AS count,
                        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER(), 0), 1) AS pct
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {date_cond} AND {branch_cond}
                    GROUP BY d.trang_thai_don_hang
                    ORDER BY count DESC;
                """
                cur.execute(order_status_sql, date_params + branch_params)
                order_status = [dict(r) for r in cur.fetchall()]

                # 6. Customer segments RFM
                customer_segments = []
                cur.execute("SELECT to_regclass('gold.customer_segments') IS NOT NULL AS tbl_exists;")
                if cur.fetchone()["tbl_exists"]:
                    cur.execute("SELECT segment, count, avg_ltv FROM gold.customer_segments ORDER BY count DESC;")
                    customer_segments = [dict(r) for r in cur.fetchall()]

                # 7. Shipper performance
                shipper_perf = []
                cur.execute("SELECT to_regclass('gold.shipper_performance') IS NOT NULL AS tbl_exists;")
                if cur.fetchone()["tbl_exists"]:
                    cur.execute("SELECT shipper_id::text, total_deliveries, completed, failed, avg_delivery_min, success_rate FROM gold.shipper_performance ORDER BY completed DESC;")
                    shipper_perf = [dict(r) for r in cur.fetchall()]

                # 8. Branch taste sample
                taste_sample = []
                cur.execute("SELECT to_regclass('gold.branch_taste_profile') IS NOT NULL AS tbl_exists;")
                if cur.fetchone()["tbl_exists"]:
                    cur.execute("SELECT branch_code, ten_san_pham, size_variant, order_count, total_qty, avg_order_value FROM gold.branch_taste_profile ORDER BY total_qty DESC LIMIT 20;")
                    taste_sample = [dict(r) for r in cur.fetchall()]

                # 9. Hourly sales patterns
                hourly_sql = f"""
                    SELECT 
                        EXTRACT(HOUR FROM d.ngay_tao)::int AS hour,
                        COUNT(*) AS order_count,
                        COALESCE(SUM(d.tong_tien), 0) AS revenue
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY hour
                    ORDER BY hour;
                """
                cur.execute(hourly_sql, date_params + branch_params)
                hourly_sales = [dict(r) for r in cur.fetchall()]

                # 9.1 Weekday sales patterns
                weekday_sql = f"""
                    SELECT 
                        EXTRACT(ISODOW FROM d.ngay_tao)::int AS dow,
                        COUNT(*) AS order_count,
                        COALESCE(SUM(d.tong_tien), 0) AS revenue
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY dow
                    ORDER BY dow;
                """
                cur.execute(weekday_sql, date_params + branch_params)
                dow_map = {1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7', 7: 'Chủ nhật'}
                weekday_dict = {r["dow"]: r for r in cur.fetchall()}
                weekday_sales = [
                    {
                        "label": dow_map[d],
                        "value": int(weekday_dict.get(d, {}).get("order_count") or 0),
                        "revenue": float(weekday_dict.get(d, {}).get("revenue") or 0)
                    }
                    for d in range(1, 8)
                ]

                # 10. All Detailed Category sales breakdown (full categories, not collapsed to 3)
                category_sql = f"""
                    SELECT 
                        REPLACE(COALESCE(dm.ten_danh_muc, pdm.ten_danh_muc, 'Khác'), '&', 'và') AS category_name,
                        REPLACE(COALESCE(pdm.ten_danh_muc, 'Khác'), '&', 'và') AS parent_category,
                        SUM(ct.so_luong) AS total_qty,
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS revenue
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN menu.danh_muc pdm ON dm.ma_danh_muc_cha = pdm.ma_danh_muc
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY category_name, parent_category
                    ORDER BY revenue DESC;
                """
                cur.execute(category_sql, date_params + branch_params)
                category_sales = [dict(r) for r in cur.fetchall()]

                # Parent category aggregate
                parent_category_sql = f"""
                    SELECT 
                        REPLACE(COALESCE(pdm.ten_danh_muc, dm.ten_danh_muc, 'Cà Phê'), '&', 'và') AS category_name,
                        SUM(ct.so_luong) AS total_qty,
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS revenue
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN menu.danh_muc pdm ON dm.ma_danh_muc_cha = pdm.ma_danh_muc
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY category_name
                    ORDER BY revenue DESC;
                """
                cur.execute(parent_category_sql, date_params + branch_params)
                parent_category_sales = [dict(r) for r in cur.fetchall()]

                # Subcategories breakdown
                sub_category_sql = f"""
                    SELECT 
                        REPLACE(COALESCE(dm.ten_danh_muc, 'Khác'), '&', 'và') AS category_name,
                        REPLACE(COALESCE(pdm.ten_danh_muc, 'Khác'), '&', 'và') AS parent_category,
                        SUM(ct.so_luong) AS total_qty,
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS revenue
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN menu.danh_muc pdm ON dm.ma_danh_muc_cha = pdm.ma_danh_muc
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY category_name, parent_category
                    ORDER BY revenue DESC;
                """
                cur.execute(sub_category_sql, date_params + branch_params)
                sub_category_sales = [dict(r) for r in cur.fetchall()]

                # All system categories
                cur.execute("SELECT ma_danh_muc, REPLACE(ten_danh_muc, '&', 'và') AS ten_danh_muc, cap_bac, ma_danh_muc_cha FROM menu.danh_muc ORDER BY cap_bac ASC, ten_danh_muc ASC;")
                all_catalog_categories = [dict(r) for r in cur.fetchall()]

                # 11. Top branches by revenue
                top_branches_sql = f"""
                    SELECT 
                        COALESCE(cn.ten_chi_nhanh, d.co_so_ma) AS branch_name,
                        d.co_so_ma AS branch_code,
                        COUNT(d.ma_don_hang) AS total_orders,
                        COALESCE(SUM(d.tong_tien), 0) AS revenue,
                        ROUND(AVG(d.tong_tien), 0) AS avg_order_value
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                      AND {date_cond} AND {branch_cond}
                    GROUP BY d.co_so_ma, cn.ten_chi_nhanh
                    ORDER BY revenue DESC
                    LIMIT 15;
                """
                cur.execute(top_branches_sql, date_params + branch_params)
                top_branches = [dict(r) for r in cur.fetchall()]

                # 12. Recent sales for dashboard
                recent_sales_sql = f"""
                    SELECT 
                        TO_CHAR(d.ngay_tao, 'DD/MM/YYYY HH24:MI') AS order_time,
                        COALESCE(cn.ten_chi_nhanh, d.co_so_ma, 'Cửa hàng') AS store_name,
                        COALESCE(ct.ten_san_pham, 'Cà phê') AS product_name,
                        COALESCE(ct.so_luong, 1) AS quantity,
                        COALESCE(ct.so_luong * ct.gia_ban, d.tong_tien, 0) AS total_amount
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    LEFT JOIN LATERAL (
                        SELECT ten_san_pham, so_luong, gia_ban 
                        FROM orders.chi_tiet_don_hang 
                        WHERE ma_don_hang = d.ma_don_hang 
                        LIMIT 1
                    ) ct ON true
                    WHERE d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')
                    ORDER BY d.ngay_tao DESC
                    LIMIT 5;
                """
                cur.execute(recent_sales_sql)
                recent_sales = [dict(r) for r in cur.fetchall()]

                return {
                    "kpi": kpi_dict,
                    "revenue_daily": revenue_trend,
                    "top_products": top_products,
                    "payment_methods": payment_methods,
                    "order_status": order_status,
                    "customer_segments": customer_segments,
                    "shipper_performance": shipper_perf,
                    "branch_taste": taste_sample,
                    "hourly_sales": hourly_sales,
                    "weekday_sales": weekday_sales,
                    "category_sales": category_sales,
                    "parent_category_sales": parent_category_sales,
                    "sub_category_sales": sub_category_sales,
                    "all_categories": all_catalog_categories,
                    "top_branches": top_branches,
                    "recent_sales": recent_sales,
                    "filters_applied": {
                        "date_range": date_range,
                        "branch": branch,
                        "payment_method": payment_method,
                        "reference_date": str(ref_date)
                    }
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
