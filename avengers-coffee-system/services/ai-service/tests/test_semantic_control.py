"""Architecture probes: fake semantic output, independent of wording grammar."""
from copy import deepcopy
import json
from types import SimpleNamespace
from uuid import uuid4
import pytest

from test_llm_tool_orchestrator import runtime as compatibility_runtime, fresh_action
from src.agents.agent_memory import ConversationMemory
from src.agents.agent_context import build_context
from src.agents.tool_artifacts import ToolArtifacts
from src.agents.tool_capabilities import capabilities_for_context, validate_args
from src.agents.tool_policy import GuardedToolGateway
from src.agents.semantic_control import customer_actions_schema, ground_reference
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools, voucher_tools, TOOL_EXECUTORS


@pytest.fixture
def runtime(compatibility_runtime, monkeypatch):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn', compatibility_runtime.semantic_orchestrator)
    return compatibility_runtime


def gateway_for(runtime, message='Một cách diễn đạt chưa có trong bộ luật cũ'):
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    context, _ = build_context(runtime.sid, memory)
    context['semantic_control'] = True
    artifacts = ToolArtifacts(memory, message, context, semantic_mode=True)
    return GuardedToolGateway(runtime.sid, message, context, artifacts,
        uuid4().hex, allowed_capabilities=capabilities_for_context(context), semantic_mode=True)


def action(gateway, tool, args=None, commitment='SELECTED', reference=None, **fields):
    return {'tool': tool, 'args': args or {}, 'commitment': commitment,
        'evidence': gateway.user_message, **({'reference': reference} if reference else {}), **fields}


def send_actions(gateway, payload):
    wire = {'actions': [{**{key: value for key, value in a.items() if key != 'args'},
                         'args_json': json.dumps(a['args'])} for a in payload['actions']]}
    return gateway.customer_actions(wire)


@pytest.mark.parametrize('message', [
    'Mình nghiêng về phương án đem tới chỗ mình ở á',
    'Phiền quán cử người mang qua nơi mình đang đứng nha',
    'Thôi chuyển sang nhờ quán đem qua đi',
])
def test_unseen_fulfillment_paraphrases_do_not_veto_correct_semantics(runtime, message):
    gateway = gateway_for(runtime, message)
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI'}))
    assert result['status'] == 'ok'
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'GIAO_TAN_NOI'


@pytest.mark.parametrize('commitment', ['QUESTION', 'NEGATED', 'HYPOTHETICAL', 'CONDITIONAL', 'UNKNOWN'])
@pytest.mark.parametrize('tool,args', [
    ('add_to_cart', {'product_id': '101', 'size': 'M'}),
    ('update_cart_item', {'cart_item_id': '800', 'desired_state': {'quantity': 3}}),
    ('remove_cart_item', {'cart_item_id': '800'}),
    ('apply_voucher', {'voucher_code': 'FORGED'}),
    ('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI'}),
    ('set_checkout_choices', {'payment_method': 'VNPAY'}),
    ('resolve_location', {'location': 'Chợ do khách đề cập', 'kind': 'poi'}),
    ('set_session_branch', {'branch_id': 'FAKE'}),
    ('cancel_order', {'order_id': str(uuid4())}),
    ('confirm_checkout', {}),
])
def test_discussion_never_authorizes_mutation_across_namespaces(runtime, commitment, tool, args):
    gateway = gateway_for(runtime)
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    result = gateway.execute_semantic(action(gateway, tool, args, commitment))
    assert result['status'] == 'semantic_commitment_required'
    assert cart_manager.get_cart(runtime.sid) == before and not runtime.writes


@pytest.mark.parametrize('namespace,kind,rows,expected', [
    ('PRODUCT', 'products', [{'product_id': 'p', 'product_name': 'Canonical'}], 'p'),
    ('VOUCHER', 'vouchers', [{'ma_voucher': 'CODE'}], 'CODE'),
    ('BRANCH', 'branches', [{'branch_id': 'b'}], 'b'),
    ('LOCATION_CANDIDATE', 'location_candidates', [{'candidate_id': 'c'}], 'c'),
    ('ORDER', 'orders', [{'order_id': 'o'}], 'o'),
    ('MENU_CATEGORY', 'menu_categories', [{'category_id': 'm'}], 'm'),
    ('PAYMENT', 'payment_options', [{'code': 'VNPAY'}], 'VNPAY'),
])
def test_generic_singleton_ordinal_and_ambiguity(runtime, namespace, kind, rows, expected):
    gateway = gateway_for(runtime)
    gateway.entry_products = rows if namespace == 'PRODUCT' else gateway.entry_products
    gateway.artifacts.visible[kind] = rows
    gateway.artifacts.product_candidates = {}
    if namespace == 'PRODUCT':
        gateway.artifacts.focus = {}
    row, error = ground_reference(gateway, namespace, {'kind': 'singleton'})
    assert not error and expected in row.values()
    row, error = ground_reference(gateway, namespace, {'kind': 'ordinal', 'index': 1})
    assert not error and expected in row.values()
    extra = {key: value + '-other' for key, value in rows[0].items()}
    gateway.artifacts.visible[kind] = rows + [extra]
    if namespace == 'PRODUCT':
        gateway.entry_products = rows + [extra]
    row, error = ground_reference(gateway, namespace, {'kind': 'singleton'})
    assert row is None and error['status'] == 'ambiguous_reference'


