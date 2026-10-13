"""Isolated browser qualification with mocked APIs; never authenticates real users or writes backend data.
Requires Python Playwright + its Chromium. Usage: python3 tools/check-workspace-ui.py [base URL] [actor,actor,...] [--rich]
Artifacts: /tmp/avengers-workspace-ui (screenshots + JSON). Not live API qualification.
"""
import json, sys, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5174'
RICH = '--rich' in sys.argv
OUT = Path('/tmp/avengers-workspace-ui' + ('-dashboard' if RICH else '-focused' if len(sys.argv)>2 else '')); OUT.mkdir(exist_ok=True)
ROLES = {'admin':'ADMIN','manager':'MANAGER','staff':'STAFF','partner':'FRANCHISEE','accountant':'ACCOUNTANT','kiosk-staff':'FRANCHISE_STAFF'}
if len(sys.argv)>2: ROLES={actor:ROLES[actor] for actor in sys.argv[2].split(',')}
KIOSK = {'id':'fixture-kiosk','ma_kiosk':'KSK-FIXTURE','ten_kiosk':'Kiosk kiểm thử','trang_thai':'DANG_HOAT_DONG','loai_kiosk':'CONTAINER_CAFE','dia_chi':'Địa chỉ kiểm thử'}
TIERS = [{'ma_hang':code,'ten_hang':name,'diem_toi_thieu':i*1000,'he_so_diem':1+i*.2,'luot_quay_thang':1+i,'chi_tieu_toi_thieu_thang': i*200000,'ma_voucher_thang_hang':'FIXTURE_VOUCHER_LONG_CODE','ma_voucher_sinh_nhat':'FIXTURE_BIRTHDAY_VOUCHER_LONG_CODE','mau_sac':'#cccccc'} for i,(code,name) in enumerate([('MEMBER','Thành viên'),('SILVER','Bạc'),('GOLD','Vàng'),('DIAMOND','Kim cương'),('PLATINUM','Super VIP')])]
BRANCHES = [{'ma_co_so':'MAIN','co_so_ma':'MAIN','ten_co_so':'Chi nhánh kiểm thử với tên dài','ten_chi_nhanh':'Chi nhánh kiểm thử với tên dài','dia_chi':'240 Phạm Văn Đồng, Phường Hiệp Bình Chánh, Thành phố Hồ Chí Minh','trang_thai':'ACTIVE','gio_mo_cua':'06:30','gio_dong_cua':'22:00','tong_tai_khoan':1}]
from datetime import datetime, timedelta, timezone
# Synthetic, populated chart fixture only for visual qualification; never app demo data.
SAMPLE_ORDERS = [{'ma_don_hang':'FIXTURE-'+str(i),'ngay_tao':(datetime.now(timezone.utc)-timedelta(days=i+1)).isoformat(), 'trang_thai_don_hang':['HOAN_THANH','DANG_GIAO','DA_XAC_NHAN'][i%3], 'phuong_thuc_thanh_toan':['QR','THANH_TOAN_KHI_NHAN_HANG'][i%2], 'tong_tien':120000+i*30000, 'chi_tiet':[{'ma_san_pham':i%3+1,'ten_san_pham':['Cà phê sữa','Trà đào','Cacao'][i%3],'so_luong':i%3+1,'gia_ban':40000}]} for i in range(6)]
SAMPLE_MENU = [{'id':i+1,'name':name,'category':'Đồ uống','price':40000,'status':'available'} for i,name in enumerate(['Cà phê sữa','Trà đào','Cacao','Trà chanh'])]
def payload_for(path, role):
    if RICH:
        if path=='/franchise/cong-no/cua-toi': return [{'id':'fixture-debt','kiosk_id':'fixture-kiosk','so_tien':7500000,'phi_phat_tre_han':0,'trang_thai':'CON_NO','loai_phat_sinh':'MUA_COMBO','ngay_tao':datetime.now(timezone.utc).isoformat()}]
        if path=='/staff/orders': return {'orders':SAMPLE_ORDERS,'items':SAMPLE_ORDERS}
        if path=='/menu/items': return {'items':SAMPLE_MENU}
        if path=='/inventory/items': return [{'ma_san_pham':i+1,'so_luong_ton':n,'muc_canh_bao':5} for i,n in enumerate([32,3,18,0])]
        if path=='/users/admin/stats': return {'total_users':120,'active_users':110,'inactive_users':10,'by_role':{'ADMIN':2,'MANAGER':8,'STAFF':26,'CUSTOMER':78,'FRANCHISEE':4,'ACCOUNTANT':2}}
    if path == '/auth/login': return {'user':{'vaiTro':role,'tenDangNhap':'fixture','ma_nguoi_dung':'fixture'},'accessToken':'fixture-token'}
    if path.endswith('/membership-config'): return {'tier_config':TIERS,'lucky_wheel_config':{'chi_phi_quay':100,'giai_thuong':[]}}
    if path == '/users/admin/branches': return {'items':BRANCHES}
    if path == '/users/me': return {'vaiTro':role,'tenDangNhap':'fixture','hoTen':'Người kiểm thử','coSoMa':'KSK-FIXTURE' if role == 'FRANCHISE_STAFF' else 'MAIN'}
    if path in ['/franchise/kiosk/cua-toi','/franchise/kiosk/public','/franchise/kiosk']: return [KIOSK]
    if path == '/franchise/dashboard/admin': return {'success':True,'data':{'tong_kiosk_hoat_dong':1,'tong_don_combo':6,'tong_royalty_da_thu':3500000,'tong_no_chua_thu':7500000,'xu_huong_doanh_thu':[{'thang':'2026-08','doanh_thu_kiosk':12000000,'doanh_thu_royalty':1000000},{'thang':'2026-09','doanh_thu_kiosk':18000000,'doanh_thu_royalty':2500000}],'doanh_thu_theo_khu_vuc':[{'khu_vuc':'Hồ Chí Minh','so_luong_kiosk':1,'doanh_thu_thang':18000000}]}}
    if path == '/wallet/info': return {'so_du':0,'balance':0}
    if path.endswith('/active'): return {'active_shift':None,'data':None}
    if path.startswith('/franchise/') or path in ['/menu/categories','/menu/attributes']: return []
    return {'items':[],'orders':[],'success':True,'data':[]}

