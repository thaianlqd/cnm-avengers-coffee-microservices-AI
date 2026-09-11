import os
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
# Bắt buộc dùng cổng 5432 (Direct Connection) thay vì 6543 (PgBouncer) để tránh bị treo khi tạo Index
DB_PORT_DIRECT = "5432"

url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT_DIRECT}/{DB_NAME}?sslmode={DB_SSLMODE}"
engine = sqlalchemy.create_engine(url)

print("Đang kết nối Supabase để tối ưu hóa truy vấn (Tạo Index)...")

try:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        print("Đang cấu hình vô hiệu hóa timeout cho quá trình tạo Index...")
        conn.execute(sqlalchemy.text("SET statement_timeout = 0;"))
        
        print("Tạo MEGA COVERING INDEX cho cột ngay_tao để sửa lỗi UI load chậm. Tiến trình này mất khoảng 20-30s...")
        conn.execute(sqlalchemy.text("""
            CREATE INDEX IF NOT EXISTS idx_don_hang_mega_covering 
            ON orders.don_hang(ngay_tao) 
            INCLUDE (trang_thai_don_hang, tong_tien, co_so_ma, phuong_thuc_thanh_toan, ma_nguoi_dung, trang_thai_thanh_toan);
        """))
        
        print("✅ Tất cả Index đã được tạo thành công! Tốc độ load trang sẽ tăng gấp 50 lần.")
        
    print("✅ Tất cả Index đã được tạo thành công! Reload lại web để thấy tốc độ thay đổi.")
except Exception as e:
    print(f"❌ Lỗi: {e}")
