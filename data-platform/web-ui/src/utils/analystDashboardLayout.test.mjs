import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardCharts, dashboardPrimaryCharts, dashboardHighlights, initialChartType, chartAccent, compositionData, trendComparison, dashboardFindings, chartExplanation, reportHeading } from './analystDashboardLayout.mjs';

test('comparison retains columns even with concentration evidence', () => {
  const chart={scope_ref:'q',metric:'revenue',purpose:'comparison',chart_type:'bar',selection:'complete',data:[{label:'A',value:1},{label:'B',value:2}]};
  const evidence=[{scope_ref:'q',metric:'revenue',feature:'concentration',scope:{selection:'complete'},values:{total:3}}];
  assert.equal(dashboardCharts([chart],{evidence}).charts[0].chart_type,'bar');
});

test('main dashboard prioritizes existing validated families and retains detail views', () => {
  const charts=[...Array.from({length:7},(_,i)=>({id:i,chart_type:'bar',data:[i]})),{id:7,chart_type:'line',data:[1]},{id:8,chart_type:'donut',data:[2]}];
  const primary=dashboardPrimaryCharts(charts);
  assert.equal(primary.length,6);assert.ok(primary.includes(charts[7]));assert.ok(primary.includes(charts[8]));
  assert.equal(charts.length,9);assert.ok(primary.every(c=>charts.includes(c)));
});

test('refined report title follows current Top 2 meaning instead of original Top 5 prompt', () => {
  const report={analysis_spec:{},prompt:'Top 5 món',title:'Sản phẩm và thực đơn',semantic_intent:{requirements:[{ranking:{limit:2,direction:'top'}}]}};
  assert.equal(reportHeading(report),'Top 5 món');
  assert.equal(reportHeading({...report,provenance:{semantic_history:[{feedback:'Đổi thành Top 2'}]}}),'Top 2 · Sản phẩm và thực đơn');
});

test('identical displayed numbers alone never merge scopes or metric meanings', () => {
  const data = [{ label: 'A', value: 100 }];
  assert.equal(dashboardCharts([{ data }, { data }]).charts.length, 2);
  assert.equal(dashboardCharts([{ data, semantic_view_key: 'scope-a' }, { data, semantic_view_key: 'scope-b' }]).charts.length, 2);
  assert.equal(dashboardCharts([{ data, semantic_view_key: 'same' }, { data, semantic_view_key: 'same' }]).duplicateCount, 1);
});

test('long composition preserves the exact full total and explicitly groups the remainder', () => {
  const rows = Array.from({ length: 17 }, (_, i) => ({ label: 'Danh mục ' + i, value: i + 1 }));
  const grouped = compositionData(rows);
  assert.equal(grouped.data.length, 7); assert.equal(grouped.grouped_categories, 11);
  assert.equal(grouped.data.reduce((n, r) => n + r.value, 0), 153);
  const e = { scope_ref: 'd', metric: 'quantity', feature: 'concentration', values: { total: 153 }, scope: { selection: 'complete' } };
  const chart = { scope_ref: 'd', metric: 'quantity', chart_type: 'bar', selection: 'complete', data: rows };
  assert.equal(dashboardCharts([chart], { evidence: [e] }).charts[0].chart_type, 'donut');
  for (const selection of ['Top N', 'limited', 'display_subset']) assert.equal(dashboardCharts([{ ...chart, selection }], { evidence: [e] }).charts[0].chart_type, 'bar');
  assert.equal(dashboardCharts([chart], { evidence: [{ ...e, values: { total: 154 } }] }).charts[0].chart_type, 'bar');
});

