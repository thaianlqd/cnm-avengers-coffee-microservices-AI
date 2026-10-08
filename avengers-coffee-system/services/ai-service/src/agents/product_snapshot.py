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
    def capture(cls, visible, focus=None):
        value = {'products': deepcopy(visible.get('products') or []),
            'drink_products': deepcopy(visible.get('drink_products') or []),
            'food_products': deepcopy(visible.get('food_products') or []), 'focus': deepcopy(focus)}
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
        return cls(uuid4().hex, hashlib.sha256(encoded.encode()).hexdigest(), 'turn_entry_display', 1, encoded)

    def rows(self, scope=None):
        value = json.loads(self._encoded)
        rows = value.get(scope + '_products') if scope else value['products']
        if scope and not rows:
            from src.agents.product_display import product_bucket
            rows = [row for row in value['products'] if product_bucket(row) == scope]
        return rows or []

    @property
    def focus(self):
        return json.loads(self._encoded)['focus']

    def descriptor(self):
        return {'snapshot_id': self.snapshot_id, 'fingerprint': self.fingerprint,
            'source': self.source, 'version': self.version,
            'ordered_product_ids': [str(row['product_id']) for row in self.rows() if row.get('product_id')]}
