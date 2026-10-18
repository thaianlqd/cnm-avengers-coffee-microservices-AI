"""Isolated HTTP/browser harness: real routers, jobs, compiler and validators; fixture boundaries only.

Run in a separate container without production credentials. This module is never imported by server.py.
External provider and warehouse access are forbidden even if the fixture wiring regresses.
"""
import os
if os.getenv('V33_FIXTURE_SERVER') != '1':
    raise RuntimeError('This harness requires an explicitly isolated fixture process')

from contextlib import ExitStack
from contextlib import contextmanager
from copy import deepcopy
from datetime import date
from unittest.mock import patch, Mock
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from tests.analysis_fixtures import physical_metadata
from tests import test_hybrid_v28 as fixture
from evals.fixture_warehouse import FixtureWarehouse
from services.analysis_catalog import AnalysisCatalog
from services.agent_pipeline import AnalysisPipeline
from services.analysis_job_service import AnalysisJobs, JobRepository
from services import analysis_job_service, preflight_service
from routers import ai, reports, analysis_modules
from tests.test_natural_v26 import MemoryModules
modules=MemoryModules()

catalog=AnalysisCatalog(physical_metadata())
metrics={'logical_calls':0,'sql_queries':0,'external_http':0}
stack=ExitStack()
stack.enter_context(patch('requests.sessions.Session.request',side_effect=AssertionError('Fixture network forbidden')))
stack.enter_context(patch('psycopg2.connect',side_effect=AssertionError('Fixture external warehouse forbidden')))
stack.enter_context(patch('services.value_profile_service.warehouse_statistics',return_value={}))

# Persistence boundary for the real saved-report HTTP handlers. This store is
# process-local and cannot access the user's reports or production database.
saved={}
class SavedCursor:
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def execute(self,sql,params=()):
        if 'INSERT INTO analytics.saved_reports' in sql:
            fields=('id','title','description','category','query_type','sql_query','visualization_type','x_key','y_key','ai_summary','created_by','module_config')
            row=dict(zip(fields,params));row['module_config']=deepcopy(getattr(row['module_config'],'adapted',row['module_config']))
            row.update(created_at='2026-10-17 00:00',updated_at='2026-10-17 00:00');saved[row['id']]=row;self.rows=[row]
        elif 'FROM analytics.saved_reports' in sql:
            self.rows=[saved[params[0]]] if 'WHERE id =' in sql and params[0] in saved else [] if 'WHERE id =' in sql else list(saved.values())
        else:raise AssertionError('Undeclared fixture persistence operation')
    def fetchone(self):return deepcopy(self.rows[0]) if self.rows else None
    def fetchall(self):return deepcopy(self.rows)
class SavedConnection:
    def cursor(self):return SavedCursor()
    def commit(self):pass
@contextmanager
def saved_connection():yield SavedConnection()
stack.enter_context(patch.object(reports,'get_db_conn',saved_connection))


def execute(sql,**kwargs):
    metrics['sql_queries']+=1
    warehouse=FixtureWarehouse(catalog.overlay)
    try: return warehouse(sql,**kwargs)
    finally: warehouse.close()


class FixtureInterpreter:
    """Scripted interpretation for the declared revenue journeys, never a production language parser."""
    def __call__(self,**kwargs):
        metrics['logical_calls']+=1
        body=str(kwargs.get('messages',[]))
        metric='store_revenue' if 'chi nhánh' in body else 'revenue'
        dimension='reporting_region' if 'theo miền' in body else 'store'
        req=fixture.requirement(id='browser_revenue',goal='Doanh thu trong phạm vi yêu cầu',domain_id='orders',
            metric_ids=[metric],dimension_ids=[dimension],analysis_kind='aggregate',ranking=None,
            derived_features=[],time=None)
        return fixture.scripted(fixture.envelope(req))(**kwargs)


def pipeline(owner_id=None,**kwargs):
    p=AnalysisPipeline(metadata_loader=physical_metadata,provider=FixtureInterpreter(),executor=Mock(wraps=execute),
        value_lookup=lambda *a,**kw:[],owner_id=owner_id,module_repository=modules)
    original=p.generate
    def generate(request):
        try:return original(request)
        except Exception:
            import traceback
            traceback.print_exc()
            raise
    p.generate=generate
    return p


stack.enter_context(patch.object(ai,'AnalysisPipeline',pipeline))
stack.enter_context(patch.object(analysis_modules,'AnalysisPipeline',pipeline))
stack.enter_context(patch.object(ai,'get_local_metadata',physical_metadata))
stack.enter_context(patch.object(reports,'get_local_metadata',physical_metadata,create=True))
stack.enter_context(patch('services.sql_service.execute_read_only',execute))
stack.enter_context(patch('services.metadata_service.get_local_metadata',physical_metadata))
stack.enter_context(patch('services.readiness_service.readiness',return_value={'status':'ready','warehouse_available':True,'catalog_ready':True}))
stack.enter_context(patch('services.provider_health_service.provider_health',return_value={'state':'available','fixture':True}))
analysis_job_service._jobs=AnalysisJobs(JobRepository(),pipeline_factory=lambda owner:pipeline(owner))
preflight_service.preflight_catalog=lambda:catalog
app=FastAPI(title='V33 isolated fixture HTTP acceptance')
app.include_router(ai.router)
app.include_router(reports.router)
app.include_router(analysis_modules.router)


@app.get('/health')
def health(): return {'fixture':True,'external_http':0}


@app.get('/api/test/metrics')
def counters(): return dict(metrics)


@app.get('/api/{path:path}')
def empty_read(path:str): return [] if 'saved' in path or 'list' in path or 'modules' in path else {}


if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='0.0.0.0',port=8765,log_level='warning')
