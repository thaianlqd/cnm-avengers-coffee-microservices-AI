"""Admission fairness, atomic registration and bounded shutdown without replay."""
import threading
from unittest.mock import MagicMock,patch
from uuid import uuid4

from tests import test_hybrid_v28 as f
from tests import test_analysis_jobs as job_fixtures
from services.analysis_job_service import JobRepository,AnalysisJobs,TERMINAL


class JobOperationsTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request
    jobs=job_fixtures.AnalysisJobTests.jobs
    wait=job_fixtures.AnalysisJobTests.wait

    def test_owner_cannot_take_all12_slots_and_idempotent_reconnect_does_not_consume_admission(self):
        repo=JobRepository();records=[]
        for owner in ['owner-a','owner-b','owner-c']:
            for i in range(4):records.append(repo.create(owner,str(i),{'prompt':'fixture'})[0])
            with self.assertRaises(f.AnalysisError) as caught:repo.create(owner,'excess',{'prompt':'fixture'})
            self.assertEqual(caught.exception.category,'job_busy')
        self.assertEqual(len(repo.read('active')),12)
        original,created=repo.create('owner-a','0',{'prompt':'fixture'})
        self.assertFalse(created);self.assertEqual(original['job_id'],records[0]['job_id'])
        with self.assertRaises(f.AnalysisError):repo.create('owner-d','new',{'prompt':'fixture'})
        repo.mutate(records[0]['job_id'],lambda j:j.update(state='completed'))
        self.assertTrue(repo.create('owner-d','new',{'prompt':'fixture'})[1])
        self.assertTrue(all(j['provider_call_count']==0 and j['physical_http']==0 for j in records))

    def test_redis_registration_sends_job_idempotency_and_admission_in_one_transaction(self):
        client=MagicMock();client.get.return_value=None
        transaction=client.pipeline.return_value.__enter__.return_value
        job,created=JobRepository(client).create('owner-a','fixture-key',{'prompt':'fixture'})
        self.assertTrue(created);client.pipeline.assert_called_once_with(transaction=True)
        self.assertEqual(transaction.set.call_count,3);transaction.execute.assert_called_once_with()
        keys=[c.args[0] for c in transaction.set.call_args_list]
        self.assertIn('analyst:{jobs}:'+job['job_id'],keys)
        self.assertIn('analyst:{jobs}:active',keys)
        self.assertTrue(any(':idem:' in key for key in keys));client.set.assert_not_called()

    def test_registration_transport_failure_cannot_enqueue_or_send_provider_work(self):
        client=MagicMock();client.get.return_value=None
        client.pipeline.return_value.__enter__.return_value.execute.side_effect=TimeoutError('fixture unknown EXEC outcome')
        service=self.jobs(repository=JobRepository(client))
        with self.assertRaises(f.AnalysisError) as caught:service.submit(self.request(),'owner-a',uuid4().hex)
        self.assertEqual(caught.exception.category,'job_storage')
        self.assertEqual(self.pipelines,[]);self.assertFalse(service.futures)

    def test_enqueue_failure_releases_slot_and_marks_owned_job_failed_without_provider(self):
        service=self.jobs()
        with patch.object(service.pool,'submit',side_effect=RuntimeError('fixture stopped executor')):
            result=service.submit(self.request(),'owner-a',uuid4().hex)
        self.assertEqual(result['state'],'failed');self.assertEqual(result['physical_http'],0)
        self.assertEqual(self.pipelines,[])
        for _ in range(12):self.assertTrue(service.slots.acquire(blocking=False))
        self.assertFalse(service.slots.acquire(blocking=False))
        for _ in range(12):service.slots.release()

    def test_shutdown_cancels_running_and_queued_jobs_preserving_reservations_and_rejecting_new_paid_work(self):
        entered,released=threading.Event(),threading.Event()
        def factory():
            scripted=f.scripted(f.envelope())
            def delayed(**kwargs):
                entered.set();released.wait(2)
                return scripted(**kwargs)
            return delayed
        service=self.jobs(factory,workers=1)
        first=service.submit(self.request(),'owner-a',uuid4().hex)
        self.assertTrue(entered.wait(2))
        queued=[service.submit(self.request(),'owner-a',uuid4().hex) for _ in range(3)]
        before=service.status(first['job_id'],'owner-a')
        try:service.shutdown(grace_seconds=0)
        finally:released.set()
        service.pool.shutdown(wait=True)
        results=[service.status(j['job_id'],'owner-a') for j in [first,*queued]]
        self.assertTrue(all(j['state']=='cancelled' for j in results))
        self.assertEqual(results[0]['provider_call_count'],before['provider_call_count'])
        self.assertTrue(all(j['provider_call_count']==0 for j in results[1:]))
        self.assertEqual(len(self.pipelines),1)
        with self.assertRaises(f.AnalysisError):service.submit(self.request(),'owner-b',uuid4().hex)
        self.assertTrue(all(not pipeline.executor.called for pipeline in self.pipelines))
        for _ in range(12):self.assertTrue(service.slots.acquire(blocking=False))
        for _ in range(12):service.slots.release()

    def test_shutdown_does_not_cancel_jobs_owned_by_another_instance(self):
        repo=JobRepository();remote,_=repo.create('remote-owner','remote-key',{'prompt':'fixture'})
        repo.mutate(remote['job_id'],lambda j:j.update(state='executing',worker_token='remote-worker',physical_http=2))
        service=self.jobs(repository=repo);service.shutdown(grace_seconds=0)
        record=repo.read(remote['job_id'])
        self.assertEqual(record['state'],'executing');self.assertEqual(record['physical_http'],2)
