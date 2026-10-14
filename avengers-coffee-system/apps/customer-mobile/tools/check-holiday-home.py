"""Isolated Expo web QA with fixture APIs. No real login, provider calls, or backend writes."""
import json,sys,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8090'
OUT=Path('/tmp/customer-holiday-ui');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='no-preference')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 calls=[];sent=[];sockets=[];socket_events=[];fail_send=False;messages=[{'id':'history-user','ma_hoi_thoai':'fixture-conversation','vai_tro_nguoi_gui':'CUSTOMER','noi_dung':'Tôi muốn hỏi về đơn hàng','ngay_tao':'2026-10-13T03:00:00Z'},{'id':'history-staff','ma_hoi_thoai':'fixture-conversation','vai_tro_nguoi_gui':'STAFF','ten_nguoi_gui':'Nhân viên kiểm thử','noi_dung':'Chúng mình có thể hỗ trợ bạn','ngay_tao':'2026-10-13T03:01:00Z'}]
 def intercept(route):
  request=route.request;url=urlparse(request.url);path=url.path
  if url.port==3005:route.abort();return
  if url.port not in [3000,3001,3002,3003,3004]:route.continue_();return
  calls.append({'method':request.method,'path':path})
  payload=[]
  if path=='/menu/san-pham':payload=[]
  elif path.startswith('/cart'):payload={'items':[]}
  elif path.endswith('/conversations/open'):payload={'conversation':{'ma_hoi_thoai':'fixture-conversation','ma_khach_hang':'fixture-customer'}}
  elif path.endswith('/messages'):
   if request.method=='POST':
    data=request.post_data_json
    if fail_send:
     route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'fixture unavailable'}));return
    sent.append(data)
    assert data['sender_role']=='CUSTOMER' and data['content'].strip()
    message={'id':'sent-'+str(len(sent)),'ma_hoi_thoai':'fixture-conversation','vai_tro_nguoi_gui':'CUSTOMER','noi_dung':data['content'],'ngay_tao':'2026-10-13T03:03:00Z'};messages.append(message);payload={'message':message}
   else:payload={'items':messages}
  elif path.endswith('/read'):payload={'success':True}
  elif request.method not in ['GET','OPTIONS']:
   raise RuntimeError('Unexpected mutation '+path)
  route.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*'},content_type='application/json',body=json.dumps(payload))
 context.route('**/*',intercept)
 def websocket(ws):
  sockets.append(ws)
  def receive(message):
   socket_events.append(str(message))
   if str(message).startswith('40/chat'): ws.send('40/chat,{"sid":"fixture-chat-socket"}')
   elif message=='2': ws.send('3')
  ws.on_message(receive)
  ws.send('0'+json.dumps({'sid':'fixture-engine','upgrades':[],'pingInterval':25000,'pingTimeout':20000,'maxPayload':1000000}))
 context.route_web_socket('**:3005/**',websocket)
 page.goto(BASE,wait_until='domcontentloaded');page.get_by_test_id('holiday-hero').wait_for(timeout=120000)
 page.wait_for_timeout(1000);page.screenshot(path=str(OUT/'home.png'))
 result={'method':'isolated Chromium, mocked APIs, no real backend/provider calls','failures':[],'screens':{}}
 def check(label):
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
  if overflow:result['failures'].append({'screen':label,'horizontal_overflow':True})
  result['screens'][label]={'horizontal_overflow':overflow}
 check('home-390')
 # Manual selection, readable overlay copy, and pause/resume.
 page.get_by_label('Xem ảnh lễ hội 2',exact=True).click();page.get_by_text('Chạm vào',exact=False).wait_for();page.wait_for_timeout(750);page.screenshot(path=str(OUT/'home-slide-2.png'))
 page.get_by_label('Xem ảnh lễ hội 3',exact=True).click();page.get_by_text('Mùa đông',exact=False).wait_for();page.wait_for_timeout(750);page.screenshot(path=str(OUT/'home-slide-3.png'))
 page.get_by_label('Tạm dừng chuyển ảnh',exact=True).click();page.wait_for_timeout(7200);assert page.get_by_text('Mùa đông',exact=False).count()
 page.get_by_label('Tiếp tục chuyển ảnh',exact=True).click();page.wait_for_timeout(7400);assert page.get_by_text('Một chút ấm áp.',exact=False).count()
 result['carousel']={'manual':True,'pause':True,'resume':True}
 page.get_by_label('Mở menu trang chủ',exact=True).click();page.get_by_text('Khám phá Avengers').wait_for();page.screenshot(path=str(OUT/'home-menu.png'));check('menu')
 page.get_by_label('Đóng menu',exact=True).last.click()
 page.get_by_label('Mở nhắn tin',exact=True).click();page.get_by_label('Tin nhắn cho nhân viên',exact=True).wait_for()
 page.get_by_text('Tôi muốn hỏi về đơn hàng',exact=True).wait_for();page.get_by_text('Chúng mình có thể hỗ trợ bạn',exact=True).wait_for()
 page.get_by_label('Tin nhắn cho nhân viên',exact=True).fill('Tin nhắn kiểm thử UI')
 page.get_by_label('Gửi tin nhắn cho nhân viên',exact=True).click();page.get_by_text('Tin nhắn kiểm thử UI',exact=True).wait_for();assert len(sent)==1
 page.screenshot(path=str(OUT/'staff-chat.png'));check('staff-chat')
 fail_send=True
 page.get_by_label('Tin nhắn cho nhân viên',exact=True).fill('Giữ bản nháp khi lỗi')
 page.get_by_label('Gửi tin nhắn cho nhân viên',exact=True).click()
 page.get_by_text('Chưa xác nhận tin nhắn đã gửi.',exact=False).wait_for()
 assert page.get_by_label('Tin nhắn cho nhân viên',exact=True).input_value()=='Giữ bản nháp khi lỗi'
 assert len(sent)==1
 fail_send=False
 # Exercise a Socket.IO event first, then fallback polling after disconnect.
 messages.append({'id':'staff-new','ma_hoi_thoai':'fixture-conversation','vai_tro_nguoi_gui':'MANAGER','ten_nguoi_gui':'Quản lý kiểm thử','noi_dung':'Phản hồi mới từ nhân viên','ngay_tao':'2026-10-13T03:04:00Z'})
 assert sockets and any('chat:conversation:join' in event for event in socket_events), socket_events
 sockets[-1].send('42/chat,'+json.dumps(['chat:message:new',messages[-1]]))
 page.get_by_text('Phản hồi mới từ nhân viên',exact=True).wait_for(timeout=2500)
 for socket in sockets: socket.close()
 messages.append({'id':'staff-poll','ma_hoi_thoai':'fixture-conversation','vai_tro_nguoi_gui':'STAFF','noi_dung':'Phản hồi qua cập nhật dự phòng','ngay_tao':'2026-10-13T03:05:00Z'})
 page.get_by_text('Phản hồi qua cập nhật dự phòng',exact=True).wait_for(timeout=12000)
 page.get_by_role('tab',name='Trợ lý AI',exact=True).click();page.get_by_text('Trợ lý Avengers Coffee',exact=True).wait_for()
 before=sum(c['path'].endswith('/messages') for c in calls);page.wait_for_timeout(5600);after=sum(c['path'].endswith('/messages') for c in calls);assert before==after
 assert not any(c['path'].startswith('/ai/') and c['method']=='POST' for c in calls)
 result['chat']={'history_user_and_staff':True,'send_count':len(sent),'socket_event_response':True,'poll_response':True,'stopped_after_leaving':True,'ai_provider_calls':0}
 page.get_by_role('tab',name='Nhân viên',exact=True).click();page.get_by_text('Tin nhắn kiểm thử UI',exact=True).wait_for()
 for width in [320,480,1440]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(250);check('chat-'+str(width))
 page.get_by_label('Quay lại',exact=True).click();page.get_by_test_id('holiday-hero').wait_for()
 for width in [320,480,1440]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(250);check('home-'+str(width));page.screenshot(path=str(OUT/('home-'+str(width)+'.png')))
 context2=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
 context2.route('**/*',intercept)
 context2.route_web_socket('**:3005/**',lambda socket:socket.close())
 reduced_page=context2.new_page();reduced_page.goto(BASE,wait_until='domcontentloaded');reduced_page.get_by_test_id('holiday-hero').wait_for(timeout=120000)
 reduced_page.wait_for_timeout(7400);assert reduced_page.get_by_text('Một chút ấm áp.',exact=False).count()
 result['carousel']['reduced_motion']=True
 context2.close()
 result['chat']['failed_send_keeps_draft']=True
 result['errors']=errors
 result['errors']=errors
 if errors:result['failures'].append({'runtime_errors':errors})
 (OUT/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False),flush=True)
 context.close();browser.close()
 sys.exit(1 if result['failures'] else 0)
