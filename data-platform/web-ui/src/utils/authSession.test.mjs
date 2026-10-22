import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeAuthSession,accountStorageKey,shouldExpireSession} from './authSession.mjs';

test('authenticated identity is explicit and malformed boundaries fail closed', () => {
  const valid={authenticated:true,identity:'account:fixture:policy-v1',permissions:['analytics.read'],expires_at:4000000000};
  assert.equal(decodeAuthSession(valid),valid);
  for (const change of [{authenticated:false},{identity:null},{permissions:['ok',{}]},{expires_at:NaN}]) {
    assert.throws(()=>decodeAuthSession({...valid,...change}));
  }
  assert.throws(()=>decodeAuthSession({authenticated:false}));
});
test('development compatibility is explicit and cannot be inferred from missing authentication', () => {
  assert.equal(decodeAuthSession({mode:'explicit_development_browser',identity:'development-browser'}).identity,'development-browser');
  assert.throws(()=>decodeAuthSession({identity:'development-browser'}));
});
test('pending job storage separates users and policy versions without storing bearer tokens', () => {
  const keys=['account-A:v1','account-B:v1','account-A:v2',null].map(id=>accountStorageKey('pending',id));
  assert.equal(new Set(keys).size,4);
  assert.equal(keys[0],'pending:account-A:v1');
});
test('only protected API 401 expires the UI session; forbidden permissions stay a distinct result', () => {
  assert.equal(shouldExpireSession({status:401},'/api/ai/capabilities'),true);
  assert.equal(shouldExpireSession({status:403},'/api/ai/capabilities'),false);
  assert.equal(shouldExpireSession({status:401},'/api/auth/login'),false);
  assert.equal(shouldExpireSession({status:401},'https://another.example'),false);
});

test('expired-session drafts remain memory-only and require the same account and policy',async()=>{
  const {rememberAnalysisDraft,readAnalysisDraft,retainAnalysisDraft,clearAnalysisDraft}=await import('./authSession.mjs');
  clearAnalysisDraft();
  const draft={question:'Doanh thu tháng 9',scope:{mode:'selected',filters:[{field:'city',operator:'eq',value:'Hà Nội'}]}};
  rememberAnalysisDraft('account-A:policy1',draft);
  draft.question='changed outside';
  assert.equal(readAnalysisDraft('account-A:policy1').question,'Doanh thu tháng 9');
  assert.equal(readAnalysisDraft('account-B:policy1'),null);
  assert.equal(readAnalysisDraft('account-A:policy2'),null);
  const read=readAnalysisDraft('account-A:policy1');read.scope.mode='all';
  assert.equal(readAnalysisDraft('account-A:policy1').scope.mode,'selected');
  retainAnalysisDraft('account-B:policy1');
  assert.equal(readAnalysisDraft('account-A:policy1'),null);
  rememberAnalysisDraft('account-A:policy1',{question:'x'.repeat(8001)});
  assert.equal(readAnalysisDraft('account-A:policy1'),null);
  rememberAnalysisDraft('account-A:policy1',{question:'draft'});clearAnalysisDraft();
  assert.equal(readAnalysisDraft('account-A:policy1'),null);
});
