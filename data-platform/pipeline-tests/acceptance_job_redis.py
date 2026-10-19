"""Two job-service instances against an explicitly isolated real Redis fixture.

No host ports or production Redis URL are used. This is not a two API-process
load/SLO claim; it verifies the existing repository's actual transaction/locks.
"""
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import os
import threading
import time
from unittest import TestCase
from unittest.mock import Mock,patch
from uuid import uuid4

import redis
from services.analysis_job_service import AnalysisJobs,JobRepository,TERMINAL
from services.analysis_catalog import AnalysisError


class FaultClient:
    def __init__(self,client,when):self.client=client;self.when=when;self.fired=False
    def __getattr__(self,name):return getattr(self.client,name)
    def pipeline(self,**kwargs):
        original=self.client.pipeline(**kwargs);owner=self
        class Transaction:
            def __enter__(self):original.__enter__();return self
            def __exit__(self,*args):return original.__exit__(*args)
            def set(self,*args,**kw):original.set(*args,**kw);return self
            def execute(self):
                if not owner.fired and owner.when=='before':
                    owner.fired=True;raise redis.ConnectionError('fixture before EXEC')
                result=original.execute()
                if not owner.fired and owner.when=='after':
                    owner.fired=True;raise redis.ConnectionError('fixture lost EXEC acknowledgement')
                return result
        return Transaction()