test('legacy weekly findings and cards exclude both clipped boundary weeks', () => {
  const e = { id: 'change', scope_ref: 't', metric: 'q', feature: 'change', unit: 'sản phẩm', values: { first: 624, last: 274, change: -350, change_pct: -56.09 } };
  const report = { evidence: [e], key_findings: [{ evidence_id: e.id }], analysis_explanation: [{ query_id: 't', granularity: 'week', period: { start: '2026-07-01', end: '2026-09-30' }, metrics: [{ id: 'q', label: 'Sản lượng' }] }], charts: [{ scope_ref: 't', metric: 'q', chart_type: 'area', data: [['2026-06-29',624], ['2026-07-06',869], ['2026-09-21',663], ['2026-09-28',274]].map(([label,value]) => ({label,value})) }] };
  assert.equal(trendComparison(report, e).change, -206);
  assert.equal(trendComparison(report, e).excluded_partial_buckets, 2);
  assert.equal(dashboardHighlights(report)[0].value, -206 / 869 * 100);
  assert.ok(!dashboardFindings(report)[0].text.includes('56,09'));
  assert.ok(dashboardFindings(report)[0].text.includes('kỳ đầy đủ'));
  report.charts[0].data.splice(1,2);
  assert.equal(trendComparison(report, e), null); assert.deepEqual(dashboardFindings(report), []);
});

test('older reports deduplicate only validated expressions with matching complete query plans', () => {
  const base = { source: 'facts', joins: [], dimensions: ['city'], filters: [], period: { start: '2026-09-01', end: '2026-09-30' }, row_limit: 2000 };
  const plans = [{ ...base, id: 'a', metric_expressions: { revenue: 'SUM(amount)' } }, { ...base, id: 'b', metric_expressions: { sales: 'SUM(amount)' } }];
  const charts = [{ query_id: 'a', metric: 'revenue', x_field: 'city', chart_type: 'bar' }, { query_id: 'b', metric: 'sales', x_field: 'city', chart_type: 'bar' }];
  assert.equal(dashboardCharts(charts, { query_plans: plans }).charts.length, 1);
  for (const change of [{ period: { start: '2026-10-01' } }, { filters: [{ city: 'different' }] }, { metric_expressions: { sales: 'AVG(amount)' } }]) {
    assert.equal(dashboardCharts(charts, { query_plans: [plans[0], { ...plans[1], ...change }] }).charts.length, 2);
  }
});

test('highlights use certified maxima without summing distinct counts or averages', () => {
  const report = { evidence: [{ id: 'max', scope_ref: 'a', feature: 'group_comparison', metric: 'buyers', unit: 'khách', values: { largest_value: 7, largest: 'Chi nhánh A' } }], analysis_explanation: [{ query_id: 'a', metrics: [{ id: 'buyers', label: 'Khách mua hàng' }] }] };
  const cards = dashboardHighlights(report);
  assert.equal(cards[0].value, 7); assert.equal(cards[0].label, 'Khách mua hàng cao nhất');
  assert.equal(cards[0].sub_text, 'Chi nhánh A'); assert.ok(!cards[0].label.includes('Tổng'));
});

test('presentation respects actual chart types and applies a stable metric palette', () => {
  assert.equal(initialChartType({ chart_type: 'bar', data: [{ label: 'Một tên chi nhánh rất dài' }] }), 'horizontal_bar');
  for (const chart_type of ['line', 'area', 'donut', 'scatter', 'heatmap']) assert.equal(initialChartType({ chart_type, data: [] }), chart_type);
  assert.equal(chartAccent({ metric: 'revenue' }), chartAccent({ metric: 'revenue', title: 'another scope' }));
});

test('chart explanations distinguish ranking, whole composition, preview and partial weeks', () => {
  assert.match(chartExplanation({title:'Top 10 — Số lượng sản phẩm bán', selection:'Top N', x_label:'Sản phẩm'}), /tập Top N/);
  assert.match(chartExplanation({title:'Doanh thu sản phẩm',chart_type:'horizontal_bar', selection:'display_subset', displayed_count:20,population_count:118}), /20\/118 nhóm/);
  assert.match(chartExplanation({title:'Số lượng sản phẩm bán', chart_type:'donut',population_count:17,x_label:'Danh mục'}), /toàn bộ 17 nhóm/);
  const trend = {title:'Số lượng sản phẩm bán theo tuần',chart_type:'area',granularity:'week',period:{start:'2026-07-01',end:'2026-09-30'},data:[{label:'2026-06-29',value:624}]};
  assert.match(chartExplanation(trend), /điểm rỗng.*tuần chưa đủ ngày/);
  assert.match(chartExplanation({...trend, period:{}}), /mỗi điểm là một tuần/);
  assert.match(chartExplanation({chart_type:'scatter',x_label:'Giá',y_label:'Sản lượng'}), /không khẳng định nguyên nhân/);
});

