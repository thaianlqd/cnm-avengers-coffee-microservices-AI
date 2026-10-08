"""Exact prerequisite ownership and named predicates over trusted server facts."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PrerequisitePolicy:
    owner_operation: str
    operation: str
    predicate: str
    reason: str

    def needed(self, context, target=None, reference=None):
        state = context.get('business') or {}
        visible = context.get('visible') or {}
        checkout = state.get('checkout') or {}
        facts = context.get('turn_progress_facts') or {}
        products = context.get('turn_product_snapshot', {}).get('ordered_product_ids')
        if products is None:
            products = [str(row['product_id']) for row in visible.get('products', []) if row.get('product_id')]
        reference = reference if isinstance(reference, dict) else {}
        if not products:
            products = [str(row['product_id']) for row in facts.get('product_candidates', []) if row.get('product_id')]
        if self.predicate == 'missing_product_candidates':
            if target and target[0] == 'PRODUCT' and str(target[2]) in products:
                return False
            if not products:
                return True
            # A named target absent from current canonical candidates can need
            # an exact Menu lookup; visible ordinals never need rediscovery.
            if reference.get('kind') in {'id', 'name'}:
                rows = visible.get('products', []) + state.get('pending_products', []) + facts.get('product_candidates', [])
                field = 'product_id' if reference['kind'] == 'id' else 'product_name'
                return not any(str(row.get(field, '')).casefold() == str(reference.get('value', '')).casefold() for row in rows)
            return False
        if self.predicate in {'missing_product_options', 'missing_cart_product_options'}:
            if self.owner_operation == 'semantic_select_product' and products:
                rows = visible.get('products', []) + state.get('pending_products', []) + facts.get('product_candidates', [])
                resolved = (reference.get('kind') not in {'name', 'id'}
                    or reference.get('kind') == 'id' and str(reference.get('value')) in products
                    or reference.get('kind') == 'name' and any(str(row.get('product_name', '')).casefold()
                        == str(reference.get('value', '')).casefold() for row in rows)
                    or target and target[0] == 'PRODUCT' and str(target[2]) in products)
                if resolved:
                    return False  # Selection itself obtains canonical options.
            canonical = str(target[2]) if target and target[0] == 'PRODUCT' else None
            if not canonical and reference.get('kind') == 'id':
                canonical = str(reference.get('value'))
            if self.predicate == 'missing_cart_product_options' and target and target[0] == 'CART_LINE':
                line = next((row for row in (state.get('cart') or {}).get('items', [])
                    if str(row.get('cart_item_id') or row.get('id')) == str(target[2])), {})
                canonical = str(line['product_id']) if line.get('product_id') else None
            pending = state.get('pending_products') or []
            selected = [row for row in pending if not canonical or str(row.get('product_id')) == canonical]
            known = set(facts.get('product_options') or [])
            return not (canonical and canonical in known or selected and all(row.get('option_schema') for row in selected))
        if self.predicate == 'missing_cart_snapshot':
            return not state.get('cart_verified')
        if self.predicate == 'missing_voucher_candidates':
            return not (visible.get('vouchers') or facts.get('vouchers_read'))
        if self.predicate == 'missing_payment_candidates':
            return not (visible.get('payment_options') or facts.get('payment_options_read'))
        if self.predicate == 'missing_fulfillment':
            return not checkout.get('delivery_type')
        if self.predicate == 'missing_profile_addresses':
            return not (visible.get('profile_addresses') or checkout.get('profile_location_offer') or facts.get('profile_addresses_read'))
        if self.predicate == 'missing_location_candidates':
            return not (visible.get('location_candidates') or facts.get('location_candidates_read'))
        if self.predicate == 'missing_branch_candidates':
            return not (visible.get('branches') or facts.get('branches_read'))
        if self.predicate == 'missing_owned_order_details':
            return not (facts.get('owned_order_details') or checkout.get('order_management_action'))
        if self.predicate == 'missing_product_price':
            return not facts.get('product_price_read')
        raise AssertionError('Unknown prerequisite predicate: ' + self.predicate)


# Every edge has an owner, exact operation, state predicate and rationale.
_EDGES = (
    ('SELECT_PRODUCT', 'DISCOVER_PRODUCTS', 'missing_product_candidates', 'Obtain unresolved canonical Menu candidates.'),
    ('SELECT_PRODUCT', 'ASK_PRODUCT_OPTIONS', 'missing_product_options', 'Obtain undisplayed canonical product options.'),
    ('CONFIGURE_PRODUCT', 'ASK_PRODUCT_OPTIONS', 'missing_product_options', 'Obtain missing canonical option groups.'),
    ('USE_PRODUCT_DEFAULTS', 'ASK_PRODUCT_OPTIONS', 'missing_product_options', 'Obtain missing Menu default choices.'),
    ('UPDATE_CART_LINE', 'READ_CART', 'missing_cart_snapshot', 'Obtain the authoritative cart lines.'),
    ('UPDATE_CART_LINE', 'ASK_PRODUCT_OPTIONS', 'missing_cart_product_options', 'Obtain option groups for the edited cart product.'),
    ('REMOVE_CART_LINE', 'READ_CART', 'missing_cart_snapshot', 'Obtain authoritative removal targets.'),
    ('FINISH_CART', 'READ_CART', 'missing_cart_snapshot', 'Obtain the configured cart before its voucher gate.'),
    ('CHOOSE_VOUCHER', 'READ_ELIGIBLE_VOUCHERS', 'missing_voucher_candidates', 'Obtain current eligible voucher choices.'),
    ('SET_PAYMENT', 'READ_PAYMENT_OPTIONS', 'missing_payment_candidates', 'Obtain canonical payment choices.'),
    ('RESOLVE_NEW_LOCATION', 'SET_FULFILLMENT', 'missing_fulfillment', 'Establish explicit fulfillment before checkout destination.'),
    ('SELECT_PROFILE_ADDRESS', 'READ_PROFILE_ADDRESSES', 'missing_profile_addresses', 'Obtain the current saved-address offer.'),
    ('SELECT_PROFILE_ADDRESS', 'SET_FULFILLMENT', 'missing_fulfillment', 'Establish explicit fulfillment before saved destination.'),
    ('SELECT_LOCATION_CANDIDATE', 'FIND_NEARBY_BRANCHES', 'missing_location_candidates', 'Obtain missing geocoded candidates.'),
    ('SELECT_BRANCH', 'READ_BRANCHES', 'missing_branch_candidates', 'Obtain canonical branch candidates.'),
    ('SELECT_BRANCH', 'FIND_NEARBY_BRANCHES', 'missing_branch_candidates', 'Obtain compatible nearby branches.'),
    ('PREPARE_ORDER_CANCEL', 'READ_ORDER', 'missing_owned_order_details', 'Obtain owned order details before cancellation preview.'),
    ('PREPARE_ORDER_UPDATE', 'READ_ORDER', 'missing_owned_order_details', 'Obtain owned order lines before update preview.'),
    ('PREPARE_ORDER_UPDATE', 'ASK_PRODUCT_OPTIONS', 'missing_product_options', 'Obtain Menu options for order changes.'),
    ('PREPARE_ORDER_UPDATE', 'ASK_PRODUCT_PRICE', 'missing_product_price', 'Obtain current Menu prices for order changes.'),
    ('PREPARE_REORDER', 'READ_ORDER', 'missing_owned_order_details', 'Obtain owned source-order details.'),
    ('PREPARE_REORDER', 'ASK_PRODUCT_OPTIONS', 'missing_product_options', 'Obtain Menu options for reordered products.'),
    ('PREPARE_REORDER', 'ASK_PRODUCT_PRICE', 'missing_product_price', 'Obtain current Menu reorder prices.'),
)
PREREQUISITE_POLICIES = {(owner, operation): PrerequisitePolicy('semantic_' + owner.lower(),
    'semantic_' + operation.lower(), predicate, reason) for owner, operation, predicate, reason in _EDGES}


def prerequisite_policies(owner):
    return tuple(policy for policy in PREREQUISITE_POLICIES.values() if policy.owner_operation == owner)
