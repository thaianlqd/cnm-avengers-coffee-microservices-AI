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
  b.onResolve({filter:/components\//}, a => /DeliveryModeSelector|BranchSelector/.test(a.path) ? undefined : {path:'component',namespace:'fixture'});
  b.onResolve({filter:/geocodingService$/}, () => ({path:'geo',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'}, ({path}) => ({contents:{
    'react-hooks': `export * from ${JSON.stringify(reactPath)}; import React from ${JSON.stringify(reactPath)}; export default React;
      let index=0, refIndex=0; export const useState=initial=>{const slot=index++; const f=globalThis.checkoutFixture; let value=typeof initial==='function'?initial():initial;
      if(slot===1)value=f.mode; if(slot===2)value=f.branch||''; if(slot===5)value=f.step;
      if(slot===6)value=f.payment||null; if(slot===7&&f.address)value=f.address; if(slot===16)value=f.voucher||null;
      return [value,next=>f.updates.push([slot,next])]};
      export const useEffect=(effect,deps)=>globalThis.checkoutFixture.effects.push({effect,deps});
      export const useRef=initial=>{const f=globalThis.checkoutFixture;return f.refs[refIndex++]||= {current:initial}};`,
    cart: `export const useCart=()=>({cart:globalThis.checkoutFixture.items,activeUserId:'user',refreshCart:()=>{}});`,
    query: `export const useQueryClient=()=>({invalidateQueries:value=>globalThis.checkoutFixture.invalidations.push(value)});
      export const useMutation=({mutationFn})=>{globalThis.checkoutFixture.mutationFn=mutationFn; return {mutateAsync:mutationFn};};
      export const useQuery=({queryKey})=>{const f=globalThis.checkoutFixture; if(queryKey[0]==='cart-checkout-quote')return {data:f.quote};
      if(queryKey[0]==='public-branches')return {data:{items:f.branches||[]}};
      if(String(queryKey).includes('membership'))return {data:{quyen_loi_hien_tai:{freeship_value:f.freeship||0,freeship_min_order:0}}};return {};};`,
    api:'export const apiClient={post:(...args)=>globalThis.checkoutFixture.post(...args)};',component:'export default function Stub(){return null;}',geo:'export const geocodeAddress=async()=>null;',
  }[path],loader:'js'}));
}}]});
const runtime=require('react/jsx-runtime');
const originalJsx=runtime.jsx, originalJsxs=runtime.jsxs;
const capture=(original)=>(type,props,key)=>{
  const f=globalThis.checkoutFixture;
  if(type==='button'&&props.onClick?.name==='khoiTaoThanhToan')f.checkoutButton=props;
  if(type?.name==='DeliveryModeSelector')f.modeSelector=props;
  return original(type,props,key);
};
runtime.jsx=capture(originalJsx); runtime.jsxs=capture(originalJsxs);
try{
  const React=require('react'); const {renderToStaticMarkup}=require('react-dom/server');
  globalThis.sessionStorage={getItem:()=>null}; globalThis.localStorage={getItem:()=>null};
  globalThis.window={location:{}};
  const render=f=>{globalThis.checkoutFixture=f;f.refs||=[];f.effects=[];f.updates=[];f.invalidations=[];delete require.cache[output];return renderToStaticMarkup(React.createElement(require(output).default,{maNguoiDung:'user'}));};
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
  const branches=[{ma_chi_nhanh:'CN_1',ten_chi_nhanh:'Chi nhánh 1',dia_chi:'Hồ Chí Minh'},{ma_chi_nhanh:'CN_2',ten_chi_nhanh:'Chi nhánh 2',dia_chi:'Hồ Chí Minh'}];
  for(const mode of ['LAY_TAI_QUAN','DUNG_TAI_CHO','GIAO_TAN_NOI']){
    const f={step:2,mode,items,branches,payment:'VNPAY',quote:quote()};const html=render(f);
    f.effects.find(({deps})=>deps?.length===5&&deps[0]?.items===branches).effect();
    assert.equal(f.updates.some(([slot])=>slot===2),mode==='GIAO_TAN_NOI',mode+' branch selection');
    if(mode!=='GIAO_TAN_NOI'){
      assert.ok(html.includes('Chọn chi nhánh'),mode+' has an unselected placeholder');
      assert.equal(f.checkoutButton.disabled,true,mode+' requires branch');
      await f.checkoutButton.onClick();
      assert.ok(f.updates.some(([slot,value])=>slot===11&&String(value).includes('chọn chi nhánh')));
      f.branch='CN_2';render(f);assert.equal(Boolean(f.checkoutButton.disabled),false,mode+' accepts explicit branch');
    }
  }
  const switching={step:2,mode:'GIAO_TAN_NOI',branch:'CN_1',items,branches};render(switching);
  switching.modeSelector.onChange('LAY_TAI_QUAN');
  assert.ok(switching.updates.some(([slot,value])=>slot===2&&value===''),'automatic delivery branch is cleared on pickup');
  console.log('PASS explicit pickup/dine-in branches; delivery auto resolve preserved');

  for(const emptyAfterTimeout of [false,true]){
    const sent=[];
    const f={step:2,mode:'LAY_TAI_QUAN',branch:'CN_2',payment:'VNPAY',items,quote:quote(),voucher:{ma_voucher:'SAVE20',so_tien_giam:62600},post:async(path,payload)=>{
      sent.push({path,payload});if(sent.length===1)throw new Error('response timeout');
      return {data:{don_hang:{ma_don_hang:'ORDER_1'},already_processed:true,redirect_url:'https://payment.test'}};
    }};
    render(f);await f.checkoutButton.onClick();
    assert.match(sent[0].payload.checkout_action_id,/^[0-9a-f-]{36}$/i);
    if(emptyAfterTimeout){f.items=[];f.quote=undefined;f.voucher=null;}
    const html=render(f);assert.ok(html.includes('Thử lại đơn đã gửi'));
    assert.equal(Boolean(f.checkoutButton.disabled),false,'retry remains enabled');
    await f.checkoutButton.onClick();
    assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0],'retry reuses exact action and payload');
    assert.equal(window.location.href,'https://payment.test');
  }
  const sent=[];
  const changed={step:2,mode:'LAY_TAI_QUAN',branch:'CN_1',payment:'VNPAY',items,quote:quote(),post:async(path,payload)=>{sent.push(payload);throw new Error('timeout');}};
  render(changed);await changed.checkoutButton.onClick();changed.branch='CN_2';render(changed);
  await changed.checkoutButton.onClick();assert.equal(sent.length,1,'changed snapshot cannot create another action after timeout');
  assert.ok(changed.updates.some(([slot,value])=>slot===11&&String(value).includes('Đơn trước đã gửi')));
  const corrected=[];
  const rejected={step:2,mode:'LAY_TAI_QUAN',branch:'CN_1',payment:'VNPAY',items,quote:quote(),post:async(path,payload)=>{
    corrected.push(payload);if(corrected.length===1)throw Object.assign(new Error('voucher invalid'),{response:{status:400,data:{message:'voucher invalid',checkout_not_created:true}}});
    return {data:{redirect_url:'https://payment.test'}};
  }};
  render(rejected);await rejected.checkoutButton.onClick();rejected.branch='CN_2';render(rejected);await rejected.checkoutButton.onClick();
  assert.notEqual(corrected[0].checkout_action_id,corrected[1].checkout_action_id,'a corrected action is permitted only after no-order proof');
  console.log('PASS Web action reuse after timeout/empty cart; changed snapshot blocked; safe correction');
  const widget=readFileSync('src/components/ChatWidget.jsx','utf8');
  const predicate=widget.slice(widget.indexOf('const isCheckoutConfirmation = '),widget.indexOf('const fmtDateHeader = '));
  const confirmation=new Function(`${predicate}; return isCheckoutConfirmation;`)();
  for(const text of ['oke xác nhận','ok xác nhận','xác nhận','xác nhận chốt đơn','đồng ý','đồng ý chốt đơn','chốt đơn','đặt luôn'])assert.ok(confirmation(text),text);
  for(const text of ['ok nhưng đổi sang mang đi','không xác nhận','chốt đơn chưa?'])assert.ok(!confirmation(text),text);
  assert.ok(widget.includes('if (pendingOrder && isCheckoutConfirmation(text)) {\n      await confirmPendingOrder();'));
  assert.ok(widget.indexOf('{pendingOrder && (',widget.indexOf('{activeMessages.map'))<widget.indexOf('<div ref={bottomRef} />'));
  console.log('PASS shared inline confirmation action: 8 phrases + 3 negative cases');
}finally{runtime.jsx=originalJsx;runtime.jsxs=originalJsxs;unlinkSync(output);}
