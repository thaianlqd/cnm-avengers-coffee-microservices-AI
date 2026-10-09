import React from 'react';
import { AnalysisMeaning } from './AnalysisMeaning';
import { analysisFailureTitle, analysisFailureActions } from '../utils/analysisPresentation.mjs';

/** Normal users see business labels; internal IDs stay in API diagnostics. */
export const AnalysisClarification: React.FC<{
  response: any;
  onChoice?: (answer: string) => void;
  onEdit?: () => void;
  onRetry?: () => void;
  onUpdate?: () => void;
  onSnapshot?: (answer: string) => void;
  onModule?: (module: any) => void;
}> = ({ response, onChoice, onEdit, onRetry, onUpdate, onModule, onSnapshot }) => {
  const clarification = response?.clarification;
  const choices = (clarification?.choices || response?.options || []).filter(
    (choice: any) => choice && typeof choice === 'object' && typeof choice.label === 'string'
  );
  const issue = response?.issue;
  const failed = response?.status === 'error';
  const actions = analysisFailureActions(response);
  return (
    <section role={failed ? 'alert' : 'status'} className={`rounded-2xl border p-6 space-y-3 ${failed ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <h3 className="text-sm font-semibold text-slate-800">{issue?.title || analysisFailureTitle(response)}</h3>
      <p className="text-sm text-slate-700">{clarification?.user_message || response?.message || 'Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.'}</p>
      {issue?.what_is_known?.length > 0 && <div className="text-xs"><strong>Đã nhận diện:</strong> {issue.what_is_known.join(' · ')}</div>}
      {issue?.what_is_missing?.filter((text: string) => text !== (clarification?.user_message || response.message)).map((text: string, index: number) => <p key={index} className="text-xs"><strong>{failed || response.outcome === 'SYSTEM_ERROR' || issue.category === 'PLANNING_CAPACITY' ? 'Thông tin:' : 'Cần bổ sung:'}</strong> {text}</p>)}
      {issue?.recovery_summary && <p className="text-xs text-slate-600">{issue.recovery_summary}</p>}
      {issue?.resolution_guidance && <p className="text-xs text-slate-700"><strong>Cách xử lý:</strong> {issue.resolution_guidance}</p>}
      {issue?.suggested_actions?.filter((action: any) => action.type === 'followup').map((action: any, index: number) => <button type="button" key={index} disabled={!onChoice} onClick={() => onChoice?.(action.followup)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">{action.label}</button>)}
      {issue?.suggested_actions?.filter((action: any) => action.type === 'snapshot').map((action: any, index: number) => <button type="button" key={index} disabled={!onSnapshot} onClick={() => onSnapshot?.(action.followup)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">{action.label}</button>)}
      {issue?.suggested_actions?.filter((action: any) => action.type === 'select_module').map((action: any, index: number) => <button type="button" key={index} disabled={!onModule} onClick={() => onModule?.({ module_id: action.module_id, name: action.label, compatibility: 'ready' })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">{action.label}</button>)}
      {issue?.suggested_actions?.some((action: any) => action.type === 'update_module') && (onUpdate || onEdit) && <button type="button" onClick={onUpdate || onEdit} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">Cập nhật bài toán</button>}
      {clarification?.known_interpretation && <AnalysisMeaning interpretation={clarification.known_interpretation} />}
      {!issue && choices.length > 0 && <div className="flex flex-wrap gap-2">{choices.map((choice: any, index: number) => (
        <button type="button" key={index} onClick={() => onChoice?.(choice.followup || choice.label)} disabled={!onChoice}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-800" title={choice.description || ''}>
          {choice.label}{choice.unit ? ` (${choice.unit})` : ''}
        </button>
      ))}</div>}
      {actions.edit && onEdit && <button type="button" onClick={onEdit} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">Chỉnh sửa câu hỏi</button>}
      {actions.retry && onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">Thử lại khi hệ thống sẵn sàng</button>}
    </section>
  );
};
