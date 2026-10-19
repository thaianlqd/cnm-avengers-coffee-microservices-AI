import { expect, test, type Page } from '@playwright/test';
import { CAPABILITIES, mockApi, openAssistant, REPORT, type Api } from './helpers';

const SESSION = { authenticated: true, identity: 'fixture-account-A:policy-1', permissions: ['analytics.read'], expires_at: 4000000000 };
const key = { city: 'A / B', order_type: 'STORE' };
const groupReport = () => REPORT('GROUP', {
  analysis_spec: { title: 'Fixture governed report', components: [] },
  prompt: 'BÁO CÁO GROUP',
  analytical_queries: [{ id: 'q1', metrics: ['revenue'], group_by: ['city', 'order_type'], filters: [] }],
  analysis_explanation: [{ query_id: 'q1', metrics: [{ id: 'revenue', label: 'Doanh thu' }], period: { start: '2026-09-01', end: '2026-09-30' } }],
  charts: [{ id: 'chart-1', query_id: 'q1', scope_ref: 'q1', chart_type: 'horizontal_bar',
    metric: 'revenue', metrics: ['revenue'], title: 'Doanh thu theo nhóm', unit: 'VND',
    purpose: 'comparison', selection: 'complete', role: 'requested',
    data: [{ label: 'A / B · Tại quán', value: 100, entity_ref: { query_id: 'q1', filters: key } }] }],
  result_sets: { q1: { columns: ['city', 'order_type', 'revenue'], rows: [{ city: 'A / B', order_type: 'STORE', revenue: 100 }],
    total_rows: 1, artifact_ref: { artifact_id: 'ra_fixture' } } },
});
const deliver = (api: Api) => api.on('/ai/analysis-jobs', route => route.fulfill({
  status: route.request().method() === 'POST' ? 202 : 200,
  json: route.request().method() === 'POST' ? { job_id: 'aj_group', state: 'accepted' } : { job_id: 'aj_group', state: 'completed', result: groupReport() },
}));
async function analyze(page: Page) {
  await openAssistant(page);
  await page.locator('textarea').first().fill('Doanh thu 7 ngày qua');
  await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
  await expect(page.getByText('BÁO CÁO GROUP').first()).toBeVisible();
}

