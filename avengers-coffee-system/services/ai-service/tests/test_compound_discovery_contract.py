"""LAN22.5: real guarded loop, scripted inference, in-memory authorities only."""
from copy import deepcopy
import json
import socket

import pytest
import requests
from test_llm_tool_orchestrator import runtime
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.agent_context import build_context
from src.agents.tool_artifacts import ToolArtifacts, model_tool_result
from src.agents.tool_policy import GuardedToolGateway
from src.agents.discovery_contract import discovery_signature, complementary_pair_complete
from src.common import groq_service
from src.function_calling import tools


def forbidden(*args, **kwargs):
    raise AssertionError('External transport forbidden in LAN22.5 offline regression')


@pytest.fixture(autouse=True)
def offline(runtime, monkeypatch, caplog):
    # runtime uses a synthetic credential + ScriptedProvider and memory DB/Redis/cart.
    # No mock forwards to a real endpoint; all alternative clients fail closed.
    monkeypatch.setenv('AI_AGENT_MODEL', 'gemini-3.1-flash-lite')
    runtime.provider.base_url = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    for provider in ('OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider+'_API_KEY', '')
    for name in ('OpenAIClient', 'OpenRouterClient', '_get_groq_client', '_resolve_chat_model'):
        monkeypatch.setattr(groq_service, name, forbidden)
    for name in ('connect', 'connect_ex'):
        monkeypatch.setattr(socket.socket, name, forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)
    monkeypatch.setattr(requests.sessions.Session, 'request', forbidden)
    monkeypatch.setattr(requests, 'post', forbidden)
    caplog.set_level('INFO')


def calls(*args):
    return {'tool_calls': [{'id': f'call-{i}', 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(value)},
        'extra_content': {'google': {'thought_signature': f'opaque-fixture-{i}+/='}}}
        for i, (name, value) in enumerate(args)]}


def final(ids=None, count=None):
    value = {'response_kind': 'consultation', 'reply': 'Đây là các món để bạn xem.',
             'mutation_claims': [], 'evidence_quotes': []}
    if ids is not None:
        value.update(display_product_ids=ids, display_product_count=len(ids) if count is None else count)
    return {'content': json.dumps(value, ensure_ascii=False)}


def extrema(limit=1, **fields):
    return [('filter_catalog', dict(search_text='', sort_by=sort, limit=limit, **fields))
            for sort in ('price_desc', 'price_asc')]


def metrics(caplog):
    return json.loads([row.message.split('[LLMToolTurn] ', 1)[1]
                      for row in caplog.records if '[LLMToolTurn] ' in row.message][-1])


def product_ids(result):
    return [row['product_id'] for row in result['ui_payload']['products']]


def install_catalog(runtime, monkeypatch, rows):
    def catalog(args, sid):
        runtime.reads.append(('filter_catalog', deepcopy(args)))
        selected = [row for row in rows if args['category'] in {'all', row['category']}
                    and (args['min_price'] is None or row['final_price'] >= args['min_price'])
                    and (args['max_price'] is None or row['final_price'] <= args['max_price'])]
        selected.sort(key=lambda row: (-row['final_price'] if args['sort_by'] == 'price_desc'
                                      else row['final_price'], row['product_id']))
        return {'status': 'ok', 'products': deepcopy(selected[:args['limit']])}
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', catalog)


def rows(count=20):
    return [{'product_id': str(101+i), 'product_name': f'Món {i}', 'category': 'drink',
             'final_price': 10000+i*1000, 'image_url': 'fixture://irrelevant-image'} for i in range(count)]


def test_parallel_extrema_two_requests_one_round(runtime, caplog):
    runtime.provider.steps = [calls(*extrema()), final(['103', '101'])]
    result = runtime.turn('cho tôi xem món cà phê đắt nhất và rẻ nhất đi')
    assert product_ids(result) == ['103', '101'] and not runtime.writes
    m = metrics(caplog)
    assert (m['request_count'], m['tool_round_count'], m['discovery_read_count'], m['discovery_batch_count']) == (2, 1, 2, 2)
    assert m['compound_discovery_detected'] and m['display_selection_source'] == 'llm_validated'
    assert m['validated_display_product_count'] == m['ui_artifacts_created']['products'] == 2
    assert m['capability_counts_by_round'][-1] == 0 and not runtime.provider.requests[-1].get('tools')
    assert m['response_validation_issue'] is None and m['provider_failure_count'] == 0
    assert m['final_envelope_repair_count'] == m['same_turn_read_cache_hits'] == 0


