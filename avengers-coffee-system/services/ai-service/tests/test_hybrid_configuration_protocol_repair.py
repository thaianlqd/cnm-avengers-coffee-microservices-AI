"""October 8 configuration-envelope regression; all provider output is scripted."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, pending, no_cart
from src.agents.hybrid_command_schema import validate_envelope
from src.common import cart_manager
from src.function_calling.tools import product_tools


OPTIONS = {'size': 'Lớn', 'ice': 'Ít đá', 'sweetness': 'Ít ngọt'}


def configure():
    return e(c('CONFIGURE_PRODUCT', target={'kind':'pending_ordinal','index':1}, options=deepcopy(OPTIONS)))


def stage(rt, monkeypatch):
    no_cart(rt)
    original = product_tools.execute_get_product_options
    def menu(**kw):
        result = original(**kw)
        result['option_groups'] = [
            {'name':'Kích thước','values':['Lớn','Vừa'],'required':True},
            {'name':'Lượng đá','values':['Ít đá','Bình thường'],'required':False},
            {'name':'Độ ngọt','values':['Ít ngọt','Bình thường'],'required':False},
        ]
        return result
    monkeypatch.setattr(product_tools,'execute_get_product_options',menu)
    send(rt,c('SELECT_PRODUCTS',mode='EXPLICIT',references=[{'kind':'ordinal','index':1}]))
    assert pending(rt) and not rt.writes


def test_omitted_message_is_only_lossless_null_and_input_is_immutable():
    raw = configure(); raw.pop('message'); before = deepcopy(raw)
    value, error, rules = validate_envelope(raw)
    assert not error and value == {**before,'message':None}
    assert rules == ['command_message_null'] and raw == before


@pytest.mark.parametrize('raw',[
    {'kind':'commands','commands':[]},
    {'kind':'social','commands':[]},
    {'kind':'clarification','commands':[]},
    {'kind':'commands','commands':[c('UNKNOWN')]},
    {'kind':'commands','commands':[c('CONFIGURE_PRODUCT')]},
    {'kind':'commands','commands':[c('CONFIGURE_PRODUCT',options={'unit_price':1})]},
    {**configure(),'message':''},
    {**configure(),'message':False},
    {**configure(),'ice':'Ít đá'},
    {'kind':'commands','commands':[c('CONFIGURE_PRODUCT',ice='Ít đá')]},
])
def test_normalization_does_not_relax_choices_or_flat_options(raw):
    value,error,_ = validate_envelope(raw)
    assert value is None and error


def test_missing_message_configures_once_without_spending_repair(hybrid,monkeypatch,caplog):
    stage(hybrid,monkeypatch)
    raw=configure(); raw.pop('message')
    start=len(hybrid.provider.requests)
    hybrid.provider.steps=[{'content':json.dumps(raw,ensure_ascii=False)}]
    result=hybrid.turn('cho tôi size lớn, ít đá, ít ngọt nha',client_message_id='configuration-missing-message')
    assert not result['error'] and result['provider_request_count']==1
    assert len(hybrid.provider.requests)==start+1 and len(hybrid.writes)==1 and not pending(hybrid)
    saved=hybrid.writes[0][1]
    assert saved['size']=='Lớn' and saved['luong_da']=='Ít đá' and saved['do_ngot']=='Ít ngọt'
    assert not saved.get('toppings') and not cart_manager.get_checkout_prefs(hybrid.sid).get('payment_method')
    assert hybrid.turn('cho tôi size lớn, ít đá, ít ngọt nha',client_message_id='configuration-missing-message')==result
    assert len(hybrid.writes)==1 and len(hybrid.provider.requests)==start+1


@pytest.mark.parametrize('bad',[
    {**configure(),'ice':'Ít đá'},
    e(c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':1},**OPTIONS)),
    {'ice':'Ít đá','size':'Lớn','sweetness':'Ít ngọt'},
])
def test_misnested_configuration_repairs_complete_envelope_in_same_turn(hybrid,monkeypatch,bad):
    stage(hybrid,monkeypatch)
    hybrid.provider.steps=[{'content':json.dumps(bad,ensure_ascii=False)},
                           {'content':json.dumps(configure(),ensure_ascii=False)}]
    result=hybrid.turn('cho tôi size lớn, ít đá, ít ngọt nha')
    assert not result['error'] and result['provider_request_count']==2 and len(hybrid.writes)==1
    repair=hybrid.provider.requests[-1]['messages'][-1]['content']
    assert 'ONE COMPLETE envelope' in repair and 'commands[i].args.options' in repair
    assert 'never a JSON patch' in repair and 'Do not add defaults' in repair
    if 'ice' in bad or 'ice' in bad.get('commands',[{}])[0].get('args',{}):
        # A flat object may first fail on a missing envelope field; the general
        # instruction still contains the complete nesting rule.
        assert 'Root keys are only kind, commands, message' in repair


def test_repair_still_invalid_preserves_pending_and_never_writes(hybrid,monkeypatch):
    stage(hybrid,monkeypatch)
    before=deepcopy(pending(hybrid)); cart=deepcopy(cart_manager.get_cart(hybrid.sid)['items'])
    first=configure(); first.pop('message'); first['ice']='Ít đá'
    hybrid.provider.steps=[{'content':json.dumps(first)}, {'content':json.dumps({**configure(),'ice':'Ít đá'})}]
    result=hybrid.turn('cho tôi size lớn, ít đá, ít ngọt nha')
    assert result['failure_class']=='INTERPRETER_PROTOCOL' and result['error']=='unknown_field'
    assert result['provider_request_count']==2 and not result['tool_calls_log'] and not hybrid.writes
    assert pending(hybrid)==before and cart_manager.get_cart(hybrid.sid)['items']==cart


def test_normalized_configuration_still_checks_real_menu_options(hybrid,monkeypatch):
    stage(hybrid,monkeypatch)
    raw=configure(); raw.pop('message'); raw['commands'][0]['args']['options']['size']='Không có trong Menu'
    hybrid.provider.steps=[{'content':json.dumps(raw)}]
    result=hybrid.turn('cho tôi size không có trong Menu')
    assert result['error'] and result['failure_class']=='BUSINESS_POLICY'
    assert result['provider_request_count']==1 and not hybrid.writes and pending(hybrid)
