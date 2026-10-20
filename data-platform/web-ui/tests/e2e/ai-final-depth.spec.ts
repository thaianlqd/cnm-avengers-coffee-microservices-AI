import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { mockApi } from './helpers';

// FINAL AI Data Analyst (2026-10-19 plan, P5): real server report payloads produced by the production pipeline on the
// offline rich fixture (tests/test_ai_final_depth_contract.py). The browser must show every counted view of the
// chosen depth, the honest coverage chip, lens role badges, and keep explanations/conclusion collapsed.
const here = dirname(fileURLToPath(import.meta.url));
const report = (depth: string) => JSON.parse(readFileSync(resolve(here, `fixtures/ai-final-report-${depth}.json`), 'utf8'));
const session = { authenticated: true, identity: 'fixture-admin:final', role: 'ADMIN', permissions: ['analytics.read', 'system.read', 'warehouse.read'], expires_at: 4000000000 };

async function run(page: any, depth: string) {
  const api = await mockApi(page);
  api.on('/auth/session', (route: any) => route.fulfill({ json: session }));
  api.on('/ai/analysis-jobs', (route: any) => route.fulfill({ json: { job_id: `final-${depth}`, state: 'completed', result: report(depth) } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  await page.locator('textarea').first().fill('tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh');
  await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
  return api;
}

test('comprehensive report shows all 8 relevant views, coverage chip and collapsed narrative without "Xem thêm"', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await run(page, 'comprehensive');
  const cards = page.locator('[data-dashboard-chart]');
  await expect(cards).toHaveCount(8);
  await expect(page.locator('[data-analysis-coverage="ok"] > summary')).toHaveText('Toàn diện · 8/8 góc nhìn');
  await expect(page.getByText(/Xem thêm \d+ góc nhìn/)).toHaveCount(0);
  await expect(page.locator('[data-lens-role="core"]')).toHaveCount(4);
  await expect(page.locator('[data-lens-role="diagnostic"]')).toHaveCount(2);
  await expect(page.locator('[data-lens-role="extended"]')).toHaveCount(2);
  // Nothing about revenue or a one-bar city chart in a cancellation report.
  await expect(page.locator('[data-dashboard-chart] h5', { hasText: /doanh thu/i })).toHaveCount(0);
  await expect(page.locator('[data-conclusion]')).not.toHaveAttribute('open', '');
  await page.locator('[data-conclusion] > summary').click();
  await expect(page.locator('[data-conclusion] [data-view-findings] [data-lens-id]').first()).toBeVisible();
  await page.locator('[data-conclusion] > summary').click();
  for (let i = 0; i < 8; i++) expect((await cards.nth(i).boundingBox())!.height).toBeLessThan(420);  // bounded chart cards
  await page.locator('[data-report-context]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('final-comprehensive-desktop-top.png') });
  await cards.nth(4).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('final-comprehensive-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('final-comprehensive-tablet.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-report-context]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('final-comprehensive-mobile.png'), fullPage: true });
  // The visible depth is the submitted depth (default "deep" is sent explicitly, never left to server auto-pick).
  const submitted = (api.calls['/api/ai/analysis-jobs'] || []).find((b: any) => b && b.question);
  expect(submitted.analysis_depth).toBe('deep');
});

test('focused report shows exactly its 4 core views', async ({ page }) => {
  await run(page, 'focused');
  await expect(page.locator('[data-dashboard-chart]')).toHaveCount(4);
  await expect(page.locator('[data-analysis-coverage="ok"] > summary')).toHaveText('Tập trung · 4/4 góc nhìn');
  await expect(page.locator('[data-lens-role="diagnostic"], [data-lens-role="extended"]')).toHaveCount(0);
});
