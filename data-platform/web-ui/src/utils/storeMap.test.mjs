import test from 'node:test';
import assert from 'node:assert/strict';
import {storeCoordinates,storePointFeatures,STORE_COLORS} from './storeMap.mjs';

test('recorded GPS uses longitude/latitude order and retains zero-sales stores',()=>{
  const stores=[{store_id:'real',store:'Điểm bán',latitude:'16.068520',longitude:'108.224050',store_type:'KIOSK_NHUONG_QUYEN',revenue:0,orders:0,aov:null},
    {store_id:'missing',city:'Đà Nẵng',latitude:null,longitude:null,revenue:900}];
  const points=storePointFeatures(stores);
  assert.equal(points.features.length,1);
  assert.deepEqual(points.features[0].geometry.coordinates,[108.22405,16.06852]);
  assert.equal(points.features[0].properties.revenue,0);
  assert.equal(points.features[0].properties.color,STORE_COLORS.KIOSK_NHUONG_QUYEN);
  assert.equal(stores.length,2);
});

test('invalid pairs cannot create a store at a guessed city coordinate',()=>{
  for(const [latitude,longitude] of [[null,108],['',108],[true,108],[91,108],[16,181],[NaN,108],[16,Infinity],[0,0],['invalid',108]]){
    assert.equal(storeCoordinates({latitude,longitude,city:'Đà Nẵng'}),null);
  }
});
