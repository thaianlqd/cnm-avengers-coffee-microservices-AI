"""Fixed independently authored SELECTs, reader transaction, no compiler/provider."""
import json
from decimal import Decimal
from db import get_db_conn
from services.query_execution_batch import read_data_epoch
from services.sql_service import validate_read_only_sql, validate_ai_query_scope, validate_sql_ast_security

POLICY={'silver.don_hang':{'co_so_ma','tong_tien','trang_thai_don_hang','ngay_tao','loai_don_hang','phuong_thuc_thanh_toan'},
        'silver.chi_nhanh':{'ma_chi_nhanh','ten_chi_nhanh','thanh_pho'}}
PERIOD="o.ngay_tao >= DATE '2026-09-01' AND o.ngay_tao < DATE '2026-10-01'"
VALID="o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"
TERMINAL="o.trang_thai_don_hang IN ('HOAN_THANH','DA_HUY')"
QUERIES={
 'bottom_five':f"""WITH selected AS (
 SELECT b.thanh_pho AS city,SUM(o.tong_tien) AS revenue
 FROM silver.don_hang o JOIN silver.chi_nhanh b ON o.co_so_ma=b.ma_chi_nhanh
 WHERE {PERIOD} AND {VALID} GROUP BY b.thanh_pho
 ORDER BY revenue ASC NULLS LAST,city ASC NULLS LAST LIMIT 5)
 SELECT r.city,r.revenue,b.ma_chi_nhanh AS store_id,b.ten_chi_nhanh AS store,
 o.tong_tien AS amount,o.loai_don_hang AS order_type,o.phuong_thuc_thanh_toan AS payment_method,
 o.ngay_tao AS created_at
 FROM silver.don_hang o JOIN silver.chi_nhanh b ON o.co_so_ma=b.ma_chi_nhanh
 JOIN selected r ON b.thanh_pho=r.city OR (b.thanh_pho IS NULL AND r.city IS NULL)
 WHERE {PERIOD} AND {VALID} ORDER BY r.city,o.ngay_tao LIMIT 501""",
 'cancellation_top_five':f"""WITH selected AS (
 SELECT b.ma_chi_nhanh AS store_id,b.ten_chi_nhanh AS store,COUNT(*) AS terminal_orders,
 COUNT(*) FILTER(WHERE o.trang_thai_don_hang='DA_HUY') AS cancelled_orders,
 ROUND(100.0*COUNT(*) FILTER(WHERE o.trang_thai_don_hang='DA_HUY')/NULLIF(COUNT(*),0),2) AS rate
 FROM silver.don_hang o JOIN silver.chi_nhanh b ON o.co_so_ma=b.ma_chi_nhanh
 WHERE {PERIOD} AND {TERMINAL} AND b.thanh_pho='Hồ Chí Minh'
 GROUP BY b.ma_chi_nhanh,b.ten_chi_nhanh
 ORDER BY rate DESC NULLS LAST,store ASC NULLS LAST,store_id ASC NULLS LAST LIMIT 5)
 SELECT r.store_id,r.store,r.rate,r.terminal_orders,r.cancelled_orders,
 o.trang_thai_don_hang AS status,o.loai_don_hang AS order_type,
 o.phuong_thuc_thanh_toan AS payment_method,o.ngay_tao AS created_at
 FROM silver.don_hang o JOIN selected r ON o.co_so_ma=r.store_id
 WHERE {PERIOD} AND {TERMINAL} ORDER BY r.store_id,o.ngay_tao LIMIT 501""",
 'hcm_revenue':f"""SELECT SUM(o.tong_tien) AS revenue,COUNT(*) AS valid_orders
 FROM silver.don_hang o JOIN silver.chi_nhanh b ON o.co_so_ma=b.ma_chi_nhanh
 WHERE {PERIOD} AND {VALID} AND b.thanh_pho='Hồ Chí Minh' LIMIT 1"""}

connection=get_db_conn()
try:
 connection.set_session(readonly=True,isolation_level='REPEATABLE READ',autocommit=False)
 with connection.cursor() as cursor:
  cursor.execute("SET LOCAL statement_timeout='12s'")
  cursor.execute("SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh'")
  epoch=read_data_epoch(cursor,set(POLICY))
  observations={}
  for name,sql in QUERIES.items():
   validate_read_only_sql(sql);validate_ai_query_scope(sql,POLICY);validate_sql_ast_security(sql,POLICY)
   cursor.execute(sql);rows=[dict(row) for row in cursor.fetchall()]
   if len(rows)>500:raise RuntimeError('Independent oracle row bound exceeded')
   observations[name]={'sql':sql,'rows':rows}
  print(json.dumps({'method':'Independent SQL + Python raw-record aggregation, READ ONLY REPEATABLE READ, rollback',
   'epoch':epoch,'observations':observations},ensure_ascii=False,indent=2,
   default=lambda value:float(value) if isinstance(value,Decimal) else value.isoformat()))
finally:
 connection.rollback();connection.close()
