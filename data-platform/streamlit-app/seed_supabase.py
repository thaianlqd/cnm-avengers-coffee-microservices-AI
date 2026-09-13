import os
import random
import sqlalchemy

def _load_env_fallback(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                if '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')
    except Exception: pass

dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
_load_env_fallback(dotenv_path)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_SSLMODE = os.getenv("PGSSLMODE", "prefer")

url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"
engine = sqlalchemy.create_engine(url)

print("Đang kết nối Supabase và tạo dữ liệu giả lập (30 ngày gần nhất)...")

try:
    with engine.begin() as conn:
        for i in range(1, 101):
            conn.execute(sqlalchemy.text(f"""
                INSERT INTO identity.nguoi_dung (ma_nguoi_dung, ho_ten, email, so_dien_thoai, ngay_tao)
                VALUES ('USR_{i}', 'Khách Hàng {i}', 'kh{i}@gmail.com', '0900000{i:03d}', CURRENT_TIMESTAMP - INTERVAL '90 days')
                ON CONFLICT DO NOTHING;
            """))
            
        products = [("SP_1", "Cà Phê Sữa Đá", 29000), ("SP_2", "Bạc Xỉu", 29000), ("SP_3", "Trà Đào Cam Sả", 35000)]
        
        for day in range(30, -1, -1):
            num_orders = random.randint(10, 30)
            for _ in range(num_orders):
                order_id = f"ORD_{day}_{random.randint(1000,9999)}"
                user_id = f"USR_{random.randint(1, 100)}"
                store_id = f"STORE_{random.randint(1, 5)}"
                hour = random.randint(7, 21)
                order_time = f"CURRENT_DATE - INTERVAL '{day} days' + INTERVAL '{hour} hours'"
                
                status = random.choices(['HOAN_THANH', 'DA_HUY'], weights=[0.9, 0.1])[0]
                num_items = random.randint(1, 3)
                total_amount = 0
                items_query = []
                
                for item_idx in range(num_items):
                    prod = random.choice(products)
                    qty = random.randint(1, 3)
                    total_amount += qty * prod[2]
                    items_query.append(f"""
                        INSERT INTO orders.chi_tiet_don_hang (ma_don_hang, ma_san_pham, ten_san_pham, kich_co, so_luong, gia_ban)
                        VALUES ('{order_id}', '{prod[0]}', '{prod[1]}', 'M', {qty}, {prod[2]})
                        ON CONFLICT DO NOTHING;
                    """)
                
                conn.execute(sqlalchemy.text(f"""
                    INSERT INTO orders.don_hang (
                        ma_don_hang, co_so_ma, ma_nguoi_dung, tong_tien, ngay_tao, 
                        trang_thai_don_hang, loai_don_hang, phuong_thuc_thanh_toan
                    ) VALUES (
                        '{order_id}', '{store_id}', '{user_id}', {total_amount}, {order_time},
                        '{status}', 'PICKUP', 'TIEN_MAT'
                    ) ON CONFLICT DO NOTHING;
                """))
                
                for iq in items_query:
                    conn.execute(sqlalchemy.text(iq))
                    
    print("✅ Đã tạo thành công hàng ngàn đơn hàng mới trong 30 ngày qua vào Supabase!")
except Exception as e:
    print(f"❌ Lỗi: {e}")
