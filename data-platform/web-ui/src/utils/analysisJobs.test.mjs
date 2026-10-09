import test from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysisJob } from './analysisJobs.mjs';

const response = data => ({ ok: true, json: async () => data });
test('one submit and polling complete without another AI submission', async () => {
  const calls=[], checkpoints=[], stages=[];
  const replies=[{ job_id:'job',state:'planning' },{ job_id:'job',state:'executing' },{ job_id:'job',state:'completed',result:{ status:'success' } }];
  const result=await runAnalysisJob({key:'stable',input:{question:'Doanh thu'}},{fetcher:async(url,options)=>{calls.push([url,options]);return response(replies.shift());},wait:async()=>{},onCheckpoint:r=>checkpoints.push(r),onUpdate:r=>stages.push(r.state)});
  assert.equal(result.state,'completed');assert.equal(calls.filter(c=>c[1].method==='POST').length,1);
  assert.equal(calls[0][1].headers['Idempotency-Key'],'stable');assert.equal(checkpoints.at(-1).job_id,'job');
  assert.deepEqual(stages,['planning','executing','completed']);
});
test('refresh resumes the existing job using GET only', async()=>{
  const calls=[];
  const result=await runAnalysisJob({key:'stable',job_id:'job',input:{}},{fetcher:async(url,options)=>{calls.push(options);return response({state:'completed',result:{}});},wait:async()=>{}});
  assert.equal(result.state,'completed');assert.ok(calls.every(c=>!c.method));
});
test('lost submit checkpoints its original key before transport',async()=>{
  let saved;
  await assert.rejects(runAnalysisJob({key:'stable',input:{}},{onCheckpoint:r=>saved=r,fetcher:async()=>{throw Error('offline');}}));
  assert.equal(saved.key,'stable');assert.equal(saved.job_id,undefined);
});
test('poll retries never submit another job',async()=>{
  let count=0;
  const result=await runAnalysisJob({key:'stable',job_id:'job',input:{}},{wait:async()=>{},fetcher:async(url,options)=>{assert.equal(options.method,undefined);if(count++<2)throw Error('offline');return response({state:'completed'});}});
  assert.equal(result.state,'completed');assert.equal(count,3);
});
test('aborted old response cannot checkpoint a job over a new question',async()=>{
  const controller=new AbortController();let checkpoints=0;
  await assert.rejects(runAnalysisJob({key:'stable',input:{}},{signal:controller.signal,onCheckpoint:()=>checkpoints++,fetcher:async()=>{controller.abort();return response({job_id:'old',state:'planning'});}}),{name:'AbortError'});
  assert.equal(checkpoints,1);
});
