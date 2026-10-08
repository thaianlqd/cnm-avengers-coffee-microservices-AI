"""Derived workflow and immutable entry references. No customer language routing."""
from dataclasses import dataclass
import json
import logging
import re
import time
from uuid import uuid4
from src.agents.product_snapshot import ProductDisplaySnapshot
from src.agents.semantic_protocol import digest

logger = logging.getLogger(__name__)
IDENTITIES = {'products': ('product_id',), 'pending_products': ('product_id',),
    'cart_lines': ('cart_item_id', 'line_id'), 'vouchers': ('ma_voucher', 'voucher_code'),
    'branches': ('branch_id', 'ma_chi_nhanh'), 'location_candidates': ('candidate_id',),
    'profile_addresses': ('address_id',), 'orders': ('order_id',), 'payment_options': ('code', 'value'),
    'menu_categories': ('category_id',)}
NAMES = {'products': ('product_name',), 'pending_products': ('product_name',), 'cart_lines': ('product_name',),
    'vouchers': ('ten_voucher', 'ma_voucher', 'voucher_code'), 'branches': ('branch_name', 'ten_chi_nhanh'),
    'location_candidates': ('normalized_label', 'display_address'), 'profile_addresses': ('label', 'full_address'),
    'orders': ('order_id',), 'payment_options': ('label', 'code', 'value'),
    'menu_categories': ('category_name', 'category_label')}


def identity(domain, row):
    return str(next((row[k] for k in IDENTITIES[domain] if row.get(k) is not None), ''))


def next_required_milestone(state):
    checkout = state.get('checkout') or {}
    if checkout.get('order_management_action'):
        return 'ORDER_CHANGE_CONFIRMATION'
    if checkout.get('checkout_action_id'):
        return 'CHECKOUT_CONFIRMATION'
    if state.get('pending_products'):
        return 'PRODUCT_CONFIGURATION'
    if not state.get('cart', {}).get('items'):
        return 'SHOPPING'
    if not checkout.get('checkout_requested') and not checkout.get('voucher_decided') and not checkout.get('voucher_offer_pending'):
        return 'CART_REVIEW'
    if not checkout.get('voucher_decided') or checkout.get('voucher_revalidation_required'):
        return 'VOUCHER_DECISION'
    if not checkout.get('delivery_type'):
        return 'FULFILLMENT_SELECTION'
    if checkout['delivery_type'] == 'GIAO_TAN_NOI' and not checkout.get('address_confirmed'):
        return 'LOCATION_REQUIRED'
    if not state.get('cart', {}).get('branch_id'):
        return 'BRANCH_SELECTION'
    if not checkout.get('payment_method'):
        return 'PAYMENT_SELECTION'
    return 'CHECKOUT_READY'


def workflow_projection(state):
    checkout = state.get('checkout') or {}
    return {'milestone': next_required_milestone(state), 'pending_product_count': len(state.get('pending_products') or []),
        'cart_count': len(state.get('cart', {}).get('items') or []),
        'voucher_decided': bool(checkout.get('voucher_decided') and not checkout.get('voucher_revalidation_required')),
        'fulfillment': checkout.get('delivery_type'), 'destination_confirmed': bool(checkout.get('address_confirmed')),
        'branch_set': bool(state.get('cart', {}).get('branch_id')), 'payment': checkout.get('payment_method'),
        'summary_pending': bool(checkout.get('checkout_action_id')), 'order_preview_pending': bool(checkout.get('order_management_action'))}


