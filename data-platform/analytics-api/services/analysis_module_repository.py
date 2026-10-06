"""Postgres persistence with owner predicates on every operation; no startup DDL."""
from services.analysis_catalog import AnalysisError


class PostgresModuleRepository:
    def execute(self, sql, params, many=False):
        from db import get_db_conn
        try:
            with get_db_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, params)
                    rows = cur.fetchall() if many else cur.fetchone()
            if many:
                return [dict(r) for r in rows]
            return dict(rows) if rows else None
        except Exception:
            raise AnalysisError("module_storage", "Module persistence unavailable") from None

    def list(self, owner, search=""):
        return self.execute("SELECT module_id, name, description, definition, created_at, updated_at, last_run_at, last_report_id, run_refs, archived FROM analytics.analysis_modules WHERE owner_key=%s AND NOT archived AND (strpos(lower(name), lower(%s))>0 OR strpos(lower((definition->'resolved_domains')::text),lower(%s))>0) ORDER BY updated_at DESC LIMIT 50", (owner, search, search), many=True)

    def get(self, owner, id):
        return self.execute("SELECT module_id, name, description, definition, created_at, updated_at, last_run_at, last_report_id, run_refs, archived FROM analytics.analysis_modules WHERE owner_key=%s AND module_id=%s AND NOT archived", (owner, id))

    def create(self, owner, module):
        from psycopg2.extras import Json
        return self.execute("INSERT INTO analytics.analysis_modules(owner_key,module_id,name,description,definition) VALUES (%s,%s,%s,%s,%s) RETURNING module_id,name,description,definition,created_at,updated_at,last_run_at,last_report_id,run_refs,archived", (owner,module["module_id"],module["name"],module["description"],Json(module["definition"])))

    def patch(self, owner, id, name=None, archived=None):
        return self.execute("UPDATE analytics.analysis_modules SET name=COALESCE(%s,name), archived=COALESCE(%s,archived),updated_at=now() WHERE owner_key=%s AND module_id=%s AND NOT archived RETURNING module_id,name,description,definition,created_at,updated_at,last_run_at,last_report_id,run_refs,archived", (name, archived, owner,id))

    def record_run(self, owner, id, report_id, scope):
        from psycopg2.extras import Json
        return self.execute("UPDATE analytics.analysis_modules SET last_run_at=now(),last_report_id=%s,updated_at=now(), run_refs=(SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (SELECT r FROM jsonb_array_elements(jsonb_build_array(%s::jsonb)||run_refs) WITH ORDINALITY AS x(r,n) WHERE n<=20) recent) WHERE owner_key=%s AND module_id=%s AND NOT archived RETURNING module_id", (report_id,Json({"report_id":report_id,"executed_at":__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),"time_scope":scope,"status":"success"}),owner,id))
