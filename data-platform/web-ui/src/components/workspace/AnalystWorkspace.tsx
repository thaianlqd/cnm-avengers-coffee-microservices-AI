import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisInputForm } from '../AnalysisInputForm';
import { DataCoverageBar } from './DataCoverageBar';
import { MissionPicker } from './MissionPicker';
import { MissionInputBuilder } from './MissionInputBuilder';
import { CapabilityDrawer } from './CapabilityDrawer';
import { QuestionPreflight } from './QuestionPreflight';
import { AnalysisScopePanel } from './AnalysisScopePanel';
import { RiskSignalTable } from './RiskSignalTable';
import { Card } from './ui';
import { suggestionChips } from '../../utils/workspacePresentation.mjs';
import { applyFix, createPreflightClient } from '../../utils/preflightPresentation.mjs';
import { guidedActive, missionContract, type GuidedDraft } from '../../utils/missionWorkspace.mjs';

export interface WorkspaceInput { prompt: string; time: string; start: string; end: string; scope: any; depth: string; mission: string | null; guided?: GuidedDraft | null }

function preflightPayload(v: WorkspaceInput) {
  const time = v.time === 'custom' ? { mode: 'custom', ...(v.start ? { start: v.start } : {}), ...(v.end ? { end: v.end } : {}) } : { mode: v.time };
  const guided = guidedActive(v.guided, v.prompt);
  return { question: v.prompt, time, ...(v.scope?.mode === 'selected' ? { analysis_scope: v.scope } : {}), ...(v.mission ? { analysis_mission: v.mission } : {}),
    ...(guided ? { input_mode: 'guided', guided_contract: v.guided!.contract } : {}) };
}

const PROVIDER: Record<string, string> = { available: 'Sẵn sàng', degraded: 'Đang chuyển dự phòng', rate_limited: 'Giới hạn quota', unavailable: 'Không khả dụng', unknown: 'Chưa kiểm tra' };

