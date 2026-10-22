import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardGridLayout, chartLayoutProfile } from './dashboardGrid.mjs';

const short = { chart_type: 'bar', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
const ranking = { chart_type: 'horizontal_bar', data: Array.from({ length: 10 }, (_, i) => ({ label: `Chi nhánh Avengers Coffee Nguyễn Văn Linh ${i}`, value: i })) };
const trend = { chart_type: 'line', data: Array.from({ length: 30 }, (_, i) => ({ label: `2026-09-${i + 1}`, value: i })) };
const rows = layout => [...new Set(layout.map(p => p.row))].map(row => layout.filter(p => p.row === row).map(p => p.span));

test('three compact views share a row; five use 2 + 3 without an orphan', () => {
  assert.deepEqual(rows(dashboardGridLayout([short, short, short])), [[4, 4, 4]]);
  assert.deepEqual(rows(dashboardGridLayout(Array(5).fill(short))), [[7.2, 4.8], [4, 4, 4]]);
  assert.deepEqual(rows(dashboardGridLayout([trend, ranking, short, short, short])), [[4.8, 7.2], [4, 4, 4]]);
});

test('sparse trends do not take space away from long-label Top 10 lists', () => {
  const sparse = { ...short, chart_type: 'line' };
  assert.deepEqual(rows(dashboardGridLayout([sparse, ranking, ranking, short])), [[3.6, 8.4], [8.4, 3.6]]);
  assert.equal(chartLayoutProfile(trend).minSpan, 4.8);
  assert.equal(chartLayoutProfile({ ...short, chart_type: 'multi_line', series: [{}, {}, {}] }).minSpan, 3.6);
  assert.equal(chartLayoutProfile({ ...short, chart_type: 'heatmap' }).minSpan, 4.8);
});

test('large matrices and multi-series category plots receive a dedicated full row', () => {
  const matrix = { chart_type: 'heatmap', data: Array.from({ length: 168 }, (_, i) => ({ x: i % 24, y: Math.floor(i / 24), value: i })) };
  assert.deepEqual(rows(dashboardGridLayout([matrix, short, short, short])), [[12], [4, 4, 4]]);
  assert.equal(chartLayoutProfile({ ...trend, chart_type: 'grouped_bar', series: [{}, {}, {}, {}] }).minSpan, 12);
});

test('every row fills twelve columns at each breakpoint; chart order/data remain intact', () => {
  for (const columns of [1, 2, 3]) for (let count = 0; count <= 18; count++) {
    const charts = Array.from({ length: count }, (_, i) => ({ ...[short, ranking, short, trend, short][i % 5], id: `chart-${i}` }));
    const before = JSON.stringify(charts);
    const layout = dashboardGridLayout(charts, columns);
    assert.equal(layout.length, count);
    assert.deepEqual(layout.map(p => p.index), charts.map((_, i) => i));
    for (const row of rows(layout)) {
      assert.ok(row.length <= columns);
      assert.equal(row.reduce((sum, span) => sum + span, 0), 12);
    }
    assert.equal(JSON.stringify(charts), before);
  }
});

test('six realistic assistant charts mix asymmetric pairs, a 30/30/40 row and a full-width matrix',()=>{
  const series={...trend,chart_type:'multi_line',series:[{},{},{}]};
  const matrix={chart_type:'heatmap',data:Array.from({length:12},(_,i)=>({x:i%3,y:Math.floor(i/3),value:i}))};
  assert.deepEqual(rows(dashboardGridLayout([trend,ranking,short,{...short,chart_type:'donut'},series,matrix])),[[4.8,7.2],[3.6,3.6,4.8],[12]]);
});
