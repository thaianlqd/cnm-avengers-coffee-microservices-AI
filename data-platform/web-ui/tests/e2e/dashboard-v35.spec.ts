import { expect, test } from '@playwright/test';
import { mockApi, REPORT } from './helpers';

const dashboards=Array.from({length:16},(_,index)=>({id:`D${String(index+1).padStart(2,'0')}`,version:'1.0.0',
  title:['Doanh thu & đơn hàng','Sản phẩm & danh mục','Cửa hàng & khu vực','Kiosk','Giao hàng & tài xế','Thanh toán','Khuyến mãi & voucher','Khách hàng & hội viên','Tồn kho & cảnh báo','Ca làm & chấm công','Đối soát thu ngân','Đánh giá sản phẩm','Đánh giá cửa hàng','Khảo sát khách hàng','Yêu thích sản phẩm','Giờ cao điểm'][index],
  category:index<8?'Kinh doanh':'Vận hành',description:`Bài toán ${index+1}`,limitation:'Đọc cùng định nghĩa chỉ số.',
  default_time:index===8?'all_time':'30d',status:'unknown',panel_count:4,source_views:['silver.fixture'],scope_types:[]}));
const session={authenticated:true,identity:'fixture-admin:policy35',role:'ADMIN',permissions:['analytics.read','system.read','warehouse.read'],expires_at:4000000000};

test('hub loads metadata only, searches sixteen domains and runs only selected preset',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/ai/dashboards',route=>route.fulfill({json:{dashboards}}));
  api.on('/ai/analysis-jobs',async(route,body)=>{
    if(route.request().method()==='POST') return route.fulfill({json:{job_id:'job35',state:'completed',result:REPORT(body.dashboard_id)}});
    return route.fulfill({json:{}});
  });
  await page.goto('/');await page.getByText('Báo cáo & Phân tích',{exact:true}).first().click();
  await expect(page.locator('[data-dashboard-hub] h2')).toHaveCount(16);
  expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
  await page.getByRole('searchbox',{name:'Tìm dashboard'}).fill('kiosk');
  await expect(page.locator('[data-dashboard-hub] h2')).toHaveCount(1);
  await page.getByRole('heading',{name:'Kiosk',exact:true}).click();
  await expect(page.locator('[data-dashboard-id="D04"]')).toBeVisible();
  await page.locator('[data-conclusion] > summary').click();
  await expect(page.getByText('Kết luận D04',{exact:true}).first()).toBeVisible();
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  expect(api.calls['/api/ai/analysis-jobs'][0]).toMatchObject({dashboard_id:'D04',dashboard_version:'1.0.0',time:{mode:'30d'}});
  expect(api.calls['/api/ai/propose-plan']).toBeUndefined();
});

test('switching dashboard cancels its owned task and late response cannot replace current report',async({page})=>{
  const api=await mockApi(page);let release!:()=>void;
  const deferred=new Promise<void>(resolve=>{release=resolve;});
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/ai/dashboards',route=>route.fulfill({json:{dashboards}}));
  api.on('/analysis-jobs/cancel-by-key',route=>route.fulfill({json:{state:'cancelled'}}));
  api.on('/ai/analysis-jobs',async(route,body)=>{
    if(body?.dashboard_id==='D01'){await deferred;await route.fulfill({json:{job_id:'old',state:'completed',result:REPORT('OLD')}}).catch(()=>{});return;}
    return route.fulfill({json:{job_id:'new',state:'completed',result:REPORT('NEW')}});
  });
  await page.goto('/');await page.getByText('Báo cáo & Phân tích',{exact:true}).first().click();
  await page.getByRole('heading',{name:'Doanh thu & đơn hàng',exact:true}).click();
  await expect.poll(()=>api.calls['/api/ai/analysis-jobs']?.length).toBe(1);
  await page.getByRole('button',{name:'← Tất cả dashboard'}).click();
  await page.getByRole('heading',{name:'Thanh toán',exact:true}).click();
  await page.locator('[data-conclusion] > summary').click();
  await expect(page.getByText('Kết luận NEW',{exact:true}).first()).toBeVisible();
  release();await expect(page.getByText('Kết luận OLD',{exact:true})).toHaveCount(0);
  expect(api.calls['/api/ai/analysis-jobs/cancel-by-key']).toHaveLength(1);
});

