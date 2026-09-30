import psycopg2
import psycopg2.extras

conn = psycopg2.connect(
    host='postgres-analytics',
    port=5432,
    user='analytics',
    password='analytics123',
    dbname='analytics'
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("\n--- IDENTITY.NGUOI_DUNG COLUMNS ---")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'identity' AND table_name = 'nguoi_dung';")
for r in cur.fetchall():
    print(r['column_name'], ':', r['data_type'])

print("\n--- SAMPLE USERS ---")
cur.execute("SELECT ma_nguoi_dung, ten_dang_nhap, ho_ten, email, vai_tro, trang_thai FROM identity.nguoi_dung LIMIT 5;")
for r in cur.fetchall():
    print(r)

print("\n--- PUBLIC.SYNC_HISTORY COLUMNS ---")
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sync_history';")
for r in cur.fetchall():
    print(r['column_name'], ':', r['data_type'])

print("\n--- SAMPLE SYNC LOGS ---")
cur.execute("SELECT * FROM public.sync_history ORDER BY started_at DESC LIMIT 5;")
for r in cur.fetchall():
    print(r)

cur.close()
conn.close()