def test_current_product_focus_and_question_options_do_not_stage(runtime):
    gateway = gateway_for(runtime)
    row, error = ground_reference(gateway, 'PRODUCT', {'kind': 'focus'})
    assert not error and row['product_id'] == '101'
    result = gateway.execute_semantic(action(gateway, 'get_product_options', commitment='QUESTION', reference={'kind': 'focus'}))
    assert result['status'] == 'ok'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')


def test_contextual_product_selection_uses_existing_price_and_option_authorities(runtime):
    gateway = gateway_for(runtime, 'Ờ đưa mình cái mới nhắc nha bạn')
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'size': 'M'}, reference={'kind': 'focus'}))
    assert result['status'] == 'ok' and runtime.writes[-1][0] == 'add'
    assert runtime.writes[-1][1]['product_id'] == '101'
    assert runtime.writes[-1][1]['unit_price'] == 30000


def test_multi_product_option_attributes_never_cross_contaminate(runtime):
    gateway = gateway_for(runtime, 'Phần đầu theo công thức quán, phần còn lại chọn topping riêng')
    result = send_actions(gateway, {'actions': [
        action(gateway, 'add_to_cart', {'product_id': '101', 'use_defaults': True}),
        action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'M', 'toppings': ['Pearl']}),
    ]})
    assert result['remaining_actions'] == 0
    additions = [write[1] for write in runtime.writes if write[0] == 'add']
    assert len(additions) == 2
    assert additions[0]['toppings'] == [] and additions[1]['toppings'] == ['Pearl']


def test_unknown_options_and_entities_do_not_reach_business_mutations(runtime):
    gateway = gateway_for(runtime)
    bad = gateway.execute_semantic(action(gateway, 'add_to_cart', {'product_id': '101', 'size': 'invented'}))
    assert bad['status'] == 'invalid_option'
    for tool, args in [('add_to_cart', {'product_id': 'invisible'}),
                       ('update_cart_item', {'cart_item_id': 'foreign', 'desired_state': {'quantity': 2}}),
                       ('apply_voucher', {'voucher_code': 'UNSEEN'}),
                       ('set_session_branch', {'branch_id': 'foreign'}),
                       ('cancel_order', {'order_id': str(uuid4())})]:
        result = gateway.execute_semantic(action(gateway, tool, args))
        assert result['status'] == 'unknown_reference'
    assert not runtime.writes


def test_compound_cart_removal_and_quantity_edit_freeze_original_ordinals(runtime):
    gateway = gateway_for(runtime, 'Bỏ phần đầu rồi phần kia cho ba ly nhé')
    result = send_actions(gateway, {'actions': [
        action(gateway, 'remove_cart_item', reference={'kind': 'ordinal', 'index': 1}),
        action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}},
               reference={'kind': 'ordinal', 'index': 2}),
    ]})
    assert result['remaining_actions'] == 0
    assert runtime.writes[0][1] == '800' and runtime.writes[1][1:3] == ('801', {'quantity': 3})


def test_partial_removal_is_an_attribute_not_a_language_rule(runtime):
    cart = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    cart[0]['quantity'] = 4
    cart_manager.replace_items_from_order_cart(runtime.sid, cart)
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'remove_cart_item', {'quantity': 2}, reference={'kind': 'ordinal', 'index': 1}))
    assert result['remaining_quantity'] == 2
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 2


