"""Customer auth QA with fake Google SDK + fixture API. No email or real authentication."""
import asyncio, json, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8092'
OUT=Path('/tmp/customer-auth-ui');OUT.mkdir(exist_ok=True)
GOOGLE="""window.google={accounts:{oauth2:{initTokenClient:function(config){return {requestAccessToken:function(){setTimeout(function(){if(window.__googleMode==='cancel'){config.error_callback({type:'popup_closed'});}else if(window.__googleMode==='error'){config.error_callback({type:'popup_failed_to_open'});}else{config.callback({access_token:'fixture-google-token'});}},120);}};}}}};"""
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
  context.set_default_timeout(15000)
  await context.add_init_script("""window.grecaptcha={ready:fn=>fn(),reset:()=>{},render:(node,config)=>{const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Xác thực kiểm thử');check.onchange=()=>config.callback(check.checked?'fixture-captcha-token':'');window.__expireCaptcha=config['expired-callback'];node.appendChild(check);return 1;}};""")
  writes=[]; errors=[]; fail_reset=True; fail_login=False; malformed_google=False; fail_otp=False; fail_captcha=False
  async def api(route):
   req=route.request; u=urlparse(req.url); path=u.path
   if u.hostname=='accounts.google.com': await route.fulfill(content_type='application/javascript',body=GOOGLE);return
   if u.port==3005: await route.abort();return
   if u.port not in [3000,3001,3002,3003,3004]: await route.continue_();return
   data=[];status=200
   if req.method=='POST':
    body=req.post_data_json;writes.append({'path':path,'body':body})
    if path in ['/auth/login','/auth/google']:
     if fail_login: data={'message':'Tài khoản hoặc mật khẩu chưa đúng'};status=401
     elif malformed_google and path=='/auth/google':data={'accessToken':'fixture-backend-token','user':{}}
     else:data={'accessToken':'fixture-backend-token','user':{'ma_nguoi_dung':'fixture-account','hoTen':'Khách Google' if path.endswith('google') else 'Khách kiểm thử','email':'fixture@example.invalid','vaiTro':'CUSTOMER'}}
    elif path=='/auth/recaptcha/verify':
     if fail_captcha:data={'message':'Xác minh reCAPTCHA thất bại'};status=400
     else:data={'success':True}
    elif path=='/auth/register':data={'message':'Đăng ký thành công'}
    elif path=='/auth/forgot-password/request':
     if fail_otp:data={'message':'Chưa gửi được email xác thực. Vui lòng thử lại sau một phút.','retry_after_seconds':60};status=503
     else:data={'message':'Nếu tài khoản tồn tại, mã xác thực đã được gửi về email của bạn.','expires_in_minutes':10}
    elif path=='/auth/forgot-password/reset':
     if fail_reset: data={'message':'Mã OTP không chính xác'};status=400
     else:data={'message':'Đặt lại mật khẩu thành công'}
    elif path=='/cart/merge-guest':data={'items':[]}
    else:raise AssertionError('Unexpected mutation '+path)
   elif path.startswith('/cart'):data={'items':[]}
   await route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'},body=json.dumps(data))
  await context.route('**/*',api);await context.route_web_socket('**:3005/**',lambda ws:ws.close())
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(BASE,wait_until='domcontentloaded');await page.get_by_test_id('holiday-hero').wait_for()
  await page.get_by_label('Tài khoản',exact=True).click();await page.get_by_text('Chào mừng trở lại',exact=True).wait_for()
  await page.get_by_label('Tiếp tục với Google',exact=True).wait_for()
  await page.screenshot(path=str(OUT/'login-390.png'))
  async def choose_google():
   await page.get_by_label('Tiếp tục với Google',exact=True).click()
   await page.get_by_label('Chọn tài khoản Google',exact=True).wait_for()
   await expect(page.get_by_label('Chọn tài khoản Google',exact=True)).to_be_disabled()
   await page.get_by_label('Xác thực kiểm thử',exact=True).check()
   await page.evaluate('window.__expireCaptcha()')
   await expect(page.get_by_label('Chọn tài khoản Google',exact=True)).to_be_disabled()
   await page.get_by_label('Xác thực kiểm thử',exact=True).uncheck()
   await page.get_by_label('Xác thực kiểm thử',exact=True).check()
   await expect(page.get_by_label('Chọn tài khoản Google',exact=True)).to_be_enabled()
   await asyncio.sleep(.35)
   await page.screenshot(path=str(OUT/'google-verification-390.png'))
   await page.get_by_label('Chọn tài khoản Google',exact=True).click()
  # Cancellation and popup failure never create a local backend session.
  await page.evaluate("window.__googleMode='cancel'")
  await choose_google();await asyncio.sleep(.4)
  assert not any(w['path']=='/auth/google' for w in writes)
  await page.evaluate("window.__googleMode='success'");fail_captcha=True
  await choose_google();await page.get_by_text('Xác minh reCAPTCHA thất bại',exact=True).wait_for()
  assert not any(w['path']=='/auth/google' for w in writes)
  fail_captcha=False
  # Rejected/malformed backend responses must not publish or persist a session.
  await page.evaluate("window.__googleMode='success'");fail_login=True
  await choose_google();await page.get_by_text('Tài khoản hoặc mật khẩu chưa đúng',exact=True).wait_for();fail_login=False
  malformed_google=True
  await choose_google();await page.get_by_text('Chưa nhận được phiên đăng nhập hợp lệ.',exact=False).wait_for();malformed_google=False
  assert 'fixture-backend-token' not in await page.evaluate('JSON.stringify(localStorage)')
  assert not any(w['path']=='/cart/merge-guest' for w in writes)
  await page.evaluate("window.__googleMode='error'")
  await choose_google();await page.get_by_text('Không mở được Google.',exact=False).wait_for()
  assert len([w for w in writes if w['path']=='/auth/google'])==2
  # Registration validation and successful creation use the existing web contract.
  await page.get_by_role('tab',name='Đăng ký',exact=True).click()
  await page.get_by_label('Họ và tên',exact=True).fill('Khách kiểm thử')
  await page.get_by_label('Email',exact=True).fill('Fixture@Example.invalid')
  await page.get_by_label('Mật khẩu',exact=True).fill(' password ')
  await page.get_by_label('Xác nhận mật khẩu',exact=True).fill('wrong')
  await page.get_by_label('Tạo tài khoản',exact=True).click();await page.get_by_text('Mật khẩu xác nhận chưa khớp.',exact=True).wait_for()
  assert not any(w['path']=='/auth/register' for w in writes)
  await page.get_by_label('Xác nhận mật khẩu',exact=True).fill(' password ')
  await page.screenshot(path=str(OUT/'register-390.png'))
  await page.get_by_label('Tạo tài khoản',exact=True).dblclick();await page.get_by_text('Tài khoản đã được tạo.',exact=False).wait_for()
  registered=[w for w in writes if w['path']=='/auth/register'];assert len(registered)==1 and registered[0]['body']=={'email':'fixture@example.invalid','password':' password ','hoTen':'Khách kiểm thử'}
  # Login errors do not navigate away or clear the input.
  fail_login=True
  await page.get_by_label('Mật khẩu',exact=True).fill(' password ')
  await page.get_by_label('Đăng nhập',exact=True).click();await page.get_by_text('Tài khoản hoặc mật khẩu chưa đúng',exact=True).wait_for()
  assert await page.get_by_label('Mật khẩu',exact=True).input_value()==' password '
  fail_login=False
  # OTP request, cooldown, malformed/mismatched passwords, rejected code, success.
  await page.get_by_text('Quên mật khẩu?',exact=True).click();fail_otp=True
  await page.clock.install()
  await page.get_by_label('Gửi mã xác thực',exact=True).click();await page.get_by_text('Chưa gửi được email xác thực.',exact=False).wait_for()
  assert await page.get_by_label('Gửi mã xác thực',exact=True).is_disabled()
  fail_otp=False;await page.clock.fast_forward(61000)
  await page.get_by_label('Gửi mã xác thực',exact=True).click()
  await page.get_by_label('Mã xác thực',exact=True).wait_for();assert len([w for w in writes if w['path']=='/auth/forgot-password/request'])==2
  assert await page.get_by_label('Gửi lại mã xác thực',exact=True).is_disabled()
  await page.get_by_label('Mã xác thực',exact=True).fill('123')
  await page.get_by_label('Mật khẩu mới',exact=True).fill(' new password ')
  await page.get_by_label('Xác nhận mật khẩu',exact=True).fill(' new password ')
  await page.get_by_label('Lưu mật khẩu mới',exact=True).click();await page.get_by_text('Mã xác thực cần đủ 6 chữ số.',exact=True).wait_for()
  assert not any(w['path']=='/auth/forgot-password/reset' for w in writes)
  await page.get_by_label('Mã xác thực',exact=True).fill('123456')
  await page.get_by_label('Lưu mật khẩu mới',exact=True).click();await page.get_by_text('Mã OTP không chính xác',exact=True).wait_for()
  assert await page.get_by_label('Mã xác thực',exact=True).input_value()=='123456'
  await page.screenshot(path=str(OUT/'reset-390.png'));fail_reset=False
  await page.get_by_label('Lưu mật khẩu mới',exact=True).click();await page.get_by_text('Đã đặt lại mật khẩu.',exact=False).wait_for()
  resets=[w for w in writes if w['path']=='/auth/forgot-password/reset'];assert resets[-1]['body']['newPassword']==' new password ' and resets[-1]['body']['email']=='fixture@example.invalid'
  # Google is also the signup path: one backend exchange, shared persisted session and cart merge.
  await page.get_by_role('tab',name='Đăng ký',exact=True).click();await page.evaluate("window.__googleMode='success'")
  await page.get_by_label('Đăng ký với Google',exact=True).dblclick()
  await page.get_by_label('Xác thực kiểm thử',exact=True).check()
  await page.get_by_label('Chọn tài khoản Google',exact=True).dblclick()
  await page.get_by_test_id('holiday-hero').wait_for();await page.get_by_text('Chào Khách Google,',exact=True).wait_for()
  google=[w for w in writes if w['path']=='/auth/google'];assert len(google)==3 and google[-1]['body']=={'googleToken':'fixture-google-token','isAccessToken':True,'recaptchaToken':'fixture-captcha-token'}
  assert any(w['path']=='/cart/merge-guest' for w in writes)
  assert 'fixture-google-token' not in await page.evaluate('JSON.stringify(localStorage)')
  await page.reload(wait_until='domcontentloaded');await page.get_by_text('Chào Khách Google,',exact=True).wait_for()
  screens={}
  # Fresh anonymous contexts for layout, avoiding real logout/backend writes.
  for width in [320,390,480,1440]:
   await page.evaluate('localStorage.clear()');await page.set_viewport_size({'width':width,'height':900})
   await page.reload(wait_until='domcontentloaded');await page.get_by_test_id('holiday-hero').wait_for()
   await page.get_by_label('Tài khoản',exact=True).click();await page.get_by_text('Chào mừng trở lại',exact=True).wait_for()
   for mode,label in [('login',None),('register','Đăng ký'),('forgot','Quên mật khẩu?')]:
    if label=='Đăng ký':await page.get_by_role('tab',name=label,exact=True).click()
    elif label:
     await page.get_by_role('tab',name='Đăng nhập',exact=True).click();await page.get_by_text(label,exact=True).click()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+2'), (width,mode)
    await page.screenshot(path=str(OUT/(mode+'-'+str(width)+'.png')))
   screens[str(width)]=['login','register','forgot']
  assert not errors,errors
  result={'method':'Chromium + mocked API and Google SDK, no real email/provider/authentication','base_url':BASE,'runtime_errors':errors,'screens':screens,'register_posts':len(registered),'google_success_posts':1,'google_exchange_attempts':len(google),'captcha_expiry_blocks_button':True,'captcha_verification_failure_no_google_exchange':True,'google_cancel_no_session':True,'popup_error':True,'invalid_session_rejected':True,'otp_delivery_error_cooldown':True,'password_whitespace_preserved':True,'otp_validation_error_success':True,'otp_resend_cooldown':True,'session_restored':True,'guest_cart_merge':True}
  (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));await browser.close()
asyncio.run(run())
