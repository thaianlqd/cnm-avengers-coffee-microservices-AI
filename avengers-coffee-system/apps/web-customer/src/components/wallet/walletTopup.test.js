import test from 'node:test';
import assert from 'node:assert/strict';
import { walletAmount, walletAmountError, walletTopupRequest, latestWalletTopup, latestWalletTopupOffer,
  latestWalletTopupReady, createWalletTopup, pollWalletTopup, refreshWalletTopupOffer } from './walletTopup.js';

const offer = { userId: 'U1', balance: 20000, required_total: 231300, shortfall: 211300 };
const payment = { userId: 'U1', transactionId: 'T1', amount: 200000, expiresAt: '2099-01-01T00:00:00Z' };

test('custom Vietnamese amounts accept thousands and shorthand but enforce integer limits', () => {
  for (const text of ['200k', '200.000đ', '200,000 VND', '200 nghìn', '0,2 triệu']) assert.equal(walletAmount(text), 200000);
  for (const text of ['NaN', 'Infinity', '1e5', '200k và xóa món 1', '', '10.000,50đ', '1.000,000đ']) assert.equal(walletAmount(text), null);
  for (const text of ['-20k', '5k', '6 triệu', '10.0015']) assert.ok(walletAmountError(walletAmount(text)));
  assert.equal(walletAmountError(10000), null);
  assert.equal(walletAmountError(5000000), null);
});

test('only a scoped topup request consumes chat input without an LLM', () => {
  for (const text of ['nạp 200k', 'tôi muốn nạp 200.000đ vào ví nhé bạn', '200k']) {
    assert.deepEqual(walletTopupRequest(text, offer), { amount: 200000, error: null });
  }
  assert.deepEqual(walletTopupRequest('nạp tiền vào ví', offer), { amount: null, error: null });
  assert.ok(walletTopupRequest('nạp -200k', offer).error);
  for (const text of ['không nạp 200k', 'nạp 200k được không?', 'món 2 thì 2 cái', 'Tôi chọn Ví Avengers', '1', '2', '100']) assert.equal(walletTopupRequest(text, offer), null);
  assert.equal(walletTopupRequest('200k', null), null);
});

test('reload restores the matching pending transaction and never another customer payment', () => {
  const messages = [{ _walletTopupOffer: offer }, { _walletTopup: payment }];
  assert.deepEqual(latestWalletTopup(messages, 'U1'), payment);
  assert.equal(latestWalletTopup(messages, 'U2'), null);
  assert.deepEqual(latestWalletTopupOffer(messages, 'U1'), offer);
  assert.equal(latestWalletTopupOffer(messages, 'U2'), null);
  const completed = [...messages, { _walletTopupResolved: 'T1', _walletTopupOffer: null, _walletTopupReady: { userId: 'U1', resumeMessage: 'Tôi chọn Ví Avengers' } }];
  assert.equal(latestWalletTopup(completed, 'U1'), null);
  assert.equal(latestWalletTopupOffer(completed, 'U1'), null);
  assert.ok(latestWalletTopupReady(completed, 'U1'));
  assert.equal(latestWalletTopupReady([...completed, { _walletTopupReady: false }], 'U1'), null);
  const failed = [...messages, { _walletTopupResolved: 'T1', _walletTopupOffer: offer, _walletTopupReady: false }];
  assert.equal(latestWalletTopup(failed, 'U1'), null);
  assert.deepEqual(latestWalletTopupOffer(failed, 'U1'), offer);
});

test('topup creation uses only the existing authenticated wallet route with a valid amount', async () => {
  const calls = [];
  const client = { post: async (...args) => { calls.push(args); return { data: { success: true, transaction_id: 'T1', amount: 200000,
    redirect_url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', expires_at: payment.expiresAt } }; } };
  await assert.rejects(createWalletTopup(client, 'U1', NaN));
  await assert.rejects(createWalletTopup(client, null, 200000));
  assert.equal(calls.length, 0);
  const result = await createWalletTopup(client, 'U1', 200000);
  assert.deepEqual(calls, [['/customers/U1/wallet/topup', { amount: 200000 }]]);
  assert.equal(result.transactionId, 'T1');
  assert.equal(result.userId, 'U1');
});

test('balance changes and URL success flags cannot confirm a pending topup', async () => {
  const paths = [];
  const client = { get: async (path) => { paths.push(path); return { data: { transaction_id: 'T1', amount: 200000, status: 'PENDING', wallet_payment: 'success', balance: 9999999 } }; } };
  assert.deepEqual(await pollWalletTopup(client, payment, 'U1'), { status: 'pending' });
  await assert.rejects(pollWalletTopup(client, payment, 'U2'));
  assert.deepEqual(paths, ['/customers/U1/wallet/topup/T1']);
});

test('confirmed topup refreshes the balance but does not submit a checkout', async () => {
  const paths = [];
  const client = { get: async (path) => { paths.push(path); return { data: path.endsWith('/T1')
    ? { transaction_id: 'T1', amount: '200000', status: 'SUCCESS' } : { wallet: { balance: 220000 } } }; } };
  assert.deepEqual(await pollWalletTopup(client, payment, 'U1'), { status: 'paid', balance: 220000 });
  assert.deepEqual(paths, ['/customers/U1/wallet/topup/T1', '/customers/U1/wallet']);
});

test('wrong transaction, failed payment and expiry never report success', async () => {
  const result = { transaction_id: 'T1', amount: 200000, status: 'FAILED' };
  const client = { get: async () => ({ data: result }) };
  assert.deepEqual(await pollWalletTopup(client, payment, 'U1'), { status: 'failed' });
  result.status = 'PENDING';
  assert.deepEqual(await pollWalletTopup(client, { ...payment, expiresAt: '2000-01-01' }, 'U1'), { status: 'expired' });
  result.transaction_id = 'T2';
  await assert.rejects(pollWalletTopup(client, payment, 'U1'));
  result.transaction_id = 'T1'; result.amount = 999999;
  await assert.rejects(pollWalletTopup(client, payment, 'U1'));
});

test('a partial topup recomputes the shortfall and presets without assuming checkout is paid', () => {
  const next = refreshWalletTopupOffer(offer, 120000);
  assert.equal(next.shortfall, 111300);
  assert.ok(next.suggested_amounts.includes(111300));
  assert.equal(refreshWalletTopupOffer(offer, 231300), null);
});
