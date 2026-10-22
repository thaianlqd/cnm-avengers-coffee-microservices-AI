"""Identity trust and grants are verified independently of analytical meaning."""
import base64
from copy import deepcopy
import hashlib
import hmac
import json
from unittest import TestCase

from fastapi import HTTPException
from services.access_policy import verify_identity, principal_for, require_permission

SECRET = 'fixture-only-signing-material-at-least-32-bytes'
POLICY = {'version': 'fixture-v1', 'roles': {
    'ANALYST': {'permissions': ['analytics.read', 'reports.save'], 'datasets': ['orders'], 'national': False},
    'ADMIN': {'permissions': ['analytics.read', 'reports.save', 'sql.explore'], 'datasets': ['*'], 'national': True}},
    'subjects': {'fixture-user': {'store_ids': ['s1', 's2']}}}


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def token(claims=None, *, header=None, key=SECRET, raw_payload=None):
    head = b64(json.dumps(header or {'alg': 'HS256', 'typ': 'JWT'}).encode())
    body = b64(raw_payload if raw_payload is not None else json.dumps(
        claims or {'sub': 'fixture-user', 'role': 'ANALYST', 'exp': 4000000000, 'iat': 100}).encode())
    return head + '.' + body + '.' + b64(hmac.digest(key.encode(), (head + '.' + body).encode(), 'sha256'))


class IdentityPolicyTests(TestCase):
    def verify(self, value, **options):
        return verify_identity(value, secret=SECRET, now=200, allow_legacy=True, **options)

    def test_existing_issuer_legacy_claims_require_explicit_trust(self):
        value = token()
        with self.assertRaises(HTTPException) as caught:
            verify_identity(value, secret=SECRET, now=200)
        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(self.verify(value)['subject'], 'fixture-user')

    def test_configured_issuer_and_audience_are_checked_even_in_legacy_mode(self):
        value = token({'sub': 'fixture-user', 'role': 'ANALYST', 'exp': 1000, 'iss': 'identity', 'aud': ['analytics']})
        identity = verify_identity(value, secret=SECRET, now=200, issuer='identity', audience='analytics')
        self.assertEqual(identity['role'], 'ANALYST')
        for options in ({'issuer': 'other'}, {'audience': 'customer-app'}):
            with self.subTest(options=options), self.assertRaises(HTTPException):
                self.verify(value, **options)

    def test_signature_algorithm_and_token_control_headers_cannot_be_downgraded(self):
        values = [token(key='wrong-fixture-signing-key-with-enough-characters'),
                  token(header={'alg': 'none'}), token(header={'alg': 'HS384'}),
                  token(header={'alg': 'HS256', 'crit': ['b64']}),
                  token(header={'alg': 'HS256', 'jku': 'https://attacker.invalid/key'}),
                  token(header={'alg': 'HS256', 'kid': 'untrusted-key'})]
        for value in values:
            with self.subTest(value=value[:20]), self.assertRaises(HTTPException):
                self.verify(value)

    def test_empty_short_or_missing_verifier_secret_fails_closed(self):
        for secret in ('', 'short', None):
            with self.subTest(secret=bool(secret)), self.assertRaises(HTTPException) as caught:
                verify_identity(token(), secret=secret, now=200, allow_legacy=True)
            self.assertEqual(caught.exception.status_code, 503)

    def test_expiry_not_before_issued_at_and_numeric_types_are_validated(self):
        for fields in ({'exp': 200}, {'exp': 199}, {'exp': None}, {'exp': True}, {'exp': '1000'},
                       {'exp': float('nan')}, {'nbf': 201}, {'iat': 201}, {'nbf': False}):
            claims = {'sub': 'fixture-user', 'role': 'ANALYST', 'exp': 1000, **fields}
            with self.subTest(fields=fields), self.assertRaises(HTTPException):
                self.verify(token(claims))

    def test_duplicate_claims_and_header_fields_are_not_ambiguous(self):
        raw = b'{"sub":"fixture-user","role":"ANALYST","role":"ADMIN","exp":1000}'
        with self.assertRaises(HTTPException):
            self.verify(token(raw_payload=raw))

    def test_malformed_tokens_do_not_leak_parser_details_or_credentials(self):
        for value in ('', 'not-a-token', token()+'=', token()+'.extra', 'a.b.c', 'x'*17000):
            with self.subTest(length=len(value)), self.assertRaises(HTTPException) as caught:
                self.verify(value)
            self.assertEqual(caught.exception.status_code, 401)
            self.assertNotIn(SECRET, caught.exception.detail)

    def test_subject_and_role_must_be_scalar_valid_identity_ids(self):
        for fields in ({'sub': None}, {'sub': ['fixture-user']}, {'role': None}, {'role': {'ADMIN': True}}, {'sub': 'x'*257}):
            with self.subTest(fields=fields), self.assertRaises(HTTPException):
                self.verify(token({'sub': 'fixture-user', 'role': 'ANALYST', 'exp': 1000, **fields}))

    def test_grants_come_from_server_policy_not_token_scope_or_permissions(self):
        identity = self.verify(token({'sub': 'fixture-user', 'role': 'ANALYST', 'exp': 4000000000,
                                      'permissions': ['sql.explore'], 'store_ids': ['unassigned'], 'national': True}))
        principal = principal_for(identity, POLICY)
        self.assertEqual(principal.store_ids, ('s1', 's2'))
        self.assertFalse(principal.national)
        self.assertFalse(principal.permits('sql.explore'))
        self.assertTrue(principal.permits('analytics.read', 'orders'))
        self.assertFalse(principal.permits('analytics.read', 'customers'))
        self.assertTrue(principal.owner_key.startswith('account:'))
        self.assertNotIn('fixture-user', principal.owner_key)

    def test_unknown_role_and_disabled_principal_are_denied(self):
        identity = self.verify(token())
        for policy in ({**POLICY, 'roles': {}}, {**POLICY, 'subjects': {'fixture-user': {'disabled': True}}}):
            with self.subTest(policy=policy['version']), self.assertRaises(HTTPException) as caught:
                principal_for(identity, policy)
            self.assertEqual(caught.exception.status_code, 403)

    def test_policy_change_and_scope_change_change_access_identity(self):
        identity = self.verify(token())
        old = principal_for(identity, POLICY)
        changed = deepcopy(POLICY)
        changed['subjects']['fixture-user']['store_ids'] = ['s2']
        new = principal_for(identity, changed)
        self.assertNotEqual(old.access_fingerprint, new.access_fingerprint)
        self.assertEqual(old.owner_key, new.owner_key)

    def test_malformed_policy_is_unavailable_instead_of_widening_access(self):
        identity = self.verify(token())
        for changed in ({}, {'version': 'v1', 'roles': {'ANALYST': {'datasets': 'orders'}}},
                        {'version': 'v1', 'roles': {'ANALYST': {'national': 'true'}}}):
            with self.subTest(changed=bool(changed)), self.assertRaises(HTTPException) as caught:
                principal_for(identity, changed)
            self.assertEqual(caught.exception.status_code, 503)

    def test_permission_is_checked_before_use_and_expired_principal_cannot_be_reused(self):
        identity = self.verify(token())
        principal = principal_for(identity, POLICY)
        self.assertIs(require_permission(principal, 'analytics.read', 'orders'), principal)
        with self.assertRaises(HTTPException):
            require_permission(principal, 'sql.explore')
        identity['expires_at'] = 100
        with self.assertRaises(HTTPException) as caught:
            require_permission(principal_for(identity, POLICY), 'analytics.read')
        self.assertEqual(caught.exception.status_code, 401)
