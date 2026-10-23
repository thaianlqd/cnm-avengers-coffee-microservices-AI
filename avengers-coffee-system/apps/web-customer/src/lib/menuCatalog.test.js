import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryIds, categoryPath, productsInCategory } from './menuCatalog.js';
const categories = [
  { ma_danh_muc: 101, ma_danh_muc_cha: null },
  { ma_danh_muc: 1, ma_danh_muc_cha: 101 },
  { ma_danh_muc: 2, ma_danh_muc_cha: 1 },
  { ma_danh_muc: 102, ma_danh_muc_cha: null },
];
test('category selection includes direct products and all descendants with mixed ID types', () => {
  const products = [{ ma_san_pham: 10, ma_danh_muc: '101' }, { ma_san_pham: 11, danhMuc: { ma_danh_muc: 2 } }, { ma_san_pham: 12, ma_danh_muc: 102 }];
  assert.deepEqual(productsInCategory(categories, products, 'group-101').map(p => p.ma_san_pham), [10, 11]);
  assert.deepEqual(categoryPath(categories, '2').map(c => c.ma_danh_muc), [101, 1, 2]);
  assert.deepEqual(productsInCategory(categories, products, 'unknown'), []);
});
test('malformed category cycles do not hang navigation or product filtering', () => {
  const cyclic = [{ ma_danh_muc: 1, ma_danh_muc_cha: 2 }, { ma_danh_muc: 2, ma_danh_muc_cha: 1 }];
  assert.equal(categoryIds(cyclic, 1).size, 2);
  assert.equal(categoryPath(cyclic, 1).length, 2);
});
