"""Platform actions must describe actual side effects and require administration."""
import os
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from common import PipelineTriggerRequest
from routers import platform


class PlatformRouteTests(TestCase):
    def test_unauthorized_trigger_does_not_reach_the_warehouse(self):
        with patch.dict(os.environ, {'DATA_ANALYST_REPORT_SQL_MODE': 'disabled'}), patch.object(platform, 'get_db_conn') as db:
            with self.assertRaises(HTTPException) as caught:
                platform.trigger_pipeline(PipelineTriggerRequest())
            self.assertEqual(caught.exception.status_code, 403)
            db.assert_not_called()

    def test_success_is_a_kpi_write_not_a_fabricated_medallion_run(self):
        token = 'fixture-admin-credential-only-123456789'
        request = SimpleNamespace(headers={'authorization': 'Bearer ' + token})
        connection = MagicMock()
        connection.__enter__.return_value = connection
        with patch.dict(os.environ, {'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin',
                                    'DATA_ANALYST_REPORT_ADMIN_TOKEN': token}), patch.object(platform, 'get_db_conn', return_value=connection):
            result = platform.trigger_pipeline(PipelineTriggerRequest(target_layer='gold'), request=request)
        connection.commit.assert_called_once()
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'append_gold_kpi_snapshot')
        self.assertFalse(result['pipeline_executed'])
        self.assertEqual(result['source'], 'postgres-analytics:silver.don_hang')
        self.assertTrue(result['operation_id'].startswith('kpi_'))
        self.assertNotIn('252,025', str(result))

    def test_unsupported_pipeline_target_is_rejected_before_any_database_write(self):
        token = 'fixture-admin-credential-only-123456789'
        request = SimpleNamespace(headers={'authorization': 'Bearer ' + token})
        with patch.dict(os.environ, {'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin',
                                    'DATA_ANALYST_REPORT_ADMIN_TOKEN': token}), patch.object(platform, 'get_db_conn') as db:
            with self.assertRaises(HTTPException) as caught:
                platform.trigger_pipeline(PipelineTriggerRequest(target_layer='silver'), request=request)
            self.assertEqual(caught.exception.status_code, 422)
            db.assert_not_called()

    def test_quality_endpoint_delegates_to_measured_shared_health_projection(self):
        with patch('services.data_coverage_service.contract_quality_snapshot', return_value={'status': 'unknown', 'overall_score': None}) as snapshot:
            self.assertEqual(platform.get_data_quality(), {'status': 'unknown', 'overall_score': None})
            snapshot.assert_called_once_with()


class PlatformHonestyTests(TestCase):
    FABRICATED = ('432.8', '685.4', '128.2', '252025', '487431', '341759', '156064', '72065',
                  '2026-09-28', '48.5', 'hourly_stream_sync', 'daily_lakehouse_pipeline', '99.8')

    @staticmethod
    def _db(rows):
        cur = MagicMock()
        cur.fetchone.side_effect = lambda: rows.pop(0)
        cur.fetchall.return_value = []
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        return conn

    def _no_fabrication(self, payload):
        text = str(payload)
        for literal in self.FABRICATED:
            self.assertNotIn(literal, text)

    def test_static_views_carry_no_invented_measurements(self):
        for view in (platform.get_data_lineage, platform.get_lakehouse_details):
            self._no_fabrication(view())
        lake = platform.get_lakehouse_details()
        self.assertIsNone(lake['overview']['total_storage_mb'])
        self.assertTrue(all(b['size_mb'] is None and b['status'] == 'not_measured' for b in lake['buckets']))

    def test_pipelines_without_publication_pointer_are_not_measured(self):
        with patch.object(platform, 'get_db_conn', side_effect=RuntimeError('boom')):
            data = platform.get_pipelines()
        self._no_fabrication(data)
        self.assertEqual(data['observation_status'], 'not_measured')
        self.assertIsNone(data['active_jobs_count'])
        self.assertTrue(all(j['last_run'] is None and j['rows_processed'] is None for j in data['jobs']))
        self.assertEqual(data['dags'][0]['dag_id'], 'avengers_daily_pipeline')

    def test_overview_reports_only_measured_warehouse_facts(self):
        rows = [dict(total_rows=10), dict(total_orders=2, total_revenue=5, active_deliveries=1),
                dict(total_events=7), dict(total_branches=3), dict(total_products=4), dict(total_tables=9)]
        with patch.object(platform, 'get_db_conn', return_value=self._db(rows)), \
             patch('services.data_coverage_service.contract_quality_snapshot', return_value={'status': 'unknown', 'overall_score': None}):
            data = platform.get_platform_overview()
        self._no_fabrication(data)
        self.assertEqual(data['warehouse']['total_events'], 7)
        self.assertIsNone(data['pipeline']['last_batch_run'])
        self.assertIsNone(data['pipeline']['active_jobs'])
        self.assertIsNone(data['streaming']['consumer_lag'])
        self.assertIsNone(data['quality']['health_score'])
        self.assertTrue(all(b['size_mb'] is None for b in data['storage'].values()))
        self.assertTrue(all(i['status'] == 'configured' for i in data['infrastructure']))

    def test_database_failure_does_not_leak_exception_text(self):
        for view in (platform.get_platform_overview, platform.get_streaming_details):
            with patch.object(platform, 'get_db_conn', side_effect=RuntimeError('password=hunter2 host=db')):
                with self.assertRaises(HTTPException) as caught:
                    view()
            self.assertEqual(caught.exception.status_code, 500)
            self.assertNotIn('hunter2', str(caught.exception.detail))
