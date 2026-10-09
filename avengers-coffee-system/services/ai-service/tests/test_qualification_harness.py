"""Qualification setup itself must stay isolated before credentials are used."""
import pytest
from scripts.qualify_semantic_state import authority_fixture, CASES, assess
from src.common import cart_manager
from src.function_calling import helpers


@pytest.mark.parametrize('name', [case[0] for case in CASES])
def test_qualification_fixture_cannot_access_real_business_authority(monkeypatch, name):
    rt = authority_fixture(monkeypatch, name)
    assert cart_manager.get_cart(rt.sid) is not None
    with pytest.raises(RuntimeError, match='external business authority blocked'):
        helpers._get_engine()
    assert not rt.provider.requests


def test_ready_delivery_reply_asks_missing_payment_not_branch_again(monkeypatch):
    from test_semantic_control import gateway_for, action
    from src.agents.customer_flow_presentation import customer_flow_reply
    rt = authority_fixture(monkeypatch, 'address_followup')
    text = '17 Đường Hoa, Phường 3, Quận 7, Thành phố Hồ Chí Minh'
    g = gateway_for(rt, text)
    result = g.execute_semantic(action(g, 'resolve_location', {'location': text, 'kind': 'address', 'for_checkout': True}))
    assert cart_manager.get_checkout_prefs(rt.sid)['location_state'] == 'LOCATION_READY'
    assert not result.get('branches')
    reply = customer_flow_reply(g.artifacts.logs, g.context['business'])
    assert 'thanh toán' in reply.lower()
    assert cart_manager.get_checkout_prefs(rt.sid).get('payment_method') is None
