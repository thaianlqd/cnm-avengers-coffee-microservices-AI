"""Immutable TTL result blobs, separate from session control state.

Redis is the existing production infrastructure. Memory is bounded and available
only outside production. No public API accepts arbitrary blob IDs.
"""
import hashlib
import json
import os
import threading
import time
import uuid
from copy import deepcopy
from collections import OrderedDict
from datetime import datetime, timezone

from services.analysis_catalog import AnalysisError
from services.analytical_capacity_planner import AnalyticalCapacityContract


def serialized(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), default=str).encode()


def fingerprint(value):
    return hashlib.sha256(serialized(value)).hexdigest()


class ResultArtifactStore:
    def __init__(self, client=None, contract=None):
        self.client = client
        self.contract = contract or AnalyticalCapacityContract.from_env()
        self._items = {}
        self._queries = {}
        self._lock = threading.RLock()
        self._decoded = OrderedDict()
        self._decoded_budget = 32_000_000
        self._decoded_entries = 8
        self.decode_count = 0

    def put(self, result, *, query_fingerprint, plan_fingerprint, schema_fingerprint, provenance=None):
        body = serialized(result)
        if len(body) > self.contract.artifact_bytes:
            raise AnalysisError('artifact_capacity', 'Result exceeds artifact byte capacity')
        now = time.time()
        metadata = dict(artifact_id='ra_'+uuid.uuid4().hex, query_fingerprint=query_fingerprint,
            plan_fingerprint=plan_fingerprint, schema_fingerprint=schema_fingerprint,
            created_at=datetime.fromtimestamp(now, timezone.utc).isoformat(),
            expires_at=datetime.fromtimestamp(now+self.contract.artifact_ttl, timezone.utc).isoformat(),
            columns=result.get('columns', []), row_count=len(result.get('rows', [])), byte_size=len(body),
            content_hash=hashlib.sha256(body).hexdigest(), storage_backend='redis' if self.client else 'memory',
            provenance=provenance or {})
        envelope = serialized(dict(metadata=metadata, result=result))
        try:
            if self.client:
                if not self.client.set('analyst:artifacts:'+metadata['artifact_id'], envelope,
                                       ex=self.contract.artifact_ttl, nx=True):
                    raise ValueError('Immutable write rejected')
                # An index is only a freshness-bounded hint. Immutable blob
                # integrity/catalog validation remains mandatory on reuse.
                self.client.set('analyst:result-cache:'+query_fingerprint, serialized(metadata),
                                ex=min(self.contract.cache_freshness,self.contract.artifact_ttl))
            else:
                with self._lock:
                    self._items = {k:v for k,v in self._items.items() if v[0] > now}
                    self._queries = {k:v for k,v in self._queries.items() if v[0] > now}
                    if len(self._items) >= 5000 or sum(len(v[1]) for v in self._items.values())+len(envelope) > 128_000_000:
                        raise AnalysisError('artifact_capacity', 'Offline artifact storage capacity reached')
                    self._items[metadata['artifact_id']] = (now+self.contract.artifact_ttl, envelope)
                    self._queries[query_fingerprint] = (now+self.contract.cache_freshness, metadata)
        except AnalysisError:
            raise
        except Exception:
            raise AnalysisError('artifact_store_unavailable', 'Immutable artifact storage unavailable') from None
        return metadata

    def find(self, query_fingerprint, schema_fingerprint):
        """Cache failures are misses; persistence failures never inline data."""
        try:
            if self.client:
                raw=self.client.get('analyst:result-cache:'+query_fingerprint)
                ref=json.loads(raw) if raw else None
            else:
                with self._lock:
                    expiry,ref=self._queries.get(query_fingerprint,(0,None))
                    if expiry<=time.time():ref=None
            if not ref or ref['schema_fingerprint']!=schema_fingerprint:
                return None
            self.get(ref)  # Verify immutable content/expiry before reuse.
            return deepcopy(ref)
        except Exception:
            return None

    def get(self, reference):
        return deepcopy(self._verified(reference))

    def _verified(self, reference):
        # Full Redis GET remains mandatory: eviction, outage and changed bytes
        # cannot be hidden by a local cache. Serialize expensive decode work.
        with self._lock:
            return self._read_verified(reference)

    def _read_verified(self, reference):
        id = reference['artifact_id']
        try:
            if self.client:
                body = self.client.get('analyst:artifacts:'+id)
            else:
                with self._lock:
                    expiry, body = self._items.get(id, (0, None))
                    if expiry <= time.time():
                        body = None
            if not body:
                self._decoded.pop(id, None)
                raise AnalysisError('artifact_expired', 'Result expired; refresh the approved analysis')
            now = time.time()
            wire_hash = hashlib.sha256(body.encode() if isinstance(body,str) else body).hexdigest()
            cached = self._decoded.get(id)
            if cached and cached[0] > now and cached[1] == wire_hash and cached[2] == reference:
                self._decoded.move_to_end(id)
                return cached[3]
            self._decoded.pop(id, None)
            envelope = json.loads(body)
            self.decode_count += 1
            metadata, result = envelope['metadata'], envelope['result']
            if reference != metadata:
                raise AnalysisError('artifact_integrity', 'Artifact metadata mismatch')
            for key in ('artifact_id', 'query_fingerprint', 'plan_fingerprint', 'schema_fingerprint', 'content_hash', 'row_count', 'byte_size'):
                if reference.get(key) != metadata[key]:
                    raise AnalysisError('artifact_integrity', 'Artifact provenance mismatch')
            if fingerprint(result) != metadata['content_hash']:
                raise AnalysisError('artifact_integrity', 'Artifact content mismatch')
            if datetime.fromisoformat(metadata['expires_at']).timestamp() <= time.time():
                raise AnalysisError('artifact_expired', 'Result expired; refresh the approved analysis')
            # Conservative accounting includes row/object overhead. Cache is an
            # optional optimization, never storage or artifact authority.
            charge = metadata['byte_size']*4 + metadata['row_count']*512
            self._decoded = OrderedDict((k,v) for k,v in self._decoded.items() if v[0] > now)
            if charge <= self._decoded_budget:
                while self._decoded and (len(self._decoded)>=self._decoded_entries or
                        sum(v[4] for v in self._decoded.values())+charge>self._decoded_budget):
                    self._decoded.popitem(last=False)
                self._decoded[id] = (min(now+60,datetime.fromisoformat(metadata['expires_at']).timestamp()),
                    wire_hash,deepcopy(metadata),result,charge)
            return result
        except AnalysisError:
            raise
        except Exception:
            raise AnalysisError('artifact_store_unavailable', 'Result artifact unavailable') from None

    def page(self, reference, offset=0, limit=50, filters=None):
        if offset < 0 or not 1 <= limit <= self.contract.drilldown_rows:
            raise AnalysisError('artifact_page', 'Invalid page bounds')
        result = self._verified(reference)
        filters = filters or {}
        if not set(filters) <= set(reference.get('provenance', {}).get('dimensions', [])):
            raise AnalysisError('query_scope', 'Drilldown may only select approved dimensions')
        def matches(actual, expected):
            if isinstance(expected,str) and type(actual) in {int,float}:
                try:return actual==float(expected)
                except ValueError:return False
            return actual==expected
        rows = [r for r in result['rows'] if all(matches(r.get(k),v) for k,v in filters.items())] if filters else result['rows']
        page = deepcopy(rows[offset:offset+limit])
        while page and len(serialized(page)) > self.contract.response_bytes // 2:
            page.pop()
        if rows[offset:offset+limit] and not page:
            raise AnalysisError('artifact_capacity', 'Single row exceeds page response capacity')
        return dict(columns=result['columns'], rows=page, total_rows=len(rows), offset=offset,
                    next_offset=offset+len(page) if offset+len(page) < len(rows) else None,
                    artifact_id=reference['artifact_id'], computation_scope='APPROVED_QUERY_POPULATION',
                    artifact_bytes=reference['byte_size'], pagination_strategy='VERIFIED_FULL_BLOB',
                    schema_fingerprint=reference['schema_fingerprint'], plan_fingerprint=reference['plan_fingerprint'])


_store = None


def artifact_store():
    global _store
    mode = os.getenv('DATA_ANALYST_ARTIFACT_STORE', os.getenv('DATA_ANALYST_SESSION_STORE', 'memory'))
    if mode == 'memory' and os.getenv('DATA_ANALYST_ENV', 'development') == 'production':
        raise AnalysisError('artifact_store_unavailable', 'Production requires durable artifacts')
    if mode not in {'memory', 'redis'}:
        raise AnalysisError('artifact_store_unavailable', 'Unknown artifact backend')
    if _store is None or bool(_store.client) != (mode == 'redis'):
        client = None
        if mode == 'redis':
            from services.session_service import storage
            durable = storage()
            if durable is None:
                raise AnalysisError('artifact_store_unavailable', 'Redis configuration unavailable')
            client = durable.client
        _store = ResultArtifactStore(client)
    return _store
