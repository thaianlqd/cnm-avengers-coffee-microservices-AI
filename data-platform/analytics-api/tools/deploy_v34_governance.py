"""Explicit, approved local additive deployment. No startup DDL or fact writes.

Dry plan by default. --apply --approved-026-027 requires the project owner's
specific approval. Private connection profiles are generated locally, never
printed, checked into source, or copied into image builds.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets

import psycopg2
from psycopg2 import sql
import psycopg2.extras
import db
from services.metadata_service import is_sensitive_column

ROOT=Path(__file__).resolve().parent.parent
NAMES=('026_analysis_modules.sql','027_platform_governance.sql')
GROUPS={'reader':'avengers_analytics_reader','writer':'avengers_report_writer','pipeline':'avengers_pipeline_writer'}


def round3_relations():
    """Silver relations added by the business-coverage rollout (guards in migration 029)."""
    views=json.loads((ROOT/'metadata/warehouse_views.json').read_text())['views']
    return {v['name'] for v in views if v.get('introduced_in')=='business-coverage-20261020'}


def snapshot_guard_sql(names=None):
    """Reviewed additive DDL only; never called by startup or a data request."""
    from services.query_execution_batch import snapshot_relations
    if names is None:  # migration 028 scope: relations that existed before round 3
        names=[n for n in snapshot_relations() if n not in round3_relations()]
    lines=['BEGIN;', "SET LOCAL lock_timeout='3s';", "SET LOCAL statement_timeout='30s';"]
    for name in names:
        leaf=name.split('.')[1]
        if not leaf.replace('_','').isalnum(): raise ValueError('Invalid approved relation')
        lines += [f'CREATE OR REPLACE VIEW analytics.snapshot_lock__{leaf} WITH (security_barrier=true) AS',
            f'    SELECT false AS lock_guard FROM {name} WHERE false;',
            f'REVOKE ALL ON analytics.snapshot_lock__{leaf} FROM PUBLIC;',
            f'GRANT SELECT ON analytics.snapshot_lock__{leaf} TO avengers_analytics_reader;']
    return '\n'.join([*lines,'COMMIT;',''])


def deploy_snapshot_guards(*,apply=False,approved=False):
    statement=snapshot_guard_sql()
    artifact=ROOT/'migrations/028_snapshot_lock_guards.sql'
    if artifact.read_text()!=statement:raise RuntimeError('Snapshot guard migration differs from the approved catalog projection')
    from services.query_execution_batch import snapshot_relations
    plan={'guard_count':len([n for n in snapshot_relations() if n not in round3_relations()]),'sql_sha256':hashlib.sha256(statement.encode()).hexdigest(),
        'fact_writes':False,'source_grants_changed':False,'guard_contents':'one boolean column, zero rows',
        'applied':False}
    if not apply:return plan
    if not approved:raise RuntimeError('Specific approval of zero-row snapshot lock views required')
    connection=psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,password=db.DB_PASSWORD,
        dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=2)
    try:
        with connection.cursor() as cursor:cursor.execute(statement)
        connection.commit()
        return {**plan,'applied':True}
    finally:connection.close()


def private_write(path,value):
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    descriptor=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(descriptor,'w') as handle:
        json.dump(value,handle,ensure_ascii=False,indent=2);handle.write('\n');handle.flush();os.fsync(handle.fileno())


def deploy(*,apply=False,approved=False):
    planned={'migrations':[{'name':name,'sha256':hashlib.sha256((ROOT/'migrations'/name).read_bytes()).hexdigest()} for name in NAMES],
        'fact_writes':False,'login_profiles':list(GROUPS),'raw_source_select':False,'password_values':'never_output'}
    if not apply:return planned
    if not approved:raise RuntimeError('Specific approval of migrations026/027 and limited DB roles required')
    private=ROOT/'.runtime';private.mkdir(mode=0o700,exist_ok=True)
    profile_path=private/'db_credentials.json'
    if profile_path.exists():raise RuntimeError('Deployment profiles already exist; inspect prior deployment before retry')
    profiles={kind:{'user':'avengers_dp_'+kind,'password':secrets.token_urlsafe(48)} for kind in GROUPS}
    connection=psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,password=db.DB_PASSWORD,
        dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=2,cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT count(*) AS orders FROM silver.don_hang');before=cursor.fetchone()['orders']
        connection.rollback()
        # Preserve metadata rows privately before additive expansion. No facts
        # or source credentials are copied into the backup.
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM analytics.saved_reports')
            backup=[dict(row) for row in cursor.fetchall()]
        connection.rollback()
        backup_path=private/'saved_reports_pre026_027.json'
        if not backup_path.exists():private_write(backup_path,json.loads(json.dumps(backup,default=str)))
        for name in NAMES:
            with connection.cursor() as cursor:cursor.execute((ROOT/'migrations'/name).read_text())
            connection.commit()
        overlay=json.loads((ROOT/'metadata/semantic_catalog.json').read_text())
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'")
            for kind,group in GROUPS.items():
                name=profiles[kind]['user']
                cursor.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',(name,))
                if cursor.fetchone():raise RuntimeError('Dedicated login role already exists; no automatic credential rotation')
                cursor.execute(sql.SQL('CREATE ROLE {} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %s').format(sql.Identifier(name)),(profiles[kind]['password'],))
                cursor.execute(sql.SQL('GRANT {} TO {}').format(sql.Identifier(group),sql.Identifier(name)))
                cursor.execute(sql.SQL('ALTER ROLE {} SET search_path TO silver,analytics,public').format(sql.Identifier(name)))
            granted={}
            for name in overlay['silver_tables']:
                cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position",tuple(name.split('.')))
                safe=[row['column_name'] for row in cursor.fetchall() if not is_sensitive_column(row['column_name'])]
                if not safe:continue
                cursor.execute(sql.SQL('GRANT SELECT ({}) ON {} TO avengers_analytics_reader').format(
                    sql.SQL(',').join(map(sql.Identifier,safe)),sql.Identifier(*name.split('.'))))
                granted[name]=safe
            cursor.execute('GRANT SELECT (id) ON public.realtime_events TO avengers_analytics_reader')
            cursor.execute("ALTER ROLE avengers_dp_reader SET default_transaction_read_only=on")
            cursor.execute("ALTER ROLE avengers_dp_reader SET statement_timeout='12s'")
            cursor.execute("ALTER ROLE avengers_dp_writer SET statement_timeout='12s'")
            cursor.execute('SELECT count(*) AS orders FROM silver.don_hang');after=cursor.fetchone()['orders']
        connection.commit()
        private_write(profile_path,profiles)
        policy={'version':'3.4.0-local-admin-governed','roles':{'ADMIN':{
            'permissions':['analytics.read','platform.read','reports.save','reports.export','reports.legacy','sql.explore'],
            'datasets':sorted(set(granted)|{'orders','stores','products','customers'}),'national':True}},'subjects':{},
            'basis':'Existing Identity ADMIN role only. No customer/manager/unknown grants. Non-PII Silver columns only. Privileged SQL remains explicitly disabled unless operator enables trusted_admin mode.'}
        policy_path=private/'access_policy.json'
        private_write(policy_path,policy)
        private_write(private/'deployment.json',{'DATA_ANALYST_AUTH_MODE':'identity_login_session',
            'DATA_ANALYST_IDENTITY_LOGIN_URL':'http://host.docker.internal:3000/auth/login',
            'DATA_ANALYST_ACCESS_POLICY_PATH':str(policy_path)})
        return {**planned,'applied':True,'order_count_before':before,'order_count_after':after,
            'fact_count_note':'Source sync can add rows concurrently; this tool issues no fact DML',
            'granted_view_count':len(granted),'private_backup_created':True,'role_permissions':'non-superuser dedicated logins; no raw-source grants'}
    finally:connection.close()


def admin_access_policy(policy):
    """Only the approved ADMIN-only application grants; no DB role changes."""
    from copy import deepcopy
    if set(policy.get('roles', {})) != {'ADMIN'}:
        raise ValueError('Expected the existing ADMIN-only access matrix')
    grants = policy['roles']['ADMIN']
    if not isinstance(grants.get('permissions'), list) or grants.get('national') is not True:
        raise ValueError('Unexpected ADMIN policy shape')
    result = deepcopy(policy)
    result['roles']['ADMIN']['permissions'] = sorted(set(grants['permissions']) | {'system.read', 'warehouse.read'})
    result['version'] = '3.5.0-local-admin-governed'
    result['basis'] = ('Existing Identity ADMIN only; dataset and subject scope preserved. '
                       'Metadata is separate from read-only, durably audited trusted_admin SQL.')
    return result


def _replace_public_config(path, value):
    """Atomic local public-policy/settings replacement; no credential files."""
    import tempfile
    if path.is_symlink():
        raise ValueError('Public deployment configuration must not be a symlink')
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.v35-settings-', delete=False) as handle:
            temporary = Path(handle.name)
            os.chmod(temporary, 0o600)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def deploy_admin_access(*, apply=False):
    """Reviewed app-policy rollout. Never executes migrations, GRANT or fact DML."""
    from services.access_policy import digest
    private = ROOT / '.runtime'
    policy_path = private / 'access_policy.json'
    settings_path = private / 'deployment.json'
    before = json.loads(policy_path.read_text())
    settings = json.loads(settings_path.read_text())
    expected_path = Path(settings.get('DATA_ANALYST_ACCESS_POLICY_PATH', str(policy_path)))
    if expected_path.resolve() != policy_path.resolve():
        raise ValueError('Unexpected deployed policy path')
    after = admin_access_policy(before)
    changes = sorted(set(after['roles']['ADMIN']['permissions']) - set(before['roles']['ADMIN']['permissions']))
    result = {'applied': False, 'policy_before': digest(before), 'policy_after': digest(after),
              'version': after['version'], 'added_permissions': changes, 'roles': ['ADMIN'],
              'datasets_unchanged': True, 'subjects_unchanged': True, 'ddl': False, 'db_grants': False,
              'sql_mode_after': 'trusted_admin'}
    if not apply:
        return result
    if os.getenv('ANALYTICS_INITIALIZE_WAREHOUSE_ON_STARTUP', 'false').lower() == 'true':
        raise RuntimeError('Startup DDL must remain disabled')
    checks = {}
    for kind, factory in [('reader', db.get_db_conn), ('writer', db.get_report_writer_conn)]:
        connection = factory()
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')
                role = dict(cursor.fetchone())
                if any(role.values()):
                    raise RuntimeError('Dedicated role must not hold privileged database attributes')
                if kind == 'reader':
                    cursor.execute("SELECT has_column_privilege(current_user,'silver.don_hang','ma_don_hang','SELECT') AS allowed, has_column_privilege(current_user,'silver.nguoi_dung','email','SELECT') AS pii")
                    row = dict(cursor.fetchone())
                    if not row['allowed'] or row['pii']:
                        raise RuntimeError('Reader column authorization differs from the approved policy')
                else:
                    cursor.execute("SELECT has_table_privilege(current_user,'analytics.audit_events','INSERT') AS allowed")
                    if not cursor.fetchone()['allowed']:
                        raise RuntimeError('Dedicated audit writer privilege is required')
                checks[kind] = 'passed'
        finally:
            connection.rollback()
            connection.close()
    backup = private / 'admin_access_pre_v35.json'
    if not backup.exists():
        private_write(backup, {'policy': before, 'deployment': settings})
    # Keep SQL disabled until the policy file is durably in place. A crash
    # between these operations cannot grant unaudited or unrestricted SQL.
    _replace_public_config(policy_path, after)
    _replace_public_config(settings_path, {**settings, 'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin'})
    return {**result, 'applied': True, 'role_smokes': checks, 'backup_created': True}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--approved-026-027',action='store_true')
    parser.add_argument('--snapshot-guards',action='store_true')
    parser.add_argument('--admin-access',action='store_true',help='Update only the existing ADMIN application policy/public SQL mode')
    parser.add_argument('--approved-snapshot-guards',action='store_true')
    args=parser.parse_args()
    try:
        result = (deploy_admin_access(apply=args.apply) if args.admin_access else
                  deploy_snapshot_guards(apply=args.apply,approved=args.approved_snapshot_guards) if args.snapshot_guards else
                  deploy(apply=args.apply,approved=args.approved_026_027))
        print(json.dumps(result,ensure_ascii=False))
    except Exception as error:
        # DB exception strings may include data/parameters. No interpolation.
        print(json.dumps({'applied':False,'error_type':type(error).__name__,'reason':'Deployment stopped; inspect transaction/config state privately before retry'}))
        raise SystemExit(1)
