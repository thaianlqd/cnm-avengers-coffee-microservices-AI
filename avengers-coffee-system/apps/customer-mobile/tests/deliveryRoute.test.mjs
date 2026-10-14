import test from 'node:test'
import assert from 'node:assert/strict'
import { routePoints, parseRoute } from '../src/lib/deliveryRoute.mjs'
import { coordinate } from '../src/lib/trackingSession.js'
const driver = { latitude: 10.77, longitude: 106.68 }, store = { latitude: 10.78, longitude: 106.69 }, destination = { latitude: 10.79, longitude: 106.7 }
const delivery = { order: { trang_thai_don_hang: 'DANG_GIAO' }, tracking: { store_location: store, destination_location: destination }, shipper_location: driver, shipper_delivery: { status: 'PICKING_UP' } }
test('before pickup the route visits the store; after pickup it goes directly to the delivery address', () => {
  assert.deepEqual(routePoints(delivery,coordinate), [driver,store,destination])
  assert.deepEqual(routePoints({ ...delivery, shipper_delivery: { status: 'IN_TRANSIT' } },coordinate), [driver,destination])
})
test('missing GPS is not replaced by a fake driver; completed routes no longer follow the driver', () => {
  assert.deepEqual(routePoints({ ...delivery, shipper_location: null },coordinate), [store,destination])
  assert.deepEqual(routePoints({ ...delivery, order: { trang_thai_don_hang: 'HOAN_THANH' } },coordinate), [store,destination])
  assert.deepEqual(routePoints({ tracking: {} },coordinate), [])
})
test('road geometry converts longitude/latitude and millisecond ETA without rounding away real distance', () => {
  assert.deepEqual(parseRoute({ paths: [{ points: { coordinates: [[106.68,10.77],[106.69,10.78]] }, distance: 520, time: 90000 }] }), { coordinates: [driver,store], distanceKm: .52, durationMinutes: 1.5 })
  assert.throws(() => parseRoute({ paths: [{ points: { coordinates: [[106,10],[999,999]] }, distance: 1, time: 1 }] }))
  assert.throws(() => parseRoute({ paths: [{ points: { coordinates: [[106,10],[106.1,10.1]] }, distance: 5 }] }))
})
