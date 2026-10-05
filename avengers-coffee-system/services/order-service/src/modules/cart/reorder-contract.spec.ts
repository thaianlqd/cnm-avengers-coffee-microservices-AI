import { CartService } from './cart.service';
import { DonHang } from '../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../thanh-toan/entities/chi-tiet-don-hang.entity';

function runtime() {
  const old = { ma_don_hang: 'old-order', chi_tiet: [{ id: 2, ma_san_pham: 60, so_luong: 2, kich_co: 'Lớn', toppings: ['Foam'], luong_da: 'Ít đá', do_ngot: 'Thêm ngọt' }] };
  const cart: any[] = [{ id: 1, ma_san_pham: 1, so_luong: 1, size: 'Nhỏ', toppings: [] }];
  const repo = { find: async () => cart, create: x => x, save: jest.fn(async x => x) };
  const orderRepo = { findOne: async ({ where }) => where.ma_nguoi_dung === 'customer' ? old : null };
  const details = { find: async () => old.chi_tiet };
  let unavailable = false;
  const manager: any = { getRepository: cls => cls === DonHang ? orderRepo : cls === ChiTietDonHang ? details : repo,
    query: async sql => sql.includes('bien_the_san_pham') ? [{ ten_thuoc_tinh: 'Size', gia_tri: 'Lớn', phu_thu: 79000 }, { ten_thuoc_tinh: 'Topping', gia_tri: 'Foam', phu_thu: 11000 }] :
      [{ ma_san_pham: 60, ten_san_pham: 'Latte Tiramisu', trang_thai: !unavailable, gia_ban: 69000, sizes: { Lớn: 79000 }, toppings: { Foam: 11000 }, luong_da: { 'Ít đá': 0 }, do_ngot: { 'Thêm ngọt': 0 } }] };
  const service: any = Object.create(CartService.prototype);
  service.executeCartMutation = jest.fn(async (_uid, _kind, _op, _payload, callback) => callback(manager, { cart_version: 3 }));
  service.finalizedMutation = jest.fn(async () => ({ items: cart }));
  return { old, cart, repo, service, unavailable: () => { unavailable = true; } };
}
test('append old configuration with fresh price, keeping existing cart', async () => {
  const r = runtime();
  await r.service.datLaiVaoGio('customer', { order_id: 'old-order', expected_cart_version: 3, expected_subtotal: 180000 }, 'one-action');
  expect(r.cart[0].ma_san_pham).toBe(1);
  expect(r.repo.save).toHaveBeenCalledWith(expect.objectContaining({ size: 'Lớn', so_luong: 2, gia_ban: 90000, toppings: ['Foam'], luong_da: 'Ít đá', do_ngot: 'Thêm ngọt' }));
  expect(r.service.executeCartMutation).toHaveBeenCalledWith('customer', 'REORDER', 'one-action', expect.anything(), expect.any(Function));
});
test.each([{ expected_cart_version: 2 }, { expected_revision: 'stale' }, { expected_subtotal: 1 }])('stale preview rejects before inserting cart lines %j', async patch => {
  const r = runtime();
  await expect(r.service.datLaiVaoGio('customer', { order_id: 'old-order', ...patch }, 'action')).rejects.toThrow();
  expect(r.repo.save).not.toHaveBeenCalled();
});
test('another customer order cannot be reordered', async () => {
  const r = runtime();
  await expect(r.service.datLaiVaoGio('other', { order_id: 'old-order' }, 'action')).rejects.toThrow();
  expect(r.repo.save).not.toHaveBeenCalled();
});
test('all lines validated before first write, including inactive product and removed topping', async () => {
  const r = runtime();
  r.old.chi_tiet.push({ ...r.old.chi_tiet[0], id: 3, toppings: ['Removed topping'] });
  await expect(r.service.datLaiVaoGio('customer', { order_id: 'old-order' }, 'action')).rejects.toThrow();
  expect(r.repo.save).not.toHaveBeenCalled();
  r.old.chi_tiet.pop();
  r.unavailable();
  await expect(r.service.datLaiVaoGio('customer', { order_id: 'old-order' }, 'action')).rejects.toThrow();
  expect(r.repo.save).not.toHaveBeenCalled();
});