/** Step 1 of the AI assistant: a mission-consistent workspace before any AI call. */
export const AnalystWorkspace: React.FC<{ capabilities: any; status: any; value: WorkspaceInput; disabled: boolean;
  onChange: (patch: Partial<WorkspaceInput>) => void; onSubmit: (prompt?: string) => void; children?: React.ReactNode }> = ({ capabilities, status, value, disabled, onChange, onSubmit, children }) => {
  const [preflight, setPreflight] = useState<any>(null), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [risk, setRisk] = useState<any>(null), [riskBusy, setRiskBusy] = useState(false), [riskError, setRiskError] = useState('');
  const client = useMemo(() => createPreflightClient({ fetchImpl: (url, init) => fetch(url, init), debounceMs: capabilities?.limits?.preflight?.debounce_ms || 400,
    onPending: setPending, onResult: (result, message) => { setPreflight(result); setError(message || ''); } }), [capabilities?.limits?.preflight?.debounce_ms]);
  const latest = useRef(value); latest.current = value;
  const guided = guidedActive(value.guided, value.prompt);
  useEffect(() => { client.request(preflightPayload(value)); }, [client, value.prompt, value.time, value.start, value.end, JSON.stringify(value.scope), value.mission, guided]);
  // A preflight/risk result belongs to one mission/time/scope; never show it for another.
  useEffect(() => { setPreflight(null); }, [value.mission]);
  const riskSeq = useRef(0);
  useEffect(() => { riskSeq.current += 1; setRisk(null); setRiskError(''); setRiskBusy(false); }, [value.time, value.start, value.end, JSON.stringify(value.scope), value.prompt, value.mission]);
  useEffect(() => () => client.cancel(), [client]);
  const blocked = preflight?.can_submit === false && !pending;
  const chips = suggestionChips(capabilities, value.mission);
  const maxChars = capabilities?.limits?.max_question_chars;
  const contract = missionContract(capabilities, value.mission);
  const fix = (f: any) => {
    const patch = applyFix(latest.current.prompt, f, maxChars);
    if (!patch) return;
    if (patch.mission) { onChange({ mission: patch.mission, prompt: patch.question ?? latest.current.prompt, guided: null }); return; }
    if (patch.question !== undefined) onChange({ prompt: patch.question, guided: null });
    if (patch.time) onChange({ time: patch.time.mode, start: patch.time.start || '', end: patch.time.end || '' });
  };
  const runRisk = async () => {
    const id = ++riskSeq.current;
    setRiskBusy(true); setRiskError('');
    try {
      const time = value.time === 'custom' ? { mode: 'custom', start: value.start, end: value.end } : { mode: value.time };
      const response = await fetch('/api/ai/risk-watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ question: value.prompt, time, ...(value.scope?.mode === 'selected' ? { analysis_scope: value.scope } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (id !== riskSeq.current) return;
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Phạm vi hoặc thời gian chưa hợp lệ cho kiểm tra rủi ro.');
      const selected: string[] | undefined = guided ? value.guided?.contract?.signals : undefined;
      setRisk(selected ? { ...data, signals: (data.signals || []).filter((s: any) => selected.includes(s.id)) } : data);
    } catch (e: any) { if (id === riskSeq.current) setRiskError(e.message); } finally { if (id === riskSeq.current) setRiskBusy(false); }
  };
  const mission = (capabilities?.missions || []).find((m: any) => m.id === value.mission);
  const isRisk = value.mission === 'risk_watch';
  const edited = Boolean(value.guided && value.prompt && !guided);
  return <div className="space-y-4" data-analyst-workspace>
    <DataCoverageBar capabilities={capabilities} />
    <Card className="p-5 sm:p-6 space-y-5" label="Không gian phân tích">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-900 tracking-tight">Trợ lý phân tích dữ liệu</h2>
          <p className="text-xs text-slate-500 mt-1">Chọn nhiệm vụ để cấu hình không cần AI, hoặc chọn “Câu hỏi tự do”. Câu hỏi luôn được kiểm tra trước, không tốn lượt AI.</p></div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div role="status" className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
            <span>Kho dữ liệu: {status?.system_readiness?.warehouse_available === true ? 'Sẵn sàng' : status?.system_readiness?.warehouse_available === false ? 'Chưa sẵn sàng' : 'Chưa kiểm tra'}</span>
            <span>Semantic catalog: {status?.system_readiness?.catalog_ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
            <span data-provider-status>AI provider: {PROVIDER[status?.provider_status?.state || 'unknown'] || PROVIDER.unknown}</span>
          </div>
          <CapabilityDrawer capabilities={capabilities} onAsk={q => onChange({ prompt: q, guided: null })} />
        </div>
      </div>
      <div className="space-y-3">
        <MissionPicker capabilities={capabilities} value={value.mission} disabled={disabled} onChange={id => { onChange({ mission: id }); setRisk(null); }} />
        {mission && <MissionInputBuilder capabilities={capabilities} mission={mission.id} disabled={disabled}
          onApply={g => onChange({ prompt: g.question, guided: g, ...(g.time?.mode ? { time: g.time.mode, start: g.time.start || '', end: g.time.end || '' } : {}) })} />}
        {mission?.caveat && <p className="text-[11px] text-amber-800">{mission.caveat}</p>}
      </div>
      {!!chips.length && <div><div className="text-xs font-medium text-slate-500 mb-2">{mission ? `Câu hỏi mẫu · ${mission.label}` : 'Câu hỏi mẫu'}</div>
        <div className="flex flex-wrap gap-2">{chips.map(q => <button key={q} type="button" disabled={disabled} onClick={() => onChange({ prompt: q, guided: null })} className="px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50">{q}</button>)}</div></div>}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3 focus-within:bg-white focus-within:border-slate-400 transition-colors">
        <AnalysisInputForm prompt={value.prompt} disabled={disabled} maxChars={maxChars} blocked={blocked} onPrompt={prompt => onChange({ prompt })} onSubmit={() => (isRisk ? runRisk() : onSubmit())} />
        {guided && <p data-guided-active className="text-[11px] text-emerald-700">Đang dùng cấu hình nhiệm vụ đã chọn · thực thi tất định, không cần AI diễn giải.</p>}
        {edited && <div role="status" data-guided-edited className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-0">Bạn đã chỉnh sửa câu hỏi nên cấu hình nhiệm vụ không còn áp dụng; câu hỏi sẽ được gửi như câu hỏi tự do.</span>
          <button type="button" onClick={() => onChange({ prompt: value.guided!.question })} className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium">Giữ cấu hình đã chọn</button>
          <button type="button" onClick={() => onChange({ guided: null })} className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium">Dùng câu hỏi tự do</button>
        </div>}
        <QuestionPreflight result={preflight} pending={pending} error={error} onFix={fix} />
        <AnalysisScopePanel capabilities={capabilities} preflight={preflight} showTime={!mission || !(contract?.required || []).concat(contract?.optional || []).includes('time') || isRisk}
          time={value.time} start={value.start} end={value.end} scope={value.scope} depth={value.depth} showDepth={!isRisk} disabled={disabled}
          onTime={time => onChange({ time })} onStart={start => onChange({ start })} onEnd={end => onChange({ end })} onScope={scope => onChange({ scope })} onDepth={depth => onChange({ depth })} />
        <div className="flex flex-wrap justify-end items-center gap-2.5 pt-1">
          {value.prompt && <button type="button" onClick={() => onChange({ prompt: '', guided: null })} className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">Xóa</button>}
          {isRisk && <button type="button" onClick={runRisk} disabled={riskBusy || disabled || blocked} className="px-5 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40">{riskBusy ? 'Đang kiểm tra…' : 'Kiểm tra rủi ro (0 lượt AI)'}</button>}
          <button type="button" onClick={() => onSubmit()} disabled={disabled || blocked || !value.prompt.trim()} title={blocked ? 'Câu hỏi bị chặn bởi kiểm tra trước' : undefined}
            className={isRisk ? 'px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40'
              : 'px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium shadow-xs disabled:opacity-40 disabled:cursor-not-allowed'}>
            {isRisk ? 'Phân tích sâu bằng AI' : guided || preflight?.state === 'READY_GUIDED' ? 'Lập kế hoạch (không cần AI)' : 'Lập kế hoạch'}</button>
        </div>
      </div>
      {riskError && <p role="alert" className="text-xs text-rose-700">{riskError}</p>}
      {risk && <RiskSignalTable result={risk} onAsk={(q, m) => onChange({ mission: m, prompt: q, guided: null })} />}
      {children}
    </Card>
  </div>;
};
