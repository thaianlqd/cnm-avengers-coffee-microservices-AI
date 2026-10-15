import test from 'node:test'
import assert from 'node:assert/strict'
import {routePoint, orderRoutePoints} from '../src/lib/routePoints.mjs'
test('order preview accepts numeric API coordinates and tracking envelopes',()=>{
  assert.deepEqual(orderRoutePoints({pickup_latitude:'10.802',pickup_longitude:'106.625',tracking:{destination_latitude:10.806,destination_longitude:106.621}}),{store:[10.802,106.625],destination:[10.806,106.621]})
})
test('missing, malformed and out-of-range points stay unknown rather than creating a map location',()=>{
  for(const point of [[null,106.6],['',106.6],[' ',106.6],['unknown',106.6],[91,106.6],[10,181],[0,0]])assert.equal(routePoint(...point),null)
  assert.deepEqual(orderRoutePoints({}),{store:null,destination:null})
})
test('a single valid endpoint remains usable when the other address has no coordinates',()=>{
  assert.deepEqual(orderRoutePoints({pickup_latitude:10.802,pickup_longitude:106.625,delivery_address:'Địa chỉ chưa có tọa độ'}),{store:[10.802,106.625],destination:null})
})
