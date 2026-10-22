import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journeyProgress, journeyWaypoints, measuredRouteSummary, mapPinHtml } from './deliveryMapPresentation.js';
test('picked-up journeys skip the shop detour; known batch stops preserve their server order', () => {
  const store={latitude:10,longitude:106}, driver={latitude:10.1,longitude:106.1}, destination={latitude:10.2,longitude:106.2}, other={latitude:10.3,longitude:106.3};
  assert.deepEqual(journeyWaypoints({store,driver,destination,status:'IN_TRANSIT'}),[driver,destination]);
  assert.deepEqual(journeyWaypoints({store,driver,destination,status:'PICKING_UP'}),[driver,store,destination]);
  assert.deepEqual(journeyWaypoints({store,driver,destination,status:'IN_TRANSIT',otherDestinations:[other]}),[driver,other,destination]);
  assert.deepEqual(journeyWaypoints({store,driver,destination,status:'DELIVERED'}),[store,destination]);
  assert.deepEqual(journeyWaypoints({destination:{latitude:NaN,longitude:106}}),[]);
});
test('the journey uses delivery state; waiting for a driver is not a completed pickup', () => {
  assert.equal(journeyProgress('DANG_GIAO',false).step,-1);
  assert.equal(journeyProgress('CONFIRMED').step,0);
  assert.equal(journeyProgress('PICKING_UP').step,1);
  assert.equal(journeyProgress('IN_TRANSIT').step,2);
  assert.equal(journeyProgress('DELIVERED').step,3);
  assert.equal(journeyProgress('CANCELLED').closed,true);
});
test('ETA and road distance are rendered only for a measured valid route, without assumed speed', () => {
  assert.equal(measuredRouteSummary(null),null);
  assert.equal(measuredRouteSummary({ distance:5 }),null);
  assert.equal(measuredRouteSummary({ distance:NaN,duration:3 }),null);
  assert.deepEqual(measuredRouteSummary({distanceKm:1.7,durationMinutes:5.2}),{ distance:'1.7 km',duration:'~6 phút' });
  assert(mapPinHtml('store').includes('<svg'));
});
