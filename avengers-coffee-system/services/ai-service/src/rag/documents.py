"""Validated, traceable read-only knowledge and deterministic retrieval units."""
import re
import unicodedata
from typing import Optional

STATIC_DOMAINS = frozenset({'company', 'brand', 'privacy', 'refund', 'faq', 'contact',
                            'careers', 'franchise', 'ordering_policy', 'promotion_policy'})
SLOW_DOMAINS = frozenset({'membership', 'gift_card', 'product_description', 'ingredient', 'product_faq'})
PRODUCT_DOMAINS = frozenset({'product_description', 'ingredient', 'product_faq'})


def has_dynamic_claim(content: str) -> bool:
    text = normalize_text(content)
    return bool(re.search(
        r'\b(?:gia|phi)\b.{0,30}\b\d+\b|\b\d+(?:\s+\d+)*\s*(?:vnd|dong|k)\b|'
        r'\b(?:con hang|het hang|ton kho|dang ban|giam\s+\d+)\b|'
        r'\bthanh toan\b.{0,60}\b(?:ho tro|chap nhan|hien dang)\b|'
        r'\b(?:ho tro|chap nhan)\b.{0,60}\bthanh toan\b', text))


def normalize_text(value: str) -> str:
    value = unicodedata.normalize('NFD', str(value or '').lower()).replace('đ', 'd')
    value = ''.join(c for c in value if unicodedata.category(c) != 'Mn')
    value = re.sub(r'([a-z])\1{2,}', r'\1', value)  # Generic elongated/noisy spelling.
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', value)).strip()


def normalize_document(raw, source: str) -> Optional[dict]:
    if not isinstance(raw, dict) or any(not isinstance(raw.get(k), str) or not raw[k].strip()
                                       for k in ('id', 'title', 'content')):
        return None
    domain = raw.get('domain')
    if not isinstance(domain, str) or domain not in STATIC_DOMAINS | SLOW_DOMAINS or raw.get('authority') != 'knowledge':
        return None
    if raw.get('volatility') != ('slow' if domain in SLOW_DOMAINS else 'static'):
        return None
    if has_dynamic_claim(raw['content']):
        return None
    tags = raw.get('tags', [])
    if not isinstance(tags, list) or any(not isinstance(t, str) for t in tags):
        return None
    entity_type, entity_id = raw.get('entity_type'), raw.get('entity_id')
    if domain in PRODUCT_DOMAINS and (entity_type != 'product' or not entity_id):
        return None
    if any(raw.get(k) is not None and not isinstance(raw[k], str)
           for k in ('source', 'entity_type', 'updated_at')):
        return None
    if entity_id is not None and (isinstance(entity_id, bool) or not isinstance(entity_id, (str, int))):
        return None
    return {'id': raw['id'].strip(), 'title': raw['title'].strip(), 'content': raw['content'].strip(),
            'source': raw.get('source') or source, 'domain': domain,
            'entity_type': entity_type, 'entity_id': str(entity_id) if entity_id is not None else None,
            'tags': sorted(set(tags)), 'volatility': raw['volatility'], 'authority': 'knowledge',
            'updated_at': raw.get('updated_at')}


def chunk_document(doc: dict, max_chars: int = 1200) -> list:
    """Pack natural paragraphs/sentences; repeat heading/entity metadata, no tiny chunks."""
    if max_chars < 100:
        raise ValueError('chunk size must be at least 100 characters')
    content = doc['content']
    if len(content) <= max_chars:
        return [{**doc, 'parent_id': doc['id'], 'chunk_index': 0}]
    pieces, section_title = [], None
    for paragraph in re.split(r'\n\s*\n', content):
        first_line = paragraph.split('\n', 1)[0].strip()
        if len(first_line) <= 100 and re.match(r'^(?:#{1,6}\s+|\d+[.)]\s+)', first_line):
            section_title = first_line
        if len(paragraph) <= max_chars:
            pieces.append((paragraph, section_title))
        else:
            for sentence in re.split(r'(?<=[.!?])\s+|\n', paragraph):
                while len(sentence) > max_chars:
                    boundary = sentence.rfind(' ', 0, max_chars + 1)
                    boundary = boundary if boundary > 0 else max_chars
                    pieces.append((sentence[:boundary], section_title))
                    sentence = sentence[boundary:].lstrip()
                if sentence:
                    pieces.append((sentence, section_title))
    chunks, current, current_section = [], '', None
    for piece, section in pieces:
        combined = current + ('\n\n' if current else '') + piece
        if len(combined) > max_chars or section != current_section:
            if current:
                chunks.append((current, current_section))
            current = piece
            current_section = section
        else:
            current = combined
    if current:
        chunks.append((current, current_section))
    return [{**doc, 'id': f"{doc['id']}::chunk:{i:03d}", 'parent_id': doc['id'],
             'chunk_index': i, 'content': part, 'section_title': section}
            for i, (part, section) in enumerate(chunks)]
