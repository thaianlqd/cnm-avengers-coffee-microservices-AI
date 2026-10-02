from typing import Optional
from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import get_filter_clauses

router = APIRouter(prefix="/api/products", tags=["Products & Menu Analytics"])


@router.get("/overview")
def get_products_overview(
    date_range: Optional[str] = "30days",
    branch: Optional[str] = "all"
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                date_cond, date_params, _, _, branch_cond, branch_params, _ = get_filter_clauses(cur, date_range or "30days", branch or "all", "d")
                base_where = f"d.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO') AND {date_cond} AND {branch_cond}"
                base_params = date_params + branch_params

                cur.execute(f"""
                    SELECT 
                        sp.ma_san_pham, 
                        sp.ten_san_pham,
                        SUM(ct.so_luong) AS total_quantity, 
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS total_revenue 
                    FROM orders.chi_tiet_don_hang ct
                    JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where}
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham
                    ORDER BY total_quantity DESC 
                    LIMIT 15;
                """, base_params)
                top_products = [dict(r) for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT 
                        REPLACE(COALESCE(dm.ten_danh_muc, pdm.ten_danh_muc, 'Khác'), '&', 'và') AS category_name,
                        REPLACE(COALESCE(pdm.ten_danh_muc, 'Khác'), '&', 'và') AS parent_category,
                        SUM(ct.so_luong) AS total_qty,
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS revenue
                    FROM orders.chi_tiet_don_hang ct
                    LEFT JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN menu.danh_muc pdm ON dm.ma_danh_muc_cha = pdm.ma_danh_muc
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where}
                    GROUP BY category_name, parent_category
                    ORDER BY revenue DESC;
                """, base_params)
                categories = [dict(r) for r in cur.fetchall()]

                # All catalog categories
                cur.execute("SELECT ma_danh_muc, REPLACE(ten_danh_muc, '&', 'và') AS ten_danh_muc, cap_bac, ma_danh_muc_cha FROM menu.danh_muc ORDER BY cap_bac ASC, ten_danh_muc ASC;")
                catalog_categories = [dict(r) for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT 
                        sp.ma_san_pham AS product_id, 
                        sp.ten_san_pham AS product_name, 
                        REPLACE(COALESCE(pdm.ten_danh_muc, dm.ten_danh_muc, 'Khác'), '&', 'và') AS category_name, 
                        REPLACE(COALESCE(dm.ten_danh_muc, 'Khác'), '&', 'và') AS sub_category_name,
                        sp.gia_ban AS price, 
                        COALESCE(SUM(ct.so_luong), 0) AS total_sold, 
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS total_revenue
                    FROM menu.san_pham sp
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN menu.danh_muc pdm ON dm.ma_danh_muc_cha = pdm.ma_danh_muc
                    LEFT JOIN orders.chi_tiet_don_hang ct ON sp.ma_san_pham = ct.ma_san_pham
                    LEFT JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE (d.ma_don_hang IS NULL OR ({base_where}))
                    GROUP BY sp.ma_san_pham, sp.ten_san_pham, pdm.ten_danh_muc, dm.ten_danh_muc, sp.gia_ban
                    ORDER BY total_sold DESC;
                """, base_params)
                all_products = [dict(r) for r in cur.fetchall()]
                total_rev = sum(p["total_revenue"] for p in top_products)
                total_qty = sum(p["total_quantity"] for p in top_products)

                # Revenue trend
                cur.execute(f"""
                    SELECT 
                        d.ngay_tao::date::text AS date_str,
                        COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS revenue
                    FROM orders.chi_tiet_don_hang ct
                    JOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang
                    LEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh
                    WHERE {base_where}
                    GROUP BY d.ngay_tao::date
                    ORDER BY d.ngay_tao::date DESC LIMIT 30;
                """, base_params)
                revenue_trend = [{"date": r["date_str"], "revenue": int(r["revenue"])} for r in cur.fetchall()]
                revenue_trend.reverse()

                return {
                    "kpi": {
                        "total_products": len(all_products),
                        "best_sellers": len(top_products),
                        "total_revenue": total_rev,
                        "total_sold": total_qty,
                        "categories_count": len(categories)
                    },
                    "top_products": top_products,
                    "categories": categories,
                    "catalog_categories": catalog_categories,
                    "all_products": all_products,
                    "revenue_trend": revenue_trend
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