test.describe('V3.4 auth, health and artifact inspection (mocked API; real browser)', () => {
  test('anonymous login gate makes no protected platform requests', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/auth/session', route => route.fulfill({ status: 401, json: { detail: 'Authentication required' } }));
    await page.goto('/');
    await expect(page.getByRole('form', { name: 'Đăng nhập Data Platform' })).toBeVisible();
    expect(Object.keys(api.calls).filter(path => !path.startsWith('/api/auth/'))).toEqual([]);
  });

  test('identity login returns account state and never stores a token in browser storage', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/auth/session', route => route.fulfill({ status: 401, json: {} }));
    api.on('/auth/login', route => route.fulfill({ json: SESSION }));
    await page.goto('/');
    await page.getByLabel('Tài khoản', { exact: true }).fill('fixture-user');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password-only');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Đăng xuất tài khoản phân tích' })).toBeVisible();
    expect(api.calls['/api/auth/login']).toEqual([{ tai_khoan: 'fixture-user', mat_khau: 'fixture-password-only' }]);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain('fixture-password-only');
    expect(storage).not.toMatch(/accessToken|Bearer|access_token/);
  });

  test('expired protected session returns to sign in before a report can appear', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/analysis-jobs', route => route.fulfill({ status: 401, json: { detail: 'expired' } }));
    await openAssistant(page);
    await page.locator('textarea').first().fill('Doanh thu 7 ngày qua');
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Đăng nhập Data Platform' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('hết hạn');
    await expect(page.getByText('BÁO CÁO GROUP')).toHaveCount(0);
    expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  });

  test('permission denial keeps the signed-in workspace and the draft', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/analysis-jobs', route => route.fulfill({ status: 403, json: { detail: 'Không được cấp quyền phân tích nguồn này.' } }));
    await openAssistant(page);
    await page.locator('textarea').first().fill('Doanh thu 7 ngày qua');
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect(page.getByText('Không được cấp quyền phân tích nguồn này.').first()).toBeVisible();
    await expect(page.locator('textarea').first()).toHaveValue('Doanh thu 7 ngày qua');
    await expect(page.getByRole('form', { name: 'Đăng nhập Data Platform' })).toHaveCount(0);
    expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
  });

  test('logout removes the report before a different account can sign in', async ({ page }) => {
    const api = await mockApi(page); deliver(api);
    api.on('/auth/logout', route => route.fulfill({ json: { status: 'signed_out' } }));
    await analyze(page);
    await page.getByRole('button', { name: 'Đăng xuất tài khoản phân tích' }).click();
    await expect(page.getByRole('form', { name: 'Đăng nhập Data Platform' })).toBeVisible();
    await expect(page.getByText('BÁO CÁO GROUP')).toHaveCount(0);
  });

  test('keyboard group inspect uses the exact composite artifact key and makes no new AI request', async ({ page }) => {
    const api = await mockApi(page); deliver(api);
    api.on('/results/q1', route => {
      const params = new URL(route.request().url()).searchParams;
      expect(JSON.parse(params.get('filters') || '{}')).toEqual(key);
      expect(params.get('revision')).toBe('1');
      return route.fulfill({ json: { columns: ['city', 'order_type', 'revenue'], rows: [{ ...key, revenue: 100 }],
        total_rows: 1, revision: 1, artifact_id: 'ra_fixture', plan_fingerprint: 'p' } });
    });
    await analyze(page);
    const submits = (api.calls['/api/ai/analysis-jobs'] || []).length;
    await page.getByRole('button', { name: /^Xem nhóm A/ }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Nhóm A/ });
    await expect(dialog).toContainText('1 dòng trong nhóm');
    await expect(dialog).toContainText('Tổng của báo cáo giữ nguyên');
    expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(submits);
    expect(api.calls['/api/ai/propose-plan'] || []).toHaveLength(0);
    await page.screenshot({ path: test.info().outputPath('entity-inspect-desktop.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Xem nhóm A/ })).toBeFocused();
  });

  test('group analysis prepares a new governed request and waits for explicit submission', async ({ page }) => {
    const api = await mockApi(page); deliver(api);
    api.on('/results/q1', route => route.fulfill({ json: { columns: ['city', 'order_type', 'revenue'], rows: [{ ...key, revenue: 100 }],
      total_rows: 1, revision: 1, artifact_id: 'ra_fixture', plan_fingerprint: 'p' } }));
    await analyze(page);
    const submits = (api.calls['/api/ai/analysis-jobs'] || []).length;
    await page.getByRole('button', { name: /^Xem nhóm A/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Phân tích riêng nhóm' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('textarea').first()).toHaveValue('Tình hình doanh thu từ 2026-09-01 đến 2026-09-30');
    await expect.poll(() => (api.calls['/api/ai/preflight'] || []).at(-1)?.analysis_scope).toEqual({ mode: 'selected', filters: [
      { dimension: 'city', operator: 'eq', value: 'A / B' }, { dimension: 'order_type', operator: 'eq', value: 'STORE' }] });
    const preflight = api.calls['/api/ai/preflight'].at(-1);
    expect(preflight.time).toEqual({ mode: 'custom', start: '2026-09-01', end: '2026-09-30' });
    expect(preflight.guided_contract).toEqual({ metric: 'revenue' });
    expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(submits);
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect.poll(() => api.calls['/api/ai/analysis-jobs'].filter(body => body?.question).length).toBe(2);
    const request = api.calls['/api/ai/analysis-jobs'].filter(body => body?.question).at(-1);
    expect(request.analysis_scope).toEqual(preflight.analysis_scope);
    expect(request.time).toEqual(preflight.time);
    expect(request.source_analysis).toEqual({session_id:groupReport().session_id,revision:groupReport().revision,
      query_id:'q1',artifact_id:'ra_fixture',filters:key});
    expect(request).not.toHaveProperty('rows'); expect(request).not.toHaveProperty('analysis_module_id');
  });

  test('mobile group inspect shows revoked access without a generic AI retry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = await mockApi(page); deliver(api);
    api.on('/results/q1', route => route.fulfill({ status: 403, json: { detail: 'denied' } }));
    await analyze(page);
    await page.getByRole('button', { name: /^Xem nhóm A/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('alert')).toContainText('không còn quyền');
    await expect(dialog.getByRole('button', { name: /thử lại|phân tích/i })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('entity-inspect-mobile-denied.png') });
    await dialog.getByRole('button', { name: 'Đóng nhóm' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('saved report reopens current server presentation with real donut rows and quarantines legacy claims', async ({ page }) => {
    const api = await mockApi(page);
    const full = REPORT('SAVED', { analysis_spec: { title: 'Saved', components: [] }, prompt: 'Doanh thu đã lưu',
      charts: [{ id: 'v1', query_id: 'q1', scope_ref: 'q1', chart_type: 'donut', metric: 'revenue', metrics: ['revenue'],
        title: 'Cơ cấu đã lưu', unit: 'VND', selection: 'complete', role: 'requested',
        data: [{ label: 'Mang đi', value: 120000 }, { label: 'Tại quán', value: 80000 }] }] });
    const saved = { id: 'rpt_owned', title: 'Báo cáo tháng 9', created_by: 'account:' + 'a'.repeat(64), module_config: { ...full, charts: full.charts.map(({ data, ...chart }) => chart) } };
    api.on('/reports/saved', route => route.fulfill({ json: { reports: [saved, { id: 'rpt_legacy', title: 'Lưu trữ cũ', ai_summary: 'CLAIM_KHONG_DUOC_XAC_NHAN' }] } }));
    api.on('/reports/saved/rpt_owned', route => route.fulfill({ json: { ...saved, module_config: full } }));
    api.on('/ai/verify-report', route => route.fulfill({ json: { quality_assessment: { status: 'verified', score: 90, trust_dimensions: [] } } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Quản lý Báo cáo', exact: true }).click();
    await expect(page.getByText('Lưu trữ cũ · chỉ đọc, chưa xác minh')).toBeVisible();
    await expect(page.getByText('CLAIM_KHONG_DUOC_XAC_NHAN')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'Lưu trữ cũ' }).getByRole('button', { name: 'Tải Word' })).toBeDisabled();
    await page.getByRole('button', { name: 'Trực quan', exact: true }).click();
    await expect(page.getByText('Mang đi', { exact: true })).toBeVisible();
    await expect(page.getByText('60.0%')).toBeVisible();
    await expect(page.getByText('Chưa có dữ liệu cơ cấu')).toHaveCount(0);
    expect(api.calls['/api/reports/saved/rpt_owned']).toHaveLength(1);
    expect(api.calls['/api/ai/analysis-jobs'] || []).toHaveLength(0);
  });

  test('blocked and unknown sources disclose measured health and unknown completeness', async ({ page }) => {
    const api = await mockApi(page);
    api.on('/ai/capabilities', route => route.fulfill({ json: { ...CAPABILITIES, data_coverage: {
      ...CAPABILITIES.data_coverage, data_health: { views: { 'silver.don_hang': { status: 'blocked' }, 'silver.san_pham': { status: 'unknown' } } },
    } } }));
    await openAssistant(page);
    await expect(page.locator('[data-source-health="blocked"]')).toContainText('1 nguồn bị chặn');
    await expect(page.locator('[data-source-health="unknown"]')).toContainText('1 nguồn chưa có đủ bằng chứng');
    await expect(page.locator('[data-source-completeness]')).toContainText('chưa được chứng nhận');
    expect(api.calls['/api/ai/analysis-jobs'] || []).toHaveLength(0);
  });
});

test.describe('V3.4 BI data errors and measured values', () => {
  test('marts503 is a visible error without zero KPI and retry recovers real data', async ({ page }) => {
    const api=await mockApi(page);
    let unavailable=true;
    api.on('/marts/all',route=>route.fulfill(unavailable
      ? {status:503,json:{detail:'fixture unavailable'}}
      : {json:{kpi:{revenue_all_time:195351500,total_orders_all_time:1871,revenue_orders:1759,aov:111058,new_customers:312},revenue_daily:[{date:'2026-10-01',revenue:100,total_orders:2}]}}));
    await page.goto('/');
    await expect(page.locator('[data-platform-load-errors]')).toContainText('503');
    await expect(page.locator('[data-overview-unavailable]')).toBeVisible();
    await expect(page.getByText('12.486',{exact:true})).toHaveCount(0);
    unavailable=false;
    await page.getByRole('button',{name:'Tải lại dữ liệu',exact:true}).click();
    await expect(page.locator('[data-platform-load-errors]')).toHaveCount(0);
    await expect(page.getByText('195.351.500 đ',{exact:true})).toBeVisible();
    await expect(page.getByText('1.871',{exact:true})).toBeVisible();
    await expect(page.getByText('Số đơn hàng',{exact:true})).toHaveCount(0);
    await expect(page.getByText('312',{exact:true})).toBeVisible();
    expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
  });

  test('valid zero data is separate from a network error and never fabricates business rows', async ({ page }) => {
    const api=await mockApi(page);
    api.on('/marts/all',route=>route.fulfill({json:{kpi:{revenue_all_time:0,total_orders_all_time:0,aov:0,new_customers:0},revenue_daily:[],recent_sales:[]}}));
    await page.goto('/');
    await expect(page.getByText('Tổng doanh thu',{exact:true})).toBeVisible();
    await expect(page.locator('[data-platform-load-errors]')).toHaveCount(0);
    await expect(page.getByText('Chưa có dữ liệu giao dịch trong khoảng thời gian này')).toBeVisible();
    await expect(page.getByText('12.486',{exact:true})).toHaveCount(0);
    await expect(page.getByText('30/09/2026 14:32',{exact:true})).toHaveCount(0);
    expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
  });
});

test('same-account reauthentication restores the draft without resubmitting paid work',async({page})=>{
  const api=await mockApi(page);
  let loggedIn=true;
  api.on('/auth/session',route=>route.fulfill(loggedIn?{json:SESSION}:{status:401,json:{}}));
  api.on('/auth/login',route=>{loggedIn=true;return route.fulfill({json:SESSION});});
  api.on('/ai/analysis-jobs',route=>{loggedIn=false;return route.fulfill({status:401,json:{detail:'expired'}});});
  await openAssistant(page);
  await page.locator('textarea').first().fill('Doanh thu tháng 9 năm 2026');
  await page.getByRole('button',{name:'Phân tích',exact:true}).click();
  await expect(page.getByRole('form',{name:'Đăng nhập Data Platform'})).toBeVisible();
  await page.getByLabel('Tài khoản',{exact:true}).fill('fixture-user');
  await page.getByLabel('Mật khẩu',{exact:true}).fill('fixture-password-only');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.locator('textarea').first()).toHaveValue('Doanh thu tháng 9 năm 2026');
  expect(api.calls['/api/ai/analysis-jobs']).toHaveLength(1);
});

test('disabled SQL metadata is loaded only on Explorer and cannot show as a dashboard data failure',async({page})=>{
  const api=await mockApi(page);
  api.on('/auth/session',route=>route.fulfill({json:{...SESSION,permissions:['analytics.read','sql.explore']}}));
  api.on('/warehouse/tables',route=>route.fulfill({status:403,json:{detail:'SQL Explorer disabled'}}));
  api.on('/marts/all',route=>route.fulfill({json:{kpi:{revenue_all_time:195351500,total_orders_all_time:1871},revenue_daily:[]}}));
  await page.goto('/');
  await expect(page.getByText('195.351.500 đ',{exact:true})).toBeVisible();
  expect(api.calls['/api/warehouse/tables']).toBeUndefined();
  await expect(page.locator('[data-platform-load-errors]')).toHaveCount(0);
  await page.getByRole('button',{name:'Khám phá dữ liệu',exact:true}).click();
  await expect(page.getByText('Khám phá dữ liệu chưa khả dụng',{exact:true})).toBeVisible();
  // React StrictMode invokes the mount effect twice in this development fixture.
  expect(api.calls['/api/warehouse/tables']).toHaveLength(2);
  await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
  await expect(page.getByText('195.351.500 đ',{exact:true})).toBeVisible();
  await expect(page.locator('[data-platform-load-errors]')).toHaveCount(0);
});

test('BI export fails visibly on denial and only reports success after receiving an actual CSV download',async({page})=>{
  const api=await mockApi(page);
  let allowed=false;
  api.on('/reports/export-data',route=>route.fulfill(allowed
    ? {status:200,headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="du_lieu_revenue.csv"'},body:'\ufeffNgày,Đơn hợp lệ,Doanh thu (VND)\r\n2026-10-18,2,300\r\n'}
    : {status:403,json:{detail:'Fixture export denied'}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();
  await page.getByRole('button',{name:'Báo cáo tổng hợp',exact:true}).click();
  await page.getByRole('button',{name:'Xuất dữ liệu',exact:true}).click();
  await expect(page.getByText('Fixture export denied',{exact:true})).toBeVisible();
  await expect(page.getByText('Đã tạo file CSV từ dữ liệu máy chủ.',{exact:true})).toHaveCount(0);
  allowed=true;
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Xuất dữ liệu',exact:true}).click();
  const download=await downloaded;
  expect(download.suggestedFilename()).toBe('du_lieu_revenue.csv');
  const stream=await download.createReadStream();
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toContain('2026-10-18,2,300');
  await expect(page.getByText('Đã tạo file CSV từ dữ liệu máy chủ.',{exact:true})).toBeVisible();
  expect(api.calls['/api/reports/export-data']).toEqual([{kind:'revenue',date_range:'30days',branch:'all'},{kind:'revenue',date_range:'30days',branch:'all'}]);
  expect(api.calls['/api/ai/analysis-jobs']).toBeUndefined();
});

test('city share keeps the full population denominator and displays unscaled money',async({page})=>{
  const api=await mockApi(page);
  api.on('/stores/overview',route=>route.fulfill({json:{summary:{total_stores:6,active_stores:6},stores:[],top_stores:[],
    revenue_by_city:[100,90,80,70,60,50].map((revenue,index)=>({city:'City '+index,revenue}))}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Báo cáo & Phân tích',exact:true}).click();
  await page.getByRole('button',{name:'Báo cáo tổng hợp',exact:true}).click();
  await page.getByRole('button',{name:'Hiệu suất Cửa hàng',exact:true}).click();
  const region=page.getByRole('heading',{name:'Tỷ trọng doanh thu theo tỉnh thành',exact:true}).locator('../..');
  await expect(region).toContainText('Các tỉnh/thành còn lại');
  await expect(region).toContainText(/22\.2\s*%/);
  await expect(region).toContainText('100 đ');
  await expect(region).toContainText('450');
  await expect(region).not.toContainText('0.00B');
});
