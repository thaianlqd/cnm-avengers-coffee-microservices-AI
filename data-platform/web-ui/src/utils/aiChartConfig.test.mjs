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

import { formatChartValue } from './aiChartConfig.mjs';
test('large counts keep count units and never infer currency', () => {
  assert.equal(formatChartValue(2000000, ' ly'), '2.000.000 ly');
  assert.equal(formatChartValue(2000000, ' VND'), '2.000.000 VND');
});
test('zero is an observation; missing or invalid values are not manufactured', () => {
  assert.equal(formatChartValue(0, ' lượt'), '0 lượt');
  for (const value of [null, undefined, NaN, Infinity, '99', 'SELECT 1']) {
    assert.equal(formatChartValue(value, ' VND'), '—');
  }
});
