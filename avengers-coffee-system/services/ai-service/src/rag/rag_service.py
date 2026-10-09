"""Read-only sparse retrieval, atomic reloads, explicit failures and safe tracing."""
import hashlib
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Optional
from src.rag.data_ingestion import load_all_rag_data
from src.rag.documents import chunk_document, normalize_document, normalize_text
from src.rag.retrievers import SparseRetriever

logger = logging.getLogger(__name__)
_normalize_text = normalize_text
DEFAULT_TOP_K = 3
# Calibrated using tests/fixtures/rag_v2_evaluation.json; see RAG_V2_REPORT.md.
DEFAULT_MIN_SCORE = 0.30


@dataclass(frozen=True)
class IndexSnapshot:
    docs: tuple
    retriever: object
    built_at: float
    document_count: int


class RAGService:
    def __init__(self, min_score=None, top_k=None, retriever_factory=SparseRetriever):
        self.min_score = float(os.getenv('RAG_MIN_SCORE', DEFAULT_MIN_SCORE) if min_score is None else min_score)
        self.top_k = int(os.getenv('RAG_TOP_K', DEFAULT_TOP_K) if top_k is None else top_k)
        if not 0 < self.min_score <= 1 or not 1 <= self.top_k <= 10:
            raise ValueError('invalid retrieval configuration')
        self._index = None
        self._reload_lock = threading.Lock()
        self._retriever_factory = retriever_factory

    def load(self) -> dict:
        started = time.monotonic()
        degraded = True
        with self._reload_lock:
            try:
                ingested = load_all_rag_data()
                degraded = not getattr(ingested, 'product_source_available', True) or bool(getattr(ingested, 'static_source_errors', 0))
                if self._index is not None and (
                    getattr(ingested, 'static_source_errors', 0)
                    or (not getattr(ingested, 'product_source_available', True)
                        and any(d['entity_type'] == 'product' for d in self._index.docs))
                ):
                    raise ValueError('partial source failure; retain healthy snapshot')
                documents = [normalize_document(d, 'ingestion') for d in ingested]
                documents = [d for d in documents if d is not None]
                if not documents:
                    raise ValueError('no approved documents')
                chunks = tuple(c for d in documents for c in chunk_document(d))
                if len({d['id'] for d in chunks}) != len(chunks):
                    raise ValueError('duplicate retrieval unit id')
                retriever = self._retriever_factory(chunks)
                self._index = IndexSnapshot(chunks, retriever, time.time(), len(documents))
                status = 'ok'
            except Exception as exc:
                logger.warning('[RAG reload] failed error_type=%s retained_index=%s', type(exc).__name__, self.is_loaded)
                status = 'error' if self.is_loaded else 'unavailable'
            report = {'status': status, **self.index_info, 'source_degraded': degraded,
                      'build_ms': round((time.monotonic() - started) * 1000, 2)}
            logger.info('[RAG reload] %s', report)
            return report

    @property
    def index_info(self):
        index = self._index
        return {'backend': index.retriever.name if index else 'tfidf_word_char',
                'document_count': index.document_count if index else 0,
                'chunk_count': len(index.docs) if index else 0,
                'built_at': index.built_at if index else None}

    @property
    def is_loaded(self):
        return self._index is not None

    def lookup(self, query, top_k=None, min_score=None, preference_concepts=None, **filters):
        started = time.monotonic()
        fingerprint = hashlib.sha256(str(query).encode()).hexdigest()[:12]
        index, candidates = self._index, []
        response = {'status': 'not_found', 'results': [], 'backend': self.index_info['backend']}
        try:
            if not isinstance(query, str) or not query.strip():
                return response
            allowed = {'domain', 'entity_type', 'entity_id', 'authority', 'source'}
            if set(filters) - allowed:
                raise ValueError('unknown filter')
            limit = self.top_k if top_k is None else int(top_k)
            threshold = self.min_score if min_score is None else float(min_score)
            if not 1 <= limit <= 10 or not 0 < threshold <= 1:
                raise ValueError('invalid retrieval bounds')
            if index is None:
                response['status'] = 'unavailable'
                return response
            for i, doc in enumerate(index.docs):
                if all(value is None or (doc.get(key) in value if isinstance(value, (list, tuple, set, frozenset))
                                        else doc.get(key) == str(value)) for key, value in filters.items()):
                    candidates.append(i)
            if preference_concepts is not None:
                if (filters.get('domain') != 'product_description' or filters.get('source') != 'menu.san_pham.mo_ta'
                        or not isinstance(preference_concepts, list) or not 1 <= len(preference_concepts) <= 4
                        or any(not isinstance(c, str) or not c.strip() or len(c) > 80 for c in preference_concepts)):
                    raise ValueError('invalid preference concepts')
                scores, coverage = index.retriever.concept_scores(preference_concepts)
                response['scoring_basis'] = 'description_concept_coverage'
            else:
                scores = index.retriever.scores(query)
            ranked = sorted(candidates, key=lambda i: (-float(scores[i]), index.docs[i]['id']))
            response['results'] = [{**index.docs[i], 'score': round(float(scores[i]), 4)}
                                   for i in ranked[:limit] if float(scores[i]) >= threshold]
            if response['results']:
                response['status'] = 'ok'
            response['candidate_count'] = len(candidates)
            response['score_diagnostics'] = [{'id': index.docs[i]['id'], 'score': round(float(scores[i]), 4),
                'accepted': float(scores[i]) >= threshold,
                'reason': 'accepted' if float(scores[i]) >= threshold else 'below_threshold_or_missing_concept'} for i in ranked[:5]]
            return response
        except Exception as exc:
            response.update(status='error', results=[])
            logger.warning('[RAG lookup] error_type=%s', type(exc).__name__)
            return response
        finally:
            logger.info('[RAG lookup] backend=%s query_hash=%s filters=%s candidates=%d ids=%s scores=%s latency_ms=%.2f status=%s',
                        response['backend'], fingerprint, sorted(filters), len(candidates),
                        [d['id'] for d in response['results']], [d['score'] for d in response['results']],
                        (time.monotonic() - started) * 1000, response['status'])

    def search(self, query, top_k=None, min_score=None, **filters):
        return self.lookup(query, top_k=top_k, min_score=min_score, **filters)['results']

    def retrieve(self, query, top_k=None, min_score=None, **filters):
        return '\n\n'.join(f"[{d['title']}] {d['content']}"
                           for d in self.search(query, top_k=top_k, min_score=min_score, **filters))


_rag_instance: Optional[RAGService] = None
_instance_lock = threading.Lock()


def get_rag_service():
    global _rag_instance
    if _rag_instance is None:
        with _instance_lock:
            if _rag_instance is None:
                instance = RAGService()
                instance.load()
                _rag_instance = instance
    return _rag_instance
