import {test,expect} from '@playwright/test';
import {mockApi,openAssistant,READY_PREFLIGHT,REPORT,deferred} from './helpers';

const unresolved=(raw='qzxnv')=>({...READY_PREFLIGHT,can_submit:false,state:'NEEDS_INPUT',state_label:'Cần bổ sung thông tin',
  input_validation:{slots:[{kind:'entity',dimension:'city',label:'Tỉnh/thành',state:'PRESENT_UNRESOLVED',raw,reason:'input_entity_unresolved'}]},
  findings:[{level:'block',code:'input_entity_unresolved',message:`Chưa xác minh được tỉnh “${raw}”.`}]});

test('fresh payload, pending, stale response, network error and IME cannot submit; correcting name enables exactly one job',async({page})=>{
  const api=await mockApi(page);let pending:any=null;
  api.on('/ai/preflight',async(route,body)=>{
    if(body.question.includes('qzxnv'))return route.fulfill({json:unresolved()});
    if(body.question.includes('chờ')){pending=deferred();return route.fulfill({json:await pending.promise});}
    if(body.question.includes('mất kết nối'))return route.fulfill({status:503,json:{detail:'Tạm thời chưa kiểm tra được'}});
    return route.fulfill({json:READY_PREFLIGHT});
  });
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{state:'completed',job_id:'valid-input',result:REPORT('INPUT')}}));
  await openAssistant(page);
  const input=page.getByRole('textbox',{name:'Câu hỏi phân tích'}),submit=page.getByRole('button',{name:'Phân tích',exact:true});
  await input.fill('doanh thu tỉnh qzxnv');await expect(submit).toBeDisabled();
  await expect(page.locator('[data-preflight]')).toContainText('chưa xác minh');
  await expect(page.locator('[data-detected-scope]')).toContainText('qzxnv');
  await input.press('Enter');expect(api.calls['/api/ai/analysis-jobs']||[]).toHaveLength(0);
  await input.fill('doanh thu chờ');await expect.poll(()=>Boolean(pending)).toBe(true);await expect(submit).toBeDisabled();
  await input.fill('doanh thu tỉnh qzxnv');pending.resolve(READY_PREFLIGHT);
  await expect(page.locator('[data-preflight]')).toContainText('chưa xác minh');await expect(submit).toBeDisabled();
  await input.fill('doanh thu mất kết nối');await expect(page.locator('[data-preflight]')).toContainText('kiểm tra lại');await expect(submit).toBeDisabled();
  await input.fill('doanh thu Hà Nội');await expect(submit).toBeEnabled();
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});
  expect(api.calls['/api/ai/analysis-jobs']||[]).toHaveLength(0);
  await submit.click();await expect.poll(()=>api.calls['/api/ai/analysis-jobs']?.length||0).toBe(1);
});

test('invalid refinement keeps draft and report, checks locally while typing, then applies only current validated text',async({page})=>{
  const api=await mockApi(page);
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{state:'completed',job_id:'valid-refine',result:REPORT('REFINE',{analysis_spec:{}})}}));
  api.on('/ai/refinement-preflight',(route,body)=>route.fulfill({json:body.feedback.includes('qzxnv')?unresolved():{can_submit:true,findings:[]}}));
  api.on('/ai/refine-report',route=>route.fulfill({json:REPORT('REFINE',{revision:2,analysis_spec:{},assistant_reply:'Đã lọc Hà Nội'})}));
  await openAssistant(page);await page.locator('textarea').first().fill('doanh thu tháng 9 năm 2026');await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const composer=page.locator('[data-refinement-composer]'),input=composer.getByRole('textbox');
  await input.fill('Chỉ lọc tỉnh qzxnv');await expect(composer).toContainText('Chưa xác minh được');
  await expect(composer.getByRole('button',{name:/Áp dụng điều chỉnh/})).toBeDisabled();
  await input.press('Enter');expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);
  await expect(input).toHaveValue('Chỉ lọc tỉnh qzxnv');await expect(composer).toContainText('Bản báo cáo 1');
  await input.fill('Chỉ lọc Hà Nội');await expect(composer.getByRole('button',{name:/Áp dụng điều chỉnh/})).toBeEnabled();await input.press('Enter');
  await expect(composer).toContainText('Bản báo cáo 2');expect(api.calls['/api/ai/refine-report']).toHaveLength(1);
});
