import { vectorBasemapFixture } from './vectorBasemapFixture.mjs';
// Built app QA. API, routing, tiles and sockets are fixtures; no live keys/accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const roots = { customer_web:process.env.CUSTOMER_WEB_EXPORT, customer_mobile:process.env.CUSTOMER_MOBILE_EXPORT, shipper:process.env.SHIPPER_EXPORT, admin:process.env.STAFF_WEB_EXPORT };
assert(Object.values(roots).every(Boolean));
const output = process.env.UI_ARTIFACTS || '/tmp/avengers-maps-actors-ui'; await mkdir(output,{recursive:true});
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.json':'application/json','.svg':'image/svg+xml' };
const servers=Object.fromEntries(Object.entries(roots).map(([app,root])=>[app,createServer(async(req,res)=>{
 const file=resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
 if(!file.startsWith(resolve(root)+'/'))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end()}
})]));
const branch={ma_chi_nhanh:'D9',ten_chi_nhanh:'Highlands Coffee D9',dia_chi:'Đường Số 9, Tân Phú',vi_do:10.802,kinh_do:106.625};
const order={ma_don_hang:'fixture-order-001',trang_thai_don_hang:'DANG_GIAO',loai_don_hang:'GIAO_TAN_NOI',tong_tien:99000,phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG',trang_thai_thanh_toan:'CHUA_THANH_TOAN',co_so_ma:'D9',ten_khach_hang:'Khách kiểm thử',dia_chi_giao_hang:'Đường Số 12, Tân Phú',ngay_tao:'2026-10-14T08:00:00Z',chi_tiet:[]};
const delivery={id:'fixture-delivery',ma_don_hang:order.ma_don_hang,status:'IN_TRANSIT',branch_code:'D9',pickup_latitude:10.802,pickup_longitude:106.625,delivery_latitude:10.806,delivery_longitude:106.621,store_name:branch.ten_chi_nhanh,store_address:branch.dia_chi,delivery_address:order.dia_chi_giao_hang,customer_name:order.ten_khach_hang,cod_amount:99000,delivery_fee:15000,order};
const driver={id:'fixture-shipper',username:'fixture',full_name:'Tài xế kiểm thử',status:'ACTIVE',branch_code:'D9',phone:'0900000000'};
const tracking={order,shipper:driver,shipper_delivery:delivery,shipper_location:{latitude:10.803,longitude:106.624},tracking:{delivery_mode:'GIAO_TAN_NOI',branch_code:'D9',branch_name:branch.ten_chi_nhanh,branch_address:branch.dia_chi,store_location:{latitude:10.802,longitude:106.625},destination_location:{latitude:10.806,longitude:106.621}}};
const shippers=Array.from({length:25},(_,i)=>({...driver,id:`s-${i}`,full_name:`Tài xế ${String(i+1).padStart(2,'0')}`,username:`shipper-${i}`,status:i%2?'INACTIVE':'ACTIVE'}));
const transactions=Array.from({length:25},(_,i)=>({id:`tx-${i}`,ma_phieu:`TX-${i+1}`,loai_phieu:'THU',danh_muc:'KHAC',so_tien:10000,noi_dung:`Phiếu thu ${String(i+1).padStart(2,'0')}`,ngay_tao:'2026-10-14T08:00:00Z'}));
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0efe6"/><path d="M0 70H256M0 160H256M65 0V256M170 0V256M0 0L256 256" fill="none" stroke="white" stroke-width="10"/><path d="M0 110Q100 50 256 130" fill="none" stroke="#b8dbe7" stroke-width="10"/><rect x="80" y="175" width="64" height="55" rx="10" fill="#d9eadb"/><text x="84" y="201" font-size="10" fill="#85a59a">Công viên</text></svg>';
const errors=[],results=[];let browser,activePage;
try{
 await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
 const origins=Object.fromEntries(Object.entries(servers).map(([app,s])=>[app,`http://127.0.0.1:${s.address().port}`]));
 browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const logo=await readFile(resolve('avengers-coffee-system/apps/customer-mobile/assets/branding/logo.png'));
 const leaflet=await readFile(resolve('avengers-coffee-system/apps/customer-mobile/node_modules/leaflet/dist/leaflet.js'));
 const leafletCss=await readFile(resolve('avengers-coffee-system/apps/customer-mobile/node_modules/leaflet/dist/leaflet.css'));
 async function pageFor(app,width=390,role='MANAGER'){
  const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'}),calls=[];
  await ctx.routeWebSocket('**/*',s=>s.close());
  await ctx.addInitScript(({app,role,driver})=>{
   if(app==='admin'){sessionStorage.setItem('adminSession',JSON.stringify({token:'fixture-only-token',user:{id:'fixture-actor',maNguoiDung:'fixture-actor',tenDangNhap:'fixture',hoTen:'Kiểm thử',vaiTro:role,vai_tro:role,coSoMa:'D9',coSoTen:'Highlands Coffee D9'}}))}
   if(app==='customer_mobile'){localStorage.setItem('avengers_user_session',JSON.stringify({user:{id:'fixture-customer',full_name:'Khách kiểm thử'}}));localStorage.setItem('auth_token','fixture-only-token')}
   if(app==='shipper'){localStorage.setItem('avengers_shipper_session',JSON.stringify({shipper:driver}));localStorage.setItem('shipper_auth_token','fixture-only-token')}
  },{app,role,driver});
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.hostname==='maps.vietmap.vn'?url.pathname:url.pathname.replace(/^\/api(?=\/)/,'');
   if(Object.values(origins).includes(url.origin))return route.continue();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.hostname==='unpkg.com')return route.fulfill({body:path.endsWith('.css')?leafletCss:leaflet,contentType:path.endsWith('.css')?'text/css':'text/javascript',headers});
   if(url.hostname==='maps.vietmap.vn' && path.endsWith('/style.json'))return route.fulfill({json:vectorBasemapFixture,headers});
   if(/maps\.vietmap|tile\.openstreetmap/.test(url.hostname)&&!path.includes('/api/route'))return route.fulfill({body:tile,contentType:'image/svg+xml',headers});
   if(/\.(png|jpg|jpeg)$/.test(path))return route.fulfill({body:logo,contentType:'image/png',headers});
   calls.push({method:req.method(),path});
   let data={items:[],data:[],orders:[],total:0,success:true};
   if(path.includes('/api/route'))data={code:'OK',paths:[{distance:1700,time:312000,points:{coordinates:[[106.624,10.803],[106.625,10.802],[106.622,10.804],[106.621,10.806]]},instructions:[]}]};
   else if(path==='/menu/san-pham'||path==='/menu/danh-muc'||path==='/menu/categories')data=[];
   else if(path==='/users/branches/public')data=[branch];
   else if(path.startsWith('/shippers/delivery/tracking/'))data=tracking;
   else if(path.endsWith('/active-batch'))data={active:true,batch:{id:'batch-fixture',batch_code:'BATCH-QA',store_name:branch.ten_chi_nhanh,store_address:branch.dia_chi,store_latitude:10.802,store_longitude:106.625,deliveries:[delivery,{...delivery,id:'fixture-delivery-2',ma_don_hang:'fixture-order-002',delivery_latitude:10.807,delivery_longitude:106.626,customer_name:'Khách kiểm thử 2'}]}};
   else if(path==='/shippers/all')data=shippers;
   else if(path==='/shippers/available-orders')data=[];
   else if(path.endsWith('/profile')&&path.startsWith('/shippers/'))data=driver;
   else if(path.includes('/deliveries/'))data=delivery;
   else if(path.endsWith('/deliveries'))data=[delivery];
   else if(path==='/manager/reviews')data={items:Array.from({length:200},(_,i)=>({id:`rv-${i}`,ma_danh_gia:`rv-${i}`,ten_san_pham:`Món đánh giá ${String(i+1).padStart(3,'0')}`,ten_nguoi_dung:'Khách kiểm thử',so_sao:5,binh_luan:'Đồ uống ngon, phục vụ tốt.',ngay_tao:'2026-10-14T08:00:00Z'}))};
   else if(path==='/staff/orders')data={orders:Array.from({length:25},(_,i)=>({...order,ma_don_hang:`fixture-order-${String(i+1).padStart(3,'0')}`}))};
   else if(path.startsWith('/customers/fixture-customer/orders'))data={orders:[order],items:[order],total:1};
   else if(path==='/shippers/exceptions')data=[];
   else if(path==='/shippers/cod-remits')data=[];
   else if(path==='/franchise/kiosk/cua-toi')data=[{id:'fixture-kiosk',ma_kiosk:'K1',ten_kiosk:'Kiosk kiểm thử',trang_thai:'DANG_HOAT_DONG'}];
   else if(path==='/franchise/combo'||path==='/franchise/cong-no/cua-toi'||path==='/franchise/royalty/cua-toi')data=[];
   else if(path==='/franchise/don-mua-combo/cua-toi')data=Array.from({length:25},(_,i)=>({id:`combo-${i}`,kiosk_id:'fixture-kiosk',so_luong:1,tong_tien:500000,trang_thai:'DA_DAT',ngay_dat:'2026-10-14T08:00:00Z',combo:{ten_combo:`Combo ${String(i+1).padStart(2,'0')}`}}));
   else if(path==='/wallet/info')data={so_du:0,giao_dich:[]};
   else if(path==='/franchise/thu-chi')data={danh_sach:transactions,thong_ke:{tong_thu:250000,tong_chi:0,ton_quy:250000}};
   else if(path==='/franchise/dashboard/admin')data={success:true,data:{}};
   else if(path.includes('franchise'))data=[];
   return route.fulfill({json:data,headers});
  });
  const page=await ctx.newPage();activePage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push({app,role,message:e.message,stack:e.stack}));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('[customer-page]'))errors.push({app,role,message:m.text()})});return{page,ctx,calls,origin:origins[app]};
 }
 for(const app of ['customer_web','customer_mobile','shipper']){
  const {page,ctx,origin}=await pageFor(app);
  await page.goto(app==='customer_web'?`${origin}/?tab=tracking&code=AC-FIXTURE`:origin);
  if(app==='customer_mobile'){await page.evaluate(()=>document.fonts.ready);await page.getByText('Đơn hàng',{exact:true}).first().locator('..').click();await page.getByText('Theo dõi',{exact:true}).first().click()}
  if(app==='shipper'){await page.getByText('Đang giao · 1',{exact:true}).click();await page.getByText('Tiếp tục giao',{exact:true}).first().click();await page.getByText('Xem bản đồ',{exact:true}).first().click()}
  await page.locator('[data-basemap="vector-street"]').waitFor(); assert.equal(await page.locator('.maplibregl-canvas').count(),1);
  await page.getByText('1.7 km',{exact:true}).first().waitFor();await page.getByText('~6 phút',{exact:true}).first().waitFor();
  await (app==='customer_web' ? page.locator('[aria-label="Hành trình giao hàng"]') : page.getByText('1.7 km',{exact:true}).first()).scrollIntoViewIfNeeded();await page.waitForTimeout(500);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(app==='customer_web')await page.evaluate(()=>window.scrollBy(0,-130));await page.screenshot({path:`${output}/${app}-journey-390.png`});
  await page.setViewportSize({width:1000,height:900});if(app==='customer_web')await page.locator('[aria-label="Hành trình giao hàng"]').scrollIntoViewIfNeeded();await page.waitForTimeout(400);if(app==='customer_web')await page.evaluate(()=>window.scrollBy(0,-130));await page.screenshot({path:`${output}/${app}-journey-1000.png`});
  results.push({app,map:'PASS',basemap:'real MapLibre vector renderer / offline style',fixtureRoutes:true});await ctx.close();
 }
 {
  const {page,ctx,origin}=await pageFor('customer_web',1000);
  let rejected = false;
  await ctx.route('https://maps.vietmap.vn/maps/styles/**',route=>{rejected=true;return route.fulfill({status:403,json:{message:'Fixture vector unavailable'},headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.goto(`${origin}/?tab=tracking&code=AC-FIXTURE`);
  await page.getByText('1.7 km',{exact:true}).first().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-basemap]')?.dataset.basemap==='raster' && document.querySelectorAll('.leaflet-tile-loaded').length>0);
  await page.waitForTimeout(1000);assert(rejected);assert.equal(await page.locator('.maplibregl-canvas').count(),0);
  await page.getByRole('button',{name:'Định tâm hành trình',exact:true}).click();
  results.push({app:'customer_web',vectorUnavailableRasterFallback:'PASS',measuredRoutePreserved:true});await ctx.close();
 }
 {
  const {page,ctx,origin}=await pageFor('shipper',390);
  await ctx.grantPermissions(['geolocation']);await ctx.setGeolocation({latitude:10.803,longitude:106.624});
  await page.goto(origin);await page.getByText('Ghép tuyến',{exact:true}).first().click();
  await page.getByText('Xem Bản Đồ Lộ Trình Tối Ưu',{exact:true}).click();
  await page.getByLabel('Bản đồ hành trình giao ghép',{exact:true}).waitFor();
  await page.locator('[data-basemap="vector-street"]').waitFor();
  assert.equal(await page.locator('.leaflet-marker-icon').count(),4);
  await page.getByText('Lộ Trình Giao Hàng',{exact:true}).waitFor();
  await page.waitForTimeout(650);
  assert(await page.getByText('Lộ Trình Giao Hàng',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return [...document.elementsFromPoint(r.left+r.width/2,r.top+r.height/2)].includes(el);}));
  await page.screenshot({path:`${output}/shipper-batch-journey-390.png`});
  results.push({app:'shipper',batchVectorMap:'PASS',waypoints:4});await ctx.close();
 }
 for(const [workspace,role,tab]of [['admin','ADMIN','Nhân viên giao hàng'],['manager','MANAGER','Giao hàng'],['staff','STAFF','Giao hàng'],['partner','FRANCHISEE','Lịch sử nhập'],['accountant','ACCOUNTANT','Dòng tiền & đối soát']]){
  const{page,ctx,origin}=await pageFor('admin',1440,role);await page.goto(`${origin}/?workspace=${workspace}`);
  await page.locator('.console-sidebar').getByRole('button',{name:tab,exact:true}).click();
  const pagination=page.getByRole('navigation',{name:'Phân trang danh sách'}).first();await pagination.waitFor();
  assert(await pagination.getByRole('button').count()<=9);await pagination.getByRole('button',{name:'Trang 2',exact:true}).click();
  await page.waitForTimeout(200);await page.screenshot({path:`${output}/${workspace}-page2.png`});
  assert.equal(await pagination.getByRole('button',{name:'Trang 2',exact:true}).getAttribute('aria-current'),'page');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  await page.setViewportSize({width:1440,height:1000});
  const tabs=await page.locator('.workspace-nav-links button').allTextContents();
  for(const name of tabs){await page.locator('.workspace-nav-links').getByRole('button',{name:name.trim(),exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.locator('.console-recovery,.workspace-recovery').count(),0,`${workspace}: ${name} must render`)}
  if(workspace==='manager'){
   await page.locator('.console-sidebar').getByRole('button',{name:'Đánh giá khách hàng',exact:true}).click();
   const numbers=page.locator('.console-page-numbers');await numbers.getByRole('button',{name:'Trang 34',exact:true}).waitFor();
   assert(await numbers.getByRole('button').count()<=5);await numbers.getByRole('button',{name:'Trang 34',exact:true}).click();
   await page.getByText('Món đánh giá 200',{exact:true}).waitFor();
   assert.equal(await numbers.getByRole('button',{name:'Trang 34',exact:true}).getAttribute('aria-current'),'page');
   await page.waitForTimeout(450);
   await page.screenshot({path:`${output}/manager-reviews-page34.png`});
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await numbers.scrollIntoViewIfNeeded();await page.waitForTimeout(300);assert(await numbers.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
   await page.screenshot({path:`${output}/manager-reviews-390.png`});
  }
  results.push({workspace,pagination:'PASS',tabsChecked:tabs.map(name=>name.trim())});await ctx.close();
 }
 assert.deepEqual(errors,[]);const report={results,realApiRequestsSent:0,keys:'fixture-only',errors};await writeFile(`${output}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.error('Offline QA failed:',e.message,JSON.stringify(errors));if(activePage&&!activePage.isClosed())console.error(await activePage.evaluate(()=>({gl:typeof window.maplibregl,adapter:typeof window.L?.maplibreGL,supported:window.maplibregl?.supported?.(),basemaps:[...document.querySelectorAll('[data-basemap]')].map(e=>e.dataset.basemap),scripts:[...document.scripts].map(e=>e.src).filter(s=>s.includes('map-libs'))}))); if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:`${output}/failure.png`}).catch(()=>{});console.error((await activePage.locator('body').innerText()).slice(-2000))}throw e}
finally{await browser?.close();await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.close(r))))}
