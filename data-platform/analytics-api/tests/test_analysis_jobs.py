"""Lifecycle and transport budgets through the real one-click orchestrator."""
import threading
import time
from types import MethodType
from unittest.mock import patch
from uuid import uuid4
from tests import test_hybrid_v28 as f
from services.analysis_job_service import AnalysisJobs, JobRepository, TERMINAL
from services.analysis_catalog import AnalysisError
from evals.fixture_warehouse import FixtureWarehouse


class AnalysisJobTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def jobs(self, provider_factory=None, repository=None, before=None):
        self.pipelines=[]
        def factory(owner):
            p=self.pipeline(provider_factory() if provider_factory else f.scripted(f.envelope()))
            p.owner_id=owner
            self.pipelines.append(p)
            original=p.generate
            def generate(p,request):
                if before: before()
                warehouse=FixtureWarehouse(p.catalog().overlay)
                p.executor=warehouse
                try: return original(request)
                finally: warehouse.close()
            p.generate=MethodType(generate,p)
            return p
        jobs=AnalysisJobs(repository or JobRepository(),factory)
        self.addCleanup(lambda:jobs.pool.shutdown(wait=True))
        return jobs

    def wait(self,jobs,id,owner='owner-a'):
        end=time.monotonic()+10
        while time.monotonic()<end:
            value=jobs.status(id,owner)
            if value['state'] in TERMINAL:return value
            time.sleep(.01)
        self.fail('Offline job did not finish')

    def test_one_submit_produces_verified_report_and_duplicate_is_free(self):
        jobs=self.jobs();key=uuid4().hex;request=self.request()
        first=jobs.submit(request,'owner-a',key)
        result=self.wait(jobs,first['job_id'])
        self.assertEqual(result['state'],'completed',result.get('result'))
        self.assertEqual(result['provider_call_count'],1)
        self.assertEqual(result['result']['diagnostics']['provider_call_count'],1)
        duplicate=jobs.submit(request,'owner-a',key)
        self.assertEqual(duplicate,result)
        self.assertEqual(sum(p.provider.call_count for p in self.pipelines),1)
        with self.assertRaises(AnalysisError):jobs.status(first['job_id'],'owner-b')
        with self.assertRaises(AnalysisError):jobs.submit(self.request('Doanh thu toàn hệ thống'),'owner-a',key)

    def test_exact_plan_cache_avoids_new_provider_but_changed_input_misses(self):
        jobs=self.jobs();r=self.request()
        one=self.wait(jobs,jobs.submit(r,'owner-a',uuid4().hex)['job_id'])
        two=self.wait(jobs,jobs.submit(r,'owner-a',uuid4().hex)['job_id'])
        self.assertEqual(one['state'],'completed',one['result'])
        self.assertEqual(two['state'],'completed',two['result'])
        self.assertEqual(two['provider_call_count'],0)
        self.assertTrue(two['result']['diagnostics']['plan_cache_hit'])
        r.refresh=True
        three=self.wait(jobs,jobs.submit(r,'owner-a',uuid4().hex)['job_id'])
        self.assertEqual(three['provider_call_count'],1)

    def test_cancel_before_submit_response_cannot_start_paid_work(self):
        jobs=self.jobs();key=uuid4().hex
        self.assertEqual(jobs.cancel_key(key,'owner-a')['state'],'cancelled')
        result=jobs.submit(self.request(),'owner-a',key)
        self.assertEqual(result['state'],'cancelled')
        self.assertEqual(result['provider_call_count'],0)
        self.assertFalse(self.pipelines)

    def test_old_job_contract_requires_new_submission_without_replaying_provider(self):
        jobs=self.jobs();first=jobs.submit(self.request(),'owner-a',uuid4().hex)
        done=self.wait(jobs,first['job_id'])
        self.assertEqual(done['state'],'completed')
        jobs.repository.mutate(first['job_id'],lambda j:j.update(version='obsolete'))
        with self.assertRaises(AnalysisError) as caught:jobs.status(first['job_id'],'owner-a')
        self.assertEqual(caught.exception.category,'job_expired')
        self.assertEqual(sum(p.provider.call_count for p in self.pipelines),1)

    def test_concurrent_plan_cache_jobs_have_independent_session_revisions(self):
        jobs=self.jobs();request=self.request()
        first=self.wait(jobs,jobs.submit(request,'owner-a',uuid4().hex)['job_id'])
        self.assertEqual(first['state'],'completed')
        concurrent=[jobs.submit(request,'owner-a',uuid4().hex) for _ in range(3)]
        results=[self.wait(jobs,j['job_id']) for j in concurrent]
        self.assertTrue(all(j['state']=='completed' for j in results),results)
        self.assertTrue(all(j['provider_call_count']==0 for j in results))
        self.assertEqual(len({j['result']['session_id'] for j in results}),3)

    def test_cancel_cannot_publish_late_result_or_execute_sql(self):
        entered,released=threading.Event(),threading.Event()
        def provider():
            scripted=f.scripted(f.envelope())
            def delayed(**kw):
                entered.set();released.wait(2)
                return scripted(**kw)
            return delayed
        jobs=self.jobs(provider)
        job=jobs.submit(self.request(),'owner-a',uuid4().hex)
        self.assertTrue(entered.wait(2))
        cancelled=jobs.cancel(job['job_id'],'owner-a')
        released.set()
        self.assertEqual(cancelled['state'],'cancelled')
        jobs.pool.shutdown(wait=True)
        self.assertEqual(jobs.status(job['job_id'],'owner-a')['state'],'cancelled')
        self.assertTrue(all(not p.executor.called for p in self.pipelines))

    def test_three_rejections_never_become_four_calls_after_reconnect(self):
        bad=f.envelope(f.requirement(metric_ids=['aov'],dimension_ids=['city'],
            analysis_kind='aggregate',ranking=None,derived_features=[],time=None))
        jobs=self.jobs(lambda:f.scripted(bad,bad,bad))
        key=uuid4().hex;r=self.request('Doanh thu theo thành phố')
        job=jobs.submit(r,'owner-a',key);result=self.wait(jobs,job['job_id'])
        self.assertEqual(result['state'],'failed')
        self.assertEqual(result['provider_call_count'],3)
        self.assertEqual(jobs.submit(r,'owner-a',key)['job_id'],job['job_id'])
        self.assertEqual(sum(p.provider.call_count for p in self.pipelines),3)

    def test_partial_scope_stops_before_sql(self):
        supported=f.requirement(derived_features=[],time=None)
        missing=dict(id='future',goal='Dự báo',availability='unsupported',reason='definition_unavailable')
        jobs=self.jobs(lambda:f.scripted(f.envelope(supported,missing)))
        job=jobs.submit(self.request('Theo lựa chọn'),'owner-a',uuid4().hex)
        result=self.wait(jobs,job['job_id'])
        self.assertEqual(result['state'],'partial_available',result['result'])
        self.assertTrue(all(not p.executor.called for p in self.pipelines))

    def test_expired_worker_is_not_replayed_by_another_replica(self):
        repository=JobRepository()
        request=self.request();payload=request.model_dump(mode='json');payload['natural_input']=True
        key=uuid4().hex
        job,_=repository.create('owner-a',key,payload)
        repository.mutate(job['job_id'],lambda j:j.update(state='repairing',worker_token='lost',
            provider_call_count=2,deadline_at=time.time()-1))
        jobs=self.jobs(repository=repository)
        result=jobs.status(job['job_id'],'owner-a')
        self.assertEqual(result['state'],'failed')
        self.assertEqual(result['provider_call_count'],2)
        self.assertEqual(jobs.submit(request,'owner-a',key)['job_id'],job['job_id'])
        self.assertFalse(self.pipelines)

    def test_load_one_five_ten_jobs_without_provider_network(self):
        for count in (1,5,10):
            with self.subTest(count=count):
                jobs=self.jobs()
                # Separate owners avoid measuring plan cache as throughput.
                submitted=[(f'owner-{i}',jobs.submit(self.request(),f'owner-{i}',uuid4().hex)) for i in range(count)]
                values=[self.wait(jobs,j['job_id'],owner) for owner,j in submitted]
                self.assertTrue(all(v['state']=='completed' for v in values),[(v['state'],v['result']) for v in values if v['state']!='completed'])
                self.assertEqual(sum(v['provider_call_count'] for v in values),count)
