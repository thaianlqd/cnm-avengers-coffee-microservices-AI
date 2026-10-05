import React from 'react';

/** User-visible analytical scope, shared by proposal and validated report. */
export const AnalysisMeaning: React.FC<{ interpretation?: any }> = ({ interpretation: value }) => {
  if (!value || typeof value !== 'object') return null;
  const period = value.time_range || {};
  const filters = (value.filters || []).map((f: any) => `${f.dimension} ${f.operator || 'eq'} ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`);
  const ranking = value.ranking;
  return (
    <section aria-label="AI interpreted request" className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-xs text-slate-700 space-y-2">
      <h3 className="font-semibold text-indigo-900">AI hiểu yêu cầu của bạn</h3>
      <p><strong>Đối tượng:</strong> {value.subject} · {value.analysis_kind}</p>
      <p><strong>Chỉ số:</strong> {(value.metrics || []).map((m: any) => `${m.label}${m.unit ? ` (${m.unit})` : ''}`).join(', ') || 'Dữ liệu chi tiết'}</p>
      <p><strong>Phạm vi:</strong> {filters.join('; ') || 'Không có bộ lọc bổ sung'}</p>
      <p><strong>Thời gian:</strong> {period.start ? `${period.start} → ${period.end}` : 'Toàn bộ thời gian'} · {period.timezone}</p>
      {ranking && <p><strong>Xếp hạng:</strong> Top {ranking.top_n} theo {ranking.metric}, {ranking.direction}{ranking.per_group?.length ? `; trong từng ${ranking.per_group.join(', ')}` : ''}</p>}
      {(value.comparison_groups || []).map((group: any) => (
        <p key={group.name}><strong>{group.name}:</strong> {group.top_n ? `Top ${group.top_n}; ` : ''}{group.filters.map((f: any) => `${f.dimension}: ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`).join('; ')}</p>
      ))}
      {(value.components || []).map((part: any) => (
        <p key={part.id}><strong>{part.id}:</strong> {part.kind}; {part.metrics.join(', ')}{part.ranking ? `; Top ${part.ranking.top_n}, ${part.ranking.direction}` : ''}</p>
      ))}
      {value.assumptions?.length > 0 && <p><strong>Giả định:</strong> {value.assumptions.join('; ')}</p>}
    </section>
  );
};
