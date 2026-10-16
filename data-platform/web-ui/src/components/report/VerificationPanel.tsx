import React, { useEffect, useState } from 'react';
import { AnalysisQualityScore } from '../AnalysisQualityScore';
import { forecastRows, mergeReconciliation, numericRows, rankingRows, verificationMetrics } from '../../utils/verificationPresentation.mjs';

const TONE: Record<string, string> = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', slate: 'border-slate-200 bg-slate-50 text-slate-600' };

/**
 * V3.2 "Kiểm chứng & nguồn": separate, measurable evidence metrics. The
 * internal completeness score is shown as such — never as AI accuracy.
 */
export const VerificationPanel: React.FC<{ report: any }> = ({ report }) => {
  const [oracle, setOracle] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setOracle(null); setError(''); }, [report?.session_id, report?.revision]);
  const v = mergeReconciliation(report?.verification, oracle);
  const run = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ai/sessions/${encodeURIComponent(report.session_id)}/reconcile`, { method: 'POST', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Chưa chạy được đối chiếu độc lập.');
      setOracle(data);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!v) return <section data-verification-panel className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
    Báo cáo này được tạo trước V3.2 nên chưa có bộ kiểm chứng tách riêng. <AnalysisQualityScore assessment={report?.quality_assessment} /></section>;
  const numeric = numericRows(v), ranking = rankingRows(v), forecast = forecastRows(v);
  const dropped = report?.mission_evidence?.dropped || [];
  return <section data-verification-panel aria-label="Kiểm chứng và nguồn" className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div>
        <h3 className="text-sm font-semibold text-slate-900">Kiểm chứng &amp; nguồn</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">Mỗi chỉ số dưới đây được đo riêng bằng kiểm tra tất định. Hệ thống không gộp chúng thành một “độ chính xác AI” và không dùng AI để tự chấm AI.</p></div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${v.status === 'verified' ? TONE.emerald : TONE.amber}`}>{v.status === 'verified' ? 'Các kiểm tra đều đạt' : 'Có mục cần xem lại'}</span></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">{verificationMetrics(v).map((m: any) =>
        <div key={m.id} data-verification-metric={m.id} className={`rounded-xl border px-3 py-2 ${TONE[m.tone]}`}><div className="text-[11px]">{m.label}</div><div className="text-base font-semibold tabular-nums">{m.text}</div></div>)}</div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-slate-900">Đối chiếu độc lập: <span data-independent-oracle>{v.independent_oracle_label}</span></h4>
        {report?.session_id && <button type="button" onClick={run} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">{busy ? 'Đang đối chiếu…' : oracle ? 'Chạy lại đối chiếu (0 lượt AI)' : 'Chạy đối chiếu độc lập (0 lượt AI)'}</button>}</div>
      <p className="text-slate-500 leading-relaxed">Truy vấn tổng hợp read-only riêng, biên dịch từ cùng định nghĩa chỉ số nhưng khác cấu trúc truy vấn; không đọc lại số đã hiển thị. Số đếm phải khớp tuyệt đối; tiền tệ sai số ≤ 0,01; tỷ lệ không cộng/trung bình giữa nhóm.</p>
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      {!!numeric.length && <table className="w-full text-left"><thead className="text-slate-400"><tr><th className="py-1 font-medium">Phép đối chiếu</th><th className="font-medium">Kỳ vọng</th><th className="font-medium">Báo cáo</th><th className="font-medium">Sai số</th><th className="font-medium">Kết quả</th></tr></thead>
        <tbody>{numeric.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1 pr-2">{r.label}</td><td className="tabular-nums">{r.expected}</td><td className="tabular-nums">{r.reported}</td><td className="tabular-nums">{r.error}</td><td className={r.ok ? 'text-emerald-700' : 'text-rose-700'}>{r.status}</td></tr>)}</tbody></table>}
      {!!ranking.length && <ul className="space-y-1">{ranking.map((r, i) => <li key={i}><span className={r.ok ? 'text-emerald-700' : r.ok === false ? 'text-rose-700' : 'text-slate-500'}>Xếp hạng: {r.status}</span> {r.detail}</li>)}</ul>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5"><h4 className="font-semibold text-slate-900">Nhận định có bằng chứng</h4>
        <p>{v.grounding?.chart_numeric_matched}/{v.grounding?.chart_numeric_claims} số liệu trong nhận định biểu đồ khớp dòng kết quả gốc.</p>
        <p>{v.grounding?.narrative_claims_with_evidence}/{v.grounding?.narrative_claims} phát biểu tổng hợp có mã bằng chứng.</p>
        {!!v.grounding?.unsupported_claims?.length && <p className="text-rose-700">{v.grounding.unsupported_claims.length} phát biểu chưa có bằng chứng.</p>}
        {!!v.grounding?.causal_language?.length && <p className="text-rose-700">Phát hiện ngôn ngữ nhân quả chưa có bằng chứng.</p>}</div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5"><h4 className="font-semibold text-slate-900">Biểu đồ đúng yêu cầu</h4>
        <p>{v.chart_relevance?.passed}/{v.chart_relevance?.total} biểu đồ ánh xạ đúng yêu cầu, chỉ số và trục.</p>
        {!!dropped.length && <details><summary className="cursor-pointer">{dropped.length} góc nhìn đã được lọc bỏ</summary><ul className="mt-1 space-y-0.5">{dropped.map((d: any, i: number) =>
          <li key={i}>{d.title || d.chart_id}: {({ outside_mission_evidence: 'ngoài bằng chứng của nhiệm vụ', no_requirement_mapping: 'không gắn với yêu cầu', depth_budget: 'vượt ngân sách độ sâu' } as any)[d.reason] || d.reason}</li>)}</ul></details>}</div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5"><h4 className="font-semibold text-slate-900">Kiểm tra lùi dự báo</h4>
        {forecast.length ? forecast.map((f, i) => <p key={i}>{f.metric} · {f.method}: {f.errors}; độ phủ khoảng 80%: {f.coverage}.</p>) : <p className="text-slate-500">Báo cáo không có dự báo.</p>}
        <p className="text-slate-400">Dự báo không thể kiểm chứng với tương lai; chất lượng đo bằng kiểm tra lùi, không gọi là “chính xác x%”.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5"><h4 className="font-semibold text-slate-900">Nguồn &amp; phiên bản</h4>
        <p>Danh mục ngữ nghĩa: <code>{String(v.snapshot?.registry_fingerprint || '').slice(0, 12)}</code> · Bộ kiểm chứng {v.version}</p>
        {!!v.trend?.length && <p>Xu hướng: {v.trend.map((t: any) => `${t.buckets} kỳ, ${t.ordered ? 'đúng thứ tự' : 'sai thứ tự'}${t.duplicate_buckets ? `, ${t.duplicate_buckets} kỳ trùng` : ''}`).join(' · ')}</p>}
        <p>Ngày tham chiếu: {v.snapshot?.reference_date}</p></div>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-4 text-xs"><summary className="cursor-pointer font-semibold text-slate-800">{v.internal_completeness_label}</summary>
      <div className="mt-3"><AnalysisQualityScore assessment={report?.quality_assessment} /></div></details>
    <ul className="text-[11px] text-slate-500 space-y-0.5">{(v.methodology || []).map((m: string, i: number) => <li key={i}>• {m}</li>)}</ul>
  </section>;
};
