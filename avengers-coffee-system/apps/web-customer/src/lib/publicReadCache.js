const PATHS = new Set(['/users/branches/public','/menu/san-pham','/menu/danh-muc','/branch-reviews/stats']);
export function createPublicReadCache({storage, now=Date.now, ttl=60000}={}) {
  const values=new Map(), pending=new Map(); let generation=0;
  const copy=value=>typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const keyOf=(url,config={}) => PATHS.has(url) && !config.params && !config.signal ? 'public-read-v1:'+url : null;
  const read = key => {
    let value=values.get(key);
    if (!value) {try { value=JSON.parse(storage?.getItem(key)||'null'); } catch { /* Disabled/full storage. */ }}
    if (!value || !Number.isFinite(value.at) || now()-value.at>=ttl || now()<value.at) return null;
    values.set(key,value);return value;
  };
  return {
    async get(url,config,fetcher) {
      const key=keyOf(url,config);
      if (!key) return fetcher();
      if (config?.refresh) {generation++; values.delete(key);pending.delete(key);try{storage?.removeItem(key);}catch{/* Storage unavailable. */}}
      const cached=read(key);
      if(cached) return {data:copy(cached.data),status:200,headers:{},config};
      if(pending.has(key)) return pending.get(key);
      const epoch=generation;
      const promise=Promise.resolve().then(fetcher).then(response=>{
        if(response.status===200 && epoch===generation) {
          const value={at:now(),data:copy(response.data)};values.set(key,value);
          try {storage?.setItem(key,JSON.stringify(value));} catch { /* Memory cache still works. */ }
        }
        return response;
      }).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
      pending.set(key,promise);return promise;
    },
    clear() {generation++;values.clear();pending.clear();for(const url of PATHS)try{storage?.removeItem('public-read-v1:'+url);}catch{/* Storage unavailable. */}},
  };
}
