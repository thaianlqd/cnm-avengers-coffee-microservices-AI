import { expect, test } from '@playwright/test';
import { deferred, mockApi, openAssistant, PLAN, REPORT } from './helpers';

const QUESTION = 'Doanh thu 7 ngày qua';
const ask = async (page: any, text = QUESTION) => { await page.locator('textarea').first().fill(text); };

test.describe('Analyst workspace - seven modes and one click (mocked API, real browser)', () => {
  test('shows exactly seven modes and keeps hidden legacy missions out of the picker', async ({ page }) => {
    await mockApi(page);
    await openAssistant(page);
    const modes = page.getByRole('radiogroup', { name: 'Nhiệm vụ phân tích' });
    await expect(modes.getByRole('radio')).toHaveCount(7);
    for (const label of ['Câu hỏi tự do', 'Tổng quan', 'So sánh', 'Xếp hạng', 'Xu hướng', 'Dự báo', 'Rủi ro & cảnh báo']) {
      await expect(modes).toContainText(label);
    }
    await expect(modes.getByRole('radio', { name: /Cơ cấu|Tương quan/ })).toHaveCount(0);
  });

  test('"Phân tích" runs one job through /analysis-jobs without opening the plan step; double click = one submission', async ({ page }) => {
    const api = await mockApi(page);
    let polls = 0;
    api.on('/ai/analysis-jobs', async (route, body) => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 202, json: { job_id: 'aj_1', state: 'accepted' } });
      polls += 1;
      return route.fulfill({ json: { job_id: 'aj_1', state: 'completed', result: REPORT('ONE') } });
    });
    await openAssistant(page);
    await ask(page);
    const button = page.getByRole('button', { name: 'Phân tích', exact: true });
    await button.dblclick();
    await expect(page.getByText('BÁO CÁO ONE').first()).toBeVisible();
    expect((api.calls['/api/ai/analysis-jobs'] || []).length).toBe(1);          // one logical submission
    expect(api.calls['/api/ai/propose-plan'] || []).toHaveLength(0);            // no mandatory approval step
    expect(polls).toBeGreaterThan(0);
  });

  test('"Xem kế hoạch" keeps the optional preview/approve flow on its own endpoint', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/propose-plan', route => route.fulfill({ json: PLAN('P') }));
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Xem kế hoạch' }).click();
    await expect(page.getByRole('heading', { name: 'KẾ HOẠCH P' })).toBeVisible();
    expect(api.calls['/api/ai/analysis-jobs'] || []).toHaveLength(0);
  });
});

test.describe('State isolation - stale responses never come back', () => {
  test('propose is slow, the user goes back to edit, the old plan arrives later: no plan appears', async ({ page }) => {
    const api = await mockApi(page);
    const gate = deferred();
    api.on('/ai/propose-plan', async route => route.fulfill({ json: await gate.promise }));
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Xem kế hoạch' }).click();
    await expect(page.getByText('Đang đọc yêu cầu và kiểm tra kế hoạch phân tích')).toBeVisible();
    await page.getByRole('button', { name: 'Sửa câu hỏi' }).first().click();
    gate.resolve(PLAN('STALE'));
    await page.waitForTimeout(400);
    await expect(page.getByText('KẾ HOẠCH STALE')).toHaveCount(0);
    await expect(page.locator('textarea').first()).toBeVisible();     // still on the question step
  });

  test('generate is slow, the user stops: the late report is dropped and the workspace is reset', async ({ page }) => {
    const api = await mockApi(page);
    const gate = deferred();
    api.on('/ai/propose-plan', route => route.fulfill({ json: PLAN('G') }));
    api.on('/ai/generate-executive-report', async route => route.fulfill({ json: await gate.promise }));
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Xem kế hoạch' }).click();
    await page.getByRole('button', { name: 'Xác nhận & Bắt đầu Phân tích' }).click();
    await page.getByRole('button', { name: 'Dừng phân tích' }).click();
    gate.resolve(REPORT('LATE'));
    await page.waitForTimeout(400);
    await expect(page.getByText('BÁO CÁO LATE')).toHaveCount(0);
    await expect(page.locator('textarea').first()).toHaveValue('');       // active state reset to defaults
  });

  test('lost POST response: reconnect resumes the SAME idempotency key and never starts a new interpretation', async ({ page }) => {
    const api = await mockApi(page);
    const keys: string[] = [];
    let first = true;
    api.on('/ai/analysis-jobs', async (route) => {
      if (route.request().method() === 'POST') {
        keys.push(route.request().headers()['idempotency-key']);
        if (first) { first = false; return route.abort('connectionreset'); }
        return route.fulfill({ status: 202, json: { job_id: 'aj_9', state: 'accepted' } });
      }
      return route.fulfill({ json: { job_id: 'aj_9', state: 'completed', result: REPORT('RESUMED') } });
    });
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await page.getByRole('button', { name: 'Kết nối lại tác vụ' }).click();
    await expect(page.getByText('BÁO CÁO RESUMED').first()).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);                                        // same key => server returns the same job
    expect(api.calls['/api/ai/propose-plan'] || []).toHaveLength(0);     // no second paid interpretation
  });

  test('changing the period after a plan was proposed drops that plan', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/propose-plan', route => route.fulfill({ json: PLAN('T') }));
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Xem kế hoạch' }).click();
    await expect(page.getByRole('heading', { name: 'KẾ HOẠCH T' })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa câu hỏi' }).first().click();
    await page.locator('#analysis-time').selectOption({ label: '30 ngày qua' });
    await expect(page.getByRole('heading', { name: 'KẾ HOẠCH T' })).toHaveCount(0);
  });
});

