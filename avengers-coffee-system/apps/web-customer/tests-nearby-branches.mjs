// Render and exercise the actual branch component with synthetic services.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url), output=resolve('.nearby-ui-test.cjs');
const reactPath=require.resolve('react');
await build({entryPoints:['src/components/features_thaian/NearbyBranchChecker.jsx'],bundle:true,platform:'node',format:'cjs',outfile:output,jsx:'automatic',external:['react','react-dom/server','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/node_modules\/react\/index\.js$/},()=>({path:reactPath,external:true}));
  b.onResolve({filter:/^react$/},a=>a.namespace==='fixture'?undefined:{path:'hooks',namespace:'fixture'});
  b.onResolve({filter:/apiClient$/},()=>({path:'api',namespace:'fixture'}));
  b.onResolve({filter:/geocodingService$/},()=>({path:'geo',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:{
    hooks:`export * from ${JSON.stringify(reactPath)}; import React from ${JSON.stringify(reactPath)};export default React;
      let slot=0;export const useState=initial=>{const index=slot++;const f=globalThis.branchFixture;
        return [index===0?f.inventory:index===1?!!f.loading:initial,value=>f.updates.push({index,value})];};
      export const useEffect=(effect,deps)=>globalThis.branchFixture.effects.push({effect,deps});`,
    api:`export const apiClient={get:async()=>{throw new Error('synthetic inventory failure')}};`,
    geo:`export const MAX_DELIVERY_RADIUS_KM=5;export const resolveBranchCoordinates=b=>b.coords;
      export const calculateDistanceKm=(a,b,c,d)=>c;`,
  }[path]}));
}}]});
const runtime=require('react/jsx-runtime'), jsx=runtime.jsx, jsxs=runtime.jsxs;
const capture=original=>(type,props,key)=>{if(type==='button'&&key)globalThis.branchFixture.buttons[key]=props;return original(type,props,key)};
runtime.jsx=capture(jsx);runtime.jsxs=capture(jsxs);
try{
  const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
  const items=[{ma_san_pham:901,ten_san_pham:'Alpha'},{ma_san_pham:902,ten_san_pham:'Beta'}];
  const branches=['A','B','C'].map((code,index)=>({ma_chi_nhanh:code,ten_chi_nhanh:'Branch '+code,coords:{lat:(index+1)/10,lng:0}}));
  const render=f=>{
    globalThis.branchFixture=f;f.effects=[];f.updates=[];f.buttons={};f.selections=[];f.stock=[];delete require.cache[output];
    f.select=code=>f.selections.push(code);f.status=value=>f.stock.push(value);
    return renderToStaticMarkup(React.createElement(require(output).default,{branches,userCoordinates:f.noCoords?null:{lat:0,lng:0},
      cart:items,products:items.map(item=>({...item,trang_thai:true})),selectedBranch:f.selected||'',onSelectBranch:f.select,onStockStatusChange:f.status}));
  };
  const statusEffect=f=>f.effects.find(entry=>entry.deps?.includes(f.status)).effect();
  const partial={inventory:{A:[{ma_san_pham:902,dang_kinh_doanh:false}],B:[],C:[]},selected:'A'};
  const html=render(partial);
  assert.ok(html.includes('Alpha')&&html.includes('Beta')&&html.includes('Branch A'));
  assert.equal(partial.buttons.A.disabled,true);assert.equal(partial.buttons.B.disabled,false);
  partial.buttons.A.onClick();assert.deepEqual(partial.selections,[]);
  statusEffect(partial);assert.deepEqual(partial.selections,['B']);assert.equal(partial.stock[0].canOrder,false);
  partial.selected='B';render(partial);statusEffect(partial);assert.equal(partial.stock[0].canOrder,true);
  assert.deepEqual(partial.stock[0].availableBranches.map(b=>b.code),['B','C']);
  console.log('PASS partial card explains exact products; only closest compatible branch receives delivery');
  const unknown={inventory:{A:null,B:null,C:null},selected:'A'};
  const unknownHtml=render(unknown);statusEffect(unknown);
  assert.equal(unknown.buttons.A.disabled,true);assert.ok(unknownHtml.includes('Chưa xác minh'));
  assert.equal(unknown.stock[0].canOrder,false);assert.equal(unknown.stock[0].reason,'AVAILABILITY_UNVERIFIED');
  assert.deepEqual(unknown.selections,[]);
  // The real fetch catch must store unknown rather than an empty successful response.
  unknown.effects.find(entry=>entry.deps?.length===2).effect();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(unknown.updates.find(update=>update.index===0).value,{A:null,B:null,C:null});
  console.log('PASS failed inventory requests stay unknown and block selection/checkout');
  const loading={inventory:{A:[],B:[],C:[]},loading:true};render(loading);statusEffect(loading);
  assert.equal(loading.stock[0].canOrder,false);assert.deepEqual(loading.selections,[]);
  const noCoords={inventory:{},noCoords:true};render(noCoords);statusEffect(noCoords);assert.equal(noCoords.stock[0].canOrder,false);
  console.log('PASS loading and missing delivery coordinates cannot confirm availability');
}finally{runtime.jsx=jsx;runtime.jsxs=jsxs;unlinkSync(output)}
