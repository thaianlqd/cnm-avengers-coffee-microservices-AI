import { BadRequestException } from '@nestjs/common';

// Calendar periods in Vietnam, with an exclusive upper bound.
export function salesWindow(period = 'month', anchor?: string, now = new Date()) {
  if (!['day', 'week', 'month', 'year', 'all'].includes(period)) throw new BadRequestException('Khoang thoi gian khong hop le');
  const local = anchor || new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(local)) throw new BadRequestException('Ngay phai co dang YYYY-MM-DD');
  const start = new Date(`${local}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== local) throw new BadRequestException('Ngay khong hop le');
  if (period === 'all') return { start: null, end: now };
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === 'month') start.setUTCDate(1);
  if (period === 'year') start.setUTCMonth(0, 1);
  const end = new Date(start);
  if (period === 'day') end.setUTCDate(end.getUTCDate() + 1);
  if (period === 'week') end.setUTCDate(end.getUTCDate() + 7);
  if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  if (period === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start: new Date(start.getTime() - 7 * 3600000), end: new Date(Math.min(end.getTime() - 7 * 3600000, now.getTime())) };
}

export async function productSales(manager: { query: Function }, period = 'month', anchor?: string) {
  const window = salesWindow(period, anchor);
  const rows = await manager.query(`
    SELECT ct.ma_san_pham::text AS product_id, SUM(ct.so_luong)::bigint AS sold_count,
           COUNT(DISTINCT d.ma_don_hang)::integer AS order_count
    FROM orders.chi_tiet_don_hang ct JOIN orders.don_hang d USING (ma_don_hang)
    WHERE d.trang_thai_don_hang = 'HOAN_THANH'
      AND d.trang_thai_thanh_toan = 'DA_THANH_TOAN' AND ct.so_luong > 0
      AND ($1::timestamptz IS NULL OR d.ngay_tao >= $1::timestamptz)
      AND d.ngay_tao < $2::timestamptz
    GROUP BY ct.ma_san_pham`, [window.start, window.end]);
  return new Map<string, { sold_count: number; order_count: number }>(rows.map(r => [String(r.product_id), {
    sold_count: Number(r.sold_count), order_count: Number(r.order_count),
  }]));
}

export async function salesBadges(manager: { query: Function }, products: any[]) {
  const sales = await productSales(manager);
  const ranked = products.filter(p => p.trang_thai !== false && (sales.get(String(p.ma_san_pham))?.sold_count || 0) > 0)
    .sort((a, b) => (sales.get(String(b.ma_san_pham))?.sold_count || 0) - (sales.get(String(a.ma_san_pham))?.sold_count || 0)
      || Number(a.ma_san_pham) - Number(b.ma_san_pham));
  const cutoff = ranked.length ? sales.get(String(ranked[Math.min(9, ranked.length - 1)].ma_san_pham))!.sold_count : Infinity;
  return products.map(p => ({ ...p, ...(sales.get(String(p.ma_san_pham)) || { sold_count: 0, order_count: 0 }),
    la_hot: p.trang_thai !== false && (sales.get(String(p.ma_san_pham))?.sold_count || 0) >= cutoff,
    bestseller_period: 'month',
  }));
}
