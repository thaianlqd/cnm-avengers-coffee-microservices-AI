// Explicit paid acceptance only. Real served UI + authenticated API; no response mocks.
// One free-text submission, then local modes/save/export/reconciliation/global Apply.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const guidedOnly=process.env.CW_GUIDED_ONLY==='1';
if((!guidedOnly && process.env.CW_ALLOW_PAID_LIVE!=='1') || !process.env.CW_ADMIN_PASSWORD) throw new Error('Explicit live authorization and credentials required');
const out=process.env.CW_EVIDENCE_DIR;
if(!out)throw new Error('Evidence directory required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
page.setDefaultTimeout(30000);
const checks=[],submissions=[];
const receipt={mode:guidedOnly?'served_real_ui_real_api_guided_zero_provider':'served_real_ui_real_api_real_provider',started_at:new Date().toISOString(),checks,submissions};
if(guidedOnly)await page.route('**/api/ai/**',route=>{
  const request=route.request();
  if(request.method()==='POST' && /\/(analysis-jobs|propose-plan|generate-executive-report|refine-report)$/.test(new URL(request.url()).pathname)){
    const payload=request.postDataJSON();
    if(payload.input_mode!=='guided' || !payload.guided_contract)throw new Error('Guided-only run blocked a provider-capable submission');
  }
  return route.continue();
});
page.on('request',request=>{
  const path=new URL(request.url()).pathname;
  if(request.method()==='POST' && /\/ai\/(analysis-jobs|propose-plan|generate-executive-report|refine-report)$/.test(path))
    submissions.push({path,at:new Date().toISOString()});
});
try{
  await page.goto('http://localhost:8501');
  await page.getByPlaceholder('Nhập tài khoản').fill('admin');
  await page.getByPlaceholder('Nhập mật khẩu').fill(process.env.CW_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('button',{name:'Trợ lý AI',exact:true})).toBeVisible();
  const builds=[];
  for(const url of await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src))){
    const response=await page.request.get(url);
    builds.push({url,sha256:createHash('sha256').update(await response.body()).digest('hex')});
  }
  receipt.builds=builds;
  const capabilities=await page.request.get('http://localhost:8501/api/ai/capabilities');
  expect(capabilities.ok()).toBeTruthy();
  await writeFile(`${out}/advertised-capabilities.json`,JSON.stringify(await capabilities.json(),null,2));
  await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  if(guidedOnly){
    await page.locator('[data-mission="compare"]').click();
    await page.getByLabel('Chỉ số',{exact:true}).selectOption('revenue');
    await page.getByLabel('Chiều phân tích',{exact:true}).selectOption('city');
    await page.getByLabel('Nhóm A',{exact:true}).selectOption('Hồ Chí Minh');
    await page.getByLabel('Nhóm B',{exact:true}).selectOption('Đà Nẵng');
    await page.getByRole('button',{name:'Dùng cấu hình này',exact:true}).click();
  }else{
    await page.locator('textarea').first().fill('so sánh doanh thu Hồ Chí Minh và Đà Nẵng từ tháng 1 đến tháng 9 năm 2026');
  }
  await expect(page.getByRole('button',{name:'Phân tích',exact:true})).toBeEnabled();
  const started=page.waitForResponse(r=>r.url().endsWith('/ai/analysis-jobs') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const job=await (await started).json();expect(job.job_id).toBeTruthy();receipt.job_id=job.job_id;
  let terminal;
  await expect.poll(async()=>{
    terminal=await (await page.request.get(`http://localhost:8501/api/ai/analysis-jobs/${job.job_id}`)).json();
    if(['failed','unsupported','clarification_required','cancelled'].includes(terminal.state))throw new Error(`Terminal ${terminal.state}: ${JSON.stringify(terminal.error || terminal.result)}`);
    return terminal.state;
  },{timeout:180000,intervals:[1000,2000,3000]}).toBe('completed');
  const report=terminal.result;
  expect(report.verification.status).toBe('verified');
  expect(report.comparison_frames[0].members.map(m=>m.key).sort()).toEqual(['Hồ Chí Minh','Đà Nẵng'].sort());
  await writeFile(`${out}/initial-report.json`,JSON.stringify(report,null,2));
  const fullResults={};
  for(const q of report.analytical_queries){
    const rows=[];let total;
    do{
      const response=await page.request.get(`http://localhost:8501/api/ai/sessions/${report.session_id}/results/${q.id}?offset=${rows.length}&limit=200&revision=${report.revision}`);
      expect(response.ok()).toBeTruthy();const part=await response.json();
      rows.push(...part.rows);total=part.total_rows;
      if(!part.rows.length)break;
    }while(rows.length<total);
    expect(rows.length).toBe(total);
    fullResults[q.id]={...report.result_sets[q.id],rows};
  }
  await writeFile(`${out}/full-result-rows.json`,JSON.stringify(fullResults,null,2));
  receipt.physical_http=terminal.physical_http;receipt.logical_calls=terminal.logical_calls;
  if(guidedOnly)expect(terminal.physical_http).toBe(0);
  checks.push({id:guidedOnly?'guided_member_meaning_and_verified_report':'fresh_free_text_member_meaning_and_verified_report',passed:true});
  const cards=page.locator('[data-dashboard-chart]').filter({has:page.locator('[data-view-controls]')});
  await expect(cards.first()).toBeVisible();
  const beforeCalls=submissions.length;
  const kpi=await page.locator('[data-kpi-strip]').textContent();
  const count=await cards.count();expect(count).toBeGreaterThanOrEqual(3);
  for(let i=0;i<count;i++){
    const card=cards.nth(i);
    await card.locator('[data-view-mode="total"]').click();
    await expect(card.locator('[data-view-caption]')).toContainText('Tổng của 2 đối tượng');
    await card.locator('[data-view-mode="single"]').click();
    await card.locator('[data-view-member="Đà Nẵng"]').click();
    await expect(card.locator('[data-view-caption]')).toContainText('Riêng Đà Nẵng');
    await card.locator('[data-view-mode="compare"]').click();
    await expect(card.locator('[data-view-mode="compare"]')).toHaveAttribute('aria-pressed','true');
  }
  expect(submissions.length).toBe(beforeCalls);
  expect(await page.locator('[data-kpi-strip]').textContent()).toBe(kpi);
  checks.push({id:'every_offered_chart_compare_total_single',passed:true,charts:count,extra_submissions:0});
  const card=cards.first();
  await card.locator('[data-view-mode="single"]').click();
  await card.locator('[data-view-member="Đà Nẵng"]').click();
  await card.screenshot({path:`${out}/single-member.png`});
  const saving=page.waitForResponse(r=>r.url().endsWith('/reports/saved') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Lưu báo cáo',exact:true}).first().click();
  const savedResponse=await saving;expect(savedResponse.ok()).toBeTruthy();
  const saved=await savedResponse.json();receipt.saved_report_id=saved.report.id;
  const reopened=await (await page.request.get(`http://localhost:8501/api/reports/saved/${saved.report.id}`)).json();
  expect(Object.keys(reopened.module_config.chart_view_choices || {}).length).toBeGreaterThan(0);
  await writeFile(`${out}/saved-report.json`,JSON.stringify(reopened.module_config,null,2));
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Tải file Word (.docx)',exact:true}).first().click();
  const downloaded=await downloading;await downloaded.saveAs(`${out}/active-view.docx`);
  const text=execFileSync('python3',['-c',"import sys,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(sys.argv[1]);print(''.join(E.fromstring(z.read('word/document.xml')).itertext()))",`${out}/active-view.docx`]).toString();
  expect(text).toContain('Riêng Đà Nẵng');
  expect(submissions.length).toBe(beforeCalls);
  checks.push({id:'real_save_reopen_and_word_preserve_selected_view',passed:true,extra_submissions:0});
  await page.getByRole('tab',{name:'Kiểm chứng & nguồn',exact:true}).click();
  const reconciling=page.waitForResponse(r=>r.url().endsWith(`/sessions/${report.session_id}/reconcile`) && r.request().method()==='POST');
  await page.getByRole('button',{name:'Chạy đối chiếu độc lập (0 lượt AI)',exact:true}).click();
  const reconciliation=await (await reconciling).json();
  await writeFile(`${out}/independent-reconciliation.json`,JSON.stringify(reconciliation,null,2));
  if(reconciliation.independent_oracle){
    expect(reconciliation.independent_oracle.eligible).toBeGreaterThan(0);
    expect(reconciliation.independent_oracle.matched).toBe(reconciliation.independent_oracle.eligible);
  }else{
    // A changing replica is not a pinned historical snapshot. Truthful
    // not_measured is the required outcome; never count it as numeric proof.
    expect(reconciliation.consistency.status).toBe('not_measured');
    expect(reconciliation.consistency.reason).toBe('source_generation_not_pinned');
  }
  checks.push({id:'source_reconciliation_measured_or_truthful_unpinned',passed:true,
    numeric_proof:Boolean(reconciliation.independent_oracle),oracle:reconciliation.independent_oracle,
    consistency:reconciliation.consistency});
  await page.getByRole('tab',{name:'Báo cáo',exact:true}).click();
  await cards.first().locator('[data-apply-report]').click();
  await expect(page.locator('[data-pending-filters]')).toBeVisible();
  const applying=page.waitForResponse(r=>r.url().endsWith('/ai/workspace-revision') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();
  const changed=await (await applying).json();
  await writeFile(`${out}/applied-report.json`,JSON.stringify(changed,null,2));
  expect(changed.status).toBe('success');expect(changed.revision).toBe(report.revision+1);
  expect(changed.verification.status).toBe('verified');
  expect(changed.analysis_coverage.lenses.some(l=>l.status==='rejected' && l.reason==='renderer_unsupported')).toBe(false);
  expect(changed.quality_assessment.publication_checks.every(c=>c.passed===c.total)).toBe(true);
  // Narrowing to one member cannot supply the original A/B gap. Retain that
  // declared limitation rather than silently removing a requested feature.
  if(changed.quality_assessment.status!=='verified')
    expect(changed.quality_assessment.missing.every(m=>m.id.endsWith(':derived'))).toBe(true);
  expect(changed.interaction_state.filters[0].values.map(v=>v.value)).toEqual(['Đà Nẵng']);
  expect(submissions.length).toBe(beforeCalls);
  await writeFile(`${out}/applied-report.json`,JSON.stringify(changed,null,2));
  await page.screenshot({path:`${out}/applied-member.png`,fullPage:true});
  checks.push({id:'explicit_global_apply_new_verified_revision',passed:true,extra_submissions:0});
  receipt.status='PASS';
}catch(error){
  receipt.status='FAIL';receipt.error=String(error);
  await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});
  throw error;
}finally{
  receipt.finished_at=new Date().toISOString();
  await writeFile(`${out}/result.json`,JSON.stringify(receipt,null,2));
  await browser.close();
}
console.log(JSON.stringify({status:receipt.status,checks:checks.length,submissions:submissions.length,physical_http:receipt.physical_http}));
