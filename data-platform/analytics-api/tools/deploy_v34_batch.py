"""Offline batch role/grant plan; --apply needs the owner's explicit approval of these exact grants.

A dedicated batch login (never the replica/Kafka/owner login) may read only the five
Bronze source replicas plus checkpoints, and write only run/publication/Gold-version
pointers. No DDL, TRUNCATE, silver/gold table DML or worker activation happens here.
"""
import argparse
import hashlib
import json
from pathlib import Path
import secrets

from tools.deploy_v34_streaming import identifier

GROUP='avengers_batch_runner'
LOGIN='avengers_dp_batch'
PROFILE=Path('/app/.runtime/batch-secrets/warehouse-batch.json')
SOURCES=('orders.don_hang','orders.chi_tiet_don_hang','orders.shipper_delivery',
         'orders.customer_wallet_transaction','orders.delivery_tracking')


def plan(platform):
    sources=sorted(SOURCES)
    qualified=lambda name:'.'.join(identifier(p) for p in name.split('.'))
    group=identifier(GROUP)
    statements=['GRANT USAGE ON SCHEMA orders, analytics TO '+group+';']
    statements+=['GRANT SELECT ON '+qualified(name)+' TO '+group+';' for name in sources]
    statements+=[
        'GRANT SELECT ON analytics.ingestion_checkpoints TO '+group+';',
        'GRANT SELECT, INSERT ON analytics.pipeline_runs, analytics.gold_dataset_versions TO '+group+';',
        'GRANT SELECT, INSERT, UPDATE ON analytics.pipeline_publications TO '+group+';']
    bronze=platform/'spark-jobs/bronze_ingestion.py'
    return {'group':GROUP,'login':LOGIN,'bronze_source_sha256':hashlib.sha256(bronze.read_bytes()).hexdigest() if bronze.exists() else None,
        'source_tables':sources,'grant_sql':'\n'.join(statements)+'\n',
        'new_limited_login':True,'profile_scope':'spark-jobs batch only; never mounted into API/Kafka/data-sync',
        'ddl':False,'truncate':False,'silver_gold_table_dml':False,'worker_activation':False,
        'source_database_grants':False,'applied':False}


def apply(value,*,approved=False,profile_path=PROFILE):
    if not approved:raise RuntimeError('Explicit batch role/grant approval required')
    if value['group']!=GROUP or value['login']!=LOGIN:raise RuntimeError('Reviewed batch role differs')
    if profile_path.exists():raise RuntimeError('Private batch profile already exists; inspect prior deployment')
    import db
    from psycopg2 import sql
    from tools.deploy_v34_governance import private_write
    connection=db.psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,password=db.DB_PASSWORD,
        dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=3)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'")
            cursor.execute('SELECT count(*) FROM pg_roles WHERE rolname=ANY(%s)',([GROUP,LOGIN],))
            if cursor.fetchone()[0]:raise RuntimeError('Batch role exists; no implicit rotation or privilege change')
            cursor.execute(sql.SQL('CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION').format(sql.Identifier(GROUP)))
            password=secrets.token_urlsafe(48)
            cursor.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {} IN ROLE {}').format(
                sql.Identifier(LOGIN),sql.Literal(password),sql.Identifier(GROUP)))
            cursor.execute(value['grant_sql'])
        private_write(profile_path,{'user':LOGIN,'password':password})
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:connection.close()
    return {**value,'applied':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform-root',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--approved-batch-grants',action='store_true')
    args=parser.parse_args()
    if args.out.exists():raise SystemExit('Fresh evidence path required')
    value=plan(args.platform_root)
    if args.apply:value=apply(value,approved=args.approved_batch_grants)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'applied':value['applied'],'tables':len(value['source_tables']),'worker_activation':False}))


if __name__=='__main__':main()
