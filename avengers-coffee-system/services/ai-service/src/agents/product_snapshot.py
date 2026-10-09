"""Immutable per-user-turn display authority, separate from pending/cart ordinals."""
from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
from uuid import uuid4


@dataclass(frozen=True)
class ProductDisplaySnapshot:
    snapshot_id: str
    fingerprint: str
    source: str
    version: int
    _encoded: str

    @classmethod
    def capture(cls, visible, focus=None, metadata=None):
        value = {'products': deepcopy(visible.get('products') or []),
            **{group + '_products': deepcopy(visible[group + '_products']) for group in ('drink', 'food')
               if group + '_products' in visible}, 'focus': deepcopy(focus), 'metadata': deepcopy(metadata or {})}
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
        return cls(uuid4().hex, hashlib.sha256(encoded.encode()).hexdigest(), 'turn_entry_display', 1, encoded)

    def rows(self, scope=None):
        value = json.loads(self._encoded)
        rows = value.get(scope + '_products') if scope else value['products']
        if scope and scope + '_products' not in value:
            from src.agents.product_display import product_bucket
            rows = [row for row in value['products'] if product_bucket(row) == scope]
        return rows or []

    def collection(self, scope=None):
        key = scope or 'global'
        rows = self.rows(scope)
        fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        meta = json.loads(self._encoded)['metadata']
        saved = (meta.get('collections') or {}).get(key) or {}
        valid = not saved or saved.get('fingerprint') == fingerprint
        return {'namespace': {'global': 'GLOBAL_PRODUCTS', 'drink': 'DRINK_PRODUCTS', 'food': 'FOOD_PRODUCTS'}[key],
            'fingerprint': fingerprint, 'source': saved.get('source', self.source),
            'generation': saved.get('generation', 0), 'numbering': meta.get('numbering', 'global'),
            'valid': valid, 'rows': rows if valid else []}

    def collections_context(self):
        return {group: [{'group_index': row.get('group_display_index', i), 'product_name': row['product_name']}
            for i, row in enumerate(self.collection(group)['rows'], 1)] for group in ('drink', 'food')}

    @property
    def focus(self):
        return json.loads(self._encoded)['focus']

    def descriptor(self):
        return {'snapshot_id': self.snapshot_id, 'fingerprint': self.fingerprint,
            'source': self.source, 'version': self.version,
            'ordered_product_ids': [str(row['product_id']) for row in self.rows() if row.get('product_id')]}
