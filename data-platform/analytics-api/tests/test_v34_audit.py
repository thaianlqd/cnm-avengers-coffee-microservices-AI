"""Privileged audit reserves durable writes and forbids arbitrary payload fields."""
from unittest import TestCase
from unittest.mock import MagicMock,patch
from fastapi import HTTPException
from services import telemetry
from services.access_policy import active_principal,principal_for
from tests.test_v34_access_policy import POLICY
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory


class AuditTests(TestCase):
    def setUp(self):
        principal=principal_for({'subject':'fixture-user','role':'ADMIN','expires_at':4000000000},POLICY)
        value=active_principal.set(principal)
        self.addCleanup(active_principal.reset,value)
        patcher=patch('services.access_policy.load_policy',return_value=POLICY)
        patcher.start();self.addCleanup(patcher.stop)

    def test_export_reservation_commits_append_only_record_without_prompt_sql_or_tokens(self):
        connection=MagicMock()
        identity=telemetry.audit('report.export','report',resource_key='rpt_fixture',connection_factory=lambda:connection)
        statement,args=connection.cursor.return_value.__enter__.return_value.execute.call_args.args
        self.assertTrue(statement.startswith('INSERT INTO analytics.audit_events'))
        self.assertNotIn('UPDATE',statement)
        self.assertNotIn('DELETE',statement)
        self.assertEqual(args[0],identity)
        self.assertEqual(args[2],'report.export')
        self.assertTrue(args[1].startswith('account:'))
        connection.commit.assert_called_once()
        connection.close.assert_called_once()

    def test_audit_sink_failure_is_closed_with_bounded_public_error_and_rollback(self):
        connection=MagicMock()
        connection.commit.side_effect=RuntimeError('fixture secret and rejected raw row must never be returned')
        with self.assertRaises(HTTPException) as caught:
            telemetry.audit('pipeline.trigger','pipeline',connection_factory=lambda:connection)
        self.assertEqual(caught.exception.status_code,503)
        self.assertNotIn('fixture secret',caught.exception.detail)
        connection.rollback.assert_called_once()
        connection.close.assert_called_once()

    def test_private_detail_and_unbounded_metric_labels_are_rejected_before_sink(self):
        factory=MagicMock()
        for details in ({'prompt':'private business question'},{'sql':'SELECT raw'},{'reason':'arbitrary prose value'}):
            with self.assertRaises(ValueError):
                telemetry.audit('report.export','report',details=details,connection_factory=factory)
        factory.assert_not_called()
        with self.assertRaises(ValueError):telemetry.event('sql:arbitrary-user-id','completed')

    def test_trace_context_is_joinable_and_does_not_become_metric_labels(self):
        before=telemetry.snapshot()
        r=telemetry.request_id.set('req_fixture')
        j=telemetry.job_id.set('aj_fixture')
        try:
            value=telemetry.event('sql','completed',duration_ms=12.5,rows=2)
            self.assertEqual(value['request_id'],'req_fixture')
            self.assertEqual(value['job_id'],'aj_fixture')
        finally:
            telemetry.job_id.reset(j);telemetry.request_id.reset(r)
        exported=telemetry.snapshot()
        self.assertNotIn('req_fixture',str(exported))
        self.assertNotIn('aj_fixture',str(exported))
        self.assertLessEqual(len(exported['counts']),13*6)

    def test_failure_locations_and_sqlstate_are_joinable_without_exception_text_or_locals(self):
        import json
        class FixtureDatabaseError(Exception):pgcode='42501'
        r=telemetry.request_id.set('req_failure_fixture')
        self.addCleanup(telemetry.request_id.reset,r)
        try:
            try:raise FixtureDatabaseError('private prompt, SQL literal, token=fixture-sensitive-value')
            except FixtureDatabaseError as cause:raise RuntimeError('another private payload') from cause
        except RuntimeError as error:
            with self.assertLogs('analytics.failures',level='ERROR') as logs:
                diagnostic=telemetry.failure_diagnostic(error,action='generate')
        self.assertEqual(diagnostic['request_id'],'req_failure_fixture')
        self.assertEqual(diagnostic['sqlstates'],['42501'])
        self.assertTrue(diagnostic['locations'])
        self.assertNotIn('private prompt',str(logs.output))
        self.assertNotIn('fixture-sensitive-value',json.dumps(diagnostic))
        self.assertNotIn('another private payload',str(logs.output))

    def test_pipeline_uses_http_trace_identity_for_its_public_failure_reference(self):
        from services.agent_pipeline import AnalysisPipeline
        r=telemetry.request_id.set('req_shared_failure_fixture')
        self.addCleanup(telemetry.request_id.reset,r)
        self.assertEqual(AnalysisPipeline().semantic_info['request_id'],'req_shared_failure_fixture')

    def spool(self):
        folder=Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch.dict(os.environ,{'DATA_ANALYST_AUDIT_SPOOL_DIR':str(folder)}))
        return folder

    def offline_reserve(self):
        return telemetry.audit('report.export','report',resource_key='rpt_fixture',
            connection_factory=MagicMock(side_effect=OSError('fixture unavailable, private connection details')))

    def test_acknowledged_spool_is_private_bounded_and_replays_original_identity_and_clock(self):
        folder=self.spool();identity=self.offline_reserve()
        pending=folder/(identity+'.json');record=json.loads(pending.read_text())
        self.assertEqual(pending.stat().st_mode&0o777,0o600)
        self.assertEqual(record['event_id'],identity)
        self.assertNotIn('private connection',pending.read_text())
        connection=MagicMock()
        second=telemetry.audit('report.export','report',connection_factory=lambda:connection)
        calls=connection.cursor.return_value.__enter__.return_value.execute.call_args_list
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0].args[1][0],identity)
        self.assertEqual(calls[0].args[1][-2],record['occurred_at'])
        self.assertEqual(calls[1].args[1][0],second)
        self.assertFalse(pending.exists());connection.commit.assert_called_once()
        self.assertTrue(all('ON CONFLICT DO NOTHING' in c.args[0] for c in calls))

    def test_full_spool_and_byte_limit_deny_new_privileged_work_without_discarding_history(self):
        folder=self.spool()
        with patch.object(telemetry,'_AUDIT_SPOOL_MAX_EVENTS',1):
            identity=self.offline_reserve()
            with self.assertRaises(HTTPException) as caught:self.offline_reserve()
            self.assertEqual(caught.exception.status_code,503)
            self.assertEqual([p.name for p in folder.glob('*.json')],[identity+'.json'])
        with patch.object(telemetry,'_AUDIT_SPOOL_MAX_BYTES',1):
            with self.assertRaises(HTTPException):self.offline_reserve()
        self.assertTrue((folder/(identity+'.json')).exists())

    def test_disk_write_without_fsync_acknowledgement_cannot_reserve_audit(self):
        folder=self.spool()
        with patch('os.fsync',side_effect=OSError('fixture disk unavailable')):
            with self.assertRaises(HTTPException) as caught:self.offline_reserve()
        self.assertEqual(caught.exception.status_code,503)
        self.assertEqual(list(folder.glob('*.json')),[])

    def test_lost_database_commit_ack_keeps_same_event_id_for_idempotent_replay(self):
        folder=self.spool();connection=MagicMock()
        connection.commit.side_effect=OSError('fixture lost acknowledgement')
        identity=telemetry.audit('report.export','report',connection_factory=lambda:connection)
        self.assertTrue((folder/(identity+'.json')).exists())
        self.assertEqual(connection.cursor.return_value.__enter__.return_value.execute.call_args.args[1][0],identity)
        connection.rollback.assert_called_once()
        healthy=MagicMock()
        telemetry.audit('report.export','report',connection_factory=lambda:healthy)
        self.assertEqual(healthy.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args[1][0],identity)
        self.assertEqual(list(folder.glob('*.json')),[])

    def test_corrupt_or_private_payload_and_symlink_spool_are_closed_before_database(self):
        folder=self.spool();identity=self.offline_reserve();pending=folder/(identity+'.json')
        record=json.loads(pending.read_text());record['details']['prompt']='fixture private prompt'
        pending.write_text(json.dumps(record));factory=MagicMock()
        with self.assertRaises(HTTPException):telemetry.audit('report.export','report',connection_factory=factory)
        factory.assert_not_called();self.assertTrue(pending.exists())
        link=folder/'linked';link.symlink_to(folder,target_is_directory=True)
        with patch.dict(os.environ,{'DATA_ANALYST_AUDIT_SPOOL_DIR':str(link)}):
            with self.assertRaises(HTTPException):telemetry.audit('report.export','report',connection_factory=factory)
        factory.assert_not_called()

    def test_replay_cleanup_failure_keeps_acknowledged_database_event_replayable(self):
        folder=self.spool();identity=self.offline_reserve();connection=MagicMock()
        with patch('os.unlink',side_effect=OSError('fixture cleanup unavailable')):
            telemetry.audit('report.export','report',connection_factory=lambda:connection)
        connection.commit.assert_called_once();self.assertTrue((folder/(identity+'.json')).exists())
        healthy=MagicMock();telemetry.audit('report.export','report',connection_factory=lambda:healthy)
        self.assertEqual(healthy.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args[1][0],identity)
        self.assertEqual(list(folder.glob('*.json')),[])

    def test_spool_lock_admission_is_bounded_and_concurrent_writers_obey_shared_capacity(self):
        from concurrent.futures import ThreadPoolExecutor
        from contextvars import copy_context
        folder=self.spool();factory=MagicMock()
        with telemetry._audit_spool(),ThreadPoolExecutor(max_workers=1) as workers:
            pending=workers.submit(copy_context().run,telemetry.audit,'report.export','report',connection_factory=factory)
            with self.assertRaises(HTTPException) as caught:pending.result(timeout=2)
            self.assertEqual(caught.exception.status_code,503);factory.assert_not_called()
        def reserve():
            try:return self.offline_reserve()
            except HTTPException as error:
                self.assertEqual(error.status_code,503);return None
        with patch.object(telemetry,'_AUDIT_SPOOL_MAX_EVENTS',3),ThreadPoolExecutor(max_workers=8) as workers:
            futures=[workers.submit(copy_context().run,reserve) for _ in range(8)]
            accepted=[value for future in futures if (value:=future.result(timeout=3)) is not None]
        self.assertEqual(len(accepted),3)
        self.assertEqual({p.stem for p in folder.glob('*.json')},set(accepted))
