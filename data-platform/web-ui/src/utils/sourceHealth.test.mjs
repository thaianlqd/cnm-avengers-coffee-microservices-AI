import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceIssues} from './sourceHealth.mjs';

test('a blocked payment source exposes the failing load and its impact without blocking healthy sources',()=>{
  const issues=sourceIssues({data_coverage:{facts:{'silver.giao_dich_thanh_toan':{label:'Giao dịch thanh toán'}},data_health:{views:{
    'silver.giao_dich_thanh_toan':{status:'blocked',reasons:['last_load_failed'],impacted_metrics:['settled_payment_amount']},
    'silver.don_hang':{status:'healthy',reasons:[]},
  }}}});
  assert.equal(issues.length,1);assert.equal(issues[0].label,'Giao dịch thanh toán');assert.match(issues[0].reasons[0],/Lần nạp gần nhất thất bại/);
  assert.deepEqual(issues[0].metrics,['settled_payment_amount']);
});
test('old event dates alone never become a blocked source and an unrecognized reason remains visible',()=>{
  assert.deepEqual(sourceIssues({data_coverage:{facts:{survey:{stale:true}},freshness:{stale:true},data_health:{views:{survey:{status:'healthy'}}}}}),[]);
  assert.equal(sourceIssues({data_coverage:{data_health:{views:{source:{status:'unknown',reasons:['future_check']}}}}})[0].reasons[0],'Mã kiểm tra: future_check');
  assert.deepEqual(sourceIssues(null),[]);
});
