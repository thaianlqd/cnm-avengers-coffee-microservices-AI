import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAiChartPresentation } from './aiChartConfig.mjs';

const cases = [
  ['stores', 'bar', 'VNĐ', ' VNĐ'],
  ['payments', 'donut', 'VNĐ', ' VNĐ'],
  ['customers', 'donut', 'hội viên', ' hội viên'],
  ['products', 'donut', 'VNĐ', ' VNĐ'],
  ['hourly', 'donut', 'đơn', ' đơn'],
  ['delivery', 'donut', 'lượt giao', ' lượt giao'],
];

for (const [domain, chartType, unit, suffix] of cases) {
  test(`renders ${domain} breakdown as ${chartType} with ${unit}`, () => {
    const presentation = resolveAiChartPresentation({
      trend: { chart_type: domain === 'hourly' ? 'bar' : 'area', unit },
      breakdown: { chart_type: chartType, unit, title: `${domain} title` },
    });
    assert.equal(presentation.breakdown.type, chartType);
    assert.equal(presentation.breakdown.suffix, suffix);
    assert.equal(presentation.breakdown.title, `${domain} title`);
  });
}