def test_voucher_best_selection_and_rejection_are_grounded(runtime, monkeypatch):
    gateway = gateway_for(runtime, 'Nhờ bạn tối ưu khoản giảm giúp mình')
    gateway.artifacts.visible['vouchers'] = [{'ma_voucher': 'LESS', 'so_tien_giam_du_kien': 1000},
        {'ma_voucher': 'MORE', 'so_tien_giam_du_kien': 5000}]
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True, flow_stage='VOUCHER')
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s: {'status': 'ok', 'vouchers': gateway.artifacts.visible['vouchers']})
    applied = []
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', lambda s, code: (applied.append(code) or {'status': 'ok'}))
    result = gateway.execute_semantic(action(gateway, 'apply_voucher', reference={'kind': 'best'}))
    assert result['status'] == 'ok' and applied == ['MORE']
    # Rejection owns a still-open offer, rather than a completed application.
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True, flow_stage='VOUCHER')
    result = gateway.execute_semantic(action(gateway, 'skip_voucher', commitment='REJECTED'))
    assert result['status'] == 'ok'


def test_wallet_policy_still_rejects_unavailable_payment(runtime, monkeypatch):
    gateway = gateway_for(runtime)
    monkeypatch.setattr(cart_tools, 'validate_wallet_selection', lambda s: {'reply': 'Wallet unavailable'})
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', {'payment_method': 'VI_DIEN_TU'}))
    assert result['status'] == 'wallet_unavailable'


def test_order_and_branch_capabilities_do_not_depend_on_raw_words(runtime):
    gateway = gateway_for(runtime, 'Dạ nhờ bạn xem giúp cái vừa rồi ạ')
    surface = gateway.tool_surface()[0]
    assert [row['function']['name'] for row in surface] == ['customer_actions']
    names = set(surface[0]['function']['parameters']['properties']['actions']['items']['properties']['tool']['enum'])
    assert {'get_order_history', 'get_order_details', 'get_store_reviews', 'get_top_rated_stores'} <= names
    assert not {'cancel_order', 'update_order', 'reorder_order'} & names
    gateway.artifacts.visible['orders'] = [{'order_id': str(uuid4())}]
    surface = gateway.tool_surface()[0]
    assert [row['function']['name'] for row in surface] == ['customer_actions']
    names = set(surface[0]['function']['parameters']['properties']['actions']['items']['properties']['tool']['enum'])
    assert {'cancel_order', 'update_order', 'reorder_order'} <= names


def test_saved_profile_reference_is_exact_and_ambiguous_addresses_clarify(runtime):
    gateway = gateway_for(runtime)
    gateway.entry_profile_offer = {'addresses': [{'full_address': 'Address A', 'label': 'Home'},
        {'full_address': 'Address B', 'label': 'Work'}]}
    row, error = ground_reference(gateway, 'PROFILE_ADDRESS', {'kind': 'name', 'value': 'Home'})
    assert not error and row['full_address'] == 'Address A'
    row, error = ground_reference(gateway, 'PROFILE_ADDRESS', {'kind': 'pending'})
    assert error['status'] == 'ambiguous_reference'


def test_evidence_must_be_current_and_batch_shape_checked_before_writes(runtime):
    gateway = gateway_for(runtime)
    request = action(gateway, 'set_checkout_choices', {'delivery_type': 'MANG_DI'})
    request['evidence'] = 'a quote from an older turn'
    assert gateway.execute_semantic(request)['status'] == 'semantic_evidence_required'
    invalid = send_actions(gateway, {'actions': [action(gateway, 'remove_cart_item', {'cart_item_id': '800'}),
        {'tool': 'fake', 'args': {}, 'commitment': 'SELECTED'}]})
    assert invalid['status'] == 'invalid_semantic_arguments' and invalid['recovery_kind'] == 'model_repair' and not runtime.writes
    assert not validate_args({'actions': []}, customer_actions_schema({'get_cart'})['function']['parameters'])


def test_real_orchestrator_uses_same_provider_loop_and_no_raw_shortcut(runtime):
    message = 'Mình nghiêng về phương án đem tới chỗ mình ở á'
    runtime.provider.plan([('customer_actions', {'actions': [{'tool': 'set_checkout_choices',
        'commitment': 'SELECTED', 'evidence': message, 'args_json': json.dumps({'delivery_type': 'GIAO_TAN_NOI'})}]})])
    result = runtime.turn(message)
    assert result['tool_calls_log'][0]['tool'] == 'set_checkout_choices'
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(runtime.provider.requests) == 1  # Existing milestone ends the loop.


def test_direct_model_mutation_without_semantic_evidence_is_denied(runtime):
    runtime.provider.plan([('remove_cart_item', {'cart_item_id': '800'})])
    result = runtime.turn('a new phrasing')
    assert result['tool_calls_log'][0]['result']['status'] == 'semantic_evidence_required'
    assert not runtime.writes