def overflow(page):
    return page.evaluate('''() => {
      const shells = [...document.querySelectorAll('.console-shell, .console-main, .console-page, .console-admin-body, .workspace-tab-content')];
      return shells.filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 2).map(el => ({class:el.className,width:el.clientWidth,scroll:el.scrollWidth}));
    }''')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    result={'method':'mocked API, isolated Chromium; no real login/backend writes','actors':{},'login':{},'failures':[]}
    for actor, role in ROLES.items():
        context=browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
        calls=[]
        def route_api(route):
            path=urlparse(route.request.url).path; calls.append(path)
            if route.request.method not in ['GET','OPTIONS','POST'] or (route.request.method=='POST' and path!='/auth/login'):
                route.abort(); return
            route.fulfill(status=200, content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(payload_for(path,role)))
        context.route('**:3000/**',route_api)
        context.route('**:3005/**',lambda route: route.abort())
        page=context.new_page(); errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
        workspace='staff' if actor=='kiosk-staff' else actor
        session={'token':'fixture-token','user':{'vaiTro':role,'tenDangNhap':'fixture','ma_nguoi_dung':'fixture','email':'fixture@example.invalid','coSoMa':'KSK-FIXTURE' if actor=='kiosk-staff' else 'MAIN'}}
        context.add_init_script('sessionStorage.setItem("adminSession", '+json.dumps(json.dumps(session))+'); localStorage.removeItem("adminSession");')
        page.goto(BASE+'/?workspace='+workspace); page.wait_for_selector('.console-shell'); page.wait_for_selector('.console-kiosk-tabs button' if actor == 'kiosk-staff' else '.workspace-sidebar nav .console-nav-item'); page.wait_for_timeout(500)
        pages=page.locator('.workspace-sidebar nav .console-nav-item').all_text_contents()
        if actor=='kiosk-staff': pages=page.locator('.console-kiosk-tabs button').all_text_contents()
        actor_result={'pages':[],'errors':errors,'accent':page.locator('.console-shell').evaluate("el=>getComputedStyle(el).getPropertyValue('--primary').trim()")}
        sidebar=page.locator('.console-sidebar').evaluate('el=>getComputedStyle(el).backgroundColor') if actor!='kiosk-staff' else None
        actor_result['sidebar_color']=sidebar
        actor_result['font']=page.locator('.console-shell').evaluate('el=>getComputedStyle(el).fontFamily')
        if sidebar in ['rgb(255, 255, 255)','rgb(234, 245, 239)']: result['failures'].append({'actor':actor,'sidebar_color':sidebar})
        if page.get_by_role('button',name='Mở Shipper Mobile').count(): result['failures'].append({'actor':actor,'shipper_launcher_visible':True})
        page.screenshot(path=str(OUT/(actor+'-dashboard.png')))
        if actor=='accountant':
            page.locator('.workspace-sidebar .console-nav-item').filter(has_text='Quản lý nhượng quyền').click()
            page.locator('.workspace-franchise-hero').wait_for()
            page.screenshot(path=str(OUT/'accountant-franchise.png'))
        if RICH:
            page.wait_for_timeout(300)
            actor_result['charts']=page.locator('.console-chart').count()
            if actor=='partner':
                badge=page.locator('.workspace-debt-badge')
                badge.wait_for(); assert '7.500.000' in badge.inner_text()
                actor_result['debt_badge']=badge.evaluate('el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})')
            if actor=='manager':
                stock=page.locator('.console-chart').filter(has_text='Tình trạng tồn kho').locator('tbody').all_text_contents()
                assert stock and all(value in stock[0] for value in ['Còn hàng trên mức cảnh báo2','Sắp hết hàng1','Hết hàng1']), stock
            page.screenshot(path=str(OUT/(actor+'-dashboard.png')))
            pages=pages[:1]
        for i,label in enumerate(pages):
            selector='.console-kiosk-tabs button' if actor=='kiosk-staff' else '.workspace-sidebar nav .console-nav-item'
            # Headings are all open in fixture. React lazy chunks must be allowed to finish.
            button=page.locator(selector).filter(has_text=label.strip()).first
            button.click(); page.wait_for_timeout(500)
            issues=overflow(page)
            recovery=page.locator('.console-recovery').count()
            actor_result['pages'].append({'label':label.strip(),'overflow':issues,'recovery':recovery})
            if issues or recovery: result['failures'].append({'actor':actor,'page':label.strip(),'overflow':issues,'recovery':recovery})
            page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(100)
            mobile_issues=overflow(page)
            if mobile_issues: page.screenshot(path=str(OUT/(actor+'-overflow-'+str(i)+'.png')),full_page=True)
            if mobile_issues: result['failures'].append({'actor':actor,'page':label.strip(),'mobile_overflow':mobile_issues})
            actor_result['pages'][-1]['mobile_overflow']=mobile_issues
            page.set_viewport_size({'width':1440,'height':1000}); page.wait_for_timeout(80)
            if actor=='admin' and ('Hạng thành viên' in label or 'Chi nhánh'==label.strip()): page.screenshot(path=str(OUT/(actor+'-'+str(i)+'.png')),full_page=True)
        assert pages, actor + ' did not load navigation'
        selected=page.locator('.console-kiosk-tabs button[aria-current="page"]' if actor=='kiosk-staff' else '.workspace-sidebar button[aria-current="page"]').first
        actor_result['selected_menu']=selected.evaluate("el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})")
        if actor_result['selected_menu']['color'] != 'rgb(255, 255, 255)': result['failures'].append({'actor':actor,'selected_menu':actor_result['selected_menu']})
        if actor=='admin':
            actor_result['form_previews']=[]
            for nav_label, create_label, form_selector, artifact in [
                ('Danh mục sản phẩm','Tạo danh mục','.cat-modal-card','admin-category-popup'),
                ('Hạng thành viên','Tạo hạng thành viên mới','.workspace-edit-form','admin-membership-form'),
                ('Chi nhánh','Thêm chi nhánh mới','.branch-form-card','admin-branch-form')]:
                page.locator('.workspace-sidebar .console-nav-item').filter(has_text=nav_label).first.click()
                page.get_by_role('button',name=create_label,exact=True).first.click()
                form=page.locator(form_selector); form.wait_for()
                form.scroll_into_view_if_needed(); page.wait_for_timeout(150)
                if artifact=='admin-category-popup':
                    icon=form.locator('.cat-modal-close svg').bounding_box()
                    if not icon or icon['width']<16: result['failures'].append({'form':artifact,'close_icon':icon})
                save=form.locator('button.btn-save, button.branch-btn--save').first
                save_style=save.evaluate("el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})")
                if save_style['background']=='rgb(255, 255, 255)' or save_style['color']!='rgb(255, 255, 255)': result['failures'].append({'form':artifact,'save_style':save_style})
                page.screenshot(path=str(OUT/(artifact+'.png')))
                page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(150)
                form_issues=overflow(page)
                page.screenshot(path=str(OUT/(artifact+'-mobile.png')))
                actor_result['form_previews'].append({'name':artifact,'mobile_overflow':form_issues})
                if form_issues: result['failures'].append({'form':artifact,'mobile_overflow':form_issues})
                if artifact=='admin-category-popup':
                    page.locator('#cat-modal-level').select_option('2')
                    page.wait_for_selector('#cat-modal-parent')
                    page.screenshot(path=str(OUT/'admin-subcategory-popup-mobile.png'))
                    if overflow(page): result['failures'].append({'form':'subcategory','mobile_overflow':overflow(page)})
                page.set_viewport_size({'width':1440,'height':1000})
                if artifact=='admin-category-popup': page.locator('.cat-modal-close').click()
        # Search dialog including collapsed nav groups, lazy loading and Escape.
        page.locator('.workspace-search-trigger').click(); page.get_by_role('dialog',name='Tìm trang làm việc').wait_for()
        page.get_by_role('textbox',name='Tên trang hoặc chức năng').fill('NONMATCHING_FIXTURE')
        page.get_by_text('Không tìm thấy trang.',exact=False).wait_for(); page.keyboard.press('Escape')
        page.get_by_role('button',name='Xem thông báo',exact=True).click()
        page.get_by_role('dialog',name='Thông báo',exact=True).wait_for(); page.wait_for_timeout(300)
        page.screenshot(path=str(OUT/(actor+'-notifications.png')))
        page.keyboard.press('Escape')
        # Responsive shell; actual tables may scroll inside their dedicated wrappers.
        page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(150)
        mobile=overflow(page)
        actor_result['mobile_overflow']=mobile
        page.screenshot(path=str(OUT/(actor+'-mobile.png')),full_page=True)
        if mobile: result['failures'].append({'actor':actor,'mobile_overflow':mobile})
        if errors: result['failures'].append({'actor':actor,'runtime_errors':errors})
        result['actors'][actor]=actor_result; context.close()
        print(actor,len(pages),'pages',len(errors),'runtime errors',len(mobile),'mobile overflows',flush=True)
    # Login wrong-role response (defense even if old API still issues a token).
    context=browser.new_context(viewport={'width':1440,'height':1000})
    context.route('**:3000/**',lambda route: route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(payload_for('/auth/login','MANAGER'))))
    page=context.new_page();page.goto(BASE+'/?workspace=partner')
    page.get_by_label('Tên đăng nhập hoặc email').fill('fixture')
    page.get_by_label('Mật khẩu',exact=True).fill('fixture-password')
    page.get_by_role('button',name='Đăng nhập vào không gian làm việc').click()
    page.get_by_role('alert').filter(has_text='Tài khoản không thuộc nhóm').wait_for()
    assert page.evaluate('sessionStorage.getItem("adminSession")') is None
    result['login']['manager_in_partner_rejected']=True
    for workspace in ['admin','manager','staff','partner','accountant']:
        page.goto(BASE+'/?workspace='+workspace);page.wait_for_selector('.console-login-photo');page.wait_for_timeout(120)
        photo=page.locator('.console-login-photo').evaluate('el=>({src:el.getAttribute("src"),loaded:el.complete&&el.naturalWidth>0})')
        result['login'][workspace]=photo
        geometry=page.evaluate("""() => {
            const bg=document.querySelector('.console-login-photo').getBoundingClientRect();
            const card=document.querySelector('.console-login-form').getBoundingClientRect();
            return {photo_width:bg.width,photo_height:bg.height,card_left:card.left,card_width:card.width, viewport:innerWidth, horizontal_overflow:document.documentElement.scrollWidth>innerWidth+2};
        }""")
        result['login'][workspace]['geometry']=geometry
        if geometry['photo_width']<geometry['viewport']-2 or geometry['card_left']<geometry['viewport']*.5 or geometry['horizontal_overflow']: result['failures'].append({'login_layout':workspace,'geometry':geometry})
        page.screenshot(path=str(OUT/('login-'+workspace+'.png')))
        if not photo['loaded']: result['failures'].append({'photo':workspace})
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'login-mobile.png'),full_page=True)
    if page.evaluate('document.documentElement.scrollWidth>innerWidth+2'): result['failures'].append({'login_mobile_overflow':True})
    context.close();browser.close()
    (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('Failures:',len(result['failures']),flush=True)
    sys.exit(1 if result['failures'] else 0)
