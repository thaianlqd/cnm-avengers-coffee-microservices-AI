import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {mockApi} from './helpers';

// Optional receipt audit: inputs are real reports collected via fixed dashboards
// (provider_call_count must be zero), not committed copies of source data.
const directory=process.env.DP_DASHBOARD_AUDIT_DIR;
test('every live catalog dashboard renders readable rows on desktop, laptop and mobile',async({page})=>{
 test.skip(!directory,'Set DP_DASHBOARD_AUDIT_DIR to reviewed live dashboard receipts.');test.setTimeout(300000);
 const catalog=JSON.parse(readFileSync(directory+'/catalog.json','utf8')).dashboards;
 const api=await mockApi(page);let current:any,report:any;const audit:any[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 api.on('/auth/session',route=>route.fulfill({json:{authenticated:true,identity:'catalog-audit',role:'DATA_ANALYST',permissions:['analytics.read','system.read'],expires_at:4000000000}}));
 api.on('/ai/dashboards',route=>route.fulfill({json:{dashboards:[current]}}));
 api.on('/ai/analysis-jobs',route=>route.fulfill({json:{job_id:'audit-'+current.id,state:'completed',result:report}}));
 api.on('/geography',route=>route.fulfill({status:503,json:{detail:'Mạng lưới cửa hàng được kiểm tra riêng bằng API thật.'}}));
 mkdirSync(directory+'/screenshots',{recursive:true});
 for(const dashboard of catalog){
  const job=JSON.parse(readFileSync(directory+'/'+dashboard.id+'.json','utf8'));expect(job.state,dashboard.id).toBe('completed');expect(job.provider_call_count,dashboard.id).toBe(0);expect(job.physical_http,dashboard.id).toBe(0);
  current=dashboard;report=job.result;await page.setViewportSize({width:1680,height:1050});await page.goto('/');await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();await page.getByRole('heading',{name:dashboard.title,exact:true}).click();
  const cards=page.locator('[data-dashboard-chart]');if(report.charts.length)await expect(cards.first(),dashboard.id).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(90);
  const entry:any={id:dashboard.id,title:dashboard.title,provider_calls:job.provider_call_count,source_charts:report.charts.length,breakpoints:[]};
  for(const width of [1680,1280,390]){
   await page.setViewportSize({width,height:1050});await page.waitForTimeout(90);
   const geometry=await cards.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{row:n.getAttribute('data-chart-row'),span:Number(n.getAttribute('data-chart-span')),type:n.getAttribute('data-chart-type'),x:b.x,y:b.y,width:b.width,height:b.height};}));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${dashboard.id} overflow at ${width}`).toBe(true);
   for(const card of geometry){expect(card.height,`${dashboard.id} giant chart`).toBeLessThan(650);expect(card.width,`${dashboard.id} narrow chart`).toBeGreaterThan(width===390?230:250);}
   for(const row of new Set(geometry.map(c=>c.row))){const members=geometry.filter(c=>c.row===row);expect(Math.max(...members.map(c=>c.height))-Math.min(...members.map(c=>c.height)),`${dashboard.id} unequal row`).toBeLessThan(2);}
   const clipped=await cards.locator('[data-y-tick]').evaluateAll(nodes=>nodes.filter(n=>(n as SVGGraphicsElement).getBBox().x<-.5).map(n=>n.textContent));expect(clipped,`${dashboard.id} clipped labels`).toEqual([]);
   entry.breakpoints.push({width,cards:geometry.map(({row,span,type,width,height})=>({row,span,type,width:Math.round(width),height:Math.round(height)}))});
   if(width===1680&&await cards.count())await page.locator('[data-dashboard-grid]').screenshot({path:directory+'/screenshots/'+dashboard.id+'.png'});
  }
  audit.push(entry);writeFileSync(directory+'/ui-audit.json',JSON.stringify({dashboards:audit,errors},null,2));console.log(`${dashboard.id}: ${entry.source_charts} source charts, ${entry.breakpoints[0].cards.map((c:any)=>c.span).join('/')}`);
 }
 expect(errors).toEqual([]);expect(audit).toHaveLength(catalog.length);
});
