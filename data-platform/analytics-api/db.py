import logging
import os
import psycopg2
import psycopg2.extras

# ─── Load Environment Variables ───
DB_HOST = os.getenv("DB_HOST", "postgres-analytics")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_USER = os.getenv("DB_USER", "analytics")
DB_PASSWORD = os.getenv("DB_PASSWORD", "analytics123")
DB_NAME = os.getenv("DB_NAME", "analytics")
DB_SSLMODE = os.getenv("DB_SSLMODE", "disable")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def connection_credentials(kind):
    """Operator-injected dedicated credentials; private mounted file or env.

    The private file is excluded from source control and image builds. Offline
    tests never load deployment credentials. This function never logs values.
    """
    if kind not in {'READER','WRITER','PIPELINE'}: raise ValueError('Unknown connection profile')
    user=os.getenv('DATA_ANALYST_'+kind+'_DB_USER')
    password=os.getenv('DATA_ANALYST_'+kind+'_DB_PASSWORD')
    if user and password: return user,password
    if os.getenv('AI_OFFLINE')=='1': return None,None
    import json
    from pathlib import Path
    path=Path(__file__).resolve().parent/'.runtime/db_credentials.json'
    if not path.exists(): return None,None
    if path.stat().st_mode & 0o077: raise RuntimeError('Private connection configuration permissions are unsafe')
    try:
        value=json.loads(path.read_text())[kind.lower()]
        if not isinstance(value.get('user'),str) or not isinstance(value.get('password'),str): raise ValueError()
        return value['user'],value['password']
    except Exception: raise RuntimeError('Dedicated connection profile unavailable') from None


class AccountedReaderCursor(psycopg2.extras.RealDictCursor):
    """Measure reader statements/fetches without retaining SQL, params or rows.

    The validated executor already owns its attempt, including pooled cursors.
    Direct readers share that same request budget; transaction setup is excluded.
    """
    def execute(self, query, vars=None):
        import re
        from services.analytical_capacity_planner import request_sql_budget, executor_sql_attempt, reader_sql_kind
        self._read_account=None
        budget=request_sql_budget.get()
        if budget is None or executor_sql_attempt.get():
            return super().execute(query,vars)
        text=query.as_string(self.connection) if hasattr(query,'as_string') else query
        if isinstance(text,bytes):text=text.decode('utf-8',errors='replace')
        text=re.sub(r'/\*.*?\*/|--[^\n]*',' ',text,flags=re.S).lstrip()
        if re.match(r'(?i)^(SET|RESET|BEGIN|START|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|LOCK)\b',text):
            return super().execute(query,vars)
        kind=reader_sql_kind.get()
        identity=budget.reserve(kind)
        from services.telemetry import span
        try:
            with span('sql_metadata' if kind=='metadata' else 'sql_reader'):
                result=super().execute(query,vars)
        except BaseException:
            budget.finish(identity,failed=True)
            raise
        budget.finish(identity)
        self._read_account=(budget,identity)
        return result

    def executemany(self,query,vars_list):
        # psycopg2 implements this as repeated physical executes too.
        for values in vars_list:self.execute(query,values)

    def _fetch(self,method,size=None):
        account=getattr(self,'_read_account',None)
        if account is None:
            return method() if size is None else method(size)
        budget,identity=account
        from services.telemetry import span
        try:
            with span('db_fetch') as observed:
                result=method() if size is None else method(size)
                rows=[] if result is None else [result] if method.__name__=='fetchone' else result
                import json
                observed['rows']=len(rows)
                budget.record_fetch(identity,rows=len(rows),
                    bytes_=len(json.dumps(rows,default=str,separators=(',',':')).encode()) if rows else 0)
            return result
        except BaseException:
            budget.record_fetch(identity,failed=True)
            raise

    def fetchone(self):
        return self._fetch(super().fetchone)

    def fetchmany(self,size=None):
        requested=self.arraysize if size is None else size
        account=getattr(self,'_read_account',None)
        if account is not None:requested=min(requested,account[0].fetch_allowance()+1)
        return self._fetch(super().fetchmany,requested)

    def fetchall(self):
        account=getattr(self,'_read_account',None)
        if account is None:return super().fetchall()
        return self._fetch(super().fetchmany,account[0].fetch_allowance()+1)

    def __iter__(self):return self

    def __next__(self):
        value=self.fetchone()
        if value is None:raise StopIteration
        return value


def get_db_conn():
    reader_user,reader_password=connection_credentials('READER')
    from services.access_policy import active_principal
    if (active_principal.get() is not None or os.getenv('DATA_ANALYST_ENV')=='production') and not (reader_user and reader_password):
        raise RuntimeError('Authenticated queries require dedicated warehouse reader credentials')
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=reader_user or DB_USER,
        password=reader_password or DB_PASSWORD,
        dbname=DB_NAME,
        sslmode=DB_SSLMODE,
        cursor_factory=AccountedReaderCursor,
        connect_timeout=2,
        options='-c default_transaction_read_only=on -c statement_timeout=12000 -c lock_timeout=2000' if reader_user else '',
    )


