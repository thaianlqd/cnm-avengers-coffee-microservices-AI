import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartGridSpans } from './analystDashboardLayout.mjs';

test('a one-point trend and compact composition receive proportional space; data and order stay intact', () => {
  const charts = [{ id: 'time', chart_type: 'line', data: [{label:'2026-09-01',value:null}] },
    { id: 'share', chart_type: 'donut', data: [{label:'A',value:12},{label:'B',value:4}] }];
  const before = structuredClone(charts);
  assert.deepEqual(chartGridSpans(charts), ['col-span-1 xl:col-span-7','col-span-1 xl:col-span-5']);
  assert.deepEqual(charts, before);
  assert.deepEqual(chartGridSpans([...charts].reverse()), ['col-span-1 xl:col-span-5','col-span-1 xl:col-span-7']);
});

test('dense peers share a row; an unpaired or single chart fills it', () => {
  const charts = [{chart_type:'heatmap'}, {chart_type:'multi_line'}, {chart_type:'donut'}];
  assert.deepEqual(chartGridSpans(charts), ['col-span-1 xl:col-span-5','col-span-1 xl:col-span-4','col-span-1 xl:col-span-3']);
  assert.deepEqual(chartGridSpans(charts.slice(2)), ['col-span-1 xl:col-span-12']);
  assert.deepEqual(chartGridSpans([]), []);
});

test('long labels and large populations receive room without hiding rows', () => {
  const chart = { chart_type:'horizontal_bar', data:Array.from({length:20}, (_,i)=>({label:`Chi nhánh ${i}`,value:i})) };
  assert.deepEqual(chartGridSpans([chart,{chart_type:'donut'}]), ['col-span-1 xl:col-span-8','col-span-1 xl:col-span-4']);
  assert.equal(chart.data.length, 20);
  assert.deepEqual(chartGridSpans([{chart_type:'area'},chart]), ['col-span-1 xl:col-span-5','col-span-1 xl:col-span-7']);
});
