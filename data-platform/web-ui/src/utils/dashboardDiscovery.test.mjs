import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverDashboards, matchesDashboard, discoveryKinds } from './dashboardDiscovery.mjs';
import { geographicCharts, hasGeographicContext, mapRows, locateGeography, projectPoint, outlinePath } from './reportGeography.mjs';

test('store sales can open an owned supplementary map while non-geographic forecasts and archived store rankings do not claim a map',()=>{
 const report={session_id:'owned',revision:1,charts:[{x_field:'store',metric:'store_revenue'}]};
 assert.equal(hasGeographicContext(report),true);assert.equal(hasGeographicContext({...report,session_id:null}),false);
 assert.equal(hasGeographicContext({...report,charts:[{x_field:'period',metric:'revenue'}]}),false);
 assert.equal(hasGeographicContext({...report,charts:[{x_field:'payment_method',metric:'payment_revenue'}]}),false);
});

const items = [
  { id: 'D26', title: 'Topping & tuỳ chọn món', category: 'Kinh doanh', description: 'Số lần chọn topping', status: 'healthy' },
  { id: 'D36', title: 'Bản đồ doanh thu & đơn hàng', category: 'Kinh doanh', description: 'Doanh thu theo tỉnh/thành', status: 'healthy' },
  { id: 'D37', title: 'Bản đồ trải nghiệm cửa hàng', category: 'Khách hàng', description: 'Điểm và phản hồi', status: 'degraded' },
  { id: 'U_owned', title: 'Bài toán của tôi', category: 'Cá nhân', description: 'Theo dõi kinh doanh', custom: true },
];
test('discovery supports unaccented multi-term searches, topics, categories, kinds and custom reports', () => {
  assert.ok(matchesDashboard(items[1], 'DOANH THU ban do'));
  assert.ok(matchesDashboard(items[0], 'top san pham'));
  assert.deepEqual(discoverDashboards(items, { category: 'Khách hàng', kind: 'Bản đồ', search: 'diem danh gia' }).map(i => i.id), ['D37']);
  assert.deepEqual(discoverDashboards(items, { custom: true }).map(i => i.id), ['U_owned']);
  assert.equal(discoverDashboards(items, { search: 'bai toan khong ton tai' }).length, 0);
  assert.ok(discoveryKinds(items[1]).includes('Bản đồ'));
  assert.ok(!discoveryKinds({ id: 'D34', title: 'Giá bán', description: 'Dòng tiền ví chủ' }).includes('Bản đồ'));
  const snapshot = JSON.stringify(items); discoverDashboards(items, { sort: 'name' }); assert.equal(JSON.stringify(items), snapshot);
});

test('geographic aliases locate all governed city labels; unknown labels are not geocoded by guesswork', () => {
  for (const name of ['Hà Nội', 'TP. Hồ Chí Minh', 'hcm', 'Da Nang', 'Cần Thơ', 'Hải Phòng', 'Bắc Ninh', 'Nghệ An', 'Kiên Giang', 'An Giang', 'Hà Nam', 'Quảng Bình', 'Đắk Lắk', 'Ninh Thuận']) {
    const point = locateGeography(name, 'city'); assert.ok(point, name);
    const [x,y] = projectPoint(point.coordinates); assert.ok(x > 0 && x < 600 && y > 0 && y < 500);
  }
  assert.ok(locateGeography('Miền Trung', 'reporting_region'));
  assert.equal(locateGeography('Khách hàng ABC 123', 'city'), null);
  assert.ok(outlinePath().startsWith('M'));
});

test('maps preserve zero, missing and unknown values and do not aggregate regional averages', () => {
  const chart = { id: 'rating', x_field: 'city', unit: 'điểm', data: [{ label: 'Hà Nội', value: 4.5 }, { label: 'Đà Nẵng', value: 0 }, { label: 'Chưa xác định', value: 3.2 }, { label: 'Cần Thơ', value: null }] };
  const snapshot = structuredClone(chart);
  const maps = geographicCharts({ charts: [chart] });
  const rows = mapRows(maps[0]);
  assert.equal(rows.length, 4); assert.equal(rows[1].value, 0); assert.equal(rows[2].location, null); assert.equal(rows[3].value, null);
  assert.deepEqual(chart, snapshot);
  assert.equal(geographicCharts({ charts: [{ ...chart, value_transform: 'contribution_share' }, { ...chart, x_field: 'store' }] }).length, 0);
});

test('grouped metrics are split by verified series order without summing counts or turning absent cells into zero', () => {
  const chart = { id: 'sale', chart_type: 'grouped_bar', x_field: 'city', metrics: ['paused_sale_positions', 'sale_positions'],
    series: [{ key: 'series_1', label: 'Tạm ngừng' }, { key: 'series_2', label: 'Vị trí bán' }],
    data: [{ label: 'Hà Nội', series_1: 2, series_2: 12 }, { label: 'Đà Nẵng', series_1: null, series_2: 8 }] };
  const maps = geographicCharts({ charts: [chart] });
  assert.equal(maps.length, 2); assert.equal(maps[0].metric, 'paused_sale_positions'); assert.equal(maps[1].data[0].value, 12);
  assert.equal(maps[0].data[1].value, null);
  assert.equal(geographicCharts({ charts: [{ ...chart, series_field: 'store_type' }] }).length, 0);
});
