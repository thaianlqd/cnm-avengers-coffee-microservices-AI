import os
import sys
from sqlalchemy import text
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

sys.path.append(os.path.join(os.path.dirname(__file__), 'avengers-coffee-system', 'services', 'ai-service'))
from db import get_db_engine

engine = get_db_engine()

menu_schema = os.getenv("MENU_SCHEMA", "menu")
order_schema = os.getenv("ORDER_SCHEMA", "orders")

print(f"MENU_SCHEMA: {menu_schema}")
print(f"ORDER_SCHEMA: {order_schema}")

try:
    with engine.connect() as conn:
        print("--- Testing get_recommendations query ---")
        query = text(f"""
            SELECT sp.ten_san_pham, sp.ma_san_pham, dg.ma_san_pham as dg_ma_san_pham, COALESCE(AVG(dg.so_sao), 0) as avg_rating
            FROM {menu_schema}.san_pham sp
            JOIN {order_schema}.danh_gia_san_pham dg ON sp.ma_san_pham::text = dg.ma_san_pham::text
            WHERE sp.trang_thai = TRUE
            GROUP BY sp.ma_san_pham, sp.ten_san_pham, dg.ma_san_pham
            ORDER BY avg_rating DESC
        """)
        rows = conn.execute(query).fetchall()
        print(f"Results: {rows}")
        
        print("\n--- Testing ALL reviews in DB ---")
        query2 = text(f"""
            SELECT id, ma_san_pham, so_sao, binh_luan
            FROM {order_schema}.danh_gia_san_pham
        """)
        rows2 = conn.execute(query2).fetchall()
        print(f"All Reviews: {rows2}")
        
except Exception as e:
    print(f"Error: {e}")
