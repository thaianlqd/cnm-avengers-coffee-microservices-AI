import {test,expect} from '@playwright/test';
import {mockApi,CAPABILITIES} from './helpers';
const session={authenticated:true,identity:'executive-fixture',role:'ADMIN',permissions:['analytics.read','reports.save','reports.export','system.read'],expires_at:4000000000};
const stores=Array.from({length:26},(_,i)=>({store_code:`s${i}`,store_name:`Chi nhánh ${i+1}`,city:i%2?'Hà Nội':'Đà Nẵng',status:'Hoạt động',total_revenue:10000000-i*100000,total_orders:50-i,aov:200000}));
async function setup(page:any){
  const api=await mockApi(page);api.on('/auth/session',(route:any)=>route.fulfill({json:session}));
  api.on('/marts/all',(route:any)=>route.fulfill({json:{kpi:{revenue_all_time:174347500,total_orders_all_time:1696,new_customers:305,aov:109584,revenue_growth:-65,orders_growth:-63.1,aov_growth:-3.2,completed_orders:1600,active_deliveries:3,total_stores:26},
    revenue_daily:[{date:'2026-10-01',revenue:10000000},{date:'2026-10-02',revenue:15000000}],parent_category_sales:[{category_name:'Cà phê',revenue:10000000},{category_name:'Trà',revenue:5000000}],
    payment_methods:[{payment_method:'TIEN_MAT',count:500,revenue:55000000},{payment_method:'VNPAY',count:1100,revenue:119347500}],
    order_status:[{status:'HOAN_THANH',count:1600},{status:'DA_HUY',count:93},{status:'DANG_GIAO',count:3}],
    hourly_sales:Array.from({length:12},(_,i)=>({hour:i+8,order_count:i+10,revenue:1000000+i*500000})),
    weekday_sales:[{label:'T2',revenue:1234567},{label:'T3',revenue:2345678}],top_products:[{ten_san_pham:'Cà phê sữa',total_quantity:100,total_revenue:10000000},{ten_san_pham:'Trà đào',total_quantity:50,total_revenue:5000000}],
    top_branches:stores.slice(0,5).map(s=>({branch_name:s.store_name,revenue:s.total_revenue})),recent_sales:[{order_time:'20/10 10:00',store_name:'Chi nhánh 1',product_name:'Cà phê sữa',quantity:2,total_amount:78000}]}}));
  api.on('/stores/overview',(route:any)=>route.fulfill({json:{stores,revenue_by_city:[{city:'Hà Nội',revenue:20000000},{city:'Đà Nẵng',revenue:10000000}]}}));
  api.on('/products/overview',(route:any)=>route.fulfill({json:{kpi:{total_sold:3259}}}));
  api.on('/customers/overview',(route:any)=>route.fulfill({json:{kpi:{active_accounts:302,repeat_customers:244,repeat_orders:891,avg_frequency:3.1,identified_orders:949,anonymous_orders:495},behavior:{delivery_orders:262,store_orders:1182}}}));
  const coverage={status:'ready',overall:{min_date:'2026-01-01',max_date:'2026-10-20'},
    facts:{'silver.giao_dich_thanh_toan':{label:'Giao dịch thanh toán',max_date:'2026-10-20',min_date:'2026-01-01'}},
    freshness:{stale:false,mode:'batch'},data_health:{views:{
      'silver.don_hang':{status:'healthy',completeness:'reconciled'},
      'silver.giao_dich_thanh_toan':{status:'blocked',reasons:['last_load_failed'],impacted_metrics:['settled_payment_amount']},
    }}};
  api.on('/ai/capabilities',(route:any)=>route.fulfill({json:{...CAPABILITIES,data_coverage:coverage}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');const overview=page.locator('[data-overview-layout]');await expect(overview).toBeVisible();
  return {api,overview};
}

test('executive overview exposes distinct business dimensions, local text discovery and full searchable store ranking',async({page})=>{
  const {api,overview}=await setup(page);await expect(overview.getByRole('heading',{name:'Tổng quan điều hành',exact:true})).toBeVisible();
  await expect(overview.locator('[data-overview-secondary-kpis] article')).toHaveCount(4);
  await expect(overview.locator('.executive-panels-grid article')).toHaveCount(8);
  await expect(overview.locator('.executive-panel').filter({has:page.getByRole('heading',{name:'Cơ cấu trạng thái đơn hàng',exact:true})})).toContainText('1.600 đơn');
  const jobs=()=>Object.keys(api.calls).filter(path=>path.includes('analysis-jobs'));expect(jobs()).toHaveLength(0);
  await overview.getByRole('searchbox',{name:'Tìm góc nhìn Tổng quan'}).fill('thanh toan');await expect(overview.locator('.executive-panels-grid article')).toHaveCount(1);
  await expect(overview.locator('.executive-panels-grid')).toContainText('Phương thức thanh toán của đơn');
  await overview.getByRole('searchbox',{name:'Tìm góc nhìn Tổng quan'}).fill('');await overview.getByRole('button',{name:'Khách hàng',exact:true}).click();await expect(overview.locator('.executive-panels-grid article')).toHaveCount(2);
  await overview.getByRole('button',{name:'Mạng lưới',exact:true}).click();const ranking=overview.locator('[data-overview-store-ranking]');await expect(ranking.locator('tbody tr')).toHaveCount(10);
  const calls=Object.values(api.calls).reduce((sum:any,list:any)=>sum+list.length,0);
  const city=ranking.getByRole('combobox',{name:'Tỉnh của cửa hàng Tổng quan'});await city.fill('ha noi');await city.press('Enter');await expect(city).toHaveValue('Hà Nội');await expect(ranking.getByRole('navigation')).toContainText('/ 13');
  await ranking.getByRole('searchbox',{name:'Tìm cửa hàng Tổng quan'}).fill('Chi nhánh 2');await expect(ranking.locator('tbody tr')).toHaveCount(5);
  await ranking.getByRole('combobox',{name:'Xếp hạng điểm bán Tổng quan'}).selectOption('aov');expect(Object.values(api.calls).reduce((sum:any,list:any)=>sum+list.length,0)).toBe(calls);
  await ranking.getByRole('searchbox',{name:'Tìm cửa hàng Tổng quan'}).fill('');await overview.getByRole('button',{name:'Tất cả',exact:true}).click();
  await overview.screenshot({path:'/tmp/dp-executive-overview.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/dp-executive-overview-mobile.png',fullPage:true});
  expect(jobs()).toHaveLength(0);
});

test('source warning explains a failing payment load while decline labels remain ordinary KPI comparisons',async({page})=>{
  const {overview}=await setup(page);await expect(overview.locator('[data-coverage-bar]')).toContainText('1 nguồn bị chặn');
  await overview.locator('[data-source-issues] summary').click();await expect(overview.locator('[data-source-issues]')).toContainText('Giao dịch thanh toán');await expect(overview.locator('[data-source-issues]')).toContainText('Lần nạp gần nhất thất bại');
  await expect(overview.locator('[data-source-issues]')).toContainText('Các nguồn khác được xét độc lập');
  await overview.getByText('Định nghĩa chỉ số & cách so sánh kỳ',{exact:true}).click();await expect(overview).toContainText('Biến động đỏ dưới KPI biểu thị giảm');
  await expect(overview.getByText('-65% so với 30 ngày trước',{exact:true})).toBeVisible();
});

test('typing an unmatched province never applies a filter and keyboard selection restores the chosen label',async({page})=>{
  const {overview}=await setup(page);const ranking=overview.locator('[data-overview-store-ranking]');const city=ranking.getByRole('combobox',{name:'Tỉnh của cửa hàng Tổng quan'});
  await city.fill('Tinh khong co');await expect(ranking).toContainText('Không có lựa chọn khớp');await city.press('Enter');await city.press('Escape');await expect(city).toHaveValue('Toàn bộ tỉnh/thành');await expect(ranking.getByRole('navigation')).toContainText('/ 26');
  await city.fill('da nang');await expect(city).toHaveAttribute('aria-expanded','true');await city.press('Enter');await expect(city).toHaveValue('Đà Nẵng');await expect(ranking.getByRole('navigation')).toContainText('/ 13');
  await city.fill('ha noi');await city.press('Escape');await expect(city).toHaveValue('Đà Nẵng');
});

test('a failed optional customer source leaves sales visible and cannot reuse customer counts as zero',async({page})=>{
  const api=await mockApi(page);api.on('/auth/session',(route:any)=>route.fulfill({json:session}));api.on('/marts/all',(route:any)=>route.fulfill({json:{kpi:{revenue_all_time:500000,total_orders_all_time:10,aov:50000}}}));api.on('/customers/overview',(route:any)=>route.fulfill({status:503,json:{detail:'unavailable'}}));
  await page.goto('/');const overview=page.locator('[data-overview-layout]');await expect(overview).toBeVisible();await expect(overview).toContainText('Một số góc nhìn chưa tải được: khách hàng');await expect(overview.getByText('500.000 đ',{exact:true})).toBeVisible();
  await overview.getByRole('button',{name:'Khách hàng',exact:true}).click();await expect(overview.locator('.executive-mini-kpis')).toContainText('—');
});

test('a typed reporting period loads the four sources for the same period without starting AI',async({page})=>{
  const {api,overview}=await setup(page);const requested:string[]=[];page.on('request',r=>{if(/\/(marts\/all|stores\/overview|customers\/overview|products\/overview)\?/.test(r.url()))requested.push(r.url());});
  const period=overview.getByRole('combobox',{name:'Kỳ Tổng quan'});await period.fill('7 ngay');await period.press('Enter');await expect(period).toHaveValue('7 ngày qua');
  await expect.poll(()=>requested.filter(url=>new URL(url).searchParams.get('date_range')==='7days').length).toBe(4);
  expect(Object.keys(api.calls).filter(path=>path.includes('analysis-jobs'))).toHaveLength(0);
  const before=(api.calls['/api/ai/capabilities']||[]).length;await overview.getByRole('button',{name:'Làm mới',exact:true}).click();await expect.poll(()=>(api.calls['/api/ai/capabilities']||[]).length).toBe(before+1);
});
