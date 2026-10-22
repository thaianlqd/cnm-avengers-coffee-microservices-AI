"""User-added hub problems: governed meaning only, deterministic replay, no provider."""
import unittest
from copy import deepcopy
from unittest.mock import patch

from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services import hub_problem_service as hub
from services.workspace_service import dashboard_catalog, dashboard_intent, dashboard_template
from tests.analysis_fixtures import physical_metadata


class HubProblemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = AnalysisCatalog(physical_metadata())
        d05 = next(t for t in cls.catalog.registry['workspace']['dashboard_templates'] if t['id'] == 'D05')
        cls.report = {'semantic_intent': {'decision': 'analyze', 'requirements': deepcopy(d05['requirements'])}}

    def test_suggestion_names_the_problem_and_the_fitting_feature_group(self):
        s = hub.suggest(self.catalog, self.report, 'Giao hàng tuần này')
        self.assertTrue(s['eligible']); self.assertEqual(s['provider_calls'], 0)
        self.assertEqual(s['suggested_title'], 'Giao hàng tuần này')
        self.assertEqual(s['suggested_category'], 'Vận hành')
        self.assertIn('D05', [d['id'] for d in s['similar_dashboards']])  # duplicates are shown before publishing
        self.assertIn('delivery', [d['id'] for d in s['domains']])

    def test_only_governed_requested_views_become_panels(self):
        report = deepcopy(self.report)
        reqs = report['semantic_intent']['requirements']
        reqs[0]['time'] = {'kind': 'relative', 'mode': 'all_time'}
        reqs.append({'id': 'gap', 'goal': 'Không có', 'metric_ids': ['marketing_roi'], 'analysis_kind': 'aggregate',
                     'availability': 'unsupported', 'reason': 'definition_unavailable'})
        value = hub.template(self.catalog, 'rpt_abc123', report, 'Giao hàng', 'Vận hành', '')
        self.assertTrue(hub.is_custom(value['id'])); self.assertTrue(value['custom'])
        self.assertNotIn('gap', [p['id'] for p in value['requirements']])
        self.assertTrue(all('time' not in p for p in value['requirements']))  # the hub period applies at view time
        with self.assertRaises(AnalysisError):
            hub.requirements_from_report(self.catalog, {'semantic_intent': {'decision': 'analyze', 'requirements': [reqs[-1]]}})
        with self.assertRaises(AnalysisError):
            hub.template(self.catalog, 'rpt_abc123', report, 'x', 'Vận hành', '')

    def test_custom_problem_replays_through_the_dashboard_path(self):
        value = hub.template(self.catalog, 'rpt_abc123', self.report, 'Giao hàng của tôi', 'Vận hành', 'Mô tả')
        with patch.object(hub, 'owned_templates', return_value=[value]):
            listed = dashboard_catalog(self.catalog)['dashboards']
            mine = next(d for d in listed if d['id'] == value['id'])
            self.assertTrue(mine['custom']); self.assertEqual(mine['provider_calls'], 0)
            self.assertEqual(dashboard_template(self.catalog, value['id'], '1.0.0')['title'], 'Giao hàng của tôi')
            intent = dashboard_intent(self.catalog, value['id'], '1.0.0', {'start': '2026-09-01', 'end': '2026-09-30'})
            self.assertEqual(len(intent['requirements']), len(value['requirements']))
            with self.assertRaises(AnalysisError):
                dashboard_template(self.catalog, value['id'], '9.9.9')
        with patch.object(hub, 'owned_templates', return_value=[]):  # another account never sees it
            self.assertNotIn(value['id'], [d['id'] for d in dashboard_catalog(self.catalog)['dashboards']])

    def test_job_request_accepts_curated_and_user_problem_ids_only(self):
        from common import AiTextToReportRequest
        for ok in ('D05', 'U_hub_b51e5cd6f069'):
            AiTextToReportRequest(dashboard_id=ok, dashboard_version='1.0.0', analysis_depth='focused', time={'mode': '30d'})
        for bad in ('X1', 'U_', 'U_../etc', 'D5'):
            with self.subTest(bad=bad), self.assertRaises(Exception):
                AiTextToReportRequest(dashboard_id=bad, dashboard_version='1.0.0', analysis_depth='focused', time={'mode': '30d'})


if __name__ == '__main__':
    unittest.main()
