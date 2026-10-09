import React from 'react';
import { analysisChartGroups } from '../utils/analysisPresentation.mjs';

/** User-visible analytical scope, shared by proposal and validated report. */
export const AnalysisMeaning: React.FC<{ interpretation?: any; compact?: boolean }> = ({ interpretation: value, compact = false }) => {
  if (!value || typeof value !== 'object') return null;
  const period = value.time_range || {};
  const ranking = value.ranking;
  const kinds: Record<string, string> = { ranking: 'Xếp hạng', aggregate: 'Tổng hợp', trend: 'Xu hướng', comparison: 'So sánh', distribution: 'Cơ cấu', detail: 'Chi tiết', composite: 'Phân tích nhiều phần', heatmap: 'Phân tích hai chiều', cross_tab: 'Phân tích hai chiều', relationship: 'Liên hệ quan sát' };
  const grains: Record<string, string> = { day: 'ngày', week: 'tuần', month: 'tháng', quarter: 'quý', year: 'năm' };
  const operators: Record<string, string> = { eq: '=', in: 'thuộc', gt: '>', gte: '≥', lt: '<', lte: '≤' };
  const filters = (value.filters || []).map((f: any) => { const v = f.display_value ?? f.value; return `${f.dimension} ${operators[f.operator || 'eq'] || '='} ${Array.isArray(v) ? v.join(', ') : String(v)}`; });
  if (compact) return <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
    <summary className="cursor-pointer flex flex-wrap items-center gap-x-4 gap-y-2 list-none">
      <span className="font-medium text-slate-700">{filters.join(' · ') || 'Toàn phạm vi'}</span>
      <span>{period.start ? `${period.start} → ${period.end}` : 'Toàn bộ thời gian'}</span>
      <span className="ml-auto text-slate-400">Xem phạm vi ▾</span>
    </summary>
    <div className="mt-3"><AnalysisMeaning interpretation={value} /></div>
  </details>;
  return (
    <section aria-label="AI interpreted request" className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-xs text-slate-700 space-y-2">
      <h3 className="font-semibold text-indigo-900">AI hiểu yêu cầu của bạn</h3>
      {value.analysis_breadth && <p><strong>Mức phân tích đề xuất:</strong> {{ focused: 'Tập trung', deep: 'Phân tích sâu', comprehensive: 'Phân tích toàn diện' }[value.analysis_breadth as string]}</p>}
      <p><strong>Đối tượng:</strong> {value.subject} · {kinds[value.analysis_kind] || ''}</p>
      <p><strong>Chỉ số:</strong> {(value.metrics || []).map((m: any) => `${m.label}${m.unit ? ` (${m.unit})` : ''}`).join(', ') || (value.analysis_kind === 'detail' ? 'Dữ liệu chi tiết' : 'Chưa xác định chỉ số')}</p>
      <p><strong>Phạm vi:</strong> {filters.join('; ') || 'Không có bộ lọc bổ sung'}</p>
      {!!value.dimensions?.length && <p><strong>Phân nhóm:</strong> {value.dimensions.join(', ')}</p>}
      <p><strong>Thời gian:</strong> {period.start ? `${period.start} → ${period.end}` : period.mode === 'all_time' ? 'Toàn bộ thời gian' : 'Chưa chọn khoảng thời gian'} · {period.timezone}</p>
      {value.granularity && <p><strong>Kỳ quan sát:</strong> Theo {grains[value.granularity] || ''}</p>}
      {ranking && <p><strong>Xếp hạng:</strong> Top {ranking.top_n} theo {ranking.metric}, {ranking.direction === 'ASC' ? 'tăng dần' : 'giảm dần'}{ranking.per_group?.length ? `; trong từng ${ranking.per_group.join(', ')}` : ''}</p>}
      {(value.comparison_groups || []).map((group: any) => (
        <p key={group.name}><strong>{group.name}:</strong> {group.top_n ? `Top ${group.top_n}; ` : ''}{group.filters.map((f: any) => `${f.dimension}: ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`).join('; ')}</p>
      ))}
      {(value.components || []).map((part: any) => (
        <p key={part.id}><strong>{part.id}:</strong> {kinds[part.kind] || 'Phân tích'}; {part.subject ? `${part.subject}; ` : ''}{part.metrics.join(', ')}{part.filters?.length ? `; ${part.filters.map((f: any) => `${f.dimension}: ${f.value}`).join('; ')}` : ''}{part.ranking ? `; Top ${part.ranking.top_n}, ${part.ranking.direction === 'ASC' ? 'tăng dần' : 'giảm dần'}` : ''}</p>
      ))}
      {(value.operations || []).length > 1 && <details className="border-t border-indigo-100 pt-2"><summary className="cursor-pointer font-medium">{value.operations.length} phần phân tích · Xem kế hoạch chi tiết</summary>{analysisChartGroups(value.operations).map(group => <section key={group.role} className="space-y-2"><h4 className="font-semibold">{group.title}</h4>{group.charts.map((part: any) => (
        <div key={part.query_id} className="border-t border-indigo-100 pt-2">
          <p><strong>{part.domain_label || part.subject} · {part.role === 'supporting' ? 'Phân tích hỗ trợ' : 'Theo yêu cầu'}:</strong> {part.lens_label || kinds[part.kind] || 'Phân tích'}</p>
          <p>{(part.metrics || []).map((m: any) => `${m.label} (${m.unit})`).join(', ')}</p>
          {!!part.dimensions?.length && <p>Phân nhóm: {part.dimensions.join(', ')}</p>}
          {part.granularity && <p>Diễn biến theo {grains[part.granularity] || ''}</p>}
          <p>{part.time_range?.start ? `${part.time_range.start} → ${part.time_range.end}` : 'Toàn bộ thời gian'}; {(part.filters || []).map((f: any) => `${f.dimension}: ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`).join('; ') || 'Không có bộ lọc bổ sung'}</p>
          {part.ranking && <p>Top {part.ranking.top_n} theo {part.ranking.metric}, {part.ranking.direction === 'ASC' ? 'tăng dần' : 'giảm dần'}{part.ranking.per_group?.length ? `; trong từng ${part.ranking.per_group.join(', ')}` : ''}</p>}
          {part.role === 'supporting' && <p>Giữ cùng bộ lọc và thời gian với phần phân tích theo yêu cầu.</p>}
        </div>
      ))}</section>)}</details>}
      {value.assumptions?.length > 0 && <p><strong>Giả định:</strong> {value.assumptions.join('; ')}</p>}
    </section>
  );
};
