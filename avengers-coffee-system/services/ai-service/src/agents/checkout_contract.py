"""Server-owned checkout prerequisites and safe customer guidance."""


def missing_checkout_fields(state):
    prefs, cart = state.get('checkout') or {}, state.get('cart') or {}
    missing = []
    if state.get('pending_products') or prefs.get('pending_product_reference'):
        missing.append('options')
    if not prefs.get('voucher_decided') or prefs.get('voucher_revalidation_required'):
        missing.append('voucher')
    if prefs.get('profile_location_offer'):
        missing.append('profile_location')
    missing.extend(key for key in ('delivery_type', 'payment_method') if not prefs.get(key))
    if not cart.get('branch_id'):
        missing.append('branch')
    if prefs.get('delivery_type') == 'GIAO_TAN_NOI' and (
            not prefs.get('delivery_address') or not prefs.get('address_confirmed')):
        missing.append('delivery_address')
    return missing


def checkout_guidance(missing):
    labels = {'options': 'hoàn tất tùy chọn món', 'voucher': 'chọn hoặc bỏ qua mã giảm giá',
        'delivery_type': 'chọn hình thức nhận hàng', 'payment_method': 'chọn phương thức thanh toán',
        'branch': 'chọn chi nhánh', 'delivery_address': 'cung cấp và xác nhận địa chỉ giao hàng',
        'profile_location': 'xác nhận bạn đang ở địa chỉ hồ sơ hay cung cấp địa chỉ khác'}
    return 'Bạn vui lòng ' + ', '.join(labels[key] for key in missing if key in labels) + ' nhé.'


def checkout_next_step(state):
    """Compact state-derived planning hint; it never authorizes a customer choice."""
    prefs = state.get('checkout') or {}
    if state.get('pending_products'):
        return ('OPTIONS: pending_products are ALREADY SELECTED even if cart.items is empty. '
                'Use semantic_configure_product with only supplied options and reference kind=pending. '
                'Explicit defaults use semantic_use_product_defaults. Ask only missing required fields. '
                'Questions use semantic_ask_product_options and remain read-only.')
    if prefs.get('delivery_type') == 'GIAO_TAN_NOI' and prefs.get('partial_delivery_address'):
        return ('LOCATION: checkout.partial_delivery_address retains the customer-supplied address. '
                'A location follow-up completes/corrects that draft via semantic_resolve_new_location(for_checkout=true); '
                'retain supplied house/street/locality components, ask only missing precision. '
                'Do not invent a city, saved address or provider coordinate. Questions remain read-only.')
    if prefs.get('voucher_offer_pending') or prefs.get('voucher_revalidation_required'):
        return 'VOUCHER: show eligible offers and wait. Only apply/skip on a CURRENT explicit voucher choice; generic OK finishes cart only.'
    if not prefs.get('voucher_decided'):
        return 'CART: allow edits. A request to finish uses finish_cart and stops at the voucher offer.'
    offer = prefs.get('profile_location_offer')
    if offer:
        purpose = 'delivery address' if offer.get('purpose') == 'delivery' else 'origin for nearby branches; never delivery address'
        return 'PROFILE_LOCATION: ask where customer is among offered addresses. On next-turn YES use default; explicit number/label uses that offered full_address. resolve_location as ' + purpose + '. On NO ask new location. Do not auto-use it.'
    if not prefs.get('delivery_type'):
        return 'FULFILLMENT: ask delivery/pickup/dine-in; never infer from profile.'
    if prefs.get('delivery_type') == 'GIAO_TAN_NOI' and not prefs.get('address_confirmed'):
        return 'LOCATION: ask address, then canonical resolve_location; never use a profile address without agreement.'
    if not (state.get('cart') or {}).get('branch_id'):
        return 'BRANCH: discover nearby candidates from customer-approved location; pickup/dine-in require a later customer branch selection.'
    if not prefs.get('payment_method'):
        return 'PAYMENT: ask supported current payment choice.'
    return 'SUMMARY: request_checkout, then wait for explicit confirmation on a later turn; a summary is not an order.'
