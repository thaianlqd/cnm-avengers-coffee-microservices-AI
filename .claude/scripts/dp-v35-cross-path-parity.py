"""Read-only warehouse observations inside the Analyst's exported MVCC snapshot.

Only the deterministic D03 preset is executed. No provider transport, business
rows or credentials are emitted. Different populations are incomparable.
"""
import server
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
import json
import time
from unittest.mock import patch
import db
from common import AiTextToReportRequest
from routers import marts
from services.agent_pipeline import AnalysisPipeline
from services.access_policy import active_principal, principal_for, load_policy
from services import query_execution_batch as batch
from services.verification_reconciliation_service import compare_epochs

observations=[]
original_snapshot=batch.report_snapshot

@contextmanager
def observe_snapshot(tables=()):
    with original_snapshot(tables) as identity:
        conn=db.get_db_conn()
        try:
            batch.begin(conn,12000)
            with conn.cursor() as cur:
                epoch=batch.read_data_epoch(cur,tables)
                cur.execute("SELECT COUNT(*) AS orders, COALESCE(SUM(tong_tien) FILTER (WHERE trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')),0) AS revenue FROM silver.don_hang")
                raw=dict(cur.fetchone())
                cur.execute("SELECT COUNT(*) AS orders, COALESCE(SUM(d.tong_tien) FILTER (WHERE d.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')),0) AS revenue FROM silver.don_hang d JOIN silver.chi_nhanh cn ON d.co_so_ma=cn.ma_chi_nhanh")
                matched=dict(cur.fetchone())
            # Inspect legacy Gold using an explicit operator READ ONLY connection.
            # This is an acceptance probe, never an application reader fallback.
            operator=db.psycopg2.connect(host=db.DB_HOST,port=db.DB_PORT,user=db.DB_USER,
                password=db.DB_PASSWORD,dbname=db.DB_NAME,sslmode=db.DB_SSLMODE,connect_timeout=3,
                cursor_factory=db.psycopg2.extras.RealDictCursor)
            try:
                operator.set_session(readonly=True,isolation_level='REPEATABLE READ')
                with operator.cursor() as cur:
                    cur.execute('SET TRANSACTION SNAPSHOT %s',(identity,))
                    cur.execute("SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='2s'")
                    cur.execute('SELECT COALESCE(SUM(total_orders),0) AS orders, COALESCE(SUM(total_revenue),0) AS revenue FROM gold.stores_overview')
                    gold=dict(cur.fetchone()); gold_status='observed'
                    cur.execute('SELECT pipeline,run_id,manifest_fingerprint,requested_as_of FROM analytics.pipeline_publications ORDER BY pipeline')
                    publications=[dict(row) for row in cur.fetchall()]
            finally:
                operator.rollback();operator.close()
            conn.rollback()
            batch.begin(conn,12000)
            with patch.object(marts,'get_db_conn',return_value=conn):
                overview=marts.get_all_marts(date_range='all',branch='all',payment_method='all')['kpi']
            assert Decimal(str(overview['revenue_all_time']))==raw['revenue']
            assert overview['total_orders_all_time']==raw['orders']
            if gold_status=='observed':assert gold==matched
            observations.append({'epoch':epoch,'raw_order_population':raw,'matched_store_population':matched,
                'marts_kpi':{k:overview[k] for k in ('total_orders_all_time','revenue_all_time')},
                'gold_stores':gold,'gold_status':gold_status,'gold_access':'explicit_operator_readonly_acceptance_probe',
                'versioned_batch_publications':publications,'batch_vs_current_replica':'incomparable_snapshot: independent published run identity',
                'gold_vs_all_orders':'same_population' if raw==matched else 'incomparable_population',
                'gold_menu_vs_order_revenue':'incomparable_definition: quantity*unit_price across all lines differs from eligible order totals'})
        finally:
            conn.close()
        yield identity

principal=principal_for({'subject':'admin','role':'ADMIN','expires_at':time.time()+300},load_policy())
token=active_principal.set(principal)
try:
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Provider forbidden')) as outbound:
        pipeline=AnalysisPipeline(owner_id=principal.bound_owner)
        request=AiTextToReportRequest(dashboard_id='D03',dashboard_version='1.0.0',time={'mode':'all_time'},reference_date=date(2026,10,19),analysis_depth='focused',analysis_scope={'mode':'all','filters':[]},refresh=True)
        proposal=pipeline.propose(request); approved=proposal['proposal']
        request.session_id=proposal['session_id']; request.proposal_revision=approved['revision']
        request.intent_fingerprint=approved['semantic_intent_fingerprint']; request.plan_fingerprint=approved['resolved_plan_fingerprint']; request.catalog_fingerprint=approved['catalog_fingerprint']
        with patch.object(batch,'report_snapshot',observe_snapshot):report=pipeline.generate(request)
        assert report['status']=='success',report['status']
        outbound.assert_not_called()
        epoch=report['provenance']['data_epoch']
        assert len(observations)==1,len(observations)
        consistency=compare_epochs(epoch,observations[0]['epoch'])
        assert consistency['status']=='same_generation',consistency
        scalar={}
        for result in report['result_sets'].values():
            if len(result.get('rows',[]))==1:
                for metric in ('store_revenue','store_order_count'):
                    if metric in result['rows'][0]:scalar[metric]=result['rows'][0][metric]
        for key,raw_key in [('store_revenue','revenue'),('store_order_count','orders')]:
            if key in scalar:assert Decimal(str(scalar[key]))==Decimal(str(observations[0]['raw_order_population'][raw_key]))
        assert set(scalar)=={'store_revenue','store_order_count'},list(scalar)
        print(json.dumps({'version':'3.5.0','status':'passed','observed_at':datetime.now(timezone.utc).isoformat(),
            'snapshot_protocol':'actual Analyst exporter; oracle and marts import the same PostgreSQL MVCC snapshot',
            'consistency':consistency,'analyst_scalar_metrics':scalar,'observations':observations,'provider_http':0,
            'limitations':['Per-source replica generation vector does not imply source-wide atomicity or business completeness',
                'Versioned batch publications have independent run identities; current replica totals are not claimed as parity for an older batch run']},default=str))
finally:
    active_principal.reset(token)
