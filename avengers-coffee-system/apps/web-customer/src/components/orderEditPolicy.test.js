import test from 'node:test';
import assert from 'node:assert/strict';
import { orderEditPolicy, orderEditConfirmation, orderEditFingerprint } from './orderEditPolicy.js';
const order = { trang_thai_don_hang: 'DA_XAC_NHAN', trang_thai_thanh_toan: 'DA_THANH_TOAN', phuong_thuc_thanh_toan: 'VI_DIEN_TU' };
test('confirmed paid wallet and unpaid COD can edit; QR and preparing cannot', () => {
  assert.equal(orderEditPolicy(order).allowed, true);
  assert.equal(orderEditPolicy({ ...order, phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG', trang_thai_thanh_toan: 'CHO_THANH_TOAN' }).allowed, true);
  for (const method of ['NGAN_HANG_QR', 'VNPAY', 'MOMO', 'ZALOPAY']) assert.equal(orderEditPolicy({ ...order, phuong_thuc_thanh_toan: method }).allowed, false);
  assert.equal(orderEditPolicy({ ...order, trang_thai_don_hang: 'DANG_CHUAN_BI' }).allowed, false);
  assert.equal(orderEditPolicy({ ...order, trang_thai_thanh_toan: 'CHO_THANH_TOAN' }).allowed, false);
});
test('server policy overrides local presentation', () => {
  assert.equal(orderEditPolicy({ ...order, update_policy: { allowed: false, reason: 'locked' } }).allowed, false);
});
const payload = { items: [{ id: 1, so_luong: 3 }] };
const fingerprint = orderEditFingerprint('owned', payload);
const preview = { payload, fingerprint, revision: 'r1', original_total: 298000, final_total: 397000, wallet_shortfall: 0 };
test('commit binds the reviewed payload, order revision and new total', () => {
  assert.deepEqual(orderEditConfirmation(preview, fingerprint), { ...payload, expected_revision: 'r1', expected_total: 397000 });
  assert.deepEqual(orderEditConfirmation({ ...preview, final_total: 298000 }, fingerprint).expected_total, 298000);
});
test('stale form or other order preview cannot be confirmed', () => {
  assert.equal(orderEditConfirmation(preview, orderEditFingerprint('owned', { items: [] })), null);
  assert.equal(orderEditConfirmation(preview, orderEditFingerprint('another', payload)), null);
});
test('shortfall, reduced amount and incomplete preview cannot be committed', () => {
  for (const patch of [{ wallet_shortfall: 1 }, { final_total: 297000 }, { revision: null }, { final_total: undefined }, { original_total: undefined }, { final_total: NaN }]) {
    assert.equal(orderEditConfirmation({ ...preview, ...patch }, fingerprint), null);
  }
});
