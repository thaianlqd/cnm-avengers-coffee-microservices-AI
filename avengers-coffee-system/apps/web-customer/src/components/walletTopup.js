export const WALLET_TOPUP_MIN = 10000;
export const WALLET_TOPUP_MAX = 5000000;

const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/đ/g, 'd').trim();

export function walletAmount(value) {
  const match = fold(value).match(/^([+-]?\d+(?:[.,]\d+)*)\s*(k|nghin|ngan|trieu|m|d|dong|vnd)?$/);
  if (!match) return null;
  const unit = match[2] || '';
  let numeric = match[1];
  if (/^[+-]?[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*$/.test(numeric)) numeric = numeric.replace(/[.,]/g, '');
  else numeric = numeric.replace(',', '.');
  const multiplier = ['k', 'nghin', 'ngan'].includes(unit) ? 1000 : ['m', 'trieu'].includes(unit) ? 1000000 : 1;
  const amount = Number(numeric) * multiplier;
  return Number.isSafeInteger(amount) ? amount : null;
}

export function walletAmountError(amount) {
  return !Number.isSafeInteger(amount) || amount < WALLET_TOPUP_MIN || amount > WALLET_TOPUP_MAX
    ? 'Số tiền nạp phải từ 10.000đ đến 5.000.000đ, không có phần lẻ.' : null;
}

export function walletTopupRequest(text, offer) {
  if (!offer) return null;
  const normalized = fold(text);
  if (/[?]/.test(normalized) || /\b(khong|ko|k|chua|dung|huy)\b/.test(normalized)) return null;
  const explicit = /\bnap\b/.test(normalized);
  let amountText = normalized;
  if (explicit) {
    amountText = normalized.replace(/^(?:(?:cho\s+)?(?:toi|minh)\s+)?(?:muon\s+)?nap\s*(?:them\s*)?(?:tien\s*)?(?:vao\s+vi\s*)?/, '');
    if (amountText === normalized) return null;
    amountText = amountText.replace(/\s+(?:(?:vao\s+vi)|dien tu|avengers|nhe|nha|di|ban|b|oi|a)+/g, ' ').trim();
    if (!amountText) return { amount: null, error: null };
  }
  const amount = walletAmount(amountText);
  // Bare small numbers can still select a voucher or branch while a wallet
  // recovery card is visible. Only currency/unit evidence owns those values.
  if (!explicit && (amount === null || (amount < WALLET_TOPUP_MIN
      && !/(?:k|nghin|ngan|trieu|m|d|dong|vnd)$/.test(amountText)))) return null;
  return { amount, error: walletAmountError(amount) };
}

export function latestWalletTopupOffer(messages, userId) {
  if (!userId) return null;
  const row = [...(messages || [])].reverse().find((message) =>
    Object.hasOwn(message, '_walletTopupOffer') || message._walletTopupResolved);
  const offer = row?._walletTopupOffer;
  return offer?.userId === userId ? offer : null;
}

export function latestWalletTopupReady(messages, userId) {
  const row = [...(messages || [])].reverse().find((message) => Object.hasOwn(message, '_walletTopupReady'));
  return row?._walletTopupReady?.userId === userId ? row._walletTopupReady : null;
}

export function refreshWalletTopupOffer(offer, balance) {
  if (!offer || balance >= offer.required_total) return null;
  const shortfall = Math.ceil(offer.required_total - balance);
  const suggested = Math.min(WALLET_TOPUP_MAX, Math.max(WALLET_TOPUP_MIN, shortfall));
  return { ...offer, balance, shortfall, suggested_amounts: [...new Set([50000, 100000, 200000, 500000, suggested])].sort((a, b) => a - b) };
}

export function latestWalletTopup(messages, userId) {
  const resolved = new Set((messages || []).map((row) => row._walletTopupResolved).filter(Boolean));
  return [...(messages || [])].reverse().find((row) => row._walletTopup?.userId === userId
    && !resolved.has(row._walletTopup.transactionId))?._walletTopup || null;
}

export async function createWalletTopup(client, userId, amount) {
  const error = walletAmountError(amount);
  if (!userId || error) throw new Error(error || 'Đăng nhập để nạp ví.');
  const response = await client.post(`/customers/${encodeURIComponent(userId)}/wallet/topup`, { amount });
  const data = response?.data || response;
  const url = new URL(data.redirect_url);
  if (!data.success || !data.transaction_id || Number(data.amount) !== amount || url.protocol !== 'https:') {
    throw new Error('Chưa nhận được liên kết nạp ví hợp lệ.');
  }
  return { transactionId: data.transaction_id, userId, amount, url: url.href, expiresAt: data.expires_at };
}

export async function pollWalletTopup(client, payment, userId) {
  if (!userId || payment?.userId !== userId) throw new Error('Phiên nạp ví không thuộc tài khoản hiện tại.');
  const path = `/customers/${encodeURIComponent(userId)}/wallet`;
  const response = await client.get(`${path}/topup/${encodeURIComponent(payment.transactionId)}`);
  const data = response?.data || response;
  if (data.transaction_id !== payment.transactionId || Number(data.amount) !== payment.amount) {
    throw new Error('Giao dịch nạp ví chưa khớp.');
  }
  if (data.status === 'SUCCESS') {
    const walletResponse = await client.get(path);
    const rawBalance = (walletResponse?.data || walletResponse)?.wallet?.balance;
    const balance = Number(rawBalance);
    if (rawBalance == null || !Number.isFinite(balance) || balance < 0) throw new Error('Chưa đọc được số dư ví.');
    return { status: 'paid', balance };
  }
  if (data.status === 'FAILED') return { status: 'failed' };
  if (payment.expiresAt && Date.parse(payment.expiresAt) <= Date.now()) return { status: 'expired' };
  return { status: 'pending' };
}
