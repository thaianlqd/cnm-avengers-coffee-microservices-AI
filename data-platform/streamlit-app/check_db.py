import os
import sqlalchemy

url = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}?sslmode=require"
print(f"Connecting to: {os.getenv('DB_HOST')}")
engine = sqlalchemy.create_engine(url)

try:
    with engine.connect() as conn:
        res = conn.execute(sqlalchemy.text("SELECT DISTINCT co_so_ma FROM orders.don_hang"))
        branches = [r[0] for r in res]
        print(f"Branches in DB: {branches}")
except Exception as e:
    print(f"Error: {e}")
