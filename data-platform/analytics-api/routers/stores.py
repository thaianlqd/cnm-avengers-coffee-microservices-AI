from typing import Optional
from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import get_filter_clauses

router = APIRouter(prefix="/api/stores", tags=["Stores Analytics"])


def fetch_stores_analytics(
    search: Optional[str] = "",
    city: Optional[str] = "all",
    status: Optional[str] = "all",
    date_range: Optional[str] = "30days",
    branch: Optional[str] = "all"
):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                date_cond, date_params, _, _, branch_cond, branch_params, _ = get_filter_clauses(
                    cur, date_range or "30days", branch or "all", "o"
                )

                where_clauses = ["1=1"]
                filter_params = []

                if search and search.strip():
                    where_clauses.append("(cn.ten_chi_nhanh ILIKE %s OR cn.ma_chi_nhanh ILIKE %s OR cn.dia_chi ILIKE %s)")
                    s = f"%{search.strip()}%"
                    filter_params.extend([s, s, s])
                if city and city != "all":
                    where_clauses.append("cn.thanh_pho ILIKE %s")
                    filter_params.append(f"%{city}%")
                if status and status != "all":
                    st_val = "ACTIVE" if status.lower() in ("hoạt động", "active") else "MAINTENANCE"
                    where_clauses.append("cn.trang_thai = %s")
                    filter_params.append(st_val)

                if branch_cond != "1=1":
                    store_branch_cond = branch_cond.replace("o.co_so_ma", "cn.ma_chi_nhanh")
                    where_clauses.append(store_branch_cond)
                    filter_params.extend(branch_params)

                query = f"""
                    SELECT
                        cn.ma_chi_nhanh AS store_code,
                        cn.ten_chi_nhanh AS store_name,
                        COALESCE(cn.thanh_pho, 'TP.HCM') AS city,
                        COALESCE(cn.dia_chi, 'Đang cập nhật') AS address,
                        CASE WHEN cn.trang_thai = 'ACTIVE' THEN 'Hoạt động' ELSE 'Bảo trì' END AS status,
                        COUNT(o.ma_don_hang) AS total_orders,
                        COALESCE(SUM(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS total_revenue,
                        COALESCE(ROUND(AVG(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0), 0) AS aov
                    FROM identity.chi_nhanh cn
                    LEFT JOIN orders.don_hang o ON cn.ma_chi_nhanh = o.co_so_ma AND {date_cond}
                    WHERE {' AND '.join(where_clauses)}
                    GROUP BY cn.ma_chi_nhanh, cn.ten_chi_nhanh, cn.thanh_pho, cn.dia_chi, cn.trang_thai
                    ORDER BY total_revenue DESC
                    LIMIT 100;
                """
                cur.execute(query, date_params + filter_params)
                stores = [dict(r) for r in cur.fetchall()]

                total_st = len(stores)
                act_st = sum(1 for s in stores if s["status"] == "Hoạt động")
                tot_rev = sum(s["total_revenue"] for s in stores)
                avg_rev = round(tot_rev / total_st, 0) if total_st > 0 else 0

                summary = {
                    "total_stores": total_st,
                    "active_stores": act_st,
                    "maintenance_stores": total_st - act_st,
                    "avg_revenue_per_store": avg_rev
                }

                city_map = {}
                for s in stores:
                    c = s.get("city") or "Khác"
                    city_map[c] = city_map.get(c, 0) + float(s.get("total_revenue", 0))

                revenue_by_city = [
                    {"city": k, "revenue": v}
                    for k, v in sorted(city_map.items(), key=lambda x: x[1], reverse=True)
                ]

                top_stores = stores[:8]

                return {
                    "stores": stores,
                    "summary": summary,
                    "top_stores": top_stores,
                    "revenue_by_city": revenue_by_city
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
def get_stores_overview(
    search: Optional[str] = "",
    city: Optional[str] = "all",
    status: Optional[str] = "all",
    date_range: Optional[str] = "30days",
    branch: Optional[str] = "all"
):
    return fetch_stores_analytics(search, city, status, date_range, branch)


@router.get("/list")
def get_stores_list(
    search: Optional[str] = "",
    city: Optional[str] = "all",
    status: Optional[str] = "all",
    date_range: Optional[str] = "30days",
    branch: Optional[str] = "all"
):
    return fetch_stores_analytics(search, city, status, date_range, branch)
