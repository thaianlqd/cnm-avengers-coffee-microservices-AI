import { amendedAmounts, canonicalOrderLine, claimedVoucherDiscount, orderRevision } from './order-amendment';

const product = { ma_san_pham: 60, ten_san_pham: 'Latte Tiramisu', trang_thai: true, gia_ban: 69000,
  sizes: { Nhỏ: 69000, Lớn: 79000 }, toppings: { 'Xốt Caramel': 5000, 'Kem Phô Mai Macchiato': 11000 },
  luong_da: { 'Ít đá': 0 }, do_ngot: { 'Thêm ngọt': 0 }, loai_sua: {}, bien_the: {} };
const variants = [{ ten_thuoc_tinh: 'Kích thước', gia_tri: 'Lớn', phu_thu: 79000 },
  { ten_thuoc_tinh: 'Topping', gia_tri: 'Xốt Caramel', phu_thu: 5000 },
  { ten_thuoc_tinh: 'Topping', gia_tri: 'Kem Phô Mai Macchiato', phu_thu: 11000 }];
const query = jest.fn(async (sql: string) => sql.includes('bien_the_san_pham') ? variants : [product]);
const item = { ma_san_pham: 60, so_luong: 1, kich_co: 'Lớn', toppings: ['Xốt Caramel', 'Kem Phô Mai Macchiato'], luong_da: 'Ít đá', do_ngot: 'Thêm ngọt', gia_ban: 1 };

test('current canonical size price plus extras, ignoring forged client price/name', async () => {
  const line = await canonicalOrderLine({ query }, { ...item, ten_san_pham: 'Fake' });
  expect(line.gia_ban).toBe(95000);
  expect(line.ten_san_pham).toBe('Latte Tiramisu');
  expect(line.toppings).toEqual(item.toppings);
  expect(line.luong_da).toBe('Ít đá');
  expect(line.do_ngot).toBe('Thêm ngọt');
});

test.each([0, -1, 1.5, NaN, 1000])('reject invalid quantity %s', async quantity => {
  await expect(canonicalOrderLine({ query }, { ...item, so_luong: quantity })).rejects.toThrow();
});
test.each([{ toppings: ['Unknown'] }, { toppings: ['Xốt Caramel', 'Xốt Caramel'] }, { kich_co: 'XL' }, { custom_attributes: { Secret: 'Free' } }])('reject invalid options %j', async patch => {
  await expect(canonicalOrderLine({ query }, { ...item, ...patch })).rejects.toThrow();
});
test('explicit removal of topping and clearing optional sweetness remain empty', async () => {
  const line = await canonicalOrderLine({ query }, { ...item, toppings: [], do_ngot: '' });
  expect(line.toppings).toEqual([]);
  expect(line.do_ngot).toBeNull();
  expect(line.gia_ban).toBe(79000);
});
test('inactive product cannot be edited into an order or reordered', async () => {
  await expect(canonicalOrderLine({ query: async () => [{ ...product, trang_thai: false }] }, item)).rejects.toThrow();
});
test('a cake without size options retains the existing default size and base price', async () => {
  const cake = { ma_san_pham: 120, ten_san_pham: 'Bánh Trung Thu Matcha', trang_thai: true,
    gia_ban: 99000, sizes: null, toppings: null, luong_da: null, do_ngot: null, loai_sua: null, bien_the: null };
  const manager = { query: async (sql: string) => sql.includes('bien_the_san_pham') ? [] : [cake] };
  const original = { ma_san_pham: 120, so_luong: 2, kich_co: 'Nhỏ', toppings: [] };
  const line = await canonicalOrderLine(manager, original);
  expect(line.kich_co).toBe('Nhỏ');
  expect(line.gia_ban).toBe(99000);
  await expect(canonicalOrderLine(manager, { ...original, kich_co: 'Lớn' })).rejects.toThrow();
  await expect(canonicalOrderLine(manager, { ...original, toppings: ['Hạt Sen'] })).rejects.toThrow();
});
test('preserve shipping and discount instead of overwriting total with subtotal', () => {
  const order = { tong_tien: 298000, so_tien_giam: 10000, chi_tiet: [{ gia_ban: 99000, so_luong: 2 }, { gia_ban: 95000, so_luong: 1 }] };
  expect(amendedAmounts(order, order.chi_tiet, 10000)).toEqual({ subtotal: 293000, delivery_fee: 15000, discount_amount: 10000, final_total: 298000 });
  expect(amendedAmounts(order, [{ gia_ban: 99000, so_luong: 1 }], 10000).final_total).toBe(104000);
});
test('revision changes on status, address, option and quantity, stable for item ordering', () => {
  const order = { trang_thai_don_hang: 'MOI_TAO', chi_tiet: [{ id: 1, toppings: [], so_luong: 1 }, { id: 2 }] };
  expect(orderRevision(order)).toBe(orderRevision({ ...order, chi_tiet: [...order.chi_tiet].reverse() }));
  for (const patch of [{ trang_thai_don_hang: 'DANG_GIAO' }, { dia_chi_giao_hang: 'New' }, { chi_tiet: [{ id: 1, toppings: ['Pearl'] }] }]) expect(orderRevision({ ...order, ...patch })).not.toBe(orderRevision(order));
});
test('reprice already claimed percent voucher with cap, no second usage write', async () => {
  const q = jest.fn(async (sql: string) => sql.includes('orders.voucher') ? [] : [{ loai_khuyen_mai: 'PERCENT', gia_tri: 15, giam_toi_da: 10000, gia_tri_don_toi_thieu: 50000 }]);
  expect(await claimedVoucherDiscount({ query: q }, { ma_voucher: 'USED' }, [{ gia_ban: 95000, so_luong: 1 }])).toBe(10000);
  expect(await claimedVoucherDiscount({ query: q }, { ma_voucher: 'USED' }, [{ gia_ban: 39000, so_luong: 1 }])).toBe(0);
  expect(q.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
