"""Isolated profile/notification/focus/artwork QA. No real session or backend writes."""
import asyncio,json,sys
from pathlib import Path
from urllib.parse import urlparse,quote
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8090'
OUT=Path('/tmp/customer-account-ui');OUT.mkdir(exist_ok=True)
USER='fixture-account';FULL='c64ba6b0-679b-43b3-814e-114421e5d82d'
AVATAR='data:image/svg+xml,'+quote('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#417b80"/><circle cx="48" cy="36" r="18" fill="white"/><path d="M16 90a32 32 0 0164 0" fill="white"/></svg>')
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch();context=await browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');context.set_default_timeout(15000)
  # Deliberately stale session has no avatar, while the profile API does.
  await context.add_init_script("if(window.top===window){localStorage.setItem('avengers_user_session',JSON.stringify({user:{ma_nguoi_dung:'fixture-account',ho_ten:'Khách kiểm thử',email:'fixture@example.invalid'},timestamp:Date.now()}));localStorage.setItem('auth_token','fixture-token');}")
  notifications=[{'id':'notice-1','tieu_de':'Cap nhat trang thai don hang','noi_dung':f'Don #{FULL} da chuyen sang trang thai DANG_GIAO.','da_doc':False,'ngay_tao':'2026-10-12T03:00:00Z','du_lieu':{'ma_don_hang':FULL}},{'id':'notice-2','title':'Ưu đãi của bạn','message':'Cảm ơn bạn đã ghé Highlands.','is_read':True,'created_at':'2026-10-11T03:00:00Z'}]
  errors=[];writes=[]
  async def api(route):
   req=route.request;u=urlparse(req.url);path=u.path
   if u.hostname in ['accounts.google.com','www.google.com']:await route.abort();return
   if u.port==3005:await route.abort();return
   if u.port not in [3000,3001,3002,3003,3004]:await route.continue_();return
   data=[];status=200
   if req.method=='PATCH':
    writes.append(path)
    if path.endswith('/read-all'):
     for n in notifications:n['da_doc']=True;n['is_read']=True
    else:raise AssertionError('Unexpected write '+path)
   elif req.method not in ['GET','OPTIONS']:raise AssertionError('Unexpected mutation '+path)
   elif path.endswith('/profile'):data={'ma_nguoi_dung':FULL,'ho_ten':'Khách kiểm thử','email':'fixture@example.invalid','avatar_url':AVATAR,'ngay_tao':'2026-07-15'}
   elif path.endswith('/loyalty'):data={'diem':3815,'hang_thanh_vien':{'ma_hang':'GOLD','diem_can_len_hang':5000,'diem_bat_dau_hang':1000}}
   elif path.endswith('/notifications'):data={'items':notifications,'unreadCount':sum(not (n.get('da_doc') or n.get('is_read')) for n in notifications)}
   elif path=='/news':data={'items':[{'id':'n1','title':'Di sản cà phê phin','image_url':'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd'},{'id':'n2','title':'Trà Sen Vàng','image_url':'https://images.unsplash.com/photo-1536256263959-770b48d82b0a'}]}
   elif path.startswith('/cart'):data={'items':[]}
   await route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data))
  await context.route('**/*',api);await context.route_web_socket('**:3005/**',lambda ws:ws.close())
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(BASE,wait_until='domcontentloaded');await page.get_by_test_id('holiday-hero').wait_for()
  await page.get_by_label('Tài khoản',exact=True).click();card=page.get_by_test_id('account-member-card');await card.wait_for()
  await page.screenshot(path=str(OUT/'account-debug.png'))
  await page.get_by_test_id('account-avatar').wait_for()
  assert await card.evaluate("e=>getComputedStyle(e).backgroundColor")=='rgb(178, 40, 48)'
  await page.screenshot(path=str(OUT/'account-390.png'))
  for width in [320,390,480,1440]:
   await page.set_viewport_size({'width':width,'height':844});await asyncio.sleep(.1)
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
   box=await card.bounding_box(); assert box['width']<=480
  await page.set_viewport_size({'width':390,'height':844})
  await page.get_by_label('Mở thông báo',exact=True).click();await page.get_by_text('Đơn #c64ba6b0 đã chuyển sang trạng thái đang giao.',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'notifications-390.png'))
  await page.get_by_role('tab',name='Chưa đọc · 1',exact=True).click();assert await page.get_by_text('Cảm ơn bạn đã ghé Highlands.',exact=True).count()==0
  await page.get_by_label('Đọc tất cả thông báo',exact=True).click();await page.get_by_text('Bạn đã đọc hết thông báo',exact=True).wait_for()
  assert len(writes)==1
  await page.get_by_role('tab',name='Tất cả',exact=True).click();await page.get_by_text('Cảm ơn bạn đã ghé Highlands.',exact=True).wait_for()
  await page.get_by_label('Quay lại tài khoản',exact=True).click()
  await page.get_by_text('Thông tin cá nhân',exact=True).click();field=page.get_by_placeholder('Nhập số điện thoại',exact=True);await field.fill('0901234567')
  assert await field.evaluate("e=>getComputedStyle(e).outlineStyle")=='none'
  assert await field.get_attribute('data-gramm')=='false'
  await page.screenshot(path=str(OUT/'profile-focus-390.png'))
  # Menu search gets the same shared input behavior, and keyboard focus remains visibly red on its field.
  await page.get_by_text('Thực đơn',exact=True).click();search=page.get_by_label('Tìm món theo tên',exact=True);await search.fill('cà phê')
  assert await search.evaluate("e=>getComputedStyle(e).outlineStyle")=='none'
  await page.screenshot(path=str(OUT/'menu-focus-390.png'))
  await page.get_by_text('Trang chủ',exact=True).click();await page.get_by_text('Chuyện cà phê',exact=True).scroll_into_view_if_needed();await page.get_by_text('Di sản cà phê phin',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'news-artwork-390.png'))
  sources=await page.locator('img').evaluate_all("nodes=>nodes.map(n=>n.src)")
  assert any('heritage' in src for src in sources) and not any('images.unsplash.com' in src for src in sources)
  assert not errors,errors
  (OUT/'report.json').write_text(json.dumps({'method':'isolated fixture API, no real login, no profile write','profile_avatar_from_api':True,'responsive_widths':[320,390,480,1440],'notification_filter_read_all':True,'single_input_focus':True,'local_highlands_artwork':True,'errors':errors},ensure_ascii=False,indent=2))
  await context.unroute_all(behavior='wait');await browser.close();print('PASS account, avatar, notifications, input focus, Highlands artwork')
asyncio.run(run())
