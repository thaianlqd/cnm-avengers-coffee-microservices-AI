from typing import Optional
from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import get_filter_clauses

router = APIRouter(prefix="/api/customers", tags=["Customers Analytics"])


@router.get("/overview")
def get_customers_overview(
    date_range: Optional[str] = "30days",
    branch: Optional[str] = "all"
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                date_cond, date_params, _, _, branch_cond, branch_params, _ = get_filter_clauses(cur, date_range or "30days", branch or "all", "d")
                base_where = f"d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') AND {date_cond} AND {branch_cond}"
                base_params = date_params + branch_params

                # The source has points/spending snapshots but no governed tier
                # assignment. Never invent benefit tiers or add cumulative source
                # spending to order totals (which can describe the same purchases).
                membership_tiers = []

                # 2. Real Top Spenders
                cur.execute(f"""
                    SELECT 
                        COALESCE(d.ma_nguoi_dung, NULL::text, NULL::text, 'KH-' || SUBSTRING(d.ma_don_hang::text, 1, 8)) AS customer_code,
                        COALESCE(('Khách ' || LEFT(md5(u.ma_nguoi_dung::text), 10)), NULL::text, NULL::text, 'Khách vãng lai') AS customer_name,
                        COUNT(d.ma_don_hang) AS order_count,
                        COALESCE(SUM(d.tong_tien), 0) AS total_spent
                    FROM silver.don_hang d
                    LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    LEFT JOIN silver.nguoi_dung u ON d.ma_nguoi_dung = u.ma_nguoi_dung::text
                    WHERE {base_where}
                      AND (d.ma_nguoi_dung IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL)
                    GROUP BY customer_code, customer_name
                    ORDER BY total_spent DESC
                    LIMIT 15;
                """, base_params)
                top_customers = [dict(r) for r in cur.fetchall()]

                # 3. Monthly growth trend
                cur.execute(f"""
                    SELECT 
                        TO_CHAR(DATE_TRUNC('month', d.ngay_tao), 'YYYY-MM') as month_key,
                        'Tháng ' || TO_CHAR(DATE_TRUNC('month', d.ngay_tao), 'MM') as month,
                        COUNT(d.ma_don_hang) as total_orders,
                        COUNT(d.ma_don_hang) FILTER (WHERE d.ma_nguoi_dung IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL) as identified_orders,
                        COUNT(d.ma_don_hang) FILTER (WHERE d.ma_nguoi_dung IS NULL AND NULL::text IS NULL AND NULL::text IS NULL) as anonymous_orders
                    FROM silver.don_hang d
                    LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where}
                    GROUP BY DATE_TRUNC('month', d.ngay_tao)
                    ORDER BY DATE_TRUNC('month', d.ngay_tao) ASC;
                """, base_params)
                raw_growth = cur.fetchall()
                customer_growth = [
                    {
                        "month": r["month"],
                        "total_orders": int(r["total_orders"]),
                        "identified_orders": int(r["identified_orders"]),
                        "anonymous_orders": int(r["anonymous_orders"])
                    }
                    for r in raw_growth
                ]

                # 4. Real KPI from silver.don_hang & silver.nguoi_dung
                cur.execute("SELECT COUNT(*) as total_registered FROM silver.nguoi_dung WHERE vai_tro = 'CUSTOMER' OR vai_tro IS NULL;")
                registered_row = cur.fetchone() or {}
                total_registered = int(registered_row.get("total_registered") or 0)

                cur.execute(f"""
                    SELECT 
                        COUNT(DISTINCT CASE
                            WHEN d.ma_nguoi_dung IS NOT NULL THEN d.ma_nguoi_dung
                            WHEN NULL::text IS NOT NULL THEN NULL::text
                            WHEN NULL::text IS NOT NULL THEN NULL::text
                            WHEN NULL::text IS NOT NULL THEN NULL::text
                            ELSE NULL
                        END) AS identified_customers,
                        COUNT(d.ma_don_hang) FILTER (
                            WHERE d.ma_nguoi_dung IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL
                        ) AS identified_orders,
                        COUNT(*) FILTER (WHERE d.ma_nguoi_dung IS NULL AND NULL::text IS NULL AND NULL::text IS NULL AND NULL::text IS NULL) AS anonymous_orders,
                        COUNT(d.ma_don_hang) AS total_orders
                    FROM silver.don_hang d
                    LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where};
                """, base_params)
                kpi_stats = dict(cur.fetchone() or {})
                identified = int(kpi_stats.get("identified_customers") or 0)
                identified_ord = int(kpi_stats.get("identified_orders") or 0)
                anon_orders = int(kpi_stats.get("anonymous_orders") or 0)
                tot_ord = int(kpi_stats.get("total_orders") or 0)
                avg_freq = round(identified_ord / identified, 1) if identified > 0 else 0.0

                # Repeat customers (bought >= 2 times in period)
                cur.execute(f"""
                    WITH cust_orders AS (
                        SELECT 
                            COALESCE(d.ma_nguoi_dung, NULL::text, NULL::text, NULL::text) as cust_id,
                            COUNT(d.ma_don_hang) as o_count
                        FROM silver.don_hang d
                        LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE {base_where}
                          AND (d.ma_nguoi_dung IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL OR NULL::text IS NOT NULL)
                        GROUP BY cust_id
                        HAVING COUNT(d.ma_don_hang) >= 2
                    )
                    SELECT COUNT(*) as repeat_cust_count, COALESCE(SUM(o_count), 0) as repeat_orders_count FROM cust_orders;
                """, base_params)
                repeat_stats = dict(cur.fetchone() or {})
                repeat_cust = int(repeat_stats.get("repeat_cust_count") or 0)
                repeat_orders = int(repeat_stats.get("repeat_orders_count") or 0)

                # 5. Real behavior stats
                cur.execute(f"""
                    SELECT
                        COUNT(DISTINCT d.phuong_thuc_thanh_toan) AS payment_methods_used,
                        COALESCE(ROUND(AVG(d.tong_tien), 0), 0) AS avg_order_value,
                        COUNT(*) FILTER (WHERE d.loai_don_hang = 'GIAO_TAN_NOI') AS delivery_orders,
                        COUNT(*) FILTER (WHERE d.loai_don_hang IN ('MANG_DI', 'DUNG_TAI_CHO', 'LAY_TAI_QUAN', 'TAI_CHO')) AS store_orders
                    FROM silver.don_hang d
                    LEFT JOIN silver.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where};
                """, base_params)
                behavior_stats = dict(cur.fetchone() or {})

                return {
                    "kpi": {
                        "total_orders": tot_ord,
                        "total_registered": total_registered,
                        "total_customers": identified,
                        "identified_orders": identified_ord,
                        "anonymous_orders": anon_orders,
                        "active_accounts": identified,
                        "new_customers": None,
                        "repeat_customers": repeat_cust,
                        "repeat_orders": repeat_orders,
                        "avg_frequency": avg_freq
                    },
                    "population": {"customer_identity":"registered_account_only","personal_fields":"not_exposed","guest_identity":"not_resolved"},
                    "membership_tiers": membership_tiers,
                    "membership_status": {"status":"not_measured","reason":"no_governed_tier_assignment"},
                    "segments": membership_tiers,
                    "top_customers": top_customers,
                    "customer_growth": customer_growth,
                    "behavior": {
                        "delivery_orders": int(behavior_stats.get("delivery_orders") or 0),
                        "store_orders": int(behavior_stats.get("store_orders") or 0),
                        "avg_order_value": float(behavior_stats.get("avg_order_value") or 0),
                        "payment_methods_used": int(behavior_stats.get("payment_methods_used") or 0)
                    }
                }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Nguồn dữ liệu phân tích chưa sẵn sàng.') from None
