import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export function orderRevision(order: any) {
  return crypto.createHash('sha256').update(JSON.stringify({
    status: order.trang_thai_don_hang, payment: order.trang_thai_thanh_toan,
    method: order.phuong_thuc_thanh_toan, total: Number(order.tong_tien),
    address: order.dia_chi_giao_hang, slot: order.khung_gio_giao, note: order.ghi_chu,
    updated: order.ngay_cap_nhat,
    items: [...(order.chi_tiet || [])].sort((a, b) => a.id - b.id).map(({ don_hang, ...r }) => r),
  })).digest('hex');
}

const key = (v: any) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().toLowerCase();
const labels = (v: any) => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : x?.name || x?.label).filter(Boolean) : Object.keys(v || {});

// Reuse Menu's canonical values and variant-price semantics; never trust client price/name.
export async function canonicalOrderLine(manager: { query: Function }, item: any) {
  const pid = Number(item.ma_san_pham), qty = Number(item.so_luong);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(qty) || qty <= 0 || qty > 999) throw new BadRequestException('Mon va so luong khong hop le');
  const [product] = await manager.query('SELECT * FROM menu.san_pham WHERE ma_san_pham=$1', [pid]);
  if (!product || !product.trang_thai) throw new BadRequestException('Mon khong con duoc ban');
  const variants = await manager.query(`SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
    FROM menu.bien_the_san_pham bt JOIN menu.thuoc_tinh tt USING (ma_thuoc_tinh) WHERE bt.ma_san_pham=$1`, [pid]);
  const cfg: any = {};
  for (const field of ['kich_co', 'toppings', 'luong_da', 'do_ngot', 'loai_sua']) {
    let choices = labels(product[field === 'kich_co' ? 'sizes' : field]);
    // The existing cart/order contract uses Nhỏ for products with no size selector.
    if (field === 'kich_co' && !choices.length) choices = ['Nhỏ'];
    let defaultChoice = choices[0];
    if (field === 'kich_co' && choices.length > 1) {
      const basePrice = Number(product.gia_ban);
      const matchBase = choices.find(c => Number(product.sizes?.[c]) === basePrice);
      defaultChoice = matchBase || choices.find(c => ['Vừa', 'Nhỏ'].includes(c)) || choices[0];
    }
    const raw = item[field] ?? (field === 'kich_co' ? defaultChoice : field === 'toppings' ? [] : null);
    const selected = field === 'toppings' ? raw : raw ? [raw] : [];
    if (!Array.isArray(selected) || new Set(selected.map(key)).size !== selected.length) throw new BadRequestException('Tuy chon khong hop le');
    const values = selected.map(v => choices.find(c => key(c) === key(v)));
    if (values.some(v => !v)) throw new BadRequestException(`Tuy chon ${field} khong thuoc Menu hien tai`);
    cfg[field] = field === 'toppings' ? values : values[0] || null;
  }
  const dynamic: any = {};
  for (const [name, value] of Object.entries(item.custom_attributes || {})) {
    if (['kich thuoc', 'size', 'topping', 'luong da', 'do ngot', 'loai sua'].includes(key(name))) continue;
    const group = Object.entries(product.bien_the || {}).find(([label]) => key(label) === key(name));
    if (!group) throw new BadRequestException('Tuy chon them khong thuoc Menu');
    const available = labels(group[1]);
    const values = (Array.isArray(value) ? value : [value]).map(v => available.find(c => key(c) === key(v)));
    if (values.some(v => !v)) throw new BadRequestException('Gia tri tuy chon them khong hop le');
    dynamic[group[0]] = Array.isArray(value) ? values : values[0];
  }
  const extras = new Set([...cfg.toppings, cfg.luong_da, cfg.do_ngot, cfg.loai_sua, ...Object.values(dynamic).flat()].filter(Boolean).map(key));
  const sizeRows = variants.filter(v => /size|kich thuoc/.test(key(v.ten_thuoc_tinh)));
  const size = sizeRows.find(v => key(v.gia_tri) === key(cfg.kich_co));
  const unit = Number(size?.phu_thu ?? product.gia_ban) + variants.filter(v => !sizeRows.includes(v) && extras.has(key(v.gia_tri))).reduce((n, v) => n + Number(v.phu_thu || 0), 0);
  if (!Number.isFinite(unit) || unit < 0) throw new BadRequestException('Gia Menu khong hop le');
  return { ma_san_pham: pid, ten_san_pham: product.ten_san_pham, so_luong: qty,
    gia_ban: unit, hinh_anh_url: product.hinh_anh_url, ...cfg,
    ghi_chu: item.ghi_chu ?? null, custom_attributes: dynamic };
}

export function amendedAmounts(order: any, items: any[], discount: number) {
  const oldSubtotal = (order.chi_tiet || []).reduce((s, i) => s + Number(i.gia_ban) * Number(i.so_luong), 0);
  const deliveryFee = Math.max(0, Number(order.tong_tien) - Math.max(0, oldSubtotal - Number(order.so_tien_giam || 0)));
  const subtotal = items.reduce((s, i) => s + Number(i.gia_ban) * Number(i.so_luong), 0);
  discount = Math.min(subtotal, Math.max(0, discount));
  return { subtotal, discount_amount: discount, delivery_fee: deliveryFee, final_total: subtotal - discount + deliveryFee };
}

// This voucher was already claimed by this order. Reprice its terms without consuming another use.
export async function claimedVoucherDiscount(manager: { query: Function }, order: any, items: any[]) {
  if (!order.ma_voucher) return 0;
  const [local] = await manager.query('SELECT * FROM orders.voucher WHERE ma_voucher=$1', [order.ma_voucher]);
  const isLocal = local && (!local.loai_phan_phoi || local.loai_phan_phoi === 'PUBLIC');
  const [promotion] = isLocal ? [] : await manager.query('SELECT * FROM identity.khuyen_mai WHERE ma_khuyen_mai=$1', [order.ma_voucher]);
  const terms = isLocal ? local : promotion;
  if (!terms) throw new BadRequestException('Chua the doi soat voucher cua don nay');
  const subtotal = items.reduce((s, i) => s + Number(i.gia_ban) * i.so_luong, 0);
  if (subtotal < Number(terms.don_hang_toi_thieu ?? terms.gia_tri_don_toi_thieu ?? 0)) return 0;
  const type = String(terms.loai || terms.loai_khuyen_mai || '').toUpperCase();
  let discount: number;
  if (type === 'PERCENT') discount = (isLocal ? Math.round : Math.floor)(subtotal * Number(terms.gia_tri) / 100);
  else if (type === 'FREE_TOPPING') discount = items.some(i => i.toppings?.length) ? Number(order.so_tien_giam || 0) : 0;
  else if (['FREE_ITEM', 'FREE_SHIPPING', 'FREESHIP'].includes(type)) discount = Number(order.so_tien_giam || 0);
  else discount = Number(terms.gia_tri || 0);
  if (terms.giam_toi_da !== null && terms.giam_toi_da !== undefined) discount = Math.min(discount, Number(terms.giam_toi_da));
  return Math.min(subtotal, Math.max(0, discount));
}
