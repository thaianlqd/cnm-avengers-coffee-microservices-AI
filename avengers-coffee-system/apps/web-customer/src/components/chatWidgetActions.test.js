import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openChatProductDetail, addChatProduct, paymentCardRows,
  chatLoadingLabel, refreshWalletAfterCheckout,
} from './chatWidgetActions.js';

test('product card click navigates by canonical product ID', () => {
  const previous = globalThis.CustomEvent;
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  try {
    const events = [];
    openChatProductDetail('123', event => events.push(event));
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].detail, { tab: 'product-detail', productId: '123' });
  } finally { globalThis.CustomEvent = previous; }
});

test('plus button stops card navigation and adds only the canonical item', () => {
  let stopped = false;
  const additions = [];
  addChatProduct({ stopPropagation: () => { stopped = true; } }, item => additions.push(item),
    { product_id: '42', product_name: 'Frappe Matcha', category: 'Frappe' }, 60000);
  assert.equal(stopped, true);
  assert.equal(additions.length, 1);
  assert.deepEqual({ id: additions[0].ma_san_pham, name: additions[0].ten_san_pham, price: additions[0].gia_ban },
    { id: '42', name: 'Frappe Matcha', price: 60000 });
});

test('structured wallet option renders balance and disables insufficient funds', () => {
  const rows = paymentCardRows([{ code: 'VI_DIEN_TU', label: 'Ví Avengers', balance: 2063000, enabled: false,
    insufficient: true, reason: 'Số dư không đủ' }]);
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].desc, 'Số dư không đủ');
  assert.equal(paymentCardRows([{ label: 'Ví Avengers', balance: 2063000, enabled: true }])[0].desc, 'Số dư: 2.063.000đ');
});

test('loading label reflects the current stage', () => {
  assert.equal(chatLoadingLabel('BROWSING', false), 'Đang tìm món phù hợp...');
  assert.equal(chatLoadingLabel('VOUCHER', false), 'Đang kiểm tra ưu đãi...');
  assert.equal(chatLoadingLabel('SUMMARY', true), 'Đang xác nhận đơn hàng...');
});

test('successful wallet checkout invalidates the shared wallet query', async () => {
  const queries = [];
  const queryClient = { invalidateQueries: async value => { queries.push(value); } };
  await refreshWalletAfterCheckout(queryClient, 'customer-id', 'VI_DIEN_TU');
  await refreshWalletAfterCheckout(queryClient, 'customer-id', 'VNPAY');
  assert.deepEqual(queries, [{ queryKey: ['userWallet', 'customer-id'] }]);
});
