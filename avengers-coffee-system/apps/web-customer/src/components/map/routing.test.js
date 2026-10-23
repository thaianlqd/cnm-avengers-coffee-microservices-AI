import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRoadRoute } from '../../lib/maps/deliveryRouting.mjs';
import { distanceKm } from '../../lib/maps/nearbyStores.mjs';
const points=[{latitude:10,longitude:106},{latitude:10.1,longitude:106.1}];
const vietmap={paths:[{distance:1500,time:180000,points:{coordinates:[[106,10],[106.1,10.1]]}}]};
const osrm={routes:[{distance:2100,duration:240,geometry:{coordinates:[[106,10],[106.1,10.1]]}}]};
test('VietMap motorcycle first; valid road units, no fallback request on success',async()=>{
  const calls=[];const route=await fetchRoadRoute(points,{key:'fixture',fetcher:async url=>{calls.push(url);return {ok:true,json:async()=>vietmap}}});
  assert.equal(calls.length,1);assert.match(calls[0],/vehicle=motorcycle/);assert.equal(route.distanceKm,1.5);assert.equal(route.durationMinutes,3);assert.equal(route.approximate,false);
});
test('VietMap unavailable or malformed falls back to OSRM with lng,lat and honest vehicle',async()=>{
  for(const body of [null,{paths:[{points:{coordinates:[]}}]}]){
    const calls=[];const route=await fetchRoadRoute(points,{key:'fixture',fetcher:async url=>{calls.push(url);return {ok:body!==null||url.includes('osrm'),json:async()=>url.includes('osrm')?osrm:body}}});
    assert.equal(calls.length,2);assert.match(calls[1],/106,10;106.1,10.1/);assert.equal(route.provider,'osrm');assert.equal(route.vehicle,'driving');assert.equal(route.durationMinutes,4);
  }
});
test('no key can use OSRM; malformed providers never become a straight-line route',async()=>{
  const route=await fetchRoadRoute(points,{fetcher:async()=>({ok:true,json:async()=>osrm})});assert.equal(route.approximate,true);
  await assert.rejects(fetchRoadRoute(points,{fetcher:async()=>({ok:true,json:async()=>({routes:[]})})}));
});
test('cancelled route does not start fallback; nearby distance rejects missing/GPS outside bounds',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(fetchRoadRoute(points,{key:'fixture',signal:controller.signal,fetcher:async()=>{calls++;controller.abort();throw new Error('cancelled')}}));assert.equal(calls,1);
  assert.equal(distanceKm({lat:10,lng:106},{lat:10,lng:106}),0);assert.equal(distanceKm(null,{lat:10,lng:106}),null);assert.equal(distanceKm({lat:91,lng:1},{lat:1,lng:1}),null);
  assert.ok(Math.abs(distanceKm({lat:10,lng:106},{lat:10.01,lng:106})-1.112)<0.002);
});
