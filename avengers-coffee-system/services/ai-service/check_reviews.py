import os
from sqlalchemy import create_engine, text

# Get DB URI from environment or default
db_uri = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/avengers_db")
engine = create_engine(db_uri)

with engine.connect() as conn:
    print("--- Reviews in danh_gia_san_pham ---")
    rows = conn.execute(text("SELECT * FROM orders.danh_gia_san_pham")).mappings().all()
    for r in rows:
        print(dict(r))
        
    print("\n--- Products with ratings ---")
    rows = conn.execute(text("""
        SELECT sp.ten_san_pham, dg.so_sao 
        FROM menu.san_pham sp 
        JOIN orders.danh_gia_san_pham dg ON sp.ma_san_pham::text = dg.ma_san_pham::text
    """)).mappings().all()
    for r in rows:
        print(dict(r))
