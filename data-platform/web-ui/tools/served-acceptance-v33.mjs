// Explicit acceptance on the served application. New browser owner; no API response mocks.
// Provider-capable submissions are blocked unless the UI sends an exact guided contract.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=process.env.V33_EVIDENCE_DIR || '/tmp/v33-followup/served';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM || undefined});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const rows=[],blocked=[];
await page.route('**/api/ai/**',async route=>{
  const request=route.request();
  if(request.method()==='POST' && /\/(analysis-jobs|propose-plan|generate-executive-report|refine-report)$/.test(new URL(request.url()).pathname)){
    const data=request.postDataJSON();
    if(data.input_mode!=='guided' || !data.guided_contract){blocked.push(request.url());return route.abort();}
  }
  return route.continue();
});
try{
  await page.goto('http://localhost:8501');
  const scripts=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));
  const builds=[];
  for(const url of scripts){const r=await page.request.get(url);builds.push({url,sha256:createHash('sha256').update(await r.body()).digest('hex')});}
  await page.getByText('Trợ lý AI',{exact:true}).first().click();
  await expect(page.getByRole('radiogroup',{name:'Nhiệm vụ phân tích'}).getByRole('radio')).toHaveCount(7);
  rows.push({id:'seven_modes',passed:true});
  async function input(id,q,decision,members){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/ai/preflight') && r.request().postDataJSON()?.question===q);
    await page.locator('textarea').first().fill(q);
    const pf=await (await response).json();
    expect(pf.capability.decision).toBe(decision);
    if(members)expect(pf.scope_resolution.bindings[0].members).toHaveLength(members);
    rows.push({id,passed:true,decision:pf.capability.decision,scope:pf.scope_resolution});
    return pf;
  }
  await input('south','Doanh thu các chi nhánh miền Nam tháng 9 năm 2026','READY',6);
  await expect(page.locator('[data-detected-scope]')).toContainText('6 tỉnh/thành');
  await page.locator('[data-scope-provenance] summary').click();
  await expect(page.locator('[data-scope-provenance]')).toContainText('warehouse_reporting_geography_v1');
  await page.screenshot({path:`${out}/south-input.png`,fullPage:true});
  await input('difference','Doanh thu miền Nam trừ HCM tháng 9 năm 2026','READY',5);
  await input('union','Doanh thu miền Nam và Hà Nội tháng 9 năm 2026','READY',7);
  await input('unresolved','Doanh thu Quảng Nam tháng 9 năm 2026','UNSUPPORTED');
  await expect(page.locator('[data-detected-scope]')).toContainText('đang cần xác minh');
  await input('mixed_unsupported','Doanh thu và lợi nhuận tháng 9 năm 2026','UNSUPPORTED');
  await expect(page.getByRole('button',{name:'Phân tích',exact:true})).toBeDisabled();
  await input('one_day_week','Xu hướng doanh thu theo tuần trong ngày 15/09/2026','CLARIFY');
  await page.locator('[data-mission="risk_watch"]').click();
  const q='Rủi ro Hà Nội tháng 9 năm 2026';await input('risk_inline_scope',q,'READY',1);
  const scanResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/risk-watch'));
  await page.getByRole('button',{name:'Kiểm tra rủi ro (0 lượt AI)',exact:true}).click();
  const risk=await (await scanResponse).json();
  expect(risk.provider_calls).toBe(0);expect(risk.scope[0].value).toEqual(['Hà Nội']);
  await expect(page.locator('[data-risk-applied-context]')).toContainText('Hà Nội');
  await page.screenshot({path:`${out}/risk-hanoi.png`,fullPage:true});
  rows.push({id:'risk_real_scan',passed:true,scope:risk.scope,counts:risk.counts,provider_calls:risk.provider_calls});
  await page.locator('[data-mission="overview"]').click();
  await page.getByLabel('Chỉ số',{exact:true}).selectOption('revenue');
  await page.getByLabel('Chiều phân tích',{exact:true}).selectOption('store');
  await page.getByRole('button',{name:'Dùng cấu hình này',exact:true}).click();
  const jobResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/analysis-jobs') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const job=await (await jobResponse).json();expect(job.job_id).toBeTruthy();
  let terminal;
  await expect.poll(async()=>{
    terminal=await (await page.request.get(`http://localhost:8501/api/ai/analysis-jobs/${job.job_id}`)).json();return terminal.state;
  },{timeout:70000}).toBe('completed');
  expect(terminal.physical_http).toBe(0);expect(terminal.result.short_answer.join(' ')).toContain('Doanh thu');
  await expect(page.locator('[data-conclusion] h3')).toHaveText('KẾT LUẬN PHÂN TÍCH');
  await page.screenshot({path:`${out}/guided-report.png`,fullPage:true});
  rows.push({id:'guided_served_report',passed:true,job_id:job.job_id,physical_http:terminal.physical_http,
    answer:terminal.result.short_answer,verification:terminal.result.verification,coverage:terminal.result.view_coverage});
  await page.getByText('Kiểm chứng & nguồn',{exact:true}).click();
  const oracleResponse=page.waitForResponse(r=>r.url().endsWith(`/sessions/${terminal.result.session_id}/reconcile`));
  await page.getByRole('button',{name:'Chạy đối chiếu độc lập (0 lượt AI)',exact:true}).click();
  const oracle=await (await oracleResponse).json();
  expect(oracle.independent_oracle).toBeTruthy();
  expect(oracle.independent_oracle.matched).toBe(oracle.independent_oracle.eligible);
  expect(oracle.independent_oracle.eligible).toBeGreaterThan(0);
  await expect(page.locator('[data-independent-oracle]')).not.toContainText('Chưa đo');
  await page.screenshot({path:`${out}/independent-reconciliation.png`,fullPage:true});
  rows.push({id:'served_independent_reconciliation',passed:true,physical_http:0,oracle});
  await page.getByRole('button',{name:'Hỏi câu mới',exact:true}).click();
  await page.locator('[data-mission="forecast"]').click();
  await page.getByLabel('Chỉ số',{exact:true}).selectOption('revenue');
  await page.getByLabel('Đơn vị dự báo',{exact:true}).selectOption('month');
  await page.getByLabel('Tầm dự báo',{exact:true}).selectOption('2');
  await page.getByRole('button',{name:'Dùng cấu hình này',exact:true}).click();
  const forecastResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/analysis-jobs') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const forecastJob=await (await forecastResponse).json();expect(forecastJob.job_id).toBeTruthy();
  let forecastTerminal;
  await expect.poll(async()=>{
    forecastTerminal=await (await page.request.get(`http://localhost:8501/api/ai/analysis-jobs/${forecastJob.job_id}`)).json();
    return forecastTerminal.state;
  },{timeout:70000}).toBe('completed');
  expect(forecastTerminal.physical_http).toBe(0);
  const fc=forecastTerminal.result.forecasts[0];
  expect(fc.status).toBe('ok');expect(fc.horizon).toBe(2);
  expect(fc.forecast.filter(p=>p.kind==='future')).toHaveLength(2);
  const fcBinding=forecastTerminal.result.answer_requirements.find(b=>b.role==='forecast');
  expect(fcBinding.unit).toBe('VND');expect(fcBinding.cadence).toBe('month');
  await expect(page.locator('[data-conclusion]')).toContainText('dự báo',{ignoreCase:true});
  await page.screenshot({path:`${out}/guided-forecast.png`,fullPage:true});
  rows.push({id:'guided_served_forecast',passed:true,job_id:forecastJob.job_id,physical_http:0,
    answer:forecastTerminal.result.short_answer,forecast:fc,binding:fcBinding});
  expect(blocked).toEqual([]);
  await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',mode:'served_real_api',builds,rows,blocked},null,2));
  console.log(JSON.stringify({status:'PASS',journeys:rows.length,physical_http:0,builds}));
}catch(error){
  await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});
  await writeFile(`${out}/result.json`,JSON.stringify({status:'FAIL',rows,blocked,error:String(error)},null,2));
  throw error;
}finally{await browser.close();}
