import json

import pytest

from src.agents.pending_context import classify_pending_reply
from src.common import groq_service


@pytest.mark.parametrize('pending, messages, expected', [
    ('ask_more_items', ['vậy oke rồi', 'thế được rồi', 'ổn rồi', 'vậy thôi', 'không cần thêm', 'chốt giỏ vậy đi', 'giỏ này được rồi', 'ừ thế nhé', 'không vậy oke rồi'], 'DONE'),
    ('ask_more_items', ['có, cho tôi xem thêm bánh', 'mua thêm Bánh Matcha'], 'WANT_MORE'),
    ('select_voucher', ['áp cho tôi mã số 1 đi', 'lấy mã đầu tiên', 'dùng voucher thứ nhất'], 'SELECT_VOUCHER'),
    ('select_voucher', ['bỏ qua voucher', 'không cần'], 'SKIP_VOUCHER'),
    ('confirm_address', ['oke giao đến địa chỉ đó cho tôi đi', 'dùng địa chỉ đó đi', 'đúng chỗ đó', 'giao ở đó nhé', 'ừ địa chỉ vừa rồi', 'địa chỉ kia được', 'tôi bảo địa chỉ đó oke rồi'], 'CONFIRM_ADDRESS'),
    ('confirm_address', ['đổi địa chỉ', 'không, địa chỉ khác'], 'CHANGE_ADDRESS'),
    ('confirm_checkout', ['oke ổn rồi đồng ý nhé', 'đồng ý', 'oke', 'ừ được rồi', 'đúng rồi', 'chốt đi', 'đặt luôn đi', 'ổn rồi', 'ý là tôi đồng ý chốt đơn rồi đấy'], 'CONFIRM'),
    ('confirm_checkout', ['chưa đặt', 'không đồng ý', 'khoan, tôi muốn sửa', 'đừng đặt', 'dừng'], 'REJECT'),
])
def test_clear_pending_semantics_need_no_model(monkeypatch, pending, messages, expected):
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: pytest.fail('Clear pending reply must be deterministic'))
    for message in messages:
        assert classify_pending_reply(message, pending) == expected


@pytest.mark.parametrize('output, expected', [
    ('{"intent":"DONE"}', 'DONE'),
    ('{"intent":"CONFIRM"}', 'AMBIGUOUS'),
    ('{"intent":"DONE","tool":"confirm_checkout"}', 'AMBIGUOUS'),
    ('{"intent":{"tool":"add_to_cart"}}', 'AMBIGUOUS'),
    ('tôi đã đặt hàng', 'AMBIGUOUS'),
    (None, 'AMBIGUOUS'),
])
def test_semantic_fallback_only_accepts_context_enum(monkeypatch, output, expected):
    calls = []
    def complete(system, user, **kwargs):
        calls.append((system, json.loads(user), kwargs))
        return output
    monkeypatch.setattr(groq_service, 'groq_chat', complete)
    original = 'Như vậy là đủ nhu cầu của mình.'
    assert classify_pending_reply(original, 'ask_more_items') == expected
    assert calls[0][1] == {'pending_context': 'ask_more_items', 'answer': original}
    assert calls[0][2] == {'max_tokens': 60}


@pytest.mark.parametrize('text', ['oke nếu được freeship', 'đúng tổng này phải không?', 'đồng ý hay sửa?', 'tổng bao nhiêu'])
def test_questions_and_conditional_agreement_cannot_confirm(monkeypatch, text):
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: pytest.fail('Question cannot confirm'))
    assert classify_pending_reply(text, 'confirm_checkout') == 'AMBIGUOUS'
