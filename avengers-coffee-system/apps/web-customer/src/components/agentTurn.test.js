import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PENDING_AGENT_TURN_KEY, readPendingAgentTurn, matchesAgentTurn, selectAgentTurn, clearCompletedAgentTurn, agentTurnFailure } from './agentTurn.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('resend after a lost response or remount keeps the same logical turn', () => {
  const store = storage();
  const request = { text: 'cho tôi lấy tại quán và chuyển khoản qr nhé', selectedProductId: undefined,
    sessionId: 'customer', conversationId: 'conversation' };
  const first = selectAgentTurn(null, request, () => 'turn-1');
  store.setItem(PENDING_AGENT_TURN_KEY, JSON.stringify(first));
  const retry = selectAgentTurn(readPendingAgentTurn(store), { ...request, selectedProductId: null },
    () => { throw new Error('must reuse ID'); });
  assert.equal(retry.id, first.id);
  assert.equal(matchesAgentTurn(first, request), true);
  assert.equal(readPendingAgentTurn(store).id, 'turn-1');
  clearCompletedAgentTurn(store, retry);
  assert.equal(readPendingAgentTurn(store), null);
  assert.equal(selectAgentTurn(null, request, () => 'turn-2').id, 'turn-2');
});

test('only an exact request identity reuses a failed turn', () => {
  const request = { text: 'pickup', selectedProductId: null, sessionId: 's', conversationId: 'c' };
  const first = selectAgentTurn(null, request, () => 'old');
  for (const changed of [{ text: 'new' }, { sessionId: 'other' },
    { conversationId: 'other' }, { selectedProductId: 'product' }]) {
    assert.equal(selectAgentTurn(first, { ...request, ...changed }, () => 'new').id, 'new');
  }
});

test('successful HTTP followed by client processing failure is identified correctly', () => {
  const failure = agentTurnFailure('response_processing', null);
  assert.equal(failure.phase, 'response_processing');
  assert.doesNotMatch(failure.message, /Kết nối bị gián đoạn/);
  assert.equal(agentTurnFailure('request', 503).phase, 'server_response');
  assert.equal(agentTurnFailure('request', null).phase, 'request');
});