test.describe('Risk scan, redirect and typed actions', () => {
  test('a slow Risk scan is dropped when the mission changes (no scan published into another mission)', async ({ page }) => {
    const api = await mockApi(page);
    const gate = deferred();
    api.on('/ai/risk-watch', async route => route.fulfill({ json: await gate.promise }));
    await openAssistant(page);
    const modes = page.getByRole('radiogroup', { name: 'Nhiệm vụ phân tích' });
    await modes.locator('[data-mission="risk_watch"]').click();
    await ask(page, 'Kiểm tra rủi ro tháng này');
    await page.getByRole('button', { name: /Kiểm tra rủi ro/ }).first().click();
    await modes.locator('[data-mission="overview"]').click();
    gate.resolve({ status: 'success', version: '3.1.0', mission: 'risk_watch', signals: [{ id: 'x', label: 'TÍN HIỆU CŨ', metric_label: 'm', status: 'red', status_label: 'Vượt ngưỡng',
      unit: '%', operator_symbol: '>', threshold: 8, value: 12 }], counts: {}, scope: [], time: {}, composite_score: null, provider_calls: 0, sql_queries: 1 });
    await page.waitForTimeout(400);
    await expect(page.getByText('TÍN HIỆU CŨ')).toHaveCount(0);
    expect((api.calls['/api/ai/risk-watch'] || [])).toHaveLength(1);
  });

  test('a REDIRECT fix switches the mission but keeps the deliberate question', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/preflight', route => route.fulfill({ json: {
      version: '3.2.0', status: 'blocked', state: 'NEEDS_INPUT', state_label: 'Cần chỉnh', can_submit: false,
      understood: { metrics: [], dimensions: [], filters: [], time: null, forecast: null, mission: null, unsupported: [] },
      findings: [{ level: 'block', code: 'risk_signal_required', message: 'Doanh thu không phải tín hiệu rủi ro được quản trị.',
        fixes: [{ label: 'Chuyển sang Tổng quan', kind: 'switch_mission', mission: 'overview' }] }],
      recognition: { business: [], analytical: [] }, guided_contract: null, semantic_contract: {},
      capability: { decision: 'REDIRECT', policy_version: '3.3.0' }, provider_calls: 0, warehouse_queries: 0 } }));
    await openAssistant(page);
    const modes = page.getByRole('radiogroup', { name: 'Nhiệm vụ phân tích' });
    await modes.locator('[data-mission="risk_watch"]').click();
    await ask(page, 'Doanh thu tháng 9 có rủi ro không');
    await expect(page.getByText('Doanh thu không phải tín hiệu rủi ro được quản trị.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Phân tích sâu bằng AI' })).toBeDisabled();   // blocked: nothing can run
    await page.getByRole('button', { name: 'Chuyển sang Tổng quan' }).click();
    await expect(modes.locator('[data-mission="overview"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('textarea').first()).toHaveValue('Doanh thu tháng 9 có rủi ro không');
  });
});

