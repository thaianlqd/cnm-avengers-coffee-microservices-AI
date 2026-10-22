"""Owned immutable artifact inspection: typed group keys, no execution/provider."""
import json
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
from urllib.parse import urlencode

from fastapi import FastAPI
from routers.ai import router
from services.result_artifact_store import ResultArtifactStore
from tests.http_fixture import ASGIClient


class EntityInspectTests(TestCase):
    def setUp(self):
        store = ResultArtifactStore()
        self.rows = [dict(city='A / B', order_type='DELIVERY', revenue=300),
                     dict(city='A / B', order_type='STORE', revenue=100),
                     dict(city=None, order_type='STORE', revenue=50)]
        reference = store.put(dict(columns=['city', 'order_type', 'revenue'], rows=self.rows),
            query_fingerprint='q', plan_fingerprint='p', schema_fingerprint='s',
            provenance={'dimensions': ['city', 'order_type']})
        self.session = SimpleNamespace(owner_id='owner-A', approved=True, revision=3,
            agent_artifacts={'q1': SimpleNamespace(result_ref=reference)}, schema_fingerprint='s', plan_fingerprint='p')
        self.enterContext(patch('routers.ai.browser_owner', return_value='owner-A'))
        self.enterContext(patch('services.session_service.get_session', return_value=self.session))
        self.enterContext(patch('services.result_artifact_store.artifact_store', return_value=store))
        self.execute = self.enterContext(patch('services.sql_service.execute_read_only', side_effect=AssertionError('no SQL')))
        self.http = self.enterContext(patch('requests.sessions.Session.request', side_effect=AssertionError('no provider')))
        app = FastAPI(); app.include_router(router)
        self.client = ASGIClient(app)

    def page(self, **params):
        return self.client.get('/api/ai/sessions/session/results/q1?' + urlencode(params))

    def test_composite_key_reads_exact_group_without_changing_full_population(self):
        response = self.page(filters=json.dumps({'city': 'A / B', 'order_type': 'STORE'}), revision=3)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['rows'], [self.rows[1]])
        self.assertEqual(response.json()['total_rows'], 1)
        self.assertEqual(self.page(revision=3).json()['total_rows'], 3)
        self.execute.assert_not_called(); self.http.assert_not_called()

    def test_null_bucket_is_selected_by_typed_key_not_display_label(self):
        response = self.page(filters=json.dumps({'city': None}), revision=3)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['rows'], [self.rows[2]])

    def test_old_revision_and_cross_owner_cannot_open_current_artifact(self):
        self.assertEqual(self.page(revision=2).status_code, 409)
        self.session.owner_id = 'owner-B'
        self.assertEqual(self.page(revision=3).status_code, 404)
        self.execute.assert_not_called()

    def test_unapproved_fields_and_malformed_keys_never_widen_selection(self):
        invalid = ['{}', '[]', '{', '{"city": NaN}', '{"city":true}',
                   '{"city":["A / B"]}', '{"city":' + json.dumps('x' * 513) + '}',
                   json.dumps({'city': 'A / B', 'revenue': 300})]
        for value in invalid:
            with self.subTest(value=value[:50]):
                self.assertEqual(self.page(filters=value, revision=3).status_code, 400)
        self.assertEqual(self.page(filters='{"city":"A / B"}', dimension='city', value='x').status_code, 400)
        self.execute.assert_not_called(); self.http.assert_not_called()
