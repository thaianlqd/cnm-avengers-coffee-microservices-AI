import React, { useState } from 'react';
import { capabilityGroups, unsupportedItems } from '../../utils/workspacePresentation.mjs';
import { Badge } from './ui';

/** "Hỏi được gì?" — searchable, entirely from the capability API. */
export const CapabilityDrawer: React.FC<{ capabilities: any; onAsk: (question: string) => void }> = ({ capabilities, onAsk }) => {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [expanded, setExpanded] = useState<string | null>(null);
  const groups = capabilityGroups(capabilities, search), unsupported = unsupportedItems(capabilities, search);
  return <div data-capability-drawer>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
      {open ? 'Đóng danh mục' : 'Hỏi được gì?'} <span className="text-slate-400">· {(capabilities?.domains || []).length} nhóm dữ liệu</span>
    </button>
    {open && <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
      <input aria-label="Tìm chỉ số, chiều phân tích" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm chỉ số, nhóm dữ liệu hoặc chiều phân tích…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" />
      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
        {groups.map((g: any) => <section key={g.id} className="rounded-xl border border-slate-100">
          <button type="button" onClick={() => setExpanded(expanded === g.id ? null : g.id)} aria-expanded={expanded === g.id || Boolean(search)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-semibold text-slate-800">{g.label}</span><span className="text-[11px] text-slate-400">{g.metrics.length} chỉ số</span>
          </button>
          {(expanded === g.id || search) && <div className="px-3 pb-3 space-y-2">
            {g.purpose && <p className="text-[11px] text-slate-500">{g.purpose}</p>}
            {g.metrics.map((m: any) => <div key={m.id} data-capability-metric={m.id} className="rounded-lg bg-slate-50 p-2.5 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-medium text-slate-800">{m.label}</span><span className="text-[11px] text-slate-400">({m.unit})</span>
                {m.badges.map((b: string) => <Badge key={b} tone={b === 'Dự báo được' ? 'indigo' : b === 'Hiện tại' ? 'slate' : 'emerald'}>{b}</Badge>)}</div>
              {m.definition && <p className="text-[11px] text-slate-500 leading-relaxed">{m.definition}</p>}
              {!!m.dimensions?.length && <p className="text-[11px] text-slate-500">Theo: {m.dimensions.map((d: any) => d.label).join(' · ')}</p>}
              {m.examples?.map((q: string) => <button key={q} type="button" onClick={() => onAsk(q.replace(/\?$/, ''))} className="mr-2 text-[11px] text-emerald-700 hover:underline">“{q}”</button>)}
            </div>)}
          </div>}
        </section>)}
        {!groups.length && <p className="text-xs text-slate-500">Không tìm thấy chỉ số phù hợp.</p>}
        {!!unsupported.length && <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-amber-900">Chưa hỗ trợ</h4>
          {unsupported.map((u: any) => <div key={u.id} className="text-[11px] text-amber-900"><strong>{u.concepts.slice(0, 3).join(', ')}</strong> — {u.limitation}
            {!!u.nearest?.length && <span className="block text-slate-600">Gần nhất: {u.nearest.map((n: any) => n.label).join(' · ')}</span>}</div>)}
        </section>}
      </div>
    </div>}
  </div>;
};
