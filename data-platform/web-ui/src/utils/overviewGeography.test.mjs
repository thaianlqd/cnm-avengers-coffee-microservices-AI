import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewGeography } from './overviewGeography.mjs';

test('province metrics aggregate scoped stores, combine aliases and retain zero-sales branches',()=>{
  const {snapshot,report}=overviewGeography({stores:[
    {store_code:'a',store_name:'A',city:'Hà Nội',total_revenue:900,total_orders:10,aov:100},
    {store_code:'b',store_name:'B',city:'Ha Noi',total_revenue:300,total_orders:8,aov:60},
    {store_code:'c',store_name:'C',city:'Đà Nẵng',total_revenue:0,total_orders:0,aov:0},
    {store_code:'d',store_name:'D',city:'Chưa xác định',total_revenue:100,total_orders:1,aov:100},
  ]},'7days','2026-10-20');
  assert.equal(snapshot.provinces.length,3);assert.equal(snapshot.summary.store_count,4);
  assert.equal(snapshot.provinces[0].revenue,1200);assert.equal(snapshot.provinces[0].orders,18);
  assert.equal(snapshot.provinces[0].aov,null,'all-status count cannot be used as a valid-order denominator');
  assert.equal(snapshot.summary.aov,null);assert.equal(snapshot.summary.revenue,1300);
  assert.equal(snapshot.provinces.find(p=>p.city==='Đà Nẵng').store_count,1);
  assert.equal(report.charts[0].data.find(p=>p.label==='Chưa xác định').value,100);
  assert.match(snapshot.period.label,/7 ngày qua/);assert.equal(snapshot.stores.find(s=>s.store_id==='a').aov,100);
});

test('a weighted AOV requires the valid-order cohort and missing money stays missing',()=>{
  const source={stores:[{store_code:'a',city:'Hà Nội',total_revenue:900,total_orders:20,valid_orders:9,aov:100},{store_code:'b',city:'Hà Nội',total_revenue:300,total_orders:12,valid_orders:1,aov:300}]};
  assert.equal(overviewGeography(source,'30days').snapshot.provinces[0].aov,120);
  source.stores[1].total_revenue=null;
  const missing=overviewGeography(source,'30days').snapshot;
  assert.equal(missing.summary.revenue,null);assert.equal(missing.provinces[0].aov,null);
});

test('kiosk cohorts use authoritative type codes, not kiosk words in store names',()=>{
  const stores=[{store_code:'main',store_name:'Kiosk trong tên nhưng là chi nhánh',city:'Hà Nội',store_type:'CHI_NHANH_CHINH',total_revenue:900,total_orders:12,valid_orders:9,aov:100},
    {store_code:'fran',store_name:'Cửa hàng A',city:'Hà Nội',store_type:'KIOSK_NHUONG_QUYEN',total_revenue:300,total_orders:4,valid_orders:3,aov:100},
    {store_code:'sat',store_name:'Cửa hàng B',city:'Đà Nẵng',store_type:'KIOSK_VE_TINH',total_revenue:100,total_orders:2,valid_orders:1,aov:100}];
  const franchise=overviewGeography({stores},'30days',null,'KIOSK_NHUONG_QUYEN').snapshot;
  assert.deepEqual(franchise.stores.map(s=>s.store_id),['fran']);assert.equal(franchise.summary.revenue,300);assert.equal(franchise.summary.aov,100);assert.equal(franchise.summary.orders,4);
  assert.deepEqual(overviewGeography({stores},'30days',null,'kiosks').snapshot.stores.map(s=>s.store_id),['fran','sat']);
});
