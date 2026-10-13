"""Read-only UI qualification with fixture APIs. No real orders, logins or provider calls."""
import asyncio,json,sys,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5178'
OUT=Path('/tmp/web-language-performance');OUT.mkdir(exist_ok=True)
PRODUCT={'ma_san_pham':1,'ten_san_pham':'Latte fixture','gia_ban':69000,'trang_thai':True,'hinh_anh_url':'/hc-assets/phindi-hanh-nhan.jpg','danhMuc':{'ma_danh_muc':101,'ten_danh_muc':'Cà Phê'},'bien_the':{'Kích thước':{'Vừa':69000,'Lớn':79000},'Độ ngọt':{'Bình thường':0,'Ít ngọt':0}}}
BRANCH={'ma_chi_nhanh':'MAIN','ten_chi_nhanh':'Chi nhánh fixture','dia_chi':'Địa chỉ fixture','thanh_pho':'Hồ Chí Minh','trang_thai':'ACTIVE','loai_diem_ban':'CHI_NHANH_CHINH','gio_mo_cua':'00:00','gio_dong_cua':'23:59','vi_do':10.8,'kinh_do':106.7}
USER={'ma_nguoi_dung':'fixture-customer','hoTen':'Khách fixture','email':'fixture@example.invalid','vaiTro':'CUSTOMER'}
CART=[{'id':1,'ma_san_pham':1,'ten_san_pham':'Latte fixture','gia_ban':69000,'so_luong':1,'size':'Vừa','kich_co':'Vừa','hinh_anh_url':PRODUCT['hinh_anh_url'],'toppings':[]}]
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');context.set_default_timeout(15000)
  await context.add_init_script('if (window.top === window) { localStorage.setItem("avengers:campaign:phin:v1",String(Date.now()));localStorage.setItem("user",'+json.dumps(json.dumps(USER))+');localStorage.setItem("token","fixture-token"); }')
  calls=[];writes=[];errors=[]
  async def route_api(route):
   req=route.request;u=urlparse(req.url);path=u.path
   if u.hostname not in ['127.0.0.1','localhost']:
    if req.resource_type=='image':await route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#f3f3f3"/></svg>')
    else:await route.abort()
    return
   if u.port==3005:await route.abort();return
   if u.port!=3000:await route.continue_();return
   calls.append(path);data=[]
   if req.method not in ['GET','OPTIONS']:
    writes.append(path)
    if path.endswith('/quote'):data={'tong_tien':69000,'subtotal':69000,'total':69000,'tong_thanh_toan':69000,'discount':0,'delivery_fee':0}
    elif path=='/cart/merge-guest':data={'items':CART}
    else:raise AssertionError('Unexpected mutation '+path)
   elif path=='/menu/san-pham':data=[PRODUCT]
   elif path=='/menu/danh-muc':data=[PRODUCT['danhMuc']]
   elif path=='/users/branches/public':data={'items':[BRANCH]}
   elif path.endswith('/profile'):data=USER
   elif path.startswith('/cart'):data={'items':CART}
   elif path.endswith('/membership'):data={'hang_hien_tai':{'ma_hang':'MEMBER','ten_hang':'Thành viên','he_so_diem':1},'diem_loyalty':0,'diem_kha_dung':0,'tier_config':[],'vouchers':[]}
   elif path.endswith('/wallet'):data={'balance':100000,'so_du':100000}
   elif path=='/inventory/items':data=[{'ma_san_pham':1,'so_luong_ton':20,'dang_ban':True}]
   elif path.endswith('/addresses'):data={'items':[]}
   elif path.endswith('/reviews'):data={'items':[],'tongReview':0,'diemTrungBinh':0}
   elif path=='/promotions/vouchers':data={'items':[]}
   elif path.startswith('/customers') or path.startswith('/users'):data={'items':[]}
   await route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'},body=json.dumps(data))
  await context.route('**/*',route_api);await context.route_web_socket('**:3005/**',lambda ws:ws.close())
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(BASE+'/?tab=cart',wait_until='domcontentloaded');await page.get_by_text('Giỏ hàng của bạn',exact=True).wait_for()
  await page.locator('button').filter(has=page.locator('img[alt="EN"]')).first.click()
  await page.get_by_text('Your cart',exact=True).wait_for();await page.get_by_text('Order summary',exact=True).wait_for()
  await page.get_by_role('button',name='Proceed to checkout',exact=True).click();await page.get_by_text('Delivery and payment details',exact=True).wait_for()
  await page.get_by_role('button',name='Store pickup',exact=True).click()
  await page.get_by_text('Payment method',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'checkout-en.png'))
  assert await page.evaluate('localStorage.getItem("i18nextLng")')=='en'
  # Switching language preserves fulfilment selection and checkout state.
  await page.locator('button').filter(has=page.locator('img[alt="VN"]')).first.click();await page.get_by_text('Thông tin giao hàng & Thanh toán',exact=True).wait_for()
  await page.get_by_text('Phương thức thanh toán',exact=True).wait_for();await page.screenshot(path=str(OUT/'checkout-vi.png'))
  await page.locator('button').filter(has=page.locator('img[alt="EN"]')).first.click();await page.get_by_text('Payment method',exact=True).wait_for()
  layouts={}
  for width in [390,1440]:
   await page.set_viewport_size({'width':width,'height':1000});assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+2');await page.screenshot(path=str(OUT/('checkout-en-'+str(width)+'.png')));layouts[str(width)]='no horizontal overflow'
  # Direct navigation must keep the selected language on every route family.
  routes={'home':'Home','order':'Menu','stores':'Find a store','login':'ACCOUNT LOGIN','profile':'Personal information','membership':'Membership benefits','lucky-wheel':'Lucky wheel','news':'News','about':'THIS STORY BELONGS TO US','support':'Support','careers':'Careers','gift-card':'Gift cards','nhuong-quyen':'Franchise','survey':'No surveys available','tra-cuu-don':'Order lookup','privacy':'Privacy','chinh-sach-dat-hang':'Ordering policy','lien-he':'CONTACT US'}
  route_results={}
  for tab in routes:
   await page.goto(BASE+'/?tab='+tab,wait_until='domcontentloaded');await page.wait_for_timeout(650)
   assert await page.evaluate('document.documentElement.lang')=='en',tab
   assert await page.locator('main').first.inner_text(),('blank route',tab)
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+2'),tab
   route_results[tab]={'document_lang':'en','heading':(await page.locator('h1,h2').all_text_contents())[:3]}
   if tab in ['stores','login','profile']:await page.screenshot(path=str(OUT/(tab+'-en.png')))
  await page.goto(BASE+'/?tab=order',wait_until='domcontentloaded');await page.get_by_label('Choose options for Latte fixture',exact=True).first.click()
  dialog=page.get_by_role('dialog',name='Options for Latte fixture');await dialog.wait_for()
  await dialog.get_by_role('button',name='Large',exact=False).click();await dialog.get_by_text('Less sweet',exact=True).click()
  await page.screenshot(path=str(OUT/'options-en.png'));await page.keyboard.press('Escape')
  # Public cache survives a same-origin reload and does not issue the store GET twice.
  before=calls.count('/users/branches/public');await page.goto(BASE+'/?tab=stores',wait_until='domcontentloaded');await page.wait_for_timeout(500)
  after=calls.count('/users/branches/public');assert after==before,(before,after)
  assert not errors,errors
  result={'method':'Chromium + fixture APIs; no real provider/order writes','routes':route_results,'layouts':layouts,'errors':errors,'switch_preserves_checkout':True,'google_or_email_authentication_tested':False,'public_store_cache_reload_no_get':True,'writes':writes}
  (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));await page.wait_for_timeout(350);await context.unroute_all(behavior="wait");await context.close();await browser.close()
asyncio.run(run())
