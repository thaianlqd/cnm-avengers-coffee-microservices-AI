import React from 'react';

/** V3.1: one question field. Time/scope/depth live in AnalysisScopePanel; the old
 * context/expectation fields were removed because the planner prioritizes the
 * question and they produced contradictions. */
export const AnalysisInputForm: React.FC<{ prompt: string; disabled: boolean; maxChars?: number; blocked?: boolean;
  onPrompt: (v: string) => void; onSubmit: () => void; children?: React.ReactNode }> = p => {
  const limit = p.maxChars || 8000, over = p.prompt.length > limit;
  return <fieldset aria-label="Đầu vào phân tích" disabled={p.disabled} className="space-y-2 min-w-0">
    <div data-analysis-input="question"><div className="flex items-baseline justify-between"><label htmlFor="analysis-question" className="text-sm font-semibold">Câu hỏi phân tích</label>
      <span data-char-count className={`text-[11px] tabular-nums ${over ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{p.prompt.length.toLocaleString('vi-VN')}/{limit.toLocaleString('vi-VN')}</span></div>
      <textarea id="analysis-question" required value={p.prompt} onChange={e => p.onPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode!==229 && !e.shiftKey && !over && !p.disabled && !p.blocked && p.prompt.trim()) { e.preventDefault(); p.onSubmit(); } }} rows={3} placeholder="Ví dụ: Tỷ lệ hủy đơn theo chi nhánh tháng 9 năm 2026" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 mt-1 resize-none" />
    </div>
    {p.children}
  </fieldset>;
};
