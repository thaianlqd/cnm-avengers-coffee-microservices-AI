"""ADMIN sees application policy truth and safe metadata, not database users."""
from copy import deepcopy
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from routers import query, system
from services import access_policy as access
from tests.analysis_fixtures import physical_metadata
from tests.test_v34_access_policy import POLICY


class AdminViewsTests(TestCase):
    def setUp(self):
        self.policy = deepcopy(POLICY)
        self.policy['roles']['ADMIN']['permissions'] += ['system.read', 'warehouse.read']
        self.principal = access.principal_for({
            'subject': 'fixture-admin', 'role': 'ADMIN', 'expires_at': 4000000000}, self.policy)
        self.token = access.active_principal.set(self.principal)
        self.addCleanup(access.active_principal.reset, self.token)
        self.loader = patch.object(access, 'load_policy', return_value=self.policy)
        self.loader.start()
        self.addCleanup(self.loader.stop)

    def test_catalog_available_when_sql_is_disabled_without_pii_samples(self):
        with patch.dict('os.environ', {'DATA_ANALYST_REPORT_SQL_MODE': 'disabled'}), \
                patch('services.metadata_service.get_local_metadata', physical_metadata):
            result = query.get_warehouse_tables()
        self.assertGreater(len(result['tables']), 0)
        self.assertFalse(result['sql_execution_enabled'])
        for table in result['tables']:
            self.assertTrue(table['name'].startswith('silver.'))
            self.assertFalse(any(column['name'] in {'email', 'so_dien_thoai', 'dia_chi', 'ho_ten'}
                                 for column in table['columns']))
        from services.report_sql_policy import validate_report_sql
        from services.analysis_catalog import AnalysisCatalog
        catalog = AnalysisCatalog(physical_metadata())
        for sample in result['sample_queries']:
            validate_report_sql(sample['sql'], catalog)

    def test_admin_directory_never_turns_database_roles_into_application_users(self):
        with patch.object(system, 'get_db_conn', side_effect=AssertionError('directory must not query pg_roles')):
            result = system.get_system_users()
        self.assertEqual(result['directory_status'], 'not_configured')
        self.assertIsNone(result['total_users'])
        self.assertEqual(result['policy_version'], self.policy['version'])
        self.assertEqual(result['users'][0]['role'], 'ADMIN')
        self.assertEqual(len(result['users']), 1)
        self.assertIsNone(result['users'][0]['email'])
        self.assertIsNone(result['users'][0]['last_login'])
        self.assertTrue(all(role['users_count'] is None for role in result['roles']))

    def test_sql_requires_durable_audit_before_executor(self):
        from common import SqlQueryRequest
        from services import telemetry
        with patch.dict('os.environ', {'DATA_ANALYST_REPORT_SQL_MODE': 'trusted_admin'}), \
                patch('services.metadata_service.get_local_metadata', physical_metadata), \
                patch.object(telemetry, 'audit', side_effect=HTTPException(503, 'audit unavailable')), \
                patch.object(query, 'execute_read_only') as execute:
            with self.assertRaises(HTTPException) as failure:
                query.run_custom_query(SqlQueryRequest(sql='SELECT COUNT(ma_don_hang) FROM silver.don_hang'))
            self.assertEqual(failure.exception.status_code, 503)
            execute.assert_not_called()

    def test_missing_admin_permission_blocks_direct_handler_before_io(self):
        self.policy['roles']['ADMIN']['permissions'].remove('system.read')
        principal = access.principal_for({'subject': 'fixture-admin', 'role': 'ADMIN',
                                          'expires_at': 4000000000}, self.policy)
        access.active_principal.set(principal)
        with patch.object(system, 'get_db_conn') as connect, self.assertRaises(HTTPException):
            system.get_system_users()
        connect.assert_not_called()


class AdminPolicyUpgradeTests(TestCase):
    def test_upgrade_adds_only_reviewed_permissions_and_preserves_scope(self):
        from tools.deploy_v34_governance import admin_access_policy
        before = deepcopy(POLICY)
        before['roles'] = {'ADMIN': before['roles']['ADMIN']}
        snapshot = deepcopy(before)
        after = admin_access_policy(before)
        self.assertEqual(before, snapshot)
        self.assertEqual(set(after['roles']), {'ADMIN'})
        self.assertEqual(set(after['roles']['ADMIN']['permissions']) -
                         set(before['roles']['ADMIN']['permissions']), {'system.read', 'warehouse.read'})
        self.assertEqual(after['roles']['ADMIN']['datasets'], before['roles']['ADMIN']['datasets'])
        self.assertEqual(after['subjects'], before['subjects'])
        self.assertEqual(after['roles']['ADMIN']['national'], before['roles']['ADMIN']['national'])

    def test_upgrade_refuses_to_expand_a_different_account_matrix(self):
        from tools.deploy_v34_governance import admin_access_policy
        with self.assertRaises(ValueError):
            admin_access_policy(POLICY)

    def test_idempotent_upgrade_does_not_duplicate_permissions(self):
        from tools.deploy_v34_governance import admin_access_policy
        before = deepcopy(POLICY)
        before['roles'] = {'ADMIN': before['roles']['ADMIN']}
        once = admin_access_policy(before)
        self.assertEqual(admin_access_policy(once), once)
