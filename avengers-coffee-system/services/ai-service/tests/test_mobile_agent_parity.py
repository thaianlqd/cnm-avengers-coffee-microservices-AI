import asyncio
import io
import json
import socket

from fastapi import UploadFile
from hybrid_support import runtime, hybrid, envelope, command
from src.agents.hybrid_command_schema import COMMAND_ARGS
from src.agents.hybrid_semantic_interpreter import SYSTEM, format_repair_instruction


def test_unknown_intent_repair_has_exact_contract_names_and_no_implicit_checkout():
    instruction = format_repair_instruction({
        'failure_code': 'unknown_intent', 'failure_json_pointer': '/commands/0/intent', 'failure_field': 'intent',
    })
    for intent in COMMAND_ARGS:
        assert intent in instruction
    assert 'does not confirm checkout' in instruction
    assert 'SELECT_PRODUCTS with mode EXPLICIT' in instruction
    assert 'A greeting alongside a purchase/search request is a command turn' in SYSTEM


def test_reported_ordinal_repair_selects_options_without_adding_or_confirming(hybrid):
    bad = envelope(command('SELECT_PRODUCT', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 2}]))
    good = envelope(command('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 2}]))
    hybrid.provider.steps = [{'content': json.dumps(bad)}, {'content': json.dumps(good)}]
    result = hybrid.turn('cho tôi món số 2 đi bạn ơi')
    assert not result['error'] and result['provider_request_count'] == 2
    assert not hybrid.writes
    assert 'SELECT_PRODUCTS with mode EXPLICIT' in hybrid.provider.requests[-1]['messages'][-1]['content']


def test_mobile_voice_only_transcribes_before_stateful_agent(monkeypatch):
    import main
    monkeypatch.setattr(socket.socket, 'connect', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Live network forbidden')))
    monkeypatch.setattr(main, 'groq_is_available', lambda: True)
    calls = []
    def transcribe(**kwargs):
        calls.append(kwargs)
        return 'cho tôi món số 2'
    monkeypatch.setattr(main, 'groq_transcribe_audio', transcribe)
    monkeypatch.setattr(main, 'groq_extract_order_intent', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Legacy interpretation forbidden')))
    result = asyncio.run(main.voice_order(audio=UploadFile(filename='fixture.m4a', file=io.BytesIO(b'fixture-audio')),
        user_id='fixture', branch_code='', language='vi', transcription_only=True))
    assert result == {'transcript': 'cho tôi món số 2'}
    assert len(calls) == 1
