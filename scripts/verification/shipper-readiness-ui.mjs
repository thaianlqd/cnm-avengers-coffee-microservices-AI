// Exercise denied GPS, stale profiles, preview IDs and real accept navigation.
// API writes and account sessions are fixtures; no real orders/provider keys.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(process.env.SHIPPER_EXPORT),out=process.env.UI_ARTIFACTS||'/tmp/avengers-shipper-readiness-ui';await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
const driver={id:'s1',username:'qa',full_name:'QA shipper',status:'INACTIVE',branch_code:'D9'},order={id:'order-001',ma_don_hang:'order-001',branch_code:'D9',delivery_address:'Địa chỉ fixture',store_name:'Highlands QA',store_address:'Cửa hàng fixture',cod_amount:69000,delivery_fee:15000,items:[{ten_san_pham:'Cà phê QA',so_luong:1,gia_ban:69000}]};
const delivery={...order,id:'delivery-001',shipper_id:'s1',status:'CONFIRMED',order:{ma_don_hang:order.ma_don_hang,chi_tiet:[]}};
const errors=[],results=[];let browser,active;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 async function open({status='INACTIVE',statusFailure=false,acceptFailure=false,stale=false}={}){
  const ctx=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),calls=[];
  let current={...driver,status},accepted=false,staleResponses=0;
  await ctx.addInitScript(({driver,status})=>{
   localStorage.setItem('avengers_shipper_session',JSON.stringify({shipper:{...driver,status}}));localStorage.setItem('shipper_auth_token','fixture-only');
   const query=navigator.permissions.query.bind(navigator.permissions);
   navigator.permissions.query=options=>options.name==='geolocation'?Promise.resolve({state:'denied',onchange:null,addEventListener(){},removeEventListener(){}}):query(options);
   navigator.geolocation.getCurrentPosition=(_ok,fail)=>fail({code:1,message:'Fixture GPS denied'});
  },{driver,status});
  await ctx.routeWebSocket('**/*',s=>s.close());
  await ctx.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const path=url.pathname;calls.push({path,method:request.method()});let body={},code=200;
   if(path==='/users/branches/public')body=[{ma_chi_nhanh:'D9',ten_chi_nhanh:'Highlands QA',dia_chi:'Địa chỉ fixture'}];
   else if(path==='/shippers/s1/profile'){const snapshot={...current};if(stale){await pause(1800);staleResponses++}body=snapshot;}
   else if(path==='/shippers/s1/status'){if(statusFailure){code=500;body={message:'Máy chủ chưa lưu được trạng thái.'}}else{current={...current,status:request.postDataJSON().status};await pause(200);body={success:true,status:current.status}}}
   else if(path==='/shippers/available-orders')body=accepted?[]:[order];
   else if(path==='/shippers/s1/deliveries')body=accepted?[delivery]:[];
   else if(path==='/shippers/s1/accept/order-001'){if(acceptFailure){code=409;body={message:'Đơn đã được tài xế khác nhận.'}}else{assert.equal(current.status,'ACTIVE');accepted=true;body={success:true,delivery}}}
   else if(path==='/shippers/s1/deliveries/delivery-001')body=delivery;
   else if(path==='/shippers/s1/deliveries/order-001'){code=404;body={message:'Delivery not found'}}
   else if(path.endsWith('/active-batch'))body={active:false};
   return route.fulfill({status:code,json:body,headers});
  });
  const page=await ctx.newPage();active=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('button',{name:'Nhận đơn này',exact:true}).waitFor();return{page,ctx,calls,getStale:()=>staleResponses};
 }
 {
  const{page,ctx,calls,getStale}=await open({stale:true});const ready=page.getByRole('switch',{name:'Bật nhận đơn',exact:true});
  assert(await page.getByRole('button',{name:'Nhận đơn này',exact:true}).isDisabled());
  await ready.click();await page.getByText('Đang nhận đơn',{exact:true}).waitFor();
  await page.waitForTimeout(2000);assert(getStale()>0);assert.equal(await ready.isChecked(),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('avengers_shipper_session')).shipper.status),'ACTIVE');
  assert.equal(calls.filter(c=>c.path==='/shippers/s1/status').length,1);assert(!calls.some(c=>c.path.endsWith('/location')));
  await ready.click();await page.getByText('Ngoại tuyến',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Nhận đơn này',exact:true}).isDisabled());
  await ready.click();await page.getByText('Đang nhận đơn',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Chi tiết đơn order-00',exact:true}).click();await page.getByText('Chi tiết đơn mới',{exact:true}).waitFor();
  assert(!calls.some(c=>c.path==='/shippers/s1/deliveries/order-001'));assert.equal(await page.getByText('Xác nhận đi lấy món',{exact:true}).count(),0);
  await page.screenshot({path:out+'/available-preview.png'});await page.getByRole('button',{name:'Nhận đơn này',exact:true}).click();
  await page.getByText('Xác nhận đi lấy món',{exact:true}).waitFor();assert(calls.some(c=>c.path==='/shippers/s1/deliveries/delivery-001'));assert.equal(calls.filter(c=>c.path==='/shippers/s1/accept/order-001').length,1);
  await page.screenshot({path:out+'/accepted-detail.png'});results.push({scenario:'denied GPS + stale profile + preview then accept',result:'PASS'});await ctx.close();
 }
 {
  const{page,ctx,calls}=await open({status:'ACTIVE'});await page.getByRole('button',{name:'Nhận đơn này',exact:true}).click();await page.getByText('Xác nhận đi lấy món',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.path==='/shippers/s1/accept/order-001').length,1);assert(!calls.some(c=>c.path==='/shippers/s1/deliveries/order-001'));results.push({scenario:'accept directly from card, no parent preview event',result:'PASS'});await ctx.close();
 }
 {
  const{page,ctx,calls}=await open({statusFailure:true});await page.getByRole('switch',{name:'Bật nhận đơn',exact:true}).click();await page.getByText('Máy chủ chưa lưu được trạng thái.',{exact:true}).waitFor();assert.equal(await page.getByRole('switch',{name:'Bật nhận đơn',exact:true}).isChecked(),false);assert(await page.getByRole('button',{name:'Nhận đơn này',exact:true}).isDisabled());assert(!calls.some(c=>c.path.includes('/accept/')));results.push({scenario:'failed status save stays offline with visible error',result:'PASS'});await ctx.close();
 }
 for(const preview of [false,true]){
  const{page,ctx,calls}=await open({status:'ACTIVE',acceptFailure:true});if(preview)await page.getByRole('button',{name:'Chi tiết đơn order-00',exact:true}).click();
  await page.getByRole('button',{name:'Nhận đơn này',exact:true}).click();await page.getByText('Đơn đã được tài xế khác nhận.',{exact:true}).waitFor();assert(!calls.some(c=>c.path.includes('/deliveries/') ));results.push({scenario:`accept conflict visible in ${preview?'preview':'home'}`,result:'PASS'});await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/checks.json',JSON.stringify({results,errors,realApiWrites:0,apiKeysUsed:false},null,2));console.log(JSON.stringify(results));
}catch(error){console.error(error.message,errors);if(active&&!active.isClosed()){await active.screenshot({path:out+'/failure.png'}).catch(()=>{});console.error((await active.locator('body').innerText()).slice(-1800))}throw error}
finally{await browser?.close();await new Promise(r=>server.close(r));}
