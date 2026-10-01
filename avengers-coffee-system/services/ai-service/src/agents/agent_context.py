"""Small server-owned state context; Redis hints never replace current cart truth."""
import json
from src.agents.agent_memory import compact, limit, safe_text, snapshot
from src.common import cart_manager
from src.function_calling.tools import cart_tools

PREF_FIELDS = ('delivery_type', 'payment_method', 'delivery_address', 'address_confirmed',
    'voucher_code', 'voucher_decided', 'voucher_revalidation_required', 'checkout_requested',
    'checkout_action_id', 'checkout_action_expires_at', 'summary_fingerprint', 'flow_stage',
    'location_address', 'summary_amounts', 'completed_order_id', 'stock_conflicts', 'checkout_submission')
LINE_FIELDS = ('cart_item_id', 'line_id', 'product_id', 'product_name', 'quantity', 'size',
               'toppings', 'luong_da', 'do_ngot', 'loai_sua', 'unit_price')


def business_state(session_id, shadow=False):
    if shadow:
        session = cart_manager._SESSION_CARTS.get(session_id) or {}
        cart = {'items': session.get('items', []), 'branch_id': session.get('branch_id'),
                'branch_name': session.get('branch_name'), 'authoritative': False}
        prefs = dict(session.get('checkout_prefs') or {})
        authenticated = not session_id.startswith('anon-')
    else:
        authenticated = cart_tools.is_authenticated_cart_session(session_id)
        try:
            cart = cart_tools.sync_authoritative_cart(session_id)
        except Exception:
            cart = {'items': [], 'authoritative': False, 'cart_sync_status': 'unavailable'}
        prefs = cart_manager.get_checkout_prefs(session_id)
    lines = [{**{key: compact(row[key]) for key in LINE_FIELDS if key in row}, 'display_index': index}
             for index, row in enumerate(cart.get('items', []), 1)]
    return {'authenticated': authenticated, 'cart_verified': bool(cart.get('authoritative')),
        'cart': {'items': lines, 'cart_version': cart.get('cart_version'),
                 'branch_id': cart.get('branch_id'), 'branch_name': cart.get('branch_name')},
        'checkout': {key: compact(prefs[key]) for key in PREF_FIELDS if key in prefs},
        'pending': compact(prefs.get('pending_action')),
        'pending_products': compact(prefs.get('pending_products') or [])}


def build_context(session_id, memory, history=None, selected_product_id=None, shadow=False):
    state = business_state(session_id, shadow)
    # Durable canonical hints are useful when Redis is unavailable, but they
    # carry no authority for a write. Gateway refreshes every proposed target.
    prefs = ((cart_manager._SESSION_CARTS.get(session_id) or {}).get('checkout_prefs') or {}) if shadow else cart_manager.get_checkout_prefs(session_id)
    visible = dict(memory.get('visible_snapshots') or {})
    fallbacks = {'products': prefs.get('last_product_suggestions'), 'branches': prefs.get('branch_candidates'),
        'vouchers': prefs.get('voucher_candidates'),
        'location_candidates': (prefs.get('location_candidate_snapshot') or {}).get('candidates')}
    for kind, rows in fallbacks.items():
        if not visible.get(kind):
            visible[kind] = snapshot(kind, rows)
    focus = dict(memory.get('focus') or {})
    if not focus.get('product') and prefs.get('last_product_focus'):
        focus['product'] = compact(prefs['last_product_focus'])
    recent = memory.get('recent_turns') or history or []
    recent = [{'role': row['role'], 'content': safe_text(row.get('content'), 700)}
              for row in recent if row.get('role') in {'user', 'assistant'}][-2*limit('AI_AGENT_RECENT_TURNS', 8, 1, 8):]
    context = {'business': state, 'visible': visible, 'focus': focus,
               'selected_product_id': selected_product_id, 'recent': recent}
    return bound_context(context)


def bound_context(context):
    """Apply the same budget after server-side selected-product enrichment."""
    budget = limit('AI_AGENT_CONTEXT_CHAR_LIMIT', 12000, 2000, 24000)
    def encoded():
        return json.dumps(context, ensure_ascii=False, separators=(',', ':'))
    # Remove low-priority hints first; never truncate JSON or keep an incomplete
    # authoritative cart that could authorize a destructive row selection.
    while len(encoded()) > budget and context['recent']:
        context['recent'].pop(0)
    while len(encoded()) > budget and any(context['visible'].values()):
        largest = max(context['visible'], key=lambda k: len(context['visible'][k]))
        context['visible'][largest].pop()
    if len(encoded()) > budget:
        context['focus'] = {}
        context['business']['pending_products'] = []
    if len(encoded()) > budget:
        context['business']['cart'] = {'items': [], 'context_omitted': True}
        context['business']['cart_verified'] = False
    if len(encoded()) > budget:
        context['business']['checkout'] = {}
        context['business']['pending'] = None
    return context, encoded()