@pytest.mark.parametrize('delivery_type', ['GIAO_TAN_NOI', 'MANG_DI', 'TAI_CHO'])
@pytest.mark.parametrize('commitment', ['SELECTED', 'CORRECTION'])
def test_fulfillment_commands_and_corrections_use_enums_not_phrase_maps(runtime, delivery_type, commitment):
    gateway = gateway_for(runtime, 'Ừ chuyển qua phương án khác hợp với mình hơn')
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', {'delivery_type': delivery_type}, commitment))
    assert result['status'] == 'ok'
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == delivery_type


def test_payment_and_fulfillment_ordinal_reference_share_grounder(runtime):
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['payment_options'] = [{'code': 'VNPAY', 'enabled': True, 'display_index': 1}]
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', reference={
        'namespace': 'PAYMENT', 'kind': 'ordinal', 'index': 1}))
    assert result['status'] == 'ok'
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', reference={
        'namespace': 'FULFILLMENT', 'kind': 'ordinal', 'index': 2}))
    assert result['status'] == 'ok'
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['delivery_type'] == 'MANG_DI' and prefs['payment_method'] == 'VNPAY'


def test_unavailable_displayed_payment_cannot_be_selected(runtime):
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['payment_options'] = [{'code': 'VNPAY', 'enabled': False, 'reason': 'Unavailable'}]
    result = gateway.execute_semantic(action(gateway, 'set_checkout_choices', reference={
        'namespace': 'PAYMENT', 'kind': 'singleton'}))
    assert result['status'] == 'payment_not_available'


def test_pending_product_ordinals_remain_stable_after_prior_add(runtime):
    product = {**runtime.products[1], 'selection_index': 2, 'quantity': 1, 'option_schema': []}
    cart_manager.set_pending_products(runtime.sid, [product])
    gateway = gateway_for(runtime)
    row, error = ground_reference(gateway, 'PRODUCT', {'kind': 'ordinal', 'index': 2})
    assert not error and row['product_id'] == '102'
    row, error = ground_reference(gateway, 'PRODUCT', {'kind': 'ordinal', 'index': 1})
    assert row is None and error['status'] == 'unknown_reference'


def test_question_clause_does_not_block_an_independent_committed_product(runtime):
    gateway = gateway_for(runtime, 'Thứ đó được đánh giá ra sao? Còn phần mình đặt thì lấy cỡ này nhé')
    result = send_actions(gateway, {'actions': [
        action(gateway, 'get_product_insights', {'product_name': runtime.products[0]['product_name']}, commitment='QUESTION'),
        action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'M'}),
    ]})
    assert result['remaining_actions'] == 0 and len(runtime.writes) == 1
    assert runtime.writes[0][1]['product_id'] == '102'


def test_read_only_social_turn_uses_no_business_tool(runtime):
    runtime.provider.steps = [{'content': json.dumps({'response_kind': 'social', 'reply': 'Dạ, chào bạn!',
        'mutation_claims': [], 'evidence_quotes': []}, ensure_ascii=False)}]
    result = runtime.turn('Hello bồ, hôm nay khỏe hông')
    assert not result['tool_calls_log'] and not runtime.writes and len(runtime.provider.requests) == 1


@pytest.mark.parametrize('domain', ['privacy', 'ordering_policy', 'product_description'])
def test_semantic_rag_authority_does_not_depend_on_request_words(runtime, monkeypatch, domain):
    from src.function_calling.tools import knowledge_tools
    captured = []
    def lookup(**kwargs):
        captured.append(kwargs)
        return {'status': 'not_found', 'results': [], 'message': 'No evidence'}
    monkeypatch.setattr(knowledge_tools, 'execute_search_knowledge_base', lookup)
    gateway = gateway_for(runtime)
    args = {'query': 'Một cách hỏi mới không nằm trong từ khóa', 'domain': domain}
    if domain == 'product_description':
        args.update(entity_type='product', entity_id='101')
    result = gateway.execute_semantic(action(gateway, 'search_knowledge_base', args, 'QUESTION'))
    assert result['status'] == 'not_found'
    assert captured[0]['semantic_route']['domain'] == domain
    assert not runtime.writes


def test_allergen_facet_never_uses_second_provider_or_infers_safety(runtime, monkeypatch):
    from src.function_calling.tools import knowledge_tools
    monkeypatch.setattr(knowledge_tools, 'execute_search_knowledge_base', lambda **kwargs: {
        'status': 'ok', 'results': [{'id': 'doc', 'content': 'General taste description.'}]})
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'get_product_description', {'product_id': '101'},
        'QUESTION', facet='allergen'))
    assert result['status'] == 'not_found' and result['results'] == []
    assert not runtime.provider.requests


