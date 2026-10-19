import React, { useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
export const StreamingView: React.FC = () => {
  const {realtimeEvents,fetchStreaming,setInspectedEvent,isLiveStreaming,setIsLiveStreaming,dataErrors}=usePlatformStore();
  useEffect(()=>{fetchStreaming();if(!isLiveStreaming)return;const timer=setInterval(fetchStreaming,4000);return()=>clearInterval(timer);},[fetchStreaming,isLiveStreaming]);
  return <section className="space-y-4"><h1 className="text-xl font-semibold">Sự kiện streaming</h1>
    <p className="text-sm text-slate-500">Chưa đo Kafka lag, throughput và trạng thái consumer. Số bản ghi projection PostgreSQL không phải số object Bronze.</p>
    <button className="rounded-xl border px-4 py-2" onClick={()=>setIsLiveStreaming(!isLiveStreaming)}>{isLiveStreaming?'Dừng làm mới':'Tự động làm mới'}</button>
    {dataErrors.streaming && <p role="alert" className="text-red-700">{dataErrors.streaming}</p>}
    {realtimeEvents.length===0 ? <p role="status">Chưa có sự kiện được quan sát trong phản hồi.</p> : <table className="w-full text-left text-sm"><thead><tr><th>Topic</th><th>Loại sự kiện</th><th>Thời gian</th><th>Chi tiết</th></tr></thead><tbody>{realtimeEvents.map(e=><tr key={e.id}><td>{e.topic}</td><td>{e.event_type}</td><td>{e.received_at}</td><td><button onClick={()=>setInspectedEvent(e)}>Xem sự kiện</button></td></tr>)}</tbody></table>}
  </section>;
};
