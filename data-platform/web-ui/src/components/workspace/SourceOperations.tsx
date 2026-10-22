import React,{useCallback,useEffect,useRef,useState} from 'react';

const STATES:Record<string,string>={queued:'Đang chờ worker',running:'Đang đồng bộ & đối soát',succeeded:'Đã kết thúc đồng bộ',partial:'Đồng bộ còn nguồn lỗi',failed:'Đồng bộ thất bại',interrupted:'Worker đã khởi động lại',expired:'Yêu cầu đã quá hạn'};
const TERMINAL=['succeeded','partial','failed','interrupted','expired'];
const timeLabel=(timestamp:number)=>new Date(timestamp*1000).toLocaleString('vi-VN');

/** Explicit bounded health reads; only an authorized click requests replica writes. */
export const SourceOperations:React.FC<{onCoverage?:(coverage:any)=>void}>=({onCoverage})=>{
  const [status,setStatus]=useState<any>(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),controller=useRef<AbortController|null>(null),checked=useRef(''),callback=useRef(onCoverage);callback.current=onCoverage;
  const readStatus=useCallback(async()=>{
    const r=await fetch('/api/system/source-operations',{signal:controller.current?.signal});
    if(!r.ok)throw Error('Chưa đọc được worker đồng bộ.');
    const data=await r.json();if(alive.current)setStatus(data);return data;
  },[]);
  const check=useCallback(async()=>{
    if(alive.current){setBusy('check');setNotice('');}
    try{
      const r=await fetch('/api/system/sources/check',{method:'POST',signal:controller.current?.signal});const data=await r.json();
      if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Chưa kiểm tra được nguồn.');
      if(!data.data_coverage||data.data_coverage.status!=='ready')throw Error('Chưa có đủ số đo nguồn. Trạng thái cũ được giữ nguyên; thử kiểm tra lại.');
      if(!alive.current)return;
      callback.current?.(data.data_coverage);void readStatus().catch(()=>{});setNotice('Đã đọc lại bằng chứng nguồn từ kho. Kiểm tra trạng thái từng nguồn ở trên; đây không phải thao tác nạp dữ liệu.');
    }catch(e:any){if(alive.current&&e.name!=='AbortError')setNotice(e.message);}
    finally{if(alive.current)setBusy('');}
  },[readStatus]);
  useEffect(()=>{
    alive.current=true;controller.current=new AbortController();readStatus().catch(()=>{if(alive.current)setStatus({configured:false});});
    return()=>{alive.current=false;controller.current?.abort();};
  },[readStatus]);
  const operation=status?.operation,active=['queued','running'].includes(operation?.state);
  useEffect(()=>{
    if(!active)return;let disposed=false,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{
        const next=await readStatus(),op=next.operation;
        if(disposed)return;
        if(TERMINAL.includes(op?.state)&&op.id!==checked.current){checked.current=op.id;await check();return;}
      }catch(e:any){if(!disposed&&e.name!=='AbortError')setNotice('Tạm mất kết nối trạng thái. Tác vụ có thể vẫn chạy; không tự gửi thêm yêu cầu.');}
      if(!disposed)timer=setTimeout(poll,2500);
    };
    timer=setTimeout(poll,2500);return()=>{disposed=true;clearTimeout(timer);};
  },[active,operation?.id,readStatus,check]);
  const sync=async()=>{
    if(busy||active)return;setBusy('sync');setNotice('');
    try{
      const r=await fetch('/api/system/sources/sync',{method:'POST',signal:controller.current?.signal});const data=await r.json();
      if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Chưa gửi được yêu cầu đồng bộ.');
      if(!alive.current)return;
      setStatus((s:any)=>({...s,operation:data.operation}));setNotice(data.created?'Đã xếp hàng. Worker sẽ nạp lại và đối soát nguồn; số liệu chỉ được xác nhận khi có kết quả kiểm tra.':'Đã có tác vụ đang chờ/chạy. Đang theo dõi cùng tác vụ.');
    }catch(e:any){if(alive.current&&e.name!=='AbortError')setNotice(e.message);}
    finally{if(alive.current)setBusy('');}
  };
  return <section data-source-operations aria-label="Kiểm tra và đồng bộ nguồn" className="w-full border-t border-slate-200/70 pt-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>void check()} disabled={Boolean(busy)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-medium text-blue-700 disabled:opacity-50">{busy==='check'?'Đang kiểm tra…':'Kiểm tra lại nguồn'}</button>
      {status?.can_trigger&&<button type="button" onClick={()=>void sync()} disabled={Boolean(busy)||active||!status?.worker_available} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-40">{active?'Đồng bộ đang xử lý…':'Đồng bộ & đối soát nguồn'}</button>}
      <span className="text-[10px] text-slate-500">Không dùng lượt AI. Ngày phát sinh cũ không đồng nghĩa lỗi đồng bộ.</span>
    </div>
    {status?.can_trigger&&!status.worker_available&&<p className="mt-2 text-[11px] text-amber-800">Worker đồng bộ chưa phản hồi. Có thể kiểm tra nguồn; chưa thể gửi lượt nạp mới.</p>}
    {status?.can_trigger===false&&<p className="mt-2 text-[10px] text-slate-500">Tài khoản có thể kiểm tra nguồn. Quyền pipeline.trigger mới được yêu cầu nạp dữ liệu.</p>}
    {notice&&<p role="status" className="mt-2 text-[11px] leading-5 text-slate-600">{notice}</p>}
    {operation&&<div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600" data-sync-operation>
      <strong className={['partial','failed','interrupted','expired'].includes(operation.state)?'text-amber-800':'text-blue-800'}>{STATES[operation.state]||'Chưa xác định trạng thái'}</strong>
      <p className="mt-1 text-[10px] text-slate-400">Yêu cầu: {timeLabel(operation.requested_at)}{operation.finished_at?' · Kết thúc: '+timeLabel(operation.finished_at):''}</p>
      {active&&<p className="mt-2">{operation.state==='queued'?'Chờ lượt hiện tại kết thúc; không chạy chồng hai lượt.':`${status.completed_tables||0}/${status.total_tables||'…'} bảng đã xử lý trong lượt đang chạy.`}</p>}
      {operation.result&&<p className="mt-2">{operation.result.synced_tables}/{operation.result.total_tables} bảng nạp thành công · {operation.result.failed_tables} bảng lỗi · {operation.result.duration_seconds}s. Trạng thái nguồn phía trên là kết quả kiểm tra riêng.</p>}
      {!!operation.result?.failures?.length&&<ul className="mt-2 list-inside list-disc">{operation.result.failures.map((f:any)=><li key={f.source}>{f.source} · {f.code}. Kiểm tra hợp đồng cột/khóa và quyền truy cập nguồn này trước khi chạy lại.</li>)}</ul>}
      {operation.error_code&&<p className="mt-2 text-amber-800">Mã: {operation.error_code}. Chưa xác nhận đồng bộ đầy đủ; kiểm tra kết nối worker/nguồn.</p>}
    </div>}
    <details className="mt-2 text-[10px] text-slate-500"><summary className="cursor-pointer">Kiểm tra lại khác gì đồng bộ?</summary><p className="mt-1 leading-5">Kiểm tra lại chỉ đọc checkpoint, schema và bằng chứng chất lượng mới nhất. Đồng bộ yêu cầu worker đọc các nguồn theo hợp đồng hiện có, nạp vào kho phân tích rồi đối soát đầy đủ. Không sửa dữ liệu gốc hoặc tự thay schema. Nguồn lỗi vẫn được giữ cảnh báo, không ép thành trạng thái đạt.</p></details>
  </section>;
};
