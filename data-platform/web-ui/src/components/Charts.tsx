import { businessCategory, categoryColor, compositionData, bucketCoverage, conciseChartTitle } from '../utils/analystDashboardLayout.mjs';
import { formatChartValue } from '../utils/aiChartConfig.mjs';
import React, { useEffect, useId, useRef, useState } from 'react';
import { axisInset, monotonePath, timeSegments, timePositions } from '../utils/plotGeometry.mjs';

const axisValue = (value: number) => {
  const magnitude = Math.abs(value);
  const scale = magnitude >= 1e9 ? [1e9, 'tỷ'] : magnitude >= 1e6 ? [1e6, 'triệu'] : magnitude >= 1e3 ? [1e3, 'nghìn'] : [1, ''];
  return `${(value / Number(scale[0])).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${scale[1]}`.trim();
};
const tickIndices = (count: number, maximum = 5) => [...new Set(Array.from({ length: Math.min(count, maximum) }, (_, i) => Math.round(i * (count - 1) / Math.max(1, Math.min(count, maximum) - 1))))];
const timeTick = (label: string, crossYear: boolean) => /^\d{4}-\d{2}-\d{2}/.test(String(label)) ? `${label.slice(8, 10)}/${label.slice(5, 7)}${crossYear ? '/' + label.slice(2, 4) : ''}` : String(label).slice(0, 12);

// Keep labels at a readable size while the plot fills its card without growing taller.
const PLOT_HEIGHT = 214;
const SeriesVisibilityNote: React.FC<{ labels: string[] }> = ({ labels }) => labels.length ?
  <p data-series-visibility role="status" className="text-xs text-slate-500 mb-2">Đang ẩn trên hình: {labels.join(', ')}. Số liệu, mẫu số và nhận định giữ nguyên; dùng “Xem riêng” để đổi phạm vi biểu đồ.</p> : null;
