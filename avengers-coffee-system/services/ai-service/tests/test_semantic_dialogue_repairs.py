"""Dialogue formatting is distinct from business intent; tastes remain description queries."""
from copy import deepcopy
import json
import pytest

from test_description_recommendations import compatibility_runtime, runtime, descriptions
from test_semantic_control import gateway_for, action
from test_provider_outage_presentation import offline
from src.common import cart_manager
from src.agents.semantic_control import customer_actions_schema
from src.agents.tool_capabilities import CAPABILITIES


def final(kind='social', reply='Dạ, chào bạn!'):
    return {'content': json.dumps({'response_kind': kind, 'reply': reply,
        'mutation_claims': [], 'evidence_quotes': []}, ensure_ascii=False)}


def tool(g, name, args):
    return {'tool_calls': [{'id': 'fixture', 'type': 'function', 'function': {
        'name': 'customer_actions', 'arguments': json.dumps({'actions': [
            action(g, name, args, commitment='QUESTION')]}, ensure_ascii=False)}}]}


@pytest.mark.parametrize('message', ['hi', 'Hello, friend', 'Cảm ơn quán nha'])
def test_missing_kind_is_format_repair_not_forced_business_read(runtime, message):
    runtime.provider.steps = [{'content': json.dumps({'reply': 'Dạ, chào bạn!',
        'mutation_claims': [], 'evidence_quotes': []})}, final()]
    result = runtime.turn(message)
    assert result['error'] is None and result['reply'] == 'Dạ, chào bạn!'
    assert not result['tool_calls_log'] and not runtime.reads and not runtime.writes
    assert len(runtime.provider.requests) == 2
    assert runtime.provider.requests[1].get('tools')


def test_social_final_is_not_overwritten_by_incidental_cart_read(runtime):
    g = gateway_for(runtime, 'Hello there')
    runtime.provider.steps = [tool(g, 'get_cart', {}), final()]
    result = runtime.turn(g.user_message)
    assert result['reply'] == 'Dạ, chào bạn!' and result['error'] is None
    assert len(result['tool_calls_log']) == 1 and not runtime.writes


def test_format_repaired_business_question_still_requires_authority(runtime):
    text = 'Cho mình xem các thức uống hiện tại'
    g = gateway_for(runtime, text)
    runtime.provider.steps = [{'content': 'Mình đang đọc yêu cầu.'}, final('consultation', 'Có các món trong menu.'),
        tool(g, 'filter_catalog', {'category': 'drink', 'search_text': '', 'limit': 2, 'planned_discovery_reads': 1})]
    result = runtime.turn(text)
    assert result['error'] is None and result['ui_payload']['products']
    assert len(runtime.reads) == 1 and not runtime.writes
    assert runtime.provider.requests[1].get('tools')
    assert runtime.provider.requests[2].get('tools')


@pytest.mark.parametrize('criteria', [None, ''])
def test_structured_need_without_basis_uses_description_not_name(runtime, descriptions, criteria):
    text = 'hôm nay trời nóng quá bên bạn có món nào vị ngọt ngọt không nhỉ nước á'
    g = gateway_for(runtime, text)
    # Different model-supplied concepts prove this is protocol normalization,
    # not a rule tied to the wording of the reported Vietnamese request.
    runtime.provider.steps = [tool(g, 'get_recommendations', {'criteria': criteria,
        'category': 'drink', 'top_k': 5, 'preference_query': 'thanh mát, vị chua nhẹ',
        'preference_concepts': ['thanh mát', 'chua nhẹ'], 'search_text': 'chua nhẹ',
        'planned_discovery_reads': 1})]
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    result = runtime.turn(text)
    assert result['error'] is None and result['ui_payload']['products']
    assert 'thanh mát' in result['reply'] and 'chua nhẹ' in result['reply']
    assert len(runtime.provider.requests) == 1 and not runtime.writes
    assert descriptions.calls[0]['search_text'] == ''
    assert cart_manager.get_cart(runtime.sid)['items'] == before


