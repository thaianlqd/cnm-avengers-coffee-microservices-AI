// Render the actual Cart page with deterministic services/hooks; no network.
// Run: node tests-checkout-ui.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const output = resolve('.checkout-ui-test.cjs');
const reactPath = require.resolve('react');
await build({entryPoints:['src/pages/Cart/index.jsx'], bundle:true, platform:'node', format:'cjs', outfile:output, jsx:'automatic', external:['react','react-dom/server','react/jsx-runtime'], plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/node_modules\/react\/index\.js$/}, () => ({path:reactPath,external:true}));
  b.onResolve({filter:/^react$/}, a => a.namespace==='fixture' ? undefined : {path:'react-hooks',namespace:'fixture'});
  b.onResolve({filter:/CartContext$/}, () => ({path:'cart',namespace:'fixture'}));
  b.onResolve({filter:/^@tanstack\/react-query$/}, () => ({path:'query',namespace:'fixture'}));
  b.onResolve({filter:/apiClient$/}, () => ({path:'api',namespace:'fixture'}));
  b.onResolve({filter:/components\//}, a => a.path.includes('DeliveryModeSelector') ? undefined : {path:'component',namespace:'fixture'});
  b.onResolve({filter:/geocodingService$/}, () => ({path:'geo',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'}, ({path}) => ({contents:{
    'react-hooks': `export * from ${JSON.stringify(reactPath)}; import React from ${JSON.stringify(reactPath)}; export default React;
      let index=0; export const useState=initial=>{const slot=index++; let value=typeof initial==='function'?initial():initial;
      if(slot===1)value=globalThis.checkoutFixture.mode; if(slot===5)value=globalThis.checkoutFixture.step;
      return [value,()=>{}]};`,
    cart: `export const useCart=()=>({cart:globalThis.checkoutFixture.items,activeUserId:'user',refreshCart:()=>{}});`,
    query: `export const useQueryClient=()=>({}); export const useMutation=()=>({});
      export const useQuery=({queryKey})=>{const f=globalThis.checkoutFixture; if(queryKey[0]==='cart-checkout-quote')return {data:f.quote};
      if(String(queryKey).includes('membership'))return {data:{quyen_loi_hien_tai:{freeship_value:f.freeship||0,freeship_min_order:0}}};return {};};`,
    api:'export const apiClient={};',component:'export default function Stub(){return null;}',geo:'export const geocodeAddress=async()=>null;',
  }[path],loader:'js'}));
}}]});
try{
  const React=require('react'); const {renderToStaticMarkup}=require('react-dom/server');
  globalThis.sessionStorage={getItem:()=>null}; globalThis.localStorage={getItem:()=>null};
  const render=f=>{globalThis.checkoutFixture=f;delete require.cache[output];return renderToStaticMarkup(React.createElement(require(output).default,{maNguoiDung:'user'}));};
  const items=[{id:1,ma_san_pham:1,ten_san_pham:'Nước',gia_ban:313000,so_luong:1,toppings:[]}];
  const quote=(fee=0)=>({subtotal:313000,discount_amount:62600,final_total:250400+fee,delivery_fee:fee});
  const cases=[
    {name:'empty step 1',step:1,mode:null,items:[],total:0,shipping:false},
    {name:'voucher step 1',step:1,mode:'GIAO_TAN_NOI',items,quote:quote(),total:250400,shipping:false},
    {name:'unselected step 2',step:2,mode:null,items,quote:quote(),total:250400,shipping:false},
    {name:'delivery step 2',step:2,mode:'GIAO_TAN_NOI',items,quote:quote(15000),total:265400,shipping:true},
    {name:'pickup step 2',step:2,mode:'LAY_TAI_QUAN',items,quote:quote(),total:250400,shipping:true},
    {name:'dine-in step 2',step:2,mode:'DUNG_TAI_CHO',items,quote:quote(),total:250400,shipping:true},
    {name:'membership freeship',step:2,mode:'GIAO_TAN_NOI',items,freeship:15000,quote:{...quote(),delivery_fee_discount:15000},total:250400,shipping:true},
  ];
  for(const f of cases){const html=render(f);assert.ok(html.includes(f.total.toLocaleString('vi-VN')+'đ'),f.name+' total');assert.equal(html.includes('<span>Phí giao hàng</span>'),f.shipping,f.name+' shipping');if(f.mode!=='GIAO_TAN_NOI'||f.step===1)assert.ok(!html.includes('15.000đ'),f.name+' unwanted fee');console.log('PASS '+f.name);}
  const widget=readFileSync('src/components/ChatWidget.jsx','utf8');
  const predicate=widget.slice(widget.indexOf('const isCheckoutConfirmation = '),widget.indexOf('const fmtDateHeader = '));
  const confirmation=new Function(`${predicate}; return isCheckoutConfirmation;`)();
  for(const text of ['oke xác nhận','ok xác nhận','xác nhận','xác nhận chốt đơn','đồng ý','đồng ý chốt đơn','chốt đơn','đặt luôn'])assert.ok(confirmation(text),text);
  for(const text of ['ok nhưng đổi sang mang đi','không xác nhận','chốt đơn chưa?'])assert.ok(!confirmation(text),text);
  assert.ok(widget.includes('if (pendingOrder && isCheckoutConfirmation(text)) {\n      await confirmPendingOrder();'));
  assert.ok(widget.indexOf('{pendingOrder && (',widget.indexOf('{activeMessages.map'))<widget.indexOf('<div ref={bottomRef} />'));
  console.log('PASS shared inline confirmation action: 8 phrases + 3 negative cases');
}finally{unlinkSync(output);}