test('login right card has local background, password toggle and mobile layout without data requests',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({status:401,json:{detail:'Authentication required'}}));
  await page.setViewportSize({width:1440,height:900});await page.goto('/');
  const form=page.getByRole('form',{name:'Đăng nhập Data Platform'});
  await expect(form).toBeVisible();
  const box=await form.boundingBox();expect(box!.x).toBeGreaterThan(900);
  const background=page.locator('img[src="/images/login-cafe.png"]');
  await expect.poll(()=>background.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  await page.getByLabel('Mật khẩu',{exact:true}).fill('fixture-only');
  await page.getByRole('button',{name:'Hiện mật khẩu'}).click();
  await expect(page.getByLabel('Mật khẩu',{exact:true})).toHaveAttribute('type','text');
  await page.setViewportSize({width:390,height:844});
  await expect(form).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(Object.keys(api.calls).filter(path=>!path.startsWith('/api/auth/'))).toEqual([]);
});


test('other tabs never resume an AI job; entering the assistant is required',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/ai/dashboards',route=>route.fulfill({json:{dashboards}}));
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{job_id:'resume35',state:'completed',result:REPORT('RESUMED')}}));
  await page.addInitScript(()=>sessionStorage.setItem('avengers.analysis-job.v1:fixture-admin:policy35',JSON.stringify({
    key:crypto.randomUUID(),input:{question:'Doanh thu tháng 9 năm 2026'}})));
  await page.goto('/');
  await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();
  await page.getByRole('button',{name:'Báo cáo tổng hợp',exact:true}).click();
  await expect(page.getByText('Doanh thu · 30 ngày gần nhất',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Quản lý Báo cáo',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Kho Lưu Trữ|Quản lý Báo cáo|Quản Lý Báo Cáo/}).first()).toBeVisible();
  expect(api.calls['/api/ai/analysis-jobs'] || []).toHaveLength(0);
  for(const path of ['/api/ai/propose-plan','/api/ai/generate-executive-report','/api/ai/refine-report'])expect(api.calls[path] || []).toHaveLength(0);
  await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  await expect(page.getByText('BÁO CÁO RESUMED').first()).toBeVisible();
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
});

test('leaving the AI assistant cancels owned work before another tab can continue it',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{job_id:'owned35',state:'planning'}}));
  api.on('/owned35/cancel',route=>route.fulfill({json:{state:'cancelled'}}));
  await page.goto('/');await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  await page.locator('textarea').first().fill('Doanh thu tháng 9 năm 2026');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  await expect.poll(()=>api.calls['/api/ai/analysis-jobs']?.length).toBe(1);
  await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
  await expect.poll(()=>api.calls['/api/ai/analysis-jobs/owned35/cancel']?.length).toBe(1);
  expect(await page.evaluate(()=>sessionStorage.getItem('avengers.analysis-job.v1:fixture-admin:policy35'))).toBeNull();
});

const cleanCharts = [
  {id:'trend',title:'Doanh thu theo ngày',chart_type:'line',x_field:'period',x_label:'Ngày',unit:'VND',metric:'revenue',data:[{label:'2026-09-01',value:100},{label:'2026-09-02',value:150}],insight:{why_relevant:'Giữ nguyên phạm vi doanh thu',key_facts:[{text:'Doanh thu quan sát 100 và 150 VND.',evidence_ref:'e1'}],caveats:['Chỉ so sánh cùng kỳ đầy đủ.']}},
  {id:'share',title:'Cơ cấu kênh bán',chart_type:'donut',x_label:'Kênh',unit:'đơn',data:[{label:'Tại quán',value:8},{label:'Giao hàng',value:2}]},
  {id:'rank',title:'Xếp hạng cửa hàng',chart_type:'horizontal_bar',unit:'VND',data:Array.from({length:10},(_,i)=>({label:`Highlands Coffee Chi nhánh ${i+1}`,value:853500+i*1000}))},
  {id:'channels',title:'Hình thức nhận hàng',chart_type:'bar',data:[{label:'DUNG_TAI_CHO',value:785},{label:'GIAO_TAN_NOI',value:291},{label:'LAY_TAI_QUAN',value:3},{label:'MANG_DI',value:512}]},
];

