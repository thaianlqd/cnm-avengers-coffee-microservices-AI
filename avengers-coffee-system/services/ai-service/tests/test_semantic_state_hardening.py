"""State assertions for semantic proposals, independent of a language parser."""
from copy import deepcopy
import pytest

from test_semantic_control import compatibility_runtime, runtime, gateway_for, action
from src.common import cart_manager
from src.agents.semantic_control import customer_actions_schema
from src.agents.tool_capabilities import CAPABILITIES


def test_root_extras_reject_writes_but_retain_compound_intent(runtime):
    rows = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    rows.append(dict(id=802, **runtime.products[2], quantity=1, size='M', unit_price=50000))
    cart_manager.replace_items_from_order_cart(runtime.sid, rows)
    g = gateway_for(runtime, 'Bỏ dòng thứ hai, dòng thứ ba lấy ba phần.')
    remove = action(g, 'remove_cart_item', reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})
    update = action(g, 'update_cart_item', {'desired_state': {'quantity': 3}},
        reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 3})
    rejected = g.customer_actions({'messages': [], 'actions': [remove, update]})
    assert rejected['recovery_kind'] == 'model_repair' and not runtime.writes
    assert rejected['remaining_actions'] == 2
    result = g.customer_actions({'actions': [remove]})
    assert result['plan_id'] == rejected['plan_id'] and result['remaining_actions'] == 0
    assert {str(r['cart_item_id']): r['quantity'] for r in cart_manager.get_cart(runtime.sid)['items']} == {'800': 1, '802': 3}
    assert len(runtime.writes) == 2


def test_flat_update_wire_fields_are_typed_patch_not_new_intent(runtime):
    g = gateway_for(runtime)
    result = g.customer_actions({'actions': [action(g, 'update_cart_item', {'quantity': 3},
        reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})]})
    assert result['remaining_actions'] == 0
    assert cart_manager.get_cart(runtime.sid)['items'][1]['quantity'] == 3


def test_conflicting_wire_patch_is_rejected(runtime):
    g = gateway_for(runtime)
    result = g.customer_actions({'actions': [action(g, 'update_cart_item',
        {'quantity': 3, 'desired_state': {'quantity': 2}},
        reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})]})
    assert result['recovery_kind'] == 'model_repair' and not runtime.writes


def test_prose_proposal_is_staged_without_authorizing_false_claim(runtime):
    import json
    g = gateway_for(runtime)
    proposal = action(g, 'remove_cart_item', reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})
    result = g.stage_text_proposal('```json\n' + json.dumps({'reply': 'Đã xóa', 'actions': [proposal]}) + '\n```')
    assert result['recovery_kind'] == 'model_repair' and not runtime.writes
    plan_id = result['plan_id']
    repaired = g.customer_actions({'actions': [proposal]})
    assert repaired['plan_id'] == plan_id and len(runtime.writes) == 1


def test_recommendation_read_does_not_imply_product_purchase(runtime, monkeypatch):
    g = gateway_for(runtime)
    monkeypatch.setattr(g, 'dispatch', lambda *args: {'status': 'not_found'})
    g.execute_semantic(action(g, 'get_recommendations', {'criteria': 'preferences', 'preference_query': 'thanh mát'}))
    assert not g.artifacts.semantic_discovery_requires_continuation


def test_malformed_json_one_action_does_not_erase_siblings(runtime):
    g = gateway_for(runtime)
    remove = action(g, 'remove_cart_item', reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})
    update = action(g, 'update_cart_item', {'desired_state': {'quantity': 2}},
        reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 1})
    bad = {key: value for key, value in remove.items() if key != 'args'}
    result = g.customer_actions({'actions': [{**bad, 'args_json': '{broken'}, update]})
    assert result['remaining_actions'] == 2 and not runtime.writes
    fixed = g.customer_actions({'actions': [remove]})
    assert fixed['remaining_actions'] == 0 and len(runtime.writes) == 2


