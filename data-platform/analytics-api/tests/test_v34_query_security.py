"""Public SQL explorer must share the existing fail-closed report SQL policy."""
import os
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from common import SqlQueryRequest
from routers import query
from services.analysis_catalog import AnalysisCatalog
from tests.analysis_fixtures import physical_metadata


class QuerySecurityTests(TestCase):
    def setUp(self):
        self.catalog = AnalysisCatalog(physical_metadata())

    def test_direct_sql_denied_without_explicit_administration_before_execution(self):
        with patch.dict(os.environ, {'DATA_ANALYST_REPORT_SQL_MODE': 'disabled'}), patch.object(query, 'execute_read_only') as execute:
            with self.assertRaises(HTTPException) as caught:
                query.run_custom_query(SqlQueryRequest(sql='SELECT 1'))
            self.assertEqual(caught.exception.status_code, 403)
            execute.assert_not_called()

    def test_administrator_sql_still_enforces_silver_and_sensitive_policy(self):
        request = SimpleNamespace(headers={'authorization': 'Bearer ' + 'fixture-admin-credential-only-123456789'})
        config = {'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin',
                  'DATA_ANALYST_REPORT_ADMIN_TOKEN': 'fixture-admin-credential-only-123456789'}
        with patch.dict(os.environ, config), patch('services.metadata_service.get_local_metadata', physical_metadata), patch.object(query, 'execute_read_only') as execute:
            for sql in ('SELECT * FROM identity.nguoi_dung', 'SELECT email FROM silver.nguoi_dung',
                        'SELECT pg_sleep(1) FROM silver.don_hang'):
                with self.subTest(sql=sql), self.assertRaises(HTTPException) as caught:
                    query.run_custom_query(SqlQueryRequest(sql=sql), request=request)
                self.assertEqual(caught.exception.status_code, 400)
            execute.assert_not_called()

    def test_authorized_allowed_sql_uses_existing_bounded_executor(self):
        token = 'fixture-admin-credential-only-123456789'
        request = SimpleNamespace(headers={'authorization': 'Bearer ' + token})
        sql = 'SELECT COUNT(ma_don_hang) AS count FROM silver.don_hang'
        with patch.dict(os.environ, {'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin',
                                    'DATA_ANALYST_REPORT_ADMIN_TOKEN': token}), patch('services.metadata_service.get_local_metadata', physical_metadata), patch.object(query, 'execute_read_only', return_value={'columns': ['count'], 'rows': [{'count': 4}], 'count': 1, 'truncated': False, 'duration_ms': 1}) as execute:
            result = query.run_custom_query(SqlQueryRequest(sql=sql), request=request)
            self.assertEqual(result['data'], [{'count': 4}])
            execute.assert_called_once_with(sql, row_limit=500)
