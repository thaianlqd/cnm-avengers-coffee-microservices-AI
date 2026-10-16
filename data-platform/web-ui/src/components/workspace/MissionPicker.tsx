import React from 'react';
import { missionCards } from '../../utils/workspacePresentation.mjs';

const ICONS: Record<string, string> = { overview: '◎', compare: '⇄', ranking: '≡', trend: '↗', composition: '◔', forecast: '⌁', risk_watch: '⚑', relationship: '⋰' };
const card = (active: boolean) => `text-left rounded-xl border px-3 py-2.5 transition-colors min-h-[64px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-2xs' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'} disabled:opacity-45 disabled:cursor-not-allowed`;

/**
 * Eight governed missions (availability and reasons from the server) plus a
 * neutral "Câu hỏi tự do" mode. Missions are mission-scoped workspaces: the
 * parent keeps an independent draft per mission (V3.2 §11-12).
 */
export const MissionPicker: React.FC<{ capabilities: any; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }> = ({ capabilities, value, onChange, disabled }) => {
  const cards = missionCards(capabilities);
  if (!cards.length) return null;
  return <div role="radiogroup" aria-label="Nhiệm vụ phân tích" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
    <button type="button" role="radio" aria-checked={value === null} disabled={disabled} data-mission-free onClick={() => onChange(null)} className={card(value === null)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold"><span aria-hidden className="text-slate-400">✎</span>Câu hỏi tự do</div>
      <div className="mt-1 text-[10.5px] leading-snug text-slate-500 line-clamp-2">Viết tự nhiên; AI diễn giải phần còn thiếu.</div>
    </button>
    {cards.map(c => <button key={c.id} type="button" role="radio" aria-checked={value === c.id} disabled={disabled || c.disabled}
      title={c.reason || c.description} onClick={() => onChange(c.id)} data-mission={c.id} className={card(value === c.id)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold"><span aria-hidden className="text-slate-400">{ICONS[c.id] || '•'}</span>{c.label}</div>
      <div className="mt-1 text-[10.5px] leading-snug text-slate-500 line-clamp-2">{c.disabled ? c.reason : c.status === 'partial' ? c.reason : c.description}</div>
    </button>)}
  </div>;
};
