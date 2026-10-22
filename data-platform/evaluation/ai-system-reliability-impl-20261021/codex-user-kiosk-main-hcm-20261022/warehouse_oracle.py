"""Independent scoped raw SELECTs; no compiler and no LLM."""
import json
from decimal import Decimal
from db import get_db_conn
from services.query_execution_batch import read_data_epoch
from services.sql_service import validate_read_only_sql,validate_ai_query_scope,validate_sql_ast_security
POLICY={'silver.don_hang':{'co_so_ma','tong_tien','trang_thai_don_hang','ngay_tao','loai_don_hang','phuong_thuc_thanh_toan'},'silver.chi_nhanh':{'ma_chi_nhanh','ten_chi_nhanh','thanh_pho','loai_diem_ban','vi_do','kinh_do'}}
SCOPE="b.thanh_pho = 'Hồ Chí Minh'"
QUERIES={
'orders':f"SELECT b.thanh_pho AS city,b.ma_chi_nhanh AS store_id,b.ten_chi_nhanh AS store,b.loai_diem_ban AS store_type,o.tong_tien AS amount,o.trang_thai_don_hang AS status,o.loai_don_hang AS order_type,o.phuong_thuc_thanh_toan AS payment_method,o.ngay_tao AS created_at FROM silver.don_hang o JOIN silver.chi_nhanh b ON b.ma_chi_nhanh=o.co_so_ma WHERE {SCOPE} ORDER BY b.ma_chi_nhanh,o.ngay_tao LIMIT 50001",
'directory':f"SELECT b.ma_chi_nhanh AS store_id,b.thanh_pho AS city,b.loai_diem_ban AS store_type,b.vi_do AS latitude,b.kinh_do AS longitude FROM silver.chi_nhanh b WHERE {SCOPE} ORDER BY b.ma_chi_nhanh LIMIT 5001"}
conn=get_db_conn()
try:
 conn.set_session(readonly=True,isolation_level='REPEATABLE READ',autocommit=False)
 with conn.cursor() as cur:
  cur.execute("SET LOCAL statement_timeout='12s'");cur.execute("SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh'")
  epoch=read_data_epoch(cur,set(POLICY));out={}
  for name,sql in QUERIES.items():
   validate_read_only_sql(sql);validate_ai_query_scope(sql,POLICY);validate_sql_ast_security(sql,POLICY)
   cur.execute(sql);rows=[dict(r) for r in cur.fetchall()]
   assert len(rows)<(50001 if name=='orders' else 5001)
   out[name]=dict(sql=sql,rows=rows)
  print(json.dumps(dict(method='Independent raw records; READ ONLY REPEATABLE READ, rollback, no compiler/provider',epoch=epoch,observations=out),ensure_ascii=False,default=lambda v:float(v) if isinstance(v,Decimal) else v.isoformat()))
finally:conn.rollback();conn.close()
