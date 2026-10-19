import {expect,test} from '@playwright/test';
import {execFileSync} from 'node:child_process';

// No page.route/api mocks. HTTP runs through real FastAPI routers/jobs with isolated fixture I/O.
test.beforeEach(async({request})=>{
  // Vite serves the page; the explicit API fixture marker protects against accidentally spending quota.
  const marker=await request.get('/api/test/metrics');
  expect(marker.ok()).toBeTruthy();expect((await marker.json()).external_http).toBe(0);
});

test('South scope → optional proposal → generate → direct total and final conclusion',async({page})=>{
  await page.goto('/');await page.getByText('Trợ lý AI',{exact:true}).first().click();
  await page.locator('textarea').first().fill('Doanh thu các chi nhánh miền Nam');
  await expect(page.locator('[data-detected-scope]')).toContainText('6 tỉnh/thành');
  const proposalPromise=page.waitForResponse(r=>r.url().endsWith('/ai/propose-plan') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Xem kế hoạch'}).click();
  const proposed=await (await proposalPromise).json();expect(proposed.status).toBe('proposal_ready');
  for(const op of proposed.proposal.analytical_queries) expect(op.filters.some((f:any)=>f.dimension==='city' && f.value.length===6)).toBeTruthy();
  const resultPromise=page.waitForResponse(r=>r.url().endsWith('/ai/generate-executive-report'));
  await page.getByRole('button',{name:'Xác nhận & Bắt đầu Phân tích'}).click();
  const report=await (await resultPromise).json();expect(report.status).toBe('success');
  expect(report.short_answer.join(' ')).toMatch(/Tổng doanh thu/);expect(report.answer_requirements.length).toBeGreaterThan(0);
  await expect(page.locator('[data-short-answer]')).toContainText('Tổng doanh thu');
  await expect(page.locator('[data-conclusion] > summary')).toHaveText('Kết luận phân tích');
  await expect(page.locator('[data-conclusion]')).not.toHaveAttribute('open','');
  expect(await page.locator('[data-conclusion]').evaluate(el=>Boolean(el.previousElementSibling))).toBeTruthy();
  const saved=await page.request.post('/api/reports/saved',{data:{title:'V33 isolated South acceptance',
    sql_query:Object.values(report.sql_by_query)[0],module_config:report,category:'ai_report'}});
  expect(saved.ok(),await saved.text()).toBeTruthy();
  const id=(await saved.json()).report.id;
  const reopened=await (await page.request.get(`/api/reports/saved/${id}`)).json();
  expect(reopened.module_config.conclusion).toEqual(report.conclusion);
  expect(reopened.module_config.answer_requirements).toEqual(report.answer_requirements);
  expect(reopened.module_config.scope_resolution).toEqual(report.scope_resolution);
  expect(reopened.module_config.verification).toEqual(report.verification);
  const word=await page.request.get(`/api/reports/saved/${id}/download-docx`);
  expect(word.ok(),await word.text()).toBeTruthy();
  const text=execFileSync('python3',['-c',
    "import io,sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));r=E.fromstring(z.read('word/document.xml'));print(''.join(r.itertext()))"],{input:await word.body()}).toString();
  expect(text).toContain('KẾT LUẬN PHÂN TÍCH');expect(text).toContain(report.conclusion.answer);
  for(const caveat of report.conclusion.caveats)expect(text).toContain(caveat);
  const moduleResponse=await page.request.post('/api/ai/modules',{data:{session_id:report.session_id,revision:report.revision,name:'South canonical browser module'}});
  const module=await moduleResponse.json();expect(module.status,JSON.stringify(module)).toBe('success');
  const beforeRerun=await (await page.request.get('/api/test/metrics')).json();
  const rerun=await (await page.request.post(`/api/ai/modules/${module.module.module_id}/rerun`,{data:{}})).json();
  expect(rerun.status,JSON.stringify(rerun)).toBe('success');expect(rerun.short_answer).toEqual(report.short_answer);
  expect(rerun.scope_resolution.bindings).toEqual(report.scope_resolution.bindings);
  const afterRerun=await (await page.request.get('/api/test/metrics')).json();
  expect(afterRerun.logical_calls).toBe(beforeRerun.logical_calls);
});

test('all public entry variants reject a known forbidden clause before interpretation or SQL',async({request})=>{
  const before=await (await request.get('/api/test/metrics')).json();
  const question='Doanh thu chi nhánh miền Nam, chỉ những chi nhánh đang lỗ';
  for(const extra of [{question},{prompt:question},{question,natural_input:false,allow_deterministic_upgrade:false},
    {question,analysis_module_id:'am_000000000000000000000000'},
    {question,input_mode:'guided',analysis_mission:'ranking',guided_contract:{metric:'revenue',dimension:'store',n:5}}]){
    const r=await request.post('/api/ai/propose-plan',{data:extra});
    const result=await r.json();expect(result.capability?.decision,JSON.stringify(result)).toBe('UNSUPPORTED');
  }
  const job=await (await request.post('/api/ai/analysis-jobs',{headers:{'Idempotency-Key':`safety-${Date.now()}`},data:{question}})).json();
  await expect.poll(async()=> (await (await request.get(`/api/ai/analysis-jobs/${job.job_id}`)).json()).state).toBe('unsupported');
  const risk=await request.post('/api/ai/risk-watch',{data:{question,signals:['delivery_success_low']}});
  expect(risk.status()).toBe(422);
  expect((await risk.json()).detail.decision).toBe('UNSUPPORTED');
  const after=await (await request.get('/api/test/metrics')).json();
  expect(after.logical_calls).toBe(before.logical_calls);expect(after.sql_queries).toBe(before.sql_queries);
});

test('known mixed unsupported is blocked at real HTTP boundary with zero interpretation and SQL',async({request})=>{
  const before=await (await request.get('/api/test/metrics')).json();
  const res=await request.post('/api/ai/propose-plan',{data:{question:'Doanh thu và lợi nhuận tháng 9 năm 2026'}});
  const outcome=await res.json();expect(outcome.capability.decision).toBe('UNSUPPORTED');
  const after=await (await request.get('/api/test/metrics')).json();
  expect(after.logical_calls).toBe(before.logical_calls);expect(after.sql_queries).toBe(before.sql_queries);
});

test('one-click API job retains same identity on reconnect and guided work uses zero AI',async({request})=>{
  const before=await (await request.get('/api/test/metrics')).json();
  const data={question:'Tình hình doanh thu',input_mode:'guided',analysis_mission:'overview',guided_contract:{metric:'revenue'},analysis_depth:'focused'};
  // Establish the browser ownership cookie before idempotent submission.
  await request.get('/api/ai/status');await request.post('/api/ai/preflight',{data:{question:'Doanh thu'}});
  const key=`browser-acceptance-${Date.now()}`;
  const first=await (await request.post('/api/ai/analysis-jobs',{headers:{'Idempotency-Key':key},data})).json();
  expect(first.job_id).toBeTruthy();
  const repeated=await (await request.post('/api/ai/analysis-jobs',{headers:{'Idempotency-Key':key},data})).json();
  expect(repeated.job_id).toBe(first.job_id);
  await expect.poll(async()=> (await (await request.get(`/api/ai/analysis-jobs/${first.job_id}`)).json()).state).toBe('completed');
  const result=await (await request.get(`/api/ai/analysis-jobs/${first.job_id}`)).json();
  expect(result.physical_http).toBe(0);expect(result.result.conclusion.answer.toLowerCase()).toContain('doanh thu');
  const after=await (await request.get('/api/test/metrics')).json();expect(after.logical_calls).toBe(before.logical_calls);
});
