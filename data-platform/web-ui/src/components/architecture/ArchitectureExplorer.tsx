import React, { useEffect, useId, useRef, useState } from 'react';
import { Pagination, usePagination } from '../Pagination';
import { architectureNodes as nodes, architectureEdges as edges, flows, type ArchitectureNode, type FlowId } from './architectureModel';

const WIDTH = 2070, NODE_WIDTH = 286, NODE_HEIGHT = 120, ROW_HEIGHT = 222;
const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-blue-600 disabled:opacity-40';
const wrap = (value: string, limit = 38) => {
  const result: string[] = []; let line = '';
  for (const word of value.split(' ')) { if ((line+' '+word).trim().length>limit && line) { result.push(line); line=word; } else line=(line+' '+word).trim(); }
  if (line) result.push(line); return result;
};

export function ArchitectureExplorer() {
  const [tab, setTab] = useState('map');
  const [flow, setFlow] = useState<FlowId | 'all'>('all');
  const [selected, setSelected] = useState('warehouse');
  const [search, setSearch] = useState('');
  const [labels, setLabels] = useState(false);
  const [trace, setTrace] = useState(false);
  const [zoom, setZoom] = useState(.6);
  const [fitMode, setFitMode] = useState(true);
  const [full, setFull] = useState(false);
  const section = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), fullButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{x:number;y:number;left:number;top:number} | null>(null);
  const marker = useId().replace(/:/g,'');
  const active = nodes.find(n=>n.id===selected)!;
  const shown = nodes.filter(n=>flow==='all'||n.lane===flow);
  const shownIds = new Set(shown.map(n=>n.id));
  const shownEdges = edges.filter(e=>shownIds.has(e.source)&&shownIds.has(e.target));
  const related = new Set([selected,...edges.filter(e=>e.source===selected||e.target===selected).flatMap(e=>[e.source,e.target])]);
  const found = nodes.filter(n=>(flow==='all'||n.lane===flow) && `${n.title} ${n.tech} ${n.detail}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi').trim()));
  const componentPage = usePagination(found,8,flow+search);
  const height = flow==='all'?ROW_HEIGHT*flows.length+44:280;
  const position = (n: ArchitectureNode) => ({x:38+n.col*337,y:78+(flow==='all'?flows.findIndex(f=>f.id===n.lane)*ROW_HEIGHT:0)});
  const fit = () => { if(viewport.current) { setZoom(Math.max(.3,Math.min(1,(viewport.current.clientWidth-24)/WIDTH))); viewport.current.scrollTo(0,0); } };
  useEffect(()=>{
    const element=viewport.current; if(!element||tab!=='map'||!fitMode)return;
    const observer=new ResizeObserver(()=>fit()); observer.observe(element); return ()=>observer.disconnect();
  },[fitMode,full,tab,flow]);
  useEffect(()=>{
    if(!full)return;
    section.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape') {setFull(false);fullButton.current?.focus();}
      if(event.key==='Tab') {
        const controls=section.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"],summary');
        if(!controls?.length)return;
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey && (document.activeElement===first||document.activeElement===section.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[full]);
  const select=(id:string)=>setSelected(id);
  const changeZoom=(next:number)=>{setFitMode(false);setZoom(Math.max(.2,Math.min(1.8,next)));};
  const download=()=>{
    if(!svg.current)return;
    const copy=svg.current.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns','http://www.w3.org/2000/svg'); copy.setAttribute('width',String(WIDTH));copy.setAttribute('height',String(height));
    const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=`avengers-architecture-${flow}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const filteredFlows=flows.filter(f=>flow==='all'||f.id===flow);

  return <div ref={section} tabIndex={full?-1:undefined} role={full?'dialog':undefined} aria-modal={full||undefined} aria-label={full?'Sơ đồ kiến trúc toàn màn hình':undefined} className={full?'architecture-fullscreen':'space-y-5'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Cách xem kiến trúc" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">{[['map','Sơ đồ tổng thể'],['journey','Luồng A–Z'],['components','Thành phần']].map(([id,label])=><button type="button" role="tab" aria-selected={tab===id} aria-controls="architecture-panel" id={`architecture-tab-${id}`} key={id} onClick={()=>setTab(id)} className={`rounded-lg px-3 py-2 text-xs font-medium focus-visible:outline-blue-600 ${tab===id?'bg-blue-50 text-blue-700':'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</div>
      {full && <button type="button" onClick={()=>{setFull(false);fullButton.current?.focus();}} className={control}>Đóng toàn màn hình · Esc</button>}
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <label className="flex items-center gap-2 text-xs text-slate-500">Luồng<select aria-label="Lọc luồng kiến trúc" value={flow} onChange={e=>{const value=e.target.value as FlowId|'all';setFlow(value);if(value!=='all')setSelected(flows.find(f=>f.id===value)!.nodes[0]);}} className="max-w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 focus-visible:outline-blue-600"><option value="all">Toàn bộ hệ thống</option>{flows.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
      <input type="search" aria-label="Tìm thành phần kiến trúc" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm Kafka, ví, snapshot, AI…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs outline-none focus:border-blue-500 sm:min-w-48"/>
      <span className="text-[11px] text-slate-400">{shown.length} thành phần · {shownEdges.length} kết nối</span>
    </div>
    {search.trim() && tab!=='components' && <div className="flex flex-wrap gap-2" aria-label="Kết quả tìm thành phần">{found.length?found.map(n=><button type="button" key={n.id} onClick={()=>select(n.id)} className={`${control} ${selected===n.id?'border-blue-400 text-blue-700':''}`}>{n.title}</button>):<p role="status" className="p-2 text-sm text-slate-500">Không tìm thấy thành phần phù hợp.</p>}</div>}

    <section id="architecture-panel" role="tabpanel" aria-labelledby={`architecture-tab-${tab}`}>
      {tab==='map' && <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2"><button type="button" className={control} aria-label="Thu nhỏ sơ đồ" disabled={zoom<=.2} onClick={()=>changeZoom(zoom-.15)}>−</button><span className="w-11 text-center text-xs tabular-nums text-slate-300" aria-live="polite">{Math.round(zoom*100)}%</span><button type="button" className={control} aria-label="Phóng to sơ đồ" disabled={zoom>=1.8} onClick={()=>changeZoom(zoom+.15)}>+</button><button type="button" className={control} onClick={()=>{setFitMode(true);fit();}}>Vừa chiều rộng</button><button type="button" className={control} onClick={()=>{if(!viewport.current)return;setFitMode(false);setZoom(Math.max(.2,Math.min(1,(viewport.current.clientWidth-24)/WIDTH,(viewport.current.clientHeight-24)/height)));viewport.current.scrollTo(0,0);}}>Xem toàn sơ đồ</button><button type="button" ref={fullButton} className={control} onClick={()=>{setFull(true);setFitMode(true);}}>Toàn màn hình</button><button type="button" className={control} onClick={download}>Tải SVG</button></div>
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-300"><label className="flex items-center gap-2"><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)} className="accent-blue-500"/>Nhãn kết nối</label><label className="flex items-center gap-2"><input type="checkbox" checked={trace} onChange={e=>setTrace(e.target.checked)} className="accent-blue-500"/>Nổi luồng liên quan</label></div>
        </div>
        <div ref={viewport} tabIndex={0} role="region" aria-label="Sơ đồ có thể cuộn ngang" className={`architecture-canvas ${full?'architecture-canvas--full':''}`} onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[data-architecture-node]'))return;const element=e.currentTarget;drag.current={x:e.clientX,y:e.clientY,left:element.scrollLeft,top:element.scrollTop};element.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;e.currentTarget.scrollLeft=drag.current.left-(e.clientX-drag.current.x);e.currentTarget.scrollTop=drag.current.top-(e.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
          <svg ref={svg} width={WIDTH*zoom} height={height*zoom} viewBox={`0 0 ${WIDTH} ${height}`} aria-label="Bản đồ toàn bộ các luồng dữ liệu và AI" style={{display:'block',maxWidth:'none',fontFamily:'system-ui, sans-serif'}}>
            <defs>{[['data','#60a5fa'],['control','#94a3b8'],['exception','#fbbf24']].map(([id,color])=><marker key={id} id={`${marker}-${id}`} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 8 4.5 1 8" fill="none" stroke={color} strokeWidth="1.5"/></marker>)}<pattern id={`${marker}-grid`} width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#23314a"/></pattern></defs>
            <rect width={WIDTH} height={height} fill="#0b1220"/><rect width={WIDTH} height={height} fill={`url(#${marker}-grid)`}/>
            {filteredFlows.map((f,i)=><g key={f.id}><rect x="20" y={22+i*ROW_HEIGHT} width={WIDTH-40} height="194" rx="16" fill="#101b2d" fillOpacity=".75" stroke="#20304b"/><text x="42" y={52+i*ROW_HEIGHT} fill="#93c5fd" fontSize="15" fontWeight="600">{f.title}</text></g>)}
            {shownEdges.map((e,i)=>{
              const a=position(nodes.find(n=>n.id===e.source)!),b=position(nodes.find(n=>n.id===e.target)!);
              const sameRow=a.y===b.y, forward=b.x>a.x, adjacent=Math.abs(a.x-b.x)<338, upward=b.y<a.y;
              const x1=sameRow?a.x+NODE_WIDTH:a.x+NODE_WIDTH/2,y1=sameRow?a.y+NODE_HEIGHT/2:upward?a.y:a.y+NODE_HEIGHT;
              const x2=sameRow?b.x:b.x+NODE_WIDTH/2,y2=sameRow?b.y+NODE_HEIGHT/2:upward?b.y+NODE_HEIGHT:b.y;
              const middle=sameRow?y1+(e.kind==='exception'?1:-1)*(NODE_HEIGHT/2+16):y1+(upward?-1:1)*(22+(i%3)*8);
              // Cross-lane edges travel in gutters and enter top/bottom ports;
              // passing behind other nodes would imply a connection that does not exist.
              const viaX=b.x-14-(i%3)*4, targetBand=y2+(upward?18:-18);
              const d=sameRow&&forward&&adjacent?`M${x1} ${y1}H${x2-4}`:sameRow?`M${x1} ${y1}h12V${middle}H${x2-12}V${y2}H${x2-4}`:`M${x1} ${y1}V${middle}H${viaX}V${targetBand}H${x2}V${y2+(upward?4:-4)}`;
              const color=e.kind==='data'?'#60a5fa':e.kind==='exception'?'#fbbf24':'#94a3b8';
              return <g key={`${e.source}-${e.target}`} opacity={trace&&e.source!==selected&&e.target!==selected?'0.7':1}>
                <path d={d} fill="none" stroke={color} strokeWidth={e.source===selected||e.target===selected?2:1.3} strokeOpacity={trace&&e.source!==selected&&e.target!==selected? .15 : .65} strokeDasharray={e.kind==='control'?'5 5':undefined} markerEnd={`url(#${marker}-${e.kind})`}/>
                <title>{nodes.find(n=>n.id===e.source)!.title} → {nodes.find(n=>n.id===e.target)!.title}{e.label?`: ${e.label}`:''}</title>
                {labels&&e.label&&<text x={sameRow?(x1+x2)/2:x2+8} y={sameRow?(adjacent?y1-11:middle-5):y2-8} textAnchor={sameRow?'middle':'start'} fill={color} fontSize="11" paintOrder="stroke" stroke="#0b1220" strokeWidth="4">{e.label}</text>}
              </g>;
            })}
            {shown.map(n=>{
              const {x,y}=position(n),isSelected=n.id===selected,matched=!search.trim()||found.some(f=>f.id===n.id);
              return <g key={n.id} data-architecture-node={n.id} role="button" aria-label={`${n.title} · ${n.tech}`} aria-pressed={isSelected} tabIndex={0} onClick={()=>select(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(n.id);}}} style={{cursor:'pointer',outline:'none'}} className="architecture-svg-node" opacity={(!matched||(trace&&!related.has(n.id))) ? .28 : 1}>
                <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill={isSelected?'#142e54':'#111e32'} stroke={isSelected?'#60a5fa':'#33445e'} strokeWidth={isSelected?2.5:1}/>
                <rect x={x+16} y={y+16} width="26" height="26" rx="7" fill={isSelected?'#2563eb':'#203a60'}/><text x={x+29} y={y+34} textAnchor="middle" fill="#bfdbfe" fontSize="12" fontWeight="600">{n.col+1}</text>
                <text x={x+53} y={y+34} fill="#eff6ff" fontSize="16" fontWeight="600">{n.title}</text>
                <text x={x+17} y={y+66} fill="#9eb3d0" fontSize="12">{wrap(n.tech).map((line,i)=><tspan x={x+17} dy={i?18:0} key={i}>{line}</tspan>)}</text>
                <text x={x+17} y={y+103} fill={isSelected?'#93c5fd':'#6f89ac'} fontSize="10">{isSelected?'ĐANG CHỌN':'CHỌN ĐỂ XEM CHI TIẾT'}</text>
              </g>;
            })}
          </svg>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-[10px] text-slate-400"><div className="flex flex-wrap gap-4"><span><span className="mr-2 text-blue-400">━━→</span>Dữ liệu / kết quả</span><span><span className="mr-2 text-slate-400">┄┄→</span>Điều khiển / truy vấn</span><span><span className="mr-2 text-amber-400">━━→</span>Nhánh lỗi</span></div><span>Kéo nền hoặc cuộn để di chuyển · Chọn thành phần để xem chi tiết</span></div>
      </div>}
      {tab==='journey' && <div className="space-y-4">{filteredFlows.map(f=><section key={f.id} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold text-slate-800">{f.title}</h2><p className="mt-1 text-xs leading-6 text-slate-500">{f.description}</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{f.nodes.map((id,i)=>{const n=nodes.find(n=>n.id===id)!;return <button type="button" key={id} onClick={()=>select(id)} className={`rounded-xl border p-4 text-left focus-visible:outline-blue-600 ${selected===id?'border-blue-300 bg-blue-50':'border-slate-100 bg-slate-50 hover:border-blue-200'}`}><span className="text-[10px] font-semibold text-blue-600">{String(i+1).padStart(2,'0')}</span><h3 className="mt-1 text-xs font-semibold text-slate-800">{n.title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-500">{n.detail}</p></button>;})}</div></section>)}</div>}
      {tab==='components' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="grid gap-3 p-4 sm:grid-cols-2">{componentPage.items.map(n=><button type="button" key={n.id} onClick={()=>select(n.id)} className={`rounded-xl border p-4 text-left focus-visible:outline-blue-600 ${selected===n.id?'border-blue-300 bg-blue-50':'border-slate-100 hover:border-blue-200'}`}><h2 className="text-sm font-semibold text-slate-800">{n.title}</h2><p className="mt-1 text-xs text-blue-600">{n.tech}</p><p className="mt-2 text-xs leading-6 text-slate-500">{n.detail}</p></button>)}</div>{!found.length&&<p role="status" className="p-6 text-sm text-slate-500">Không có thành phần phù hợp.</p>}<Pagination {...componentPage} label="Thành phần kiến trúc" sizes={[8,16,32]} /></div>}
    </section>
    <section aria-label="Chi tiết thành phần" aria-live="polite" className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-3"><div><p className="text-[10px] font-semibold tracking-widest text-blue-600">THÀNH PHẦN ĐANG CHỌN</p><h2 className="mt-2 text-lg font-semibold text-slate-900">{active.title}</h2><p className="mt-1 text-xs text-slate-500">{active.tech}</p></div><div className="lg:col-span-2"><p className="text-sm leading-7 text-slate-600">{active.detail}</p><details key={active.id} className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Hợp đồng & lưu ý vận hành</summary><p className="mt-3 text-xs leading-6 text-slate-500">{active.contract}</p></details><div className="mt-4 flex flex-wrap gap-2">{edges.filter(e=>e.source===active.id||e.target===active.id).map(e=>{const id=e.source===active.id?e.target:e.source;return <button type="button" key={e.source+e.target} onClick={()=>{setFlow('all');select(id);}} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] text-blue-700">{e.source===active.id?'→':'←'} {nodes.find(n=>n.id===id)!.title}</button>;})}</div></div></section>
  </div>;
}