def test_structured_family_filter_is_preserved(runtime, monkeypatch):
    from src.function_calling import tools
    seen = []
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_recommendations', lambda args, sid:
        seen.append(deepcopy(args)) or {'status': 'not_found', 'recommendation_basis': 'product_description',
                                       'products': [], 'message': 'Không đủ mô tả phù hợp.'})
    g = gateway_for(runtime, 'Please suggest something with citrus notes')
    result = g.customer_actions({'actions': [action(g, 'get_recommendations', {'category': 'all',
        'preference_query': 'citrus notes', 'preference_concepts': ['citrus'], 'search_text': 'cold brew'},
        commitment='QUESTION')]})
    assert result['remaining_actions'] == 0
    assert seen[0]['criteria'] == 'preferences' and seen[0]['search_text'] == 'cold brew'


def test_conflicting_explicit_basis_requires_repair_without_sales_fallback(runtime):
    g = gateway_for(runtime, 'Gợi ý theo nhu cầu này')
    result = g.customer_actions({'actions': [action(g, 'get_recommendations', {'category': 'all',
        'criteria': 'bestsellers', 'preference_query': 'unusual preference'}, commitment='QUESTION')]})
    assert result['recovery_kind'] == 'model_repair'
    assert result['results'][0]['result']['status'] == 'recommendation_basis_conflict'
    assert not runtime.reads and not runtime.writes


def test_failed_read_cannot_switch_operation_and_drop_need(runtime):
    g = gateway_for(runtime, 'Một nhu cầu chưa rõ')
    failed = g.customer_actions({'actions': [action(g, 'get_recommendations', {}, commitment='QUESTION')]})
    assert failed['remaining_actions'] == 1
    switched = g.customer_actions({'actions': [action(g, 'filter_catalog', {'category': 'all', 'search_text': 'something'}, commitment='QUESTION')]})
    assert switched['recovery_kind'] == 'model_repair' and not runtime.reads
    assert switched['failed_action']['tool'] == 'get_recommendations'


def test_model_schema_has_no_default_cart_example():
    from src.agents.semantic_registry import operation_registry
    descriptions = [op.schema()['function']['description'] for op in operation_registry().values()]
    assert not any('"tool":"get_cart"' in text for text in descriptions)
    assert 'semantic_recommend_by_preference' in operation_registry()


def test_reported_sweet_cool_proposal_uses_approved_descriptions(runtime, descriptions, monkeypatch):
    from test_description_recommendations import doc
    from src.rag import rag_service
    docs = [doc('101', 'Thức uống dùng lạnh, thanh mát, vị ngọt dịu.'),
            doc('102', 'Cà phê đắng, phục vụ nóng.'), doc('103', 'Bánh bơ mềm, ngọt.')]
    monkeypatch.setattr(rag_service, 'load_all_rag_data', lambda: deepcopy(docs))
    assert descriptions.service.load()['status'] == 'ok'
    text = 'hôm nay trời nóng quá bên bạn có món nào vị ngọt ngọt không nhỉ nước á'
    g = gateway_for(runtime, text)
    runtime.provider.steps = [tool(g, 'get_recommendations', {
        'top_k': 5, 'category': 'drink', 'criteria': None, 'search_text': 'ngọt',
        'preference_query': 'nước vị ngọt ngọt mát lạnh cho trời nóng',
        'preference_concepts': ['ngọt', 'mát'], 'planned_discovery_reads': 1})]
    result = runtime.turn(text)
    assert result['error'] is None and [p['product_id'] for p in result['ui_payload']['products']] == ['101']
    assert docs[0]['content'] in result['reply'] and 'bán chạy' not in result['reply']
    assert len(runtime.provider.requests) == 1 and not runtime.writes
    assert descriptions.calls[0]['search_text'] == ''


def test_format_failure_is_bounded_without_business_tools(runtime):
    runtime.provider.steps = [{'content': 'plain text'}, {'content': 'still plain text'}]
    result = runtime.turn('A new social utterance')
    assert result['error'] == 'response_evidence_required'
    assert len(runtime.provider.requests) == 2 and not result['tool_calls_log']
    assert not runtime.reads and not runtime.writes
