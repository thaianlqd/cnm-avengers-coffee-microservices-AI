import {test,expect} from '@playwright/test';
import {mockApi,REPORT} from './helpers';
const session={authenticated:true,identity:'map-layout-fixture',role:'ADMIN',permissions:['analytics.read','system.read','reports.save'],expires_at:4000000000};
const stores=Array.from({length:12},(_,i)=>({store_code:`hn${i}`,store_name:`Cửa hàng Hà Nội ${i+1}`,city:'Hà Nội',status:'Hoạt động',total_revenue:(12-i)*100000, total_orders:12-i,aov:100000}));
async function apiSetup(page:any){
  await page.route('https://tiles.openfreemap.org/**',(route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#eff6ff'}}]}}));
  const api=await mockApi(page);api.on('/auth/session',(route:any)=>route.fulfill({json:session}));
  return api;
}
const compact=[
  {id:'channel',title:'Cơ cấu kênh phục vụ',chart_type:'donut',unit:'đơn',data:[{label:'Tại quán',value:8},{label:'Giao hàng',value:2}]},
  {id:'types',title:'Doanh thu theo loại điểm bán',chart_type:'bar',unit:'VND',data:[{label:'Chi nhánh',value:700},{label:'Kiosk',value:300}]},
  {id:'payments',title:'Phương thức thanh toán',chart_type:'bar',unit:'đơn',data:[{label:'QR',value:8},{label:'Tiền mặt',value:2}]},
];
const charts=[
  {id:'trend',title:'Doanh thu theo ngày',x_field:'period',chart_type:'line',unit:'VND',data:Array.from({length:14},(_,i)=>({label:`2026-10-${String(i+1).padStart(2,'0')}`,value:100+i*10}))},
  {id:'city',title:'Số đơn riêng từng tỉnh',metric:'store_order_count',x_field:'city',chart_type:'horizontal_bar',unit:'đơn',data:[{label:'Hà Nội',value:20},{label:'Đà Nẵng',value:10}]},...compact,
];

test('AI uses proportional rows, layout controls and the requested map metric without a new AI job',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const api=await apiSetup(page);
  api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{job_id:'AI-MAP',state:'completed',result:REPORT('AI-MAP',{analysis_spec:{},charts})}}));
  api.on('/geography',(route:any)=>route.fulfill({json:{revision:1,provinces:[{city:'Hà Nội',label:'Hà Nội',revenue:8000000,orders:20,store_count:12,aov:400000}],stores:[],summary:{revenue:8000000,orders:20,store_count:12,aov:400000}}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  await page.locator('textarea').first().fill('Số đơn từng tỉnh và doanh thu theo ngày');await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const cards=page.locator('[data-dashboard-chart]');await expect(cards).toHaveCount(5);
  const grid=page.locator('[data-dashboard-grid]');await expect(grid).toHaveAttribute('data-grid-columns','3');
  expect(await cards.evaluateAll(ns=>ns.map(n=>Number(n.getAttribute('data-chart-span'))))).toEqual([7.2,4.8,4,4,4]);
  const map=page.locator('[data-geographic-report]');await expect(map.getByRole('combobox',{name:'Chỉ số trên bản đồ'})).toHaveValue('city');
  await expect(map).toContainText('Chỉ số mặc định lấy từ kết quả phân tích đang xem');
  await page.getByRole('button',{name:'Hai ô mỗi hàng',exact:true}).click();await expect(grid).toHaveAttribute('data-grid-columns','2');
  await cards.first().getByText('Chi tiết biểu đồ',{exact:true}).click();
  await page.getByRole('button',{name:'Toàn chiều rộng',exact:true}).click();await expect(grid).toHaveAttribute('data-grid-columns','1');await expect(cards.first().locator('[data-chart-details]')).toHaveAttribute('open','');
  await page.getByRole('button',{name:'Tự động · 2–3 ô',exact:true}).click();await cards.first().getByText('Chi tiết biểu đồ',{exact:true}).click();
  await grid.screenshot({path:'/tmp/dp-ai-proportional-grid.png'});
  await page.setViewportSize({width:390,height:844});await expect(grid).toHaveAttribute('data-grid-columns','1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);expect(errors).toEqual([]);
});

test('whole-chain map drills through actual loaded stores, preserves zero provinces and makes no AI or geography request',async({page})=>{
  const api=await apiSetup(page);
  api.on('/marts/all',(route:any)=>route.fulfill({json:{kpi:{revenue_all_time:7800000,total_orders_all_time:78},filters_applied:{reference_date:'2026-10-20'}}}));
  api.on('/stores/overview',(route:any)=>route.fulfill({json:{stores:[...stores,{store_code:'zero',store_name:'Cửa hàng Đà Nẵng',city:'Đà Nẵng',total_revenue:0,total_orders:0,aov:0,status:'Hoạt động'}]}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');const section=page.locator('[data-whole-chain-map]'),map=section.locator('[data-geographic-report]');
  await expect(section.getByRole('heading',{name:'Bản đồ điều hành toàn chuỗi',exact:true})).toBeVisible();await expect(map).toContainText('2 tỉnh/thành có điểm bán');
  await expect(map.getByRole('combobox',{name:'Chỉ số trên bản đồ'})).toHaveValue('network_revenue');
  await expect(map.locator('[data-province-name="Đà Nẵng"]')).toHaveAttribute('data-has-value','true');await expect(map.locator('[data-province-name="An Giang"]')).toHaveAttribute('data-has-value','false');
  const city=map.getByRole('combobox',{name:'Chọn tỉnh khám phá'});await city.fill('ha noi');await city.press('Enter');
  const detail=map.locator('[data-province-business]');await expect(detail).toContainText('12 điểm bán');await expect(detail.locator('[data-store-row]')).toHaveCount(8);
  await detail.getByRole('searchbox',{name:'Tìm cửa hàng trong tỉnh'}).fill('Hà Nội 2');await expect(detail.locator('[data-store-row]')).toHaveCount(1);
  await detail.getByRole('button',{name:'Chi tiết cửa hàng Cửa hàng Hà Nội 2',exact:true}).click();await expect(detail.locator('[data-store-exploration]')).toContainText('Đang xem số liệu cửa hàng trong kỳ Tổng quan');
  await map.getByRole('combobox',{name:'Chỉ số trên bản đồ'}).selectOption('network_store_count');await expect(map.locator('[data-province-business]')).toHaveCount(0);
  await section.screenshot({path:'/tmp/dp-whole-chain-map.png'});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(Object.keys(api.calls).filter(path=>path.includes('analysis-jobs')||path.includes('/geography'))).toEqual([]);
});

test('legacy AI results share one grid rather than isolated role sections',async({page})=>{
  const api=await apiSetup(page);api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{job_id:'LEGACY-GRID',state:'completed',result:REPORT('LEGACY-GRID',{charts:charts.map((c,i)=>({...c,role:i%2?'supporting':'primary'}))})}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();await page.locator('textarea').first().fill('Báo cáo địa lý');await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  await expect(page.locator('[data-dashboard-chart]')).toHaveCount(5);await expect(page.locator('[data-dashboard-grid]')).toHaveCount(1);await expect(page.locator('[data-geographic-report]')).toBeVisible();
  expect(Object.keys(api.calls).filter(path=>path.includes('/geography'))).toEqual([]);
});

test('six dense AI views use 40/60 then 30/30/40 and an unclipped full-width heatmap',async({page})=>{
  const api=await apiSetup(page);
  const multi={...charts[0],id:'multi',title:'Doanh thu theo loại điểm bán',chart_type:'multi_line',series:[{key:'a',label:'Chi nhánh'},{key:'b',label:'Nhượng quyền'},{key:'c',label:'Vệ tinh'}],data:charts[0].data.map((r,i)=>({...r,a:r.value,b:r.value/4,c:r.value/10}))};
  const ranking={...charts[1],data:Array.from({length:20},(_,i)=>({label:`Highlands Coffee Chi nhánh đường Nguyễn Văn Linh ${i}`,value:1000-i}))};
  const heatmap={id:'matrix',title:'Phương thức thanh toán theo kênh',chart_type:'heatmap',unit:'VND',data:Array.from({length:12},(_,i)=>({x:['Tại quán','Mang đi','Giao hàng'][i%3],y:['Tiền mặt','VNPay','Ví điện tử','Chuyển khoản'][Math.floor(i/3)],value:1000+i}))};
  api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{job_id:'SIX',state:'completed',result:REPORT('SIX',{analysis_spec:{},charts:[charts[0],ranking,compact[2],compact[0],multi,heatmap]})}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();await page.locator('textarea').first().fill('Báo cáo kinh doanh toàn chuỗi');await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const cards=page.locator('[data-dashboard-chart]');await expect(cards).toHaveCount(6);
  expect(await cards.evaluateAll(ns=>ns.map(n=>Number(n.getAttribute('data-chart-span'))))).toEqual([4.8,7.2,3.6,3.6,4.8,12]);
  const second=await Promise.all([2,3,4].map(i=>cards.nth(i).boundingBox()));expect(Math.max(...second.map(b=>b!.y))-Math.min(...second.map(b=>b!.y))).toBeLessThan(2);
  expect(second[1]!.x-(second[0]!.x+second[0]!.width)).toBeCloseTo(16,0);
  expect(second[2]!.x-(second[1]!.x+second[1]!.width)).toBeCloseTo(16,0);
  expect(Math.max(...second.map(b=>b!.height))-Math.min(...second.map(b=>b!.height))).toBeLessThan(2);
  for(const selector of ['[data-chart-viewport]','[data-chart-footer]']){
    const positions=await Promise.all([2,3,4].map(i=>cards.nth(i).locator(selector).boundingBox()));
    expect(Math.max(...positions.map(b=>b!.y))-Math.min(...positions.map(b=>b!.y))).toBeLessThan(2);
  }
  expect((await cards.last().boundingBox())!.width).toBeGreaterThan(1300);
  await page.locator('[data-dashboard-grid]').screenshot({path:'/tmp/dp-ai-six-views.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('overview franchise and satellite maps isolate province revenue, AOV and branch drilldown without AI',async({page})=>{
  const api=await apiSetup(page);
  api.on('/marts/all',(route:any)=>route.fulfill({json:{kpi:{revenue_all_time:1400000,total_orders_all_time:20}}}));
  api.on('/stores/overview',(route:any)=>route.fulfill({json:{stores:[
    {...stores[0],store_code:'main',store_name:'Kiosk in name but main branch',store_type:'CHI_NHANH_CHINH',total_revenue:900000,valid_orders:9},
    {...stores[1],store_code:'fran',store_name:'Franchise Test',store_type:'KIOSK_NHUONG_QUYEN',total_revenue:400000,valid_orders:4},
    {...stores[2],store_code:'sat',store_name:'Satellite Test',city:'Đà Nẵng',store_type:'KIOSK_VE_TINH',total_revenue:100000,valid_orders:1},
  ]}}));
  await page.goto('/');const section=page.locator('[data-whole-chain-map]');await section.locator('[data-map-cohorts]').waitFor();
  await section.getByRole('navigation',{name:'Phạm vi điểm bán trên bản đồ'}).getByRole('button',{name:'Kiosk nhượng quyền',exact:true}).click();
  const map=section.locator('[data-geographic-report]');await expect(map).toContainText('1 tỉnh/thành có điểm bán');await expect(map).toContainText('400.000');
  const city=map.getByRole('combobox',{name:'Chọn tỉnh khám phá'});await city.fill('ha noi');await city.press('Enter');await expect(map.locator('[data-store-row]')).toHaveCount(1);await expect(map.locator('[data-province-business]')).toContainText('Franchise Test');await expect(map.locator('[data-province-business]')).not.toContainText('Kiosk in name');
  await section.getByRole('navigation',{name:'Phạm vi điểm bán trên bản đồ'}).getByRole('button',{name:'Kiosk vệ tinh',exact:true}).click();await expect(map.locator('[data-province-business]')).toHaveCount(0);await expect(map).toContainText('100.000');
  expect(Object.keys(api.calls).filter(p=>p.includes('analysis-jobs')||p.includes('/geography'))).toEqual([]);
});
