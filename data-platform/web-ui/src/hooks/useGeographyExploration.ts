import { useEffect, useRef, useState } from 'react';

export function useGeographyExploration(report:any, city?:string|null, store?:string|null, enabled=true) {
  const [state,setState]=useState<{key:string;data:any;loading:boolean;error:string}>({key:'',data:null,loading:false,error:''});
  const [retry,setRetry]=useState(0),generation=useRef(0);
  const cache=useRef(new Map<string,any>());
  const identity=`${report.session_id}:${report.revision}`;
  const resourceKey=identity+JSON.stringify([city??null,store??null]);
  const previous=useRef(identity);
  if(previous.current!==identity){cache.current.clear();previous.current=identity;}
  useEffect(()=>{
    const version=++generation.current,controller=new AbortController();
    const current=()=>generation.current===version&&!controller.signal.aborted;
    if(!enabled||!report.session_id){setState({key:resourceKey,data:null,loading:false,error:''});return()=>controller.abort();}
    const params=new URLSearchParams({revision:String(report.revision||1)});
    if(city!=null)params.set('city',city);if(store)params.set('store',store);
    const key=identity+'?'+params;
    if(cache.current.has(key)){setState({key:resourceKey,data:cache.current.get(key),loading:false,error:''});return()=>controller.abort();}
    setState({key:resourceKey,data:null,loading:true,error:''});
    // Give a discarded StrictMode mount a chance to cancel before starting SQL.
    const timer=setTimeout(()=>{fetch(`/api/ai/sessions/${encodeURIComponent(report.session_id)}/geography?${params}`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Chưa tải được dữ liệu khám phá địa bàn.');
        if(!Array.isArray(data.provinces)||!Array.isArray(data.stores)||data.revision!==(report.revision||1))throw Error('Dữ liệu bản đồ chưa khớp phiên báo cáo.');
        if(current()){cache.current.set(key,data);if(cache.current.size>32)cache.current.delete(cache.current.keys().next().value!);setState({key:resourceKey,data,loading:false,error:''});}})
      .catch(error=>{if(current())setState({key:resourceKey,data:null,loading:false,error:error.message||'Chưa kết nối được dữ liệu bản đồ.'});});},0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[identity,city,store,enabled,retry]);
  const visible=state.key===resourceKey&&enabled?state:{data:null,loading:enabled,error:''};
  return {...visible,reload:()=>{cache.current.clear();setRetry(n=>n+1);}};
}
