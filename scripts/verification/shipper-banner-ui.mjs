// All mutations/logins here are intercepted fixtures; no accounts or provider keys.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const roots={web:process.env.CUSTOMER_WEB_EXPORT,mobile:process.env.CUSTOMER_MOBILE_EXPORT,admin:process.env.STAFF_WEB_EXPORT,shipper:process.env.SHIPPER_EXPORT};
assert(Object.values(roots).every(Boolean));
const output=process.env.UI_ARTIFACTS||'/tmp/avengers-shipper-banner-ui';await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.json':'application/json'};
const servers=Object.fromEntries(Object.entries(roots).map(([app,root])=>[app,createServer(async(req,res)=>{const file=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(resolve(root)+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}})]));
const branch={ma_chi_nhanh:'D9',ten_chi_nhanh:'Highlands Coffee D9',trang_thai:'ACTIVE',loai_diem_ban:'CHI_NHANH_CHINH'};
const kiosks=[{ma_chi_nhanh:'KSK-1',ten_chi_nhanh:'Kiosk Avengers 1',trang_thai:'ACTIVE',loai_diem_ban:'XE_NUOC_FRUIT'},{ma_chi_nhanh:'KVT-1',ten_chi_nhanh:'Điểm vệ tinh',trang_thai:'ACTIVE',loai_diem_ban:'KIOSK_VE_TINH'}];
const errors=[],results=[];let browser,active;
try{
 await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
 const origins=Object.fromEntries(Object.entries(servers).map(([app,s])=>[app,`http://127.0.0.1:${s.address().port}`]));
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 async function open(app,width=1440){
  const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'}),calls=[];
  await ctx.routeWebSocket('**/*',s=>s.close());
  if(app==='admin')await ctx.addInitScript(()=>sessionStorage.setItem('adminSession',JSON.stringify({token:'fixture-only-token',user:{id:'qa-admin',maNguoiDung:'qa-admin',hoTen:'QA',vaiTro:'ADMIN',vai_tro:'ADMIN'}})));
  let shippers=Array.from({length:25},(_,i)=>({id:`shipper-${i}`,username:`qa-${i}`,full_name:`Tài xế ${i}`,branch_code:'D9',status:'ACTIVE',created_at:`2026-10-${String(1+i%10).padStart(2,'0')}T00:00:00Z`}));
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/api(?=\/)/,'');if(Object.values(origins).includes(url.origin))return route.continue();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   let body;try{body=req.postDataJSON();}catch{}calls.push({path,method:req.method(),host:url.hostname,body});let data={items:[],data:[],total:0};
   if(path==='/users/branches/public')data=[...kiosks,branch];
   else if(path==='/shippers/all')data=shippers;
   else if(path==='/shippers'&&req.method()==='POST'){assert.equal(body.branch_code,'D9');assert.equal(body.password,'fixture-password');assert.equal(body.vehicle_type,'MOTORBIKE');const created={...body,id:'created-fixture',full_name:'Tài xế vừa tạo',status:'INACTIVE',created_at:'2026-10-14T14:00:00Z'};shippers=[...shippers,created];data=created;}
   else if(path==='/shippers/login'){assert.equal(url.hostname,'127.0.0.1');assert.equal(req.headers().authorization,undefined);assert.equal(body.username,'fixture-only-user');data={accessToken:'fixture-only-token',shipper:{id:'login-fixture',username:'fixture-only-user',full_name:'Shipper kiểm thử',status:'INACTIVE',branch_code:'D9'}};}
   else if(path==='/menu/san-pham'||path==='/menu/danh-muc'||path==='/menu/categories')data=[];
   else if(path.includes('/deliveries')||path==='/shippers/available-orders')data=[];
   else if(/\.(js|css)$/.test(path))return route.fulfill({body:'',contentType:path.endsWith('.css')?'text/css':'text/javascript',headers});
   return route.fulfill({json:data,headers});
  });
  const page=await ctx.newPage();if(app==='web'||app==='mobile'){await ctx.addInitScript(()=>localStorage.setItem('avengers:campaign:phin:v1',String(Date.now())));await page.clock.install();}active=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push({app,message:e.message}));page.on('dialog',d=>d.accept());return{page,ctx,calls,origin:origins[app]};
 }
 const allSets=[];
 for(const tab of ['home','order']){
  const{page,ctx,origin}=await open('web');await page.goto(`${origin}/?tab=${tab}`);const banner=page.getByRole('region',{name:tab==='home'?'Banner trang chủ Highlands Coffee':'Banner thực đơn Highlands Coffee'});await banner.waitFor();
  assert.equal(await banner.locator('h1,h2,p').count(),0);const set=[];
  for(let i=1;i<=4;i++){if(i>1)await page.clock.runFor(10000);await banner.locator('img').evaluate(img=>img.decode());assert(await banner.locator('img').evaluate(img=>img.naturalWidth>=900));set.push(await banner.locator('img').getAttribute('src'));await banner.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${tab}-banner-${i}.png`});}
  assert.equal(new Set(set).size,4);allSets.push(set);await page.setViewportSize({width:390,height:844});await banner.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${tab}-banner-390.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ctx.close();results.push({tab,imageOnly:true,distinctSlides:4,responsive:'PASS'});
 }
 assert.equal(new Set(allSets.flat()).size,8);
 {const{page,ctx,origin}=await open('mobile',390);await page.goto(origin);await page.getByTestId('holiday-hero').waitFor();for(let i=1;i<4;i++)await page.clock.runFor(10000);await page.screenshot({path:`${output}/mobile-home-banner.png`});await page.getByLabel('Khám phá thực đơn mùa lễ hội',{exact:true}).click();await page.getByTestId('order-banner').waitFor();for(let i=1;i<4;i++)await page.clock.runFor(10000);await page.screenshot({path:`${output}/mobile-order-banner.png`});await ctx.close();results.push({app:'mobile',fourSlidesEach:'PASS'});}
 {const{page,ctx,origin,calls}=await open('admin');await page.goto(`${origin}/?workspace=admin`);await page.locator('.console-sidebar').getByRole('button',{name:'Nhân viên giao hàng',exact:true}).click();
  const pager=page.getByRole('navigation',{name:'Phân trang danh sách'}).first();await pager.getByRole('button',{name:'Trang 2',exact:true}).click();
  await page.getByPlaceholder('Ví dụ: shipper01').fill('fixture-new');await page.getByPlaceholder('Ví dụ: Nguyễn Văn A').fill('Tài xế vừa tạo');const password=page.getByPlaceholder('••••••••');await password.fill('fixture-password');assert.equal(await password.getAttribute('type'),'password');await page.getByRole('button',{name:'Hiện mật khẩu',exact:true}).click();assert.equal(await password.getAttribute('type'),'text');await page.getByRole('button',{name:'Ẩn mật khẩu',exact:true}).click();
  assert.equal(await page.getByRole('option',{name:'Xe đạp',exact:true}).count(),0);
  await page.getByText('Chọn chi nhánh phụ trách',{exact:true}).click();await page.getByPlaceholder('Gõ để tìm kiếm chi nhánh...').waitFor();assert.equal(await page.getByText('Kiosk Avengers 1',{exact:true}).count(),0);assert.equal(await page.getByText('Điểm vệ tinh',{exact:true}).count(),0);await page.getByText('Highlands Coffee D9',{exact:true}).last().click();
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await page.getByText('Tài xế vừa tạo',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('tbody tr td')?.textContent.includes('Tài xế vừa tạo'));assert.equal(await pager.getByRole('button',{name:'Trang 1',exact:true}).getAttribute('aria-current'),'page');assert.equal(calls.filter(c=>c.path==='/shippers'&&c.method==='POST').length,1);await page.getByText('Tài xế vừa tạo',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/admin-created-first.png`});await ctx.close();results.push({app:'admin',passwordToggle:true,kiosksExcluded:true,noBicycle:true,createdFirstPage:true});}
 {const{page,ctx,origin,calls}=await open('shipper',390);await page.goto(origin);await page.getByLabel('Tài khoản',{exact:true}).fill('fixture-only-user');await page.getByLabel('Mật khẩu',{exact:true}).fill('fixture-only-password');await page.getByRole('button',{name:'Hiện mật khẩu',exact:true}).click();await page.getByText('Đăng nhập',{exact:true}).click();await page.getByText('Shipper kiểm thử',{exact:true}).waitFor();assert.equal(calls.find(c=>c.path==='/shippers/login').host,'127.0.0.1');await page.screenshot({path:`${output}/shipper-login-pass.png`});await ctx.close();results.push({app:'shipper',staleConfiguredLanIgnored:true,login:'PASS'});}
 assert.deepEqual(errors,[]);await writeFile(`${output}/checks.json`,JSON.stringify({results,errors,realApiRequests:0,keys:'fixtures only'},null,2));console.log(JSON.stringify(results));
}catch(error){console.error(error.message,errors);if(active&&!active.isClosed()){await active.screenshot({path:`${output}/failure.png`}).catch(()=>{});console.error((await active.locator('body').innerText()).slice(-1600));}throw error;}
finally{await browser?.close();await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.close(r))));}