@dataclass(frozen=True)
class TurnContext:
    snapshot_id: str
    fingerprint: str
    product_display_snapshot: ProductDisplaySnapshot
    _encoded: str

    @classmethod
    def capture(cls, context):
        state, visible = context['business'], context.get('visible') or {}
        offer = (state.get('checkout') or {}).get('profile_location_offer') or {}
        addresses = visible.get('profile_addresses') or offer.get('addresses') or (
            [{'full_address': offer['address']}] if offer.get('address') else [])
        addresses = [{**r, 'address_id': digest(r.get('full_address'))[:24]} for r in addresses]
        products = ProductDisplaySnapshot.capture(visible, context.get('focus', {}).get('product'), context.get('product_display'))
        focus = dict(context.get('focus') or {})
        checkout = state.get('checkout') or {}
        order_focus = checkout.get('order_management_action') or checkout.get('order_management_focus') or {}
        if order_focus.get('order_id') and float(order_focus.get('expires_at') or 0) > time.time():
            focus['order'] = {'order_id': order_focus['order_id']}
        elif not focus.get('order') and not visible.get('orders') and checkout.get('last_created_order_id'):
            focus['order'] = {'order_id': checkout['last_created_order_id']}
        data = {'state': state, 'focus': focus, 'snapshots': {
            'products': products.rows(), 'pending_products': state.get('pending_products') or [],
            'cart_lines': state['cart']['items'], 'vouchers': visible.get('vouchers') or [],
            'branches': visible.get('branches') or [], 'location_candidates': visible.get('location_candidates') or [],
            'profile_addresses': addresses, 'orders': visible.get('orders') or [],
            'payment_options': visible.get('payment_options') or [], 'menu_categories': visible.get('menu_categories') or []}}
        encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
        return cls(uuid4().hex, digest(data), products, encoded)

    @property
    def state(self):
        return json.loads(self._encoded)['state']

    @property
    def focus(self):
        return json.loads(self._encoded)['focus']

    def rows(self, domain):
        return json.loads(self._encoded)['snapshots'][domain]

    def model_context(self, recent=()):
        def project(domain, ordinal):
            return [{ordinal: row.get('selection_index', i) if domain == 'pending_products' else row.get('display_index', i),
                **{k: row[k] for k in NAMES[domain] if k in row and k not in IDENTITIES[domain]},
                **{k: row[k] for k in ('quantity', 'size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if k in row}}
                for i, row in enumerate(self.rows(domain), 1)]
        state = self.state
        return {'workflow': workflow_projection(state),
            'order_references': {'focus': {'kind': 'focus'} if self.focus.get('order', {}).get('order_id') else None,
                'last_created': {'kind': 'last_created'} if state.get('checkout', {}).get('last_created_order_id') else None},
            'visible_products': project('products', 'display_index'),
            'visible_product_collections': self.product_display_snapshot.collections_context(),
            'product_numbering': self.product_display_snapshot.collection()['numbering'],
            'discovery_state': state.get('discovery_state') or {},
            'pending_products': project('pending_products', 'pending_index'),
            'cart_lines': project('cart_lines', 'cart_index'),
            'visible': {d: project(d, 'display_index') for d in IDENTITIES if d not in {'products', 'pending_products', 'cart_lines'}},
            'focus_product': (self.product_display_snapshot.focus or {}).get('product_name'),
            'pending_options': [{ 'pending_index': r.get('selection_index', i), 'product_name': r.get('product_name'),
                'option_schema': r.get('option_schema') or []} for i, r in enumerate(self.rows('pending_products'), 1)],
            'recent': list(recent)[-8:]}


class GroundingError(ValueError):
    def __init__(self, code, domain, paths=None):
        self.code, self.domain, self.paths = code, domain, paths or []
        super().__init__(code)


def ground(turn, domain, ref, *, rows=None, intent=None, user_message='', reference_path=None):
    """No fuzzy identity, later-turn ordinal list or guessed default target."""
    candidates = turn.rows(domain) if rows is None else rows
    kind = ref['kind']
    matches = candidates
    collection = turn.product_display_snapshot.collection() if domain == 'products' else None
    if kind in {'ordinal', 'cart_ordinal', 'pending_ordinal'}:
        # Supplemental prerequisite rows can never become an ordinal namespace.
        candidates = turn.rows(domain)
        field = 'selection_index' if domain == 'pending_products' else 'display_index'
        matches = [r for i, r in enumerate(candidates, 1) if r.get(field, i) == ref['index']]
        if domain == 'products' and collection and not collection['valid']:
            matches = []
    elif kind == 'group_ordinal':
        if domain != 'products':
            raise GroundingError('invalid_reference_group', domain)
        collection = turn.product_display_snapshot.collection(ref['group'])
        matches = [r for i, r in enumerate(collection['rows'], 1) if r.get('group_display_index', i) == ref['index']]
    elif kind == 'name':
        matches = [r for r in candidates if any(str(r.get(k, '')).casefold() == ref['value'].casefold() for k in NAMES[domain])]
    elif kind == 'id':
        # Structural identifier presence, never intent/confirmation detection.
        value = ref['value']
        if not re.search(r'(?<![A-Za-z0-9_-])' + re.escape(value) + r'(?![A-Za-z0-9_-])', user_message):
            matches = []
        else:
            matches = [r for r in candidates if identity(domain, r) == value]
    elif kind == 'focus':
        key = {'products': 'product', 'pending_products': 'product', 'cart_lines': 'cart_line',
            'profile_addresses': 'location', 'location_candidates': 'location', 'orders': 'order',
            'branches': 'branch', 'vouchers': 'voucher'}.get(domain)
        focus = turn.focus.get(key, {})
        if domain in {'products', 'pending_products'}:
            focus = turn.product_display_snapshot.focus or {}
        matches = [r for r in candidates if identity(domain, r) == identity(domain, focus) and identity(domain, focus)]
    elif kind == 'last_created':
        latest = turn.state.get('checkout', {}).get('last_created_order_id') if domain == 'orders' else None
        matches = [r for r in candidates if latest and identity(domain, r) == latest]
    unique = {identity(domain, r): r for r in matches if identity(domain, r)}
    row = next(iter(unique.values())) if len(unique) == 1 else None
    snapshot = turn.product_display_snapshot if domain == 'products' else turn
    logger.info('[HybridGrounding] %s', json.dumps({'intent': intent, 'reference_kind': kind,
        'reference_group': ref.get('group'), 'reference_space': collection['namespace'] if collection else domain,
        'collection_fingerprint': collection['fingerprint'] if collection else None,
        'reference_index': ref.get('index'), 'snapshot_type': domain, 'snapshot_id': snapshot.snapshot_id,
        'snapshot_fingerprint': snapshot.fingerprint, 'canonical_target_id': identity(domain, row) if row else None,
        'result': 'grounded' if row else 'ambiguous' if unique else 'unresolved'}))
    parts = (reference_path or '').split('/')
    logger.info('[HybridReference] %s', json.dumps({'intent': intent,
        'command_index': int(parts[2]) if len(parts) > 2 else None,
        'reference_index': int(parts[-1]) if parts[-1].isdigit() else None,
        'reference_kind': kind, 'reference_group': ref.get('group'), 'reference_index_value': ref.get('index'),
        'reference_space': collection['namespace'] if collection else domain,
        'snapshot_fingerprint': collection['fingerprint'] if collection else snapshot.fingerprint,
        'grounding_result': 'grounded' if row else 'ambiguous' if unique else 'unresolved',
        'canonical_target_id_hash': digest(identity(domain, row)) if row else None}))
    if row is None:
        from src.agents.hybrid_diagnostics import record
        record('reference_grounding_failure', intents=[intent] if intent else [], reference_kinds=[kind])
        raise GroundingError('ambiguous_reference' if unique else 'unknown_reference', domain,
                             [reference_path] if reference_path else [])
    return row