def test_default_metadata_can_move_from_args_but_is_never_invented(runtime):
    g = gateway_for(runtime, 'Lấy Alpha theo công thức quán.')
    proposal = action(g, 'add_to_cart', {'product_id': '101', 'use_defaults': True})
    proposal['args']['defaults_evidence'] = proposal.pop('defaults_evidence')
    result = g.customer_actions({'actions': [proposal]})
    assert result['remaining_actions'] == 0 and len(runtime.writes) == 1
    other = gateway_for(runtime, 'Chọn Beta.')
    bad = action(other, 'add_to_cart', {'product_id': '102', 'use_defaults': True})
    bad.pop('defaults_evidence')
    rejected = other.customer_actions({'actions': [bad]})
    assert rejected['results'][0]['result']['status'] == 'defaults_evidence_required'
    assert len(runtime.writes) == 1


@pytest.mark.parametrize('repair_index', [0, 1, 2])
@pytest.mark.parametrize('reverse', [False, True])
def test_repair_preserves_original_three_action_plan(runtime, repair_index, reverse):
    rows = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    rows.append(dict(id=802, **runtime.products[2], quantity=1, size='M', unit_price=50000))
    cart_manager.replace_items_from_order_cart(runtime.sid, rows)
    g = gateway_for(runtime, 'Bỏ phần thứ hai; phần thứ ba lấy ba cái; phần đầu lấy hai.')
    original = [action(g, 'remove_cart_item', reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2}),
        action(g, 'update_cart_item', {'desired_state': {'quantity': 3}}, reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 3}),
        action(g, 'update_cart_item', {'desired_state': {'quantity': 2}}, reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 1})]
    if reverse:
        original.reverse()
    broken = deepcopy(original)
    broken[repair_index]['args']['payment_method'] = 'VNPAY'
    first = g.customer_actions({'actions': broken})
    assert first['recovery_kind'] == 'model_repair'
    plan_id = first['plan_id']
    second = g.customer_actions({'actions': [original[repair_index]]})
    assert second['plan_id'] == plan_id and second['remaining_actions'] == 0
    current = {str(r['cart_item_id']): r['quantity'] for r in cart_manager.get_cart(runtime.sid)['items']}
    assert current == {'800': 2, '802': 3}
    assert len(runtime.writes) == 3
    assert all(r['status'] in {'SUCCEEDED', 'ALREADY_PROCESSED'} for r in second['plan'])


def test_fulfillment_cannot_smuggle_payment(runtime):
    g = gateway_for(runtime, 'Mang tới nhà giúp mình.')
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    bad = g.customer_actions({'actions': [action(g, 'set_fulfillment_choice',
        {'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'}, facet='fulfillment')]})
    assert bad['recovery_kind'] == 'model_repair'
    assert cart_manager.get_checkout_prefs(runtime.sid) == before
    result = g.customer_actions({'actions': [action(g, 'set_fulfillment_choice',
        {'delivery_type': 'GIAO_TAN_NOI'}, facet='fulfillment', supplied_location=True)]})
    assert result['remaining_actions'] == 0
    assert cart_manager.get_checkout_prefs(runtime.sid).get('payment_method') is None


def test_canonical_fulfillment_label_cannot_authorize_different_enum(runtime, monkeypatch):
    from src.agents import checkout_choices
    # Dynamic business identity, not a Vietnamese phrase classifier.
    monkeypatch.setattr(checkout_choices, 'FULFILLMENT_LABELS', ('Courier A', 'Collect B', 'Stay C'))
    g = gateway_for(runtime, 'Collect B please.')
    proposal = action(g, 'set_fulfillment_choice', {'delivery_type': 'TAI_CHO'})
    result = g.customer_actions({'actions': [proposal]})
    assert result['results'][0]['result']['status'] == 'canonical_choice_evidence_conflict'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('delivery_type')
    proposal['args']['delivery_type'] = 'MANG_DI'
    assert g.customer_actions({'actions': [proposal]})['remaining_actions'] == 0
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'MANG_DI'


@pytest.mark.parametrize('commitment', ['QUESTION', 'NEGATED', 'HYPOTHETICAL', 'CONDITIONAL'])
@pytest.mark.parametrize('tool,args,facet', [
    ('set_fulfillment_choice', {'delivery_type': 'GIAO_TAN_NOI'}, 'fulfillment'),
    ('set_payment_choice', {'payment_method': 'VNPAY'}, 'payment'),
    ('select_location_candidate', {'candidate_id': 'unknown'}, 'location'),
    ('remove_cart_item', {'cart_item_id': '800'}, 'cart'),
])
def test_non_commitments_never_write(runtime, commitment, tool, args, facet):
    g = gateway_for(runtime)
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    result = g.execute_semantic(action(g, tool, args, commitment, facet=facet))
    assert result['status'] == 'semantic_commitment_required'
    assert cart_manager.get_cart(runtime.sid) == before and not runtime.writes