test('BI and AI share clean chart cards, collapsed explanations and responsive asymmetric rows',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/ai/dashboards',route=>route.fulfill({json:{dashboards}}));
  api.on('/ai/analysis-jobs',async(route,body)=>route.fulfill({json:{job_id:body.dashboard_id || 'ai35',state:'completed',result:REPORT('CLEAN',{analysis_spec:{},charts:cleanCharts,evidence:[['revenue',174347500,'VND'],['orders',1696,'đơn'],['customers',305,'khách'],['aov',109584,'VND']].map(([metric,value,unit])=>({id:`kpi-${metric}`,scope_ref:metric,metric,feature:'scalar',unit,values:{value}})),short_answer:Array.from({length:8},(_,i)=>`Giải thích chi tiết ${i+1}: doanh thu và số đơn trong phạm vi đã chọn.`),conclusion:{answer:'Kết luận dài cần bấm mở để xem. '.repeat(12),findings:[],caveats:['Nguồn chưa được chứng nhận đầy đủ.'],actions:['Đối chiếu cùng kỳ.']},provenance:body.dashboard_id?{dashboard_template:'D01'}:{}})}}));
  await page.setViewportSize({width:1680,height:1050});
  await page.goto('/');await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();
  await page.getByRole('heading',{name:'Doanh thu & đơn hàng',exact:true}).click();
  const cards=page.locator('[data-dashboard-chart]');
  await expect(cards).toHaveCount(4);
  await expect(page.locator("[data-kpi-strip] > section")).toHaveCount(4);
  expect((await page.locator("[data-kpi-strip]").boundingBox())!.height).toBeLessThan(112);
  for (const selector of ['[data-short-answer]','[data-conclusion]','[data-report-limitations]']) {
    await expect(page.locator(selector)).not.toHaveAttribute('open','');
    expect(await page.locator(selector).evaluate(element=>element.tagName)).toBe('DETAILS');
  }
  await expect(page.getByText('Giải thích chi tiết 1: doanh thu và số đơn trong phạm vi đã chọn.',{exact:true})).toBeHidden();
  expect((await cards.first().boundingBox())!.height).toBeLessThan(395);
  const rankingArea=cards.nth(2).locator('[data-chart-viewport]');
  expect(await rankingArea.evaluate(element=>element.scrollHeight <= element.clientHeight+1)).toBe(true);
  await expect(rankingArea.getByText('Highlands Coffee Chi nhánh 1',{exact:true})).toBeVisible();
  await expect(rankingArea.getByText('Highlands Coffee Chi nhánh 10',{exact:true})).toBeVisible();
  const chartArea=cards.nth(3).locator('[data-chart-viewport]');
  expect(await chartArea.evaluate(element=>element.scrollHeight <= element.clientHeight+1)).toBe(true);
  expect((await cards.nth(3).locator('svg').boundingBox())!.height).toBeLessThan(265);
  await expect(cards.nth(3).getByText('Lấy tại quán',{exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/v35-compact-bi.png',fullPage:true});
  await page.locator('[data-short-answer] > summary').click();
  await expect(page.getByText('Giải thích chi tiết 8: doanh thu và số đơn trong phạm vi đã chọn.',{exact:true})).toBeVisible();
  await page.locator('[data-short-answer] > summary').click();
  await page.locator('[data-conclusion] > summary').click();
  await expect(page.locator('[data-conclusion]')).toContainText('Đối chiếu cùng kỳ.');
  await page.locator('[data-conclusion] > summary').click();
  const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
  expect(first!.width/second!.width).toBeGreaterThan(1.8);
  expect(Math.abs(first!.y-second!.y)).toBeLessThan(2);
  await expect(page.locator('[data-chart-insight]')).not.toHaveAttribute('open','');
  await expect(page.getByText('Doanh thu quan sát 100 và 150 VND.',{exact:true})).toBeHidden();
  await cards.first().getByText('Nhận định từ biểu đồ',{exact:true}).click();
  await expect(page.getByText('Doanh thu quan sát 100 và 150 VND.',{exact:true})).toBeVisible();
  await cards.first().getByText('Chi tiết biểu đồ',{exact:true}).click();
  await cards.first().getByText('Xem dữ liệu',{exact:true}).click();
  await expect(cards.first().locator('table')).toContainText('150');
  await page.setViewportSize({width:900,height:1000});
  const stackedFirst=await cards.nth(0).boundingBox(),stackedSecond=await cards.nth(1).boundingBox();
  expect(stackedSecond!.y).toBeGreaterThan(stackedFirst!.y+stackedFirst!.height);
  await page.setViewportSize({width:1680,height:1050});
  await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  await page.locator('textarea').first().fill('Doanh thu tháng 9 năm 2026');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  await expect(cards).toHaveCount(4);
  expect((await cards.nth(0).boundingBox())!.width/(await cards.nth(1).boundingBox())!.width).toBeGreaterThan(1.8);
  await expect(page.getByText('Doanh thu quan sát 100 và 150 VND.',{exact:true})).toBeHidden();
  await expect(page.locator('[data-short-answer]')).not.toHaveAttribute('open','');
  await expect(page.locator('[data-conclusion]')).not.toHaveAttribute('open','');
  await page.screenshot({path:'/tmp/v35-clean-ai-charts.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await cards.first().boundingBox())!.height).toBeLessThan(395);
  await page.screenshot({path:'/tmp/v35-compact-mobile.png',fullPage:true});
});

test('architecture is interactive, honest about unmeasured runtime and never starts AI or services',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:session}));
  api.on('/platform/lineage',route=>route.fulfill({json:{layers:[{id:'stream',sub:'Apache Kafka',nodes:[{id:'topic',name:'Topic đơn hàng',status:'configured'}]}]}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');
  await page.waitForLoadState('networkidle');
  const before=Object.fromEntries(Object.entries(api.calls).map(([key,value])=>[key,value.length]));
  await page.getByRole('button',{name:'Kiến trúc hệ thống',exact:true}).click();
  await expect(page.locator('[data-architecture-node]')).toHaveCount(14);
  await page.locator('[data-architecture-node="compute"]').click();
  const detail=page.getByRole('region',{name:'Chi tiết thành phần'});
  await expect(detail).toContainText('Apache Spark');
  await detail.getByText('Hợp đồng & lưu ý vận hành',{exact:true}).click();
  await expect(detail).toContainText('không khởi động Spark');
  await page.getByText('Danh mục triển khai từ máy chủ',{exact:true}).click();
  await expect(page.getByText('Topic đơn hàng · Cấu hình')).toBeVisible();
  await page.screenshot({path:'/tmp/v35-system-architecture.png',fullPage:true});
  await page.setViewportSize({width:900,height:1000});
  expect(await page.locator('[data-architecture-view]').evaluate(node=>node.getBoundingClientRect().right<=innerWidth)).toBe(true);
  expect(await page.getByRole('region',{name:'Sơ đồ có thể cuộn ngang'}).evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  for(const [path,bodies] of Object.entries(api.calls)) {
    const added=bodies.slice(before[path] || 0);
    if(added.length) expect(path).toBe('/api/platform/lineage');
  }
  const loaded=api.calls['/api/platform/lineage'].length;
  expect(loaded).toBeLessThanOrEqual(2); // React StrictMode mount/abort/remount in development.
  await page.waitForTimeout(600);
  expect(api.calls['/api/platform/lineage']).toHaveLength(loaded);
});
