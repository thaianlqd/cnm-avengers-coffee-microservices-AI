import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function load() {
  let reply = async () => ({ok:true,json:async()=>({})});
  const output = buildSync({entryPoints:['src/store/usePlatformStore.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],define:{'process.env.NODE_ENV':'"test"'}}).outputFiles[0].text;
  const module={exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,require:createRequire(import.meta.url),console,DOMException,Error,
    setTimeout,clearTimeout,fetch:(...args)=>reply(...args)});
  return {...module.exports,fetcher:fn=>reply=fn};
}

test('HTTP403 is a visible permission error and never an empty or zero-valued successful mart',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  store.setState({marts:{kpi:{revenue_all_time:999}}});
  fetcher(async()=>({ok:false,status:403}));
  await store.getState().fetchMarts();
  assert.equal(store.getState().marts,null);
  assert.match(store.getState().dataErrors.marts,/chưa được cấp quyền/);
  assert.equal(store.getState().isLoadingMarts,false);
});
test('system logs use the real response envelope; failed refresh clears privileged state',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  fetcher(async path=>({ok:true,json:async()=>String(path).endsWith('/logs')?{logs:[{action:'real sync',status:'Thất bại'}]}:{users:[],roles:[]}}));
  await store.getState().fetchSystem();
  assert.equal(store.getState().systemLogs[0].action,'real sync');
  assert.equal(store.getState().users.length,0);
  fetcher(async()=>({ok:false,status:403}));
  await store.getState().fetchSystem();
  assert.equal(store.getState().systemLogs.length,0);
  assert.match(store.getState().dataErrors.system,/chưa được cấp quyền/);
  assert.equal(store.getState().isLoadingSystem,false);
});
test('streaming reads live_events and never retains stale events after failure',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  fetcher(async()=>({ok:true,json:async()=>({live_events:[{id:123,event_type:'observed'}]})}));
  await store.getState().fetchStreaming();
  assert.equal(store.getState().realtimeEvents[0].id,123);
  fetcher(async()=>({ok:false,status:500}));
  await store.getState().fetchStreaming();
  assert.equal(store.getState().realtimeEvents.length,0);
  assert.match(store.getState().dataErrors.streaming,/HTTP 500/);
});
test('late system response cannot overwrite a newer refresh',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  const releases=[];
  fetcher(async()=>new Promise(resolve=>releases.push(resolve)));
  const old=store.getState().fetchSystem();
  fetcher(async path=>({ok:true,json:async()=>String(path).endsWith('/logs')?{logs:[{action:'new'}]}:{users:[],roles:[]}}));
  await store.getState().fetchSystem();
  releases.forEach((resolve,i)=>resolve({ok:true,json:async()=>i?{logs:[{action:'old'}]}:{users:[],roles:[]}}));
  await old;
  assert.equal(store.getState().systemLogs[0].action,'new');
});
test('network failure ends loading with an error; successful zero remains a measured zero',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  fetcher(async()=>{throw Error('Network unavailable');});
  await store.getState().fetchStores();
  assert.equal(store.getState().storesData,null);
  assert.match(store.getState().dataErrors.storesData,/Network unavailable/);
  assert.equal(store.getState().isLoadingStores,false);
  fetcher(async()=>({ok:true,json:async()=>({kpi:{revenue_all_time:0,total_orders_all_time:0},revenue_daily:[]})}));
  await store.getState().fetchMarts();
  assert.equal(store.getState().marts.kpi.revenue_all_time,0);
  assert.equal(store.getState().dataErrors.marts,'');
});
test('older date response cannot overwrite the selected period or its error status',async()=>{
  const {usePlatformStore:store,fetcher}=load();
  let release;
  fetcher(async()=>new Promise(resolve=>release=resolve));
  const old=store.getState().fetchMarts();
  store.setState({dateRange:'7days'});
  fetcher(async()=>({ok:true,json:async()=>({marker:'current-seven-days'})}));
  await store.getState().fetchMarts();
  release({ok:true,json:async()=>({marker:'old-thirty-days'})});
  await old;
  assert.equal(store.getState().marts.marker,'current-seven-days');
  assert.equal(store.getState().isLoadingMarts,false);
});
test('Overview unavailable state hides invented customer/growth/transactions and genuine empty state invents no rows',()=>{
  // A single bundled entry shares its store with the rendered view.
  const entry=buildSync({stdin:{contents:"export {OverviewView} from './src/views/OverviewView'; export {usePlatformStore} from './src/store/usePlatformStore';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',external:['react'],define:{'process.env.NODE_ENV':'"test"'}}).outputFiles[0].text;
  const module={exports:{}}; const nodeRequire=createRequire(import.meta.url);
  // Render the current controlled store snapshot; SSR normally captures its initial state.
  vm.runInNewContext(entry,{module,exports:module.exports,require:name=>name==='react'?{...React,useSyncExternalStore:(_subscribe,get)=>get()}:nodeRequire(name),console,setTimeout,clearTimeout});
  const {OverviewView,usePlatformStore:store}=module.exports;
  store.setState({dataErrors:{marts:'denied'},marts:null});
  const denied=renderToStaticMarkup(React.createElement(OverviewView));
  assert.match(denied,/data-overview-unavailable/);
  assert.doesNotMatch(denied,/12\.486|15\.7%|767\.0|30\/09\/2026 14:32|Tổng doanh thu/);
  store.setState({dataErrors:{},marts:{kpi:{revenue_all_time:0,total_orders_all_time:0},revenue_daily:[]}});
  const empty=renderToStaticMarkup(React.createElement(OverviewView));
  assert.match(empty,/Tổng doanh thu/);
  assert.doesNotMatch(empty,/12\.486|15\.7%|30\/09\/2026 14:32|767\.0/);
});
