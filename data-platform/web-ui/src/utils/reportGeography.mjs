import geography from '../data/vietnamGeography.json' with { type: 'json' };
import { foldSearch } from './dashboardDiscovery.mjs';

const key = label => foldSearch(label).replace(/^(tinh|thanh pho|tp)\s+/, '').replace(/^tp\s+/, '');
const indexes = Object.fromEntries([['city',geography.cities],['reporting_region',geography.regions]].map(([dimension,places]) => {
  const index = new Map();
  for (const place of places) for (const alias of [place.label,...place.aliases]) {
    const normalized = key(alias), previous = index.get(normalized);
    index.set(normalized, previous && previous.label !== place.label ? null : place);
  }
  return [dimension,index];
}));
export function locateGeography(label, dimension) {
  return indexes[dimension === 'reporting_region' ? 'reporting_region' : 'city'].get(key(label)) || null;
}
export function geographicCharts(report) {
  // One geographic dimension. Series keyed by another category are not geographic observations.
  // Grouped METRIC series can be viewed individually without summing or averaging them.
  return (report.charts || []).filter(chart => ['city','reporting_region'].includes(chart.x_field)
    && !chart.series_field && !chart.value_transform && chart.chart_type !== 'stacked_100')
    .flatMap(chart => chart.series?.length
      ? (chart.metrics?.length === chart.series.length ? chart.series : []).map((series, index) => ({ ...chart,
        id: `${chart.id}:${series.key}`, title: `${series.label} theo ${chart.x_label || 'địa bàn'}`, metric: chart.metrics[index],
        series: [], data: (chart.data || []).map(row => ({ ...row, value: row[series.key] })) }))
      : [chart])
    .filter(chart => chart.data?.some(row => Number.isFinite(row.value)));
}
/** Direct geographic results or a supplementary store network in the owned period.
 * A Top N store result remains Top N; its network explorer is labelled separately.
 */
export function hasGeographicContext(report={}) {
  if(geographicCharts(report).length)return true;
  return Boolean(report.session_id&&report.revision&&(report.charts||[]).some(chart=>
    ['store','store_id','store_type'].includes(chart.x_field)
    &&[chart.metric,...(chart.metrics||[])].some(metric=>['store_revenue','store_order_count','store_aov','revenue','order_count','valid_order_count'].includes(metric))));
}
export function mapRows(chart) {
  return (chart.data || []).map((row, index) => ({ ...row, index, location: locateGeography(row.label, chart.x_field) }));
}
export function projectPoint([longitude, latitude]) { return [140 + (longitude - 102) * 29, 20 + (24 - latitude) * 29]; }
export function outlinePath() {
  const polygons = geography.outline.type === 'Polygon' ? [geography.outline.coordinates] : geography.outline.coordinates;
  return polygons.flatMap(polygon => polygon.map(ring => ring.map((point,index) => `${index ? 'L' : 'M'}${projectPoint(point).map(v => v.toFixed(2)).join(',')}`).join(' ') + 'Z')).join(' ');
}
/** Provinces selected by a Top/Bottom N city ranking (I02). The map summary,
 * pins and directory default to this cohort; the wider network is opt-in context. */
export function rankedCohort(report={}) {
  const chart=(report.charts||[]).find(c=>c.x_field==='city'&&['Top N','Bottom N'].includes(c.selection)&&!c.series_field);
  if(!chart)return null;
  const labels=new Set((chart.data||[]).map(row=>locateGeography(row.label,'city')?.label||row.label));
  const n=chart.ranking_limit||labels.size;
  return {label:`${chart.selection==='Bottom N'||chart.ranking_direction==='ASC'?'Bottom':'Top'} ${n}`,labels};
}
export function inCohort(cohort,city){return !cohort||cohort.labels.has(locateGeography(city,'city')?.label||city);}
export function cohortSummary(provinces=[],cohort){
  const rows=provinces.filter(p=>inCohort(cohort,p.label||p.city));
  const sum=f=>rows.reduce((t,p)=>t+(Number.isFinite(p[f])?p[f]:0),0);
  const revenue=sum('revenue'),orders=sum('orders');
  const validOrders=rows.every(p=>Number.isInteger(p.valid_orders)&&p.valid_orders>=0)?sum('valid_orders'):null;
  return {revenue,orders,valid_orders:validOrders,aov:validOrders?revenue/validOrders:null,
    store_count:sum('store_count'),province_count:rows.filter(p=>p.store_count>0).length};
}
