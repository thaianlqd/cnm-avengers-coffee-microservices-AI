import { test, expect } from '@playwright/test';
import { mockApi, REPORT } from './helpers';

const session = { authenticated: true, identity: 'layout-admin', role: 'ADMIN', permissions: ['analytics.read', 'warehouse.read', 'system.read'], expires_at: 4000000000 };
const ranking = { id: 'branches', title: 'Top 10 cửa hàng theo doanh thu', chart_type: 'horizontal_bar', unit: 'VND', selection: 'Top N', data: Array.from({ length: 10 }, (_, i) => ({ label: `Avengers Coffee · Chi nhánh Nguyễn Văn Linh ${i + 1}`, value: 9000000 - i * 200000 })) };
const sparse = { id: 'weekly', title: 'Doanh thu theo tuần', chart_type: 'line', unit: 'VND', data: [{ label: '2026-09-21', value: 3800000 }, { label: '2026-09-28', value: 2600000 }] };
const compact = [
  { id: 'channel', title: 'Cơ cấu kênh bán', chart_type: 'donut', unit: 'đơn', data: [{ label: 'Tại quán', value: 120 }, { label: 'Giao hàng', value: 80 }, { label: 'Mang đi', value: 60 }, { label: 'Kiosk', value: 40 }] },
  { id: 'types', title: 'Doanh thu theo loại điểm bán', chart_type: 'bar', unit: 'VND', data: [{ label: 'Kiosk nhượng quyền', value: 5100000 }, { label: 'Kiosk vệ tinh', value: 1300000 }] },
  { id: 'payments', title: 'Đơn hàng theo thanh toán', chart_type: 'bar', unit: 'đơn', data: [{ label: 'Tiền mặt', value: 120 }, { label: 'QR', value: 90 }, { label: 'Ví điện tử', value: 40 }] },
];

