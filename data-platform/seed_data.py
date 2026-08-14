import os
import random
import uuid
import datetime
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load .env file from the root directory
load_dotenv(dotenv_path="../.env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "postgres")

def get_conn():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
        sslmode="require" if "supabase" in DB_HOST.lower() else "prefer"
    )

BRANCHES = ["CN_Q1", "CN_Q3", "CN_TUDUC"]
PRODUCTS = [
    ("Cà phê đen", 25000), ("Espresso", 35000), ("Bạc xỉu", 30000),
    ("Trà sữa trân châu", 45000), ("Matcha Latte", 50000),
    ("Trà đào cam sả", 45000), ("Cold Brew", 40000)
]
SIZES = ["S", "M", "L"]
PAYMENT_METHODS = ["TIEN_MAT", "THANH_TOAN_KHI_NHAN_HANG", "QR_CODE", "VNPAY", "MOMO", "VI_AVENGERS", "WALLET"]
DELIVERY_MODES = ["GIAO_TAN_NOI", "LAY_TAI_QUAN", "DUNG_TAI_CHO"]
DELIVERY_METHODS = ["INTERNAL", "LALAMOVE"]
SHIPPERS = [str(uuid.uuid4()) for _ in range(3)]
CUSTOMERS = [str(uuid.uuid4()) for _ in range(10)]

