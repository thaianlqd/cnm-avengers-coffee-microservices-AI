"""Historical/empty charts and demand-loaded admin requests, with fixture APIs only."""
import asyncio,json,sys
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime,timedelta,timezone
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5179'
OUT=Path('/tmp/dashboard-performance');OUT.mkdir(exist_ok=True)
source=(Path(__file__).with_name('check-workspace-ui.py')).read_text().split('with sync_playwright() as p:')[0]
f={};exec(compile(source,'fixture-constants','exec'),f);f['RICH']=True
f['SAMPLE_ORDERS']=[dict(row,ngay_tao=(datetime.now(timezone.utc)-timedelta(days=40+i)).isoformat()) for i,row in enumerate(f['SAMPLE_ORDERS'])]
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);result={'method':'Chromium + mocked APIs, no real login/warehouse writes','roles':{},'errors':[]}
  for actor,role in [('admin','ADMIN'),('manager','MANAGER')]:
   context=await browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');context.set_default_timeout(15000);calls=[];empty=False
   session={'token':'fixture-token','user':{'vaiTro':role,'tenDangNhap':'fixture','ma_nguoi_dung':'fixture','coSoMa':'MAIN'}}
   await context.add_init_script('if(window.top===window){sessionStorage.setItem("adminSession",'+json.dumps(json.dumps(session))+');}')
   async def intercept(route):
    u=urlparse(route.request.url)
    if u.port==3005:await route.abort();return
    if u.port!=3000:await route.continue_();return
    assert route.request.method in ['GET','OPTIONS'],route.request.url
    calls.append({'path':u.path,'query':u.query});data=f['payload_for'](u.path,role)
    if u.path=='/staff/orders' and empty:data={'orders':[],'items':[]}
    await route.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data))
   await context.route('**/*',intercept);await context.route_web_socket('**:3005/**',lambda ws:ws.close())
   page=await context.new_page();page.on('pageerror',lambda e:result['errors'].append(str(e)))
   await page.goto(BASE+'/?workspace='+actor,wait_until='domcontentloaded');await page.locator('.console-shell').wait_for();await page.wait_for_timeout(700)
   await page.get_by_text('kỳ gần nhất',exact=False).first.wait_for()
   assert await page.locator('.console-chart svg').count()>=4
   await page.screenshot(path=str(OUT/(actor+'-historical.png')))
   initial_calls=calls.copy()
   if actor=='admin':
    orders=[c for c in calls if c['path']=='/staff/orders'];assert len(orders)==1 and 'branch_code=ALL' in orders[0]['query'],orders
    assert not any(c['path'] in ['/menu/categories','/menu/attributes','/users/admin/membership-config','/staff/shifts/history','/staff/shifts/preview','/staff/kiosk-shifts/active'] for c in calls),calls
    await page.locator('.workspace-sidebar').get_by_role('button',name='Danh mục sản phẩm',exact=False).click();await page.wait_for_timeout(400)
    assert any(c['path']=='/menu/categories' for c in calls)
   result['roles'][actor]={'historical_window_visible':True,'initial_requests':initial_calls,'after_category_requests':calls[len(initial_calls):]}
   # Fresh owner cache on reload lets the genuinely empty response exercise the neutral chart frame.
   empty=True;await page.reload(wait_until='domcontentloaded');await page.locator('.console-shell').wait_for();await page.wait_for_timeout(800)
   assert await page.locator('.console-chart svg').count()>=4
   assert await page.get_by_text('Chưa ghi nhận dữ liệu trong tập đã tải.',exact=True).count()>0
   await page.screenshot(path=str(OUT/(actor+'-empty.png')))
   await page.set_viewport_size({'width':390,'height':900});await page.wait_for_timeout(150)
   assert not await page.evaluate("[...document.querySelectorAll('.console-main,.console-page')].some(e=>e.scrollWidth>e.clientWidth+2)")
   await context.close()
  assert not result['errors'],result['errors']
  (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));await browser.close()
asyncio.run(run())
