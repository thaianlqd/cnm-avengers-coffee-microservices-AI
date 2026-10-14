const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {spawn}=require('node:child_process');
test('3k control token required; uploads bounded to existing job and whitelisted artifacts',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'k6-control-test-'));fs.writeFileSync(path.join(folder,'control-token'),'synthetic-test-token');
  fs.mkdirSync(path.join(folder,'job-one'));fs.writeFileSync(path.join(folder,'job-one','metadata.json'),'{}');
  fs.writeFileSync(path.join(folder,'control-job.json'),JSON.stringify({job_id:'job-one',action:'network'}));
  const child=spawn(process.execPath,[path.join(__dirname,'control-3k.cjs')],{env:{...process.env,CONTROL_FOLDER:folder}});
  t.after(()=>{child.kill();fs.rmSync(folder,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('server exit '+c)));});
  const call=(url,body,auth=true)=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:18082,path:url,method:body===undefined?'GET':'POST',headers:auth?{Authorization:'Bearer synthetic-test-token'}:{}},res=>{
      const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end(body);
  });
  assert.equal((await call('/job',undefined,false)).status,404);
  assert.deepEqual(JSON.parse((await call('/job')).body),{job_id:'job-one',action:'network'});
  assert.equal((await call('/upload/unknown/k6.json','{}')).status,404);
  assert.equal((await call('/upload/job-one/.env','synthetic')).status,404);
  assert.equal((await call('/upload/../k6.json','{}')).status,404);
  assert.equal((await call('/upload/job-one/k6.json','{"metrics":{}}')).status,200);
  assert.equal(fs.readFileSync(path.join(folder,'job-one','k6.json'),'utf8'),'{"metrics":{}}');
  assert.equal((await call('/boot',JSON.stringify({phase:'ready',k6_version:'synthetic',unapproved_field:'discard'}))).status,200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder,'boot.json'))),{phase:'ready',k6_version:'synthetic'});
});
