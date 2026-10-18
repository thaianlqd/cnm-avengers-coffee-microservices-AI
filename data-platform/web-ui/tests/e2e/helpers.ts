import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
// Server-generated capabilities (the same fixture the unit tests use); the UI never hard-codes a catalog.
export const CAPABILITIES = JSON.parse(readFileSync(resolve(here, '../../../analytics-api/tests/fixtures/capabilities_v31.json'), 'utf8'));

export function deferred<T = any>() {
  let resolveFn!: (value: T) => void;
  const promise = new Promise<T>(r => { resolveFn = r; });
  return { promise, resolve: resolveFn };
}

export const READY_PREFLIGHT = {
  version: '3.2.0', status: 'ok', state: 'READY_FOR_AI', state_label: 'Có thể gửi để AI diễn giải', can_submit: true,
  understood: { metrics: [], dimensions: [], filters: [], time: null, forecast: null, mission: null, unsupported: [] },
  findings: [], recognition: { business: [], analytical: [] }, guided_contract: null, semantic_contract: {},
  capability: { decision: 'READY', policy_version: '3.3.0' }, provider_calls: 0, warehouse_queries: 0,
};

export const PLAN = (marker: string) => ({
  status: 'proposal_ready', session_id: `sess-${marker}`, prompt: marker,
  proposal: { revision: 1, title: `KẾ HOẠCH ${marker}`, analysis_components: [], partial_scope: false,
    semantic_intent_fingerprint: 'i', resolved_plan_fingerprint: 'p', catalog_fingerprint: 'c', interpretation: { subject: marker } },
});

export const REPORT = (marker: string, extra: Record<string, any> = {}) => ({
  status: 'success', title: `BÁO CÁO ${marker}`, session_id: `sess-${marker}`, revision: 1, charts: [], evidence: [], kpis: {},
  short_answer: [], conclusion: { answer: `Kết luận ${marker}`, findings: [], caveats: [], actions: [] },
  quality_assessment: { status: 'verified', score: 90, trust_dimensions: [] }, ...extra,
});

export type Api = { calls: Record<string, any[]>; on: (match: string, handler: (route: Route, body: any) => Promise<void> | void) => void };

/** Mock every /api call. Specific handlers can defer the response (race tests) and every call is recorded. */
export async function mockApi(page: Page): Promise<Api> {
  const calls: Record<string, any[]> = {};
  const handlers: Array<[string, (route: Route, body: any) => Promise<void> | void]> = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: any = null;
    try { body = route.request().postDataJSON(); } catch { body = null; }
    (calls[path] ||= []).push(body);
    for (const [match, handler] of handlers) if (path.includes(match)) { await handler(route, body); return; }
    if (path.endsWith('/ai/capabilities')) return route.fulfill({ json: CAPABILITIES });
    if (path.endsWith('/ai/preflight')) return route.fulfill({ json: READY_PREFLIGHT });
    if (path.includes('/ai/status')) return route.fulfill({ json: { one_click: { enabled: true }, provider_status: { state: 'available' }, system_readiness: { warehouse_available: true, catalog_ready: true } } });
    return route.fulfill({ json: path.includes('list') || path.endsWith('s') ? [] : {} });
  });
  return { calls, on: (match, handler) => { handlers.unshift([match, handler]); } };
}

export async function openAssistant(page: Page) {
  await page.goto('/');
  await page.getByText('Trợ lý AI', { exact: true }).first().click();
}
