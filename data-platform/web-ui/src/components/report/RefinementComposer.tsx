import React,{useEffect,useRef,useState} from 'react';
import {refinementInputError} from '../../utils/refinementInput.mjs';

export const RefinementComposer:React.FC<{sessionId?:string;revision?:number;supported:boolean;value:string;busy:boolean;disabled:boolean;onSubmit:(text:string)=>void;onCancel:()=>void;onRestart:()=>void;notice:any;history:any[]}>=({sessionId,revision,supported,value,busy,disabled,onSubmit,onCancel,onRestart,notice,history})=>{
  const input=useRef<HTMLInputElement>(null);
  // Typing is local: hundreds of chart/map nodes must not rerender per key.
  const [draft,setDraft]=useState(value);
  const [composing,setComposing]=useState(false);
  const inputError=composing?'':refinementInputError(draft);
  const [checked,setChecked]=useState<{key:string;result:any;error:string}>({key:'',result:null,error:''});
  const [resolveBusy,setResolveBusy]=useState(false);
  const key=JSON.stringify({session_id:sessionId,current_report:{revision},feedback:draft});
  const currentKey=useRef(key);currentKey.current=key;
  const pending=Boolean(draft.trim()&&!inputError&&!composing&&checked.key!==key);
  const validationError=checked.key===key?(checked.error||checked.result?.findings?.[0]?.message||''):'';
  const maySubmit=!inputError&&!composing&&!pending&&!resolveBusy&&checked.key===key&&checked.result?.can_submit===true&&!checked.error;
  const validateDraft=async(body:string,signal?:AbortSignal,resolve=false)=>{
    try{
      const response=await fetch(`/api/ai/refinement-preflight${resolve?'?resolve_entities=true':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body,signal});
      const result=await response.json();
      if(signal?.aborted||currentKey.current!==body)return;
      if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Chưa thể kiểm tra điều chỉnh.');
      setChecked({key:body,result,error:''});
    }catch(e:any){if(!signal?.aborted&&currentKey.current===body)setChecked({key:body,result:null,error:e.message||'Chưa thể kiểm tra điều chỉnh.'});}
  };
  useEffect(()=>{
    if(!supported||!sessionId||!draft.trim()||inputError||composing)return;
    const controller=new AbortController();const timer=setTimeout(()=>void validateDraft(key,controller.signal),400);
    return()=>{clearTimeout(timer);controller.abort();};
  },[key,supported,inputError,composing]);
  useEffect(()=>setDraft(value),[value,revision]);
  const examples=[['Lọc phạm vi','Giữ nguyên chỉ số và thời gian, chỉ phân tích các chi nhánh tại Hà Nội'],['Đổi cách nhóm','Giữ nguyên chỉ số và thời gian, nhóm kết quả theo tỉnh/thành'],['Đổi kiểu biểu đồ','Giữ nguyên phạm vi và số liệu, đổi biểu đồ cột sang thanh ngang']];
  return <section data-refinement-composer aria-label="Điều chỉnh phân tích" className="analysis-adjuster">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-900">Điều chỉnh phân tích</h2><p className="mt-1 text-[11px] text-slate-500">Thay đổi phạm vi, cách nhóm hoặc cách trình bày của báo cáo đang xem.</p></div><span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{supported?`Bản báo cáo ${revision}`:'Bản lưu chỉ đọc'}</span></header>
    {!supported?<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p>Bản báo cáo này chưa có phiên phân tích để điều chỉnh. Tạo phân tích mới từ câu hỏi gốc để tiếp tục.</p><button type="button" onClick={onRestart} className="map-control">Tạo phân tích mới</button></div>:<>
      <form aria-label="Gửi điều chỉnh phân tích" className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();if(!disabled&&draft.trim()&&maySubmit)onSubmit(draft.trim());}}>
        <input ref={input} aria-label="Yêu cầu điều chỉnh phân tích" type="text" aria-describedby="refinement-guidance" aria-invalid={Boolean(inputError)} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} placeholder="VD: Đổi biểu đồ sang tròn donut, chỉ lọc chi nhánh Hà Nội…" value={draft} onChange={e=>setDraft(e.target.value)} disabled={disabled} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 disabled:opacity-60"/>
        <button type="submit" disabled={disabled||!draft.trim()||!maySubmit} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{busy?'Đang áp dụng…':'Áp dụng điều chỉnh →'}</button>
        {busy&&<button type="button" onClick={onCancel} className="map-control">Dừng chờ</button>}
      </form>
      <p id="refinement-guidance" role="status" className={`mt-2 text-[11px] ${inputError||validationError?'text-amber-800':'text-slate-500'}`}>{inputError||(pending?'Đang kiểm tra điều chỉnh hiện tại…':validationError)||'Nêu thay đổi cụ thể. Hệ thống kiểm tra phạm vi và chỉ cập nhật báo cáo sau khi chạy thành công.'}</p>
      {checked.key===key&&checked.result?.input_validation?.slots?.some((s:any)=>s.lookup_allowed&&s.state!=='BOUND')&&<button type="button" disabled={resolveBusy} className="map-control mt-2" onClick={async()=>{setResolveBusy(true);try{await validateDraft(key,undefined,true);}finally{setResolveBusy(false);}}}>Kiểm tra tên trong dữ liệu được cấp quyền</button>}
      {checked.key===key&&checked.error&&<button type="button" className="map-control mt-2" onClick={()=>void validateDraft(key)}>Kiểm tra lại điều chỉnh</button>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>Điền nhanh:</span>{examples.map(([label,text])=><button type="button" key={label} disabled={disabled} onClick={()=>{setDraft(text);input.current?.focus();}} className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-blue-700 disabled:opacity-50">{label}</button>)}<span>Chỉ chạy khi bấm áp dụng. Đổi bố cục 2–3 ô không cần gửi yêu cầu.</span></div>
    </>}
    {busy&&<p role="status" className="mt-3 rounded-lg bg-blue-50 p-2 text-[11px] text-blue-800">Đang kiểm tra yêu cầu và tạo bản cập nhật. Các số liệu bên dưới vẫn thuộc bản {revision} đang xem.</p>}
    {notice&&!busy&&<p role={notice.tone==='error'?'alert':'status'} className={`mt-3 rounded-lg p-2 text-[11px] ${notice.tone==='error'?'bg-amber-50 text-amber-900':'bg-blue-50 text-blue-800'}`}>{notice.text}</p>}
    {history.length>0&&<details className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-600"><summary className="cursor-pointer font-medium">Lịch sử điều chỉnh · {history.length} tin nhắn</summary><div className="mt-2 max-h-48 space-y-2 overflow-auto overscroll-contain">{history.map(item=><div key={item.id} className={`rounded-lg p-3 ${item.sender==='user'?'bg-slate-100':'bg-blue-50'}`}><p className="mb-1 text-[10px] text-slate-400">{item.sender==='user'?'Yêu cầu của bạn':'Trợ lý AI'} · {item.time}</p><p className="whitespace-pre-line leading-5">{item.text}</p></div>)}</div></details>}
  </section>;
};