@pytest.mark.parametrize('kind', ['address', 'area', 'poi'])
def test_location_kind_is_semantic_and_provider_adapter_remains_authority(runtime, monkeypatch, kind):
    from src.agents import order_flow_graph
    captured = []
    def resolve(state):
        captured.append(state)
        return {'reply': 'Canonical result', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'not_found', 'branches': []}}]}
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', resolve)
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'resolve_location', {'location': 'Literal place supplied by customer',
        'kind': kind, 'for_checkout': False}))
    assert result['status'] == 'not_found'
    assert captured[0]['location_override'].kind == kind
    assert captured[0]['force_read_only_location']


def test_profile_rejection_clears_only_offer_and_does_not_geocode(runtime, monkeypatch):
    offer = {'address': 'Saved address', 'addresses': [{'full_address': 'Saved address'}]}
    cart_manager.set_checkout_context(runtime.sid, profile_location_offer=offer)
    gateway = gateway_for(runtime, 'Nơi đó không còn phù hợp, mình sẽ cung cấp nơi khác')
    result = gateway.execute_semantic(action(gateway, 'resolve_location', {'kind': 'address'}, 'REJECTED',
        reference={'kind': 'pending'}))  # Namespace is safely implied by this tool.
    assert result['status'] == 'needs_new_location'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('profile_location_offer')
    assert not runtime.writes


def test_prior_checkout_confirmation_keeps_fingerprint_and_expiry_policy(runtime):
    fresh_action(runtime)
    gateway = gateway_for(runtime, 'Mọi thông tin đều chuẩn, tiến hành theo bản vừa xem giúp mình')
    cart_manager.set_checkout_context(runtime.sid, checkout_action_expires_at=0)
    result = gateway.execute_semantic(action(gateway, 'confirm_checkout', commitment='AFFIRMED'))
    assert result['status'] == 'confirmation_required' and result['reason'] == 'summary_expired'
    assert not runtime.writes


def test_order_recent_reference_is_owned_snapshot_and_ambiguous_unowned_id_is_rejected(runtime, monkeypatch):
    from src.agents import order_management
    oid = str(uuid4())
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['orders'] = [{'order_id': oid, 'display_index': 1}, {'order_id': str(uuid4()), 'display_index': 2}]
    captured = []
    monkeypatch.setattr(order_management, 'details', lambda s, o: (captured.append((s, o)) or {'status': 'ok', 'order_id': o}))
    result = gateway.execute_semantic(action(gateway, 'get_order_details', commitment='QUESTION', reference={'kind': 'recent'}))
    assert result['status'] == 'ok' and captured == [(runtime.sid, oid)]
    result = gateway.execute_semantic(action(gateway, 'cancel_order', {'order_id': str(uuid4())}))
    assert result['status'] == 'unknown_reference'


@pytest.mark.parametrize('tool', ['cancel_order', 'update_order', 'reorder_order'])
def test_order_actions_prepare_existing_owned_preview_without_language_veto(runtime, monkeypatch, tool):
    from src.agents import order_management
    oid = str(uuid4())
    gateway = gateway_for(runtime, 'Nhờ xử lý cái vừa rồi theo ý mình mới nói nhé')
    gateway.artifacts.visible['orders'] = [{'order_id': oid}]
    prepared = []
    monkeypatch.setattr(order_management, 'prepare', lambda *args, **kwargs: (
        prepared.append((args, kwargs)) or {'status': 'require_confirmation', 'changed': False, 'order_id': oid}))
    result = gateway.execute_semantic(action(gateway, tool, reference={'kind': 'singleton'}))
    assert result['status'] == 'require_confirmation' and len(prepared) == 1
    assert prepared[0][0][2]['order_id'] == oid
    if tool == 'update_order':
        assert prepared[0][1]['canonical_line_ids'] is True


def test_compound_failure_recovery_is_for_actual_namespace_not_display_count(runtime):
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 2}},
        reference={'kind': 'singleton'}))
    assert result['status'] == 'ambiguous_reference'
    reply = gateway.artifacts.factual_fallback()
    assert 'giỏ' in reply and 'so sánh' not in reply


@pytest.mark.parametrize('invalid_json', ['{bad json', '[]', 'null', '42'])
def test_wire_arguments_are_all_decoded_before_any_mutation(runtime, invalid_json):
    gateway = gateway_for(runtime)
    result = gateway.customer_actions({'actions': [
        {'tool': 'remove_cart_item', 'commitment': 'SELECTED', 'evidence': gateway.user_message,
         'args_json': '{"cart_item_id":"800"}'},
        {'tool': 'get_cart', 'commitment': 'QUESTION', 'args_json': invalid_json},
    ]})
    assert result['status'] == 'invalid_semantic_arguments' and result['recovery_kind'] == 'model_repair' and not runtime.writes


