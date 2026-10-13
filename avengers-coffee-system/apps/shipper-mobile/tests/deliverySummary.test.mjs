import test from 'node:test'
import assert from 'node:assert/strict'
import { deliveryArray, deliveriesInRange, summarizeDeliveries } from '../src/lib/deliverySummary.mjs'
test('income counts delivered fees, keeps zero fees, excludes COD and failed orders', () => {
 const report = summarizeDeliveries([{ status: 'DELIVERED', delivery_fee: '17000', cod_amount: 99000 },{ status: 'DELIVERED', delivery_fee: 0 },{ status: 'FAILED', delivery_fee: 15000 }])
 assert.equal(report.total_income,17000); assert.equal(report.completed,2); assert.equal(report.failed,1); assert.equal(report.success_rate,67)
})
test('missing fees and delivery times stay unknown instead of fabricated estimates', () => {
 assert.equal(summarizeDeliveries([{ status: 'DELIVERED', delivery_fee: null }]).total_income,null)
 assert.equal(summarizeDeliveries([]).success_rate,null)
 assert.equal(summarizeDeliveries([]).avg_delivery_time,null)
})
test('daily earnings follow completion date, not assignment date', () => {
 const now = new Date(2026,9,12,22), earlier = new Date(2026,9,11,23), today = new Date(2026,9,12,1)
 const items = [{ id: 'old', status: 'DELIVERED', assigned_at: today, delivered_at: earlier },{ id: 'done', status: 'DELIVERED', assigned_at: earlier, delivered_at: today },{ id: 'bad', delivered_at: 'invalid' }]
 assert.deepEqual(deliveriesInRange(items,'today',now).map(d => d.id),['done'])
})
test('week includes seven calendar days and accepts actual API envelopes', () => {
 const now = new Date(2026,9,12,22)
 const items = [{ id: 'included', delivered_at: new Date(2026,9,6) },{ id: 'excluded', delivered_at: new Date(2026,9,5,23,59) }]
 assert.deepEqual(deliveriesInRange(items,'week',now).map(d => d.id),['included'])
 assert.deepEqual(deliveryArray({ items }),items); assert.deepEqual(deliveryArray({ data: { message: 'unavailable' } }),[])
})
