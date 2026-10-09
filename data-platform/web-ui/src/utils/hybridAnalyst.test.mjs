import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisFailureActions, analysisFailureTitle } from './analysisPresentation.mjs';

test('successful internal repair does not display retry or edit controls', () => {
  assert.deepEqual(analysisFailureActions({ status: 'proposal_ready', diagnostics: { semantic_repair_count: 2 } }), { edit: false, retry: false });
});
test('needs input presents clarification and no system retry', () => {
  assert.deepEqual(analysisFailureActions({ status: 'needs_clarification', outcome: 'NEEDS_INPUT' }), { edit: true, retry: false });
});
test('unsupported capability keeps limitation and meaningful edit', () => {
  assert.deepEqual(analysisFailureActions({ status: 'needs_clarification', outcome: 'UNSUPPORTED' }), { edit: true, retry: false });
});
test('system interpretation failure does not blame user wording', () => {
  const r = { status: 'error', outcome: 'SYSTEM_ERROR', diagnostics: { error_category: 'semantic_intent_invalid' }, issue: { suggested_actions: [{ type: 'retry' }] } };
  assert.equal(analysisFailureTitle(r), 'Hệ thống chưa hoàn tất diễn giải phân tích');
  assert.deepEqual(analysisFailureActions(r), { edit: false, retry: true });
});
test('partial scope is a proposal and does not offer retry', () => {
  assert.deepEqual(analysisFailureActions({ status: 'proposal_ready', outcome: 'PARTIAL_AVAILABLE' }), { edit: false, retry: false });
});
