"""Read only the observed city labels for finite grounding acceptance."""
import json
from db import get_db_conn
from services.query_execution_batch import read_data_epoch
from services.sql_service import validate_read_only_sql,validate_ai_query_scope,validate_sql_ast_security
policy={'silver.chi_nhanh':{'thanh_pho'}}
sql='SELECT DISTINCT thanh_pho FROM silver.chi_nhanh WHERE thanh_pho IS NOT NULL ORDER BY thanh_pho LIMIT 101'
validate_read_only_sql(sql);validate_ai_query_scope(sql,policy);validate_sql_ast_security(sql,policy)
connection=get_db_conn()
try:
    connection.set_session(readonly=True,isolation_level='REPEATABLE READ',autocommit=False)
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL statement_timeout='12s'")
        epoch=read_data_epoch(cursor,set(policy))
        cursor.execute(sql);cities=[r['thanh_pho'] for r in cursor.fetchall()]
        if len(cities)>100:raise RuntimeError('City inventory exceeds finite bound')
        print(json.dumps(dict(cities=cities,epoch=epoch,query=sql,read_only=True),ensure_ascii=False))
finally:
    connection.rollback();connection.close()
