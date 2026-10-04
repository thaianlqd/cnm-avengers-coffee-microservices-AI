"""Bounded Redis conversation hints. Durable business/replay state stays elsewhere."""
import hashlib
import json
import logging
import os
import re
import time
from functools import lru_cache

logger = logging.getLogger(__name__)


def limit(name, default, minimum=1, maximum=100000):
    try:
        return max(minimum, min(maximum, int(os.getenv(name, default))))
    except (TypeError, ValueError):
        return default


def safe_text(value, maximum=1500):
    text = str(value or '')
    text = re.sub(r'(?i)bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+', '[redacted]', text)
    text = re.sub(r'\b(?:sk-|gsk_|AIza|AQ\.)[A-Za-z0-9_-]{16,}', '[redacted]', text)
    text = re.sub(r'(?i)(?:password|api[_ -]?key|jwt|secret|access[_ -]?token)\s*[:=]\s*\S+',
                  '[redacted]', text)
    for key, secret in os.environ.items():
        if any(part in key for part in ('SECRET', 'PASSWORD', 'API_KEY', 'TOKEN')) and len(secret) >= 8:
            for candidate in secret.split(','):
                if len(candidate.strip()) >= 8:
                    text = text.replace(candidate.strip(), '[redacted]')
    return text[:maximum]


ENTITY_FIELDS = {
    'products': ('product_id', 'product_name', 'category', 'parent_category', 'menu_bucket', 'final_price',
                 'hinh_anh_url', 'display_index', 'group_display_index', 'global_display_index'),
    'vouchers': ('ma_voucher', 'voucher_code', 'ten_voucher', 'mo_ta', 'gia_tri', 'loai_giam_gia',
                 'dieu_kien_ap_dung', 'so_tien_giam_du_kien', 'display_index'),
    'branches': ('branch_id', 'branch_name', 'ma_chi_nhanh', 'ten_chi_nhanh', 'dia_chi',
                 'khoang_cach_km', 'availability_status', 'unavailable_products', 'unverified_products', 'display_index'),
    'location_candidates': ('candidate_id', 'normalized_label', 'display_address', 'lat', 'lng',
                            'admin_components', 'provider', 'display_index'),
    'payment_options': ('code', 'value', 'label', 'enabled', 'reason', 'display_index'),
}


def compact(value, depth=0):
    """Bound untrusted values and drop credential fields recursively."""
    if depth > 5:
        return None
    if isinstance(value, dict):
        return {str(k): compact(v, depth+1) for k, v in list(value.items())[:32]
                if not any(part in str(k).lower() for part in ('token', 'secret', 'password', 'authorization', 'api_key'))}
    if isinstance(value, (list, tuple)):
        return [compact(v, depth+1) for v in value[:16]]
    if isinstance(value, str):
        return safe_text(value)
    return value if isinstance(value, (int, float, bool)) or value is None else safe_text(value)


def snapshot(kind, rows):
    # Voucher ordinals must describe every eligible offer shown to the customer.
    # The overall memory/context budget still applies; never silently cap at five.
    count = len(rows or []) if kind == 'vouchers' else (16 if kind == 'products' else 5)
    return [{key: compact(row[key]) for key in ENTITY_FIELDS[kind] if key in row}
            for row in (rows or [])[:count] if isinstance(row, dict)]


def empty_memory():
    return {'version': 1, 'recent_turns': [], 'focus': {}, 'visible_snapshots': {}, 'last_tool_summary': []}


@lru_cache(maxsize=1)
def redis_client():
    import redis
    return redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'),
        port=limit('REDIS_PORT', 6379, 1, 65535), db=limit('AI_AGENT_REDIS_DB', 0, 0, 15),
        password=os.getenv('REDIS_PASSWORD') or None, decode_responses=True,
        socket_connect_timeout=0.3, socket_timeout=0.3)


def redis_available():
    """Cheap, non-sensitive readiness probe used by startup and health."""
    try:
        return bool(redis_client().ping())
    except Exception:
        return False


class ConversationMemory:
    def __init__(self, client=None):
        self.client = client
        self.available = True

    @staticmethod
    def key(session_id):
        return 'ai:conversation:v1:' + hashlib.sha256(session_id.encode()).hexdigest()

    def load(self, session_id):
        try:
            raw = (self.client or redis_client()).get(self.key(session_id))
            data = json.loads(raw) if raw else empty_memory()
            return self.bounded(data) if isinstance(data, dict) else empty_memory()
        except Exception as exc:
            self.available = False
            logger.info('[AgentMemory] operation=load available=false error_type=%s', type(exc).__name__)
            return empty_memory()

    @staticmethod
    def bounded(data):
        result = empty_memory()
        result['version'] = int(data.get('version') or 1)
        result['recent_turns'] = [{'role': row['role'], 'content': safe_text(row.get('content'))}
            for row in data.get('recent_turns', []) if isinstance(row, dict)
            and row.get('role') in {'user', 'assistant'}][-2*limit('AI_AGENT_RECENT_TURNS', 8, 1, 8):]
        result['visible_snapshots'] = {kind: snapshot(kind, data.get('visible_snapshots', {}).get(kind))
                                      for kind in ENTITY_FIELDS}
        # Focus is an entity hint, never a cart/price/authorization record.
        focus = data.get('focus') or {}
        for kind, fields in {'product': ('product_id', 'product_name', 'source'),
                             'cart_line': ('line_id', 'product_id', 'product_name'),
                             'branch': ('branch_id', 'branch_name'),
                             'voucher': ('voucher_code',),
                             'location': ('normalized_label', 'display_address')}.items():
            if isinstance(focus.get(kind), dict):
                result['focus'][kind] = {k: compact(focus[kind][k]) for k in fields if k in focus[kind]}
        result['last_tool_summary'] = [{k: compact(row[k]) for k in ('tool', 'status', 'count') if k in row}
            for row in data.get('last_tool_summary', [])[-8:] if isinstance(row, dict)]
        result['last_active_business_stage'] = safe_text(data.get('last_active_business_stage'), 40)
        result['updated_at'] = time.time()
        budget = limit('AI_AGENT_MEMORY_CHAR_LIMIT', 32000, 2000, 64000)
        def size():
            return len(json.dumps(result, ensure_ascii=False))
        while size() > budget and result['recent_turns']:
            result['recent_turns'].pop(0)
        while size() > budget and any(result['visible_snapshots'].values()):
            kind = max(result['visible_snapshots'], key=lambda k: len(json.dumps(result['visible_snapshots'][k], ensure_ascii=False)))
            result['visible_snapshots'][kind].pop()
        return result

    def save(self, session_id, data):
        try:
            bounded = self.bounded(data)
            bounded['version'] += 1
            (self.client or redis_client()).set(self.key(session_id), json.dumps(bounded, ensure_ascii=False),
                ex=limit('AI_AGENT_MEMORY_TTL', 1800, 1, 86400))
            return True
        except Exception as exc:
            self.available = False
            logger.info('[AgentMemory] operation=save available=false error_type=%s', type(exc).__name__)
            return False

    def reset(self, session_id):
        try:
            (self.client or redis_client()).delete(self.key(session_id))
            return True
        except Exception:
            self.available = False
            return False
