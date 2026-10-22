import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

// Report produced by the real production pipeline (offline fixture warehouse), not a hand-written JSON.
const report = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cw-compare-report.json', import.meta.url)), 'utf8'));
const rankedReport = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cw-ranking-report.json', import.meta.url)), 'utf8'));
const shots = fileURLToPath(new URL('../../../evaluation/comparison-workspace-20261022/execution/screens/', import.meta.url));
mkdirSync(shots, { recursive: true });

async function open(page: any, result = report) {
  const api = await mockApi(page);
  api.on('/auth/session', route => route.fulfill({ json: { authenticated: true, identity: 'cw-fixture', role: 'ADMIN', permissions: ['analytics.read'], expires_at: 4000000000 } }));
  api.on('/ai/analysis-jobs', route => route.fulfill({ json: { job_id: 'cw', state: 'completed', result } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  await page.locator('textarea').first().fill('so sánh doanh thu thành phố Cần Thơ và thành phố Hải Phòng');
  await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
  await expect(page.locator(result === report ? '[data-view-controls]' : '[data-ranking-ties]').first()).toBeVisible();
  return api;
}

const chartWith = (page: any, dim: string) => page.locator('[data-dashboard-chart]').filter({ has: page.locator('[data-view-controls]') })
  .filter({ hasText: dim });
// Read-only reconciliation/geography/capability requests are not model calls. Count analysis submissions;
// local-mode tests also assert that no workspace revision is submitted.
const aiCalls = (api: any) => Object.entries(api.calls).filter(([p]) =>
  ['/api/ai/analysis-jobs', '/api/ai/text-to-report', '/api/ai/propose-analysis', '/api/ai/generate-report', '/api/ai/refine-report'].includes(p))
  .reduce((n, [, v]) => n + (v as any[]).length, 0);

test('compare → total → single → share → reset keeps data, caption and insight of ONE server variant, 0 extra AI calls', async ({ page }) => {
  const api = await open(page);
  const before = aiCalls(api);
  const card = chartWith(page, 'hình thức nhận hàng').first();
  const spec = report.charts.find((c: any) => (c.dimension_ids || []).includes('order_type'));
  const variant = (pred: (s: any) => boolean) => spec.view_modes.variants.find((v: any) => v.availability === 'available' && pred(v.spec));
  await expect(card.locator('[data-view-mode="compare"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('[data-view-caption]')).toContainText(variant((s: any) => s.mode === 'compare' && !s.value_mode).payload.caption);

  await card.locator('[data-view-mode="total"]').click();
  const total = variant((s: any) => s.mode === 'total' && !s.value_mode);
  await expect(card.locator('[data-view-caption]')).toContainText('Tổng của 2 đối tượng');
  await expect(card).toContainText(total.insight.key_facts[0].text);
  await expect(card).toHaveAttribute('data-chart-rows', String(total.payload.data.length));

  await card.locator('[data-view-mode="single"]').click();
  const members = spec.view_modes.members;
  await card.locator(`[data-view-member="${members[1].key}"]`).click();
  const single = variant((s: any) => s.mode === 'single' && s.member === members[1].key && !s.value_mode);
  await expect(card.locator('[data-view-caption]')).toContainText(`Riêng ${members[1].label}`);
  await expect(card).toContainText(single.insight.key_facts[0].text);

  await card.locator('[data-view-mode="compare"]').click();
  await card.locator('[data-value-mode]').selectOption('member_share');
  const share = variant((s: any) => s.mode === 'compare' && s.value_mode === 'member_share');
  await expect(card.locator('[data-view-caption]')).toContainText('% trong từng đối tượng');
  await expect(card).toContainText(share.insight.key_facts[0].text);
  await expect(card).not.toContainText(`${share.insight.key_facts[0].value} VND`);

  await card.locator('[data-view-reset]').click();
  await expect(card.locator('[data-view-mode="compare"]')).toHaveAttribute('aria-pressed', 'true');
  expect(aiCalls(api)).toBe(before);              // local view switches never call the server or a model
  expect(api.calls['/api/ai/workspace-revision'] || []).toHaveLength(0);
});

test('save carries the chosen server variant ID and leaves the report KPI unchanged', async ({ page }) => {
  const api = await open(page);
  const before = await page.locator('[data-kpi-strip]').textContent();
  const card = chartWith(page, 'hình thức nhận hàng').first();
  await card.locator('[data-view-mode="single"]').click();
  await card.locator(`[data-view-member="${report.comparison_frames[0].members[1].key}"]`).click();
  await expect.poll(() => page.locator('[data-kpi-strip]').textContent()).toBe(before);
  await page.getByRole('button', { name: 'Lưu báo cáo', exact: true }).first().click();
  const submissions = () => (api.calls['/api/reports/saved'] || []).filter((body: any) => body?.module_config);
  await expect.poll(() => submissions().length).toBe(1);
  const payload = submissions()[0].module_config;
  expect(Object.keys(payload.chart_view_choices || {}).length).toBe(1);
  const chartId = Object.keys(payload.chart_view_choices)[0];
  const chart = report.charts.find((c: any) => c.id === chartId);
  expect(chart.view_modes.variants.some((v: any) => v.id === payload.chart_view_choices[chartId] && v.spec.mode === 'single')).toBe(true);
});

test('ranking exposes ties, eligible population and numerator/denominator without an AI call', async ({ page }) => {
  const api = await open(page, rankedReport);
  const before = aiCalls(api);
  const chart = rankedReport.charts.find((c: any) => c.ranking_census);
  await expect(page.locator('[data-ranking-ties]').first()).toContainText(chart.ranking_census.note);
  const exposure = page.locator('[data-chart-exposure]').first();
  await expect(exposure).toBeVisible();
  for (const row of chart.data.filter((r: any) => r.denominator != null)) {
    await expect(exposure).toContainText(`${row.numerator} / ${row.denominator}`);
  }
  expect(aiCalls(api)).toBe(before);
});

test('rapid switching settles on the last choice; keyboard operates every control', async ({ page }) => {
  await open(page);
  const card = chartWith(page, 'tháng').first();
  for (const mode of ['total', 'single', 'compare', 'total', 'single', 'total']) await card.locator(`[data-view-mode="${mode}"]`).click();
  await expect(card.locator('[data-view-mode="total"]')).toHaveAttribute('aria-pressed', 'true');
  await card.locator('[data-view-mode="compare"]').focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('[data-view-mode="compare"]')).toHaveAttribute('aria-pressed', 'true');
});

test('hiding a legend series is explicitly visual and preserves claims, KPI and server calls', async ({ page }) => {
  const api = await open(page);
  const card = chartWith(page, 'tháng').first();
  const claims = await card.locator('[data-chart-insight]').textContent();
  const beforeKpi = await page.locator('[data-kpi-strip]').textContent();
  const beforeCalls = aiCalls(api);
  const beforeCaption = await card.locator('[data-view-caption]').textContent();
  const legend = card.locator('.time-series-legend button').first();
  await legend.click();
  await expect(legend).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('[data-series-visibility]')).toContainText('mẫu số và nhận định giữ nguyên');
  await expect(card.locator('[data-view-caption]')).toHaveText(beforeCaption!);
  expect(await card.locator('[data-chart-insight]').textContent()).toBe(claims);
  expect(await page.locator('[data-kpi-strip]').textContent()).toBe(beforeKpi);
  expect(aiCalls(api)).toBe(beforeCalls);
});

test('apply one member to the whole report goes through the pending global filter, not a local fake revision', async ({ page }) => {
  const api = await open(page);
  const card = chartWith(page, 'hình thức nhận hàng').first();
  await card.locator('[data-view-mode="single"]').click();
  await card.locator('[data-apply-report]').click();
  await expect(page.locator('[data-workspace-filters]')).toContainText('Áp dụng');
  expect(api.calls['/api/ai/workspace-revision'] || []).toHaveLength(0);   // pending until the user applies
});

for (const [w, h] of [[1280, 900], [1440, 900], [1920, 1080], [390, 844]]) {
  test(`layout ${w}px: controls visible, no page overflow, screenshot`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const controls = page.locator('[data-view-controls]').first();
    const closeToast = page.getByRole('button', { name: 'Đóng', exact: true });
    if (await closeToast.count()) await closeToast.click();
    await controls.scrollIntoViewIfNeeded();
    const box = await controls.boundingBox();
    expect(box && box.width).toBeGreaterThan(200);
    await page.locator('[data-dashboard-chart]').filter({ has: page.locator('[data-view-controls]') }).first().screenshot({ path: `${shots}view-modes-${w}.png` });
  });
}