logger = logging.getLogger("warehouse")


def get_report_writer_conn():
    """Explicit metadata writer credentials; no production superuser fallback."""
    writer_user,writer_password=connection_credentials('WRITER')
    configured=writer_user and writer_password
    if not configured:
        if os.getenv('DATA_ANALYST_ENV','development')=='production':
            raise RuntimeError('Report writer credentials are not configured')
        from services.access_policy import active_principal
        if active_principal.get() is not None:
            raise RuntimeError('Authenticated report writes require a dedicated writer connection')
        return get_db_conn()
    return psycopg2.connect(host=DB_HOST,port=DB_PORT,user=writer_user,
        password=writer_password,dbname=DB_NAME,sslmode=DB_SSLMODE,
        cursor_factory=psycopg2.extras.RealDictCursor,connect_timeout=2,
        options='-c statement_timeout=12000 -c lock_timeout=2000')


def get_pipeline_writer_conn():
    pipeline_user,pipeline_password=connection_credentials('PIPELINE')
    if not pipeline_user or not pipeline_password:
        raise RuntimeError('Explicit pipeline writer credentials are required')
    return psycopg2.connect(host=DB_HOST,port=DB_PORT,user=pipeline_user,
        password=pipeline_password,dbname=DB_NAME,sslmode=DB_SSLMODE,
        cursor_factory=psycopg2.extras.RealDictCursor,connect_timeout=2,
        options='-c statement_timeout=12000 -c lock_timeout=2000')

def _load_warehouse_views():
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parent / 'metadata/warehouse_views.json'
    registry = json.loads(path.read_text())
    if registry.get('version') != '3.4.0':
        raise ValueError('Reviewed warehouse view registry required')
    return [(v['name'], v['sql']) for v in registry['views'] if 'api' in v['consumers']]


WAREHOUSE_VIEWS = _load_warehouse_views()


def init_warehouse_views() -> bool:
    """Initialize warehouse schemas, views, and tables with per-view fault tolerance.
    Returns True if core analytical views (silver.don_hang, silver.chi_nhanh) are present.
    """
    try:
        conn = get_db_conn()
        conn.autocommit = True
    except Exception as e:
        logger.warning(f"Could not connect to database for warehouse view initialization: {e}")
        return False

    try:
        with conn.cursor() as cur:
            # 1. Schemas
            for schema in ("gold", "silver", "analytics"):
                try:
                    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
                except Exception as schema_err:
                    logger.debug(f"Schema {schema} notice: {schema_err}")

            # 2. Saved reports and export logs tables
            try:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS analytics.saved_reports (
                        id VARCHAR(64) PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        category VARCHAR(50) NOT NULL DEFAULT 'sales',
                        query_type VARCHAR(20) NOT NULL DEFAULT 'sql',
                        sql_query TEXT NOT NULL,
                        visualization_type VARCHAR(30) DEFAULT 'table',
                        x_key VARCHAR(100),
                        y_key VARCHAR(100),
                        ai_summary TEXT,
                        created_by VARCHAR(100) DEFAULT 'Chuyên viên phân tích',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                cur.execute("ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS module_config JSONB;")
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS analytics.report_export_logs (
                        id VARCHAR(64) PRIMARY KEY,
                        report_title VARCHAR(255) NOT NULL,
                        format VARCHAR(20) NOT NULL,
                        row_count INT DEFAULT 0,
                        file_size VARCHAR(50) DEFAULT '0 KB',
                        status VARCHAR(50) DEFAULT 'Thành công',
                        user_name VARCHAR(100) DEFAULT 'Chuyên viên phân tích',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
            except Exception as tbl_err:
                logger.debug(f"Analytics tables notice: {tbl_err}")

            # 3. Create views individually with fault isolation
            success_count = 0
            for view_name, ddl in WAREHOUSE_VIEWS:
                try:
                    cur.execute(ddl)
                    success_count += 1
                except Exception as view_err:
                    logger.debug(f"View {view_name} skipped (source table not ready): {view_err}")

            # 4. Verify whether core views exist
            cur.execute("""
                SELECT table_name FROM information_schema.views 
                WHERE table_schema = 'silver' AND table_name IN ('don_hang', 'chi_nhanh');
            """)
            rows = cur.fetchall()
            core_views = {r['table_name'] for r in rows}
            is_ready = ('don_hang' in core_views and 'chi_nhanh' in core_views)
            if is_ready:
                logger.info(f"Warehouse views initialized successfully ({success_count}/{len(WAREHOUSE_VIEWS)} views active).")
            return is_ready
    except Exception as e:
        logger.warning(f"Error initializing warehouse views: {e}")
        return False
    finally:
        conn.close()
