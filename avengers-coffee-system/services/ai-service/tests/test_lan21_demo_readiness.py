"""LAN21 demo activation, semantic authority and destructive-target safety."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import pytest

from src.agents import agent_service, agent_memory
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.tool_artifacts import ToolArtifacts
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools
from test_llm_tool_orchestrator import FakeRedis, runtime


def final_step(reply, kind='clarification', quotes=()):
    return {'content': json.dumps({'response_kind': kind, 'reply': reply,
        'mutation_claims': [], 'evidence_quotes': list(quotes)}, ensure_ascii=False)}


def test_normal_demo_configuration_defaults_to_llm_tools():
    root = Path(__file__).resolve().parents[4]
    assert 'AI_CHAT_ORCHESTRATOR_MODE: ${AI_CHAT_ORCHESTRATOR_MODE:-llm_tools}' in (root / 'docker-compose.yml').read_text()
    assert 'AI_CHAT_ORCHESTRATOR_MODE=llm_tools' in (root / '.env.example').read_text()


def test_configured_demo_mode_uses_llm_tools_and_explicit_legacy_still_rolls_back(monkeypatch):
    from src.agents import llm_tool_orchestrator
    from src.agents import order_flow_graph
    monkeypatch.setenv('AI_CHAT_ORCHESTRATOR_MODE', 'llm_tools')
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn',
        lambda *args, **kwargs: {'reply': 'new-path'})
    assert agent_service.run_agent('s', 'request')['reply'] == 'new-path'
    monkeypatch.setenv('AI_CHAT_ORCHESTRATOR_MODE', 'legacy')
    monkeypatch.setattr(order_flow_graph, 'run_order_flow', lambda *args, **kwargs: {'reply': 'rollback'})
    assert agent_service.run_agent('s', 'request')['reply'] == 'rollback'


def test_explicit_agent_provider_is_selected_before_compatible_fallback(monkeypatch):
    clients = [SimpleNamespace(base_url='https://generativelanguage.googleapis.com/v1beta/openai/'),
               SimpleNamespace(base_url='https://api.openai.com/v1')]
    monkeypatch.setattr(groq_service, '_llm_clients', clients)
    monkeypatch.setattr(groq_service, '_get_groq_client', lambda: clients[0])
    selected = groq_service._agent_client_sequence('openai')
    assert groq_service._client_provider(selected[0]) == 'openai'
    assert groq_service._client_provider(selected[1]) == 'gemini'
    assert groq_service._agent_client_sequence('groq') == []


@pytest.mark.parametrize('wrapper', [groq_service.OpenAICompletions, groq_service.GeminiCompletions])
def test_agent_provider_wrappers_honor_explicit_model(monkeypatch, wrapper):
    import requests
    captured = {}
    class Response:
        ok = True
        def json(self):
            return {'choices': [{'message': {'content': '{}'}}]}
    def post(_url, **kwargs):
        captured.update(kwargs['json'])
        return Response()
    monkeypatch.setattr(requests, 'post', post)
    wrapper('fixture-key').create(model='qualified-model', messages=[])
    assert captured['model'] == 'qualified-model'


def test_social_and_meta_turns_need_no_business_tool(runtime):
    runtime.provider.steps = [final_step('Chào bạn, mình có thể giúp gì?', 'social')]
    social = runtime.turn('hi chào bạn')
    assert not social['tool_calls_log'] and not runtime.writes
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['recent_turns'].append({'role': 'assistant', 'content': 'Một thông báo kinh doanh không liên quan.'})
    ConversationMemory(runtime.redis).save(runtime.sid, memory)
    runtime.provider.steps = [final_step('Bạn nói đúng, thông tin trước đó không liên quan đến câu hỏi của bạn.')]
    challenged = runtime.turn('sao nói mã giảm giá làm gì vậy')
    assert not challenged['tool_calls_log'] and not runtime.writes


def test_legacy_stale_voucher_notice_is_deferred_until_relevant_turn(monkeypatch):
    from src.agents.order_flow_graph import _render
    sid = 'lan21-voucher-notice'
    cart_manager.set_checkout_context(sid, voucher_invalidated='SYNTHETIC-V')
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart',
        lambda _sid: {**cart_manager.get_cart(_sid), 'authoritative': True})
    state = {'session_id': sid, 'user_message': 'hi chào bạn', 'history': [],
        'cart': cart_manager.get_cart(sid), 'intent': {'intent': 'GENERAL_CHAT'},
        'result': {'reply': 'Xin chào.', 'tool_calls_log': [], 'checkout_payload': None}}
    social = _render(state)['result']
    assert 'SYNTHETIC-V' not in social['reply']
    assert cart_manager.get_checkout_prefs(sid)['voucher_invalidated'] == 'SYNTHETIC-V'
    relevant = _render({**state, 'intent': {'intent': 'VIEW_CART'}})['result']
    assert 'SYNTHETIC-V' in relevant['reply']
    assert cart_manager.get_checkout_prefs(sid).get('voucher_invalidated') is None


def test_broad_discovery_and_static_facets_reject_review_authority(runtime):
    runtime.provider.plan([('get_product_insights', {'product_name': 'bánh'})])
    broad = runtime.turn('có bánh gì ngon?')
    assert broad['tool_calls_log'][0]['result']['status'] in {'wrong_authority', 'requires_product'}
    runtime.provider.plan([('get_product_insights', {'product_name': 'Cà Phê Alpha'})])
    taste = runtime.turn('Cà Phê Alpha có vị thế nào?')
    assert taste['tool_calls_log'][0]['result']['status'] == 'wrong_authority'
    runtime.provider.plan([('get_product_insights', {'product_name': 'Cà Phê Alpha'})])
    review = runtime.turn('khách hàng review Cà Phê Alpha thế nào?')
    assert review['tool_calls_log'][0]['result']['status'] == 'ok'


def test_unsupported_consultation_forces_one_authoritative_tool_repair(runtime):
    runtime.provider.steps = [final_step('Mình nhớ có vài món phù hợp.', 'consultation'),
        {'tool_calls': [{'id': 'repair', 'type': 'function', 'function': {
            'name': 'filter_catalog', 'arguments': json.dumps({
                'category': 'food', 'search_text': '', 'limit': 2})}}]},
        final_step('Mình đã tìm được món phù hợp.', 'consultation')]
    result = runtime.turn('gợi ý món ăn')
    assert result['tool_calls_log'][0]['tool'] == 'filter_catalog'
    assert runtime.provider.requests[1]['tool_choice'] == 'required'


def test_current_broad_catalog_request_cannot_inherit_old_category(runtime):
    runtime.provider.plan([('filter_catalog', {
        'category': 'drink', 'search_text': '', 'max_price': 70000,
        'sort_by': 'price_desc', 'limit': 3})])
    result = runtime.turn('cho tôi 3 món giá dưới 70 nghìn, từ đắt đến rẻ')
    assert runtime.reads[-1][1]['category'] == 'all'
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['103', '102', '101']


def test_price_question_rejects_rag_as_dynamic_authority(runtime):
    from test_checkout_guarded_contract import gateway
    runtime.provider.plan([('get_product_description', {'product_id': '101', 'query': 'giá hiện tại'})])
    result = runtime.turn('Cà Phê Alpha giá bao nhiêu?')
    assert not result['tool_calls_log'] and not runtime.writes  # Capability is not exposed during cart consultation.
    denied = gateway(runtime, 'Cà Phê Alpha giá bao nhiêu?', filtered=False).dispatch(
        'get_product_description', {'product_id': '101', 'query': 'giá hiện tại'})
    assert denied['status'] == 'wrong_authority' and denied['allowed_tools'] == ['check_price_and_stock']


def test_explicit_cart_ordinal_overrides_internally_consistent_wrong_proposal(runtime):
    runtime.provider.plan([('update_cart_item', {'cart_item_id': '801', 'cart_line_ordinal': 2,
        'desired_state': {'quantity': 2}})])
    result = runtime.turn('tăng số lượng dòng 1 lên 2')
    assert result['tool_calls_log'][0]['result']['status'] == 'cart_reference_conflict'
    assert not runtime.writes


def test_natural_cart_line_noun_uses_same_ordinal_safety_namespace(runtime):
    runtime.provider.plan([('update_cart_item', {'cart_item_id': '801', 'cart_line_ordinal': 2,
        'desired_state': {'toppings': ['Foam']}})])
    result = runtime.turn('ly đầu đổi topping sang Foam')
    assert result['tool_calls_log'][0]['result']['status'] == 'cart_reference_conflict'
    assert not runtime.writes


def test_named_cart_target_mismatch_is_rejected(runtime):
    runtime.provider.plan([('remove_cart_item', {'cart_item_id': '801'})])
    result = runtime.turn('xóa Cà Phê Alpha khỏi giỏ')
    assert result['tool_calls_log'][0]['result']['status'] == 'cart_reference_conflict'
    assert not runtime.writes


def test_duplicate_named_cart_target_requires_clarification(runtime):
    rows = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    duplicate = {**rows[0], 'id': 802, 'cart_item_id': '802', 'line_id': '802',
                 'size': 'L', 'toppings': ['Foam']}
    cart_manager.replace_items_from_order_cart(runtime.sid, [rows[0], duplicate])
    runtime.provider.plan([('update_cart_item', {'cart_item_id': '800',
        'desired_state': {'quantity': 2}})])
    result = runtime.turn('tăng Cà Phê Alpha lên 2 ly')
    assert result['tool_calls_log'][0]['result']['status'] == 'ambiguous_cart_target'
    assert not runtime.writes


def test_corrected_explicit_cart_target_writes_exactly_once(runtime):
    runtime.provider.plan([('update_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1,
        'desired_state': {'quantity': 2}})], claims=['update_cart_item'])
    result = runtime.turn('tăng số lượng dòng 1 lên 2')
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(runtime.writes) == 1 and runtime.writes[0][1] == '800'


def test_explicit_cart_quantity_repair_uses_current_customer_number(runtime):
    runtime.provider.steps = [
        {'tool_calls': [{'id': 'wrong', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '801',
                'cart_line_ordinal': 2, 'desired_state': {'quantity': 4}})}}]},
        {'tool_calls': [{'id': 'correct', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '801',
                'cart_line_ordinal': 2, 'desired_state': {'quantity': 2}})}}]},
        final_step('Đã cập nhật hai ly.', 'action')]
    result = runtime.turn('dòng thứ hai trong giỏ cho tôi hai ly nhé')
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['cart_quantity_conflict', 'ok']
    assert len(runtime.writes) == 1 and runtime.writes[0][2]['quantity'] == 2


def test_current_exact_product_name_can_recover_outside_visible_snapshot(runtime):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['visible_snapshots'] = {'products': [runtime.products[0]]}
    memory['focus'] = {'product': runtime.products[0]}
    ConversationMemory(runtime.redis).save(runtime.sid, memory)
    runtime.provider.plan([('add_to_cart', {'product_id': '102', 'quantity': 1,
        'size': 'M', 'toppings': ['Pearl']})], claims=['add_to_cart'])
    result = runtime.turn('thêm một ly Cà Phê Beta size M topping Pearl')
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['product_id'] == '102'


def test_pending_quantity_conflict_is_denied_then_corrected_once(runtime):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    cart_manager.set_pending_products(runtime.sid, [{'product_id': '101',
        'product_name': 'Cà Phê Alpha', 'quantity': 2}], merge=False)
    runtime.provider.steps = [
        {'tool_calls': [{'id': 'wrong', 'type': 'function', 'function': {
            'name': 'add_to_cart', 'arguments': json.dumps({'product_id': '101',
                'quantity': 1, 'size': 'L', 'toppings': ['Foam']})}}]},
        {'tool_calls': [{'id': 'correct', 'type': 'function', 'function': {
            'name': 'add_to_cart', 'arguments': json.dumps({'product_id': '101',
                'quantity': 2, 'size': 'L', 'toppings': ['Foam']})}}]},
        final_step('Đã thêm hai ly.', 'action')]
    result = runtime.turn('hai ly đó size L, topping Foam')
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['pending_quantity_conflict', 'ok']
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['quantity'] == 2


def test_cart_edit_cannot_recover_by_switching_to_add(runtime):
    runtime.provider.steps = [
        {'tool_calls': [{'id': 'wrong-edit', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '801',
                'cart_line_ordinal': 2, 'desired_state': {'quantity': 2}})}}]},
        {'tool_calls': [{'id': 'wrong-operation', 'type': 'function', 'function': {
            'name': 'add_to_cart', 'arguments': json.dumps({'product_id': '101', 'quantity': 2})}}]},
        {'tool_calls': [{'id': 'correct-edit', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '800',
                'cart_line_ordinal': 1, 'desired_state': {'quantity': 2}})}}]},
        final_step('Đã cập nhật dòng đầu.', 'action')]
    result = runtime.turn('tăng dòng 1 lên 2 ly')
    assert [row['result']['status'] for row in result['tool_calls_log']] == [
        'cart_reference_conflict', 'ok']  # Invalid add proposal is rejected before execution.
    assert 'add_to_cart' not in {row['function']['name'] for row in runtime.provider.requests[1]['tools']}
    assert len(runtime.writes) == 1 and runtime.writes[0][0] == 'update'
    assert runtime.provider.requests[1]['tool_choice'] == 'required'


def test_successful_required_repair_forces_final_without_another_tool(runtime):
    runtime.provider.steps = [
        {'tool_calls': [{'id': 'wrong', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '801',
                'desired_state': {'toppings': ['Foam']}})}}]},
        {'tool_calls': [{'id': 'correct', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '800',
                'cart_line_ordinal': 1, 'desired_state': {'toppings': ['Foam']}})}}]},
        final_step('Dòng đầu đã có topping Foam.', 'action')]
    result = runtime.turn('ly đầu đổi topping sang Foam đi')
    assert [row['result']['status'] for row in result['tool_calls_log']] == [
        'cart_reference_conflict', 'ok']
    assert 'tools' not in runtime.provider.requests[-1]
    assert len(runtime.writes) == 1 and runtime.writes[0][0] == 'update'


def test_read_success_cannot_complete_required_write_repair(runtime):
    runtime.provider.steps = [
        {'tool_calls': [{'id': 'wrong', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '801',
                'desired_state': {'quantity': 2}})}}]},
        {'tool_calls': [{'id': 'read', 'type': 'function', 'function': {
            'name': 'get_cart', 'arguments': '{}'}}]},
        {'tool_calls': [{'id': 'correct', 'type': 'function', 'function': {
            'name': 'update_cart_item', 'arguments': json.dumps({'cart_item_id': '800',
                'cart_line_ordinal': 1, 'desired_state': {'quantity': 2}})}}]},
        final_step('Đã cập nhật dòng đầu.', 'action')]
    result = runtime.turn('tăng dòng 1 lên 2 ly')
    assert [row['tool'] for row in result['tool_calls_log']] == [
        'update_cart_item', 'get_cart', 'update_cart_item']
    assert 'tools' in runtime.provider.requests[2]
    assert 'tools' not in runtime.provider.requests[-1]
    assert len(runtime.writes) == 1 and runtime.writes[0][0] == 'update'


def test_explicit_checkout_choice_corrects_model_semantic_mismatch(runtime):
    runtime.provider.plan([('set_checkout_choices', {
        'delivery_type': 'TAI_CHO', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'})])
    result = runtime.turn('lấy tại quán và trả tiền mặt')
    recorded = result['tool_calls_log'][0]['result']
    assert recorded['status'] == 'ok'
    assert recorded['choices']['delivery_type'] == 'MANG_DI'
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'MANG_DI'


def test_unrelated_success_does_not_mask_denied_checkout_choice_repair():
    artifact = ToolArtifacts({})
    artifact.collect('skip_voucher', {}, {'status': 'ok'})
    artifact.collect('set_checkout_choices', {}, {'status': 'checkout_choice_conflict'})
    artifact.collect('ask_branch', {}, {'status': 'ok', 'branches': [{'branch_id': 'b'}]})
    raw = json.dumps({'response_kind': 'action', 'reply': 'Continue',
        'mutation_claims': [], 'evidence_quotes': []})
    assert 'set_checkout_choices' in artifact.response_issue(raw)
    artifact.collect('set_checkout_choices', {}, {'status': 'ok'})
    assert artifact.response_issue(raw) is None


def test_grounded_normal_rag_keeps_natural_answer_but_generic_filler_falls_back():
    evidence = 'Hương vị dịu, thơm nhẹ và ít đắng.'
    quote = {'document_id': 'doc', 'quote': evidence}
    artifact = ToolArtifacts({}, 'Món này có vị thế nào?')
    artifact.collect('search_knowledge_base', {}, {'status': 'ok',
        'results': [{'id': 'doc', 'content': evidence}]})
    natural = artifact.validate_reply(json.dumps({'reply': 'Món có vị dịu và thơm nhẹ.',
        'mutation_claims': [], 'evidence_quotes': [quote]}, ensure_ascii=False))
    assert natural == 'Món có vị dịu và thơm nhẹ.'
    generic = artifact.validate_reply(json.dumps({'reply': 'Mình đã tìm thấy kết quả.',
        'mutation_claims': [], 'evidence_quotes': [quote]}, ensure_ascii=False))
    assert evidence in generic


def test_checkout_summary_evidence_allows_natural_non_order_reply():
    artifact = ToolArtifacts({})
    artifact.collect('request_checkout', {}, {'status': 'require_confirmation',
        'order_summary': {'final_total': 30000}})
    reply = artifact.validate_reply(json.dumps({'response_kind': 'action',
        'reply': 'Tóm tắt đơn đã sẵn sàng để bạn xem và xác nhận.',
        'mutation_claims': ['request_checkout'], 'evidence_quotes': []}, ensure_ascii=False))
    assert reply == 'Tóm tắt đơn đã sẵn sàng để bạn xem và xác nhận.'


def test_pending_confirmation_cart_reads_require_canonical_summary_rerender():
    artifact = ToolArtifacts({}, 'show the order again', {
        'business': {'pending': {'type': 'confirm_checkout'}, 'pending_products': []}})
    artifact.collect('get_cart_quote', {}, {'status': 'ok', 'quote': {'final_total': 30000}})
    artifact.collect('get_cart', {}, {'status': 'ok', 'cart': {'items': []}})
    raw = json.dumps({'response_kind': 'consultation', 'reply': 'Order summary',
        'mutation_claims': [], 'evidence_quotes': []})
    assert artifact.response_issue(raw).startswith('TOOL_REQUIRED:')
    artifact.collect('request_checkout', {'reuse_summary': True}, {
        'status': 'require_confirmation', 'order_summary': {'final_total': 30000}})
    assert artifact.response_issue(raw) is None


def test_redis_conversations_are_isolated_while_customer_cart_owner_is_shared():
    redis = FakeRedis()
    store = ConversationMemory(redis)
    customer = 'customer-21'
    first, second = customer + ':conversation:a', customer + ':conversation:b'
    store.save(first, {**empty_memory(), 'focus': {'product': {
        'product_id': '101', 'product_name': 'Alpha', 'source': 'catalog'}}})
    assert store.load(first)['focus']['product']['product_id'] == '101'
    assert not store.load(second)['focus']
    assert cart_tools._customer_session_id(first) == cart_tools._customer_session_id(second) == customer
