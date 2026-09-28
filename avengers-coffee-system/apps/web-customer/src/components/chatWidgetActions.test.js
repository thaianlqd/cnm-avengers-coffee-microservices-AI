import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openChatProductDetail, addChatProduct, branchDistanceLabel, paymentCardRows,
  chatLoadingLabel, refreshWalletAfterCheckout, structuredLegacyCards,
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

test('plus button stops card navigation and sends only canonical identity', () => {
  let stopped = false;
  const additions = [];
  addChatProduct({ stopPropagation: () => { stopped = true; } }, item => additions.push(item),
    { product_id: '42', product_name: 'Frappe Matcha', category: 'Frappe' });
  assert.equal(stopped, true);
  assert.equal(additions.length, 1);
  assert.deepEqual(additions[0], { product_id: '42', product_name: 'Frappe Matcha' });
});

test('branch distance marks area-centroid estimates', () => {
  assert.equal(branchDistanceLabel({ khoang_cach_km: 2.5, distance_basis: 'area_centroid' }),
    '2.5 km đường chim bay, ước tính theo khu vực');
  assert.equal(branchDistanceLabel({ khoang_cach_km: 2.5, distance_basis: 'geocoded_user' }),
    '2.5 km đường chim bay');
});

test('structured wallet option renders balance and disables insufficient funds', () => {
  const rows = paymentCardRows([{ code: 'VI_DIEN_TU', label: 'Ví Avengers', balance: 2063000, enabled: false,
    insufficient: true, reason: 'Số dư không đủ' }]);
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].desc, 'Số dư không đủ');
  assert.equal(paymentCardRows([{ label: 'Ví Avengers', balance: 2063000, enabled: true }])[0].desc, 'Số dư: 2.063.000đ');
});

test('legacy chat cards come only from structured fields in the current response', () => {
  assert.deepEqual(structuredLegacyCards({ reply: 'Xem menu, voucher và thanh toán qua ví nhé' }), {});
  assert.deepEqual(structuredLegacyCards({
    reply: 'Đã chọn ví',
    products: [{ product_id: 'P1' }],
    payment_options: [{ code: 'VI_DIEN_TU' }],
  }), {
    _products: [{ product_id: 'P1' }],
    _paymentOptions: [{ code: 'VI_DIEN_TU' }],
  });
});

test('loading label uses only the current confirmation action', () => {
  assert.equal(chatLoadingLabel(false), 'Mình đang xử lý yêu cầu của bạn...');
  assert.equal(chatLoadingLabel(true), 'Đang xác nhận đơn hàng...');
});

test('successful wallet checkout invalidates the shared wallet query', async () => {
  const queries = [];
  const queryClient = { invalidateQueries: async value => { queries.push(value); } };
  await refreshWalletAfterCheckout(queryClient, 'customer-id', 'VI_DIEN_TU');
  await refreshWalletAfterCheckout(queryClient, 'customer-id', 'VNPAY');
  assert.deepEqual(queries, [{ queryKey: ['userWallet', 'customer-id'] }]);
});