test('quantity companion preserves revenue cohort and does not claim quantity ranking', () => {
  const html=chartExplanation({title:'Top 5 — Số lượng sản phẩm bán trong tập xếp hạng theo Doanh thu sản phẩm',
    selection:'Top N',metric:'quantity_sold',metrics:['quantity_sold'],ranking_metric:'product_revenue',
    ranking_metric_label:'Doanh thu sản phẩm',ranking_limit:5,x_label:'Sản phẩm'});
  assert.match(html,/tập Top 5 được chọn theo doanh thu sản phẩm/);
  assert.match(html,/giữ nguyên thứ tự theo doanh thu sản phẩm/);
  assert.match(html,/không xếp hạng lại/);
  assert.doesNotMatch(html,/Xếp hạng theo số lượng/);
});

test('contribution view keeps full-scope percentage distinct from raw revenue', () => {
  const raw={metric:'product_revenue',semantic_view_key:'raw',chart_type:'horizontal_bar',selection:'Top N',data:[{label:'A',value:7920000}]};
  const share={...raw,semantic_view_key:'share',value_transform:'contribution_share',unit:'%',data:[{label:'A',value:2.18}],denominator_note:'Tỷ trọng theo tổng đầy đủ 362.895.000 VND.'};
  assert.equal(dashboardCharts([raw,share]).charts.length,2);
  assert.equal(chartExplanation(share),share.denominator_note);
});

test('business overview keeps a finding for every requested scope including the fifth trend', () => {
  const evidence = Array.from({length:5}, (_,i) => ({id:'e'+i,scope_ref:'q'+i,feature:'group_comparison',values:{largest:'Nhóm '+i,largest_value:100+i},unit:'VND'}));
  const report = {evidence,key_findings:[{evidence_id:'e0'},...evidence.map(e=>({evidence_id:e.id}))]};
  const findings=dashboardFindings(report);
  assert.equal(findings.length,5);
  assert.equal(new Set(findings.map(f=>f.scope_ref)).size,5);
  assert.ok(findings.some(f=>f.evidence_id==='e4'));
  assert.match(chartExplanation({chart_type:'scatter',observation_label:'Chi nhánh',x_label:'Doanh thu',y_label:'AOV'}), /một chi nhánh.*doanh thu.*aov/);
});

test('a fifth business scope cannot push revenue movement out of all four KPI cards', () => {
  const evidence=Array.from({length:4}, (_,i)=>({id:'e'+i,scope_ref:'q'+i,feature:'group_comparison',values:{largest:'Nhóm '+i,largest_value:100},unit:'VND'}));
  evidence.push({id:'change',scope_ref:'trend',feature:'change',unit:'VND',values:{comparison_basis:'complete_buckets',first:100,last:80,first_period:'2026-07-06',last_period:'2026-09-21',change_pct:-20}});
  const cards=dashboardHighlights({evidence});
  assert.equal(cards.length,4);
  assert.ok(cards.some(c=>c.evidence_id==='change' && c.value===-20));
});

test('a complementary scatter does not move its primary business KPI behind other scopes', () => {
  const evidence=Array.from({length:5},(_,i)=>({id:'e'+i,scope_ref:'q'+i,feature:'group_comparison',values:{largest:'Nhóm '+i,largest_value:100+i}}));
  const charts=[...evidence.map(e=>({scope_ref:e.scope_ref,chart_type:'horizontal_bar'})),{scope_ref:'q0',chart_type:'scatter'}];
  const cards=dashboardHighlights({charts,evidence,analysis_explanation:evidence.map(e=>({query_id:e.scope_ref}))});
  assert.equal(cards[0].scope_ref,'q0');
  const findings=dashboardFindings({evidence:[{id:'p',feature:'concentration',values:{largest:'THANH_TOAN_KHI_NHAN_HANG',largest_share_pct:36}}],key_findings:[{evidence_id:'p'}]});
  assert.match(findings[0].text,/Thanh toán khi nhận hàng/);
});
