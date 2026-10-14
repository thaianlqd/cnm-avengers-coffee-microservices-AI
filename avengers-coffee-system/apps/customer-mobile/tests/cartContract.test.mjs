import test from 'node:test'
import assert from 'node:assert/strict'
import { cartCount, cartItems, createCartService } from '../src/lib/cartContract.mjs'
import { catalogVariantRows, variantMap, variantPrice, normalizedValue } from '../src/lib/productOptions.mjs'
import { storeOpenState } from '../src/lib/storeHours.mjs'

test('cart badge counts quantities from server, including legacy envelopes', () => {
  assert.equal(cartCount({ items: [{ so_luong: 2 }, { quantity: 3 }] }), 5)
  assert.equal(cartCount([{ so_luong: 4 }]), 4)
  assert.deepEqual(cartItems({ message: 'unavailable' }), [])
})
test('cart mutations use server row identity and retain drink options and notes', async () => {
  const calls = [], api = Object.fromEntries(['get','post','patch','delete'].map(method => [method, async (...args) => { calls.push({ method, args }); return { items: [] } }]))
  const service = createCartService(api, () => 'operation-uuid')
  await service.add('customer', { ma_san_pham: 9, loai_sua: 'Hạnh nhân', custom_attributes: { Nhiệt: 'Nóng' }, ghi_chu: 'Mang đi' }, 2, { size: 'Vừa', toppings: ['Trân châu'] })
  assert.equal(calls[0].args[1].ma_san_pham, 9)
  assert.equal(calls[0].args[1].custom_attributes.ghi_chu, 'Mang đi')
  assert.equal(calls[0].args[1].loai_sua, 'Hạnh nhân')
  assert.equal(calls[0].args[1].so_luong, 2)
  assert.deepEqual(calls[0].args[1].toppings, ['Trân châu'])
  assert.equal(calls[0].args[2].headers['x-idempotency-key'], 'operation-uuid')
  await service.update(42, { so_luong: 3 })
  assert.equal(calls[1].args[0], '/cart/42')
  assert.deepEqual(calls[1].args[1], { so_luong: 3 })
  await service.reorder('customer', 'owned-order', { expected_revision: 'rev', expected_cart_version: 4, expected_subtotal: 95000 })
  assert.deepEqual(calls[2].args[1], { order_id: 'owned-order', expected_revision: 'rev', expected_cart_version: 4, expected_subtotal: 95000 })
})
test('milk is distinct from ice, size is full price and extras are surcharges', () => {
  const rows = [
    { ma_san_pham: 9, ten_thuoc_tinh: 'Size', gia_tri: 'Vừa', phu_thu: 49000 },
    { ma_san_pham: 9, ten_thuoc_tinh: 'Loại sữa', gia_tri: 'Hạnh nhân', phu_thu: 7000 },
    { ma_san_pham: 9, ten_thuoc_tinh: 'Lượng đá', gia_tri: 'Ít đá', phu_thu: 0 },
    { ma_san_pham: 9, ten_thuoc_tinh: 'Topping', gia_tri: 'Trân châu', phu_thu: 5000 },
  ]
  const options = variantMap(rows)['9']
  assert.deepEqual(options.loai_sua, { 'Hạnh nhân': 7000 })
  assert.deepEqual(options.luong_da, { 'Ít đá': 0 })
  assert.equal(variantPrice(39000, rows, { size: 'Vừa', loai_sua: 'Hạnh nhân', luong_da: 'Ít đá', toppings: ['Trân châu'], custom_attributes: { ghi_chu: 'Mang đi' } }), 61000)
  assert.equal(normalizedValue('CÀ PHÊ ĐÁ'), 'ca phe da')
})
test('store status uses Vietnam time and supports overnight hours without inventing status', () => {
  const overnight = { gio_mo_cua: '22:00', gio_dong_cua: '02:00' }
  assert.equal(storeOpenState(overnight, new Date('2026-10-12T17:30:00Z')), true)
  assert.equal(storeOpenState(overnight, new Date('2026-10-12T08:00:00Z')), false)
  assert.equal(storeOpenState({}, new Date()), null)
  assert.equal(storeOpenState({ ...overnight, status: 'INACTIVE' }, new Date('2026-10-12T17:30:00Z')), false)
})

test('catalog options use embedded attributes and retain custom groups', () => {
  const options = variantMap(catalogVariantRows([
    { ma_san_pham: 1, bien_the: { Size: { Vừa: 49000 }, Nhiệt: { Nóng: 0 }, 'Loại sữa': { 'Hạnh nhân': 7000 } } },
    { ma_san_pham: 2, sizes: { Nhỏ: 39000 }, toppings: { 'Trân châu': 5000 } },
    { ma_san_pham: 3 },
  ]))
  assert.deepEqual(options['1'].custom, { Nhiệt: { Nóng: 0 } })
  assert.equal(options['1'].loai_sua['Hạnh nhân'], 7000)
  assert.equal(options['2'].sizes.Nhỏ, 39000)
  assert.equal(options['2'].toppings['Trân châu'], 5000)
  assert.equal(options['3'], undefined)
})
