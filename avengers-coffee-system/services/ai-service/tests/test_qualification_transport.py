from types import SimpleNamespace
import pytest
from scripts.qualification_transport import QualificationTransport, QualificationStopped

URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'


def test_request_cap_counts_actual_sends_including_repairs_and_failover():
    sent = []
    def send(*args, **kwargs):
        sent.append(1)
        return SimpleNamespace(status_code=200, json=lambda: {'choices': [], 'usage': {}})
    transport = QualificationTransport(send, spacing=0)
    for _ in range(24):
        transport.post(URL)
    with pytest.raises(QualificationStopped):
        transport.post(URL)
    assert len(sent) == len(transport.attempts) == 24


def test_repeated_provider_errors_stop_before_next_send():
    sent = []
    def send(*args, **kwargs):
        sent.append(1)
        return SimpleNamespace(status_code=429)
    transport = QualificationTransport(send, spacing=0)
    transport.post(URL)
    transport.post(URL)
    with pytest.raises(QualificationStopped):
        transport.post(URL)
    assert len(sent) == 2


def test_business_endpoint_is_never_called():
    transport = QualificationTransport(lambda *a, **k: pytest.fail('network business side effect'))
    with pytest.raises(QualificationStopped):
        transport.post('https://orders.example/create')
    assert not transport.attempts


def test_additional_approved_budget_is_not_reset_to_default_24():
    sent = []
    transport = QualificationTransport(lambda *a, **k: (sent.append(1) or
        SimpleNamespace(status_code=200, json=lambda: {'choices': []})), budget=16, spacing=0)
    for _ in range(16):
        transport.post(URL)
    with pytest.raises(QualificationStopped):
        transport.post(URL)
    assert len(sent) == len(transport.attempts) == 16
