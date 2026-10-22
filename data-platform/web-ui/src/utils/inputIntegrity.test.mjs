import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightView,createPreflightClient,applyFix} from './preflightPresentation.mjs';
import {detectedScope} from './missionWorkspace.mjs';

test('pending, unavailable and missing decisions all block submit, without claiming all scope',()=>{
  for(const state of [{pending:true},{error:'offline'},{}])assert.equal(preflightView(null,state).blocked,true);
  assert.match(detectedScope(null).summary,/Chờ kiểm tra/);
  const r={can_submit:false,input_validation:{slots:[{kind:'entity',label:'Tỉnh',state:'PRESENT_UNRESOLVED',raw:'qzxn',reason:'input_entity_unresolved'}]}};
  assert.match(detectedScope(r).summary,/qzxn/);
  assert.doesNotMatch(detectedScope(r).summary,/Toàn/);
  assert.match(preflightView(r).chips[0].label,/chưa xác minh/);
});

test('cancel invalidates even an uncancellable transport and responses carry their exact payload identity',async()=>{
  let timer,respond;const results=[];
  const client=createPreflightClient({setTimer:fn=>(timer=fn,1),clearTimer:()=>{},
    fetchImpl:()=>new Promise(r=>respond=r),onResult:(...args)=>results.push(args)});
  const payload={question:'doanh thu',time:{mode:'auto'}};
  client.request(payload);timer();client.cancel();
  respond({ok:true,json:async()=>({can_submit:true})});await new Promise(r=>setTimeout(r,0));
  assert.equal(results.length,0);
  client.request(payload);timer();respond({ok:true,json:async()=>({can_submit:true})});await new Promise(r=>setTimeout(r,0));
  assert.equal(results[0][3],JSON.stringify(payload));
});

test('server span fixes preserve emoji and reject stale draft spans',()=>{
  const question='😊 doanh thu tỉnh qzxn',start=Array.from(question).length-4;
  const fix={kind:'replace_span',start,end:start+4,old_text:'qzxn',new_text:'Hà Nội'};
  assert.deepEqual(applyFix(question,fix),{question:'😊 doanh thu tỉnh Hà Nội'});
  assert.equal(applyFix(question.replace('qzxn','zbnv'),fix),null);
});
