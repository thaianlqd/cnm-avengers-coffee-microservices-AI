import os
import sqlalchemy

url = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}?sslmode={os.getenv('DB_SSLMODE', 'disable')}"
engine = sqlalchemy.create_engine(url)

print("Starting fake data cleanup...")
with engine.connect() as conn:
    trans = conn.begin()
    try:
        # Delete from customer_wallet_transaction
        conn.execute(sqlalchemy.text("DELETE FROM orders.customer_wallet_transaction WHERE type IN ('TOP_UP', 'PAYMENT') AND amount IN (35000, 45000, 70000, 100000, 50000, 200000, 500000)"))
        
        # Identify fake orders
        fake_branches = ['CN_Q1', 'CN_Q3', 'CN_TUDUC']
        
        # Delete from delivery_tracking
        conn.execute(sqlalchemy.text("DELETE FROM orders.delivery_tracking WHERE branch_code IN :branches"), {"branches": tuple(fake_branches)})
        
        # Delete from shipper_delivery (we need to join don_hang)
        conn.execute(sqlalchemy.text("""
            DELETE FROM orders.shipper_delivery 
            WHERE ma_don_hang IN (
                SELECT ma_don_hang FROM orders.don_hang WHERE co_so_ma IN :branches
            )
        """), {"branches": tuple(fake_branches)})
        
        # Delete from chi_tiet_don_hang
        conn.execute(sqlalchemy.text("""
            DELETE FROM orders.chi_tiet_don_hang 
            WHERE ma_don_hang IN (
                SELECT ma_don_hang FROM orders.don_hang WHERE co_so_ma IN :branches
            )
        """), {"branches": tuple(fake_branches)})
        
        # Delete from don_hang
        res = conn.execute(sqlalchemy.text("DELETE FROM orders.don_hang WHERE co_so_ma IN :branches"), {"branches": tuple(fake_branches)})
        
        print(f"Deleted {res.rowcount} fake orders and their related data.")
        trans.commit()
    except Exception as e:
        print(f"Error: {e}")
        trans.rollback()

print("Cleanup complete!")