def test_model_surface_splits_checkout_facets():
    surface = customer_actions_schema(CAPABILITIES, model_facing=True)
    tools = surface['function']['parameters']['properties']['actions']['items']['properties']['tool']['enum']
    assert 'set_checkout_choices' not in tools
    assert {'set_fulfillment_choice', 'set_payment_choice'} <= set(tools)


@pytest.mark.parametrize('method,name', [('THANH_TOAN_KHI_NHAN_HANG', 'COD'), ('NGAN_HANG_QR', 'QR ngân hàng')])
def test_explicit_payment_with_fulfillment_is_independently_authorized(runtime, method, name):
    g = gateway_for(runtime, 'Nhờ mang tới nhà; mình trả ' + name + '.')
    result = g.customer_actions({'actions': [
        action(g, 'set_fulfillment_choice', {'delivery_type': 'GIAO_TAN_NOI'}, facet='fulfillment', supplied_location=True, evidence='Nhờ mang tới nhà'),
        action(g, 'set_payment_choice', {'payment_method': method}, facet='payment', evidence='mình trả ' + name,
            reference={'namespace': 'PAYMENT', 'kind': 'name', 'value': name})]})
    assert result['remaining_actions'] == 0
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == method


def test_payment_cannot_borrow_location_evidence(runtime):
    g = gateway_for(runtime, 'Nhờ giao tới nơi mình vừa gửi.')
    result = g.execute_semantic(action(g, 'set_payment_choice', {'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'},
        facet='payment', reference={'namespace': 'PAYMENT', 'kind': 'name', 'value': 'COD'}))
    assert result['status'] == 'payment_choice_evidence_required'
    assert cart_manager.get_checkout_prefs(runtime.sid).get('payment_method') is None


def test_selected_candidate_survives_profile_and_branch_and_summary(runtime, monkeypatch):
    from src.function_calling.tools import branch_tools, cart_tools, TOOL_EXECUTORS
    from src.agents.checkout_contract import checkout_next_step
    from src.agents.agent_context import business_state
    address = '24 Đường Hoa, Phường 3, Quận 7, Thành phố Hồ Chí Minh'
    candidate = {'candidate_id': 'geo-1', 'provider_ref_id': 'provider-1',
        'display_address': address, 'normalized_label': 'Nhà B', 'lat': 10.75, 'lng': 106.7}
    other = {**candidate, 'candidate_id': 'geo-2', 'lat': 10.76}
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='GIAO_TAN_NOI')
    cart_manager.set_checkout_context(runtime.sid, checkout_requested=True, voucher_decided=True,
        location_candidate_snapshot={'candidates': [candidate, other]})
    g = gateway_for(runtime, 'Điểm đầu trong bản đồ là nơi mình nhận nhé.')
    g.artifacts.visible['location_candidates'] = [candidate, other]
    queried = []
    def nearest(**kwargs):
        queried.append(kwargs)
        return {'status': 'ok', 'branches': [{'ma_chi_nhanh': 'b', 'ten_chi_nhanh': 'Quán B'}]}
    def select(sid, bid, name, **kwargs):
        cart_manager.set_branch(sid, bid, name)
        return {'status': 'ok'}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', select)
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_user_profile', lambda *args: pytest.fail('profile must not replace selected candidate'))
    result = g.execute_semantic(action(g, 'select_location_candidate', facet='location',
        reference={'namespace': 'LOCATION_CANDIDATE', 'kind': 'ordinal', 'index': 1}))
    assert result['status'] == 'ok'
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['confirmed_destination']['lat'] == candidate['lat']
    assert prefs['confirmed_destination']['provider_ref_id'] == 'provider-1'
    assert prefs['address_confirmed'] and prefs['delivery_address'] == address
    assert queried[0]['resolved_location'] == candidate
    assert checkout_next_step(business_state(runtime.sid)).startswith('PAYMENT:')
    assert g._offer_profile_location('GIAO_TAN_NOI')['status'] == 'confirmed_destination'
    assert not prefs.get('location_candidate_snapshot')
    cart_manager.set_checkout_prefs(runtime.sid, payment_method='VNPAY')
    observed = []
    def summary(sid, **kwargs):
        observed.append(cart_manager.get_checkout_prefs(sid)['delivery_address'])
        return {'status': 'require_confirmation', 'order_summary': {'delivery_address': observed[-1]}}
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', summary)
    g.context['business'] = business_state(runtime.sid)
    assert g._request_checkout({})['order_summary']['delivery_address'] == address
    fingerprint = cart_manager.cart_fingerprint(runtime.sid)
    cart_manager.set_checkout_prefs(runtime.sid, delivery_address='Địa chỉ hồ sơ A')
    assert cart_manager.cart_fingerprint(runtime.sid) != fingerprint
    assert g._request_checkout({})['status'] == 'confirmed_destination_drift'
    assert observed == [address]


