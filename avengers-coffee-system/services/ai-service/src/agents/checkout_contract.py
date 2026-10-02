"""Server-owned checkout prerequisites and safe customer guidance."""


def missing_checkout_fields(state):
    prefs, cart = state.get('checkout') or {}, state.get('cart') or {}
    missing = []
    if state.get('pending_products') or prefs.get('pending_product_reference'):
        missing.append('options')
    if not prefs.get('voucher_decided') or prefs.get('voucher_revalidation_required'):
        missing.append('voucher')
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
        'branch': 'chọn chi nhánh', 'delivery_address': 'cung cấp và xác nhận địa chỉ giao hàng'}
    return 'Bạn vui lòng ' + ', '.join(labels[key] for key in missing if key in labels) + ' nhé.'
