import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geographicCharts, mapRows, rankedCohort, inCohort, cohortSummary } from '../../utils/reportGeography.mjs';
import { foldSearch } from '../../utils/dashboardDiscovery.mjs';
import { formatChartValue } from '../../utils/aiChartConfig.mjs';
import { MAP_PALETTES, MISSING_COLOR, colorScale, loadProvinceBoundaries, provinceFeatures, regionalLegend } from '../../utils/provinceMap.mjs';
import { Pagination, usePagination } from '../Pagination';
import { ProvinceMap, type ProvinceMapHandle } from './ProvinceMap';
import { useGeographyExploration } from '../../hooks/useGeographyExploration';
import { ProvinceBusinessDetails,StoreMetricStrip } from './ProvinceBusinessDetails';
import { locateGeography } from '../../utils/reportGeography.mjs';
import { SearchableSelect } from '../SearchableSelect';
import { storeCoordinates, STORE_COLORS } from '../../utils/storeMap.mjs';

/** Province choropleths use exact report rows. Regional values stay regional. */
export const GeographicReportPanel: React.FC<{ report:any; onScope?:(city:string)=>void; scopeValues?:string[]; networkSnapshot?:any; preferReportMetric?:boolean; explorationEnabled?:boolean }> = ({report,onScope,scopeValues,networkSnapshot,preferReportMetric=false,explorationEnabled=true}) => {
  const remoteNetwork=useGeographyExploration(report,null,null,explorationEnabled&&!networkSnapshot);
  const network=networkSnapshot?{data:networkSnapshot,loading:false,error:'',reload:()=>{}}:remoteNetwork;
  // I02: a Top/Bottom N province report keeps its map summary and pins on that cohort;
  // the whole network is explicit, labelled context.
  const cohort=useMemo(()=>rankedCohort(report),[report]);
  const [wholeNetwork,setWholeNetwork]=useState(false);
  const cohortView=Boolean(cohort&&!wholeNetwork);
  const charts=useMemo(()=>{
    const additional=network.data?[
      ['revenue','Doanh thu riêng từng tỉnh','store_revenue','VND'],['store_count','Số điểm bán trong dữ liệu','network_store_count','điểm bán'],
      ['orders','Số đơn riêng từng tỉnh','store_order_count','đơn'],['aov','Giá trị đơn trung bình từng tỉnh','store_aov','VND'],
    ].filter(([field])=>network.data.provinces.some((p:any)=>Number.isFinite(p[field]))).map(([field,title,metric,unit])=>({id:'network_'+field,title,metric,unit,x_field:'city',selection:'complete',
      data:network.data.provinces.filter((p:any)=>!cohortView||inCohort(cohort,p.label)).map((p:any)=>({label:p.label,value:p[field],store_count:p.store_count}))})):[];
    return networkSnapshot ? additional : [...additional,...geographicCharts(report)];
  },[report,network.data,cohortView,cohort]);
  const [chartId,setChartId]=useState(''),[selected,setSelected]=useState<number|null>(null),[selectedProvince,setSelectedProvince]=useState<string|null>(null);
  const [search,setSearch]=useState(''),[notice,setNotice]=useState(''),[boundaries,setBoundaries]=useState<any>(null),[error,setError]=useState('');
  const [palette,setPalette]=useState('blue'),[method,setMethod]=useState('quantile'),[basemap,setBasemap]=useState('street');
  const [opacity,setOpacity]=useState(.76),[labels,setLabels]=useState(true);
  const [selectedStore,setSelectedStore]=useState<string|null>(null),[provinceOrder,setProvinceOrder]=useState('metric');
  const [viewMode,setViewMode]=useState<'provinces'|'stores'>('provinces');
  const [showStores,setShowStores]=useState(true),[storeFromMap,setStoreFromMap]=useState(false);
  const [groupStores,setGroupStores]=useState(false);
  const mapStores=useMemo(()=>(network.data?.stores||[]).filter((s:any)=>!cohortView||inCohort(cohort,s.city)),[network.data,cohortView,cohort]);
  const displayedStores=useMemo(()=>selectedProvince?mapStores.filter((store:any)=>(locateGeography(store.city,'city')?.label||store.city)===selectedProvince):mapStores,[mapStores,selectedProvince]);
  const displayedLocatedStores=useMemo(()=>displayedStores.filter((store:any)=>storeCoordinates(store)),[displayedStores]);
  const locatedStores=useMemo(()=>mapStores.filter((store:any)=>storeCoordinates(store)),[mapStores]);
  const map=useRef<ProvinceMapHandle>(null);
  const chart=charts.find((item:any)=>item.id===chartId)
    || (preferReportMetric ? geographicCharts(report)[0] : null)
    || charts.find((item:any)=>item.id==='network_revenue')
    || charts.find((item:any)=>item.x_field==='city'&&['store_revenue','revenue','settled_payment_amount'].includes(item.metric))
    || charts.find((item:any)=>item.x_field==='city') || charts[0];
  const rows=useMemo(()=>chart?mapRows(chart):[],[chart]);
  const visible=useMemo(()=>rows.filter((row:any)=>foldSearch(row.label).includes(foldSearch(search))).sort((a:any,b:any)=>provinceOrder==='name'?a.label.localeCompare(b.label,'vi'):(Number.isFinite(b.value)?b.value:-Infinity)-(Number.isFinite(a.value)?a.value:-Infinity)),[rows,search,provinceOrder]);
  const page=usePagination<any>(visible,8,`${chart?.id}:${search}`);
  const regional=chart?.x_field==='reporting_region';
  const features=useMemo(()=>{
    if(!boundaries||!chart)return null;
    const data=provinceFeatures(boundaries,chart,rows,palette,method);
    if(network.data){
      const provinces=new Map(network.data.provinces.map((p:any)=>[locateGeography(p.label,'city')?.label,p]));
      data.features=data.features.map((f:any)=>{const p:any=provinces.get(f.properties.name);return {...f,properties:{...f.properties,
        storeCount:p?.store_count||0,provinceRevenue:p?.revenue||0,provinceOrders:p?.orders||0,networkKnown:true,
        hasData:Boolean(p&&f.properties.hasData),color:p?f.properties.color:'#e2e8f0'}};});
    }
    return data;
  },[boundaries,chart,rows,palette,method,network.data]);
  const rawCity=network.data?.provinces.find((p:any)=>locateGeography(p.label,'city')?.label===selectedProvince)?.city||selectedProvince;
  const remoteProvince=useGeographyExploration(report,rawCity,null,Boolean(explorationEnabled&&!networkSnapshot&&selectedProvince&&network.data));
  const remoteStore=useGeographyExploration(report,rawCity,selectedStore,Boolean(explorationEnabled&&!networkSnapshot&&selectedProvince&&selectedStore&&network.data));
  const localStores=(networkSnapshot?.stores||[]).filter((s:any)=>locateGeography(s.city,'city')?.label===selectedProvince);
  const localProvince=networkSnapshot&&selectedProvince?{...networkSnapshot,stores:localStores,summary:networkSnapshot.provinces.find((p:any)=>locateGeography(p.city,'city')?.label===selectedProvince)||{revenue:0,orders:0,aov:null,store_count:0}}:null;
  const localStore=localStores.find((s:any)=>s.store_id===selectedStore);
  const province=networkSnapshot?{data:localProvince,loading:false,error:'',reload:()=>{}}:remoteProvince;
  const store=networkSnapshot?{data:localStore?{...networkSnapshot,summary:{...localStore,store_count:1},detail_available:false}:null,loading:false,error:'',reload:()=>{}}:remoteStore;
  const scale=useMemo(()=>colorScale(rows,palette,method),[rows,palette,method]);
  useEffect(()=>{setSelected(null);setSelectedProvince(null);setSelectedStore(null);setSearch('');setNotice('');},[report.session_id,report.revision,chart?.id]);
  useEffect(()=>{
    if(!chart)return;let cancelled=false;
    loadProvinceBoundaries().then(data=>{if(!cancelled){setBoundaries(data);setError('');}}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  },[Boolean(chart)]);
  if(!chart)return network.loading?<p role="status" className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-xs text-blue-700">Đang tải bản đồ bổ sung cửa hàng trong phạm vi báo cáo…</p>:network.error?<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Chưa mở được bản đồ bổ sung: {network.error} <button type="button" onClick={network.reload} className="underline">Thử lại bản đồ</button></div>:null;
  const active=rows.find((row:any)=>row.index===selected);
  const selectedMapStore=mapStores.find((store:any)=>store.store_id===selectedStore);
  const unit=chart.unit?` ${chart.unit}`:'';
  const matched=new Set(features?.features.filter((f:any)=>f.properties.hasData).map((f:any)=>f.properties.rowIndex));
  const unmatched=features?rows.filter((row:any)=>!matched.has(row.index)):[];
  const colored=features?.features.filter((f:any)=>f.properties.hasData).length||0;
  const choose=(row:number|null,province:string|null)=>{setSelected(row);setSelectedProvince(province);setSelectedStore(null);};
  const chooseStore=(id:string,openDetails=false)=>{
    const target=mapStores.find((store:any)=>store.store_id===id);if(!target)return;
    const name=locateGeography(target.city,'city')?.label||target.city;
    if(!name){setNotice('Cửa hàng có tọa độ nhưng chưa được gán tỉnh/thành để mở phân tích.');return;}
    choose(rows.find((row:any)=>row.location?.label===name)?.index??null,name);
    setStoreFromMap(!openDetails);setSelectedStore(id);setShowStores(true);setViewMode('stores');
    if(!storeCoordinates(target))setNotice('Cửa hàng chưa có tọa độ hợp lệ. Số liệu vẫn hiển thị trong chi tiết.');
  };
  const jumpDetails=()=>document.getElementById('province-business-details')?.scrollIntoView({behavior:'smooth',block:'start'});
  const reset=()=>{choose(null,null);map.current?.reset();};
  return <section data-geographic-report className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-slate-100/40">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-blue-600">Geographic intelligence</p><h2 className="mt-1 text-base font-semibold text-slate-900">Bản đồ tỉnh/thành & khu vực</h2><p className="mt-1 text-[11px] text-slate-500">Từ tỉnh/thành đến từng cửa hàng · Zoom để xem các điểm bán và doanh số</p></div>
      <label className="min-w-0 text-[11px] text-slate-500">Chỉ số trên bản đồ<select aria-label="Chỉ số trên bản đồ" value={chart.id} onChange={e=>setChartId(e.target.value)} className="mt-1 block w-full max-w-96 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">{charts.map((item:any)=><option key={item.id} value={item.id}>{item.title}{item.unit?` · ${item.unit}`:''}</option>)}</select></label>
    </header>
    {!networkSnapshot&&!geographicCharts(report).length&&<p data-supplementary-map className="border-b border-blue-50 bg-blue-50/40 px-5 py-3 text-[11px] leading-5 text-blue-800">Bản đồ bổ sung mạng lưới và doanh số cửa hàng trong cùng phạm vi, thời gian của báo cáo. Tập Top N ở biểu đồ xếp hạng vẫn giữ riêng; chỉ số trên bản đồ được ghi rõ bên dưới.</p>}
    {network.loading&&<p role="status" className="border-b border-blue-50 bg-blue-50/40 px-5 py-3 text-xs text-blue-700">Đang đối chiếu mạng lưới chi nhánh và doanh số từng tỉnh…</p>}
    {network.error&&<div className="geo-resource-error text-xs">Khám phá cửa hàng: {network.error} <button type="button" onClick={network.reload} className="underline">Kết nối lại</button><p className="mt-1">Lớp chỉ số đã có trong báo cáo vẫn được giữ bên dưới.</p></div>}
    {network.data&&<div className="geo-network-overview"><div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span className="font-semibold text-blue-800">{cohortView?`${cohortSummary(network.data.provinces,cohort).province_count} tỉnh/thành trong ${cohort!.label}`:`${network.data.provinces.filter((p:any)=>p.store_count>0).length} tỉnh/thành có điểm bán trong phạm vi`}</span><span>{network.data.period?.label||(network.data.period?.start?`${network.data.period.start} → ${network.data.period.end}`:'Toàn bộ thời gian')} · Mạng lưới hiện tại</span></div><StoreMetricStrip summary={cohortView?cohortSummary(network.data.provinces,cohort):network.data.summary}/>{cohort&&<p data-cohort-scope className="text-[10px] text-slate-500">{cohortView?`Số liệu và điểm bán chỉ thuộc ${cohort.label} tỉnh/thành của kết quả. `:`Đang xem toàn mạng lưới làm bối cảnh — không riêng ${cohort.label}. `}<button type="button" className="underline text-blue-700" onClick={()=>setWholeNetwork(v=>!v)}>{cohortView?'Xem toàn mạng lưới (bối cảnh)':`Chỉ xem ${cohort.label}`}</button></p>}<p className="text-[10px] text-slate-400">Chọn tỉnh để mở cửa hàng, thứ hạng và phân tích sâu. {preferReportMetric?'Chỉ số mặc định lấy từ kết quả phân tích đang xem.':'Màu mặc định là doanh thu của riêng tỉnh.'}</p>{networkSnapshot&&<p className="mt-2 text-[10px] text-slate-500">{networkSnapshot.definitions?.aggregation}</p>}</div>}
    <div className="geo-map-commandbar">
      <nav className="geo-map-view-switch" aria-label="Chế độ bản đồ"><button type="button" aria-pressed={viewMode==='provinces'} onClick={()=>{setViewMode('provinces');setSelectedStore(null);}}>Doanh số tỉnh</button><button type="button" aria-pressed={viewMode==='stores'} onClick={()=>setViewMode('stores')}>Mạng lưới cửa hàng</button></nav>
      <label>Nền bản đồ<select aria-label="Nền bản đồ" value={basemap} onChange={e=>setBasemap(e.target.value)}><option value="street">Streets · hiện đại</option><option value="detailed">Đường phố · chi tiết</option><option value="light">Nền sáng</option><option value="boundaries">Chỉ địa giới</option></select></label>
      <div className="ml-auto flex flex-wrap gap-1.5"><button type="button" className="map-control" aria-label="Phóng to bản đồ" onClick={()=>map.current?.zoomIn()}>+</button><button type="button" className="map-control" aria-label="Thu nhỏ bản đồ" onClick={()=>map.current?.zoomOut()}>−</button><button type="button" onClick={reset} className="map-control">Toàn cảnh</button><button type="button" onClick={()=>map.current?.fullscreen()} className="map-control">Toàn màn hình</button><button type="button" onClick={()=>map.current?.exportSvg()} className="map-control">Xuất SVG</button></div>
    <details className="geo-map-appearance" onKeyDown={e=>{if(e.key==='Escape')e.currentTarget.open=false;}}><summary>Tùy chỉnh hiển thị <span>Bảng màu, độ đậm và nhãn địa bàn</span></summary><div className="province-map-toolbar">
      <label>Bảng màu<select aria-label="Bảng màu bản đồ" value={palette} disabled={regional} onChange={e=>setPalette(e.target.value)}>{Object.entries(MAP_PALETTES).map(([id,p]:any)=><option key={id} value={id}>{p.label}</option>)}</select></label>
      <label>Phân lớp<select aria-label="Cách phân lớp màu" value={method} disabled={regional} onChange={e=>setMethod(e.target.value)}><option value="quantile">Theo phân vị</option><option value="equal">Khoảng đều</option></select></label>
      <label className="province-opacity">Độ đậm<input type="range" aria-label="Độ đậm lớp màu" min=".2" max=".9" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
      <label className="province-label-toggle"><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>Tên tỉnh/thành</label>
    </div></details></div>
    {mapStores.length>0&&<div className="store-map-toolbar"><div className="min-w-0 flex-1"><SearchableSelect label="Tìm cửa hàng trên bản đồ" value={selectedStore||''} onChange={id=>{if(id)chooseStore(id);else setSelectedStore(null);}} placeholder="Gõ tên hoặc mã cửa hàng để định vị…" options={[{value:'',label:'Tìm cửa hàng trên bản đồ'},...mapStores.map((store:any)=>({value:store.store_id,label:store.store,description:`${store.city||'Chưa có tỉnh'} · ${storeCoordinates(store)?'Có tọa độ':'Chưa có tọa độ'}`}))]}/></div>{viewMode==='stores'&&<label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showStores} onChange={e=>setShowStores(e.target.checked)}/>Điểm cửa hàng</label>}<p className="geo-map-location-count">{locatedStores.length}/{mapStores.length} cửa hàng có tọa độ hợp lệ</p></div>}
    <div className="geographic-report-grid">
      <div className="min-w-0 border-b border-slate-100 bg-slate-50/50 lg:border-b-0 lg:border-r">
        {!features&&!error&&<div role="status" className="grid h-[540px] place-items-center text-sm text-slate-500">Đang tải địa giới tỉnh/thành…</div>}
        {error&&<div role="alert" className="p-6 text-sm text-amber-800">{error}<button type="button" onClick={()=>{setError('');loadProvinceBoundaries().then(setBoundaries).catch(e=>setError(e.message));}} className="ml-3 underline">Tải lại địa giới</button></div>}
        {features&&<ProvinceMap ref={map} data={features} selectedRow={selected} selectedProvince={selectedProvince} onSelect={choose} opacity={opacity} labels={labels} basemap={basemap} search={search} unit={unit} regional={regional} onNotice={setNotice} stores={displayedStores} selectedStore={selectedStore} onStore={chooseStore} showStores={showStores} viewMode={viewMode} clusterStores={selectedProvince?groupStores:true}/>}
        <div data-map-legend className="province-map-legend" hidden={viewMode==='stores'}>
          {regional?<div className="flex flex-wrap gap-2">{regionalLegend(rows).map((entry:any)=><button key={entry.label} type="button" onClick={()=>choose(rows.find((r:any)=>r.label===entry.label)?.index??null,null)} className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2 py-1 text-[10px] text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{background:entry.color}}/>{entry.label}</button>)}</div>:<>
            <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500"><span>{scale.signed?'Giá trị âm → dương':scale.method==='quantile'?'Phân vị · thấp → cao':'Khoảng đều · thấp → cao'}</span><span>{chart.unit||'Giá trị'}</span></div>
            <div className="mt-1.5 flex overflow-hidden rounded-md">{scale.colors.map((color:string,i:number)=><span key={color} className="h-2.5 flex-1" style={{background:String(color)}} title={`${i===0?scale.low:scale.breaks[i-1]??scale.low} → ${scale.breaks[i]??scale.high}`}/>)}</div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-600"><span>{formatChartValue(scale.low,unit)}</span><span>{formatChartValue(scale.high,unit)}</span></div>
          </>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{background:MISSING_COLOR}}/>{network.data?'Chưa có điểm bán / chỉ số':'Chưa có giá trị'} <i className="ml-2 h-2.5 w-2.5 rounded-sm border border-blue-200 bg-blue-100"/>{network.data?'Có điểm bán · chỉ số 0':'0'}</span><span>{colored}/63 tỉnh/thành có chỉ số</span></div>
        </div>
      </div>
      <aside className="geo-map-sidebar min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">{selectedProvince&&network.data?selectedProvince:regional?'Theo miền báo cáo':'Theo tỉnh/thành'}</p>{selectedProvince&&network.data?<button type="button" className="text-[10px] font-medium text-blue-700" onClick={()=>choose(null,null)}>← Tất cả tỉnh</button>:<span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{rows.length} {regional?'nhóm':'địa bàn'} trong báo cáo</span>}</div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">{chart.title}</p>
        {network.data&&<SearchableSelect label="Chọn tỉnh khám phá" value={selectedProvince||''} onChange={name=>choose(rows.find((r:any)=>r.location?.label===name)?.index??null,name||null)} className="my-3" placeholder="Gõ tìm tỉnh/thành có điểm bán…" options={[{value:'',label:'Tất cả tỉnh/thành'},...network.data.provinces.filter((p:any)=>locateGeography(p.label,'city')).map((p:any)=>({value:locateGeography(p.label,'city').label,label:p.label,description:`${p.store_count} điểm bán`}))]}/>}
        {(!selectedProvince||!network.data)&&<>
        <input type="search" aria-label="Tìm địa bàn trên bản đồ" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm tỉnh/thành, miền…" className="my-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-blue-600"/>
        <label className="mb-2 flex items-center justify-between text-[10px] text-slate-400">Xếp hạng địa bàn<select aria-label="Sắp xếp tỉnh trên bản đồ" value={provinceOrder} onChange={e=>setProvinceOrder(e.target.value)} className="rounded-lg border border-slate-100 bg-white px-2 py-1 text-[10px] text-slate-600"><option value="metric">Chỉ số cao → thấp</option><option value="name">Tên tỉnh A–Z</option></select></label>
        <div className="space-y-1">{page.items.map((row:any)=><button key={row.index} type="button" aria-pressed={selected===row.index} onClick={()=>choose(row.index,regional?null:row.location?.label||null)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs ${selected===row.index?'bg-blue-50 text-blue-800':'text-slate-600 hover:bg-slate-50'}`}><span className="min-w-0"><span className="block truncate">{row.label||'Chưa xác định'}</span>{!row.location&&!regional&&<span className="text-[10px] text-slate-400">Chưa ghép địa giới</span>}</span><span className="shrink-0 font-medium tabular-nums">{Number.isFinite(row.value)?formatChartValue(row.value,unit):'Chưa có giá trị'}</span></button>)}</div>
        {!visible.length&&<p className="py-5 text-xs text-slate-500">Không có địa bàn khớp tìm kiếm.</p>}
        {visible.length>8&&<Pagination {...page} label="Địa bàn bản đồ" noun="địa bàn"/>}
        </>}
        {!selectedMapStore&&(active||selectedProvince)&&<div role="status" className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600"><p className="font-semibold text-slate-900">{selectedProvince||active?.label}</p><p className="mt-1 text-base font-semibold text-blue-800">{active&&Number.isFinite(active.value)?formatChartValue(active.value,unit):'Chưa có giá trị'}</p>{regional&&<p className="mt-1 text-[11px] leading-5">Tổng/điểm của {active?.label||'miền báo cáo'}, không phải giá trị riêng của tỉnh đang chọn.</p>}{!regional&&active&&onScope&&<button type="button" disabled={Boolean(scopeValues?.length&&!scopeValues.includes(active.label))} title="Phạm vi áp dụng theo bộ chọn của dashboard" onClick={()=>onScope(active.label)} className="mt-2 text-xs font-medium text-blue-700 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-slate-400">Chọn làm phạm vi dashboard</button>}</div>}
        {selectedMapStore&&<section data-selected-map-store className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-medium uppercase tracking-wide text-blue-600">Cửa hàng đang chọn</p><button type="button" aria-label="Bỏ chọn cửa hàng" className="geo-map-clear-store" onClick={()=>setSelectedStore(null)}>×</button></div><h3 className="mt-2 text-sm font-semibold leading-5 text-slate-900">{selectedMapStore.store}</h3><p className="mt-1 break-all text-[10px] text-slate-500">{selectedMapStore.city} · {selectedMapStore.store_id}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-slate-500">Doanh thu trong kỳ</dt><dd className="mt-1 font-semibold text-blue-800">{formatChartValue(selectedMapStore.revenue,' VND')}</dd></div><div><dt className="text-[10px] text-slate-500">Số đơn</dt><dd className="mt-1 font-semibold text-slate-900">{formatChartValue(selectedMapStore.orders,' đơn')}</dd></div><div className="col-span-2"><dt className="text-[10px] text-slate-500">Giá trị đơn trung bình</dt><dd className="mt-1 font-semibold text-slate-900">{formatChartValue(selectedMapStore.aov,' VND')}</dd></div></dl><p className="mt-3 text-[10px] text-slate-500">{storeCoordinates(selectedMapStore)?'Định vị theo tọa độ thật được ghi trong CSDL.':'Chưa có tọa độ hợp lệ; số liệu cửa hàng vẫn được giữ đầy đủ.'}</p><button type="button" className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white" onClick={()=>chooseStore(selectedMapStore.store_id,true)}>Phân tích cửa hàng đang chọn ↓</button></section>}
        {selectedProvince&&network.data&&!selectedMapStore&&<div className="mt-3 rounded-xl border border-slate-100 p-3" data-province-quick-detail><div className="mb-2 flex items-center justify-between"><strong className="text-xs">Cửa hàng tại {selectedProvince}</strong><button type="button" className="text-[10px] text-blue-700" onClick={jumpDetails}>Chi tiết ↓</button></div>
          {province.loading&&<p role="status" className="text-[11px] text-slate-500">Đang tải danh sách cửa hàng…</p>}{province.error&&<p className="text-[11px] text-amber-800">{province.error}</p>}
          {province.data&&<><p className="mb-2 text-[11px] text-slate-500">{province.data.summary.store_count} điểm bán · {formatChartValue(province.data.summary.revenue,'VND')}</p>{province.data.stores.slice(0,3).map((s:any,i:number)=><button key={s.store_id} type="button" className="flex w-full items-center justify-between gap-2 border-t border-slate-50 py-2 text-left text-[10px] text-slate-600 hover:text-blue-700" onClick={()=>chooseStore(s.store_id,true)}><span className="min-w-0 truncate">{i+1}. {s.store}</span><strong className="shrink-0 font-medium">{formatChartValue(s.revenue,'VND')}</strong></button>)}{!province.data.stores.length&&<p className="text-[11px] text-slate-500">Chưa có điểm bán trong phạm vi đã duyệt.</p>}<button type="button" className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-medium text-white" onClick={jumpDetails}>Mở xếp hạng & so sánh cửa hàng ↓</button></>}
        </div>}
        {unmatched.length>0&&<p className="mt-3 text-[11px] leading-5 text-amber-800">{unmatched.length} dòng chưa thể tô lên địa giới; số liệu vẫn được giữ trong danh sách.</p>}
        {selectedProvince&&<p data-province-coordinate-coverage className="mt-4 text-[11px] leading-5 text-slate-500">{displayedLocatedStores.length}/{displayedStores.length} cửa hàng trong tỉnh có tọa độ hợp lệ.{displayedLocatedStores.length<displayedStores.length&&` ${displayedStores.length-displayedLocatedStores.length} cửa hàng chưa thể đặt ghim; vẫn được tính trong doanh số và danh sách.`}</p>}
        {selectedProvince&&<label className="mt-3 flex items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={groupStores} onChange={e=>setGroupStores(e.target.checked)}/>Gom cụm các cửa hàng gần nhau</label>}
        <p className="geo-map-view-hint">{selectedProvince&&!groupStores?'Đang hiện ghim từng cửa hàng theo tọa độ thật. Bấm icon ly cà phê để xem doanh số; bật gom cụm nếu các ghim gần nhau.':viewMode==='provinces'?'Độ đậm thể hiện chỉ số của từng tỉnh. Chọn tỉnh để hiện các điểm bán và xếp hạng cửa hàng.':'Cụm số thể hiện các điểm bán gần nhau. Bấm cụm để phóng to.'}</p>
        {regional&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">Màu thể hiện nhóm miền theo phân vùng báo cáo trong kho. Giá trị miền không được chia hoặc gán thành số liệu riêng cho từng tỉnh.</p>}
      </aside>
    </div>
    {mapStores.length>0&&viewMode==='stores'&&<div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">{Object.entries(STORE_COLORS).map(([type,color])=><span key={type} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{background:String(color)}}/>{({CHI_NHANH_CHINH:'Chi nhánh chính',KIOSK_NHUONG_QUYEN:'Kiosk nhượng quyền',KIOSK_VE_TINH:'Kiosk vệ tinh'})[type]}</span>)}{locatedStores.length<mapStores.length&&<span>{mapStores.length-locatedStores.length} cửa hàng chưa có tọa độ hợp lệ vẫn được giữ trong báo cáo và danh sách.</span>}</div>}
    {selectedProvince&&network.data&&<ProvinceBusinessDetails city={selectedProvince} resource={province} storeResource={store} selectedStore={selectedStore} onStore={id=>{setStoreFromMap(false);setSelectedStore(id);}} onClose={()=>choose(null,null)} scrollToStore={!storeFromMap}/>}
    <footer className="border-t border-slate-100 px-4 py-3 text-[10px] leading-5 text-slate-500">
      <p>Địa giới tham chiếu năm 2020 · 63 tỉnh/thành theo các tên lịch sử trong dữ liệu. Nơi chưa có giá trị được để xám; khác với giá trị 0.{chart.selection&&chart.selection!=='complete'?' Chỉ phản ánh tập dòng đang hiển thị của biểu đồ.':''}</p>
      <p>Địa giới: Government of Viet Nam / HDX qua <a className="underline" href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries (CC BY 3.0 IGO)</a> · Nền đường phố: <a className="underline" href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> / © OpenStreetMap contributors · <a className="underline" href="/map-styles/README.md" target="_blank" rel="noreferrer">Thiết kế Streets / OSM Bright</a>.</p>
      {notice&&<p role="status" className="text-blue-700">{notice}</p>}
    </footer>
  </section>;
};
