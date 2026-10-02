"""Customer optional choices and product claims follow Menu evidence."""
from copy import deepcopy
import json

import pytest

from test_customer_checkout_presentation import shop, send
from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import gateway
from src.agents.agent_memory import empty_memory
from src.agents.tool_artifacts import ToolArtifacts
from src.common import cart_manager
from src.function_calling.tools import product_tools


def pending_matcha(shop, monkeypatch, required_topping=False):
    groups = [dict(name='Kích thước', values=['Vừa'], required=True),
        dict(name='Lượng đá', values=['Bình thường', 'Ít đá'], default_value='Bình thường'),
        dict(name='Độ ngọt', values=['Ít ngọt', 'Bình thường'], default_value='Bình thường'),
        dict(name='Topping', values=['Hạt Sen', 'Trái Vải'], multiple=True, required=required_topping)]
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda **kw:
        dict(status='ok', product_id='101', product_name='Matcha Latte Đào Dưa Lưới', option_groups=deepcopy(groups)))
    # Exact durable shape left by the old version after the customer's partial turn.
    cart_manager.set_pending_products(shop.sid, [dict(product_id='101', product_name='Matcha Latte Đào Dưa Lưới',
        quantity=2, size='Vừa', luong_da='Ít đá', do_ngot='Bình thường', missing_fields=['toppings'], option_schema=groups)])
    cart_manager.set_pending_action(shop.sid, 'fill_options', {'count': 1})


@pytest.mark.parametrize('phrase', ['vậy được rồi k cần thêm topping', 'ko cần topping nhé',
    'không cần thêm topping', 'không topping', 'bỏ topping'])
def test_reported_topping_decline_accepts_empty_extras_and_preserves_choices(shop, monkeypatch, phrase):
    pending_matcha(shop, monkeypatch)
    result = send(shop, phrase, ('add_to_cart', {'product_id': '101', 'quantity': 2, 'toppings': []}))
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(shop.writes) == 1
    added = shop.writes[0][1]
    assert (added['quantity'], added['size'], added['luong_da'], added['do_ngot'], added['toppings']) == (
        2, 'Vừa', 'Ít đá', 'Bình thường', [])
    assert 'Topping: Không thêm' in result['reply'] and 'chọn giúp mình các tùy chọn' not in result['reply']


@pytest.mark.parametrize('args', [{'product_id': '101', 'quantity': 2, 'toppings': []},
    {'product_id': '101', 'quantity': 2, 'use_defaults': True, 'luong_da': 'Bình thường',
     'do_ngot': 'Ít ngọt', 'toppings': ['Hạt Sen']}])
def test_customer_defaults_work_without_model_flag_and_do_not_replace_staged_choices(shop, monkeypatch, args):
    pending_matcha(shop, monkeypatch)
    result = send(shop, 'theo mặc định đi', ('add_to_cart', args))
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    added = shop.writes[0][1]
    assert added['luong_da'] == 'Ít đá' and added['do_ngot'] == 'Bình thường'
    assert added['toppings'] == [] and added['quantity'] == 2


def test_only_required_size_is_missing_optional_omissions_are_not_questions(shop):
    g = gateway(shop, 'ít đá nhé')
    result = g.dispatch('add_to_cart', {'product_id': '101', 'luong_da': 'Ít đá'})
    assert result['status'] == 'needs_options' and result['missing'] == ['size']
    assert not shop.writes
    second = gateway(shop, 'size lớn nhé').dispatch('add_to_cart', {'product_id': '101', 'size': 'Lớn'})
    assert second['status'] == 'ok' and len(shop.writes) == 1
    assert shop.writes[0][1]['toppings'] == [] and shop.writes[0][1]['luong_da'] == 'Ít đá'


def test_required_topping_cannot_be_silently_skipped(shop, monkeypatch):
    pending_matcha(shop, monkeypatch, required_topping=True)
    result = gateway(shop, 'theo mặc định').dispatch('add_to_cart', {'product_id': '101', 'quantity': 2})
    assert result['status'] == 'needs_options' and result['missing'] == ['toppings']
    assert not shop.writes


def test_optional_invalid_value_is_not_silently_replaced_by_default(shop):
    result = gateway(shop, 'size lớn và topping Foam Dừa').dispatch('add_to_cart',
        {'product_id': '101', 'size': 'Lớn', 'toppings': ['Foam Dừa']})
    assert result['status'] == 'invalid_option' and not shop.writes


def test_global_defaults_ignore_model_guessed_paid_extras(shop):
    result = send(shop, 'theo mặc định', ('add_to_cart', {'product_id': '101', 'use_defaults': True,
        'size': 'Nhỏ', 'toppings': ['Foam Caramel']}))
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert shop.writes[0][1]['size'] == 'Lớn'  # First authoritative Menu option, not model guess.
    assert shop.writes[0][1]['toppings'] == []


def description(product_id='101', content='Cà phê muối béo ngậy Avenger.'):
    return dict(id='product_' + product_id, content=content, domain='product_description',
        entity_type='product', entity_id=product_id, source='menu.san_pham.mo_ta')


def test_valid_quote_and_word_overlap_do_not_authorize_invented_description():
    artifacts = ToolArtifacts(empty_memory())
    doc = description()
    artifacts.collect('get_product_description', {'product_id': '101'}, dict(status='ok', results=[doc]))
    reply = artifacts.validate_reply(json.dumps(dict(reply='Cà phê muối béo ngậy từ hạt Arabica rang độc quyền Highlands.',
        mutation_claims=[], evidence_quotes=[dict(document_id=doc['id'], quote=doc['content'])])))
    assert doc['content'] in reply and 'Arabica' not in reply and 'Highlands' not in reply


@pytest.mark.parametrize('has_description', [False, True])
def test_discovery_does_not_infer_flavour_from_name_or_cross_product_description(has_description):
    artifacts = ToolArtifacts(empty_memory())
    products = [dict(product_id='101', product_name='Matcha Latte Tây Bắc', final_price=55000),
        dict(product_id='102', product_name='Coco Matcha Foam', final_price=65000)]
    artifacts.collect('filter_catalog', {'category': 'drink', 'search_text': 'matcha', 'limit': 2},
        dict(status='ok', products=products))
    if has_description:
        doc = description(content='Matcha vị trà đậm. Chưa công bố loại sữa.')
        artifacts.collect('get_product_description', {'product_id': '101'}, dict(status='ok', results=[doc]))
    artifacts.validate_reply(json.dumps(dict(response_kind='consultation', reply='Coco Matcha Foam béo ngậy ít calo, bestseller.',
        mutation_claims=[], evidence_quotes=[], display_product_ids=['101', '102'], display_product_count=2)))
    artifacts.finalize_display()
    reply = artifacts.discovery_product_reply()
    assert '55.000đ' in reply and '65.000đ' in reply
    assert all(text not in reply for text in ['béo ngậy', 'ít calo', 'bestseller'])
    if has_description:
        assert doc['content'] in reply
        assert reply.index(doc['content']) < reply.index('Coco Matcha Foam')
