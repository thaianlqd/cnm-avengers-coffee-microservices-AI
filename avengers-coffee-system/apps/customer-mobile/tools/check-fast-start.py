"""Mobile app must paint its home screen while the catalog API is deliberately delayed."""
import asyncio,json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');pending=False;finished=False;errors=[]
  async def intercept(route):
   nonlocal pending,finished
   u=urlparse(route.request.url)
   if u.port==3005:await route.abort();return
   if u.port!=3000:await route.continue_();return
   assert route.request.method in ['GET','OPTIONS']
   if u.path=='/menu/san-pham':pending=True;await asyncio.sleep(3);finished=True
   await route.fulfill(content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='[]')
  await context.route('**/*',intercept);await context.route_web_socket('**:3005/**',lambda ws:ws.close())
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));start=time.perf_counter();await page.goto('http://127.0.0.1:8090',wait_until='domcontentloaded')
  await page.get_by_test_id('holiday-hero').wait_for(timeout=3000);assert pending and not finished,(pending,finished)
  assert 'undefined' not in await page.title()
  await page.screenshot(path='/tmp/web-performance-audit/mobile-fast-start.png');result={'method':'Chromium, catalog API artificially delayed 3s, no real backend/provider calls','home_painted_before_catalog_completed':True,'observed_ms_from_navigation':round((time.perf_counter()-start)*1000),'document_title':await page.title(),'errors':errors}
  assert not errors,errors;Path('/tmp/web-performance-audit/mobile-fast-start.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));await context.close();await browser.close()
asyncio.run(run())
