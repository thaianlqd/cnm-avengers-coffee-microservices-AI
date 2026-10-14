import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationPresentation } from '../src/lib/notificationPresentation.mjs'
test('legacy order alerts have readable statuses and compact IDs without mutating their target', () => {
 const item={tieu_de:'Cap nhat trang thai don hang',noi_dung:'Don #c64ba6b0-679b-43b3-814e-114421e5d82d da chuyen sang trang thai DANG_GIAO.',du_lieu:{ma_don_hang:'c64ba6b0-679b-43b3-814e-114421e5d82d'}}
 assert.deepEqual(notificationPresentation(item),{title:'Cập nhật đơn hàng',body:'Đơn #c64ba6b0 đã chuyển sang trạng thái đang giao.',icon:'receipt-outline'})
 assert.equal(item.du_lieu.ma_don_hang,'c64ba6b0-679b-43b3-814e-114421e5d82d')
})
test('custom copy remains unchanged',()=>assert.equal(notificationPresentation({title:'Quà dành cho bạn',message:'Bạn có một món quà mới.'}).body,'Bạn có một món quà mới.'))
