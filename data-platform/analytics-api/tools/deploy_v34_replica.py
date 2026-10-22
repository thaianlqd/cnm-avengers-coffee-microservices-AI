"""Offline replica grant plan; explicit approval provisions roles, never runs sync.

The separate replica login is never shared with Kafka. Activation/MVCC snapshot
reconciliation requires the owner's additional, explicit reconciliation approval.
No source database grant, fact DML, table/view DDL or worker activation here.
"""
import argparse
import hashlib
import json
from pathlib import Path
import secrets

from tools.deploy_v34_streaming import identifier

GROUP='avengers_replica_writer'
LOGIN='avengers_dp_replica'
PROFILE=Path('/app/.runtime/replica-secrets/warehouse-replica.json')


def plan(platform):
    path=platform/'metadata/data_contracts.json'
    document=json.loads(path.read_text())
    contracts=document['datasets']
    # Contract format 3.4.0: 23 reviewed sources, or +26 business-coverage sources (user-approved 20/10/2026).
    if document['version']!='3.4.0' or len(contracts) not in {23,49}:
        raise ValueError('Explicit reviewed contract set required')
    targets=sorted({c['target_table'] for c in contracts.values()})
    if len(targets)!=len(contracts):raise ValueError('Distinct target tables required')
    qualified=lambda name:'.'.join(identifier(p) for p in name.split('.'))
    if any(len(name.split('.'))!=2 for name in targets):raise ValueError('Qualified target required')
    schemas=sorted({'analytics','public'}|{name.split('.')[0] for name in targets})
    statements=['GRANT USAGE ON SCHEMA '+', '.join(map(identifier,schemas))+' TO '+identifier(GROUP)+';']
    statements += ['GRANT SELECT, INSERT, UPDATE, DELETE ON '+qualified(name)+' TO '+identifier(GROUP)+';' for name in targets]
    statements += [
        'GRANT SELECT, INSERT, UPDATE ON analytics.ingestion_checkpoints, public.sync_metadata, public.sync_history TO '+identifier(GROUP)+';',
        'GRANT USAGE ON SEQUENCE public.sync_history_id_seq TO '+identifier(GROUP)+';']
    return {'group':GROUP,'login':LOGIN,'contract_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'target_tables':targets,'grant_sql':'\n'.join(statements)+'\n',
        'new_limited_login':True,'profile_scope':'replica worker only; never mounted into Kafka/API reader',
        'fact_dml_in_grant_tool':False,'table_or_view_ddl':False,'source_database_grants':False,
        'worker_activation':False,'applied':False,
        'activation_requires_separate_approval':'23 target snapshots use DELETE missing keys + UPSERT changed rows atomically per table; source remains READ ONLY; no cross-source atomicity or completeness claim'}


def apply(value,*,approved=False,profile_path=PROFILE):
    if not approved:raise RuntimeError('Explicit replica role/grant approval required')
    if value['group']!=GROUP or value['login']!=LOGIN:raise RuntimeError('Reviewed replica role differs')
    if profile_path.exists():raise RuntimeError('Private replica profile already exists; inspect prior deployment')
    import db
    from psycopg2 import sql
    from tools.deploy_v34_governance import private_write
    connection=db.psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,password=db.DB_PASSWORD,
        dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=3)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'")
            cursor.execute('SELECT count(*) FROM pg_roles WHERE rolname=ANY(%s)',([GROUP,LOGIN],))
            if cursor.fetchone()[0]:raise RuntimeError('Replica role exists; no implicit rotation or privilege change')
            for table,sequence in (('sync_history','sync_history_id_seq'),):
                cursor.execute('SELECT pg_get_serial_sequence(%s,%s)',('public.'+table,'id'))
                if cursor.fetchone()[0]!='public.'+sequence:raise RuntimeError('Reviewed sync sequence differs')
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
    parser.add_argument('--approved-replica-grants',action='store_true')
    args=parser.parse_args()
    if args.out.exists():raise SystemExit('Fresh evidence path required')
    value=plan(args.platform_root)
    if args.apply:value=apply(value,approved=args.approved_replica_grants)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'applied':value['applied'],'tables':len(value['target_tables']),'worker_activation':False}))


if __name__=='__main__':main()
