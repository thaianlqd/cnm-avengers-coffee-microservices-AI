import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi, REPORT, deferred } from './helpers';

const metadata = JSON.parse(readFileSync(new URL('../../../analytics-api/metadata/semantic_catalog.json', import.meta.url), 'utf8'));
const dashboards = metadata.analysis_registry.workspace.dashboard_templates.map((t:any) => ({ ...t, requirements: undefined, panel_count: t.requirements.length, status: 'healthy', scope_types: [{ id: 'city', label: 'Tỉnh/thành', values: ['Hà Nội','Hồ Chí Minh','Đà Nẵng'], searchable: false }] }));
const session = { authenticated: true, identity: 'hub-discovery-test', role: 'ADMIN', permissions: ['analytics.read','reports.save','reports.export','system.read'], expires_at: 4000000000 };

const cities = [ { label: 'Hà Nội', value: 10000000 }, { label: 'Hồ Chí Minh', value: 20000000 }, { label: 'Đà Nẵng', value: 0 }, { label: 'Chưa xác định', value: 7000000 }, { label: 'Cần Thơ', value: null } ];
const charts = [
  { id: 'city_revenue', title: 'Doanh thu theo tỉnh/thành', x_field: 'city', x_label: 'Tỉnh/thành', metric: 'store_revenue', chart_type: 'bar', unit: 'VND', selection: 'complete', data: cities },
  { id: 'city_rating', title: 'Điểm đánh giá theo tỉnh/thành', x_field: 'city', x_label: 'Tỉnh/thành', metric: 'avg_store_rating', chart_type: 'bar', unit: 'điểm', selection: 'complete', data: [{ label: 'Hà Nội', value: 4.5 }, { label: 'Hồ Chí Minh', value: 3.8 }] },
  { id: 'city_sale', title: 'Khả dụng theo tỉnh/thành', x_field: 'city', x_label: 'Tỉnh/thành', metric: 'paused_sale_positions', metrics: ['paused_sale_positions','sale_positions'], chart_type: 'grouped_bar', unit: 'vị trí', selection: 'complete', series: [{ key: 'series_1', label: 'Vị trí tạm ngừng' }, { key: 'series_2', label: 'Vị trí bán' }], data: [{ label: 'Hà Nội', series_1: 2, series_2: 20 }, { label: 'Đà Nẵng', series_1: 0, series_2: 12 }] },
];

