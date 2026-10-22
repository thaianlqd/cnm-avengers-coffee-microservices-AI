import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { mockApi, deferred } from './helpers';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ai-workspace-report.json', import.meta.url)), 'utf8'));
async function open(page: any) {
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:{authenticated:true,identity:'workspace-fixture',role:'ADMIN',permissions:['analytics.read'],expires_at:4000000000}}));
  api.on('/ai/analysis-jobs',route=>route.fulfill({json:{job_id:'workspace',state:'completed',result:fixture}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  await page.locator('textarea').first().fill('Doanh thu theo thành phố tháng 9 năm 2026');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  await expect(page.locator('[data-workspace-filters]')).toBeVisible();
  return api;
}

test('pending selections batch into one semantic revision; old snapshot stays visible until atomic publish',async({page})=>{
  const api=await open(page), waiting=deferred();
  const entries=fixture.interaction_contract.charts.filter((c:any)=>c.selection_behavior==='population_filter');
  api.on('/ai/workspace-revision',async(route,body)=>{
    await waiting.promise;
    const next={...fixture,revision:fixture.revision+1,title:'Revision được áp dụng',interaction_state:{filters:body.filters,drill_path:body.drill_path},
      interaction_contract:{...fixture.interaction_contract,revision:fixture.revision+1}};
    await route.fulfill({json:next});
  });
  const bar=page.locator('[data-workspace-filters]');
  // A chart-local selection and a toolbar selection remain pending together.
  await page.locator('[data-dashboard-chart] select[aria-label^="Lọc nhóm từ"]:enabled').first().selectOption('0');
  for(const c of entries.slice(1,2)) {
    await page.getByLabel('Chiều lọc biểu đồ',{exact:true}).selectOption(c.chart_id);
    await page.getByLabel('Giá trị lọc biểu đồ',{exact:true}).selectOption('0');
    await page.getByRole('button',{name:'Thêm lọc chờ',exact:true}).click();
  }
  expect(api.calls['/api/ai/workspace-revision']||[]).toHaveLength(0);
  await expect(bar.getByText('Bộ lọc chờ áp dụng',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-report-stale]')).toBeVisible();
  await expect(page.locator('[data-applied-filters]')).toContainText(`revision ${fixture.revision}`);
  await expect(page.locator('[data-dashboard-chart]')).toHaveCount(fixture.charts.length);
  expect(api.calls['/api/ai/workspace-revision']).toHaveLength(1);
  const body=api.calls['/api/ai/workspace-revision'][0];
  expect(body.filters.length).toBe(2);expect(body).not.toHaveProperty('sql');expect(body.revision).toBe(fixture.revision);
  waiting.resolve({});
  await expect(page.locator('[data-applied-filters]')).toContainText(`revision ${fixture.revision+1}`);
  await expect(page.locator('[data-report-stale]')).toHaveCount(0);
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);
});

test('governed drill breadcrumb, back/reset and pending chips are keyboard usable without auto submission',async({page})=>{
  const api=await open(page);
  const entry=fixture.interaction_contract.charts.find((c:any)=>c.next_levels.length);
  await page.getByLabel('Chiều lọc biểu đồ',{exact:true}).selectOption(entry.chart_id);
  await page.getByLabel('Giá trị lọc biểu đồ',{exact:true}).selectOption('0');
  await page.getByRole('button',{name:'Đi sâu một cấp',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Đường dẫn chi tiết'})).toContainText(entry.next_levels[0]);
  await page.getByRole('button',{name:'Quay lại một cấp',exact:true}).click();
  await expect(page.getByRole('button',{name:'Quay lại một cấp',exact:true})).toBeDisabled();
  await page.getByLabel('Giá trị lọc biểu đồ',{exact:true}).selectOption('0');
  await page.getByRole('button',{name:'Thêm lọc chờ',exact:true}).click();
  await page.getByRole('button',{name:`Xóa lọc ${entry.dimension_id}`,exact:true}).click();
  await expect(page.getByRole('button',{name:'Áp dụng bộ lọc',exact:true})).toBeDisabled();
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(api.calls['/api/ai/workspace-revision']||[]).toHaveLength(0);
  expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);
});

test('failed revision keeps the approved snapshot and typed filter state',async({page})=>{
  const api=await open(page);
  api.on('/ai/workspace-revision',route=>route.fulfill({json:{status:'error',message:'Nguồn bắt buộc chưa sẵn sàng.'}}));
  await page.getByRole('button',{name:'Làm mới dữ liệu',exact:true}).click();
  await expect(page.locator('[data-workspace-filters] [role="alert"]')).toContainText('Nguồn bắt buộc');
  await expect(page.locator('[data-applied-filters]')).toContainText(`revision ${fixture.revision}`);
  await expect(page.locator('[data-dashboard-chart]')).toHaveCount(fixture.charts.length);
  expect(api.calls['/api/ai/refine-report']||[]).toHaveLength(0);
});
