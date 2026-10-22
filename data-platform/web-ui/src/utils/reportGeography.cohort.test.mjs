import test from 'node:test';
import assert from 'node:assert/strict';
import { rankedCohort, cohortSummary, inCohort } from './reportGeography.mjs';

const report = { charts: [{ x_field: 'city', selection: 'Bottom N', ranking_limit: 2, data: [{ label: 'Ninh Thuận', value: 1 }, { label: 'Trà Vinh', value: 2 }] }] };
const provinces = [{ label: 'Ninh Thuận', revenue: 100, orders: 2, valid_orders:2, store_count: 1 }, { label: 'Trà Vinh', revenue: 300, orders: 2, valid_orders:2, store_count: 2 },
  { label: 'Hồ Chí Minh', revenue: 9000, orders: 90, valid_orders:90, store_count: 400 }];

test('I02 map summary uses the ranked cohort, not the whole network', () => {
  const cohort = rankedCohort(report);
  assert.equal(cohort.label, 'Bottom 2');
  assert.deepEqual(cohortSummary(provinces, cohort), { revenue: 400, orders: 4, valid_orders:4, aov: 100, store_count: 3, province_count: 2 });
  assert.equal(inCohort(cohort, 'Hồ Chí Minh'), false);
  // Positive control: reports without a city ranking keep the whole network.
  assert.equal(rankedCohort({ charts: [{ x_field: 'store', selection: 'Top N', data: [] }] }), null);
  assert.equal(cohortSummary(provinces, null).store_count, 403);
});

test('cohort AOV uses valid orders and retains all-order count as a separate measure',()=>{
  const cohort=rankedCohort(report);
  const rows=[{label:'Ninh Thuận',revenue:100000,orders:4,valid_orders:1,store_count:1},
    {label:'Trà Vinh',revenue:971000,orders:12,valid_orders:11,store_count:2},
    {label:'Hồ Chí Minh',revenue:9000000,orders:90,valid_orders:30,store_count:400}];
  const summary=cohortSummary(rows,cohort);
  assert.equal(summary.orders,16);
  assert.equal(summary.valid_orders,12);
  assert.equal(summary.aov,1071000/12);
  assert.notEqual(summary.aov,1071000/16);
  assert.equal(cohortSummary(rows.map((r,i)=>i===0?{...r,valid_orders:undefined}:r),cohort).aov,null);
});
