import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi, REPORT } from './helpers';

const geography=JSON.parse(readFileSync(new URL('../../src/data/vietnamGeography.json',import.meta.url),'utf8'));
const rows=geography.cities.slice(0,55).map((city:any,i:number)=>({label:city.label,value:i*1000000}));
async function openMap(page:any,live=false) {
  if(!live)await page.route(/(tiles\.openfreemap\.org\/styles\/|\/map-styles\/avengers-streets\.json)/, (route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eef4f8'}}]}}));
  const api=await mockApi(page);
  api.on('/auth/session',(route:any)=>route.fulfill({json:{authenticated:true,identity:'province-test',role:'ADMIN',permissions:['analytics.read','reports.save','reports.export','system.read'],expires_at:4000000000}}));
  api.on('/ai/dashboards',(route:any)=>route.fulfill({json:{dashboards:[{id:'D36',title:'Bản đồ doanh thu & đơn hàng',version:'1.0.0',category:'Kinh doanh',description:'Theo tỉnh/thành',panel_count:1,status:'healthy'}]}}));
  api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{state:'completed',job_id:'province',result:REPORT('PROVINCE',{charts:[{id:'province-revenue',title:'Doanh thu theo tỉnh/thành',x_field:'city',x_label:'Tỉnh/thành',metric:'store_revenue',chart_type:'bar',unit:'VND',selection:'complete',data:rows}],provenance:{dashboard_template:{id:'D36'}}})}}));
  await page.setViewportSize({width:1680,height:1050});await page.goto('/');
  await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();
  await page.getByRole('heading',{name:'Bản đồ doanh thu & đơn hàng',exact:true}).click();
  const map=page.locator('[data-geographic-report]');await expect(map.locator('[data-province-boundary]')).toHaveCount(63);
  return {map,api};
}

test('real WebGL renderer retains all province data through style, palette, camera and fullscreen changes',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const {map,api}=await openMap(page);
  const frame=map.locator('[data-province-map]');await expect(frame).toHaveAttribute('data-map-engine','maplibre');
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
  const province=map.locator('[data-province-name="Hồ Chí Minh"]'),before=await province.getAttribute('fill');
  await map.locator('.geo-map-appearance > summary').click();
  await map.getByRole('combobox',{name:'Bảng màu bản đồ'}).selectOption('heat');
  await expect(province).not.toHaveAttribute('fill',before!);
  await map.getByRole('combobox',{name:'Cách phân lớp màu'}).selectOption('equal');
  await map.getByRole('combobox',{name:'Nền bản đồ'}).selectOption('boundaries');
  await expect(frame).toContainText('Chỉ địa giới');
  await map.getByRole('combobox',{name:'Nền bản đồ'}).selectOption('light');
  await expect(frame).toContainText('Nền đường phố OpenFreeMap');
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(55);
  await map.getByRole('searchbox',{name:'Tìm địa bàn trên bản đồ'}).fill('ha noi');
  await map.locator('button').filter({hasText:'Hà Nội'}).click();
  await expect(frame).not.toHaveAttribute('data-map-camera','country');
  await map.getByRole('button',{name:'Toàn màn hình',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(()=>document.exitFullscreen());
  await map.getByRole('button',{name:'Toàn cảnh',exact:true}).click();
  await expect(map.locator('[data-province-boundary]')).toHaveCount(63);
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);expect(errors).toEqual([]);
});

test('detailed offline SVG fallback supports keyboard selection and distinguishes missing values from zero',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind:any,...args:any[]){if(String(kind).startsWith('webgl'))return null;return (original as any).apply(this,[kind,...args]);} as any;});
  const {map}=await openMap(page);await expect(map.locator('[data-province-map]')).toHaveAttribute('data-map-engine','svg');
  const fallback=map.locator('svg.province-map-fallback');await expect(fallback).toBeVisible();
  const missing=map.locator('[data-province-boundary][data-has-value="false"]').first();
  await missing.focus();await missing.press('Enter');
  await expect(map.getByRole('status').filter({hasText:'Chưa có giá trị'})).toBeVisible();
  const zero=map.locator(`[data-province-name="${rows[0].label}"]`);
  expect(await missing.getAttribute('fill')).not.toEqual(await zero.getAttribute('fill'));
  await zero.focus();await zero.press('Enter');await expect(map.getByRole('status').filter({hasText:'0 VND'})).toBeVisible();
});

test('live OpenFreeMap street tiles and province labels render together',async({page})=>{
  test.skip(process.env.DP_MAP_LIVE!=='1','Opt-in verification of public basemap; normal regression stays offline.');
  const tiles:string[]=[],errors:string[]=[];
  page.on('response',r=>{if(r.url().includes('tiles.openfreemap.org')&&r.ok()&&/\.pbf(?:\?|$)/.test(r.url()))tiles.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  const {map,api}=await openMap(page,true);
  await expect(map.locator('[data-province-map]')).toHaveAttribute('data-map-engine','maplibre');
  await expect.poll(()=>tiles.length,{timeout:30000}).toBeGreaterThan(0);
  await map.scrollIntoViewIfNeeded();
  await map.screenshot({path:'/tmp/dp-province-live-country.png'});
  await map.getByRole('searchbox',{name:'Tìm địa bàn trên bản đồ'}).fill('ha noi');
  const previous=tiles.length;await map.locator('button').filter({hasText:'Hà Nội'}).click();
  await expect.poll(()=>tiles.length,{timeout:30000}).toBeGreaterThan(previous);
  await map.screenshot({path:'/tmp/dp-province-live-hanoi.png'});
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);expect(errors).toEqual([]);
});