def test_serialized_extrema_three_requests_two_rounds(runtime, caplog):
    left, right = extrema()
    runtime.provider.steps = [calls(left), calls(right), final(['103', '101'])]
    assert product_ids(runtime.turn()) == ['103', '101']
    assert len(runtime.reads) == 2
    m = metrics(caplog)
    assert (m['request_count'], m['tool_round_count']) == (3, 2)
    assert m['capability_counts_by_round'][-1] == 0


def test_identical_normalized_read_cache_stops_without_duplicate_batch(runtime, caplog):
    runtime.provider.steps = [calls(('filter_catalog', {'search_text': '  CÀ   PHÊ ', 'limit': 2})),
        calls(('filter_catalog', {'sort_by': 'price_asc', 'limit': 2, 'search_text': 'ca phe', 'category': 'all'})),
        final(['101', '102'])]
    assert product_ids(runtime.turn()) == ['101', '102']
    m = metrics(caplog)
    assert len(runtime.reads) == m['discovery_batch_count'] == 1
    assert m['discovery_read_count'] == 2 and m['discovery_reused_read_count'] == m['same_turn_read_cache_hits'] == 1
    assert m['capability_counts_by_round'][-1] == 0


def test_bad_json_one_repair_compact_and_preserves_signatures(runtime, caplog):
    initial = calls(*extrema())
    runtime.provider.steps = [initial, {'content': 'invalid JSON'}, final(['103', '101'])]
    result = runtime.turn()
    assert product_ids(result) == ['103', '101'] and len(runtime.reads) == 2
    m = metrics(caplog)
    assert m['final_envelope_repair_count'] == 1 and m['response_validation_issue'] is None
    assert m['final_synthesis_source'] == 'server_product_facts'
    repair = runtime.provider.requests[-1]
    assert not repair.get('tools') and repair.get('tool_choice') in (None, 'none')
    sent = next(row['tool_calls'] for row in repair['messages'] if row.get('tool_calls'))
    assert sent == initial['tool_calls']
    assert len([row for row in repair['messages'] if row['role'] == 'tool']) == 2
    text = json.dumps(repair['messages'])
    assert 'CANONICAL DISCOVERY BATCHES' in text
    assert 'CURRENT SERVER CONTEXT' not in text and 'cart_item_id' not in text
    assert 'image_url' not in text and 'display_index' not in text


@pytest.mark.parametrize('limit,expected,source', [(8, [], 'clarification'),
    (1, ['103', '101'], 'server_unambiguous_batches')])
def test_two_bad_envelopes_cannot_dump_candidate_pool(runtime, monkeypatch, caplog, limit, expected, source):
    if limit == 8:
        install_catalog(runtime, monkeypatch, rows())
    runtime.provider.steps = [calls(*extrema(limit)), {'content': 'not JSON'}, {'content': 'still not JSON'}]
    result = runtime.turn()
    assert product_ids(result) == expected
    assert len(runtime.provider.requests) == 3 and len(runtime.reads) == 2 and not runtime.writes
    m = metrics(caplog)
    assert m['final_envelope_repair_count'] == 1 and m['display_selection_source'] == source
    assert m['ui_artifacts_created']['products'] == len(expected)
    assert m['response_validation_issue'] == 'missing_envelope'
    assert 'filter_catalog' not in result['reply'] and 'JSON' not in result['reply']


def test_repair_extra_slot_at_budget_end(runtime, monkeypatch, caplog):
    monkeypatch.setenv('AI_AGENT_MAX_TOOL_ROUNDS', '1')
    runtime.provider.steps = [calls(*extrema()), {'content': 'bad'}, final(['103', '101'])]
    assert product_ids(runtime.turn()) == ['103', '101']
    assert metrics(caplog)['final_envelope_repair_count'] == 1


