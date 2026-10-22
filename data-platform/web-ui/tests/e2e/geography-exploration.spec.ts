import {test,expect} from '@playwright/test';
import {mockApi,REPORT,deferred} from './helpers';

const stores=Array.from({length:12},(_,i)=>({store_id:`s${i}`,store:`Cửa hàng Hà Nội ${i+1}`,city:'Hà Nội',store_type:i%2?'KIOSK_NHUONG_QUYEN':'CHI_NHANH_CHINH',status:'ACTIVE',latitude:i===11?null:21.02851+i*.002,longitude:i===11?null:105.804817+i*.002,revenue:i===11?0:(12-i)*1000000,orders:i===11?0:(12-i)*2,valid_orders:i===11?0:(12-i)*2,aov:i===11?null:500000,has_sales:i!==11}));
const summary={revenue:77000000,orders:154,valid_orders:154,aov:500000,store_count:12,active_stores:12};
const provinces=[{city:'Hà Nội',label:'Hà Nội',...summary},{city:'Hồ Chí Minh',label:'Hồ Chí Minh',revenue:20000000,orders:40,aov:500000,store_count:1,active_stores:1},{city:'Hà Giang',label:'Hà Giang',revenue:0,orders:0,aov:null,store_count:1,active_stores:1}];
const base={session_id:'sess-EXPLORE',revision:1,period:{start:'2026-09-21',end:'2026-10-20'},provider_calls:0,definitions:{network:'Số điểm bán hiện có trong danh mục.'},trend:[],products:[],stores:[],provinces:[],summary};
async function setup(page:any){
  await page.route(/(tiles\.openfreemap\.org\/styles\/|\/map-styles\/avengers-streets\.json)/,(route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eff6ff'}}]}}));
  const api=await mockApi(page);
  api.on('/auth/session',(route:any)=>route.fulfill({json:{authenticated:true,identity:'geography-user',role:'ADMIN',permissions:['analytics.read','reports.save','reports.export','system.read'],expires_at:4000000000}}));
  api.on('/ai/dashboards',(route:any)=>route.fulfill({json:{dashboards:[{id:'D36',title:'Bản đồ doanh thu & đơn hàng',version:'1.0.0',category:'Kinh doanh',status:'healthy',description:'Bản đồ',default_time:'30d',panel_count:1}]}}));
  // Original report starts with a regional series; the explorer must still default to province revenue.
  api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{state:'completed',job_id:'explore',result:REPORT('EXPLORE',{charts:[{id:'regional',title:'Doanh thu theo miền',x_field:'reporting_region',metric:'store_revenue',unit:'VND',data:[{label:'Miền Bắc',value:77000000}]}]})}}));
  api.on('/geography',(route:any)=>{
    const url=new URL(route.request().url()),city=url.searchParams.get('city'),store=url.searchParams.get('store');
    if(!city)return route.fulfill({json:{...base,summary:{...summary,store_count:14,revenue:97000000,orders:194},stores,provinces}});
    if(store)return route.fulfill({json:{...base,city,store_id:store,stores:stores.filter(s=>s.store_id===store),summary:{...summary,...stores.find(s=>s.store_id===store),store_count:1},trend:[{period:'2026-09-21',store_revenue:4000000},{period:'2026-09-28',store_revenue:8000000}],products:[{product:'Cà phê sữa',product_revenue:9000000,quantity_sold:50}]}});
    return route.fulfill({json:{...base,city,summary:city==='Hà Nội'?summary:{revenue:20000000,orders:40,store_count:1,aov:500000},stores:city==='Hà Nội'?stores:[{...stores[0],store_id:'hcm',store:'Cửa hàng Sài Gòn',city:'Hồ Chí Minh',revenue:20000000}]}});
  });
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();await page.getByRole('heading',{name:'Bản đồ doanh thu & đơn hàng',exact:true}).click();
  const map=page.locator('[data-geographic-report]');await expect(map.getByRole('combobox',{name:'Chỉ số trên bản đồ'})).toHaveValue('network_revenue');
  return {api,map};
}

