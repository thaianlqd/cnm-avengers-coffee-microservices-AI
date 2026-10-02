"""Small server-owned state context; Redis hints never replace current cart truth."""
import json
import time
from copy import deepcopy
from src.agents.agent_memory import compact, limit, safe_text, snapshot
from src.common import cart_manager
from src.function_calling.tools import cart_tools

PREF_FIELDS = ('delivery_type', 'payment_method', 'delivery_address', 'address_confirmed',
    'voucher_code', 'voucher_decided', 'voucher_revalidation_required', 'checkout_requested',
    'checkout_action_id', 'checkout_action_expires_at', 'summary_fingerprint', 'flow_stage',
    'location_address', 'summary_amounts', 'completed_order_id', 'stock_conflicts', 'checkout_submission',
    'voucher_offer_pending', 'pending_product_reference')
LINE_FIELDS = ('cart_item_id', 'line_id', 'product_id', 'product_name', 'quantity', 'size',
               'toppings', 'luong_da', 'do_ngot', 'loai_sua', 'unit_price', 'line_total')


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
    lines = [{**{key: deepcopy(row[key]) for key in LINE_FIELDS if key in row}, 'display_index': index}
             for index, row in enumerate(cart.get('items', []), 1)]
    return {'authenticated': authenticated, 'cart_verified': bool(cart.get('authoritative')),
        'cart': {'items': lines, 'cart_version': cart.get('cart_version'),
                 'branch_id': cart.get('branch_id'), 'branch_name': cart.get('branch_name')},
        'checkout': {key: deepcopy(prefs[key]) for key in PREF_FIELDS if key in prefs},
        'confirmation_fresh': bool(not shadow and prefs.get('checkout_action_id')
            and prefs.get('summary_fingerprint') == cart_manager.cart_fingerprint(session_id)
            and float(prefs.get('checkout_action_expires_at') or 0) > time.time()),
        'pending': deepcopy(prefs.get('pending_action')),
        'pending_products': deepcopy(prefs.get('pending_products') or [])}


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
    sensitive = bool(state['pending'] or state['pending_products'] or focus or selected_product_id)
    model_turns = limit('AI_AGENT_MODEL_RECENT_TURNS', 6, 0, 8)
    model_turns = model_turns if sensitive else min(4, model_turns)
    recent = [{'role': row['role'], 'content': safe_text(row.get('content'), 700)}
              for row in recent if row.get('role') in {'user', 'assistant'}]
    recent = recent[-2*model_turns:] if model_turns else []
    context = {'business': state, 'visible': visible, 'focus': focus,
               'selected_product_id': selected_product_id, 'recent': recent}
    return bound_context(context)


MODEL_ENTITY_FIELDS = {
    'products': ('product_id', 'product_name', 'category', 'menu_bucket', 'display_index',
                 'group_display_index', 'global_display_index'),
    'branches': ('branch_id', 'branch_name', 'ma_chi_nhanh', 'ten_chi_nhanh', 'dia_chi',
                 'khoang_cach_km', 'availability_status', 'display_index'),
    'location_candidates': ('candidate_id', 'normalized_label', 'display_address', 'display_index'),
    'vouchers': ('ma_voucher', 'voucher_code', 'ten_voucher', 'mo_ta', 'gia_tri',
                 'loai_giam_gia', 'dieu_kien_ap_dung', 'so_tien_giam_du_kien', 'display_index'),
    'payment_options': ('code', 'value', 'label', 'enabled', 'reason', 'display_index'),
}


def model_snapshot(kind, rows):
    return [{key: compact(row[key]) for key in MODEL_ENTITY_FIELDS.get(kind, ()) if key in row}
            for row in rows or [] if isinstance(row, dict)]


def reference_value(value):
    """Redact model data without clipping canonical options/line namespaces."""
    if isinstance(value, str):
        return safe_text(value, max(1, len(value)))
    if isinstance(value, dict):
        return {key: reference_value(item) for key, item in value.items()
                if not any(part in str(key).lower() for part in ('token', 'secret', 'password', 'authorization', 'api_key'))}
    if isinstance(value, (list, tuple)):
        return [reference_value(item) for item in value]
    return value if isinstance(value, (int, float, bool)) or value is None else safe_text(value)