def test_semantic_wire_schema_has_defined_object_fields(runtime):
    def check(spec):
        if spec.get('type') == 'object':
            assert 'properties' in spec  # Empty args are explicit closed objects.
            assert spec.get('additionalProperties') is False
            for child in spec['properties'].values():
                check(child)
        elif spec.get('type') == 'array':
            check(spec['items'])
    check(customer_actions_schema({'get_cart'})['function']['parameters'])


@pytest.mark.parametrize('defect', ['unauthenticated', 'cart_unverified', 'missing_turn'])
def test_positive_semantics_cannot_bypass_auth_cart_or_turn_policy(runtime, monkeypatch, defect):
    gateway = gateway_for(runtime)
    if defect == 'unauthenticated':
        monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda s: False)
    elif defect == 'cart_unverified':
        monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda s: {**cart_manager.get_cart(s), 'authoritative': False})
    else:
        gateway.client_message_id = None
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'product_id': '101', 'size': 'M'}))
    assert result['status'] not in {'ok', 'success', 'already_processed'} and not runtime.writes


@pytest.mark.parametrize('price_result', [
    {'status': 'not_found'},
    {'status': 'ok', 'products': [{'product_id': '101', 'is_active': False, 'final_price': 1}]},
    {'status': 'ok', 'products': [{'product_id': '101', 'is_active': True}]},
])
def test_semantics_cannot_invent_price_or_sellability(runtime, monkeypatch, price_result):
    gateway = gateway_for(runtime)
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda **kwargs: price_result)
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'product_id': '101', 'size': 'M'}))
    assert result['status'] == 'price_or_sellability_unverified' and not runtime.writes


def test_menu_default_correction_clears_previous_paid_toppings(runtime, monkeypatch):
    original = product_tools.execute_get_product_options
    def options(**kwargs):
        result = original(**kwargs)
        result['option_groups'][0]['default'] = 'M'
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    cart_manager.set_pending_products(runtime.sid, [{'product_id': '101', 'product_name': runtime.products[0]['product_name'],
        'selection_index': 1, 'quantity': 1, 'size': 'L', 'toppings': ['Foam']}])
    gateway = gateway_for(runtime, 'Đổi ý rồi, trả phần này về công thức của quán giúp mình')
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'use_defaults': True},
        'CORRECTION', reference={'kind': 'pending'}))
    assert result['status'] == 'ok'
    assert runtime.writes[-1][1]['size'] == 'M' and runtime.writes[-1][1]['toppings'] == []


def test_semantic_confirmation_replays_once_through_real_loop(runtime, monkeypatch):
    fresh_action(runtime)
    confirmations = []
    def confirm(session_id, **kwargs):
        confirmations.append(kwargs)
        cart_manager.clear_cart(session_id, order_id='confirmed-owned-order')
        return {'status': 'ok', 'order_id': 'confirmed-owned-order', 'message': 'Đã đặt đơn.'}
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', confirm)
    message = 'Tất cả đã đúng như ý mình, cứ tiến hành theo bản vừa xem nhé'
    runtime.provider.plan([('customer_actions', {'actions': [{'tool': 'confirm_checkout',
        'commitment': 'AFFIRMED', 'evidence': message, 'args_json': '{}'}]})])
    result = runtime.turn(message, client_message_id='semantic-confirm-once')
    replay = runtime.turn(message, client_message_id='semantic-confirm-once')
    assert result == replay and confirmations == [{'action_id': 'synthetic-action'}]
    assert len(runtime.provider.requests) == 1


def test_unknown_semantic_write_outcome_still_requires_reconciliation(runtime, monkeypatch):
    from src.agents.tool_policy import MutationOutcomeUnknown
    def unknown(*args, **kwargs):
        raise TypeError('possible commit followed by lost response')
    monkeypatch.setattr(cart_tools, 'execute_update_cart_item', unknown)
    gateway = gateway_for(runtime)
    with pytest.raises(MutationOutcomeUnknown):
        gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 2}},
            reference={'kind': 'ordinal', 'index': 1}))


