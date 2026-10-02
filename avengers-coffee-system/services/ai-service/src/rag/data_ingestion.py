"""Deterministic ingestion; no transactional columns or unapproved records."""
import json
import logging
from pathlib import Path
from sqlalchemy.sql import text
from src.common.db import get_db_engine
from src.rag.documents import normalize_document, normalize_text

logger = logging.getLogger(__name__)
RAW_DATA_DIR = Path(__file__).parent / 'raw_data'


class IngestedDocuments(list):
    """Source health accompanies data so partial reloads cannot erase a healthy index."""
    product_source_available = True
    static_source_errors = 0


def load_all_rag_data() -> list:
    docs, seen_ids, seen_content = IngestedDocuments(), set(), set()

    def add(raw, source):
        doc = normalize_document(raw, source)
        if doc is None:
            logger.warning('[RAG ingestion] rejected malformed/unapproved record source=%s', source)
            return
        # Identical descriptions for different canonical products remain isolated.
        content_key = (doc['domain'], doc['entity_id'], normalize_text(doc['content']))
        if doc['id'] in seen_ids or content_key in seen_content:
            logger.warning('[RAG ingestion] duplicate record id=%s source=%s', doc['id'], source)
            return
        seen_ids.add(doc['id'])
        seen_content.add(content_key)
        docs.append(doc)

    for path in sorted(Path(RAW_DATA_DIR).glob('*.json')):
        try:
            records = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(records, list):
                raise ValueError('expected list')
            for raw in records:
                add(raw, f'raw_data/{path.name}')
        except (OSError, ValueError):
            docs.static_source_errors += 1
            logger.warning('[RAG ingestion] unreadable JSON source=%s', path.name)
    try:
        with get_db_engine().connect() as conn:
            rows = conn.execute(text("SELECT ma_san_pham, ten_san_pham, mo_ta FROM menu.san_pham "
                                     "WHERE mo_ta IS NOT NULL AND mo_ta != '' ORDER BY ma_san_pham"))
            for product_id, name, description in rows:
                if product_id is None or not isinstance(name, str) or not isinstance(description, str):
                    continue
                add({'id': f'product_{product_id}', 'title': f'Mô tả sản phẩm: {name}',
                     'content': description, 'entity_type': 'product', 'entity_id': str(product_id),
                     'domain': 'product_description', 'tags': [name], 'volatility': 'slow',
                     'authority': 'knowledge'}, 'menu.san_pham.mo_ta')
    except Exception as exc:
        docs.product_source_available = False
        # Never log connection URLs, credentials or exception bodies.
        logger.warning('[RAG ingestion] product source unavailable error_type=%s', type(exc).__name__)
    docs.sort(key=lambda d: d['id'])
    logger.info('[RAG ingestion] approved_documents=%d', len(docs))
    return docs