async function openDashboard(page: any, charts: any[]) {
  const api = await mockApi(page);
  api.on('/auth/session', route => route.fulfill({ json: session }));
  api.on('/ai/dashboards', route => route.fulfill({ json: { dashboards: [{ id: 'D04', title: 'Kiosk', version: '1.0', category: 'Vận hành', default_time: '30d', panel_count: charts.length }] } }));
  api.on('/ai/analysis-jobs', route => route.fulfill({ json: { state: 'completed', job_id: 'layout', result: REPORT('LAYOUT', { charts, provenance: { dashboard_template: 'D04' } }) } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Báo cáo & Phân tích', exact: true }).click();
  await page.getByRole('heading', { name: 'Kiosk', exact: true }).click();
  await expect(page.locator('[data-dashboard-chart]')).toHaveCount(charts.length);
}

test('kiosk gives dense rankings more width than a sparse trend and compact comparison', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await openDashboard(page, [sparse, ranking, { ...ranking, id: 'orders', title: 'Số đơn theo chi nhánh' }, compact[1]]);
  await expect(page.locator('[data-grid-columns]')).toHaveAttribute('data-grid-columns', '3');
  const cards = page.locator('[data-dashboard-chart]');
  expect(await cards.evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-chart-span'))))).toEqual([3.6, 8.4, 8.4, 3.6]);
  const a = (await cards.nth(0).boundingBox())!, b = (await cards.nth(1).boundingBox())!;
  expect(b.width / a.width).toBeGreaterThan(1.9);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  await expect(cards.nth(1).getByText(ranking.data[9].label, { exact: false })).toBeVisible();
  expect(await cards.nth(1).locator('[data-chart-viewport]').evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/dp-layout-kiosk.png', fullPage: true });
});

test('reports mix two and three charts, retain controls on resize and keep expanded details local', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  const trend = { ...sparse, data: Array.from({ length: 14 }, (_, i) => ({ label: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 1000000 + i * 50000 })) };
  await openDashboard(page, [trend, ranking, ...compact]);
  const cards = page.locator('[data-dashboard-chart]');
  await expect(cards.nth(4)).toHaveAttribute('data-chart-span', '4');
  expect(await cards.evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-chart-span'))))).toEqual([4.8, 7.2, 4, 4, 4]);
  const secondRow = await Promise.all([2, 3, 4].map(i => cards.nth(i).boundingBox()));
  expect(Math.max(...secondRow.map(b => b!.y)) - Math.min(...secondRow.map(b => b!.y))).toBeLessThan(2);
  for (const card of secondRow) expect(card!.width).toBeGreaterThan(320);
  const neighborHeight = (await cards.nth(1).boundingBox())!.height;
  await cards.first().getByText('Chi tiết biểu đồ', { exact: true }).click();
  await cards.first().getByText('Cách đọc biểu đồ', { exact: true }).click();
  expect((await cards.nth(1).boundingBox())!.height).toBeGreaterThanOrEqual(neighborHeight);
  await expect.poll(async()=>Math.abs((await cards.nth(1).boundingBox())!.height-(await cards.first().boundingBox())!.height)).toBeLessThan(1);
  await expect(cards.nth(1).locator('[data-chart-details]')).not.toHaveAttribute('open','');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(page.locator('[data-grid-columns]')).toHaveAttribute('data-grid-columns', '2');
  await expect(cards.first().locator('[data-chart-details]')).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 1680, height: 1050 });
  await expect(cards.nth(4)).toHaveAttribute('data-chart-span', '4');
  await cards.first().getByText('Chi tiết biểu đồ', { exact: true }).click();
  await page.screenshot({ path: '/tmp/dp-layout-report-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-grid-columns]')).toHaveAttribute('data-grid-columns', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (let i = 1; i < 5; i++) expect((await cards.nth(i).boundingBox())!.y).toBeGreaterThan((await cards.nth(i - 1).boundingBox())!.y);
  await page.screenshot({ path: '/tmp/dp-layout-report-mobile.png', fullPage: true });
});

test('overview uses a leading trend, three complementary panels and a full-width transaction table', async ({ page }) => {
  const api = await mockApi(page);
  api.on('/auth/session', route => route.fulfill({ json: session }));
  api.on('/marts/all', route => route.fulfill({ json: {
    kpi: { revenue_all_time: 174347500, total_orders_all_time: 1696, new_customers: 305, aov: 109584 },
    revenue_daily: Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, revenue: 5000000 + (i % 4) * 800000 })),
    parent_category_sales: ['Cà phê', 'Trà', 'Bánh', 'Đồ uống khác'].map((category_name, i) => ({ category_name, revenue: 20000000 - i * 4000000 })),
    top_branches: ranking.data.slice(0, 5).map(r => ({ branch_name: r.label, revenue: r.value })),
    weekday_sales: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label, i) => ({ label, revenue: 5000000 + i * 2000000 })),
    recent_sales: Array.from({ length: 5 }, (_, i) => ({ order_time: '20/10 14:30', store_name: `Chi nhánh ${i + 1}`, product_name: 'Cà phê sữa đá', quantity: 2, total_amount: 78000 })),
  } }));
  api.on('/stores/overview', route => route.fulfill({ json: { revenue_by_city: ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Cần Thơ'].map((city, i) => ({ city, revenue: 10000000 - i * 1500000 })) } }));
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto('/');
  const overview = page.locator('[data-overview-layout]');
  await expect(overview).toBeVisible();
  const first = (await overview.locator('.overview-trend').boundingBox())!, second = (await overview.locator('.overview-composition').boundingBox())!;
  expect(first.width / second.width).toBeGreaterThan(1.9);
  const panels = await overview.locator('.overview-secondary-grid > div').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().y));
  expect(panels).toHaveLength(3);
  expect(Math.max(...panels) - Math.min(...panels)).toBeLessThan(2);
  expect((await overview.getByRole('table').filter({hasText:'Thời gian'}).boundingBox())!.width).toBeGreaterThan(first.width);
  await expect(overview.getByText('174.347.500 đ', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/dp-layout-overview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await overview.locator('.overview-composition').boundingBox())!.y).toBeGreaterThan((await overview.locator('.overview-trend').boundingBox())!.y);
  await page.screenshot({ path: '/tmp/dp-layout-overview-mobile.png', fullPage: true });
});