@pytest.mark.parametrize('defect,expected', [('same_turn', 'preview_required'), ('expired', 'preview_expired')])
def test_order_affirmation_keeps_later_turn_and_expiry_locks(runtime, monkeypatch, defect, expected):
    import time
    from src.agents import order_management
    preview = {'order_id': str(uuid4()), 'created_turn_id': 'preview-turn', 'expires_at': time.time() + 300,
               'kind': 'cancel_order', 'payload': {}, 'preview': {}}
    if defect == 'expired':
        preview['expires_at'] = 0
    cart_manager.set_checkout_context(runtime.sid, order_management_action=preview)
    monkeypatch.setattr(order_management, 'request', lambda *args, **kwargs: pytest.fail('unsafe order mutation'))
    gateway = gateway_for(runtime)
    if defect == 'same_turn':
        gateway.client_message_id = 'preview-turn'
    result = gateway.execute_semantic(action(gateway, 'confirm_order_change', commitment='AFFIRMED'))
    assert result['status'] == expected


def test_final_only_surface_cannot_reopen_semantic_writes(runtime):
    gateway = gateway_for(runtime)
    schemas, executors = gateway.tool_surface(final_only=True)
    assert not schemas and not executors


def test_partial_batch_reports_committed_cart_and_actual_unresolved_target(runtime):
    gateway = gateway_for(runtime)
    result = send_actions(gateway, {'actions': [
        action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}}, reference={'kind': 'ordinal', 'index': 1}),
        action(gateway, 'remove_cart_item', reference={'kind': 'id', 'value': 'invented'}),
        action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'M'}),
    ]})
    assert result['remaining_actions'] == 1 and result['changed'] is True and len(runtime.writes) == 1
    reply = gateway.artifacts.factual_fallback()
    assert '×3' in reply and 'giỏ' in reply and 'so sánh' not in reply


def test_resolved_reference_does_not_keep_an_earlier_clarification(runtime):
    gateway = gateway_for(runtime)
    gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}},
        reference={'kind': 'id', 'value': 'invented'}))
    gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}},
        reference={'kind': 'ordinal', 'index': 1}))
    reply = gateway.artifacts.factual_fallback()
    assert '×3' in reply and 'chưa xác định' not in reply


@pytest.mark.parametrize('forged_id', ['1', 'Cà Phê Alpha', 'foreign-product'])
def test_order_added_product_id_cannot_be_reinterpreted_as_ordinal_or_name(runtime, monkeypatch, forged_id):
    from src.agents import order_management
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['orders'] = [{'order_id': str(uuid4())}]
    monkeypatch.setattr(order_management, 'prepare', lambda *args, **kwargs: pytest.fail('unbound product reached order preview'))
    result = gateway.execute_semantic(action(gateway, 'update_order', {'add_items': [{'product_id': forged_id, 'quantity': 1}]},
        reference={'kind': 'singleton'}))
    assert result['status'] == 'unknown_product_reference'


def test_cached_option_question_does_not_suppress_later_selection_staging(runtime):
    gateway = gateway_for(runtime)
    read = gateway.execute_semantic(action(gateway, 'get_product_options', commitment='QUESTION', reference={'kind': 'focus'}))
    assert read['status'] == 'ok' and not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')
    selected = gateway.execute_semantic(action(gateway, 'get_product_options', reference={'kind': 'focus'}))
    assert selected['status'] == 'ok'
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'


def test_semantic_read_cache_reuses_same_query_but_not_different_facet(runtime, monkeypatch):
    from src.function_calling.tools import knowledge_tools
    reads = []
    monkeypatch.setattr(knowledge_tools, 'execute_search_knowledge_base', lambda **kwargs: (
        reads.append(kwargs) or {'status': 'ok', 'results': [{'id': 'doc', 'content': 'Description.'}]}))
    gateway = gateway_for(runtime)
    request = action(gateway, 'search_knowledge_base', {'query': 'Nội dung này', 'domain': 'product_description',
        'entity_type': 'product', 'entity_id': '101'}, 'QUESTION')
    gateway.execute_semantic(request)
    gateway.execute_semantic(request)
    assert len(reads) == 1 and gateway.read_cache_hits == 1
    result = gateway.execute_semantic({**request, 'facet': 'allergen'})
    assert len(reads) == 2 and result['status'] == 'not_found' and not result['results']


def test_location_adapter_summary_cannot_be_confirmed_in_same_turn(runtime, monkeypatch):
    from src.agents import order_flow_graph
    fresh_action(runtime)
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: {
        'reply': 'Xem lại tóm tắt', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'ok'}},
            {'tool': 'request_checkout', 'result': {'status': 'require_confirmation', 'order_summary': {'cart': {}}}},
        ]})
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'resolve_location', {'location': 'Điểm khách cung cấp', 'kind': 'poi'}))
    assert result['status'] == 'require_confirmation'
    result = gateway.execute_semantic(action(gateway, 'confirm_checkout', commitment='AFFIRMED'))
    assert result['reason'] == 'summary_prepared_this_turn' and not runtime.writes


