import React, { useEffect, useRef, useState } from 'react';
import { hubPublishDraft } from '../../utils/hubProblems.mjs';

type Suggestion = {
  eligible: boolean; reason?: string; suggested_title?: string; suggested_description?: string; suggested_category?: string;
  categories?: string[]; category_reasons?: { category: string; reason: string }[];
  domains?: { id: string; label: string }[]; panels?: { id: string; goal: string; analysis_kind: string }[];
  similar_dashboards?: { id: string; title: string; category: string; similarity: number }[];
};

const kindLabel: Record<string, string> = { aggregate: 'Tổng hợp', ranking: 'Xếp hạng', trend: 'Diễn biến', distribution: 'Phân bố', comparison: 'So sánh' };

/** Publish a verified saved report as a ready-made problem on Báo cáo & Phân tích (viewers never use AI). */
export const HubPublishDialog: React.FC<{ report: { id: string; title: string }; onClose: () => void; onPublished: (title: string) => void }> = ({ report, onClose, onPublished }) => {
  const alive = useRef(true);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; const previous = document.activeElement as HTMLElement; return () => { alive.current = false; if (previous?.isConnected) previous.focus(); }; }, []);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ title: '', category: '', description: '', newCategory: '' });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/reports/saved/${encodeURIComponent(report.id)}/hub-suggestion`, { signal: controller.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error('Chưa tải được gợi ý cho báo cáo này.'); return r.json(); })
      .then((value: Suggestion) => { if (!controller.signal.aborted) { setSuggestion(value); setDraft(hubPublishDraft(value)); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [report.id]);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('input, button')?.focus(); }, [suggestion?.eligible]);
  const category = draft.category === '__new' ? draft.newCategory.trim() : draft.category;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/reports/saved/${encodeURIComponent(report.id)}/hub`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title.trim(), category, description: draft.description.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Chưa thêm được bài toán.');
      if (alive.current) onPublished(draft.title.trim());
    } catch (failure: any) { if (alive.current) setError(failure.message); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  };
  return <div ref={dialog} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)') || []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} role="dialog" aria-modal="true" aria-label="Thêm bài toán vào Báo cáo & Phân tích" data-hub-publish className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
    <form onSubmit={submit} className="max-h-[calc(100dvh-2rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-xl sm:p-6">
      <header><h2 className="text-lg font-semibold text-slate-900">Thêm vào Báo cáo & Phân tích</h2>
        <p className="mt-1 text-xs text-slate-500">Bài toán được dựng từ ý nghĩa đã kiểm chứng của “{report.title}”. Người xem mở là chạy lại trên dữ liệu hiện tại — không dùng Trợ lý AI.</p></header>
      {!suggestion && !error && <p role="status" className="text-sm text-slate-500">Đang phân tích báo cáo để gợi ý…</p>}
      {suggestion && !suggestion.eligible && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{suggestion.reason}</p>}
      {suggestion?.eligible && <>
        <label className="block text-xs font-medium text-slate-600">Tên bài toán (gợi ý)
          <input required minLength={3} maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-slate-600">Nhóm tính năng phù hợp
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">
            {(suggestion.categories || []).map(c => <option key={c} value={c}>{c}{c === suggestion.suggested_category ? ' — gợi ý' : ''}</option>)}
            <option value="__new">+ Nhóm mới…</option>
          </select></label>
        {draft.category === '__new' && <input required minLength={2} maxLength={40} aria-label="Tên nhóm mới" placeholder="Tên nhóm mới" value={draft.newCategory} onChange={e => setDraft({ ...draft, newCategory: e.target.value })} className="w-full rounded-xl border px-3 py-2 text-sm" />}
        {!!suggestion.category_reasons?.length && <p className="text-[11px] text-slate-500">Vì sao gợi ý “{suggestion.suggested_category}”: {suggestion.category_reasons[0].reason}{suggestion.domains?.length ? ` (${suggestion.domains.map(d => d.label).join(', ')})` : ''}.</p>}
        <label className="block text-xs font-medium text-slate-600">Mô tả ngắn
          <textarea maxLength={300} rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label>
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p className="font-medium text-slate-800">{suggestion.panels?.length} góc nhìn sẽ hiển thị</p>
          <ul className="mt-1 list-disc pl-5">{suggestion.panels?.map(p => <li key={p.id}>{p.goal || p.id} · {kindLabel[p.analysis_kind] || p.analysis_kind}</li>)}</ul></div>
        {!!suggestion.similar_dashboards?.length && <p data-hub-similar className="text-[11px] text-amber-800">Đã có bài toán gần giống: {suggestion.similar_dashboards.map(d => `${d.title} (${d.category}, ${Math.round(d.similarity * 100)}%)`).join(' · ')}.</p>}
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <footer className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border px-4 py-2 text-xs font-medium text-slate-700">Huỷ</button>
        <button type="submit" disabled={!suggestion?.eligible || busy || !category || draft.title.trim().length < 3} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Đang thêm…' : 'Thêm bài toán'}</button>
      </footer>
    </form>
  </div>;
};