test.describe('Guided input and typed clarification', () => {
  const job = async (api: any) => {
    const posts: any[] = [];
    api.on('/ai/analysis-jobs', async (route: any) => {
      const submit = route.request().method() === 'POST' && new URL(route.request().url()).pathname.endsWith('/analysis-jobs');
      if (route.request().method() === 'POST' && !submit) return route.fulfill({ json: { state: 'cancelled' } });   // owned-task cancel
      if (submit) { posts.push(route.request().postDataJSON()); return route.fulfill({ status: 202, json: { job_id: 'aj_g', state: 'accepted' } }); }
      return route.fulfill({ json: { job_id: 'aj_g', state: 'completed', result: REPORT('G') } });
    });
    return posts;
  };

  test('untouched guided builder sends a guided contract; editing the text sends free text only (no stale guided intent)', async ({ page }) => {
    const api = await mockApi(page);
    const posts = await job(api);
    await openAssistant(page);
    const modes = page.getByRole('radiogroup', { name: 'Nhiệm vụ phân tích' });
    await modes.locator('[data-mission="trend"]').click();
    await page.getByRole('button', { name: 'Dùng cấu hình này' }).click();
    const textarea = page.locator('textarea').first();
    await expect(textarea).not.toHaveValue('');                         // the builder produced a question
    await page.getByRole('button', { name: /^Lập kế hoạch|^Phân tích$/ }).first().click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].input_mode).toBe('guided');
    expect(posts[0].guided_contract).toBeTruthy();
    expect(posts[0].analysis_mission).toBe('trend');
    // edit the text by hand: the old guided intent must not travel with a different meaning
    await page.getByRole('button', { name: 'Đặt câu hỏi' }).first().click();
    await modes.locator('[data-mission="trend"]').click();
    await page.getByRole('button', { name: 'Dùng cấu hình này' }).click();
    await textarea.fill('Doanh thu theo ngày trong 7 ngày qua nhưng chỉ số khác hẳn');
    await page.getByRole('button', { name: /^Lập kế hoạch|^Phân tích$/ }).first().click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1].input_mode ?? 'free_text').not.toBe('guided');
    expect(posts[1].guided_contract).toBeUndefined();
  });
});

test.describe('Refinement and reset on a finished report', () => {
  const finished = async (api: any, marker = 'R1') => {
    api.on('/ai/analysis-jobs', async (route: any) => {
      if (route.request().method() === 'POST' && new URL(route.request().url()).pathname.endsWith('/analysis-jobs')) return route.fulfill({ status: 202, json: { job_id: 'aj_r', state: 'accepted' } });
      if (route.request().method() === 'POST') return route.fulfill({ json: { state: 'cancelled' } });
      return route.fulfill({ json: { job_id: 'aj_r', state: 'completed', result: REPORT(marker) } });
    });
  };
  const REFINE = 'VD: Đổi biểu đồ sang tròn donut';

  test('a slow refinement that finishes after "Hỏi câu mới" does not resurrect the old report', async ({ page }) => {
    const api = await mockApi(page);
    await finished(api);
    const gate = deferred();
    api.on('/ai/refine-report', async route => route.fulfill({ json: await gate.promise }));
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect(page.getByText('BÁO CÁO R1').first()).toBeVisible();
    await page.getByText('Điều chỉnh phân tích', { exact: true }).click();
    const box = page.locator(`input[placeholder^="${REFINE}"]:visible`).first();
    await expect(box).toBeEnabled();
    await box.fill('Đổi sang biểu đồ tròn');
    await box.press('Enter');
    await expect.poll(() => (api.calls['/api/ai/refine-report'] || []).length).toBe(1);
    await page.getByRole('button', { name: 'Hỏi câu mới' }).first().click();
    gate.resolve(REPORT('R2-LATE', { assistant_reply: 'late' }));
    await page.waitForTimeout(400);
    await expect(page.getByText('BÁO CÁO R2-LATE')).toHaveCount(0);
    await expect(page.getByText('BÁO CÁO R1')).toHaveCount(0);
    await expect(page.locator('textarea').first()).toHaveValue('');
  });

  test('cancelling while the job HTTP is still running cancels the owned task and publishes nothing late', async ({ page }) => {
    const api = await mockApi(page);
    const gate = deferred();
    let cancelled = 0;
    api.on('/ai/analysis-jobs', async (route: any) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST' && path.endsWith('/analysis-jobs')) return route.fulfill({ status: 202, json: { job_id: 'aj_c', state: 'accepted' } });
      if (route.request().method() === 'POST') { cancelled += 1; return route.fulfill({ json: { state: 'cancelled' } }); }
      return route.fulfill({ json: await gate.promise });
    });
    await openAssistant(page);
    await ask(page);
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dừng phân tích' })).toBeVisible();
    await page.getByRole('button', { name: 'Dừng phân tích' }).click();
    await expect.poll(() => cancelled).toBe(1);                        // the owned task is cancelled server-side
    gate.resolve({ job_id: 'aj_c', state: 'completed', result: REPORT('TOO-LATE') });
    await page.waitForTimeout(600);
    await expect(page.getByText('BÁO CÁO TOO-LATE')).toHaveCount(0);
  });
});