@pytest.mark.parametrize('available', [True, False])
def test_contextual_branch_selection_keeps_inventory_authority(runtime, monkeypatch, available):
    from src.common import inventory_validation
    from src.function_calling import helpers
    from src.function_calling.tools import branch_tools
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['visible_snapshots']['branches'] = [{'branch_id': 'canonical-branch', 'branch_name': 'Quán đã hiển thị'}]
    ConversationMemory(runtime.redis).save(runtime.sid, memory)
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *args: {
        'unavailable': [] if available else ['Canonical product'], 'unverified': [],
        'available': [], 'product_statuses': [], 'is_fully_available': available})
    selections = []
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda s, b, name, **kwargs: (
        selections.append((s, b, kwargs)) or {'status': 'ok'}))
    gateway = gateway_for(runtime, 'Cứ dùng chỗ vừa giới thiệu nhé')
    result = gateway.execute_semantic(action(gateway, 'set_session_branch', reference={'kind': 'singleton'}))
    assert result['status'] == ('ok' if available else 'branch_unavailable_or_unknown')
    assert len(selections) == int(available)
    if available:
        assert selections[0] == (runtime.sid, 'canonical-branch', {'customer_selected': True})


def test_menu_category_reference_uses_server_bucket_and_canonical_id(runtime):
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['menu_categories'] = [{'category_id': 'canonical-category',
        'category_name': 'Danh mục từ Menu', 'menu_bucket': 'drink', 'display_index': 1}]
    result = gateway.execute_semantic(action(gateway, 'filter_catalog', {'search_text': ''}, 'QUESTION',
        reference={'kind': 'ordinal', 'index': 1}))
    assert result['status'] == 'ok' and not runtime.writes
    assert runtime.reads[-1][1]['category_id'] == 'canonical-category'
    assert runtime.reads[-1][1]['category'] == 'drink'


def test_compound_fulfillment_with_location_does_not_offer_a_different_profile_address(runtime, monkeypatch):
    from src.agents import order_flow_graph
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_user_profile', lambda *args: pytest.fail('new supplied origin must not select saved profile'))
    locations = []
    def resolve(state):
        locations.append(state['location_override'])
        return {'reply': 'Danh sách quán gần đây', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'need_branch_selection'}}]}
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', resolve)
    gateway = gateway_for(runtime, 'Mình ghé lấy, tìm quanh khu này giúp mình')
    result = send_actions(gateway, {'actions': [
        action(gateway, 'set_checkout_choices', {'delivery_type': 'MANG_DI'}, supplied_location=True),
        action(gateway, 'resolve_location', {'location': 'Khu vực khách cung cấp', 'kind': 'area', 'for_checkout': False}),
    ]})
    assert result['remaining_actions'] == 0 and locations[0].kind == 'area'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('profile_location_offer')


@pytest.mark.parametrize('namespace,row,key', [
    ('VOUCHER', {'ma_voucher': 'PROVIDER_CODE'}, 'voucher_code'),
    ('BRANCH', {'ma_chi_nhanh': 'provider-branch', 'ten_chi_nhanh': 'Tên quán'}, 'branch_id'),
    ('ORDER', {'ma_don_hang': 'owned-order'}, 'order_id'),
    ('MENU_CATEGORY', {'category_id': 'category', 'category_name': 'Menu', 'menu_bucket': 'drink'}, 'category_id'),
])
def test_provider_alias_focus_remains_canonical_after_memory_roundtrip(runtime, namespace, row, key):
    from src.agents.semantic_control import canonical_focus
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['focus'] = {namespace.lower(): canonical_focus(namespace, row)}
    ConversationMemory(runtime.redis).save(runtime.sid, memory)
    assert ConversationMemory(runtime.redis).load(runtime.sid)['focus'][namespace.lower()][key] == next(iter(row.values()))


@pytest.mark.parametrize('namespace,field,value', [
    ('PAYMENT', 'payment_method', 'VNPAY'), ('FULFILLMENT', 'delivery_type', 'MANG_DI'),
])
def test_current_server_choice_is_contextual_focus_without_extra_memory(runtime, namespace, field, value):
    cart_manager.set_checkout_prefs(runtime.sid, **{field: value})
    gateway = gateway_for(runtime)
    row, error = ground_reference(gateway, namespace, {'kind': 'focus'})
    assert not error and value in row.values()
