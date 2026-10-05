import { productSales, salesBadges, salesWindow } from './product-sales';
import { MenuService } from './modules/menu/menu.service';
const now = new Date('2026-10-04T08:00:00Z');
test.each([
  ['day', '2026-10-03', '2026-10-02T17:00:00.000Z', '2026-10-03T17:00:00.000Z'],
  ['week', '2026-01-01', '2025-12-28T17:00:00.000Z', '2026-01-04T17:00:00.000Z'],
  ['month', '2026-09-18', '2026-08-31T17:00:00.000Z', '2026-09-30T17:00:00.000Z'],
  ['year', '2025-02-18', '2024-12-31T17:00:00.000Z', '2025-12-31T17:00:00.000Z'],
])('Vietnam %s window', (period, anchor, start, end) => {
  const window = salesWindow(period, anchor, now);
  expect(window.start!.toISOString()).toBe(start);
  expect(window.end.toISOString()).toBe(end);
});
test('current period ends at now, excludes future orders', () => expect(salesWindow('month', undefined, now).end).toEqual(now));
test.each(['2026-02-30', 'nonsense', '2026-2-3'])('reject invalid date %s', anchor => expect(() => salesWindow('day', anchor, now)).toThrow());
test('aggregate quantities from completed paid orders only', async () => {
  const query = jest.fn(async () => [{ product_id: '1', sold_count: '20', order_count: '4' }]);
  const sales = await productSales({ query }, 'all');
  expect(sales.get('1')).toEqual({ sold_count: 20, order_count: 4 });
  const sql = (query.mock.calls[0] as any)[0];
  expect(sql).toContain("trang_thai_don_hang = 'HOAN_THANH'");
  expect(sql).toContain("trang_thai_thanh_toan = 'DA_THANH_TOAN'");
  expect(sql).toContain('SUM(ct.so_luong)');
});
test('monthly badges ignore manual hot flags; no zero sales badges; ties retained', async () => {
  const products = Array.from({ length: 12 }, (_, i) => ({ ma_san_pham: i + 1, trang_thai: true, la_hot: true }));
  const query = async () => products.slice(0, 11).map((p, i) => ({ product_id: String(p.ma_san_pham), sold_count: i >= 9 ? 10 : 100 - i, order_count: 1 }));
  const badges = await salesBadges({ query }, products);
  expect(badges.filter(p => p.la_hot)).toHaveLength(11);
  expect(badges[11].la_hot).toBe(false);
});
test('detail endpoint returns the same counts and badge as cards, including zero sales', async () => {
  const products = [{ ma_san_pham: 3, trang_thai: true, la_hot: false }, { ma_san_pham: 4, trang_thai: true, la_hot: true }];
  const repo: any = { find: async () => products, manager: { query: async () => [{ product_id: '3', sold_count: '12', order_count: '7' }] } };
  const service = new MenuService(repo, {} as any);
  const cards = await service.layTatCaSanPham();
  expect(await service.layChiTietSanPham(3)).toEqual(cards[0]);
  expect(await service.layChiTietSanPham(4)).toMatchObject({ sold_count: 0, order_count: 0, la_hot: false });
  expect(await service.layChiTietSanPham(999)).toBeNull();
});
