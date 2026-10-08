"""Publication metadata for canonical customer-visible product collections."""
from copy import deepcopy
import hashlib
import json

PRODUCT_SPACES = {'global': 'GLOBAL_PRODUCTS', 'drink': 'DRINK_PRODUCTS', 'food': 'FOOD_PRODUCTS'}


def fingerprint(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def publication(previous, visible, refreshed, source, last_order_id=None):
    metadata = deepcopy(previous or {})
    metadata.update(version=2, generation=int(metadata.get('generation') or 0) + 1, last_order_id=last_order_id)
    buckets = {r.get('menu_bucket') for r in visible.get('products') or []}
    metadata['numbering'] = 'grouped' if len(buckets) > 1 else 'global'
    collections = metadata.setdefault('collections', {})
    for group in ['global', *refreshed]:
        rows = visible.get('products' if group == 'global' else group + '_products') or []
        collections[group] = {'namespace': PRODUCT_SPACES[group], 'fingerprint': fingerprint(rows),
            'source': source, 'generation': metadata['generation']}
    return metadata