test('province revenue and branch presence lead to a complete searchable, comparable store ranking and store analysis',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const {api,map}=await setup(page);
  await expect(map).toContainText('3 tỉnh/thành có điểm bán');
  const zero=map.locator('[data-province-name="Hà Giang"]'),missing=map.locator('[data-province-name="An Giang"]');
  await expect(zero).toHaveAttribute('data-has-value','true');await expect(missing).toHaveAttribute('data-has-value','false');expect(await zero.getAttribute('fill')).not.toEqual(await missing.getAttribute('fill'));
  await map.getByRole('combobox',{name:'Chỉ số trên bản đồ'}).selectOption('network_store_count');await expect(map).toContainText('12 điểm bán');
  await map.getByRole('combobox',{name:'Chỉ số trên bản đồ'}).selectOption('network_revenue');
  await map.locator('button').filter({hasText:/^Hà Nội/}).click();
  await expect(map.locator('[data-province-map]')).toHaveAttribute('data-map-view','provinces');
  await expect(map.locator('[data-province-map]')).toHaveAttribute('data-map-clustered','false');
  await expect.poll(async()=>Number(await map.locator('[data-province-map]').getAttribute('data-map-store-markers'))).toBeGreaterThan(0);
  await map.getByRole('checkbox',{name:'Gom cụm các cửa hàng gần nhau'}).check();
  await expect(map.locator('[data-province-map]')).toHaveAttribute('data-map-clustered','true');
  await map.getByRole('checkbox',{name:'Gom cụm các cửa hàng gần nhau'}).uncheck();
  await expect.poll(async()=>Number(await map.locator('[data-province-map]').getAttribute('data-map-store-count'))).toBeGreaterThan(0);
  await expect(map.locator('[data-province-coordinate-coverage]')).toContainText('11/12 cửa hàng trong tỉnh có tọa độ hợp lệ');
  const detail=page.locator('[data-province-business]');await expect(detail).toContainText('12 điểm bán');await expect(detail.locator('[data-store-row]')).toHaveCount(8);
  await detail.getByRole('navigation',{name:'Cửa hàng trong tỉnh'}).getByRole('button',{name:'Cửa hàng trong tỉnh: trang sau',exact:true}).click();await expect(detail.locator('[data-store-row]')).toHaveCount(4);await expect(detail).toContainText('Chưa có đơn trong kỳ');
  await detail.getByRole('searchbox',{name:'Tìm cửa hàng trong tỉnh'}).fill('Hà Nội 2');await expect(detail.locator('[data-store-row]')).toHaveCount(1);
  await detail.getByRole('searchbox',{name:'Tìm cửa hàng trong tỉnh'}).fill('');await detail.getByRole('combobox',{name:'Loại điểm bán trong tỉnh'}).selectOption('KIOSK_NHUONG_QUYEN');await expect(detail.locator('[data-store-row]')).toHaveCount(6);
  await detail.getByRole('combobox',{name:'Loại điểm bán trong tỉnh'}).selectOption('');
  await detail.getByRole('checkbox',{name:'So sánh Cửa hàng Hà Nội 1',exact:true}).check();await detail.getByRole('checkbox',{name:'So sánh Cửa hàng Hà Nội 2',exact:true}).check();await expect(detail.locator('[data-store-comparison]')).toContainText('2/3');
  const download=page.waitForEvent('download');await detail.getByRole('button',{name:'Xuất danh sách CSV'}).click();expect((await download).suggestedFilename()).toBe('cua-hang-Hà Nội.csv');
  await detail.getByRole('button',{name:'Chi tiết cửa hàng Cửa hàng Hà Nội 1',exact:true}).click();
  await expect(detail.locator('[data-store-exploration]')).toContainText('Diễn biến doanh thu theo tuần');await expect(detail.locator('[data-store-exploration]')).toContainText('Cà phê sữa');
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  const requests=Object.entries(api.calls).filter(([path])=>path.includes('/geography')).flatMap(([,calls])=>calls as any[]);expect(requests).toHaveLength(3);
  await detail.screenshot({path:'/tmp/dp-map-province-business.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('a delayed province response cannot replace a newly selected province or trigger an analysis job',async({page})=>{
  const {api,map}=await setup(page),pending=deferred();
  api.on('/geography',async(route:any)=>{const city=new URL(route.request().url()).searchParams.get('city');if(city==='Hà Nội'){await pending.promise;await route.fulfill({json:{...base,city,stores,summary}});}else await route.fulfill({json:{...base,city,stores:[{...stores[0],store_id:'hcm',store:'Cửa hàng Sài Gòn'}],summary:{...summary,store_count:1}}});});
  await map.locator('button').filter({hasText:/^Hà Nội/}).click();await expect(page.locator('[data-province-business]')).toContainText('Đang tải cửa hàng');
  await map.getByRole('combobox',{name:'Chọn tỉnh khám phá'}).fill('ho chi minh');await map.getByRole('option',{name:/Hồ Chí Minh/}).click();await expect(page.locator('[data-province-business]')).toContainText('Cửa hàng Sài Gòn');
  pending.resolve(null);await expect(page.locator('[data-province-business]')).not.toContainText('Cửa hàng Hà Nội 1');
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
});


test('recorded store coordinates zoom to street level and a native point opens the owned store analysis',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const {map,api}=await setup(page);
  const frame=map.locator('[data-province-map]');
  // Software WebGL must finish shader/style initialization before exercising
  // native store pins. SVG fallback is tested separately, not accepted here.
  await expect(frame).toHaveAttribute('data-map-engine','maplibre',{timeout:15000});
  await expect(frame).toHaveAttribute('data-map-view','provinces');
  await expect(map.locator('.geo-map-appearance')).not.toHaveAttribute('open');
  await expect(map.locator('[data-store-point]')).toHaveCount(11);
  await expect(map).toContainText('11/12 cửa hàng có tọa độ hợp lệ');
  await map.getByRole('combobox',{name:'Tìm cửa hàng trên bản đồ'}).fill('s0');
  await map.getByRole('option',{name:/Cửa hàng Hà Nội 1 /}).click();
  await expect.poll(async()=>Number((await frame.getAttribute('data-map-camera'))?.split(',')[2]||0)).toBeGreaterThan(14);
  await expect(map.locator('[data-selected-map-store]')).toContainText('Cửa hàng Hà Nội 1');
  await expect(frame).toHaveAttribute('data-map-view','stores');
  await expect(map.locator('[data-map-legend]')).toBeHidden();
  await map.getByRole('combobox',{name:'Nền bản đồ'}).selectOption('boundaries');
  await map.getByRole('combobox',{name:'Nền bản đồ'}).selectOption('light');
  await expect(frame).toContainText('Nền đường phố OpenFreeMap');
  await expect.poll(async()=>Number((await frame.getAttribute('data-map-camera'))?.split(',')[2]||0)).toBeGreaterThan(14);
  await expect.poll(async()=>Number(await frame.getAttribute('data-map-store-markers'))).toBeGreaterThan(0);
  await frame.scrollIntoViewIfNeeded();
  const canvas=map.locator('canvas.maplibregl-canvas');
  await canvas.click({position:await canvas.evaluate(e=>({x:e.clientWidth/2,y:e.clientHeight/2-22}))});
  const popup=map.locator('.maplibregl-popup');
  await expect(popup).toContainText('Cửa hàng Hà Nội 1');
  await expect(popup).toContainText('Doanh thu');
  const box=await canvas.boundingBox();await page.mouse.move(box!.x+30,box!.y+100);
  await expect(map.locator('.province-hover-popup')).toHaveCount(0);
  await expect(map.locator('.store-map-popup')).toHaveCount(1);
  await popup.getByRole('button',{name:'Phân tích cửa hàng ↓'}).click();
  await expect(page.locator('[data-store-exploration]')).toContainText('Cà phê sữa');
  await map.getByRole('checkbox',{name:'Điểm cửa hàng',exact:true}).uncheck();
  await expect(map.locator('[data-store-point]')).toHaveCount(0);
  await map.getByRole('checkbox',{name:'Điểm cửa hàng',exact:true}).check();
  await expect(map.locator('[data-store-point]')).toHaveCount(11);
  await map.getByRole('button',{name:'Doanh số tỉnh',exact:true}).click();
  await expect(frame).toHaveAttribute('data-map-view','provinces');
  await expect(map.locator('[data-selected-map-store]')).toHaveCount(0);
  await expect(map.locator('.store-map-popup')).toHaveCount(0);
  await expect.poll(async()=>Number((await frame.getAttribute('data-map-camera'))?.split(',')[2]||20)).toBeLessThan(12.1);
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
