import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {evaluateBranchAvailability, inventoryRows, closestCompatibleBranch} from './branchAvailability.js';
const cases = JSON.parse(readFileSync(new URL('../../../../contracts/customer-availability-cases.json', import.meta.url)));
const cart = [{ma_san_pham:901, ten_san_pham:'Produit Alpha'}];
for (const fixture of cases) test(fixture.name, () => {
  const result = evaluateBranchAvailability(cart, [{ma_san_pham:901,trang_thai:fixture.active}], fixture.inventory);
  const records = [...result.available_products,...result.unavailable_products,...result.unverified_products];
  assert.deepEqual(records,[{product_id:'901',product_name:'Produit Alpha',status:fixture.expected}]);
  assert.equal(result.is_fully_available,fixture.expected==='AVAILABLE');
});
test('exact branch cart matrix preserves canonical identity, deduplicates option lines', () => {
  const items = [...cart,{ma_san_pham:902,ten_san_pham:'Beta'},...cart];
  const products = items.map(item=>({...item,trang_thai:true}));
  const a = evaluateBranchAvailability(items,products,[{ma_san_pham:902,dang_kinh_doanh:false}]);
  const b = evaluateBranchAvailability(items,products,[]);
  assert.deepEqual(a.available_products.map(row=>row.product_id),['901']);
  assert.deepEqual(a.unavailable_products.map(row=>row.product_id),['902']);
  assert.deepEqual(b.available_products.map(row=>row.product_id),['901','902']);
  assert.equal(a.is_fully_available,false); assert.equal(b.is_fully_available,true);
});
test('closest fully compatible branch replaces partial/manual invalid selections', () => {
  const branches=[{code:'partial',distance:0.1,is_fully_available:false},
    {code:'far',distance:1,is_fully_available:true},{code:'near',distance:0.8,is_fully_available:true}];
  assert.equal(closestCompatibleBranch(branches,'partial'), 'near');
  assert.equal(closestCompatibleBranch(branches,'partial',true), 'near');
  assert.equal(closestCompatibleBranch(branches,'far',true), 'far');
  assert.equal(closestCompatibleBranch(branches.slice(0,1),'partial'), '');
});
test('failed, absent or malformed inventory remains unverified; successful empty override inherits default', () => {
  for (const payload of [undefined,null,{}, {items:{}}]) {
    assert.equal(evaluateBranchAvailability(cart,[{ma_san_pham:901,trang_thai:true}],inventoryRows(payload)).is_fully_available,false);
  }
  assert.equal(evaluateBranchAvailability(cart,[{ma_san_pham:901,trang_thai:true}],inventoryRows({items:[]})).is_fully_available,true);
});
