import os
from sqlalchemy import create_engine, text

db_url = "postgresql://root:12345@localhost:5432/avengers_db"
engine = create_engine(db_url)

with engine.connect() as conn:
    print("ALL BRANCHES:")
    rows = conn.execute(text("SELECT ten_chi_nhanh, dia_chi FROM identity.chi_nhanh LIMIT 20;")).fetchall()
    for r in rows:
        print(f"{r[0]} - {r[1]}")
    
    print("\nBRANCHES WITH 'tay':")
    rows = conn.execute(text("SELECT ten_chi_nhanh, dia_chi FROM identity.chi_nhanh WHERE LOWER(dia_chi) LIKE '%tay%' OR LOWER(ten_chi_nhanh) LIKE '%tay%';")).fetchall()
    for r in rows:
        print(f"{r[0]} - {r[1]}")
        
    print("\nBRANCHES WITH 'thanh':")
    rows = conn.execute(text("SELECT ten_chi_nhanh, dia_chi FROM identity.chi_nhanh WHERE LOWER(dia_chi) LIKE '%thanh%' OR LOWER(ten_chi_nhanh) LIKE '%thanh%';")).fetchall()
    for r in rows:
        print(f"{r[0]} - {r[1]}")
