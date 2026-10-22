// Real served UI + API, sequential guided missions, no intercepted responses.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../web-ui/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const run=process.env.DP_AUDIT_RUN||'codex-browser-final-v4';
const only=process.env.DP_AUDIT_CASE;
if(!/^[a-z0-9-]+$/.test(run))throw Error('Invalid receipt folder');
const out=fileURLToPath(new URL(`./${run}/`,import.meta.url));
mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:8501';
const depths={focused:'Tập trung',deep:'Sâu',comprehensive:'Toàn diện'};
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||`${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
const records=[];
try{
 const page=await ctx.newPage();
 page.setDefaultTimeout(20000);
 await page.goto(base);
 await page.getByLabel('Tài khoản',{exact:true}).fill(process.env.DP_AUDIT_USER||'admin');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.DP_AUDIT_PASSWORD);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('button',{name:'Trợ lý AI',exact:true})).toBeVisible({timeout:45000});
 const scopeChecks=[];
 for(const [id,values,path,allowed] of [
  ['unknown',['Tỉnh qzxn không tồn tại'],'preflight',false],
  ['rare-five',['Ninh Thuận','Sóc Trăng','Bạc Liêu','Trà Vinh','Quảng Trị'],'resolve-input',true],
  ['rare-five-cached',['Ninh Thuận','Sóc Trăng','Bạc Liêu','Trà Vinh','Quảng Trị'],'preflight',true]]){
  const response=await ctx.request.post(`${base}/api/ai/${path}`,{headers:{Origin:base},data:{
   question:'Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026',reference_date:'2026-10-21',
   analysis_scope:{mode:'selected',filters:[{dimension:'city',operator:'in',value:values}]}}});
  const data=await response.json();expect(response.ok()).toBe(true);expect(data.can_submit).toBe(allowed);
  expect(data.provider_calls).toBe(0);
  if(path==='preflight')expect(data.lookup_queries).toBe(0);
  scopeChecks.push({id,response:data});
 }
 writeFileSync(`${out}/structured-scope-http.json`,JSON.stringify(scopeChecks,null,2));
 for(const [depth,label] of Object.entries(depths)) for(const mission of ['ranking','compare','risk_watch','trend']){
  const id=`${mission}-${depth}`,record={id,mission,depth,started_at:new Date().toISOString()};
  if(only&&id!==only)continue;
  let report=null,payload=null,geography=null;const analytic=[];
  const onRequest=req=>{const path=new URL(req.url()).pathname;if(path.startsWith('/api/ai/')&&req.method()==='POST'&&!['/api/ai/preflight','/api/ai/resolve-input','/api/ai/refinement-preflight'].includes(path)){analytic.push(path);if(path==='/api/ai/analysis-jobs')payload=req.postDataJSON();}};
  const onResponse=async res=>{const path=new URL(res.url()).pathname;if(path.startsWith('/api/ai/analysis-jobs')){try{const data=await res.json();if(data.result)report=data.result;}catch{}}
   if(path.endsWith('/geography')&&!new URL(res.url()).searchParams.has('city')){try{geography=await res.json();}catch{}}};
  page.on('request',onRequest);page.on('response',onResponse);
  try{
   await page.goto(base);await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
   if(id==='ranking-comprehensive'){
    record.drawer_breakpoints=[];
    // The capability drawer belongs to the question workspace, before a job.
    for(const width of [1280,1920,390]){
     await page.setViewportSize({width,height:1000});
     await page.getByRole('button',{name:/^Hỏi được gì\?/}).first().click();
     const drawer=page.getByRole('dialog',{name:'Bạn muốn phân tích điều gì?',exact:true});await expect(drawer).toBeVisible();
     const box=await drawer.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
     await page.getByRole('button',{name:'Đóng danh mục',exact:true}).click();await expect(drawer).toHaveCount(0);
     record.drawer_breakpoints.push({width,box});
    }
    expect(analytic.length).toBe(0);await page.setViewportSize({width:1440,height:1000});
   }
   // Depth state is shared. Risk currently hides its depth picker; select in free mode first.
   await page.locator('[data-mission-free]').click();
   await page.getByRole('radiogroup',{name:'Độ sâu phân tích'}).getByRole('radio').nth(Object.keys(depths).indexOf(depth)).click();
   await page.locator(`[data-mission="${mission}"]`).click();
   const builder=page.locator(`[data-mission-builder="${mission}"]`);
   if(mission!=='risk_watch')await builder.getByLabel('Chỉ số',{exact:true}).selectOption('revenue');
   if(mission==='ranking'){
    await builder.getByLabel('Chiều phân tích',{exact:true}).selectOption('city');
    await builder.getByLabel('Chiều xếp hạng',{exact:true}).selectOption('bottom');
    await builder.getByLabel('Số nhóm',{exact:true}).selectOption('5');
   }else if(mission==='compare'){
    await builder.getByLabel('Chiều phân tích',{exact:true}).selectOption('city');
    await builder.getByLabel('Nhóm A',{exact:true}).selectOption('Hồ Chí Minh');
    await builder.getByLabel('Nhóm B',{exact:true}).selectOption('Hà Nội');
   }else if(mission==='trend')await builder.getByLabel('Chu kỳ',{exact:true}).selectOption('week');
   if(await builder.getByLabel('Thời gian',{exact:true}).count())await builder.getByLabel('Thời gian',{exact:true}).selectOption('2026-09');
   await builder.getByRole('button',{name:'Dùng cấu hình này',exact:true}).click();
   if(mission==='risk_watch'){
    const panel=page.locator('[data-scope-panel]');
    await panel.getByRole('button',{name:'Thu hẹp thủ công',exact:true}).click();
    await panel.getByLabel('Loại phạm vi',{exact:true}).selectOption('city');
    await panel.getByRole('button',{name:'Hồ Chí Minh',exact:true}).click();
   }
   const submit=page.getByRole('button',{name:mission==='risk_watch'?'Phân tích sâu bằng AI':'Phân tích',exact:true});
   await expect(submit).toBeEnabled({timeout:30000});await submit.click();
   await expect.poll(()=>Boolean(report),{timeout:150000}).toBe(true);
   expect(payload.analysis_depth).toBe(depth);expect(payload.input_mode).toBe('guided');
   expect(report.status).toBe('success');
   for(const id of ['evidence_grounding','semantic_consistency','result_integrity'])
    expect(report.quality_assessment.verification_checks.find(c=>c.id===id)?.status).toBe('passed');
   await expect(page.locator('[data-refinement-composer]')).toBeVisible({timeout:15000});
   expect(report.diagnostics?.provider_call_count||0).toBe(0);
   expect(report.analytical_queries.length).toBeGreaterThan(0);
   for(const q of report.analytical_queries){
    if(mission==='risk_watch')expect(q.filters.some(f=>f.dimension==='city'&&(Array.isArray(f.value)?f.value:[f.value]).includes('Hồ Chí Minh'))).toBe(true);
   }
   if(mission==='ranking'){
    await expect.poll(()=>Boolean(geography),{timeout:20000}).toBe(true);
    const rank=report.analytical_queries.find(q=>q.operation==='ranking');
    const cities=new Set(report.result_sets[rank.id].rows.map(r=>r.city));
    const selected=geography.provinces.filter(p=>cities.has(p.city));
    const revenue=selected.reduce((sum,p)=>sum+p.revenue,0),valid=selected.reduce((sum,p)=>sum+p.valid_orders,0);
    expect(revenue).toBe(1071000);expect(valid).toBe(12);
    const aov=page.locator('.geo-network-overview .geo-business-kpis > div').nth(2).locator('strong');
    await expect(aov).toContainText('89.250');
    record.map_cohort={cities:[...cities],revenue,valid_orders:valid,aov:revenue/valid,displayed_aov:await aov.innerText()};
   }
   await page.locator('#chart-tab-all').click().catch(()=>{});
   const more=page.getByRole('button',{name:/^Xem thêm .* góc nhìn chi tiết/});if(await more.count())await more.click();
   const cards=page.locator('[data-dashboard-chart]');
   expect(await cards.count()).toBe(report.charts.length);
   const before=analytic.length, facts=[];
   for(let n=0;n<await cards.count();n++){
    const card=cards.nth(n),details=card.locator('[data-chart-insight]');
    await details.locator('summary').click();await expect(details).toHaveAttribute('open','');
    facts.push({chart:n,text:await details.innerText(),facts:await details.locator('[data-insight-fact]').count()});
    await details.locator('summary').click();await expect(details).not.toHaveAttribute('open','');
   }
   expect(analytic.length-before).toBe(0);
   const conclusion=JSON.stringify(report.conclusion), layout=page.getByRole('navigation',{name:'Bố cục biểu đồ'});
   if(await layout.count())await layout.getByRole('button',{name:'Toàn chiều rộng',exact:true}).click();
   expect(JSON.stringify(report.conclusion)).toBe(conclusion);
   expect(analytic.length-before).toBe(0);
   await page.screenshot({path:`${out}/${id}.png`,fullPage:true});
   if(id==='ranking-comprehensive'){
    record.breakpoints=[];
    for(const width of [1280,1920,390]){
     await page.setViewportSize({width,height:1000});
     await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
     const first=cards.first(),insight=first.locator('[data-chart-insight]');
     await insight.locator('summary').click();await expect(insight).toHaveAttribute('open','');
     const fit=await first.evaluate(card=>{
      const b=card.getBoundingClientRect(),d=card.querySelector('[data-chart-insight]').getBoundingClientRect();
      return d.left>=b.left-1&&d.right<=b.right+1;
     });expect(fit).toBe(true);
     await insight.locator('summary').click();
     const composer=await page.locator('[data-refinement-composer]').boundingBox(),plot=await first.boundingBox();
     const overlap=composer&&plot&&Math.min(composer.x+composer.width,plot.x+plot.width)>Math.max(composer.x,plot.x)+1&&Math.min(composer.y+composer.height,plot.y+plot.height)>Math.max(composer.y,plot.y)+1;
     expect(Boolean(overlap)).toBe(false);
     expect(JSON.stringify(report.conclusion)).toBe(conclusion);expect(analytic.length-before).toBe(0);
     record.breakpoints.push({width,insight_within_card:fit,composer_overlaps_plot:Boolean(overlap),drawer:record.drawer_breakpoints.find(r=>r.width===width).box});
     await page.screenshot({path:`${out}/${id}-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});
    const savedResponse=await ctx.request.post(`${base}/api/reports/saved`,{headers:{Origin:base},data:{title:`Nghiệm thu Codex ${run}`,sql_query:'',query_type:'ai',module_config:{session_id:report.session_id,revision:report.revision}}});
    expect(savedResponse.ok()).toBe(true);const saved=await savedResponse.json();
    const reopenedResponse=await ctx.request.get(`${base}/api/reports/saved/${saved.id}`);expect(reopenedResponse.ok()).toBe(true);
    const reopened=(await reopenedResponse.json()).module_config;
    for(const field of ['revision','charts','conclusion','answer_requirements','goal_provenance'])expect(reopened[field]).toEqual(report[field]);
    const exported=await ctx.request.post(`${base}/api/reports/export-docx`,{headers:{Origin:base},timeout:120000,
      data:{report_data:{session_id:report.session_id,revision:report.revision},save_to_db:false}});
    expect(exported.ok()).toBe(true);expect(exported.headers()['content-type']).toContain('wordprocessingml');
    const bytes=await exported.body();writeFileSync(`${out}/${id}.docx`,bytes);
    record.saved_export={saved_id:saved.id,source_session:report.session_id,revision:report.revision,export_bytes:bytes.length,
      reopened_fields_equal:['revision','charts','conclusion','answer_requirements','goal_provenance'],export_http:exported.status()};
    writeFileSync(`${out}/${id}-reopened.json`,JSON.stringify(reopened,null,2));
   }
   writeFileSync(`${out}/${id}-report.json`,JSON.stringify(report,null,2));
   Object.assign(record,{status:'PASS',payload,charts:report.charts.length,queries:report.analytical_queries.length,
    quality:report.quality_assessment.status,explanations: facts,analytic_requests:analytic,explanation_new_requests:analytic.length-before,
    provider_calls:report.diagnostics?.provider_call_count||0,session_id:report.session_id,revision:report.revision});
   record.completion_status=report.completion_status;record.outcome=report.outcome;
  }catch(error){record.status='FAIL';record.error=String(error);record.payload=payload;
   if(report)writeFileSync(`${out}/${id}-failed-report.json`,JSON.stringify(report,null,2));
   await page.screenshot({path:`${out}/${id}-failed.png`,fullPage:true}).catch(()=>{});
  }finally{page.off('request',onRequest);page.off('response',onResponse);records.push(record);writeFileSync(`${out}/receipt.json`,JSON.stringify(records,null,2));console.log(JSON.stringify({id,status:record.status,error:record.error,charts:record.charts}));}
 }
}finally{await browser.close();}
process.exitCode=records.length!==(only?1:12)||records.some(r=>r.status!=='PASS')?1:0;
