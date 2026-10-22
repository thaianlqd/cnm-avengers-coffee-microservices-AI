import test from 'node:test';
import assert from 'node:assert/strict';
import {riskSummary} from './workspacePresentation.mjs';
import {mergeReconciliation} from './verificationPresentation.mjs';
import {applyFix} from './preflightPresentation.mjs';

test('typed redirect to free text preserves meaning and accepts a null mission',()=>{
  assert.deepEqual(applyFix('Tỷ lệ hủy và doanh thu',{kind:'switch_mission',patch:{mission:null}}),
    {question:'Tỷ lệ hủy và doanh thu',mission:null});
});

test('unmeasured risk signals never imply green',()=>{
  for(const status of ['no_data','insufficient_sample','execution_error']){
    const summary=riskSummary({signals:[{status}],counts:{}});
    assert.equal(summary.status,'gray');assert.equal(summary.total,0);
    assert.doesNotMatch(summary.headline,/đều trong ngưỡng/);
  }
});
test('low-is-bad followup preserves direction, applied scope and time',()=>{
  const scope=[{dimension:'city',operator:'eq',value:'Hà Nội'}],time={mode:'custom',start:'2026-09-01',end:'2026-09-30'};
  const summary=riskSummary({scope,time,signals:[{status:'red',operator:'lt',metric_label:'Tỷ lệ giao thành công',historical:true}]});
  assert.match(summary.followUps[0].text,/thấp nhất/);
  assert.deepEqual(summary.followUps[0].scope,scope);assert.deepEqual(summary.followUps[0].time,time);
});
test('oracle mismatch downgrades verified report',()=>{
  const v=mergeReconciliation({status:'verified',metrics:[{id:'numeric_reconciliation',passed:0,total:0}]},
    {numeric:[{status:'mismatch'}],independent_oracle:{accuracy_pct:0,matched:0,eligible:1}});
  assert.equal(v.status,'attention');
});
