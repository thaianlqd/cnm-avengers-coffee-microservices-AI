import React from 'react';

/** Deterministic next questions (server, 0 provider calls); the user decides to send. */
export const FollowUpChips: React.FC<{ items?: Array<{ kind: string; text: string }>; onPick: (text: string) => void; disabled?: boolean }> = ({ items = [], onPick, disabled }) => {
  if (!items.length) return null;
  return <section data-follow-ups className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="text-xs font-semibold text-slate-900 mb-2">Câu hỏi tiếp theo</h3>
    <div className="flex flex-wrap gap-2">{items.map(i => <button key={i.text} type="button" disabled={disabled} onClick={() => onPick(i.text)} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50">{i.text}</button>)}</div>
  </section>;
};
