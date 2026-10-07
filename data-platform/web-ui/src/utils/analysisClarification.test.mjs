import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

// Compile the actual stateless UI components; no browser, network, or providers.
const directory = mkdtempSync(join(tmpdir(), 'analysis-clarification-test-'));
let AnalysisClarification;
try {
  const compiled = buildSync({
    entryPoints: [new URL('../components/AnalysisClarification.tsx', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'cjs', write: false,
  });
  const artifact = join(directory, 'component.cjs');
  writeFileSync(artifact, compiled.outputFiles[0].contents);
  ({ AnalysisClarification } = createRequire(import.meta.url)(artifact));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

test('clarification renders business labels and preserves understood scope', () => {
  const html = renderToStaticMarkup(React.createElement(AnalysisClarification, {
    response: {
      status: 'needs_clarification',
      clarification: {
        user_message: 'Bạn muốn đánh giá theo chỉ số nào?',
        known_interpretation: {
          subject: 'Chi nhánh và điểm bán', analysis_kind: 'ranking',
          metrics: [], filters: [{ dimension: 'Thành phố', value: 'Hồ Chí Minh' }],
          time_range: { start: '2026-09-01', end: '2026-09-30' },
          ranking: { top_n: 5, metric: 'Chỉ số cần xác nhận', direction: 'DESC' },
        },
        choices: [{ id: 'store_revenue', label: 'Doanh thu chi nhánh', unit: 'VND' }],
      },
    }, onChoice: () => {},
  }));
  for (const label of ['Doanh thu chi nhánh', 'Hồ Chí Minh', 'Top 5', '2026-09-01']) assert.ok(html.includes(label));
  assert.ok(!html.includes('store_revenue'));
  assert.ok(!html.includes('ranking'));
});

test('provider error and legacy raw ID options do not become user ambiguity', () => {
  const html = renderToStaticMarkup(React.createElement(AnalysisClarification, {
    response: { status: 'error', message: 'Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.',
      options: ['quantity_sold'], diagnostics: { error_category: 'provider_invalid_json' } },
  }));
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Vui lòng thử lại'));
  for (const id of ['quantity_sold', 'provider_invalid_json']) assert.ok(!html.includes(id));
  assert.ok(!html.includes('Cần làm rõ'));
});

test('server context capacity is not presented as missing user input or an oversized question', () => {
  const message='Hệ thống chưa chuẩn bị được đầy đủ ngữ cảnh dữ liệu để lập kế hoạch. Vui lòng thử lại.';
  const html=renderToStaticMarkup(React.createElement(AnalysisClarification, {response:{status:'error',message,issue:{category:'PLANNING_CAPACITY',title:'Chưa thể chuẩn bị đầy đủ ngữ cảnh phân tích',what_is_missing:[message]}},onRetry(){}}));
  assert.ok(html.includes('role="alert"'));assert.ok(html.includes('Thử lập lại kế hoạch'));
  assert.equal(html.split(message).length-1,1);
  assert.ok(!html.includes('Cần bổ sung:'));assert.ok(!html.includes('Cần chia nhỏ'));
});