def seed_data(num_orders=500):
    print(f"Connecting to {DB_HOST}:{DB_PORT}...")
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # We need to make sure schema exists if not using public
        # Using schema 'orders' based on the queries
        cur.execute("CREATE SCHEMA IF NOT EXISTS orders;")
        
        # Check if tables exist, if not, this seed might fail, but assuming they exist via microservices
        print(f"Seeding {num_orders} orders...")
        
        for _ in range(num_orders):
            # Generate random timestamp in the last 90 days
            days_ago = random.randint(0, 90)
            
            # Simulate peak hours (morning for coffee, afternoon for milk tea)
            is_morning = random.random() < 0.6
            hour = random.randint(6, 12) if is_morning else random.randint(13, 21)
            minute = random.randint(0, 59)
            
            created_at = datetime.datetime.now() - datetime.timedelta(days=days_ago)
            created_at = created_at.replace(hour=hour, minute=minute)
            
            order_id = str(uuid.uuid4())
            customer_id = random.choice(CUSTOMERS)
            branch_code = random.choice(BRANCHES)
            
            # Bias payment methods
            if random.random() < 0.3:
                payment_method = random.choice(["VI_AVENGERS", "WALLET"])
            else:
                payment_method = random.choice(PAYMENT_METHODS)
                
            delivery_mode = random.choices(DELIVERY_MODES, weights=[0.6, 0.3, 0.1])[0]
            
            status = random.choices(["HOAN_THANH", "DANG_GIAO", "DA_HUY"], weights=[0.8, 0.1, 0.1])[0]
            
            # Generate dummy address
            address = f"{random.randint(1, 100)} {random.choice(['Nguyễn Huệ', 'Lê Lợi', 'Pasteur', 'Trần Hưng Đạo', 'Điện Biên Phủ'])}, {random.choice(['Q1', 'Q3', 'TP. Thủ Đức'])}"
            
            # Insert Order
            cur.execute("""
                INSERT INTO orders.don_hang 
                (ma_don_hang, ma_nguoi_dung, co_so_ma, phuong_thuc_thanh_toan, loai_don_hang, trang_thai_don_hang, tong_tien, dia_chi_giao_hang, ngay_tao, ngay_cap_nhat)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (order_id, customer_id, branch_code, payment_method, delivery_mode, status, 0, address, created_at, created_at))
            
            # Insert Order Details
            total_amount = 0
            num_items = random.randint(1, 4)
            for _ in range(num_items):
                # Localized taste logic
                if branch_code == "CN_Q1":
                    prod = random.choices(PRODUCTS, weights=[0.4, 0.4, 0.1, 0.05, 0.05, 0, 0])[0] # Likes coffee
                elif branch_code == "CN_TUDUC":
                    prod = random.choices(PRODUCTS, weights=[0.05, 0.05, 0.1, 0.4, 0.3, 0.1, 0])[0] # Likes milk tea
                else:
                    prod = random.choice(PRODUCTS)
                    
                item_size = random.choice(SIZES)
                qty = random.randint(1, 3)
                price = prod[1] + (5000 if item_size == "M" else 10000 if item_size == "L" else 0)
                item_total = price * qty
                total_amount += item_total
                
                prod_id = random.randint(1, 100)
                cur.execute("""
                    INSERT INTO orders.chi_tiet_don_hang 
                    (ma_don_hang, ma_san_pham, ten_san_pham, kich_co, so_luong, gia_ban)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (order_id, prod_id, prod[0], item_size, qty, price))
                
            # Update order total
            cur.execute("UPDATE orders.don_hang SET tong_tien = %s WHERE ma_don_hang = %s", (total_amount, order_id))
            
            # Insert Delivery Tracking
            if delivery_mode == "GIAO_TAN_NOI":
                # Lalamove is faster but more expensive, usually for longer distances or peak hours
                is_peak = hour in [11, 12, 13, 17, 18, 19]
                method = "LALAMOVE" if is_peak and random.random() < 0.7 else random.choice(DELIVERY_METHODS)
                
                fee = random.randint(30000, 50000) if method == "LALAMOVE" else random.randint(15000, 25000)
                est_mins = random.randint(15, 25) if method == "LALAMOVE" else random.randint(20, 40)
                
                cur.execute("""
                    INSERT INTO orders.delivery_tracking 
                    (id, ma_don_hang, delivery_mode, delivery_method, delivery_fee, estimated_minutes, branch_code, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (str(uuid.uuid4()), order_id, delivery_mode, method, fee, est_mins, branch_code, created_at))
                
                # Insert Internal Shipper Delivery if applicable
                if method == "INTERNAL":
                    shipper_status = "DELIVERED" if status == "HOAN_THANH" else "IN_TRANSIT"
                    assigned_at = created_at + datetime.timedelta(minutes=random.randint(2, 5))
                    delivered_at = assigned_at + datetime.timedelta(minutes=est_mins) if shipper_status == "DELIVERED" else None
                    
                    cur.execute("""
                        INSERT INTO orders.shipper_delivery 
                        (id, ma_don_hang, shipper_id, status, delivery_fee, assigned_at, delivered_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (str(uuid.uuid4()), order_id, random.choice(SHIPPERS), shipper_status, fee, assigned_at, delivered_at))

        # Insert Wallet Transactions
        for cust_id in CUSTOMERS:
            # Top-ups
            for _ in range(random.randint(1, 5)):
                tx_date = datetime.datetime.now() - datetime.timedelta(days=random.randint(0, 90))
                cur.execute("""
                    INSERT INTO orders.customer_wallet_transaction 
                    (id, customer_id, type, amount, status, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (str(uuid.uuid4()), cust_id, "TOP_UP", random.choice([50000, 100000, 200000, 500000]), "SUCCESS", tx_date))
                
            # Payments
            for _ in range(random.randint(2, 8)):
                tx_date = datetime.datetime.now() - datetime.timedelta(days=random.randint(0, 90))
                cur.execute("""
                    INSERT INTO orders.customer_wallet_transaction 
                    (id, customer_id, type, amount, status, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (str(uuid.uuid4()), cust_id, "PAYMENT", random.choice([35000, 45000, 70000, 100000]), "SUCCESS", tx_date))

        conn.commit()
        cur.close()
        conn.close()
        print("✅ Data seed completed successfully!")
        
    except Exception as e:
        print(f"❌ Error seeding data: {e}")

if __name__ == "__main__":
    seed_data(500)
