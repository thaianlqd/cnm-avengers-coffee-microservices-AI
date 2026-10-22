// Platform-independent Agent presentation contract, shared with customer-mobile.
export function agentProducts(payload, catalog = []) {
  const byId = new Map(catalog.map(item => [String(item.ma_san_pham || item.id), item]));
  return Array.isArray(payload?.products) ? payload.products.map(item => ({
    ...item,
    hinh_anh_url: item.hinh_anh_url || byId.get(String(item.product_id || item.ma_san_pham))?.hinh_anh_url,
  })) : [];
}

export function pendingCheckout(payload, reply) {
  if (!payload || !(payload.order_summary || payload.items)) return null;
  const summary = payload.order_summary || payload;
  return {
    items: (summary.items || []).map(i => ({
      matched: true, product_id: i.product_id,
      product_name: i.product_name || i.ten_san_pham,
      quantity: i.quantity || i.so_luong || 1,
      price: i.unit_price || i.gia_ban || 0, size: i.size, note: i.note,
    })),
    subtotal: summary.total_price ?? summary.subtotal,
    discount: summary.discount_amount || 0,
    total: summary.final_total ?? summary.total_price ?? summary.subtotal,
    message: reply, paymentMethod: summary.payment_method,
    deliveryType: summary.delivery_type, deliveryAddress: summary.delivery_address,
    actionId: summary.action_id, branch_id: summary.branch_id, branch_name: summary.branch_name,
  };
}

export function isCheckoutConfirmation(value) {
  const raw = String(value || '');
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[!.,]+$/g, '').trim();
  if (!normalized || raw.includes('?')) return false;
  if (/\b(nhung|doi|them|bot|bo|sua|huy|khoan|chua|khong|dung lai|dung dat|dung chot)\b/.test(normalized)) return false;
  const exact = new Set(['dong y', 'dong y chot don', 'dong y dat hang', 'oke xac nhan',
    'ok xac nhan', 'okay xac nhan', 'xac nhan', 'xac nhan dat hang', 'xac nhan chot don',
    'ok', 'oke', 'okay', 'chot', 'chot don', 'dat di', 'dat luon', 'tien hanh', 'on roi', 'dung roi', 'chuan roi']);
  if (exact.has(normalized)) return true;
  return /\b(chot|chot don|dat hang|dat don|dat di|dat luon|tien hanh)\b/.test(normalized)
    && (/\b(dong y|xac nhan|ok|oke|okay|duoc roi|on roi|dung roi|chuan roi|yes)\b/.test(normalized)
      || /\b(di|luon|nhe|thoi)\b/.test(normalized));
}
