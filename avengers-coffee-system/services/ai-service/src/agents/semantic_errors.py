"""Customer-turn error taxonomy over structural results, never user language."""

SUCCESS = {'ok', 'success', 'already_processed', 'require_confirmation',
           'no_applicable_voucher', 'empty_cart', 'not_found'}


def error_class(result):
    status = str(result.get('status') or result.get('error') or '')
    if result.get('recovery_kind') == 'model_repair':
        return 'MODEL_PROTOCOL'
    if status in SUCCESS:
        return None
    if status in {'authentication_or_turn_required', 'login_required', 'auth_required', 'unauthorized'}:
        return 'AUTH_REQUIRED'
    if status in {'provider_unavailable', 'authority_unavailable', 'error', 'timeout',
                  'outcome_unknown', 'processing', 'unavailable', 'authoritative_cart_unavailable', 'cart_sync_error'}:
        return 'PROVIDER_FAILURE'
    if status in {'unknown_reference', 'unknown_product_reference', 'order_target_mismatch'}:
        return 'CANONICAL_TARGET_MISSING'
    if status in {'stale_confirmation', 'confirmation_expired', 'confirmed_destination_drift',
                  'checkout_fingerprint_mismatch', 'summary_stale'} or 'stale' in status:
        return 'CONFIRMATION_STALE'
    if status in {'out_of_stock', 'voucher_ineligible', 'invalid_voucher',
                  'payment_not_available', 'invalid_option', 'insufficient_balance'}:
        return 'BUSINESS_REJECTION'
    if result.get('recovery_kind') == 'clarify' or status in {'ambiguous', 'ambiguous_reference'}:
        return 'CUSTOMER_AMBIGUITY'
    return 'BUSINESS_PRECONDITION'


def classify_result(result):
    if isinstance(result, dict):
        category = error_class(result)
        if category:
            result.setdefault('error_class', category)
    return result
