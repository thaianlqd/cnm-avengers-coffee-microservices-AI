import React from 'react';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700';
const presets = [
  ['auto', 'Tự động'], ['today', 'Hôm nay'], ['7d', '7 ngày gần đây'], ['30d', '30 ngày gần đây'],
  ['current_month', 'Tháng này'], ['previous_month', 'Tháng trước'],
  ['current_quarter', 'Quý này'], ['previous_quarter', 'Quý trước'],
  ['current_year', 'Năm nay'], ['previous_year', 'Năm trước'],
  ['all_time', 'Toàn bộ thời gian'], ['custom', 'Tùy chọn'],
];

export const AnalysisInputForm: React.FC<{
  prompt: string; time: string; context: string; expectation: string; start: string; end: string; disabled: boolean;
  onPrompt: (v: string) => void; onTime: (v: string) => void; onContext: (v: string) => void;
  onExpectation: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void; onSubmit: () => void;
}> = p => <fieldset aria-label="Đầu vào phân tích" disabled={p.disabled} className="space-y-4 min-w-0">
  <div data-analysis-input="question"><label htmlFor="analysis-question" className="text-sm font-semibold">Câu hỏi phân tích</label>
    <textarea id="analysis-question" required maxLength={8000} value={p.prompt} onChange={e => p.onPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !p.disabled && p.prompt.trim()) { e.preventDefault(); p.onSubmit(); } }} rows={3} placeholder="Bạn muốn tìm hiểu điều gì từ dữ liệu?" className={`${fieldClass} mt-1 resize-none`} />
  </div>
  <div data-analysis-input="time"><label htmlFor="analysis-time" className="text-xs font-semibold">Thời gian</label>
    <select id="analysis-time" value={p.time} onChange={e => p.onTime(e.target.value)} className={fieldClass}>
      {presets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
    <p className="text-xs text-slate-500 mt-1">Tự động: AI hiểu thời gian từ câu hỏi. Chọn kỳ cụ thể khi bạn muốn xác định rõ.</p>
    {p.time === 'custom' && <div className="flex gap-2 mt-2"><input aria-label="Từ ngày" type="date" required value={p.start} max={p.end || undefined} onChange={e => p.onStart(e.target.value)} className={fieldClass} /><input aria-label="Đến ngày" type="date" required value={p.end} min={p.start || undefined} onChange={e => p.onEnd(e.target.value)} className={fieldClass} /></div>}
  </div>
  <div data-analysis-input="context"><label htmlFor="analysis-context" className="text-xs font-semibold">Ngữ cảnh phân tích <span className="font-normal">(không bắt buộc)</span></label>
    <textarea id="analysis-context" maxLength={2000} value={p.context} onChange={e => p.onContext(e.target.value)} rows={2} placeholder="Ví dụ: tập trung hai thành phố, chi nhánh và sản phẩm…" className={`${fieldClass} mt-1`} />
  </div>
  <div data-analysis-input="expectation"><label htmlFor="analysis-expectation" className="text-xs font-semibold">Mong muốn phân tích <span className="font-normal">(không bắt buộc)</span></label>
    <textarea id="analysis-expectation" maxLength={1500} value={p.expectation} onChange={e => p.onExpectation(e.target.value)} rows={2} placeholder="Ví dụ: nhiều góc nhìn, chỉ ra điểm cần chú ý và biểu đồ phù hợp…" className={`${fieldClass} mt-1`} />
    <p className="text-xs text-slate-500 mt-1">Nhấn Phân tích để nhận báo cáo. Hệ thống hỏi lại khi cần thêm thông tin hoặc xác nhận phần phạm vi còn thiếu.</p>
  </div>
</fieldset>;