function usePlotWidth() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(620);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(240, Math.round(element.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Signed grouped/stacked series. Missing observations remain missing. */
export const SeriesBarChart: React.FC<{ data: any[]; series: any[]; stacked?: boolean; percentage?: boolean; unit?: string; onInspect?: (row: any) => void }> = ({ data, series, stacked = false, percentage = false, unit = '', onInspect }) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [page,setPage]=useState(1),pageSize=series.length>1?8:10;
  const pages=Math.max(1,Math.ceil(data.length/pageSize)),activePage=Math.min(page,pages),visible=data.slice((activePage-1)*pageSize,activePage*pageSize);
  const active = series.filter(s => !hidden[s.key]);
  const { ref, width: plotWidth } = usePlotWidth();
  if (!data.length) return <p>Không có dữ liệu trong phạm vi này.</p>;
  const values = data.flatMap(row => active.map(s => row[s.key]).filter(Number.isFinite));
  const sums = data.map(row => active.reduce((sum, s) => sum + (Number.isFinite(row[s.key]) ? row[s.key] : 0), 0));
  const low = Math.min(0, ...values), high = percentage ? 100 : Math.max(0, ...(stacked ? sums : values));
  const left=axisInset([low,(low+high)/2,high].map(axisValue));
  const span = high - low || 1, y = (value: number) => (PLOT_HEIGHT - 38) - (value - low) / span * (PLOT_HEIGHT - 62);
  const slot = (plotWidth-left-20) / visible.length;
  return <div className="w-full min-w-0">
    <div className="flex flex-wrap gap-2 text-xs mb-3">{(series.length > 1 ? series : []).map(s => <button key={s.key} onClick={() => setHidden({ ...hidden, [s.key]: !hidden[s.key] })} aria-pressed={!hidden[s.key]} className={hidden[s.key] ? 'opacity-50 line-through' : ''} style={{ color: s.color }}>{s.label}</button>)}</div>
    <SeriesVisibilityNote labels={series.filter(s => hidden[s.key]).map(s => s.label)} />
    <svg ref={ref} viewBox={`0 0 ${plotWidth} ${PLOT_HEIGHT}`} style={{ height: PLOT_HEIGHT }} role="img" aria-label={stacked ? 'Biểu đồ cột chồng' : 'Biểu đồ cột nhóm'} className="w-full">
      <line x1={left} x2={plotWidth - 18} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
      {[low, (low + high) / 2, high].map((v, i) => <g key={i}><line x1={left} x2={plotWidth - 18} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 6" /><text data-y-tick x={left-12} y={y(v)+4} textAnchor="end" fontSize="11" fill="#64748b">{axisValue(v)}</text></g>)}
      {visible.map((row, i) => { let offset = 0; return <g key={i}>{active.map((s, j) => {
        const v = row[s.key]; if (!Number.isFinite(v)) return null;
        const start = stacked ? offset : 0; if (stacked) offset += v;
        const groups=stacked?1:Math.max(active.length,1),width=Math.min(48,slot*.72/groups);
        const x = left + i*slot+(slot-width*groups)/2+(stacked?0:j*width);
        return <rect role={row.entity_ref && onInspect ? 'button' : undefined} aria-label={row.entity_ref && onInspect ? `Xem nhóm ${row.label}` : undefined} onClick={() => row.entity_ref && onInspect?.(row)} onKeyDown={event => { if (row.entity_ref && onInspect && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onInspect(row); } }} key={s.key} x={x} y={Math.min(y(start), y(start + v))} width={Math.max(1, width - 2)} height={Math.abs(y(start + v) - y(start))} rx={3} tabIndex={0} className="outline-none transition-opacity duration-150 motion-reduce:transition-none hover:opacity-80 focus:opacity-80" fill={active.length === 1 ? row.color || s.color || '#2563eb' : s.color || '#2563eb'}><title>{`${row.label}: ${s.label} — ${formatChartValue(v, unit ? ` ${unit}` : '')}`}</title></rect>;
      })}<text x={left + (i+.5)*slot} y={PLOT_HEIGHT - 12} fontSize="11" fill="#64748b" textAnchor="middle"><title>{row.label}</title>{tickIndices(visible.length, Math.min(8, Math.max(2, Math.floor(plotWidth / 85)))).includes(i) ? String(row.label).slice(0, 12) : ''}</text></g>; })}
    </svg>
    {pages>1&&<nav aria-label="Trang nhóm biểu đồ cột" className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><span>{(activePage-1)*pageSize+1}–{Math.min(activePage*pageSize,data.length)}/{data.length} nhóm · cùng thang giá trị</span><div className="flex gap-3"><button type="button" aria-label="Nhóm cột trước" disabled={activePage===1} onClick={()=>setPage(activePage-1)} className="disabled:opacity-30">←</button><button type="button" aria-label="Nhóm cột tiếp theo" disabled={activePage===pages} onClick={()=>setPage(activePage+1)} className="disabled:opacity-30">→</button></div></nav>}
  </div>;
};

export const ScatterChart: React.FC<{ data: any[]; xLabel?: string; yLabel?: string; xUnit?: string; yUnit?: string }> = ({ data, xLabel = '', yLabel = '', xUnit = '', yUnit = '' }) => {
  const { ref, width: plotWidth } = usePlotWidth();
  const rows = data.filter(r => Number.isFinite(r.x) && Number.isFinite(r.y));
  if (!rows.length) return <p>Không có quan sát ghép cặp.</p>;
  const xs = rows.map(r => r.x), ys = rows.map(r => r.y);
  const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys), spanX = Math.max(...xs) - minX || 1, spanY = Math.max(...ys) - minY || 1;
  const left=axisInset([minY,minY+spanY/2,minY+spanY].map(axisValue));
  const x = (v: number) => left + (v - minX) / spanX * (plotWidth-left-22), y = (v: number) => (PLOT_HEIGHT - 45) - (v - minY) / spanY * (PLOT_HEIGHT - 75);
  return <svg ref={ref} viewBox={`0 0 ${plotWidth} ${PLOT_HEIGHT}`} style={{ height: PLOT_HEIGHT }} role="img" aria-label="Biểu đồ phân tán — liên hệ quan sát" className="w-full">
    {[0, .5, 1].map((fraction, i) => <g key={i}>
      <line x1={left} x2={plotWidth - 22} y1={y(minY + fraction * spanY)} y2={y(minY + fraction * spanY)} stroke="#e2e8f0" strokeDasharray="3 6" />
      <text data-y-tick x={left-12} y={y(minY + fraction * spanY) + 4} textAnchor="end" fontSize="11" fill="#64748b">{axisValue(minY + fraction * spanY)}</text>
      <text x={x(minX + fraction * spanX)} y={PLOT_HEIGHT - 26} textAnchor="middle" fontSize="11" fill="#64748b">{axisValue(minX + fraction * spanX)}</text>
    </g>)}
    <path d={`M ${left} 30 V ${PLOT_HEIGHT - 45} H ${plotWidth - 22}`} fill="none" stroke="#94a3b8" />
    {rows.map((r, i) => <circle key={i} cx={x(r.x)} cy={y(r.y)} r={rows.length > 100 ? 3 : 5} fill="#0891b2" opacity={rows.length > 100 ? .45 : .75}><title>{`${r.label}: ${formatChartValue(r.x, ` ${xUnit}`)} / ${formatChartValue(r.y, ` ${yUnit}`)}`}</title></circle>)}
    <text x={(left+plotWidth-22) / 2} y={PLOT_HEIGHT - 4} textAnchor="middle" fontSize="11" fill="#475569">{xLabel} ({xUnit})</text><text x={left} y="17" fontSize="11" fill="#475569">{yLabel} ({yUnit})</text>
  </svg>;
};

// V3.2 risk threshold (server-governed): red = breach, amber = within warning margin, green = healthy.
const RISK_COLORS = { red: '#e11d48', amber: '#f59e0b', green: '#10b981' };
export function riskTone(value: number, threshold?: any) {
  if (!threshold || !Number.isFinite(value)) return null;
  const { value: t, operator, margin = 0 } = threshold;
  const above = operator === 'gt' || operator === 'gte';
  const breach = operator === 'gt' ? value > t : operator === 'gte' ? value >= t : operator === 'lt' ? value < t : value <= t;
  if (breach) return 'red';
  return (above ? value >= t - margin : value <= t + margin) && margin > 0 ? 'amber' : 'green';
}

export const AnalystHorizontalBars: React.FC<{ data: any[]; unit: string; color: string; ranking?: boolean; threshold?: any; onInspect?: (row: any) => void }> = ({ data, unit, color, ranking, threshold, onInspect }) => {
  const [page, setPage] = useState(1);
  const pageSize = 10, pages = Math.max(1, Math.ceil(data.length / pageSize)), activePage = Math.min(page, pages);
  const values = [...data.map(r => r.value), ...(threshold ? [threshold.value] : [])].filter(Number.isFinite);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 1, origin = -low / span * 100;
  const mark = threshold ? (threshold.value - low) / span * 100 : null;
  return <div className="w-full">
    {threshold && <p className="mb-3 text-[11px] text-slate-500"><span className="inline-block w-3 border-t-2 border-dashed border-slate-500 align-middle mr-1" />Ngưỡng {threshold.label}: {threshold.symbol} {formatChartValue(threshold.value, unit ? ` ${unit}` : '')} · <span style={{ color: RISK_COLORS.red }}>■</span> vượt ngưỡng <span style={{ color: RISK_COLORS.amber }}>■</span> sát ngưỡng <span style={{ color: RISK_COLORS.green }}>■</span> an toàn</p>}
    <div className="space-y-1">{data.slice((activePage - 1) * pageSize, activePage * pageSize).map((row: any, i: number) => { const tone = riskTone(row.value, threshold); return <div key={i} tabIndex={0} role={row.entity_ref && onInspect ? 'button' : undefined} onClick={() => row.entity_ref && onInspect?.(row)} onKeyDown={event => { if (row.entity_ref && onInspect && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onInspect(row); } }} aria-label={`${row.entity_ref && onInspect ? 'Xem nhóm ' : ''}${row.label}: ${formatChartValue(row.value, unit ? ` ${unit}` : '')}${tone === 'red' ? ' — vượt ngưỡng' : ''}`} data-risk-tone={tone || undefined} className="group grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_4.5rem] gap-2 items-center text-[11px] min-h-[18px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" title={`${row.label}: ${formatChartValue(row.value, unit ? ` ${unit}` : '')}`}>
      <div className="text-slate-600 leading-4 truncate">{ranking && <span className="text-slate-400 mr-2">{row.rank_position ?? (activePage - 1) * pageSize + i + 1}.</span>}{row.label}</div>
      <div className="relative h-2.5 rounded-full bg-slate-100"><span className="absolute inset-y-0 rounded-full transition-[filter] duration-150 motion-reduce:transition-none group-hover:brightness-90" style={{ left: `${row.value < 0 ? origin + row.value / span * 100 : origin}%`, width: `${Math.abs(row.value) / span * 100}%`, background: tone ? RISK_COLORS[tone as keyof typeof RISK_COLORS] : row.color || color }} />{low < 0 && <span className="absolute -top-1 h-4 border-l border-slate-400" style={{ left: `${origin}%` }} />}{mark != null && <span data-risk-threshold className="absolute -top-1.5 h-5 border-l-2 border-dashed border-slate-600" style={{ left: `${mark}%` }} />}</div>
      <span className="text-slate-700 font-medium tabular-nums text-right whitespace-nowrap">{unit === '%' ? `${row.value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%` : axisValue(row.value)}</span>
    </div>; })}</div>
    {pages > 1 && <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400"><span>{(activePage - 1) * pageSize + 1}–{Math.min(activePage * pageSize, data.length)}/{data.length} nhóm hiển thị</span><div className="flex gap-3"><button aria-label="Nhóm trước" disabled={activePage === 1} onClick={() => setPage(activePage - 1)} className="disabled:opacity-25 text-slate-600">←</button><button aria-label="Nhóm tiếp theo" disabled={activePage === pages} onClick={() => setPage(activePage + 1)} className="disabled:opacity-25 text-slate-600">→</button></div></div>}
  </div>;
};

/** Pareto (FINAL P4): server-computed share of the FULL total per group + cumulative share, largest first.
 * Only the display subset is listed; shares/cumulative always use the complete population total. */
export const ParetoChart: React.FC<{ data: any[]; populationCount?: number; displayedCount?: number }> = ({ data, populationCount, displayedCount }) => {
  if (!data.length) return <p>Không có dữ liệu trong phạm vi này.</p>;
  const top = Math.max(...data.map(r => Number(r.value) || 0), 1);
  return <div data-pareto className="text-xs">
    <div className="grid grid-cols-[minmax(6rem,1fr)_minmax(5rem,2fr)_auto] gap-x-2 gap-y-1.5 items-center">
      {data.map((r: any, i: number) => <React.Fragment key={i}>
        <div className="truncate text-slate-600" title={r.label}>{i + 1}. {r.label}</div>
        <div className="relative h-2.5 rounded-full bg-slate-100"><span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${Math.max(1, (Number(r.value) || 0) / top * 100)}%` }} /></div>
        <div className="tabular-nums text-right whitespace-nowrap text-slate-700"><b>{Number(r.value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</b><span className="text-slate-400"> · lũy kế {Number(r.cumulative_pct).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span></div>
      </React.Fragment>)}
    </div>
    {populationCount && displayedCount && populationCount > displayedCount ? <p className="mt-2 text-[11px] text-slate-500">{displayedCount}/{populationCount} nhóm lớn nhất; tỷ trọng tính trên tổng của toàn bộ {populationCount} nhóm.</p> : null}
  </div>;
};

export const AnalystChart: React.FC<{ chart: any; onInspect?: (row: any) => void }> = ({ chart, onInspect }) => {
  const data = (chart.data || []).map((r: any, i: number) => ({ ...r, color: r.color || categoryColor(r.label, i), label: r.label == null ? r.label : businessCategory(r.label) })), unit = chart.unit || '', color = chart.accent_color || '#2563eb';
  if (chart.chart_type === 'kpi') return <div data-view-kpi className="py-6 text-center"><p className="text-3xl font-semibold tabular-nums text-slate-900">{formatChartValue(chart.data?.[0]?.value, unit ? ` ${unit}` : '')}</p><p className="mt-1 text-xs text-slate-500">{chart.caption || chart.data?.[0]?.label}</p></div>;
  if (['grouped_bar', 'stacked_bar', 'stacked_100'].includes(chart.chart_type)) return <SeriesBarChart data={data} series={chart.series || []} stacked={chart.chart_type !== 'grouped_bar'} percentage={chart.chart_type === 'stacked_100'} unit={unit} />;
  if (chart.chart_type === 'pareto') return <ParetoChart data={data} populationCount={chart.population_count} displayedCount={chart.displayed_count} />;
  if (chart.chart_type === 'scatter') return <ScatterChart data={data} xLabel={chart.x_label} yLabel={chart.y_label} xUnit={unit} yUnit={chart.y_unit} />;
  if (chart.chart_type === 'heatmap') return <HeatmapChart data={data} valueSuffix={unit ? ` ${unit}` : ''} xLabel={chart.x_label || 'Chiều phân tích'} yLabel={chart.series_label || 'Nhóm phân tích'} />;
  if (chart.chart_type === 'multi_line') return <SeriesLineChart data={data} series={chart.series || []} unit={unit} granularity={chart.granularity} period={chart.period} />;
  if (chart.chart_type === 'donut') return <DonutChart data={chart.grouped_categories ? data : compositionData(data).data} centerLabel={chart.population_scope === 'ranked_cohort' && chart.cohort_label ? `Tổng trong ${chart.cohort_label}` : 'Tổng trong phạm vi'} valueSuffix={unit ? ` ${unit}` : ''} size={170} />;
  if (chart.chart_type === 'horizontal_bar' || (chart.risk_threshold && chart.chart_type === 'bar')) return <AnalystHorizontalBars data={data} unit={unit} color={color} ranking={chart.selection === 'Top N' || chart.selection === 'Bottom N'} threshold={chart.risk_threshold} onInspect={onInspect} />;
  if (['line', 'area'].includes(chart.chart_type)) return <SeriesLineChart data={data.map((r: any) => ({ label: r.label, series_1: r.value }))} series={[{ key: 'series_1', label: conciseChartTitle(chart), color }]} unit={unit} area={chart.chart_type === 'area'} granularity={chart.granularity} period={chart.period} />;
  return <SeriesBarChart data={data.map((r: any) => ({ ...r, series_1: r.value, color: r.color || color }))} series={[{ key: 'series_1', label: conciseChartTitle(chart), color }]} unit={unit} onInspect={onInspect} />;
};

export const SeriesLineChart: React.FC<{ data: any[]; series: any[]; unit?: string; area?: boolean; granularity?: string; period?: any }> = ({ data, series, unit = '', area = false, granularity, period }) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hover,setHover]=useState<number|null>(null),gradient=useId().replace(/:/g,'');
  const active = series.filter(s => !hidden[s.key]);
  const { ref, width: plotWidth } = usePlotWidth();
  const values = data.flatMap(row => active.map(s => row[s.key]).filter(Number.isFinite));
  if (!data.length) return <p>Không có dữ liệu trong phạm vi này.</p>;
  const positions=timePositions(data);
  if(!positions)return <div><p role="status">Thời gian chưa theo thứ tự hoặc không hợp lệ; hiển thị bảng dữ liệu quan sát.</p><table><tbody>{data.map((r,i)=><tr key={i}><th>{r.label}</th>{active.map(s=><td key={s.key}>{formatChartValue(r[s.key],unit?` ${unit}`:'')}</td>)}</tr>)}</tbody></table></div>;
  const low = Math.min(0, ...values), high = Math.max(0, ...values), span = high - low || 1;
  const ticks=[low,(low+high)/2,high],left=axisInset(ticks.map(axisValue));
  const x = (i: number) => left + positions[i] * (plotWidth-left-20), y = (v: number) => (PLOT_HEIGHT - 36) - (v - low) / span * (PLOT_HEIGHT - 62);
  const coverage = data.map(r => bucketCoverage(r.label, granularity, period));
  const periodNote = (i: number) => coverage[i]?.partial ? ` · Kỳ chưa đủ ngày: ${[coverage[i].start, period?.start].filter(Boolean).sort().slice(-1)[0]} → ${[coverage[i].end, period?.end].filter(Boolean).sort()[0]}` : '';
  const pathFor=(indices:number[],key:string)=>monotonePath(indices.map(i=>({x:x(i),y:y(data[i][key])})));
  return <div className="time-series-chart w-full relative" onMouseLeave={()=>setHover(null)}><div className="time-series-legend">{(series.length > 1 ? series : []).map(s => <button key={s.key} aria-pressed={!hidden[s.key]} className={hidden[s.key] ? 'opacity-50 line-through' : ''} onClick={() => setHidden({ ...hidden, [s.key]: !hidden[s.key] })}><i style={{background:s.color}}/>{s.label}</button>)}</div>
    <SeriesVisibilityNote labels={series.filter(s => hidden[s.key]).map(s => s.label)} />
    <svg ref={ref} viewBox={`0 0 ${plotWidth} ${PLOT_HEIGHT}`} style={{ height: PLOT_HEIGHT }} role="img" aria-label="Biểu đồ theo thời gian" className="w-full" onPointerMove={event=>{const bounds=event.currentTarget.getBoundingClientRect(),pointer=(event.clientX-bounds.left)*plotWidth/bounds.width;setHover(positions.reduce((best:number,_:number,i:number)=>Math.abs(x(i)-pointer)<Math.abs(x(best)-pointer)?i:best,0));}}>
      <defs>{active.map((s,i)=><linearGradient key={s.key} id={`${gradient}-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color||'#2563eb'} stopOpacity=".18"/><stop offset="100%" stopColor={s.color||'#2563eb'} stopOpacity=".015"/></linearGradient>)}</defs>
      {ticks.map((v, i) => <g key={i}><line x1={left} x2={plotWidth - 18} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 6" /><text data-y-tick x={left-12} y={y(v)+4} textAnchor="end" fontSize="11" fill="#64748b">{axisValue(v)}</text></g>)}
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1="22" y2={PLOT_HEIGHT-36} stroke="#94a3b8" strokeDasharray="3 4"/>}
      {active.map((s,seriesIndex) => {
        const segments=timeSegments(data,s.key,coverage,granularity),areaSegments=timeSegments(data,s.key,[],granularity).solid;
        return <g key={s.key}>{area && areaSegments.map((indices:number[],i:number)=><path data-series-area key={i} d={`${pathFor(indices,s.key)} L ${x(indices[indices.length-1])} ${y(0)} L ${x(indices[0])} ${y(0)} Z`} fill={`url(#${gradient}-${seriesIndex})`}/>)}
          {segments.solid.map((indices:number[],i:number)=><path data-series-line key={`solid-${i}`} d={pathFor(indices,s.key)} fill="none" stroke={s.color||'#2563eb'} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>)}
          {segments.partial.map((indices:number[],i:number)=><path data-partial-segment key={`partial-${i}`} d={pathFor(indices,s.key)} fill="none" stroke={s.color||'#2563eb'} strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round"/>)}
          {data.map((r,i)=>Number.isFinite(r[s.key])?<circle key={i} cx={x(i)} cy={y(r[s.key])} r={hover===i?4.5:coverage[i]?.partial?3.5:2.5} fill={coverage[i]?.partial?'white':s.color||'#2563eb'} stroke={hover===i?'#fff':s.color||'#2563eb'} strokeWidth={hover===i?2:1.4} tabIndex={0} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)}><title>{`${r.label}: ${s.label} — ${formatChartValue(r[s.key],unit?` ${unit}`:'')}${periodNote(i)}`}</title></circle>:null)}</g>;
      })}
      {tickIndices(data.length, Math.min(5, Math.max(2, Math.floor(plotWidth / 85)))).map(i => <text data-time-tick key={i} x={x(i)} y={PLOT_HEIGHT - 12} fontSize="11" fill="#64748b" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}><title>{data[i].label}{periodNote(i)}</title>{timeTick(data[i].label, String(data[0].label).slice(0, 4) !== String(data[data.length - 1].label).slice(0, 4))}{coverage[i]?.partial ? '*' : ''}</text>)}
    </svg>
    {hover!==null&&<div role="status" className="time-series-tooltip" style={{left:`${Math.min(62,Math.max(2,x(hover)/plotWidth*100-12))}%`}}><strong>{data[hover].label?.slice(0,10)}{coverage[hover]?.partial?' · Chưa đủ kỳ':''}</strong>{active.map(s=><p key={s.key}><i style={{background:s.color}}/><span>{s.label}</span><b>{formatChartValue(data[hover][s.key],unit?` ${unit}`:'')}</b></p>)}</div>}
  </div>;
};

// ─── 1. SMOOTH AREA / LINE CHART ───
export interface AreaChartDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface AreaChartProps {
  data: AreaChartDataPoint[];
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
  showLegend?: boolean;
}

export const SmoothAreaChart: React.FC<AreaChartProps> = ({
  data,
  height = 230,
  valuePrefix = '',
  valueSuffix = '',
  color = '#2563eb', // Modern Blue
  secondaryColor = '#8b5cf6', // Modern Purple
  showSecondary = false,
  showLegend = true,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu giao dịch trong khoảng thời gian này</span>
        <span className="text-[11px] text-slate-400 mt-1">Dữ liệu sẽ tự động hiển thị khi phát sinh đơn hàng mới</span>
      </div>
    );
  }

  const width = 600;
  const padding = { top: 15, right: 15, bottom: 25, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.value, d.secondaryValue || 0]);
  const maxValue = Math.max(...allValues) * 1.15 || 100;
  const minValue = 0;
  const maxY = padding.top + chartHeight;
  const minY = padding.top;

  const clampY = (yVal: number) => Math.min(maxY, Math.max(minY, yVal));

  const getX = (idx: number) => padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartWidth : chartWidth / 2);
  const getY = (val: number) => clampY(padding.top + chartHeight - ((Math.max(0, val) - minValue) / (maxValue - minValue)) * chartHeight);

  // Build monotonic clamped Bezier path to avoid curve undershooting below 0
  const createSplinePath = (vals: number[]) => {
    const points = vals.map((v, i) => ({ x: getX(i), y: getY(v) }));
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      // Slopes with Fritsch-Carlson monotonicity condition
      let m1 = (p2.y - p0.y) / 2;
      let m2 = (p3.y - p1.y) / 2;

      // If slopes change sign or flat at extremum, clamp slope to 0
      if ((p2.y - p1.y) * (p1.y - p0.y) <= 0) m1 = 0;
      if ((p3.y - p2.y) * (p2.y - p1.y) <= 0) m2 = 0;

      const dx = (p2.x - p1.x) / 3;
      const cp1x = p1.x + dx;
      const cp1y = clampY(p1.y + m1 / 3);
      const cp2x = p2.x - dx;
      const cp2y = clampY(p2.y - m2 / 3);

      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const linePath = createSplinePath(data.map(d => d.value));
  const areaPath = `${linePath} L ${getX(data.length - 1)},${maxY} L ${getX(0)},${maxY} Z`;
  const secLinePath = showSecondary ? createSplinePath(data.map(d => d.secondaryValue || 0)) : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = minValue + (maxValue - minValue) * pct;
    const y = maxY - pct * chartHeight;
    return { val, y };
  });

  const formatYValue = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
    return Math.round(val).toString();
  };

  return (
    <div className="relative w-full flex flex-col justify-between">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="area-gradient-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={width - padding.right}
              y2={t.y}
              stroke="#f1f5f9"
              strokeDasharray={idx === 0 ? "none" : "3 3"}
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={t.y + 3.5}
              textAnchor="end"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {formatYValue(t.val)}
            </text>
          </g>
        ))}

        {/* Filled Area */}
        <path d={areaPath} fill="url(#area-gradient-blue)" />

        {/* Main Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />

        {/* Secondary Line if active */}
        {showSecondary && secLinePath && (
          <path d={secLinePath} fill="none" stroke={secondaryColor} strokeWidth="2" strokeDasharray="3 3" />
        )}

        {/* X Axis Labels */}
        {data.map((d, idx) => {
          const step = Math.max(1, Math.ceil(data.length / 6));
          if (idx % step !== 0 && idx !== data.length - 1) return null;
          return (
            <text
              key={idx}
              x={getX(idx)}
              y={padding.top + chartHeight + 18}
              textAnchor="middle"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {d.label}
            </text>
          );
        })}

        {/* Interactive Hover Vertical Line and Points */}
        {data.map((d, idx) => (
          <rect
            key={idx}
            x={getX(idx) - (chartWidth / Math.max(1, data.length)) / 2}
            y={padding.top}
            width={chartWidth / Math.max(1, data.length)}
            height={chartHeight}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoverIndex(idx)}
          />
        ))}

        {hoverIndex !== null && (
          <g>
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              strokeWidth="1.5"
            />
            <circle
              cx={getX(hoverIndex)}
              y={getY(data[hoverIndex].value)}
              r="4.5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
            {showSecondary && (
              <circle
                cx={getX(hoverIndex)}
                y={getY(data[hoverIndex].secondaryValue || 0)}
                r="3.5"
                fill={secondaryColor}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}
      </svg>

      {/* Optional Bottom Legend */}
      {showLegend && (
        <div className="flex items-center justify-center space-x-6 pt-2 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
            <span>Doanh thu</span>
          </div>
          {showSecondary && (
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: secondaryColor }}></span>
              <span>Số đơn hàng</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Hover Tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute z-10 pointer-events-none bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-lg border border-slate-700 text-xs transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(getX(hoverIndex) / width) * 100}%`,
            top: `${(getY(data[hoverIndex].value) / height) * 100}%`,
            marginTop: '-10px',
          }}
        >
          <div className="text-[10px] text-slate-400 font-medium">{data[hoverIndex].label}</div>
          <div className="font-bold text-blue-400">
            {valuePrefix}{data[hoverIndex].value.toLocaleString('vi-VN')}{valueSuffix}
          </div>
          {showSecondary && data[hoverIndex].secondaryValue !== undefined && (
            <div className="text-[10px] text-purple-300">
              Đơn hàng: {data[hoverIndex].secondaryValue?.toLocaleString('vi-VN')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── 2. DONUT CHART WITH ELEGANT 3-COLUMN LEGEND ───
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  formattedAmount?: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  valueSuffix?: string;
  size?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerLabel = 'Tổng doanh thu',
  centerValue = '',
  valueSuffix = ' đ',
  size = 135,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = data ? data.reduce((acc, d) => acc + d.value, 0) : 0;
  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu cơ cấu</span>
      </div>
    );
  }

  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  const formatShortAmount = (val: number) => formatChartValue(val, valueSuffix);

  const displayCenterValue = centerValue || (
    total >= 1_000_000_000 
      ? `${(total / 1_000_000_000).toFixed(2)} tỷ` 
      : total >= 1_000_000 
      ? `${(total / 1_000_000).toFixed(1)}M` 
      : total.toLocaleString('vi-VN')
  );

  return (
    <div className="chart-donut-layout">
      {/* SVG Donut */}
      <div className="chart-donut-ring relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {data.map((slice, idx) => {
            const pct = slice.value / total;
            const strokeDasharray = `${circumference * pct} ${circumference * (1 - pct)}`;
            const strokeDashoffset = -currentOffset;
            currentOffset += circumference * pct;

            const isHovered = hoverIndex === idx;

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center px-1">
          <span className="text-sm font-bold text-slate-900 leading-tight">
            {hoverIndex !== null
              ? formatShortAmount(data[hoverIndex].value)
              : displayCenterValue}
          </span>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">
            {hoverIndex !== null ? data[hoverIndex].label : centerLabel}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="chart-donut-legend space-y-1.5">
        {data.map((slice, idx) => {
          const pct = ((slice.value / total) * 100).toFixed(1);
          const isHovered = hoverIndex === idx;
          const formattedAmount = slice.formattedAmount || formatShortAmount(slice.value);

          return (
            <div
              key={idx}
              className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
                isHovered ? 'bg-slate-100 shadow-2xs' : 'hover:bg-slate-50'
              }`}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1 pr-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }}></span>
                <span className="text-xs text-slate-700 font-medium truncate" title={slice.label}>
                  {slice.label}
                </span>
              </div>
              <div className="flex items-center space-x-2.5 flex-shrink-0 text-xs">
                <span className="font-semibold text-slate-800 text-right">{pct}%</span>
                <span className="text-slate-400 font-normal text-[11px] text-right min-w-[46px]">{formattedAmount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── 3. INTERACTIVE COLUMN / BAR CHART WITH Y-AXIS & GRID LINES ───
export interface BarDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  valueSuffix?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 220,
  color = '#2563eb', // Modern Electric Blue
  secondaryColor = '#8b5cf6',
  valueSuffix = '',
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu so sánh</span>
      </div>
    );
  }

  const width = 540;
  const padding = { top: 22, right: 16, bottom: 28, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Compute maximum value with clean ceiling
  const rawMax = Math.max(...data.map(d => Math.max(d.value, d.secondaryValue || 0))) || 10;
  // Nice number ceiling
  const getCeil = (val: number) => {
    if (val <= 10) return 10;
    if (val <= 50) return 50;
    if (val <= 100) return 100;
    if (val <= 500) return 500;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    return Math.ceil((val * 1.15) / mag) * mag;
  };
  const maxVal = getCeil(rawMax);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = pct * maxVal;
    const y = padding.top + chartHeight - pct * chartHeight;
    return { val, y };
  });

  const formatYValue = (val: number) => {
    if (val === 0) return '0';
    if (valueSuffix === 'Tr' || valueSuffix === 'triệu') {
      if (val >= 1000) return `${(val / 1000).toFixed(1)} tỷ`;
      return `${Math.round(val)} Tr`;
    }
    if (valueSuffix === 'ly' || valueSuffix === 'đơn') {
      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
      return `${Math.round(val)}`;
    }
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
    return Math.round(val).toString();
  };

  const formatTooltipValue = (val: number) => formatChartValue(val, valueSuffix);

  const slotWidth = chartWidth / data.length;
  const hasSecondary = data.some(d => d.secondaryValue !== undefined);
  const singleBarWidth = Math.max(10, Math.min(32, hasSecondary ? slotWidth * 0.38 : slotWidth * 0.65));

  return (
    <div className="relative w-full flex flex-col justify-between">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal Grid lines and Y-axis tick values */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={width - padding.right}
              y2={t.y}
              stroke="#f1f5f9"
              strokeDasharray={idx === 0 ? "none" : "3 3"}
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={t.y + 3.5}
              textAnchor="end"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {formatYValue(t.val)}
            </text>
          </g>
        ))}

        {/* Vertical Bars */}
        {data.map((d, idx) => {
          const slotX = padding.left + idx * slotWidth;
          const isHovered = hoverIndex === idx;

          const barH = Math.max(2, (d.value / maxVal) * chartHeight);
          const barY = padding.top + chartHeight - barH;
          const barX = hasSecondary 
            ? slotX + (slotWidth - singleBarWidth * 2 - 4) / 2
            : slotX + (slotWidth - singleBarWidth) / 2;

          const secH = d.secondaryValue ? Math.max(2, (d.secondaryValue / maxVal) * chartHeight) : 0;
          const secY = padding.top + chartHeight - secH;
          const secX = barX + singleBarWidth + 4;

          const labelText = d.label.length > 13 ? `${d.label.slice(0, 11)}..` : d.label;

          return (
            <g 
              key={idx} 
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(idx)}
            >
              {/* Invisible wide hit area for easy hover */}
              <rect
                x={slotX}
                y={padding.top}
                width={slotWidth}
                height={chartHeight + padding.bottom}
                fill="transparent"
              />

              {/* Primary Bar */}
              <rect
                x={barX}
                y={barY}
                width={singleBarWidth}
                height={barH}
                rx={3.5}
                ry={3.5}
                fill={color}
                className="transition-all duration-150"
                opacity={hoverIndex === null || isHovered ? 1 : 0.65}
              />

              {/* Secondary Bar if exists */}
              {hasSecondary && d.secondaryValue !== undefined && (
                <rect
                  x={secX}
                  y={secY}
                  width={singleBarWidth}
                  height={secH}
                  rx={3.5}
                  ry={3.5}
                  fill={secondaryColor}
                  className="transition-all duration-150"
                  opacity={hoverIndex === null || isHovered ? 0.9 : 0.5}
                />
              )}

              {/* X-axis Label */}
              <text
                x={slotX + slotWidth / 2}
                y={padding.top + chartHeight + 17}
                textAnchor="middle"
                className={`text-[10px] font-sans font-medium select-none transition-colors ${
                  isHovered ? 'fill-blue-600 font-semibold' : 'fill-slate-500'
                }`}
              >
                {labelText}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-lg border border-slate-700 text-xs transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${((padding.left + hoverIndex * slotWidth + slotWidth / 2) / width) * 100}%`,
            top: `${(padding.top + chartHeight - Math.max(4, (data[hoverIndex].value / maxVal) * chartHeight)) / height * 100}%`,
            marginTop: '-8px',
          }}
        >
          <div className="text-[10px] text-slate-300 font-medium truncate max-w-[180px]">
            {data[hoverIndex].label}
          </div>
          <div className="font-semibold text-blue-400 mt-0.5 whitespace-nowrap">
            {formatTooltipValue(data[hoverIndex].value)}
          </div>
          {hasSecondary && data[hoverIndex].secondaryValue !== undefined && (
            <div className="text-[10px] text-purple-300 mt-0.5">
              Phụ: {formatTooltipValue(data[hoverIndex].secondaryValue!)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── 4. HORIZONTAL RANKING BAR CHART (Target Style) ───
export interface HorizontalBarItem {
  label: string;
  value: number;
  subValue?: string;
  rank?: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: HorizontalBarItem[];
  valueSuffix?: string;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  valueSuffix = ' đ',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu xếp hạng</span>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value)) * 1.05 || 1;

  const formatAmount = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
    return val.toLocaleString('vi-VN');
  };

  return (
    <div className="space-y-4 w-full">
      {data.map((item, idx) => {
        const pct = Math.max(6, Math.min(100, Math.round((item.value / maxValue) * 100)));
        const rank = item.rank || idx + 1;
        const barColor = item.color || '#2563eb'; // Royal blue

        return (
          <div key={idx} className="group cursor-pointer space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <span className="text-xs font-semibold text-slate-400 w-3 flex-shrink-0 text-center">
                  {rank}
                </span>
                <span className="font-medium text-slate-800 truncate" title={item.label}>
                  {item.label}
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 flex-shrink-0">
                <span className="font-semibold text-slate-800 text-xs">
                  {formatAmount(item.value)}{valueSuffix}
                </span>
                {item.subValue && (
                  <span className="text-[10px] text-slate-400 font-medium">({item.subValue})</span>
                )}
              </div>
            </div>

            {/* Track and Progress Bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                style={{
                  width: `${pct}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


// ─── 5. MINI SPARKLINE FOR KPI CARDS ───
export const Sparkline: React.FC<{
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}> = ({
  data = [12, 16, 14, 20, 18, 24, 28],
  color = '#10b981',
  width = 64,
  height = 28,
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
};


// ─── 6. INTERACTIVE HEATMAP MATRIX CHART ───
export interface HeatmapPoint {
  x: string;
  y: string;
  value: number;
  label?: string;
}

interface HeatmapChartProps {
  data: Array<HeatmapPoint | Record<string, any>>;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  colorScheme?: 'indigo' | 'emerald' | 'amber' | 'blue';
  xLabel?: string;
  yLabel?: string;
}

const DEFAULT_DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
const DEFAULT_HOURS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00', '22:00'
];

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data = [],
  valuePrefix = '',
  valueSuffix = ' đơn',
  xLabel = 'Giờ',
  yLabel = 'Thứ',
}) => {
  const [hoveredCell, setHoveredCell] = useState<{ x: string; y: string; val: number } | null>(null);

  // Normalize incoming data into 2D map: y -> x -> value
  const matrix: Record<string, Record<string, number>> = Object.create(null);
  const ySet = new Set<string>();
  const xSet = new Set<string>();

  data.forEach((item: any) => {
    let xVal = '';
    let yVal = '';
    let numVal = 0;

    if (item.x !== undefined && item.y !== undefined) {
      xVal = String(item.x);
      yVal = String(item.y);
      numVal = Number(item.value || 0);
    } else {
      // Auto-detect keys from SQL row
      const keys = Object.keys(item);
      for (const k of keys) {
        const val = item[k];
        const kLower = k.toLowerCase();
        if (typeof val === 'number' || (!isNaN(Number(val)) && (kLower.includes('so') || kLower.includes('count') || kLower.includes('tien') || kLower.includes('value') || kLower.includes('luong')))) {
          numVal = Number(val);
        } else if (kLower.includes('gio') || kLower.includes('hour') || kLower.includes('khung') || String(val).includes(':00')) {
          xVal = String(val).trim();
          if (/^\d+$/.test(xVal)) xVal = `${xVal.padStart(2, '0')}:00`;
        } else if (kLower.includes('thu') || kLower.includes('day') || kLower.includes('dow') || kLower.includes('ngay')) {
          yVal = String(val).trim();
        }
      }
      // If 1D string label (e.g. "Monday 08:00" or "Friday 14:00")
      if (!xVal || !yVal) {
        const label = String(item.label || item.name || '');
        const match = label.match(/([A-Za-zÀ-ỹ\s\d]+?)\s+(\d{1,2}:00|\d{1,2}h|\d{1,2})/);
        if (match) {
          yVal = match[1].trim();
          xVal = match[2].includes(':') ? match[2] : `${match[2].replace('h', '').padStart(2, '0')}:00`;
        } else {
          yVal = label || 'Tất cả';
          xVal = 'Cả ngày';
        }
      }
    }

    if (xVal && yVal) {
      ySet.add(yVal);
      xSet.add(xVal);
      if (!matrix[yVal]) matrix[yVal] = Object.create(null);
      matrix[yVal][xVal] = (matrix[yVal][xVal] || 0) + numVal;
    }
  });

  // Determine active rows & cols
  const yCategories = ySet.size > 0
    ? DEFAULT_DAYS.filter(d => ySet.has(d)).concat(Array.from(ySet).filter(d => !DEFAULT_DAYS.includes(d)))
    : [];

  const xCategories = xSet.size > 0
    ? (Array.from(xSet).some(x => DEFAULT_HOURS.includes(x))
        ? DEFAULT_HOURS.filter(h => xSet.has(h)).concat(Array.from(xSet).filter(h => !DEFAULT_HOURS.includes(h)))
        : Array.from(xSet))
    : [];

  if (!xCategories.length || !yCategories.length) return <div className="text-xs text-slate-400 p-4">Chưa có dữ liệu ma trận</div>;

  // Compute maximum value for color interpolation
  let maxVal = 1;
  yCategories.forEach(y => {
    xCategories.forEach(x => {
      const v = matrix[y]?.[x] || 0;
      if (v > maxVal) maxVal = v;
    });
  });

  // Color gradient interpolation based on ratio
  const getCellBg = (val: number) => {
    if (val === 0) return 'bg-slate-50 border-slate-100 text-slate-300';
    const ratio = Math.min(1, val / maxVal);
    if (ratio < 0.2) return 'bg-indigo-50 border-indigo-100 text-indigo-700';
    if (ratio < 0.4) return 'bg-indigo-100 border-indigo-200 text-indigo-800';
    if (ratio < 0.6) return 'bg-indigo-200 border-indigo-300 text-indigo-900';
    if (ratio < 0.8) return 'bg-indigo-400 border-indigo-500 text-white font-medium';
    return 'bg-indigo-600 border-indigo-700 text-white font-semibold shadow-xs';
  };

  return (
    <div className="w-full flex flex-col justify-between select-none">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[620px]">
          {/* Header row: Hour columns */}
          <div className="flex items-center mb-1 text-[11px] font-medium text-slate-400">
            <div className="w-16 shrink-0 text-left pl-1">{yLabel} / {xLabel}</div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${xCategories.length}, minmax(0, 1fr))` }}>
              {xCategories.map(x => (
                <div key={x} className="text-center truncate px-0.5" title={x}>
                  {x.replace(':00', 'h')}
                </div>
              ))}
            </div>
          </div>

          {/* Matrix body */}
          <div className="space-y-1">
            {yCategories.map(y => (
              <div key={y} className="flex items-center gap-1.5">
                <div className="w-16 shrink-0 text-[11px] font-medium text-slate-600 truncate" title={y}>
                  {y}
                </div>
                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${xCategories.length}, minmax(0, 1fr))` }}>
                  {xCategories.map(x => {
                    const missing = matrix[y]?.[x] === undefined;
                    const val = matrix[y]?.[x] ?? 0;
                    const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
                    return (
                      <div
                        key={x}
                        onMouseEnter={() => setHoveredCell(missing ? null : { x, y, val })}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`h-7 rounded-md border flex items-center justify-center text-[10px] cursor-pointer transition-all duration-150 ${getCellBg(val)} ${
                          isHovered ? 'ring-2 ring-indigo-500 scale-105 z-10' : ''
                        }`}
                      >
                        {missing ? '—' : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: Legend & Active Cell Inspector */}
      <div className="flex flex-wrap items-center justify-between pt-3 mt-2 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Mật độ:</span>
          <span className="text-[10px] text-slate-400">Thấp</span>
          <div className="flex items-center gap-0.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-50 border border-slate-200 inline-block" />
            <span className="w-3.5 h-3.5 rounded bg-indigo-50 border border-indigo-100 inline-block" />
            <span className="w-3.5 h-3.5 rounded bg-indigo-200 border border-indigo-300 inline-block" />
            <span className="w-3.5 h-3.5 rounded bg-indigo-400 border border-indigo-500 inline-block" />
            <span className="w-3.5 h-3.5 rounded bg-indigo-600 border border-indigo-700 inline-block" />
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Cao ({maxVal.toLocaleString('vi-VN')})</span>
        </div>

        {hoveredCell ? (
          <div className="text-[11px] font-medium text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
            <span className="text-indigo-600 font-semibold">{hoveredCell.y} / {hoveredCell.x}:</span>{' '}
            <span className="font-bold">{valuePrefix}{hoveredCell.val.toLocaleString('vi-VN')}{valueSuffix}</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">
            Rê chuột vào ô bất kỳ để xem chi tiết
          </div>
        )}
      </div>
    </div>
  );
};


// ─── 7. MULTI-SERIES LINE CHART (1 ĐƯỜNG LÀ 1 LOẠI / PHÂN LOẠI) ───
export interface MultiLineChartProps {
  data: Array<Record<string, any>>;
  seriesKeys?: string[];
  seriesLabels?: Record<string, string>;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  showLegend?: boolean;
}

const MULTI_SERIES_PALETTE = [
  '#059669', // Emerald
  '#2563eb', // Blue
  '#8b5cf6', // Violet
  '#d97706', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate
];

export const MultiLineChart: React.FC<MultiLineChartProps> = ({
  data = [],
  seriesKeys: propSeriesKeys,
  seriesLabels = {},
  height = 300,
  valuePrefix = '',
  valueSuffix = '',
  showLegend = true,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu chuỗi thời gian cho phân loại này</span>
      </div>
    );
  }

  // Detect flat tuples or pivoted format
  let normalizedData: Array<{ label: string; [key: string]: any }> = [];
  const detectedSeriesKeys = new Set<string>();

  const first = data[0] || {};
  const isFlatTuples = ('loai' in first || 'danh_muc' in first || 'category' in first || 'phuong_thuc' in first || 'series' in first) &&
                       ('value' in first || 'doanh_thu' in first || 'so_luong' in first || 'count' in first);

  if (isFlatTuples) {
    const dateCol = Object.keys(first).find(k => /ngay|date|thoi_gian|time|label/i.test(k)) || Object.keys(first)[0];
    const catCol = Object.keys(first).find(k => /loai|danh_muc|category|phuong_thuc|series/i.test(k)) || Object.keys(first)[1];
    const valCol = Object.keys(first).find(k => /value|doanh_thu|so_luong|count|tong_tien/i.test(k)) || Object.keys(first)[2];

    const dateMap: Record<string, Record<string, number>> = {};
    const dateOrder: string[] = [];

    data.forEach((row: any) => {
      const dVal = String(row[dateCol] || '').trim();
      const cVal = String(row[catCol] || 'Khác').trim();
      const numVal = Number(row[valCol] || 0);

      if (!dateMap[dVal]) {
        dateMap[dVal] = {};
        dateOrder.push(dVal);
      }
      dateMap[dVal][cVal] = (dateMap[dVal][cVal] || 0) + numVal;
      detectedSeriesKeys.add(cVal);
    });

    normalizedData = dateOrder.map(dStr => ({
      label: dStr,
      ...dateMap[dStr],
    }));
  } else {
    const labelKey = Object.keys(first).find(k => /label|date|ngay|time/i.test(k)) || Object.keys(first)[0];
    normalizedData = data.map((d: any) => ({
      label: String(d[labelKey] || d.label || d.name || ''),
      ...d,
    }));

    Object.keys(first).forEach(k => {
      if (k !== labelKey && k !== 'label' && k !== 'id' && typeof first[k] === 'number') {
        detectedSeriesKeys.add(k);
      }
    });
  }

  const seriesList = propSeriesKeys && propSeriesKeys.length > 0
    ? propSeriesKeys
    : Array.from(detectedSeriesKeys);

  const activeSeries = seriesList.filter(s => !hiddenSeries[s]);

  // Compute totals for legend
  const seriesTotals: Record<string, number> = {};
  seriesList.forEach(s => {
    seriesTotals[s] = normalizedData.reduce((acc, row) => acc + Number(row[s] || 0), 0);
  });

  const width = 640;
  const padding = { top: 20, right: 25, bottom: 35, left: 65 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  let maxVal = 0;
  normalizedData.forEach(row => {
    activeSeries.forEach(s => {
      const v = Number(row[s] || 0);
      if (v > maxVal) maxVal = v;
    });
  });
  if (maxVal === 0) maxVal = 100;
  maxVal = maxVal * 1.15;

  const getX = (idx: number) => {
    if (normalizedData.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (idx / (normalizedData.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const v = Math.max(0, val);
    const ratio = v / maxVal;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  // Spline generator
  const createSpline = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const toggleSeries = (s: string) => {
    setHiddenSeries(prev => ({
      ...prev,
      [s]: !prev[s],
    }));
  };

  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  return (
    <div className="w-full flex flex-col items-center">
      {/* Interactive Legend with toggle */}
      {showLegend && seriesList.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-3 px-2">
          {seriesList.map((s, idx) => {
            const color = MULTI_SERIES_PALETTE[idx % MULTI_SERIES_PALETTE.length];
            const isOff = hiddenSeries[s];
            const total = seriesTotals[s] || 0;

            return (
              <button
                key={s}
                onClick={() => toggleSeries(s)}
                title={`Nhấp để ${isOff ? 'hiển thị' : 'ẩn'} đường ${s}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                  isOff
                    ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 line-through'
                    : 'bg-white text-slate-800 border-slate-200/90 shadow-2xs hover:border-slate-300'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: isOff ? '#94a3b8' : color }}
                />
                <span className="font-semibold">{seriesLabels[s] || s}</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ({total >= 1_000_000 ? `${(total / 1_000_000).toFixed(1)}M` : total.toLocaleString('vi-VN')})
                </span>
              </button>
            );
          })}
        </div>
      )}

      <SeriesVisibilityNote labels={seriesList.filter(s => hiddenSeries[s]).map(s => seriesLabels[s] || s)} />
      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Horizontal Gridlines */}
          {yTicks.map((val, idx) => {
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? undefined : '3 3'}
                />
                <text
                  x={padding.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {val >= 1_000_000
                    ? `${(val / 1_000_000).toFixed(1)}M`
                    : val >= 1_000
                      ? `${(val / 1_000).toFixed(0)}k`
                      : Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Render each active series */}
          {activeSeries.map(s => {
            const seriesIdx = seriesList.indexOf(s);
            const color = MULTI_SERIES_PALETTE[seriesIdx % MULTI_SERIES_PALETTE.length];
            const segments: Array<Array<{ x: number; y: number; index: number }>> = [];
            let current: Array<{ x: number; y: number; index: number }> = [];
            normalizedData.forEach((d, i) => {
              if (typeof d[s] === 'number' && Number.isFinite(d[s])) {
                current.push({ x: getX(i), y: getY(d[s]), index: i });
              } else if (current.length) {
                segments.push(current); current = [];
              }
            });
            if (current.length) segments.push(current);
            const pts = segments.flat();
            const linePath = segments.map(createSpline).join(' ');

            return (
              <g key={s}>
                {/* Line stroke */}
                <path
                  d={linePath}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />

                {/* Data point dots */}
                {pts.map((pt, pIdx) => {
                  const isHovered = hoverIndex === pt.index;
                  return (
                    <circle
                      key={pIdx}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5 : 2.5}
                      fill="#ffffff"
                      stroke={color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      className="transition-all duration-150"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Hover guideline */}
          {hoverIndex !== null && hoverIndex >= 0 && hoverIndex < normalizedData.length && (
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}

          {/* X Axis Labels */}
          {normalizedData.map((d, idx) => {
            const totalPts = normalizedData.length;
            const step = Math.max(1, Math.ceil(totalPts / 6));
            if (idx % step !== 0 && idx !== totalPts - 1) return null;

            const x = getX(idx);
            const rawLabel = String(d.label || '').replace(/^\d{4}-/, ''); // Remove year prefix if space tight

            return (
              <text
                key={idx}
                x={x}
                y={height - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="sans-serif"
              >
                {rawLabel}
              </text>
            );
          })}

          {/* Transparent Hover catchers */}
          {normalizedData.map((_, idx) => {
            const x = getX(idx);
            const segWidth = chartWidth / (normalizedData.length || 1);
            return (
              <rect
                key={idx}
                x={x - segWidth / 2}
                y={padding.top}
                width={segWidth}
                height={chartHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}
        </svg>

        {/* Hover Floating Tooltip */}
        {hoverIndex !== null && hoverIndex >= 0 && hoverIndex < normalizedData.length && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 transition-all duration-100 min-w-[170px]"
            style={{
              left: `${Math.min(75, Math.max(15, (getX(hoverIndex) / width) * 100))}%`,
              top: '15px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-semibold text-slate-200 border-b border-slate-700/80 pb-1 flex items-center justify-between">
              <span>{normalizedData[hoverIndex].label}</span>
              <span className="text-[10px] text-slate-400 font-mono">Điểm {hoverIndex + 1}/{normalizedData.length}</span>
            </div>

            <div className="space-y-1 pt-0.5">
              {activeSeries
                .filter(s => typeof normalizedData[hoverIndex][s] === 'number' && Number.isFinite(normalizedData[hoverIndex][s]))
                .map(s => ({
                  name: s,
                  val: Number(normalizedData[hoverIndex][s] || 0),
                  color: MULTI_SERIES_PALETTE[seriesList.indexOf(s) % MULTI_SERIES_PALETTE.length],
                }))
                .sort((a, b) => b.val - a.val)
                .map(item => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-300 font-medium truncate max-w-[100px]">{seriesLabels[item.name] || item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {valuePrefix}{item.val.toLocaleString('vi-VN')}{valueSuffix}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** V3.1 forecast visual: verified history, server forecast, 80% band. Numbers are server-computed. */
export const ForecastChart: React.FC<{ history: Array<{ period: string; value: number }>; forecast: Array<{ period: string; value: number; lower_80: number; upper_80: number; kind?: string }>; unit?: string; color?: string }> = ({ history, forecast, unit = '', color = '#4f46e5' }) => {
  const {ref,width:plotWidth}=usePlotWidth();
  const points = [...history.map(h => ({ ...h, type: 'history' })), ...forecast.map(f => ({ ...f, type: f.kind === 'in_progress' ? 'in_progress' : 'forecast' }))];
  if (!points.length) return <p className="text-xs text-slate-500">Không có dữ liệu dự báo.</p>;
  const positions=timePositions(points.map(p=>({label:p.period})));
  if(!positions)return <div><p role="status">Thời gian dự báo chưa hợp lệ; hiển thị giá trị và loại quan sát.</p><table><tbody>{points.map((p,i)=><tr key={i}><th>{p.period}</th><td>{p.type==='history'?'Lịch sử':'Dự báo'}</td><td>{formatChartValue(p.value,unit?` ${unit}`:'')}</td></tr>)}</tbody></table></div>;
  const values = points.flatMap((p: any) => [p.value, p.lower_80, p.upper_80].filter(Number.isFinite));
  const low = Math.min(0, ...values), high = Math.max(0, ...values), span = high - low || 1;
  const ticks=[low,(low+high)/2,high],left=axisInset(ticks.map(axisValue)),height=248;
  const x = (i: number) => left + positions[i]*(plotWidth-left-20), y = (v: number) => 210 - (v - low) / span * 182;
  const start = history.length ? history.length - 1 : 0;
  const future = points.slice(start);
  const band = forecast.length ? `M ${x(start)} ${y(future[0].value)} ${forecast.map((f, i) => `L ${x(history.length + i)} ${y(f.upper_80)}`).join(' ')} ${[...forecast].reverse().map((f, i) => `L ${x(history.length + forecast.length - 1 - i)} ${y(f.lower_80)}`).join(' ')} Z` : '';
  const line = (rows: any[], offset: number) => monotonePath(rows.map((p,i)=>({x:x(offset+i),y:y(p.value)})));
  return <div data-forecast-plot className="min-w-0"><svg ref={ref} viewBox={`0 0 ${plotWidth} ${height}`} style={{height}} role="img" aria-label="Biểu đồ dự báo" className="w-full">
    {ticks.map((v, i) => <g key={i}><line x1={left} x2={plotWidth-18} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 6" /><text data-y-tick x={left-12} y={y(v)+4} textAnchor="end" fontSize="11" fill="#64748b">{axisValue(v)}</text></g>)}
    {band && <path data-forecast-band d={band} fill={color} opacity=".12" />}
    {history.length > 0 && <path data-history-line d={line(history, 0)} fill="none" stroke="#334155" strokeWidth="2" />}
    {forecast.length > 0 && <path data-forecast-line d={line(future, start)} fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" />}
    {history.length > 0 && forecast.length > 0 && <line x1={x(start)} x2={x(start)} y1="28" y2="210" stroke="#94a3b8" strokeDasharray="2 4" />}
    {points.map((p: any, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={p.type === 'history' ? 2.5 : 3.5} fill={p.type === 'in_progress' ? 'white' : p.type === 'history' ? '#334155' : color} stroke={p.type === 'history' ? '#334155' : color}><title>{`${p.period}: ${formatChartValue(p.value, unit ? ` ${unit}` : '')}${p.type === 'history' ? ' (lịch sử)' : p.type === 'in_progress' ? ' (kỳ đang diễn ra — dự báo)' : ` (dự báo; 80%: ${formatChartValue(p.lower_80, '')} – ${formatChartValue(p.upper_80, '')})`}`}</title></circle>)}
    {tickIndices(points.length,Math.min(6,Math.max(2,Math.floor((plotWidth-left)/90)))).map(i => <text data-time-tick key={i} x={x(i)} y="238" fontSize="11" fill="#64748b" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{timeTick(points[i].period, String(points[0].period).slice(0, 4) !== String(points[points.length - 1].period).slice(0, 4))}</text>)}
  </svg><div className="forecast-legend"><span><i className="forecast-history"/>Lịch sử đã kiểm chứng</span><span><i className="forecast-future" style={{borderColor:color}}/>Dự báo</span><span><i className="forecast-band" style={{background:color}}/>Khoảng 80%</span></div></div>;
};