class RedisJobOperationsTests(TestCase):
    def setUp(self):
        if os.getenv('V34_PIPELINE_REDIS_FIXTURE')!='1':raise RuntimeError('Explicit isolated Redis fixture required')
        self.client=redis.Redis(host='127.0.0.1',port=16379,db=15,decode_responses=True,socket_timeout=2,socket_connect_timeout=2)
        self.addCleanup(self.client.close)
        self.other_client=redis.Redis(host='127.0.0.1',port=16379,db=15,decode_responses=True,socket_timeout=2,socket_connect_timeout=2)
        self.addCleanup(self.other_client.close)
        self.assertEqual(self.client.info('server')['tcp_port'],16379)
        # Only the task-owned isolated namespace/database is disposable.
        keys=list(self.client.scan_iter(match='analyst:{jobs}:*'))
        if keys:self.client.delete(*keys)
        self.enterContext(patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_ENV':'development',
            'DATA_ANALYST_SESSION_STORE':'memory','DATA_ANALYST_ARTIFACT_STORE':'memory',
            'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'3','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1'}))
        self.enterContext(patch('requests.sessions.Session.request',side_effect=AssertionError('No external provider HTTP')))

    def test_two_repositories_register_same_idempotency_key_only_once_under_contention(self):
        repositories=[JobRepository(self.client),JobRepository(self.other_client)]
        def submit(i):return repositories[i%2].create('owner-a','same-key',{'prompt':'fixture'})
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(submit,range(16)))
        self.assertEqual(len({job['job_id'] for job,_ in results}),1)
        self.assertEqual(sum(created for _,created in results),1)
        self.assertEqual(len(repositories[0].read('active')),1)
        self.assertEqual(len(list(self.client.scan_iter(match='analyst:{jobs}:aj_*'))),1)

    def test_concurrent_multi_owner_admission_is_globally12_and_per_owner4(self):
        repositories=[JobRepository(self.client),JobRepository(self.other_client)]
        def submit(i):
            try:return repositories[i%2].create('owner-'+str(i%4),str(i),{'prompt':'fixture'})[0]
            except AnalysisError as error:return error.category
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(submit,range(16)))
        accepted=[r for r in results if isinstance(r,dict)]
        self.assertEqual(len(accepted),12);self.assertEqual([r for r in results if isinstance(r,str)],['job_busy']*4)
        self.assertLessEqual(max(Counter(r['owner'] for r in accepted).values()),4)
        self.assertEqual(set(repositories[0].read('active')),{r['job_id'] for r in accepted})

    def test_before_exec_fault_has_no_partial_job_idempotency_or_admission(self):
        repo=JobRepository(FaultClient(self.client,'before'))
        with self.assertRaises(AnalysisError):repo.create('owner-a','key-a',{'prompt':'fixture'})
        self.assertEqual(list(self.client.scan_iter(match='analyst:{jobs}:*')),[])

    def test_lost_exec_ack_is_confirmed_by_exact_readback_without_duplicate_registration(self):
        repo=JobRepository(FaultClient(self.client,'after'))
        job,created=repo.create('owner-a','key-a',{'prompt':'fixture'})
        self.assertTrue(created)
        same,created_again=JobRepository(self.client).create('owner-a','key-a',{'prompt':'fixture'})
        self.assertFalse(created_again);self.assertEqual(same['job_id'],job['job_id'])
        self.assertEqual(repo.read('active'),[job['job_id']])
        self.assertEqual(job['physical_http'],0)

    def test_two_services_reconnect_to_same_running_job_without_a_second_interpretation(self):
        from tests import test_hybrid_v28 as f
        from evals.fixture_warehouse import FixtureWarehouse
        entered,released=threading.Event(),threading.Event();created=[]
        def factory(owner):
            interpreter=f.scripted(f.envelope())
            def provider(**kwargs):entered.set();released.wait(2);return interpreter(**kwargs)
            def execute(statement,**kwargs):
                warehouse=FixtureWarehouse(f.AnalysisCatalog(f.physical_metadata()).overlay)
                try:return warehouse(statement,**kwargs)
                finally:warehouse.close()
            pipeline=f.AnalysisPipeline(metadata_loader=f.physical_metadata,provider=provider,executor=execute,
                value_lookup=Mock(return_value=[]),owner_id=owner)
            created.append(pipeline);return pipeline
        services=[AnalysisJobs(JobRepository(client),factory,workers=1) for client in [self.client,self.other_client]]
        for service in services:self.addCleanup(service.shutdown)
        request=f.AiTextToReportRequest(question=f.SCENARIO_A,reference_date=f.REFERENCE)
        key=uuid4().hex;first=services[0].submit(request,'fixture-owner',key)
        try:
            self.assertTrue(entered.wait(2))
            second=services[1].submit(request,'fixture-owner',key)
            self.assertEqual(first['job_id'],second['job_id'])
        finally:released.set()
        end=time.monotonic()+10
        while time.monotonic()<end:
            result=services[1].status(first['job_id'],'fixture-owner')
            if result['state'] in TERMINAL:break
            time.sleep(.01)
        self.assertEqual(result['state'],'completed',result.get('result'))
        self.assertEqual(len(created),1);self.assertEqual(result['provider_call_count'],1)
        self.assertEqual(result['physical_http'],0)  # Scripted interpretation, no actual HTTP.

    def test_expired_uncertain_paid_job_keeps_reservations_across_repository_and_service_restart(self):
        from tests import test_hybrid_v28 as f
        request=f.AiTextToReportRequest(question=f.SCENARIO_A,reference_date=f.REFERENCE)
        payload=request.model_dump(mode='json',exclude_unset=True);payload['natural_input']=request.natural_input
        repo=JobRepository(self.client);key=uuid4().hex
        job,_=repo.create('fixture-owner',key,payload)
        repo.mutate(job['job_id'],lambda j:j.update(state='executing',worker_token='lost-worker',physical_http=2,
            provider_call_count=2,recovery_used=True,deadline_at=time.time()-1))
        factory=Mock(side_effect=AssertionError('Uncertain paid work must not replay'))
        restarted=AnalysisJobs(JobRepository(self.client),factory,workers=1);self.addCleanup(restarted.shutdown)
        result=restarted.status(job['job_id'],'fixture-owner')
        self.assertEqual(result['state'],'failed');self.assertEqual(result['physical_http'],2)
        self.assertEqual(restarted.submit(request,'fixture-owner',key)['job_id'],job['job_id'])
        self.assertEqual(restarted.status(job['job_id'],'fixture-owner')['physical_http'],2)
        factory.assert_not_called()