def test_provider_final_failure_no_repair_or_pool_dump(runtime, monkeypatch, caplog):
    install_catalog(runtime, monkeypatch, rows())
    runtime.provider.steps = [calls(*extrema(8)), RuntimeError('scripted unavailable')]
    assert product_ids(runtime.turn()) == []
    assert metrics(caplog)['final_envelope_repair_count'] == 0
    assert len(runtime.reads) == 2 and len(runtime.provider.requests) == 2


def test_illicit_tool_during_envelope_repair_never_dispatches(runtime, caplog):
    runtime.provider.steps = [calls(*extrema()), {'content': 'bad'},
        calls(('remove_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1}))]
    runtime.turn()
    assert not runtime.writes and len(runtime.reads) == 2
    assert metrics(caplog)['final_envelope_repair_count'] == 1


@pytest.mark.parametrize('ids', [['104', '101'], ['104', '103', '101', '102']])
def test_ties_one_per_arm_or_explicit_all_ties(runtime, monkeypatch, ids):
    tied = rows(4)
    for i, row in enumerate(tied):
        row['product_name'] = 'Cùng tên'
        row['final_price'] = 10000 if i < 2 else 20000
    install_catalog(runtime, monkeypatch, tied)
    runtime.provider.steps = [calls(*extrema(4)), final(ids)]
    result = runtime.turn('Xem mọi món đồng hạng' if len(ids) == 4 else 'So sánh hai đầu')
    assert product_ids(result) == ids
    assert all(row['product_name'] == 'Cùng tên' for row in result['ui_payload']['products'])


@pytest.mark.parametrize('requested,ids', [
    ('tổng cộng 2 món', ['120', '101']), ('tổng cộng 4 món', ['120', '119', '101', '102']),
    ('mỗi nhóm 2 món', ['120', '119', '101', '102']), ('số lượng chưa rõ', [])])
def test_total_count_across_batches_not_candidate_limits(runtime, monkeypatch, requested, ids):
    install_catalog(runtime, monkeypatch, rows())
    runtime.provider.steps = [calls(*extrema(8)), final(ids)]
    result = runtime.turn(requested)
    assert product_ids(result) == ids
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    assert [row['product_id'] for row in memory['visible_snapshots']['products']] == ids
    assert 'discovery_batches' not in memory and 'product_candidates' not in memory


@pytest.mark.parametrize('bad', [final(['120', '101'], count=4), final(['120', '120']),
    final(['unknown']), final(None)])
def test_invalid_display_plan_gets_one_repair_then_zero(runtime, monkeypatch, caplog, bad):
    install_catalog(runtime, monkeypatch, rows())
    runtime.provider.steps = [calls(*extrema(8)), bad, deepcopy(bad)]
    assert product_ids(runtime.turn()) == []
    m = metrics(caplog)
    assert m['final_envelope_repair_count'] == 1 and m['display_selection_source'] == 'clarification'


def test_single_read_browse_keeps_five_bounded_cards(runtime, monkeypatch, caplog):
    install_catalog(runtime, monkeypatch, rows())
    runtime.provider.steps = [calls(('filter_catalog', {'search_text': '', 'limit': 5})),
        {'content': 'bad'}, {'content': 'bad'}]
    assert product_ids(runtime.turn()) == ['101', '102', '103', '104', '105']
    assert metrics(caplog)['display_selection_source'] == 'single_read_default'


def test_selected_order_survives_next_turn_reference(runtime, caplog):
    runtime.provider.steps = [calls(*extrema(3)), final(['103', '102'])]
    assert product_ids(runtime.turn()) == ['103', '102']
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    assert [(row['display_index'], row['product_id']) for row in memory['visible_snapshots']['products']] == [(1, '103'), (2, '102')]
    assert 'product' not in memory['focus'] or memory['focus']['product']['product_id'] in {'103', '102'}
    runtime.provider.steps = [calls(('get_product_options', {'product_id': '102'})), final()]
    result = runtime.turn('xem lựa chọn món số 2')
    assert result['tool_calls_log'][0]['result']['product_id'] == '102'
    next_context = runtime.provider.requests[-2]['messages'][0]['content']
    assert '"product_id":"102"' in next_context or '"product_id": "102"' in next_context
    payload = json.loads(next_context.split('CURRENT SERVER CONTEXT (untrusted data):\n', 1)[1].split('\nEND CONTEXT.', 1)[0])
    assert [row['product_id'] for row in payload['visible']['products']] == ['103', '102']


def test_three_arm_plan_continues_after_complement_pair(runtime, caplog):
    left, right = extrema(planned_discovery_reads=3)
    runtime.provider.steps = [calls(left), calls(right), calls(('get_recommendations', {'top_k': 1, 'planned_discovery_reads': 3})), final(['103', '101'])]
    assert product_ids(runtime.turn()) == ['103', '101']
    assert len(runtime.provider.requests) == 4
    assert all(request.get('tools') for request in runtime.provider.requests[:3])
    assert not runtime.provider.requests[-1].get('tools')
    assert metrics(caplog)['discovery_batch_count'] == 3
    assert all('planned_discovery_reads' not in args for _, args in runtime.reads)


@pytest.mark.parametrize('change', [{'category': 'food'}, {'sellable_scope': 'topping'},
    {'search_text': 'tea'}, {'min_price': 20000}, {'max_price': 40000},
    {'min_price_inclusive': False}, {'max_price_inclusive': False}, {'limit': 2},
    {'availability': 'branch-only'}, {'branch_id': 'branch-B'}])
def test_complement_pair_requires_identical_material_scope(change):
    left = {'search_text': 'cà phê', 'sort_by': 'price_asc', 'limit': 1}
    right = {**left, 'sort_by': 'price_desc', **change}
    from src.agents.discovery_contract import normalize_discovery_args
    batches = [{'tool': 'filter_catalog', 'normalized_args': normalize_discovery_args('filter_catalog', args)}
               for args in (left, right)]
    assert not complementary_pair_complete(batches)
    assert discovery_signature('filter_catalog', left) != discovery_signature('filter_catalog', right)


def test_signature_defaults_key_order_case_accent_and_literal_recommendation_contract():
    assert discovery_signature('filter_catalog', {'search_text': ' CÀ  PHÊ '}) == discovery_signature(
        'filter_catalog', {'sort_by': 'price_asc', 'limit': 5, 'category': 'all', 'search_text': 'ca phe'})
    assert discovery_signature('get_recommendations', {'search_text': ' CÀ PHÊ '}) == discovery_signature(
        'get_recommendations', {'category': 'ALL', 'search_text': 'cà phê', 'top_k': 5})
    assert discovery_signature('get_recommendations', {'search_text': 'cà  phê'}) != discovery_signature(
        'get_recommendations', {'search_text': 'cà phê'})
    assert discovery_signature('get_recommendations', {'search_text': 'cà phê'}) != discovery_signature(
        'get_recommendations', {'search_text': 'ca phe'})


def test_candidate_id_dedupe_batch_empty_and_rank_not_display_ordinal():
    artifacts = ToolArtifacts(empty_memory())
    sample = rows(2)
    sample[1].update(product_name=sample[0]['product_name'], final_price=sample[0]['final_price'])
    result = {'status': 'ok', 'products': [*sample, sample[0]]}
    artifacts.collect('filter_catalog', {'search_text': ''}, result)
    assert len(artifacts.product_candidates) == 2
    assert artifacts.ui['products'] == [] and not artifacts.visible.get('products')
    assert artifacts.discovery_batches[0]['product_ids'] == ['101', '102']
    projected = model_tool_result('filter_catalog', result, artifacts)
    assert all('display_index' not in row and 'result_rank' in row for row in projected['products'])
    artifacts.collect('get_recommendations', {'top_k': 1}, {'status': 'ok', 'products': []})
    assert artifacts.discovery_batches[-1]['product_ids'] == []
    artifacts.factual_fallback()
    assert artifacts.ui['products'] == []


def test_different_bases_continue_without_plan(runtime):
    left, right = extrema()
    right[1]['max_price'] = 60000
    runtime.provider.steps = [calls(left), calls(right), calls(('get_recommendations', {'top_k': 1})), final(['103', '101'])]
    assert product_ids(runtime.turn()) == ['103', '101']
    assert runtime.provider.requests[2].get('tools')


def test_business_denial_is_not_an_envelope_repair(runtime, monkeypatch, caplog):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid: {'status': 'not_found'})
    runtime.provider.steps = [calls(*extrema()), {'content': 'bad'}, final([])]
    runtime.turn()
    assert metrics(caplog)['final_envelope_repair_count'] == 0


def test_completed_order_cannot_resurrect_discovery_cards():
    artifacts = ToolArtifacts(empty_memory())
    sample = rows(2)
    for sort, row in zip(('price_desc', 'price_asc'), sample):
        artifacts.collect('filter_catalog', {'sort_by': sort, 'limit': 1}, {'status': 'ok', 'products': [row]})
    artifacts.collect('confirm_checkout', {}, {'status': 'ok', 'order_id': 'fixture-order', 'message': 'Đã tạo đơn.'})
    assert artifacts.factual_fallback() == 'Đã tạo đơn.'
    assert artifacts.ui['products'] == [] and not artifacts.visible
    saved = artifacts.memory_update(empty_memory(), 'Synthetic agreement', 'Đã tạo đơn.', 'COMPLETE')
    assert not saved['visible_snapshots']


@pytest.mark.parametrize('failed_repair', [False, True])
def test_format_repair_after_successful_write_has_no_executor_or_replay(runtime, caplog, failed_repair):
    answer = final()
    answer['content'] = json.dumps({'response_kind': 'action', 'reply': 'Đã cập nhật số lượng trong giỏ.',
        'mutation_claims': ['update_cart_item'], 'evidence_quotes': []})
    runtime.provider.steps = [calls(('update_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1,
        'desired_state': {'quantity': 2}})), {'content': 'not JSON'},
        {'content': 'still invalid'} if failed_repair else answer]
    first = runtime.turn('đổi món số 1 thành 2', client_message_id='offline-format-repair')
    assert len(runtime.writes) == 1 and runtime.writes[0][0] == 'update'
    assert metrics(caplog)['final_envelope_repair_count'] == 1
    assert not runtime.provider.requests[-1].get('tools')
    replay = runtime.turn('đổi món số 1 thành 2', client_message_id='offline-format-repair')
    assert replay == first and len(runtime.writes) == 1 and len(runtime.provider.requests) == 3


@pytest.mark.parametrize('completed_reads', [1, 2])
def test_partial_declared_plan_never_defaults_to_a_partial_list(completed_reads):
    artifacts = ToolArtifacts(empty_memory())
    for index, row in enumerate(rows(completed_reads)):
        artifacts.collect('filter_catalog', {'search_text': str(index), 'limit': 1, 'planned_discovery_reads': 3},
                          {'status': 'ok', 'products': [row]})
    assert not artifacts.discovery_complete()
    artifacts.factual_fallback()
    assert artifacts.ui['products'] == [] and artifacts.display_selection_source == 'clarification'


def test_invalid_discovery_args_and_incomplete_rows_do_not_become_display_authority():
    artifacts = ToolArtifacts(empty_memory())
    artifacts.collect('filter_catalog', None, {'status': 'invalid_arguments'})
    artifacts.collect('filter_catalog', {'search_text': ''}, {'status': 'ok',
        'products': [{'product_id': 'missing-name', 'final_price': 1000}]})
    artifacts.factual_fallback()
    assert artifacts.discovery_batches[0]['product_ids'] == [] and artifacts.ui['products'] == []


def test_declared_multi_category_arms_do_not_collapse_to_one_broad_category(runtime):
    runtime.provider.steps = [calls(('filter_catalog', {'category': 'drink', 'search_text': '',
        'sort_by': 'price_desc', 'limit': 1, 'planned_discovery_reads': 2})),
        calls(('filter_catalog', {'category': 'food', 'search_text': '',
        'sort_by': 'price_asc', 'limit': 1, 'planned_discovery_reads': 2})), final(['102', '103'])]
    assert product_ids(runtime.turn('So sánh cà phê và bánh')) == ['102', '103']
    assert [args['category'] for _, args in runtime.reads] == ['drink', 'food']
    assert not runtime.provider.requests[-1].get('tools')
