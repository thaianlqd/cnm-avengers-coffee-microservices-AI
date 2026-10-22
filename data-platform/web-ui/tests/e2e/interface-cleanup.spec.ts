import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi } from './helpers';

const session={authenticated:true,identity:'fixture-admin:visual-cleanup',role:'ADMIN',permissions:['analytics.read','system.read','warehouse.read','sql.explore'],expires_at:4000000000};

test('architecture filters, zooms, exports and exits fullscreen without starting runtime work',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',r=>r.fulfill({json:session}));
  api.on('/platform/lineage',r=>r.fulfill({json:{layers:[]}}));
  await page.goto('/');await page.getByRole('button',{name:'Kiến trúc hệ thống',exact:true}).click();
  await expect(page.locator('[data-architecture-node]')).toHaveCount(34);
  await page.getByLabel('Lọc luồng kiến trúc').selectOption('ai');
  await expect(page.locator('[data-architecture-node]')).toHaveCount(6);
  await expect(page.locator('[data-architecture-node="producer"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Phóng to sơ đồ',exact:true}).click();
  await page.getByLabel('Nhãn kết nối',{exact:true}).check();
  await page.getByLabel('Nổi luồng liên quan',{exact:true}).check();
  await page.getByRole('button',{name:'Toàn màn hình',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Sơ đồ kiến trúc toàn màn hình'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Toàn màn hình',exact:true})).toBeFocused();
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Tải SVG',exact:true}).click();
  const download=await promise, exported=readFileSync((await download.path())!,'utf8');
  expect(download.suggestedFilename()).toBe('avengers-architecture-ai.svg');
  expect(exported).toContain('AI hiểu ý');expect(exported).not.toContain('data-architecture-node="producer"');
  await page.getByLabel('Lọc luồng kiến trúc').selectOption('events');
  await page.locator('[data-architecture-node="lake"]').click();
  await expect(page.getByRole('region',{name:'Chi tiết thành phần'})).toContainText('không tự trở thành input snapshot batch');
  await page.getByRole('tab',{name:'Luồng A–Z',exact:true}).click();
  await expect(page.getByText('Polling → Kafka → Consumer → Bronze sự kiện; lỗi được cách ly.',{exact:true})).toBeVisible();
  await page.getByLabel('Lọc luồng kiến trúc').selectOption('all');
  await page.getByRole('tab',{name:'Thành phần',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Thành phần kiến trúc'});
  await nav.getByRole('button',{name:'Thành phần kiến trúc: trang sau',exact:true}).click();
  await page.getByLabel('Tìm thành phần kiến trúc').fill('Compiler');await expect(nav).toContainText('1–2 / 2');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(Object.keys(api.calls).filter(path=>/analysis-jobs|train|trigger|replay|execute|export/.test(path))).toEqual([]);
});

