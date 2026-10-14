import test from 'node:test';
import assert from 'node:assert/strict';
import { productUnitPrice } from './productPrice.js';

test('size is the complete price, not another charge on top of the base', () => {
  const product = { gia_ban: 69000, bien_the: { 'Kích thước': { Vừa: 69000, Lớn: 79000 }, Topping: { Foam: 11000 } } };
  assert.equal(productUnitPrice(product, '', { custom_attributes: { 'Kích thước': 'Vừa', Topping: [] } }), 69000);
  assert.equal(productUnitPrice(product, 'Lớn', { toppings: ['Foam'], custom_attributes: { 'Kích thước': 'Lớn', Topping: ['Foam'] } }), 90000);
});
test('legacy sizes and options match the same full-price/surcharge contract', () => {
  const product = { gia_ban: 49000, sizes: { Nhỏ: 49000, Lớn: 59000 }, toppings: { Foam: 11000 }, loai_sua: { 'Yến mạch': 8000 } };
  assert.equal(productUnitPrice(product, 'Lớn', { toppings: ['Foam'], loaiSua: 'Yến mạch' }), 78000);
  assert.equal(productUnitPrice({ gia_ban: 19000 }, '', {}), 19000);
});
test('zero price and paid non-size options are preserved', () => {
  assert.equal(productUnitPrice({ gia_ban: 19000, bien_the: { Size: { Mẫu: 0 }, 'Loại sữa': { 'Yến mạch': 8000 } } }, '', { custom_attributes: { Size: 'Mẫu', 'Loại sữa': 'Yến mạch' } }), 8000);
});
