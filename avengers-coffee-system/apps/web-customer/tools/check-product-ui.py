"""Actual local UI with isolated fixture APIs. Never writes to real cart services."""
import asyncio, json, re, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5175'
OUT = Path('/tmp/customer-product-ui'); OUT.mkdir(exist_ok=True)
products = [
    {'ma_san_pham': 1, 'ma_danh_muc': 101, 'ten_san_pham': 'Latte mùa lễ hội', 'gia_ban': 69000, 'trang_thai': True, 'hinh_anh_url': '/hc-assets/phindi-hanh-nhan.jpg', 'danhMuc': {'ma_danh_muc':101, 'ten_danh_muc': 'Cà Phê'}, 'bien_the': {'Kích thước': {'Vừa': 69000, 'Lớn': 79000}, 'Độ ngọt': {'Bình thường': 0, 'Ít ngọt': 0}, 'Topping': {'Foam': 11000}}},
    {'ma_san_pham': 2, 'ma_danh_muc': 101, 'ten_san_pham': 'Cà phê lựa chọn', 'gia_ban': 49000, 'trang_thai': True, 'hinh_anh_url': '/hc-assets/phindi-hanh-nhan.jpg', 'danhMuc': {'ma_danh_muc':101, 'ten_danh_muc': 'Cà Phê'}, 'sizes': {'Nhỏ': 49000, 'Lớn': 59000}, 'toppings': {'Foam': 5000}, 'luong_da': {'Bình thường': 0, 'Ít đá': 0}},
    {'ma_san_pham': 3, 'ma_danh_muc': 104, 'ten_san_pham': 'Bánh ngọt kiểm thử', 'gia_ban': 19000, 'trang_thai': True, 'hinh_anh_url': '/hc-assets/phindi-hanh-nhan.jpg', 'danhMuc': {'ma_danh_muc':104, 'ten_danh_muc': 'Bánh'}},
]
reviews = [{'id': str(i), 'ten_nguoi_dung': 'Khách '+str(i), 'so_sao': 5 if i < 12 else 4 if i < 18 else 3 if i == 18 else 2, 'binh_luan': 'Nhận xét kiểm thử '+str(i+1), 'ngay_tao': '2026-10-13T03:00:00Z'} for i in range(20)]
async def run():
  async with async_playwright() as p:
      browser = await p.chromium.launch(headless=True)
      context = await browser.new_context(viewport={'width':1440, 'height':1000}, reduced_motion='reduce')
      context.set_default_timeout(12000)
      await context.add_init_script("localStorage.setItem('avengers:campaign:phin:v1', String(Date.now()))")
      writes, cart, errors = [], [], []
      fail_send = False
      root = Path(__file__).resolve().parents[1] / 'public'
      async def intercept(route):
          request = route.request; parsed = urlparse(request.url); path = parsed.path
          if request.resource_type == 'image' and ((parsed.port == urlparse(BASE).port and not (root / path.lstrip('/')).is_file()) or parsed.hostname not in ['127.0.0.1','localhost']):
              await route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#eee"/></svg>'); return
          if parsed.port == 3005: await route.abort(); return
          if parsed.port != 3000: await route.continue_(); return
          payload = []
          if request.method == 'OPTIONS': pass
          elif path == '/menu/san-pham': payload = products
          elif path == '/menu/danh-muc': payload = [{'ma_danh_muc': 101, 'ten_danh_muc': 'Cà Phê'}, {'ma_danh_muc': 104, 'ten_danh_muc': 'Bánh'}]
          elif path.endswith('/reviews'): payload = {'items': reviews, 'tongReview': 20, 'diemTrungBinh': 4.5}
          elif path == '/cart' and request.method == 'POST':
              writes.append(request.post_data_json)
              if fail_send:
                  await route.fulfill(status=503, content_type='application/json', body=json.dumps({'message':'Không thể thêm món kiểm thử'})); return
              cart.append(dict(request.post_data_json, id=len(writes))); payload = cart[-1]
          elif path.startswith('/cart'): payload = {'items':cart}
          elif request.method not in ['GET','OPTIONS']: raise AssertionError('Unexpected write '+path)
          await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}, body=json.dumps(payload))
      await context.route('**/*', intercept)
      await context.route_web_socket('**:3005/**', lambda ws: ws.close())
      page = await context.new_page()
      page.on('pageerror', lambda error: errors.append(str(error)))
      await page.goto(BASE+'/?tab=order', wait_until='domcontentloaded')
      await asyncio.sleep(1.8)
      quick = page.get_by_role('button', name='Xem nhanh Latte mùa lễ hội', exact=True).first
      await quick.click()
      dialog = page.get_by_role('dialog', name='Tùy chọn Latte mùa lễ hội')
      await dialog.wait_for(); assert not writes
      # Focus wraps and Escape returns focus to the magnifier.
      await page.keyboard.press('Shift+Tab'); assert (await page.evaluate('document.activeElement.textContent')).strip() == 'Thêm vào giỏ hàng'
      await page.keyboard.press('Tab'); assert await page.get_by_label('Đóng tùy chọn sản phẩm').evaluate('el=>el===document.activeElement')
      await page.keyboard.press('Escape'); assert await page.get_by_role('dialog').count() == 0
      assert await quick.evaluate('el=>el===document.activeElement')
      await page.get_by_label('Chọn tùy chọn Latte mùa lễ hội', exact=True).first.click(); await dialog.wait_for(); assert not writes
      await dialog.get_by_role('button', name='Lớn (79.000đ)', exact=True).click()
      await dialog.get_by_role('button', name='Ít ngọt', exact=True).click()
      await dialog.get_by_role('button', name='Tuỳ chọn Topping', exact=False).click()
      await dialog.get_by_role('checkbox', name='Foam', exact=False).check()
      await dialog.get_by_label('Tăng số lượng').click()
      assert await dialog.get_by_text('90.000đ', exact=True).count() == 1
      await dialog.locator('img').evaluate("el => el.complete ? Promise.resolve() : new Promise(resolve => { el.onload=resolve; el.onerror=resolve; })")
      assert await dialog.locator('img').evaluate('el => el.naturalWidth > 0 && el.clientWidth > 0')
      await page.screenshot(path=str(OUT/'options-desktop.png'))
      await dialog.get_by_role('button', name='Thêm vào giỏ hàng', exact=True).dblclick()
      await dialog.wait_for(state='detached'); assert len(writes)==1
      assert writes[0]['size']=='Lớn' and writes[0]['so_luong']==2 and writes[0]['toppings']==['Foam'] and writes[0]['do_ngot']=='Ít ngọt' and writes[0]['gia_ban']==90000 and writes[0]['topping_prices']==[11000]
      # Failed confirmation keeps options and does not add a phantom local cart row.
      await page.get_by_label('Chọn tùy chọn Cà phê lựa chọn', exact=True).first.click()
      legacy = page.get_by_role('dialog', name='Tùy chọn Cà phê lựa chọn'); await legacy.wait_for()
      await legacy.get_by_role('button', name='Lớn (59.000đ)', exact=True).click(); fail_send=True
      await legacy.get_by_role('button', name='Thêm vào giỏ hàng', exact=True).click()
      await legacy.get_by_role('alert').wait_for(); assert len(writes)==2 and len(cart)==1
      assert await legacy.get_by_role('button', name='Lớn (59.000đ)').count()
      await page.keyboard.press('Escape'); fail_send=False
      # The complete review population stays in the summary; only the list is paged.
      await page.goto(BASE+'/?tab=product-detail&productId=1', wait_until='domcontentloaded')
      paging = page.get_by_role('navigation', name='Phân trang đánh giá'); await paging.wait_for()
      assert await page.locator('p').filter(has_text=re.compile('Nhận xét kiểm thử')).count()==5
      assert await paging.get_by_text('Hiển thị 1–5 / 20 đánh giá').count()
      await page.get_by_label('Trang đánh giá sau').click(); assert await paging.get_by_text('Hiển thị 6–10 / 20 đánh giá').count()
      await page.get_by_label('Trang đánh giá sau').click(); await page.get_by_label('Trang đánh giá sau').click()
      assert await paging.get_by_text('Hiển thị 16–20 / 20 đánh giá').count() and await page.get_by_label('Trang đánh giá sau').is_disabled()
      assert await page.get_by_text('4.5', exact=True).count()==1 and await page.get_by_text('20 lượt đánh giá', exact=True).count()==1
      await paging.scroll_into_view_if_needed(); await page.screenshot(path=str(OUT/'reviews-desktop.png'))
      screens = {}
      for width in [320,390,768,1024,1440]:
          await page.set_viewport_size({'width':width, 'height':900})
          await page.goto(BASE+'/?tab=order', wait_until='domcontentloaded'); await page.get_by_label('Chọn tùy chọn Latte mùa lễ hội', exact=True).first.click()
          await page.get_by_role('dialog').wait_for()
          if await page.evaluate('document.documentElement.scrollWidth > innerWidth + 2'):
              await page.screenshot(path=str(OUT/('overflow-'+str(width)+'.png')))
              print('Overflow', await page.evaluate("[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2 && el.clientWidth).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.clientWidth})).slice(-20)"), flush=True)
          assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 2'), width
          assert await page.get_by_role('dialog').evaluate('el=>el.scrollWidth<=el.clientWidth+2'), width
          await page.get_by_role('dialog').get_by_role('button', name='Thêm vào giỏ hàng', exact=True).scroll_into_view_if_needed()
          await page.screenshot(path=str(OUT/('options-'+str(width)+'.png')))
          await page.keyboard.press('Escape')
          await page.goto(BASE+'/?tab=product-detail&productId=1', wait_until='domcontentloaded'); await page.get_by_role('navigation', name='Phân trang đánh giá').wait_for()
          assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth + 2'), width
          screens[str(width)]={'options':True, 'reviews':True, 'overflow':False}
      assert not errors, errors
      result={'method':'isolated Chromium with mocked APIs, no real cart writes', 'runtime_errors':errors, 'screens':screens, 'magnifier_and_plus_open_options':True, 'selected_options_preserved':True, 'unit_price':90000, 'double_click_posts':1, 'failure_keeps_options':True, 'review_page_size':5, 'review_summary_total':20}
      (OUT/'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)); print(json.dumps(result, ensure_ascii=False)); await browser.close()

asyncio.run(run())
