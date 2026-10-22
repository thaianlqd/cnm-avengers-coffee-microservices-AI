// Order History uses canonical order fields, not cart/product fields.
const text = value => String(value ?? '').normalize('NFC').trim();
const stable = value => Array.isArray(value) ? value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

export function favouriteItemOptions(item) {
  const toppings = (Array.isArray(item.toppings) ? item.toppings : []).map(t => text(typeof t === 'object' ? t?.name || t?.label : t)).filter(Boolean).sort();
  return { size: text(item.kich_co ?? item.size), toppings, ice: text(item.luong_da), sweet: text(item.do_ngot),
    milk: text(item.loai_sua), custom: stable(item.custom_attributes || {}), note: text(item.ghi_chu),
    legacy: !item.toppings && !item.custom_attributes ? stable(item.tuy_chon || '') : '' };
}

export function favouriteItemDescription(item) {
  const opts = favouriteItemOptions(item);
  const custom = Object.entries(opts.custom).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  return [opts.size && `Size: ${opts.size}`, opts.ice && `Đá: ${opts.ice}`, opts.sweet && `Ngọt: ${opts.sweet}`,
    opts.milk && `Sữa: ${opts.milk}`, `Topping: ${opts.toppings.join(', ') || 'Không thêm'}`, ...custom,
    opts.note && `Ghi chú: ${opts.note}`, opts.legacy && (Array.isArray(opts.legacy) ? opts.legacy.join(', ') : String(opts.legacy))].filter(Boolean).join(' · ');
}

export function groupFavouriteOrders(orders, threshold = 5) {
  const groups = new Map(), seen = new Set();
  for (const order of orders || []) {
    if (!order.ma_don_hang || seen.has(order.ma_don_hang)) continue;
    seen.add(order.ma_don_hang);
    if (order.trang_thai_don_hang === 'DA_HUY' || ['THAT_BAI', 'DA_HOAN_TIEN'].includes(order.trang_thai_thanh_toan)) continue;
    const items = order.chi_tiet || [];
    if (!items.length) continue;
    const lines = new Map();
    let valid = true;
    for (const item of items) {
      const quantity = Number(item.so_luong);
      if (!item.ma_san_pham || !Number.isSafeInteger(quantity) || quantity < 1) { valid = false; break; }
      // A favourite is the set of products; quantities/options come from the latest order.
      lines.set(String(item.ma_san_pham), true);
    }
    if (!valid) continue;
    const hash = JSON.stringify([...lines].sort(([a], [b]) => a.localeCompare(b)));
    let group = groups.get(hash);
    if (!group) { group = { hash, count: 0 }; groups.set(hash, group); }
    group.count++;
    if (!group.sampleOrderId || Date.parse(order.ngay_tao) > Date.parse(group.lastOrderedAt)) {
      Object.assign(group, { sampleOrderId: order.ma_don_hang, lastOrderedAt: order.ngay_tao, items,
        total: items.reduce((sum, item) => sum + Number(item.gia_ban ?? item.don_gia ?? 0) * Number(item.so_luong), 0) });
    }
  }
  return [...groups.values()].filter(group => group.count >= threshold).sort((a, b) => b.count - a.count || Date.parse(b.lastOrderedAt) - Date.parse(a.lastOrderedAt));
}

export async function loadFavouriteOrderHistory(api, userId, signal) {
  if (!userId) throw new Error('Bạn đăng nhập để xem đơn yêu thích nhé.');
  const orders = [], seen = new Set();
  for (let page = 1; page <= 100; page++) {
    const response = await api.get(`/customers/${encodeURIComponent(userId)}/orders`, { params: { limit: 100, page }, signal });
    const rows = response.data?.orders;
    if (!Array.isArray(rows)) throw new Error('Chưa tải được lịch sử đơn để tổng hợp đơn yêu thích.');
    let added = 0;
    for (const order of rows) if (order.ma_don_hang && !seen.has(order.ma_don_hang)) {
      seen.add(order.ma_don_hang); orders.push(order); added++;
    }
    if (rows.length < 100) return orders;
    if (!added) throw new Error('Chưa tải được đầy đủ lịch sử đơn. Bạn thử lại nhé.');
  }
  throw new Error('Lịch sử đơn chưa được tải đầy đủ. Bạn thử lại nhé.');
}
