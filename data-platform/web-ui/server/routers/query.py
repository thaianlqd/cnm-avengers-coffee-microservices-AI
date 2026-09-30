import re
import time
from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import SqlQueryRequest

router = APIRouter(prefix="/api", tags=["SQL & Warehouse Explorer"])


@router.get("/warehouse/tables")
def get_warehouse_tables():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        c.table_name,
                        c.column_name,
                        c.data_type,
                        c.ordinal_position
                    FROM information_schema.columns c
                    WHERE c.table_schema = 'gold'
                    ORDER BY c.table_name, c.ordinal_position;
                """)
                rows = cur.fetchall()

                table_descriptions = {
                    "revenue_daily": "Bảng tổng hợp doanh thu và số đơn hàng theo từng ngày",
                    "top_products": "Bảng xếp hạng sản phẩm bán chạy nhất và doanh thu từng món",
                    "stores_overview": "Bảng tổng quan hiệu suất kinh doanh, doanh thu và AOV từng cửa hàng",
                    "customer_segments": "Bảng phân khúc khách hàng theo mô hình RFM và giá trị vòng đời (LTV)",
                    "branch_taste_profile": "Bảng phân tích khẩu vị, kích cỡ và số lượng đặt theo chi nhánh",
                    "payment_methods_distribution": "Bảng thống kê tỷ trọng và doanh thu theo hình thức thanh toán",
                    "order_status_distribution": "Bảng phân bổ tỷ lệ trạng thái hoàn thành và giao hàng",
                    "shipper_performance": "Bảng đánh giá hiệu suất, thời gian giao và tỷ lệ thành công của tài xế",
                    "menu_overview": "Bảng danh mục thực đơn và doanh thu tích lũy sản phẩm",
                    "kpi_summary": "Bảng chỉ số tổng quan điều hành toàn chuỗi cà phê"
                }

                tables_dict = {}
                for r in rows:
                    t_name = r["table_name"]
                    if t_name not in tables_dict:
                        tables_dict[t_name] = {
                            "name": f"gold.{t_name}",
                            "table_name": t_name,
                            "schema": "gold",
                            "description": table_descriptions.get(t_name, "Bảng dữ liệu Data Warehouse"),
                            "columns": []
                        }
                    tables_dict[t_name]["columns"].append({
                        "name": r["column_name"],
                        "type": r["data_type"]
                    })

                sample_queries = [
                    {
                        "title": "Top 10 sản phẩm bán chạy nhất kho dữ liệu",
                        "sql": "SELECT ma_san_pham, ten_san_pham, total_quantity, total_revenue\nFROM gold.top_products\nORDER BY total_quantity DESC\nLIMIT 10;"
                    },
                    {
                        "title": "Doanh thu 14 ngày gần nhất trong Data Warehouse",
                        "sql": "SELECT date, total_orders, revenue\nFROM gold.revenue_daily\nORDER BY date DESC\nLIMIT 14;"
                    },
                    {
                        "title": "Hiệu suất 10 cửa hàng có doanh thu cao nhất",
                        "sql": "SELECT store_code, store_name, city, total_orders, total_revenue, aov\nFROM gold.stores_overview\nORDER BY total_revenue DESC\nLIMIT 10;"
                    },
                    {
                        "title": "Phân khúc khách hàng RFM và giá trị LTV",
                        "sql": "SELECT segment, count, avg_ltv\nFROM gold.customer_segments\nORDER BY count DESC;"
                    },
                    {
                        "title": "Phân bổ theo hình thức thanh toán",
                        "sql": "SELECT payment_method, count, revenue\nFROM gold.payment_methods_distribution\nORDER BY revenue DESC;"
                    }
                ]

                return {
                    "warehouse": "BeanSync Data Warehouse",
                    "schema": "gold",
                    "tables": list(tables_dict.values()),
                    "sample_queries": sample_queries
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
def run_custom_query(req: SqlQueryRequest):
    clean_sql = req.sql.strip()
    upper_sql = clean_sql.upper()

    # Strictly read-only SELECT or WITH
    if not (upper_sql.startswith("SELECT") or upper_sql.startswith("WITH")):
        raise HTTPException(status_code=400, detail="Chỉ cho phép câu lệnh truy vấn đọc dữ liệu (SELECT hoặc WITH).")

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "EXECUTE"]
    for keyword in forbidden:
        if re.search(r'\b' + keyword + r'\b', upper_sql):
            raise HTTPException(status_code=400, detail=f"Không được phép chứa thao tác nguy hiểm '{keyword}'.")

    start_time = time.time()
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SET search_path TO gold, orders, menu, identity, inventory, analytics, public;")
                cur.execute(clean_sql)
                rows = cur.fetchall()
                duration = int((time.time() - start_time) * 1000)
                columns = [desc[0] for desc in cur.description] if cur.description else []
                return {
                    "columns": columns,
                    "data": [dict(r) for r in rows],
                    "count": len(rows),
                    "duration_ms": duration,
                    "target_layer": "Data Warehouse (gold)"
                }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi SQL: {str(e)}")