async function setup(page:any) {
  await page.route(/(tiles\.openfreemap\.org\/styles\/|\/map-styles\/avengers-streets\.json)/, route => route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eef4f8'}}]}}));
  const api = await mockApi(page);
  api.on('/auth/session', route => route.fulfill({ json: session }));
  api.on('/ai/dashboards', route => route.fulfill({ json: { dashboards } }));
  api.on('/ai/analysis-jobs', (route,body) => route.fulfill({ json: { state: 'completed', job_id: 'geo', result: REPORT('GEO', {
    charts: body.analysis_scope?.filters?.length ? [{ ...charts[0], data: cities.filter(c => c.label === body.analysis_scope.filters[0].value[0]) }] : charts,
    provenance: { dashboard_template: { id: body.dashboard_id } },
  }) } }));
  return api;
}

test('hub searches the full preset catalog without accents, discovers feature types and connects header search', async ({ page }) => {
  const api = await setup(page);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto('/'); await page.getByRole('button', { name: 'Báo cáo & Phân tích', exact: true }).click();
  const hub = page.locator('[data-dashboard-hub]');
  await expect(hub).toContainText(`${dashboards.length} bài toán nghiệp vụ`);
  await expect(hub.locator('h2')).toHaveCount(12);
  expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill('TOPPING');
  await expect(hub.locator('h2')).toHaveCount(1);
  await expect(hub.locator('h2')).toContainText('Topping');
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill('diem danh gia');
  await expect(hub.locator('h2')).toHaveCount(5);
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill('');
  await page.getByRole('button', { name: 'Bản đồ', exact: true }).click();
  await expect(hub.locator('h2')).toHaveCount(12);
  await expect(hub.getByRole('status').filter({hasText:'bài toán phù hợp'})).toContainText('19 bài toán phù hợp');
  await page.screenshot({ path: '/tmp/dp-hub-map-discovery.png', fullPage: true });
  await page.getByRole('heading', { name: 'Bản đồ doanh thu & đơn hàng', exact: true }).click();
  await expect(page.locator('[data-geographic-report]')).toBeVisible();
  const header = page.getByRole('textbox', { name: 'Tìm bài toán phân tích toàn hệ thống' });
  await header.fill('vi chu kiosk'); await header.press('Enter');
  await expect(hub).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Tìm dashboard' })).toHaveValue('vi chu kiosk');
  await expect(hub.locator('h2')).toHaveCount(1);
  await expect(hub.locator('h2')).toContainText('Kiosk: ví chủ & giá bán');
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('map keeps unknown/missing and zero distinct, handles metric series, exports and stages governed scopes', async ({ page }) => {
  const api = await setup(page);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto('/'); await page.getByRole('button', { name: 'Báo cáo & Phân tích', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill('D36');
  await page.getByRole('heading', { name: 'Bản đồ doanh thu & đơn hàng', exact: true }).click();
  const map = page.locator('[data-geographic-report]');
  await expect(map.locator('[data-province-boundary]')).toHaveCount(63);
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(3);
  await expect(map).toContainText('2 dòng chưa thể tô lên địa giới');
  await expect(map).toContainText('Chưa xác định');
  await expect(map).toContainText('Chưa có giá trị');
  await map.locator('button').filter({hasText:'Hà Nội'}).click();
  await map.getByRole('button', { name: 'Phóng to bản đồ' }).click();
  await expect(map.locator('[data-province-map]')).not.toHaveAttribute('data-map-camera','country');
  await map.getByRole('button', { name: 'Toàn cảnh', exact: true }).click();
  await expect(map.locator('svg.province-map-fallback')).toHaveAttribute('viewBox', '0 0 600 500');
  await map.getByRole('combobox', { name: 'Chỉ số trên bản đồ' }).selectOption('city_rating');
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(2);
  await expect(map).toContainText('4,5');
  await map.getByRole('combobox', { name: 'Chỉ số trên bản đồ' }).selectOption('city_sale:series_1');
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(2);
  await expect(map).toContainText('Vị trí tạm ngừng');
  await map.getByRole('combobox', { name: 'Chỉ số trên bản đồ' }).selectOption('city_revenue');
  const downloadEvent = page.waitForEvent('download'); await map.getByRole('button', { name: 'Xuất SVG', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('ban-do-tinh-thanh.svg');
  await map.getByRole('searchbox', { name: 'Tìm địa bàn trên bản đồ' }).fill('ha noi');
  await map.locator('button').filter({ hasText: 'Hà Nội' }).click();
  await map.getByRole('button', { name: 'Chọn làm phạm vi dashboard' }).click();
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  await expect(page.getByRole('combobox', { name: 'Loại phạm vi dashboard' })).toHaveValue('city');
  await page.screenshot({ path: '/tmp/dp-hub-geographic-report.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/dp-hub-geographic-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Cập nhật dashboard', exact: true }).click();
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(1);
  expect(api.calls['/api/ai/analysis-jobs'][1].analysis_scope.filters).toEqual([{ dimension: 'city', operator: 'in', value: ['Hà Nội'] }]);
});

test('saved reports expose publishing, explain legacy restrictions, prevent duplicate posts and refresh the hub', async ({ page }) => {
  const api = await setup(page), pending = deferred();
  let published = false;
  const custom = { id: 'U_hub_fixture123', title: 'Doanh thu địa bàn của tôi', version: '1.0.0', category: 'Kinh doanh', description: 'Phân tích doanh thu theo địa bàn.', default_time: '30d', custom: true, status: 'healthy', panel_count: 2 };
  api.on('/ai/dashboards', route => route.fulfill({ json: { dashboards: published ? [...dashboards, custom] : dashboards } }));
  const owned = { id: 'rpt_owned', title: 'Báo cáo cá nhân đã xác minh', created_by: 'account:' + 'a'.repeat(64), category: 'ai_module', module_config: { semantic_intent: { requirements: [{ id: 'sales' }] } } };
  const legacy = { id: 'rpt_legacy', title: 'Bản lưu cũ', created_by: 'legacy', category: 'ai_module', module_config: null };
  api.on('/reports/saved', route => route.fulfill({ json: { reports: [owned, legacy] } }));
  api.on('/reports/saved/rpt_owned/hub', async route => { await pending.promise; published = true; await route.fulfill({ json: { status: 'success', dashboard: custom } }); });
  api.on('/reports/saved/rpt_owned/hub-suggestion', route => route.fulfill({ json: { eligible: true, suggested_title: custom.title, suggested_category: 'Kinh doanh', suggested_description: custom.description, categories: ['Kinh doanh','Vận hành'], panels: [{ id: 'sales', goal: 'Doanh thu địa bàn', analysis_kind: 'aggregate' }] } }));
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto('/'); await page.getByRole('button', { name: 'Quản lý Báo cáo', exact: true }).click();
  const buttons = page.locator('[data-hub-publish-button]');
  await expect(buttons).toHaveCount(2); await expect(buttons.nth(0)).toBeEnabled(); await expect(buttons.nth(1)).toBeDisabled();
  await expect(page.locator('[data-hub-publish-help]')).toContainText('Bản lưu cũ chỉ đọc');
  await buttons.first().click();
  const dialog = page.getByRole('dialog', { name: 'Thêm bài toán vào Báo cáo & Phân tích' });
  await expect(dialog.getByRole('textbox', { name: 'Tên bài toán (gợi ý)' })).toHaveValue(custom.title);
  expect(api.calls['/api/reports/saved/rpt_owned/hub']).toBeUndefined();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(buttons.first()).toBeFocused();
  await buttons.first().click();
  await expect(dialog.getByRole('button', { name: 'Thêm bài toán', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Thêm bài toán', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Đang thêm…', exact: true })).toBeDisabled();
  expect(api.calls['/api/reports/saved/rpt_owned/hub']).toHaveLength(1);
  pending.resolve(null); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở danh mục bài toán ↗', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill(custom.title);
  await expect(page.locator('[data-hub-custom]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: custom.title, exact: true })).toBeVisible();
});

test('large geographic results page the detail list while retaining every map observation', async ({ page }) => {
  const api = await setup(page);
  const geography = JSON.parse(readFileSync(new URL('../../src/data/vietnamGeography.json', import.meta.url), 'utf8'));
  const rows = geography.cities.slice(0,55).map((city:any,index:number) => ({ label: city.label, value: (index + 1) * 1000000 }));
  api.on('/ai/analysis-jobs', route => route.fulfill({ json: { state: 'completed', job_id: 'large-geo', result: REPORT('LARGE_GEO', {
    charts: [{ ...charts[0], data: rows }], provenance: { dashboard_template: { id: 'D36' } },
  }) } }));
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto('/'); await page.getByRole('button', { name: 'Báo cáo & Phân tích', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm dashboard' }).fill('D36');
  await page.getByRole('heading', { name: 'Bản đồ doanh thu & đơn hàng', exact: true }).click();
  const map = page.locator('[data-geographic-report]');
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(55);
  const pagination = map.getByRole('navigation', { name: 'Địa bàn bản đồ' });
  await expect(pagination).toContainText('1–8 / 55');
  await pagination.getByRole('button', { name: 'Địa bàn bản đồ: trang sau', exact: true }).click();
  await expect(pagination).toContainText('9–16 / 55');
  await map.getByRole('searchbox', { name: 'Tìm địa bàn trên bản đồ' }).fill(rows[54].label);
  await expect(pagination).toHaveCount(0);
  await map.locator('button').filter({ hasText: rows[54].label }).click();
  await map.getByRole('button', { name: 'Phóng to bản đồ' }).click();
  await expect(map.locator('[data-province-boundary][data-has-value="true"]')).toHaveCount(55);
  await page.screenshot({ path: '/tmp/dp-hub-geographic-large.png', fullPage: true });
});
