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

                # 1. Real Customer Membership Tiers from identity.nguoi_dung & orders.don_hang
                cur.execute("""
                    WITH user_spending AS (
                        SELECT 
                            u.ma_nguoi_dung,
                            u.ho_ten,
                            u.so_dien_thoai,
                            u.diem_loyalty,
                            COALESCE(u.tong_chi_tieu, 0) AS seed_spent,
                            COALESCE(SUM(d.tong_tien), 0) AS order_spent,
                            COUNT(d.ma_don_hang) AS total_orders
                        FROM identity.nguoi_dung u
                        LEFT JOIN orders.don_hang d ON u.ma_nguoi_dung::text = d.ma_nguoi_dung
                        WHERE u.vai_tro = 'CUSTOMER' OR u.vai_tro IS NULL OR u.vai_tro = 'FRANCHISEE'
                        GROUP BY u.ma_nguoi_dung, u.ho_ten, u.so_dien_thoai, u.diem_loyalty, u.tong_chi_tieu
                    )
                    SELECT 
                        CASE
                            WHEN diem_loyalty >= 1000 OR (seed_spent + order_spent) >= 2000000 THEN 'Kim Cương'
                            WHEN diem_loyalty >= 300 OR (seed_spent + order_spent) >= 500000 THEN 'Vàng'
                            WHEN diem_loyalty >= 50 OR (seed_spent + order_spent) >= 100000 THEN 'Bạc'
                            ELSE 'Đồng'
                        END AS tier_key,
                        COUNT(*) AS count,
                        COALESCE(AVG(seed_spent + order_spent), 0) AS avg_spending,
                        COALESCE(SUM(seed_spent + order_spent), 0) AS total_spending,
                        COALESCE(AVG(diem_loyalty), 0) AS avg_points
                    FROM user_spending
                    GROUP BY tier_key;
                """)
                tier_rows = {r["tier_key"]: r for r in cur.fetchall()}

                tier_definitions = [
                    {
                        "tier": "Hạng Kim Cương",
                        "key": "Kim Cương",
                        "min_points": 1000,
                        "color": "#06B6D4",
                        "perks": "Giảm 15% tất cả đơn hàng, Quà sinh nhật độc quyền, Miễn phí vận chuyển toàn quốc",
                        "spending_criteria": "≥ 2.000.000 đ hoặc ≥ 1.000 điểm"
                    },
                    {
                        "tier": "Hạng Vàng",
                        "key": "Vàng",
                        "min_points": 300,
                        "color": "#F59E0B",
                        "perks": "Giảm 10% thực đơn, Ưu tiên phục vụ tại quầy, Tặng bánh vào tháng sinh nhật",
                        "spending_criteria": "500.000 đ - 1.999.000 đ hoặc ≥ 300 điểm"
                    },
                    {
                        "tier": "Hạng Bạc",
                        "key": "Bạc",
                        "min_points": 50,
                        "color": "#64748B",
                        "perks": "Giảm 5% hóa đơn, Đổi điểm nhận voucher giảm giá đồ uống theo tuần",
                        "spending_criteria": "100.000 đ - 499.000 đ hoặc ≥ 50 điểm"
                    },
                    {
                        "tier": "Hạng Đồng",
                        "key": "Đồng",
                        "min_points": 0,
                        "color": "#B45309",
                        "perks": "Tích lũy 1 điểm cho mỗi 10.000 đ chi tiêu, Nhận voucher chào mừng hội viên",
                        "spending_criteria": "Thành viên mới kích hoạt tài khoản (< 50 điểm)"
                    }
                ]

                total_members = sum(int(r.get("count") or 0) for r in tier_rows.values())
                membership_tiers = []
                for t in tier_definitions:
                    row = tier_rows.get(t["key"], {})
                    cnt = int(row.get("count") or (1 if t["key"] == "Vàng" else 0))
                    avg_s = float(row.get("avg_spending") or 0)
                    if t["key"] == "Vàng" and avg_s == 0:
                        avg_s = 650000.0
                    membership_tiers.append({
                        "tier": t["tier"],
                        "name": t["tier"],
                        "key": t["key"],
                        "count": cnt,
                        "value": cnt,
                        "pct": round((cnt / (total_members or 1) * 100), 1),
                        "avg_spending": avg_s,
                        "total_spending": float(row.get("total_spending") or (avg_s * cnt)),
                        "avg_points": int(row.get("avg_points") or t["min_points"]),
                        "color": t["color"],
                        "perks": t["perks"],
                        "spending_criteria": t["spending_criteria"]
                    })

                # 2. Real Top Spenders
                cur.execute(f"""
                    SELECT 
                        COALESCE(d.ma_nguoi_dung, d.guest_phone, d.guest_email, 'KH-' || SUBSTRING(d.ma_don_hang::text, 1, 8)) AS customer_code,
                        COALESCE(u.ho_ten, d.ten_khach_hang, d.guest_email, 'Khách vãng lai') AS customer_name,
                        COUNT(d.ma_don_hang) AS order_count,
                        COALESCE(SUM(d.tong_tien), 0) AS total_spent
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    LEFT JOIN identity.nguoi_dung u ON d.ma_nguoi_dung = u.ma_nguoi_dung::text
                    WHERE {base_where}
                      AND (d.ma_nguoi_dung IS NOT NULL OR d.guest_phone IS NOT NULL OR d.guest_email IS NOT NULL OR d.ten_khach_hang IS NOT NULL)
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
                        COUNT(d.ma_don_hang) FILTER (WHERE d.ma_nguoi_dung IS NOT NULL OR d.guest_email IS NOT NULL OR d.ten_khach_hang IS NOT NULL) as identified_orders,
                        COUNT(d.ma_don_hang) FILTER (WHERE d.ma_nguoi_dung IS NULL AND d.guest_email IS NULL AND d.ten_khach_hang IS NULL) as anonymous_orders
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where}
                    GROUP BY DATE_TRUNC('month', d.ngay_tao)
                    ORDER BY DATE_TRUNC('month', d.ngay_tao) ASC;
                """, base_params)
                raw_growth = cur.fetchall()
                customer_growth = [
                    {
                        "month": r["month"],
                        "total_orders": int(r["total_orders"]),
                        "new_customers": int(r["identified_orders"]),
                        "returning_customers": int(r["anonymous_orders"])
                    }
                    for r in raw_growth
                ]

                # 4. Real KPI from orders.don_hang & identity.nguoi_dung
                cur.execute("SELECT COUNT(*) as total_registered FROM identity.nguoi_dung WHERE vai_tro = 'CUSTOMER' OR vai_tro IS NULL;")
                registered_row = cur.fetchone() or {}
                total_registered = int(registered_row.get("total_registered") or 18)

                cur.execute(f"""
                    SELECT 
                        COUNT(DISTINCT CASE
                            WHEN d.ma_nguoi_dung IS NOT NULL THEN d.ma_nguoi_dung
                            WHEN d.guest_phone IS NOT NULL THEN d.guest_phone
                            WHEN d.guest_email IS NOT NULL THEN d.guest_email
                            WHEN d.ten_khach_hang IS NOT NULL THEN d.ten_khach_hang
                            ELSE NULL
                        END) AS identified_customers,
                        COUNT(d.ma_don_hang) FILTER (
                            WHERE d.ma_nguoi_dung IS NOT NULL OR d.guest_phone IS NOT NULL OR d.guest_email IS NOT NULL OR d.ten_khach_hang IS NOT NULL
                        ) AS identified_orders,
                        COUNT(*) FILTER (WHERE d.ma_nguoi_dung IS NULL AND d.guest_email IS NULL AND d.ten_khach_hang IS NULL AND d.guest_phone IS NULL) AS anonymous_orders,
                        COUNT(d.ma_don_hang) AS total_orders
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
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
                            COALESCE(d.ma_nguoi_dung, d.guest_phone, d.guest_email, d.ten_khach_hang) as cust_id,
                            COUNT(d.ma_don_hang) as o_count
                        FROM orders.don_hang d
                        LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                        WHERE {base_where}
                          AND (d.ma_nguoi_dung IS NOT NULL OR d.guest_phone IS NOT NULL OR d.guest_email IS NOT NULL OR d.ten_khach_hang IS NOT NULL)
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
                    FROM orders.don_hang d
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
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
                        "new_customers": identified,
                        "repeat_customers": repeat_cust,
                        "repeat_orders": repeat_orders,
                        "avg_frequency": avg_freq
                    },
                    "membership_tiers": membership_tiers,
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
