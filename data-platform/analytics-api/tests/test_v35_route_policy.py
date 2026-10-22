"""Every HTTP route declares access; names never grant default permission."""
from unittest import TestCase
from unittest.mock import patch
from fastapi import FastAPI, HTTPException

from services import access_policy as access


class ExplicitRoutePolicyTests(TestCase):
    def test_registered_production_routes_have_exact_declarations(self):
        import server
        from route_policy import validate_routes
        result = validate_routes(server.app.routes)
        self.assertGreater(result['protected_routes'], 50)
        self.assertEqual(result['undeclared'], [])
        self.assertEqual(result['stale'], [])

    def test_new_route_has_no_default_grant_even_for_admin(self):
        for path, method in [('/api/new-financial-data', 'GET'),
                             ('/api/system/users/extra', 'GET'),
                             ('/api/ai/status', 'DELETE')]:
            with self.subTest(path=path, method=method), self.assertRaises(HTTPException) as failure:
                access.route_permission(path, method)
            self.assertEqual(failure.exception.status_code, 403)

    def test_parameter_values_cannot_select_a_more_privileged_route(self):
        self.assertEqual(access.route_permission('/api/ai/analysis-jobs/job123', 'GET'), 'analytics.read')
        self.assertEqual(access.route_permission('/api/reports/saved/report123/download-docx', 'GET'), 'reports.export')
        with self.assertRaises(HTTPException):
            access.route_permission('/api/reports/saved/report123/download-docx/extra', 'GET')

    def test_metadata_permission_is_independent_from_sql_execution_mode(self):
        with patch.dict('os.environ', {'DATA_ANALYST_REPORT_SQL_MODE': 'disabled'}):
            self.assertEqual(access.route_permission('/api/warehouse/tables', 'GET'), 'warehouse.read')
            self.assertEqual(access.route_permission('/api/query', 'POST'), 'sql.explore')

    def test_inventory_rejects_new_routes_before_serving(self):
        from route_policy import validate_routes
        app = FastAPI()
        @app.get('/api/unreviewed-data')
        def unreviewed():
            return {'data': []}
        with self.assertRaises(ValueError):
            validate_routes(app.routes)

    def test_public_access_is_method_specific_and_spa_does_not_cover_api(self):
        from route_policy import is_public
        self.assertTrue(is_public('/api/health', 'GET'))
        self.assertFalse(is_public('/api/health', 'POST'))
        self.assertFalse(is_public('/api/unknown', 'GET'))
        self.assertFalse(is_public('/api/system/users', 'GET'))
        self.assertTrue(is_public('/docs', 'GET'))
