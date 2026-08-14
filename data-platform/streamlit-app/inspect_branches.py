import os
import sqlalchemy
import pandas as pd

# Supabase Credentials from previous context
DB_USER     = os.getenv("DB_USER", "postgres.qctwmsomtdixczwixewh")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Anhthang2002@")
DB_HOST     = os.getenv("DB_HOST", "aws-0-ap-southeast-1.pooler.supabase.com")
DB_PORT     = os.getenv("DB_PORT", "6543")
DB_NAME     = os.getenv("DB_NAME", "postgres")

def get_engine():
    url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=require"
    return sqlalchemy.create_engine(url, pool_pre_ping=True)

engine = get_engine()

with engine.connect() as conn:
    print("=== Số lượng đơn hàng theo chi nhánh ===")
    df = pd.read_sql("""
        SELECT co_so_ma, COUNT(*) as total_orders
        FROM orders.don_hang
        GROUP BY co_so_ma
        ORDER BY total_orders DESC
    """, conn)
    print(df)
    
    print("\n=== Số lượng chi tiết đơn hàng (chi_tiet_don_hang) ===")
    df2 = pd.read_sql("""
        SELECT d.co_so_ma, COUNT(*) as detail_count
        FROM orders.chi_tiet_don_hang ct
        JOIN orders.don_hang d ON d.ma_don_hang = ct.ma_don_hang
        GROUP BY d.co_so_ma
    """, conn)
    print(df2)
    
    # Try to see if there's a co_so table
    try:
        print("\n=== Bảng co_so ===")
        df3 = pd.read_sql("SELECT * FROM orders.co_so LIMIT 10", conn)
        print(df3)
    except Exception as e:
        print("Không có bảng orders.co_so hoặc lỗi:", e)
