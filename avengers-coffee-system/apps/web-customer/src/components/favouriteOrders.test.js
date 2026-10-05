import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFavouriteOrders, loadFavouriteOrderHistory, favouriteItemDescription } from './favouriteOrders.js';
const cake = { ma_san_pham: 114, ten_san_pham: 'Bánh Matcha', gia_ban: 99000, so_luong: 2, kich_co: 'Nhỏ', toppings: [], custom_attributes: {} };
const coffee = { ma_san_pham: 60, ten_san_pham: 'Latte', gia_ban: 95000, so_luong: 1, kich_co: 'Lớn', toppings: ['Hạt Sen', 'Sữa Tươi'], luong_da: 'Ít đá', do_ngot: 'Ít ngọt', custom_attributes: { 'Cách uống': 'Nóng' } };
const order = (n, patch = {}) => ({ ma_don_hang: `order-${n}`, ngay_tao: `2026-10-0${n}T00:00:00Z`, trang_thai_don_hang: 'HOAN_THANH', trang_thai_thanh_toan: 'DA_THANH_TOAN', chi_tiet: [structuredClone(cake), structuredClone(coffee)], ...patch });
test('five canonical combinations survive item/option ordering and historical price changes', () => {
  const rows = [1,2,3,4,5].map(n => order(n));
  rows[4].chi_tiet.reverse(); rows[4].chi_tiet[0].toppings.reverse(); rows[4].chi_tiet[0].gia_ban = 100000;
  const groups = groupFavouriteOrders(rows.reverse());
  assert.equal(groups.length, 1); assert.equal(groups[0].count, 5);
  assert.equal(groups[0].sampleOrderId, 'order-5'); assert.equal(groups[0].total, 298000);
  assert.equal(groups[0].items[0].kich_co, 'Lớn');
  assert.match(favouriteItemDescription(coffee), /Size: Lớn.*Hạt Sen, Sữa Tươi/);
});
test('same products group despite different quantities/options, using the newest configuration', () => {
  for (const patch of [{ kich_co: 'Nhỏ' }, { so_luong: 2 }, { toppings: ['Hạt Sen'] }, { do_ngot: 'Không ngọt' },
      { loai_sua: 'Yến mạch' }, { custom_attributes: { 'Cách uống': 'Lạnh' } }, { ghi_chu: 'Không sữa' }]) {
    const rows = [1,2,3,4,5].map(n => order(n)); Object.assign(rows[4].chi_tiet[1], patch);
    assert.equal(groupFavouriteOrders(rows)[0].count, 5);
    assert.deepEqual(groupFavouriteOrders(rows)[0].items, rows[4].chi_tiet);
  }
});
test('identical split lines combine quantities without counting an order twice', () => {
  const rows = [1,2,3,4,5].map(n => order(n));
  rows[4].chi_tiet = [{ ...cake, so_luong: 1 }, { ...cake, so_luong: 1 }, coffee];
  assert.equal(groupFavouriteOrders([...rows, rows[0]])[0].count, 5);
});
test('four occurrences, cancelled, failed and refunded orders do not create a favourite', () => {
  const rows = [1,2,3,4].map(n => order(n));
  rows.push(order(5, { trang_thai_don_hang: 'DA_HUY' }), order(6, { trang_thai_thanh_toan: 'THAT_BAI' }), order(7, { trang_thai_thanh_toan: 'DA_HOAN_TIEN' }));
  assert.deepEqual(groupFavouriteOrders(rows), []);
});
test('history pages include older qualifying combinations beyond first 100 orders', async () => {
  const pages = [Array.from({ length: 100 }, (_, n) => order(n, { ma_don_hang: `other-${n}`, chi_tiet: [{ ...cake, ma_san_pham: 1000 + n, so_luong: n + 1 }] })), [1,2,3,4,5].map(n => order(n))];
  const calls = [], signal = new AbortController().signal;
  const api = { get: async (url, options) => { calls.push([url, options]); return { data: { orders: pages[options.params.page - 1] } }; } };
  const result = await loadFavouriteOrderHistory(api, 'owned-customer', signal);
  assert.equal(result.length, 105); assert.equal(groupFavouriteOrders(result)[0].count, 5);
  assert.equal(calls.length, 2); assert.equal(calls[0][0], '/customers/owned-customer/orders');
  assert.deepEqual(calls.map(([, x]) => x.params), [{ limit: 100, page: 1 }, { limit: 100, page: 2 }]);
  assert.equal(calls[1][1].signal, signal);
});
test('API failure/malformed data/repeated full page cannot masquerade as empty history', async () => {
  await assert.rejects(loadFavouriteOrderHistory({ get: async () => { throw new Error('API down'); } }, 'user'), /API down/);
  await assert.rejects(loadFavouriteOrderHistory({ get: async () => ({ data: {} }) }, 'user'), /Chưa tải/);
  const rows = Array.from({length: 100}, (_, n) => order(n));
  await assert.rejects(loadFavouriteOrderHistory({ get: async () => ({ data: {orders: rows} }) }, 'user'), /đầy đủ/);
});
test('last page duplicate order is deduplicated across pagination', async () => {
  let page = 0;
  const first = Array.from({length: 100}, (_, n) => order(n));
  const api = { get: async () => ({ data: { orders: page++ ? [first[99], order(101)] : first } }) };
  assert.equal((await loadFavouriteOrderHistory(api, 'user')).length, 101);
});

test('different product sets remain separate and duplicate product lines do not change the set', () => {
  const rows = [1,2,3,4,5].map(n => order(n));
  rows[4].chi_tiet.push({ ...coffee, toppings: [], so_luong: 7 });
  assert.equal(groupFavouriteOrders(rows)[0].count, 5);
  rows[4].chi_tiet.push({ ...cake, ma_san_pham: 999 });
  assert.deepEqual(groupFavouriteOrders(rows), []);
});
