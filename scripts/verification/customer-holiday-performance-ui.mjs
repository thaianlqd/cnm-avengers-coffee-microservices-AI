import { vectorBasemapFixture } from './vectorBasemapFixture.mjs';
// Compare production bundles with delayed, intercepted API responses.
// Every non-local request and every WebSocket is a fixture; no user keys/calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const roots = { before: process.env.CUSTOMER_BEFORE_EXPORT, after: process.env.CUSTOMER_WEB_EXPORT };
if(process.env.CUSTOMER_MOBILE_EXPORT)roots.mobile=process.env.CUSTOMER_MOBILE_EXPORT;
assert(Object.values(roots).every(Boolean));
const output = process.env.UI_ARTIFACTS || '/tmp/avengers-holiday-performance'; await mkdir(output,{recursive:true});
const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.svg':'image/svg+xml' };
const servers = Object.fromEntries(Object.entries(roots).map(([name,root]) => [name,createServer(async (req,res) => {
  const file=resolve(root,'.'+(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if(!file.startsWith(resolve(root)+'/'))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
})]));
const products=Array.from({length:118},(_,i)=>({ma_san_pham:i+1,ten_san_pham:`Cà Phê Kiểm Thử ${i+1}`,gia_ban:39000,trang_thai:true,hinh_anh_url:'https://fixture.invalid/coffee.png',bien_the:{'Kích thước':{'Vừa':39000,'Lớn':45000}},danhMuc:{ma_danh_muc:1,ten_danh_muc:'Cà Phê Phin'}}));
const branches=Array.from({length:1215},(_,i)=>({ma_chi_nhanh:`D${i}`,ten_chi_nhanh:`Highlands Coffee ${i+1}`,dia_chi:`${i+1} Tân Phú, Thành phố Hồ Chí Minh`,thanh_pho:'Thành phố Hồ Chí Minh',vi_do:10.8+i*.00002,kinh_do:106.62+i*.00002}));
const errors=[],results=[];let browser,activePage;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const coffee=await readFile(resolve('avengers-coffee-system/apps/customer-mobile/assets/branding/logo.png'));
  const tile='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#f0efe6"/><path d="M0 100H512M0 280H512M120 0V512M320 0V512" stroke="white" stroke-width="16"/><path d="M0 200Q200 100 512 260" stroke="#b8dbe7" fill="none" stroke-width="14"/></svg>';
  async function open(name,tab='order',width=1440){
    const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
    const origin=`http://127.0.0.1:${servers[name].address().port}`,calls=[];
    let owner,items=[],version=0;
    const envelope=()=>({user_id:owner,cart_version:version,items:structuredClone(items),subtotal:items.reduce((n,i)=>n+i.so_luong*i.gia_ban,0)});
    await ctx.routeWebSocket('**/*',s=>s.close());
    await ctx.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      if(url.origin===origin)return route.continue();
      const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(url.hostname==='maps.vietmap.vn' && path.endsWith('/style.json'))return route.fulfill({json:vectorBasemapFixture,headers});
      if(/maps\.vietmap|tile\.openstreetmap/.test(url.hostname))return route.fulfill({body:tile,contentType:'image/svg+xml',headers});
      if(/\.(png|jpg|jpeg)$/.test(path))return route.fulfill({body:coffee,contentType:'image/png',headers});
      calls.push({method:req.method(),path,at:Date.now()});let data={items:[],data:[],total:0};
      if(path==='/menu/san-pham')data=products;
      else if(path==='/menu/danh-muc')data=[{ma_danh_muc:1,ten_danh_muc:'Cà Phê Phin',trang_thai:true}];
      else if(path==='/users/branches/public'){await delay(500);data={items:branches};}
      else if(path==='/branch-reviews/stats')data=[];
      else if(path.startsWith('/cart/')&&req.method()==='GET'){owner=path.split('/')[2];data=envelope();await delay(1000);}
      else if(path==='/cart'&&req.method()==='POST'){
        const body=req.postDataJSON();owner=body.ma_nguoi_dung;version++;
        items=[{...body,id:'line-fixture',so_luong:body.so_luong,gia_ban:39000}];await delay(200);data=envelope();
      }
      else if(path==='/cart/line-fixture'&&req.method()==='PATCH'){
        const body=req.postDataJSON();version++;items[0].so_luong=body.quantity;await delay(600);data=envelope();
      }
      return route.fulfill({json:data,headers});
    });
    const page=await ctx.newPage();activePage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push({name,message:e.message}));
    await page.goto(`${origin}/?tab=${tab}`);return {page,ctx,calls,origin};
  }
  for(const name of ['before','after']){
    const {page,ctx,calls}=await open(name);
    await page.getByRole('button',{name:'Xem nhanh Cà Phê Kiểm Thử 1',exact:true}).first().waitFor();await page.waitForTimeout(1400);
    const branchReads=calls.filter(c=>c.path==='/users/branches/public').length;
    await page.getByRole('button',{name:'Xem nhanh Cà Phê Kiểm Thử 1',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:'Tùy chọn Cà Phê Kiểm Thử 1',exact:true});
    const beforeReads=calls.filter(c=>c.method==='GET'&&c.path.startsWith('/cart/')).length;
    const start=Date.now();await dialog.getByRole('button',{name:'Thêm vào giỏ hàng',exact:true}).click();await dialog.waitFor({state:'hidden'});const completeMs=Date.now()-start;
    const extraReads=calls.filter(c=>c.method==='GET'&&c.path.startsWith('/cart/')).length-beforeReads;
    if(name==='after')assert.equal(extraReads,0,'A confirmed write must not await a duplicate GET cart');
    results.push({name,cartAddCompleteMs:completeMs,extraCartReads:extraReads,menuBrowseBranchReads:branchReads,fixtureCartGetDelayMs:1000,fixtureWriteDelayMs:200});
    if(name==='after'){await page.screenshot({path:`${output}/order-1440.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/order-390.png`});}
    if(name==='after'){
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:/Giỏ hàng/}).first().click();
      const increase=page.getByRole('button',{name:'Tăng số lượng',exact:true});
      await increase.waitFor();const readsBefore=calls.filter(c=>c.method==='GET'&&c.path.startsWith('/cart/')).length;
      await increase.click();assert(await increase.isDisabled(),'Quantity controls must block duplicate inflight writes');
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Tăng số lượng'&&!b.disabled));
      assert.equal(await increase.locator('..').locator('span').innerText(),'2');
      assert.equal(calls.filter(c=>c.method==='GET'&&c.path.startsWith('/cart/')).length,readsBefore);
      
    }
    await ctx.close();
  }
  assert.equal(results[1].menuBrowseBranchReads,0);
  assert(results[0].cartAddCompleteMs > results[1].cartAddCompleteMs + 500,'Removing the redundant delayed read should shorten completion');
  for(const tab of ['home','other-group','stores']){
    const {page,ctx,calls}=await open('after',tab);
    if(tab==='other-group'){
      await page.getByRole('heading',{name:'Mỗi kết nối, một câu chuyện mới.'}).waitFor();
      await page.getByRole('button',{name:'Khám phá nghề nghiệp',exact:true}).click();await page.waitForURL('**/*tab=careers*');
      await page.goto(`${page.url().split('?')[0]}?tab=other-group`);
      await page.getByRole('button',{name:'Mình cần hỗ trợ',exact:true}).click();await page.waitForURL('**/*tab=contact*');
      await page.goto(`${page.url().split('?')[0]}?tab=other-group`);
    }else if(tab==='home')await page.getByRole('region',{name:'Banner trang chủ Highlands Coffee'}).waitFor();
    else{
      await page.getByRole('button',{name:'Xem thêm cửa hàng',exact:true}).waitFor();
      assert.equal(await page.locator('.leaflet-marker-icon').count()<=61,true);
      await page.getByRole('button',{name:'Xem thêm cửa hàng',exact:true}).click();
      await page.getByRole('button',{name:'Định tâm cửa hàng',exact:true}).waitFor();
      assert.equal(await page.locator('iframe').count(),0);
    }
    if(tab==='other-group'){await page.locator('.community-hero img').evaluate(img=>img.decode());assert(await page.locator('.community-hero img').evaluate(img=>img.naturalWidth>=1000));}
    await page.waitForTimeout(350);await page.screenshot({path:`${output}/${tab}-1440.png`});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tab} must fit mobile`);
    await page.screenshot({path:`${output}/${tab}-390.png`});results.push({tab,responsive:'PASS',apiFixtureRequests:calls.length});await ctx.close();
  }
  if(roots.mobile){
    const {page,ctx}=await open('mobile','home',390);
    await page.getByLabel('Khám phá thực đơn mùa lễ hội',{exact:true}).waitFor();
    await page.screenshot({path:output+'/mobile-home-390.png'});
    await page.getByLabel('Khám phá thực đơn mùa lễ hội',{exact:true}).click();
    await page.getByTestId('order-banner').waitFor();
    const firstProduct = page.getByText('Cà Phê Kiểm Thử 1',{exact:true}).filter({visible:true}).first(); await firstProduct.waitFor();
    assert(await firstProduct.evaluate(node => { for(let el=node;el;el=el.parentElement)if(Number(getComputedStyle(el).opacity)<1)return false;return true; }), 'Products must render without waiting for reveal opacity');
    await page.screenshot({path:output+'/mobile-menu-390.png'});
    await page.getByText('Cửa hàng',{exact:true}).last().click();
    await page.getByText('Bản đồ',{exact:true}).click();
    await page.getByRole('button',{name:'Định tâm cửa hàng',exact:true}).waitFor();
    await page.waitForTimeout(400);await page.screenshot({path:output+'/mobile-stores-390.png'});
    assert.equal(await page.locator('iframe').count(),0);
    results.push({tab:'mobile home/menu/stores',result:'PASS'});await ctx.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${output}/checks.json`,JSON.stringify({results,errors,realApiRequests:0,keysUsed:'fixture only'},null,2));console.log(JSON.stringify(results));
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:`${output}/failure.png`});console.error((await activePage.locator('body').innerText()).slice(-1500));}console.error(errors);throw error;}
finally{await browser?.close();await Promise.all(Object.values(servers).map(s=>new Promise(r=>s.close(r))));}
