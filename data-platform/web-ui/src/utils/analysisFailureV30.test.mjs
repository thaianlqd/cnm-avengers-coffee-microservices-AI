import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisFailureActions, analysisFailureTitle, analysisFailureTone, analysisFailureReference, capabilitySuggestions } from './analysisPresentation.mjs';

const typed = (category, extra) => ({ status: 'error', outcome: 'SYSTEM_ERROR', diagnostics: { error_category: category }, ...extra });

test('unsupported capability never offers retry and is informational', () => {
  const r = { status: 'needs_clarification', outcome: 'UNSUPPORTED', analysis_state: 'UNSUPPORTED_CAPABILITY', retryable: false,
    issue: { suggested_actions: [{ type: 'retry' }, { type: 'edit_question' }] } };
  assert.deepEqual(analysisFailureActions(r), { edit: true, retry: false });
  assert.equal(analysisFailureTone(r), 'info');
});

test('no-progress semantic failure is not presented as provider connectivity', () => {
  const r = typed('provider_call_budget_exceeded', { analysis_state: 'UNDERSTANDING_FAILURE', retryable: false });
  assert.equal(analysisFailureTitle(r), 'Chưa ánh xạ được yêu cầu vào danh mục dữ liệu');
  assert.deepEqual(analysisFailureActions(r), { edit: true, retry: false });
});

test('transient provider timeout offers retry from the typed contract', () => {
  const r = typed('provider_timeout', { analysis_state: 'PROVIDER_FAILURE', retryable: true, issue: { suggested_actions: [] } });
  assert.deepEqual(analysisFailureActions(r), { edit: false, retry: true });
  assert.equal(analysisFailureTone(r), 'alert');
});

test('insufficient data is informational without retry', () => {
  const r = { status: 'needs_clarification', analysis_state: 'INSUFFICIENT_DATA', failure: { retry_helps: false } };
  assert.equal(analysisFailureActions(r).retry, false);
  assert.equal(analysisFailureTone(r), 'info');
});

test('execution failure exposes a safe technical reference only', () => {
  const r = typed('execution', { analysis_state: 'EXECUTION_FAILURE', retryable: false, diagnostics: { error_category: 'execution', job_id: 'job-1' } });
  assert.equal(analysisFailureReference(r), 'job-1');
  assert.equal(analysisFailureReference({ analysis_state: 'UNSUPPORTED_CAPABILITY', diagnostics: { job_id: 'x' } }), null);
});

test('suggestions come only from governed capabilities', () => {
  assert.deepEqual(capabilitySuggestions(null), []);
  const caps = { domains: [
    { label: 'Giao hàng và shipper', example_questions: ['Tỷ lệ giao thành công của shipper?'] },
    { label: 'Thanh toán', example_questions: [] },
    { label: 'Trùng', example_questions: ['Tỷ lệ giao thành công của shipper?'] }] };
  assert.deepEqual(capabilitySuggestions(caps), [{ label: 'Giao hàng và shipper', prompt: 'Tỷ lệ giao thành công của shipper?' }]);
});
