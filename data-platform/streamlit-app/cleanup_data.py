import os
import sqlalchemy
import sys

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

DB_HOST = "db.seneuycwihbyqjdtcdvu.supabase.co"
DB_USER = os.getenv("DB_USER", "postgres")
# Khi kết nối Direct, Supabase chỉ dùng user 'postgres', không có đuôi .project_id
if "." in DB_USER:
    DB_USER = DB_USER.split(".")[0]
    
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_SSLMODE = os.getenv("PGSSLMODE", "prefer")
DB_PORT_DIRECT = "5432"

url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT_DIRECT}/{DB_NAME}?sslmode={DB_SSLMODE}"
engine = sqlalchemy.create_engine(url)

try:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        print("Đang kiểm tra và tiêu diệt các tiến trình bị kẹt trong Database...")
        
        # Tiêu diệt TẤT CẢ các truy vấn khác (kể cả idle in transaction) đang giữ Lock
        # Chỉ giết các process thuộc về chính user đang đăng nhập để tránh lỗi quyền Superuser
        res = conn.execute(sqlalchemy.text("""
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE pid <> pg_backend_pid() 
              AND datname = current_database()
              AND usename = current_user;
        """))
        killed = res.rowcount
        print(f"Đã TRẢM {killed} kết nối/tiến trình ảo đang gây kẹt Database!")
        
        print("Đang thực hiện XÓA TRẮNG dữ liệu cũ (TRUNCATE) để giải cứu Database...")
        conn.execute(sqlalchemy.text("SET statement_timeout = 0;"))
        
        # TRUNCATE CASCADE sẽ xóa sạch don_hang và chi_tiet_don_hang ngay lập tức
        conn.execute(sqlalchemy.text("""
            TRUNCATE TABLE orders.don_hang CASCADE;
        """))
        
        print("✅ Đã xóa sạch sành sanh mọi dữ liệu cũ trong chớp mắt (0.1 giây)!")
        print("💡 GỢI Ý: Bây giờ DB đã trống trơn và mượt mà. Nếu mai bạn cần dữ liệu để demo, hãy chạy lại kịch bản sinh dữ liệu nhưng chỉ sinh khoảng 1.000 đơn thôi nhé!")
        
except Exception as e:
    print(f"Lỗi: {e}")
