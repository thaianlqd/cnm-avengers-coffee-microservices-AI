import {test,expect} from '@playwright/test';
import {mockApi,REPORT,openAssistant,deferred} from './helpers';

async function finished(page:any){
  const api=await mockApi(page);
  api.on('/ai/analysis-jobs',(route:any)=>route.fulfill({json:{state:'completed',job_id:'composer',result:REPORT('COMPOSER',{analysis_spec:{},charts:[{id:'sales',chart_type:'line',title:'Doanh thu theo tuần',metric:'revenue',x_field:'week',unit:'VND',data:[{label:'Tuần 1',value:100},{label:'Tuần 2',value:200}]}]})}}));
  await openAssistant(page);await page.locator('textarea').first().fill('Doanh thu theo tuần trong tháng 9');await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  const composer=page.locator('[data-refinement-composer]');await expect(composer).toBeVisible();return {api,composer};
}

test('top composer fills examples without running, applies one revision and preserves the report on HTTP failure',async({page})=>{
  const {api,composer}=await finished(page),gate=deferred();
  api.on('/ai/refine-report',async(route:any)=>route.fulfill({json:await gate.promise}));
  expect(await composer.evaluate(e=>e.getBoundingClientRect().top)).toBeLessThan(await page.locator('[data-dashboard-chart]').first().evaluate(e=>e.getBoundingClientRect().top));
  await composer.getByRole('button',{name:'Đổi cách nhóm',exact:true}).click();
  expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);
  const input=composer.getByRole('textbox',{name:'Yêu cầu điều chỉnh phân tích'});
  const example=await input.inputValue();await input.fill('dsfdsfsdfsd');await expect(composer.getByRole('button',{name:/Áp dụng điều chỉnh/})).toBeDisabled();await expect(composer).toContainText('Yêu cầu chưa rõ');await input.press('Enter');expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);await input.fill(example);
  await expect(input).toHaveValue(/tỉnh\/thành/);
  await expect(composer.getByRole('button',{name:/Áp dụng điều chỉnh/})).toBeEnabled();
  await input.press('Enter');await expect(composer).toContainText('Đang kiểm tra yêu cầu');
  await expect(page.getByText('Doanh thu theo tuần',{exact:true}).first()).toBeVisible();
  expect(api.calls['/api/ai/refine-report']).toHaveLength(1);
  expect(api.calls['/api/ai/refine-report'][0]).toMatchObject({session_id:'sess-COMPOSER',current_report:{revision:1}});
  gate.resolve(REPORT('COMPOSER',{revision:2,analysis_spec:{},assistant_reply:'Đã nhóm theo tỉnh',charts:[{id:'cities',chart_type:'bar',title:'Doanh thu theo tỉnh',metric:'revenue',x_field:'city',unit:'VND',data:[{label:'Hà Nội',value:300}]}]}));
  await expect(composer).toContainText('Đã áp dụng điều chỉnh · bản báo cáo 2');
  await expect(page.getByText('Doanh thu theo tỉnh',{exact:true}).first()).toBeVisible();
  api.on('/ai/refine-report',(route:any)=>route.fulfill({status:409,json:{detail:'Báo cáo đã thay đổi. Hãy mở phiên hiện tại.'}}));
  await input.fill('Chỉ lọc Đà Nẵng');await expect(composer.getByRole('button',{name:/Áp dụng điều chỉnh/})).toBeEnabled();await input.press('Enter');
  await expect(composer.getByRole('alert')).toContainText('Báo cáo đã thay đổi');
  await expect(composer).toContainText('Bản báo cáo 2');
  await expect(page.getByText('Doanh thu theo tỉnh',{exact:true}).first()).toBeVisible();
  await expect(input).toHaveValue('Chỉ lọc Đà Nẵng');
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
