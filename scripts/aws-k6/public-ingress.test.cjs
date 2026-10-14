const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createIngress } = require('./public-ingress.cjs');
const listen = s => new Promise(resolve => s.listen(0, '127.0.0.1', () => resolve(s.address().port)));
const get = (port,path,method='GET',headers={}) => new Promise((resolve,reject) => {
  const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
    const chunks=[]; res.on('data',b=>chunks.push(b)); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  }); req.on('error',reject); req.end();
});
test('allowlist rejects write/auth/admin/unexpected query before upstream; preserves full gzip',async t=>{
  let hits=0; let forwarded;
  const payload={items:Array.from({length:200},(_,i)=>({ma_chi_nhanh:String(i),ten_chi_nhanh:'Cà phê'})),total:200};
  const packed=gzipSync(JSON.stringify(payload));
  const origin=http.createServer((req,res)=>{hits++; forwarded=req.headers;res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip'});res.end(packed);});
  const originPort=await listen(origin);const ingress=createIngress(`http://127.0.0.1:${originPort}`);const port=await listen(ingress);
  t.after(()=>{ingress.closeAllConnections();origin.closeAllConnections();ingress.close();origin.close();});
  for(const [path,method] of [['/users/me','GET'],['/news/admin/list','GET'],['/news?limit=101','GET'],['/menu/san-pham','POST'],['/menu/san-pham?x=1','GET']]) assert.equal((await get(port,path,method)).status,404);
  assert.equal(hits,0);
  const r=await get(port,'/users/branches/public','GET',{'Accept-Encoding':'gzip','Authorization':'synthetic','Cookie':'synthetic'});
  assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],'gzip');assert.equal(r.headers['cache-control'],'no-store');
  assert.deepEqual(r.body,packed);assert.deepEqual(JSON.parse(gunzipSync(r.body)),payload);
  assert.equal(forwarded.authorization,undefined);assert.equal(forwarded.cookie,undefined);assert.equal(forwarded['accept-encoding'],'gzip');
  assert.equal(ingress.counters.requests,1);assert.equal(ingress.counters.denied,5);assert.equal(ingress.counters.errors,0);
});
