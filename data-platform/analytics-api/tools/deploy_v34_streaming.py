"""Reviewed streaming deployment plan. Default is offline: no DB/secret access.

--apply --approved-streaming-grants requires the owner's separate approval of
the exact grants. Never enables workers, rewrites facts, migrates checkpoints,
resets offsets, creates roles, or creates/alters tables/views.
"""
import argparse
import json
from pathlib import Path
import re

GROUP='avengers_pipeline_writer'
PROFILE=Path('/app/.runtime/streaming-secrets/warehouse-pipeline.json')


def identifier(value):
    if not re.fullmatch(r'[a-z_][a-z0-9_]*',value):raise ValueError('Invalid reviewed identifier')
    return '"'+value+'"'


def plan(platform):
    contracts=json.loads((platform/'metadata/data_contracts.json').read_text())['datasets']
    streams=json.loads((platform/'metadata/stream_contracts.json').read_text())['streams']
    if len(streams)!=3:raise ValueError('Explicit three-stream review required')
    statements=['GRANT USAGE ON SCHEMA orders,public TO '+GROUP+';']
    projections={}
    for stream in streams:
        name=stream['source_table'];contract=contracts[name]
        schema,table=name.split('.')
        fields=list(dict.fromkeys(stream['columns']+stream['primary_key']+([stream['update_clock']] if stream['update_clock'] else [])))
        if any(contract['columns'][field]['classification'] in {'secret','pii'} for field in fields):
            raise ValueError('Private fields cannot enter streaming grants')
        statements.append('GRANT SELECT ('+', '.join(map(identifier,fields))+') ON '+
            identifier(schema)+'.'+identifier(table)+' TO '+GROUP+';')
        projections[name]=fields
    statements.extend(['GRANT INSERT ON public.realtime_events TO '+GROUP+';',
        'GRANT USAGE ON SEQUENCE public.realtime_events_id_seq TO '+GROUP+';'])
    return {'group':GROUP,'source_projections':projections,'sql':'\n'.join(statements)+'\n',
        'profile_scope':'Only existing pipeline credential; no API reader/writer credentials mounted',
        'profile_mode':'0600, private parent0700, read-only worker mount',
        'fact_dml':False,'truncate':False,'table_or_view_ddl':False,'role_creation':False,
        'worker_activation':False,'offset_reset':False,'applied':False}


def apply(value,*,approved=False,profile_path=PROFILE):
    if not approved:raise RuntimeError('Separate approval of reviewed streaming grants required')
    import db
    from tools.deploy_v34_governance import private_write
    user,password=db.connection_credentials('PIPELINE')
    if not user or not password:raise RuntimeError('Existing dedicated pipeline profile required')
    if profile_path.exists():raise RuntimeError('Private streaming profile already exists; review prior deployment')
    connection=db.psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,password=db.DB_PASSWORD,
        dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=2)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'")
            cursor.execute('SELECT rolsuper,rolcreaterole,rolcreatedb,pg_has_role(oid,%s,\'MEMBER\') FROM pg_roles WHERE rolname=%s',
                           (GROUP,user))
            row=cursor.fetchone()
            if not row or any(row[:3]) or not row[3]:raise RuntimeError('Dedicated limited pipeline role required')
            cursor.execute("SELECT pg_get_serial_sequence('public.realtime_events','id')")
            if cursor.fetchone()[0]!='public.realtime_events_id_seq':raise RuntimeError('Reviewed event sequence differs')
            cursor.execute(value['sql'])
        # Provision before committing grants; no worker can activate without
        # this explicit private file. A commit failure leaves a private profile
        # for operator inspection, never a silently activated pipeline.
        private_write(profile_path,{'user':user,'password':password})
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:connection.close()
    return {**value,'applied':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--approved-streaming-grants',action='store_true')
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.out.exists():raise SystemExit('Fresh deployment evidence path required')
    value=plan(Path(__file__).resolve().parents[2])
    if args.apply:value=apply(value,approved=args.approved_streaming_grants)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'applied':value['applied'],'source_tables':len(value['source_projections']),
        'fact_dml':False,'worker_activation':False,'out':str(args.out)}))


if __name__=='__main__':main()
