import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { capabilityGroups, unsupportedItems } from '../../utils/workspacePresentation.mjs';
import { Badge } from './ui';

/** A bounded catalog: selecting a group never moves the underlying workspace. */
export const CapabilityDrawer: React.FC<{ capabilities: any; onAsk: (question: string) => void }> = ({ capabilities, onAsk }) => {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const groups = capabilityGroups(capabilities, search), unsupported = unsupportedItems(capabilities, search);
  const active = groups.find((g: any) => g.id === selected) || groups[0];
  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; searchInput.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary, [tabindex="0"]') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); trigger.current?.focus(); };
  }, [open]);
  const ask = (question: string) => { setOpen(false); onAsk(question.replace(/\?$/, '')); };
  return <div data-capability-drawer>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
      Hỏi được gì? <span className="text-slate-400">· {(capabilities?.domains || []).length} nhóm dữ liệu</span>
    </button>
    {open && createPortal(<div className="capability-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="capability-title" className="capability-catalog">
        <header><div><h2 id="capability-title">Bạn muốn phân tích điều gì?</h2><p>Chọn nhóm dữ liệu, xem chỉ số và điền một câu hỏi mẫu.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Đóng danh mục" className="map-control">Đóng ×</button></header>
        <div className="capability-search"><input ref={searchInput} aria-label="Tìm chỉ số, chiều phân tích" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm chỉ số, nhóm dữ liệu hoặc chiều phân tích…" /><span role="status">{groups.length} nhóm · {groups.reduce((n: number, g: any) => n + g.metrics.length, 0)} chỉ số</span></div>
        <div className="capability-body">
          <nav aria-label="Nhóm dữ liệu" className="capability-groups">{groups.map((g: any) => <button key={g.id} type="button" aria-pressed={active?.id === g.id} onClick={() => { setSelected(g.id); dialog.current?.querySelector('.capability-detail')?.scrollTo(0, 0); }}><span>{g.label}</span><small>{g.metrics.length} chỉ số</small></button>)}{!groups.length && <p>Không có nhóm phù hợp.</p>}</nav>
          <div className="capability-detail" tabIndex={0} aria-label="Chi tiết chỉ số">
            {active ? <><div className="capability-detail-heading"><h3>{active.label}</h3>{active.purpose && <p>{active.purpose}</p>}</div>
              <div className="capability-metrics">{active.metrics.map((m: any) => <article key={m.id} data-capability-metric={m.id}>
                <div className="flex flex-wrap items-center gap-1.5"><h4>{m.label}</h4><span className="text-slate-500">({m.unit})</span>{m.badges.map((b: string) => <Badge key={b} tone={b === 'Dự báo được' ? 'indigo' : b === 'Hiện tại' ? 'slate' : 'emerald'}>{b}</Badge>)}</div>
                {m.definition && <p>{m.definition}</p>}{!!m.dimensions?.length && <div className="capability-dimensions"><span>Phân tích theo</span>{m.dimensions.map((d: any) => <span key={d.id || d.label}>{d.label}</span>)}</div>}
                {!!m.selection_criteria?.length && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Chọn nhóm theo tiêu chí có dữ liệu lịch sử</summary>{m.selection_criteria.map((c: any) => <p key={c.id} className="mt-1"><strong>{c.label}</strong> — {c.formula}. Cần ít nhất {c.min_complete_buckets} kỳ đầy đủ; thiếu lịch sử sẽ được thông báo.</p>)}</details>}
                {!!m.examples?.length && <div className="capability-examples">{m.examples.map((q: string) => <button key={q} type="button" onClick={() => ask(q)}>{q}<span aria-hidden="true"> ↗</span></button>)}</div>}
              </article>)}</div></> : <p className="py-6 text-slate-500">Không tìm thấy chỉ số. Thử từ khóa khác.</p>}
            {!!unsupported.length && <details className="capability-limitations"><summary>Giới hạn dữ liệu · {unsupported.length}</summary>{unsupported.map((u: any) => <p key={u.id}><strong>{u.concepts.slice(0, 3).join(', ')}</strong> — {u.limitation}</p>)}</details>}
          </div>
        </div>
        <footer>Chọn câu hỏi mẫu chỉ điền nội dung; bạn kiểm tra rồi bấm Phân tích.</footer>
      </div>
    </div>, document.body)}
  </div>;
};