def model_cart(cart):
    # Full ordered identity/options or an explicit omission; never a partial cart.
    return {**{key: reference_value(cart[key]) for key in ('branch_id', 'branch_name', 'total_price', 'cart_version', 'authoritative') if key in cart},
        'items': [{**{key: reference_value(row[key]) for key in LINE_FIELDS if key in row},
                   'display_index': index} for index, row in enumerate(cart.get('items') or [], 1)]}


def model_projection(context, emergency=False):
    """Project a COPY. Budgeting cannot erase gateway authority/candidates."""
    state = context['business']
    checkout = state.get('checkout') or {}
    model = {'business': {'authenticated': state['authenticated'],
        'cart_verified': state['cart_verified'], 'cart': model_cart(state['cart']),
        'checkout': {key: compact(checkout[key]) for key in ('flow_stage', 'delivery_type',
            'payment_method', 'delivery_address', 'address_confirmed', 'voucher_code',
            'voucher_decided', 'voucher_revalidation_required', 'checkout_requested') if key in checkout},
        'summary_fresh': state.get('confirmation_fresh', False),
        'pending': {'type': (state.get('pending') or {}).get('type'),
                    'params': {key: compact(value) for key, value in
                        ((state.get('pending') or {}).get('params') or {}).items()
                        if key in {'product_id', 'cart_item_id', 'count', 'missing_fields', 'action_id'}}},
        'pending_products': [{key: reference_value(row[key]) for key in (*LINE_FIELDS, 'option_schema', 'missing_fields')
                              if key in row} for row in state.get('pending_products') or []]},
        'visible': {kind: model_snapshot(kind, rows) for kind, rows in context.get('visible', {}).items()},
        'focus': compact(context.get('focus') or {}),
        'selected_product_id': context.get('selected_product_id'),
        'recent': deepcopy(context.get('recent') or [])}
    if state.get('confirmation_fresh'):
        model['business']['checkout']['checkout_action_id'] = checkout.get('checkout_action_id')
    hard = limit('AI_AGENT_CONTEXT_CHAR_LIMIT', 12000, 2000, 24000)
    budget = min(hard, limit('AI_AGENT_MODEL_CONTEXT_TARGET', 8000, 2000, 24000))
    if emergency:
        budget = min(budget, 4000)
    def encoded():
        return json.dumps(model, ensure_ascii=False, separators=(',', ':'))
    while len(encoded()) > budget and model['recent']:
        # Drop whole exchanges where possible.
        del model['recent'][:2]
    owner = (state.get('pending') or {}).get('type')
    active_kind = {'select_voucher': 'vouchers', 'select_branch': 'branches',
              'select_location_candidate': 'location_candidates', 'fill_options': 'products',
              'select_payment': 'payment_options'}.get(owner)
    active = {active_kind, 'products'}
    # Keep every candidate namespace needed by an exposed legal selection,
    # including selection after a read-only interruption without a new pending owner.
    from src.agents.tool_capabilities import capabilities_for_context
    legal = capabilities_for_context(context, entry_action=checkout.get('checkout_action_id'))
    for tool, kind in (('apply_voucher', 'vouchers'), ('set_session_branch', 'branches'),
                       ('select_location_candidate', 'location_candidates')):
        if tool in legal:
            active.add(kind)
    for kind in sorted(model['visible'], key=lambda k: len(json.dumps(model['visible'][k])), reverse=True):
        if len(encoded()) <= budget:
            break
        if kind not in active:
            model['visible'][kind] = []
    # Active entity namespaces, staged product, focus and summary survive the soft target.
    if len(encoded()) > hard:
        model['business']['cart'] = {'items': [], 'context_omitted': True}
        model['business']['cart_verified'] = False
    if len(encoded()) > hard:
        raise ValueError('protected_model_context_exceeds_budget')
    return model, encoded()


def bound_context(context):
    """Compatibility return shape: full server context, compact model JSON."""
    _, encoded = model_projection(context)
    return context, encoded
