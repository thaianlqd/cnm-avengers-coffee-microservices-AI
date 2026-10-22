import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {mockApi,openAssistant} from './helpers';
import {formatChartValue} from '../../src/utils/aiChartConfig.mjs';

// Real server-generated reports, independently checked against raw records.
// API transport is intercepted here; served localhost is exercised separately.
const cases=JSON.parse(readFileSync(new URL('../../../evaluation/ai-system-reliability-impl-20261021/codex-rank-pagination33-artifacts.json',import.meta.url),'utf8'));
for(const fixture of cases)test(`ranking claims and map pagination ${fixture.id}`,async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind:any,...args:any[]){
      if(String(kind).startsWith('webgl'))return null;
      return (original as any).apply(this,[kind,...args]);
    } as any;
  });
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:{authenticated:true,identity:'ranking-pagination-fixture',role:'ADMIN',
    permissions:['analytics.read','reports.save','reports.export','system.read'],expires_at:4000000000}}));
  api.on('/geography',route=>route.fulfill({status:503,json:{detail:'Directory unavailable in this report-artifact fixture; report map retained.'}}));
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{job_id:fixture.id,state:'completed',result:fixture.report}}));
  await page.setViewportSize({width:1440,height:1000});await openAssistant(page);
  await page.locator('textarea').first().fill(fixture.report.prompt);
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const answer=page.locator('[data-short-answer]');await expect(answer).toBeVisible();
  await answer.locator('summary').click();
  for(const line of fixture.report.short_answer)await expect(answer).toContainText(line);
  const originalAnswer=await answer.innerText();
  const direction=fixture.direction==='bottom'?'Bottom':'Top';
  const map=page.locator('[data-geographic-report]');await expect(map).toBeVisible();
  await expect(map.locator('.geo-map-sidebar')).toContainText(`${fixture.expected.length} địa bàn trong báo cáo`);
  await expect(map.locator('.geo-map-sidebar')).toContainText(`${direction} ${fixture.limit}`);
  const nav=map.getByRole('navigation',{name:'Địa bàn bản đồ',exact:true});
  const seen:string[]=[];
  for(let i=0;i<Math.ceil(fixture.expected.length/8);i++){
    const buttons=map.locator('.geo-map-sidebar .space-y-1 > button');
    for(const row of await buttons.all()){
      const city=await row.locator('span.block.truncate').innerText();seen.push(city);
      const value=fixture.expected.find((pair:any)=>pair[0]===city)?.[1];expect(value).toBeDefined();
      await expect(row).toContainText(formatChartValue(value,' VND'));
    }
    if(i<Math.ceil(fixture.expected.length/8)-1)await nav.getByRole('button',{name:'Địa bàn bản đồ: trang sau',exact:true}).click();
    expect(await answer.innerText()).toBe(originalAnswer);
  }
  expect(seen.length).toBe(fixture.expected.length);
  expect([...new Set(seen)].sort()).toEqual(fixture.expected.map((row:any)=>row[0]).sort());
  await map.getByRole('searchbox',{name:'Tìm địa bàn trên bản đồ'}).fill(fixture.expected[0][0]);
  await expect(map.locator('.geo-map-sidebar .space-y-1 > button')).toHaveCount(1);
  expect(await answer.innerText()).toBe(originalAnswer);
  await map.getByRole('searchbox',{name:'Tìm địa bàn trên bản đồ'}).fill('');
  await page.locator('#chart-tab-all').click().catch(()=>{});
  const more=page.getByRole('button',{name:/^Xem thêm .* góc nhìn chi tiết/});if(await more.count())await more.click();
  const chart=page.locator('[data-dashboard-chart]').filter({hasText:fixture.report.charts.find((c:any)=>c.role==='requested').title}).first();
  const insight=chart.locator('[data-chart-insight]');await insight.locator('summary').click();
  const before=await insight.innerText();expect(before).toContain(direction);
  await insight.locator('summary').click();await insight.locator('summary').click();
  expect(await insight.innerText()).toBe(before);expect(await answer.innerText()).toBe(originalAnswer);
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  expect(api.calls['/api/ai/propose-plan']||[]).toHaveLength(0);
});
