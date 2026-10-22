import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch, Mock
from fastapi import HTTPException
import sync_control as control
from services import source_operations_service as service


class SyncControlTests(TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'DATA_PLATFORM_SYNC_CONTROL_DIR':self.directory.name})
        self.env.start()
        control.write('worker',{'worker_id':'worker-a','heartbeat':time.time(),'phase':'idle'})

    def tearDown(self):
        self.env.stop();self.directory.cleanup()

    def test_concurrent_duplicate_requests_have_only_one_job_and_only_one_worker_claim(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(lambda _:control.enqueue(),range(8)))
        self.assertEqual(sum(created for _,created in results),1)
        self.assertEqual(len({operation['id'] for operation,_ in results}),1)
        job=control.claim('worker-a')
        self.assertEqual(job['state'],'running')
        self.assertIsNone(control.claim('worker-b'))
        self.assertEqual(control.enqueue()[0]['id'],job['id'])
        control.finish(job,{'synced_tables':48,'total_tables':49,'failed_tables':1})
        self.assertEqual(control.observe()['operation']['state'],'partial')
        with self.assertRaises(ValueError):control.enqueue()

    def test_offline_worker_expired_request_and_worker_restart_do_not_claim_success(self):
        control.write('worker',{'worker_id':'worker-a','heartbeat':time.time()-60})
        with self.assertRaises(RuntimeError):control.enqueue()
        self.assertIsNone(control.observe()['operation'])
        control.write('worker',{'worker_id':'worker-a','heartbeat':time.time()})
        job,_=control.enqueue()
        control.write('operation',{**job,'requested_at':time.time()-601})
        self.assertIsNone(control.claim('worker-a'))
        self.assertEqual(control.observe()['operation']['state'],'expired')
        control.write('operation',{**job,'state':'running','worker_id':'old'})
        self.assertEqual(control.observe()['operation']['state'],'interrupted')

    def test_worker_error_is_failed_and_status_hides_internal_worker_identity(self):
        control.enqueue();job=control.claim('worker-a')
        control.finish(job,error_code='OperationalError')
        principal=SimpleNamespace(permits=lambda p:False)
        status=service.sync_status(principal)
        self.assertFalse(status['can_trigger'])
        self.assertNotIn('worker_id',status['operation'])
        self.assertEqual(status['operation']['state'],'failed')

    def test_health_refresh_reuses_bounded_read_and_does_not_mutate_raw_certificates(self):
        original={'status':'ready','data_health':{'datasets':{'private':'proof'},'views':{'silver.x':{'status':'unknown'}}}}
        with patch.object(service,'_coverage',None),patch('services.data_coverage_service.refresh',return_value=original) as refresh:
            result=service.health_refresh();service.health_refresh()
            self.assertEqual(refresh.call_count,1)
            self.assertEqual(result['data_health']['datasets'],{})
            self.assertEqual(original['data_health']['datasets'],{'private':'proof'})
            self.assertEqual(result['data_health']['views']['silver.x']['status'],'unknown')

    def test_sync_route_requires_write_permission_before_enqueuing(self):
        from routers.system import sync_sources
        with patch('services.access_policy.current_principal',return_value=SimpleNamespace(expires_at=time.time()+100,permits=lambda p,d=None:False)),patch.object(service,'request_sync') as enqueue:
            with self.assertRaises(HTTPException) as error:sync_sources()
            self.assertEqual(error.exception.status_code,403)
            enqueue.assert_not_called()

    def test_health_refresh_projects_each_account_after_shared_cache(self):
        original={'status':'ready','overall':{'min_date':'2026-01-01'},
                  'facts':{'silver.allowed':{'count':1},'silver.denied':{'count':2}},
                  'data_health':{'datasets':{'private':'proof'},'views':{
                      'silver.allowed':{'status':'healthy'},'silver.denied':{'status':'unknown'}}}}
        allowed=SimpleNamespace(national=True,permits=lambda permission,name:name=='silver.allowed')
        scoped=SimpleNamespace(national=False,permits=lambda permission,name:name=='silver.denied')
        with patch.object(service,'_coverage',None),patch('services.data_coverage_service.refresh',return_value=original) as refresh:
            first=service.health_refresh(allowed)
            second=service.health_refresh(scoped)
        self.assertEqual(refresh.call_count,1)
        self.assertEqual(set(first['facts']),{'silver.allowed'})
        self.assertEqual(set(first['data_health']['views']),{'silver.allowed'})
        self.assertEqual(set(second['data_health']['views']),{'silver.denied'})
        self.assertEqual(second['facts'],{})
        self.assertEqual(second['overall'],{'min_date':None,'max_date':None})
        self.assertEqual(len(original['data_health']['views']),2)

    def test_new_routes_have_explicit_least_privilege_permissions(self):
        from route_policy import lookup
        self.assertEqual(lookup('/api/system/sources/check','POST'),(True,'analytics.read'))
        self.assertEqual(lookup('/api/system/sources/sync','POST'),(True,'pipeline.trigger'))
        self.assertEqual(lookup('/api/system/source-operations','GET'),(True,'analytics.read'))