def test_repair_cannot_change_bound_cart_target(runtime):
    g = gateway_for(runtime)
    original = action(g, 'remove_cart_item', reference={'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2})
    broken = deepcopy(original)
    broken['args']['payment_method'] = 'VNPAY'
    assert g.customer_actions({'actions': [broken]})['recovery_kind'] == 'model_repair'
    changed = {**original, 'reference': {'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 1}}
    rejected = g.customer_actions({'actions': [changed]})
    assert rejected['results'][0]['result']['status'] == 'repair_target_conflict'
    assert not runtime.writes
    assert g.customer_actions({'actions': [original]})['remaining_actions'] == 0
    assert runtime.writes[0][1] == '801'


def test_generic_payment_acknowledgment_has_no_owner(runtime):
    cart_manager.set_checkout_prefs(runtime.sid, payment_method='VNPAY')
    g = gateway_for(runtime, 'Ừ vậy nhé.')
    result = g.execute_semantic(action(g, 'set_payment_choice', facet='payment',
        reference={'namespace': 'PAYMENT', 'kind': 'focus'}))
    assert result['status'] == 'payment_acknowledgment_unowned'


def test_summary_fingerprint_binds_line_identity_and_provider_coordinates(runtime):
    before = cart_manager.cart_fingerprint(runtime.sid)
    rows = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    rows[0]['id'] = rows[0]['cart_item_id'] = rows[0]['line_id'] = 999
    cart_manager.replace_items_from_order_cart(runtime.sid, rows)
    assert before != cart_manager.cart_fingerprint(runtime.sid)
    before = cart_manager.cart_fingerprint(runtime.sid)
    cart_manager.set_checkout_context(runtime.sid, confirmed_destination={'lat': 10.5, 'lng': 106.7})
    assert before != cart_manager.cart_fingerprint(runtime.sid)


def test_confirm_rejects_offsetting_individual_price_changes(runtime, monkeypatch):
    from src.function_calling.tools import cart_tools
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='TAI_CHO', payment_method='VNPAY')
    cart_manager.set_branch(runtime.sid, 'verified', 'Quán đã xác minh')
    old = {'subtotal': 70000, 'discount_amount': 0, 'delivery_fee': 0, 'final_total': 70000,
        'items': [{'id': '800', 'unit_price': 30000, 'quantity': 1}, {'id': '801', 'unit_price': 40000, 'quantity': 1}]}
    cart_manager.set_checkout_context(runtime.sid, voucher_decided=True,
        summary_amounts={key: old[key] for key in ('subtotal', 'discount_amount', 'delivery_fee', 'final_total')},
        summary_quote_items=cart_tools._quote_item_binding(old))
    prefs = cart_manager.mark_checkout_summary(runtime.sid)
    cart_manager.set_pending_action(runtime.sid, 'confirm_checkout', {})
    new = deepcopy(old)
    new['items'][0]['unit_price'] = 31000
    new['items'][1]['unit_price'] = 39000
    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', lambda *args, **kwargs: new)
    result = cart_tools.execute_confirm_checkout(runtime.sid, action_id=prefs['checkout_action_id'])
    assert result['status'] == 'stale_checkout'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('summary_fingerprint')
    assert not runtime.writes