test('admin pages loaded logs and resets search without refetching',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',r=>r.fulfill({json:session}));
  api.on('/system/users',r=>r.fulfill({json:{users:[],roles:[]}}));
  api.on('/system/logs',r=>r.fulfill({json:{logs:Array.from({length:37},(_,i)=>({time:`20/10/2026 15:${String(i).padStart(2,'0')}`,user:'fixture-worker',action:`Sync fixture ${i+1}`,status:i%3?'Thành công':'Thất bại',duration_seconds:i+1}))}}));
  await page.goto('/');await page.getByRole('button',{name:'Quản trị hệ thống',exact:true}).click();
  await page.getByRole('tab',{name:'Nhật ký đồng bộ',exact:true}).click();
  await expect(page.locator('[data-system-admin] tbody tr')).toHaveCount(10);
  const calls=api.calls['/api/system/logs'].length;
  const nav=page.getByRole('navigation',{name:'Phân trang nhật ký đồng bộ'});
  await nav.getByRole('button',{name:'Phân trang nhật ký đồng bộ: trang 4',exact:true}).click();
  await expect(page.locator('[data-system-admin] tbody tr')).toHaveCount(7);
  await page.getByLabel('Tìm nhật ký đồng bộ').fill('fixture 37');
  await expect(page.locator('[data-system-admin] tbody tr')).toHaveCount(1);await expect(nav).toContainText('1–1 / 1');
  await page.getByLabel('Tìm nhật ký đồng bộ').fill('');await expect(nav).toContainText('1–10 / 37');
  await nav.getByLabel('Phân trang nhật ký đồng bộ: số mục mỗi trang').selectOption('25');
  await expect(page.locator('[data-system-admin] tbody tr')).toHaveCount(25);
  expect(api.calls['/api/system/logs']).toHaveLength(calls);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('explorer pages results and exports every loaded row',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',r=>r.fulfill({json:session}));
  const rows=Array.from({length:57},(_,i)=>({metric_id:i+1,label:`Fixture row ${i+1}`}));
  api.on('/warehouse/tables',r=>r.fulfill({json:{tables:Array.from({length:23},(_,i)=>({name:`silver.fixture_${i+1}`,table_name:`fixture_${i+1}`,schema:'silver',display_name:`Bảng fixture ${i+1}`,category:'Fixture',description:'Dữ liệu kiểm tra',columns:[{name:'metric_id',type:'integer'}]})),sample_queries:[]}}));
  api.on('/api/query',r=>r.fulfill({json:{columns:['metric_id','label'],data:rows,count:57,duration_ms:2}}));
  await page.goto('/');await page.getByRole('button',{name:'Khám phá dữ liệu',exact:true}).click();
  const catalog=page.getByRole('navigation',{name:'Danh mục bảng'});await expect(catalog).toContainText('1–10 / 23');
  await catalog.getByRole('button',{name:'Danh mục bảng: trang sau',exact:true}).click();await expect(catalog).toContainText('11–20 / 23');
  await page.getByPlaceholder('Tìm bảng, cột hoặc chủ đề...').fill('fixture_23');await expect(catalog).toContainText('1–1 / 1');
  await page.locator('textarea').fill('SELECT metric_id, label FROM silver.fixture_1');
  await page.getByRole('button',{name:'Chạy truy vấn',exact:true}).click();
  const pager=page.getByRole('navigation',{name:'Kết quả truy vấn'});await expect(pager).toContainText('1–25 / 57');
  await pager.getByRole('button',{name:'Kết quả truy vấn: trang 3',exact:true}).click();await expect(pager).toContainText('51–57 / 57');
  await expect(page.getByRole('cell',{name:'Fixture row 57',exact:true})).toBeVisible();
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất CSV',exact:true}).click();
  const csv=readFileSync((await (await promise).path())!,'utf8');
  expect(csv).toContain('Fixture row 1');expect(csv).toContain('Fixture row 57');expect(csv.split('\n')).toHaveLength(58);
  expect(api.calls['/api/query']).toHaveLength(1);
});

test('saved report pagination preserves ownership and server loading',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',r=>r.fulfill({json:session}));
  api.on('/reports/saved',r=>r.fulfill({json:{reports:Array.from({length:23},(_,i)=>({id:`report-${i}`,title:`Bản lưu fixture ${i+1}`,created_at:'2026-10-20T01:00:00Z',created_by:'legacy',description:'Fixture lưu trữ'}))}}));
  await page.goto('/');await page.getByRole('button',{name:'Quản lý Báo cáo',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Báo cáo đã lưu'});await expect(nav).toContainText('1–10 / 23');
  const calls=api.calls['/api/reports/saved'].length;
  await nav.getByRole('button',{name:'Báo cáo đã lưu: trang 3',exact:true}).click();
  await expect(page.getByText('Bản lưu fixture 23',{exact:true})).toBeVisible();await expect(nav).toContainText('21–23 / 23');
  expect(api.calls['/api/reports/saved']).toHaveLength(calls);expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
});
