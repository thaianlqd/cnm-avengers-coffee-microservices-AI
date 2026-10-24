import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAcceptedDelivery, deliveryActionPath } from '../src/lib/deliveryAcceptance.mjs'
test('reserved orders remain unaccepted until the driver confirms through the order endpoint',()=>{
  const reserved={id:'reservation-1',ma_don_hang:'order-1',status:'PENDING'}
  assert.equal(isAcceptedDelivery(reserved.status),false)
  assert.equal(deliveryActionPath('driver-1',reserved,'accept'),'/shippers/driver-1/accept/order-1')
  assert.throws(()=>deliveryActionPath('driver-1',reserved,'confirm-pickup'),/nhận đơn trước/)
  const accepted={...reserved,id:'confirmed-2',status:'CONFIRMED'}
  assert.equal(isAcceptedDelivery(accepted.status),true)
  assert.equal(deliveryActionPath('driver-1',accepted,'confirm-pickup'),'/shippers/driver-1/deliveries/confirmed-2/confirm-pickup')
  assert.throws(()=>deliveryActionPath('driver-1',accepted,'accept'),/không còn chờ nhận/)
})
