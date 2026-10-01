"""Finite authority contracts; domain vocabulary is data, never product identities.

Only positively identified static questions interrupt a pending business owner.
Dynamic/mixed requests return to the existing BPM; this module never executes it.
"""
import re
import json
from pathlib import Path
from src.rag.documents import normalize_text

# Controlled domain vocabulary is explicit data, not a demo-phrase branch chain.
_VOCABULARY = json.loads(Path(__file__).with_name('knowledge_domains.json').read_text(encoding='utf-8'))
KNOWLEDGE_TOPICS = _VOCABULARY['KNOWLEDGE_TOPICS']
PRODUCT_FACETS = _VOCABULARY['PRODUCT_FACETS']
# Business concepts, not provider/product-specific phrase patches.
BUSINESS_TOPICS = {
    'review': r'\b(?:danh gia|review|nhan xet|bao nhieu sao)\b',
    'inventory': r'\b(?:ton kho|con hang|het hang|con mon|chi nhanh.*con)\b',
    'voucher': r'\b(?:voucher|ma giam|ma [a-z0-9]+)\b.*\b(?:ap|giam|hien|co ma|du dieu kien)\b|\b(?:ma nao|voucher nao|hien.*voucher)\b',
    'price': r'\b(?:gia bao nhieu|hien gia|hoi gia|gia ban|gia tien|gia sao|bao nhieu|phi giao|phi ship|tong don|tong tien)\b|\bgia\s*$',
    'payment': r'\b(?:thanh toan|payment)\b',
    'order': r'\b(?:don (?:cua toi|cua minh|dang|so)|trang thai don|da thanh toan|ma don)\b',
    'cart': r'\b(?:gio hang (?:cua|co)|xem gio|sua gio|xoa gio)\b',
    'branch': r'\b(?:chi nhanh|cua hang|quan|kiosk)\b.*\b(?:gan|o dau|danh gia|review|khoang cach)\b',
    'recommendation': r'\b(?:goi y|de xuat|ban chay|danh gia cao|xem menu|cho xem)\b|\b(?:tim|xem)\b.*\b(?:do uong|thuc uong|banh|mon|nuoc)\b',
    'profile': r'\b(?:diem|hang|so du|quyen loi)\b.*\b(?:cua toi|cua minh|hien tai|hien co)\b',
}


def positive_request_text(query):
    """Remove only explicit request exclusions, bounded by clause structure.

    Question negation ("còn hàng không") and factual absence ("không có sữa")
    are retained. A fresh coordinated clause can still request another authority.
    """
    clauses = []
    for clause in re.split(r'[,;.!?]|\b(?:và|va|nhưng|nhung)\b', query.lower()):
        text = re.sub(r"\bbn\b", "bao nhieu", normalize_text(clause))
        text = re.sub(r'\b(?:(?:khong|chua)\s+(?:can|hoi|noi|kiem tra)|'
                      r'dung\s+(?:noi|hoi|kiem tra))\b.*$', '', text)
        clauses.append(text.strip())
    return ' va '.join(clause for clause in clauses if clause)


def contains_term(text, term):
    return bool(re.search(r'(?<!\w)' + re.escape(normalize_text(term)) + r'(?!\w)', text))


def product_facet(query):
    text = normalize_text(query)
    for facet, terms in reversed(list(PRODUCT_FACETS.items())):
        if any(contains_term(text, term) for term in terms):
            return facet
    if re.search(r'\b(?:vi\s+(?:sao|the nao|nhu|gi)|ngon\s+(?:k|ko|khong)|'
                 r'nhu nao|co gi dac biet|an sao)\b', text):
        return 'taste'
    return None


def knowledge_route(query):
    text = positive_request_text(query)
    if not text:
        return {'owner': 'conversation'}
    # Positive transaction evidence always wins, including mixed requests.
    if re.search(r'\b(?:dong y|chot|xac nhan|bo qua voucher|ap ma|them vao gio|doi size|chon size|huy don)\b', text):
        return {'owner': 'transaction'}
    # A positive action keeps business ownership even beside a read-only facet.
    if re.search(r'^(?:(?:cho|giup) (?:toi|minh) )?(?:(?:toi|minh) )?(?:muon )?(?:lay|mua|chon|them|dat)\b|\b(?:va|roi) (?:lay|mua|chon|them|dat)\b', text) and not re.search(r'\b(?:chinh sach|quy trinh|nguyen tac)\b', text):
        return {'owner': 'transaction'}
    for owner, pattern in BUSINESS_TOPICS.items():
        if re.search(pattern, text):
            if owner == 'review' and re.search(r'\b(?:chi nhanh|cua hang|quan|kiosk)\b', text):
                continue
            # General ordering documentation may mention checkout; never runtime capability.
            if owner == 'payment' and any(contains_term(text, t) for t in KNOWLEDGE_TOPICS['ordering_policy']):
                continue
            return {'owner': owner}
    facet = product_facet(text)
    if facet and ('?' in query or re.search(r'\b(?:gi|sao|ntn|nhu nao|the nao|nhu the nao|khong|k|ko|thanh phan|nguyen lieu|mo ta)\b', text)):
        return {'owner': 'rag', 'domain': 'product_description', 'facet': facet}
    # More specific topics win (company story before generic brand).
    matches = [(len(normalize_text(term)), domain) for domain, terms in KNOWLEDGE_TOPICS.items()
               for term in terms if contains_term(text, term)]
    if matches:
        return {'owner': 'rag', 'domain': max(matches)[1]}
    return {'owner': 'conversation'}
