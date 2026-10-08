"""Explicit registry data: semantic relationships, never language routing."""
from dataclasses import dataclass

GOAL_FAMILIES = ('SOCIAL', 'DISCOVERY', 'PRODUCT_SELECTION', 'PRODUCT_CONFIGURATION',
    'CART_EDIT', 'VOUCHER', 'FULFILLMENT', 'LOCATION', 'PAYMENT', 'CHECKOUT',
    'ORDER_READ', 'ORDER_CHANGE', 'RAG_KNOWLEDGE', 'REVIEW', 'GENERIC_CONSULTATION')
PROGRESS_ROLES = ('PRIMARY', 'PREREQUISITE', 'CONSULTATION', 'FINALIZATION')


@dataclass(frozen=True)
class ProgressPolicy:
    goal_family: str
    progress_role: str
    state_effect: str
    terminal_for_goal: bool
    prerequisites: tuple


# Every business operation must have an entry. No access/executor fallback.
PROGRESS_POLICIES = {
    'DISCOVER_PRODUCTS': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'RECOMMEND_BY_PREFERENCE': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'RANK_BY_SALES': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'RANK_BY_PRICE': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'DISCOVER_NEW_PRODUCTS': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'RANK_BY_RATING': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'READ_MENU': ProgressPolicy('DISCOVERY', 'PRIMARY', 'read_evidence', True, ()),
    'SELECT_PRODUCT': ProgressPolicy('PRODUCT_SELECTION', 'PRIMARY', 'pending_product', True, ('DISCOVER_PRODUCTS', 'ASK_PRODUCT_OPTIONS')),
    'ASK_PRODUCT_OPTIONS': ProgressPolicy('PRODUCT_CONFIGURATION', 'PREREQUISITE', 'read_evidence', False, ()),
    'CONFIGURE_PRODUCT': ProgressPolicy('PRODUCT_CONFIGURATION', 'PRIMARY', 'configured_cart', True, ('ASK_PRODUCT_OPTIONS',)),
    'USE_PRODUCT_DEFAULTS': ProgressPolicy('PRODUCT_CONFIGURATION', 'PRIMARY', 'configured_cart', True, ('ASK_PRODUCT_OPTIONS',)),
    'DISCARD_PRODUCT_SELECTION': ProgressPolicy('PRODUCT_SELECTION', 'PRIMARY', 'pending_product', True, ()),
    'ASK_PRODUCT_FACT': ProgressPolicy('GENERIC_CONSULTATION', 'CONSULTATION', 'read_evidence', True, ()),
    'ASK_PRODUCT_REVIEW': ProgressPolicy('REVIEW', 'CONSULTATION', 'read_evidence', True, ()),
    'ASK_PRODUCT_PRICE': ProgressPolicy('GENERIC_CONSULTATION', 'CONSULTATION', 'read_evidence', True, ()),
    'ASK_KNOWLEDGE': ProgressPolicy('RAG_KNOWLEDGE', 'CONSULTATION', 'read_evidence', True, ()),
    'READ_CART': ProgressPolicy('CART_EDIT', 'CONSULTATION', 'read_evidence', True, ()),
    'READ_CART_TOTAL': ProgressPolicy('CART_EDIT', 'CONSULTATION', 'read_evidence', True, ()),
    'UPDATE_CART_LINE': ProgressPolicy('CART_EDIT', 'PRIMARY', 'configured_cart', True, ('READ_CART', 'ASK_PRODUCT_OPTIONS')),
    'REMOVE_CART_LINE': ProgressPolicy('CART_EDIT', 'PRIMARY', 'configured_cart', True, ('READ_CART',)),
    'FINISH_CART': ProgressPolicy('VOUCHER', 'PRIMARY', 'voucher_gate', True, ('READ_CART',)),
    'READ_ELIGIBLE_VOUCHERS': ProgressPolicy('VOUCHER', 'PREREQUISITE', 'read_evidence', False, ()),
    'CHOOSE_VOUCHER': ProgressPolicy('VOUCHER', 'PRIMARY', 'voucher_decision', True, ('READ_ELIGIBLE_VOUCHERS',)),
    'SKIP_VOUCHER': ProgressPolicy('VOUCHER', 'PRIMARY', 'voucher_decision', True, ()),
    'REMOVE_VOUCHER': ProgressPolicy('VOUCHER', 'PRIMARY', 'voucher_decision', True, ()),
    'READ_PAYMENT_OPTIONS': ProgressPolicy('PAYMENT', 'PREREQUISITE', 'read_evidence', False, ()),
    'SET_PAYMENT': ProgressPolicy('PAYMENT', 'PRIMARY', 'payment_method', True, ('READ_PAYMENT_OPTIONS',)),
    'SET_FULFILLMENT': ProgressPolicy('FULFILLMENT', 'PRIMARY', 'delivery_type', True, ()),
    'READ_PROFILE_ADDRESSES': ProgressPolicy('LOCATION', 'PREREQUISITE', 'read_evidence', False, ()),
    'RESOLVE_NEW_LOCATION': ProgressPolicy('LOCATION', 'PRIMARY', 'location_state', True, ('SET_FULFILLMENT',)),
    'SELECT_PROFILE_ADDRESS': ProgressPolicy('LOCATION', 'PRIMARY', 'location_state', True, ('READ_PROFILE_ADDRESSES', 'SET_FULFILLMENT')),
    'SELECT_LOCATION_CANDIDATE': ProgressPolicy('LOCATION', 'PRIMARY', 'location_state', True, ('FIND_NEARBY_BRANCHES',)),
    'FIND_NEARBY_BRANCHES': ProgressPolicy('LOCATION', 'CONSULTATION', 'read_evidence', True, ()),
    'READ_BRANCHES': ProgressPolicy('LOCATION', 'PREREQUISITE', 'read_evidence', False, ()),
    'SELECT_BRANCH': ProgressPolicy('LOCATION', 'PRIMARY', 'branch_id', True, ('READ_BRANCHES', 'FIND_NEARBY_BRANCHES')),
    'READ_BRANCH_RATINGS': ProgressPolicy('REVIEW', 'CONSULTATION', 'read_evidence', True, ()),
    'ASK_BRANCH_REVIEW': ProgressPolicy('REVIEW', 'CONSULTATION', 'read_evidence', True, ()),
    'COMPARE_BRANCH_REVIEWS': ProgressPolicy('REVIEW', 'CONSULTATION', 'read_evidence', True, ()),
    'PREPARE_CHECKOUT': ProgressPolicy('CHECKOUT', 'PRIMARY', 'checkout_summary', True, ()),
    'CONFIRM_CHECKOUT': ProgressPolicy('CHECKOUT', 'FINALIZATION', 'confirmed_checkout', True, ()),
    'READ_ORDER_HISTORY': ProgressPolicy('ORDER_READ', 'CONSULTATION', 'read_evidence', True, ()),
    'READ_ORDER': ProgressPolicy('ORDER_READ', 'CONSULTATION', 'read_evidence', True, ()),
    'TRACK_ORDER': ProgressPolicy('ORDER_READ', 'CONSULTATION', 'read_evidence', True, ()),
    'PREPARE_ORDER_CANCEL': ProgressPolicy('ORDER_CHANGE', 'PRIMARY', 'order_preview', True, ('READ_ORDER',)),
    'PREPARE_ORDER_UPDATE': ProgressPolicy('ORDER_CHANGE', 'PRIMARY', 'order_preview', True, ('READ_ORDER', 'ASK_PRODUCT_OPTIONS', 'ASK_PRODUCT_PRICE')),
    'PREPARE_REORDER': ProgressPolicy('ORDER_CHANGE', 'PRIMARY', 'order_preview', True, ('READ_ORDER', 'ASK_PRODUCT_OPTIONS', 'ASK_PRODUCT_PRICE')),
    'CONFIRM_ORDER_CHANGE': ProgressPolicy('ORDER_CHANGE', 'FINALIZATION', 'order_change', True, ()),
    'DISCARD_ORDER_CHANGE': ProgressPolicy('ORDER_CHANGE', 'FINALIZATION', 'order_change', True, ()),
}

# Local business context plus a typed interrupt replaces unrelated declarations.
NORMAL_COMPANION_GOALS = {
    'PRODUCT_CONFIGURATION': ('PRODUCT_SELECTION', 'CART_EDIT', 'GENERIC_CONSULTATION'),
    'CART_EDIT': ('PRODUCT_SELECTION', 'GENERIC_CONSULTATION'),
    'VOUCHER': ('CART_EDIT',), 'FULFILLMENT': ('LOCATION', 'PAYMENT'),
    'LOCATION': ('FULFILLMENT', 'PAYMENT'), 'PAYMENT': ('CART_EDIT', 'FULFILLMENT', 'LOCATION'),
    'CHECKOUT': ('CART_EDIT', 'FULFILLMENT', 'LOCATION', 'PAYMENT'), 'ORDER_CHANGE': ('ORDER_READ',),
}
