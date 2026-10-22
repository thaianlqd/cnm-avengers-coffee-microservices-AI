"""Trusted Identity password login → durable opaque session, no shared JWT key."""
from dataclasses import replace
import json
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch
import os

from fastapi import HTTPException
from services import access_policy as access
from tests.test_v34_access_policy import POLICY
from tests.http_fixture import ASGIClient


class IdentityLoginSessionTests(TestCase):
    def setUp(self):
        self.data = {}
        self.client = MagicMock()
        self.client.set.side_effect = lambda key, value, **kw: self.data.setdefault(key, value) == value
        self.client.get.side_effect = lambda key: self.data.get(key)
        self.client.delete.side_effect = lambda key: self.data.pop(key, None) is not None
        self.enterContext(patch.object(access, '_auth_client', return_value=self.client))
        self.enterContext(patch.object(access, 'load_policy', return_value=POLICY))
        self.enterContext(patch.dict(os.environ, {'DATA_ANALYST_ENV':'production','DATA_ANALYST_AUTH_MODE':'identity_login_session',
            'DATA_ANALYST_IDENTITY_LOGIN_URL':'http://identity-service:3001/auth/login',
            'DATA_ANALYST_ALLOWED_ORIGINS':'http://testserver'}))

    def issue(self):
        return access.create_identity_session({'user':{'ma_nguoi_dung':'fixture-user','vai_tro':'ANALYST'},
            'token':'upstream-token-is-never-stored','password':'never-stored'})

    def test_cookie_is_opaque_and_server_storage_keeps_no_password_or_upstream_token(self):
        token, principal = self.issue()
        self.assertRegex(token, r'^as_[a-f0-9]{64}$')
        self.assertNotIn(token, next(iter(self.data)))
        stored = next(iter(self.data.values()))
        self.assertNotIn('upstream-token', stored); self.assertNotIn('password', stored)
        self.assertEqual(json.loads(stored)['subject'], 'fixture-user')
        self.assertFalse(principal.permits('sql.explore'))
        self.assertEqual(self.client.set.call_args.kwargs, {'ex':900,'nx':True})

    def test_missing_or_expired_session_and_logout_revoke_requests_and_worker_context(self):
        token, principal = self.issue()
        request = SimpleNamespace(headers={}, cookies={access.AUTH_COOKIE:token})
        self.assertEqual(access.request_principal(request).bound_owner, principal.bound_owner)
        context = access.active_principal.set(principal); self.addCleanup(access.active_principal.reset, context)
        access.current_principal(required=True)
        access.revoke_identity_session(request)
        with self.assertRaises(HTTPException) as caught: access.current_principal(required=True)
        self.assertEqual(caught.exception.status_code, 401)
        with self.assertRaises(HTTPException): access.request_principal(request)

    def test_policy_revocation_and_redis_failure_never_fall_back_to_anonymous(self):
        token, principal = self.issue()
        altered = {**POLICY,'roles':{}}
        with patch.object(access, 'load_policy', return_value=altered), self.assertRaises(HTTPException):
            access.request_principal(SimpleNamespace(headers={}, cookies={access.AUTH_COOKIE:token}))
        self.client.get.side_effect = RuntimeError('fixture private connection string')
        with self.assertRaises(HTTPException) as caught:
            access.request_principal(SimpleNamespace(headers={}, cookies={access.AUTH_COOKIE:token}))
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn('private', caught.exception.detail)

    def test_http_login_only_trusts_pinned_upstream_after_valid_credentials_and_rejects_client_claims(self):
        import server
        client = ASGIClient(server.app)
        upstream = MagicMock()
        upstream.__enter__.return_value = upstream
        upstream.status_code = 200
        upstream.raw.read.return_value = json.dumps({'token':'fixture-upstream-token'}).encode()
        verified = MagicMock(); verified.__enter__.return_value = verified; verified.status_code = 200
        verified.raw.read.return_value = json.dumps({'ma_nguoi_dung':'fixture-user','vai_tro':'ANALYST'}).encode()
        headers = {'Origin':'http://testserver'}
        with patch('requests.post', return_value=upstream) as login, patch('requests.get', return_value=verified) as profile:
            result = client.post('/api/auth/login', headers=headers, json={'tai_khoan':'fixture','mat_khau':'fixture-password'})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertNotIn('as_', result.text)
            self.assertNotIn('token', result.text.lower())
            self.assertIn(b'HttpOnly', result.headers[b'set-cookie'])
            self.assertEqual(profile.call_args.args[0], 'http://identity-service:3001/users/me')
            self.assertFalse(profile.call_args.kwargs['allow_redirects'])
            self.assertFalse(login.call_args.kwargs['allow_redirects'])
            self.assertEqual(login.call_args.kwargs['timeout'], (2,5))
            denied = client.post('/api/auth/login', headers=headers, json={'tai_khoan':'fixture','mat_khau':'fixture-password','role':'ADMIN'})
            self.assertEqual(denied.status_code, 400)
            self.assertEqual(login.call_count, 1)
        for status in (401,302):
            upstream.status_code = status
            with patch('requests.post', return_value=upstream):
                self.assertEqual(client.post('/api/auth/login', headers=headers,
                    json={'tai_khoan':'fixture','mat_khau':'bad-fixture-password'}).status_code, 401 if status==401 else 503)
