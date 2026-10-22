import React,{useEffect,useMemo,useState} from 'react';
import { Pagination,usePagination } from '../Pagination';
import { AnalystChart,AnalystHorizontalBars } from '../Charts';
import { foldSearch } from '../../utils/dashboardDiscovery.mjs';
import { formatChartValue } from '../../utils/aiChartConfig.mjs';

const money=(n:any)=>n==null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:0})+' ₫';
const storeStatus=(status:string)=>({'ACTIVE':'Đang hoạt động','HOAT_DONG':'Đang hoạt động','MAINTENANCE':'Bảo trì','INACTIVE':'Tạm ngừng','CLOSED':'Đã đóng'}[status]||status||'Chưa có trạng thái');
export const storeType=(type:string)=>({'CHI_NHANH_CHINH':'Chi nhánh chính','KIOSK_NHUONG_QUYEN':'Kiosk nhượng quyền','KIOSK_VE_TINH':'Kiosk vệ tinh'}[type]||type||'Chưa phân loại');
export const StoreMetricStrip:React.FC<{summary:any}>=({summary})=><div className="geo-business-kpis">{[
  ['Doanh thu trong kỳ',money(summary.revenue)],['Tổng đơn trong kỳ',formatChartValue(summary.orders,' đơn')],
  ['Giá trị đơn trung bình',money(summary.aov)],['Điểm bán hiện có',formatChartValue(summary.store_count,' điểm')],
].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;

export const ProvinceBusinessDetails:React.FC<{city:string;resource:any;storeResource:any;selectedStore:string|null;onStore:(id:string|null)=>void;onClose:()=>void;scrollToStore?:boolean}>=({city,resource,storeResource,selectedStore,onStore,onClose,scrollToStore=true})=>{
  const [search,setSearch]=useState(''),[type,setType]=useState(''),[sort,setSort]=useState('revenue'),[direction,setDirection]=useState('desc'),[comparison,setComparison]=useState<string[]>([]);
  useEffect(()=>{setSearch('');setType('');setSort('revenue');setComparison([]);},[city]);
  useEffect(()=>{if(!selectedStore||!scrollToStore)return;const frame=requestAnimationFrame(()=>document.getElementById('geographic-store-details')?.scrollIntoView({behavior:'smooth',block:'start'}));return()=>cancelAnimationFrame(frame);},[selectedStore,resource.data,scrollToStore]);
  const data=resource.data,stores=data?.stores||[];
  const filtered=useMemo(()=>stores.filter((s:any)=>(!type||s.store_type===type)&&foldSearch(s.store+' '+s.store_id).includes(foldSearch(search)))
    .sort((a:any,b:any)=>(direction==='desc'?-1:1)*((Number(a[sort])||0)-(Number(b[sort])||0))||String(a.store_id).localeCompare(String(b.store_id))),[stores,type,search,sort,direction]);
  const page=usePagination<any>(filtered,8,`${city}:${search}:${type}:${sort}:${direction}`);
  const types=useMemo(()=>Object.entries(stores.reduce((groups:any,s:any)=>{const key=storeType(s.store_type);groups[key]=(groups[key]||0)+s.revenue;return groups;},{})).map(([label,value])=>({label,value})),[stores]);
  const selected=stores.find((s:any)=>s.store_id===selectedStore);
  const compare=stores.filter((s:any)=>comparison.includes(s.store_id));
  const exportCsv=()=>{
    const cell=(value:any)=>'"'+(typeof value==='string'&&/^[=+\-@\t\r]/.test(value)?"'"+value:String(value??'')).replace(/"/g,'""')+'"';
    const rows=[['Mã','Cửa hàng','Tỉnh/thành','Loại điểm bán','Trạng thái','Doanh thu','Tổng đơn','AOV','Kỳ báo cáo','Kỳ bắt đầu','Kỳ kết thúc'],...filtered.map((s:any)=>[s.store_id,s.store,s.city,storeType(s.store_type),storeStatus(s.status),s.revenue,s.orders,s.aov,data.period?.label||(data.period?.start?`${data.period.start} → ${data.period.end||''}`:'Toàn bộ'),data.period?.start||'',data.period?.end||''])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`cua-hang-${city}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section data-province-business id="province-business-details" className="geo-business-panel">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">Khám phá địa bàn</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{city} <span className="text-slate-300">/</span> Cửa hàng & hiệu quả bán hàng</h3><p className="mt-1 text-xs text-slate-500">Doanh thu theo kỳ báo cáo · Danh mục điểm bán hiện tại · Sắp xếp, so sánh và mở từng cửa hàng</p></div><button type="button" onClick={onClose} className="map-control">Đóng chi tiết tỉnh</button></header>
    {resource.loading&&<p role="status" className="geo-resource-loading">Đang tải cửa hàng và số liệu riêng của {city}…</p>}
    {resource.error&&<div role="alert" className="geo-resource-error">{resource.error} <button type="button" onClick={resource.reload} className="underline">Tải lại cửa hàng</button></div>}
    {data&&<><StoreMetricStrip summary={data.summary}/>
      {!stores.length?<div className="geo-resource-loading">Không có điểm bán của {city} trong phạm vi được cấp. Tỉnh này không được gán doanh thu của miền.</div>:<>
      <div className="geo-branch-workspace">
        <div className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Xếp hạng cửa hàng <span className="font-normal text-slate-400">· {stores.length} điểm bán</span></h4><button type="button" onClick={exportCsv} className="map-control">Xuất danh sách CSV</button></div>
          <div className="geo-store-filters"><input type="search" aria-label="Tìm cửa hàng trong tỉnh" placeholder="Tìm tên hoặc mã cửa hàng…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select aria-label="Loại điểm bán trong tỉnh" value={type} onChange={e=>setType(e.target.value)}><option value="">Mọi loại điểm bán</option>{[...new Set(stores.map((s:any)=>s.store_type))].map((t:any)=><option key={t} value={t}>{storeType(t)}</option>)}</select>
            <select aria-label="Xếp hạng cửa hàng theo" value={sort} onChange={e=>setSort(e.target.value)}><option value="revenue">Doanh thu</option><option value="orders">Số đơn</option><option value="aov">Giá trị đơn TB</option></select>
            <button type="button" className="map-control" aria-label="Đảo chiều xếp hạng" onClick={()=>setDirection(d=>d==='desc'?'asc':'desc')}>{direction==='desc'?'Cao → thấp':'Thấp → cao'}</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="geo-store-table"><thead><tr><th>So sánh</th><th>Cửa hàng</th><th>Doanh thu / tỷ trọng tỉnh</th><th>Số đơn</th><th>AOV</th><th/></tr></thead><tbody>{page.items.map((s:any,i:number)=><tr key={s.store_id} data-store-row={s.store_id} className={selectedStore===s.store_id?'geo-store-selected':''}>
            <td><input type="checkbox" aria-label={`So sánh ${s.store}`} checked={comparison.includes(s.store_id)} disabled={comparison.length>=3&&!comparison.includes(s.store_id)} onChange={()=>setComparison(ids=>ids.includes(s.store_id)?ids.filter(id=>id!==s.store_id):[...ids,s.store_id])}/></td>
            <td><button type="button" onClick={()=>onStore(s.store_id)} className="text-left font-semibold text-blue-800 hover:underline"><span className="mr-2 text-[10px] font-normal text-slate-400">{page.page*page.pageSize-page.pageSize+i+1}.</span>{s.store}</button><p className="mt-1 text-[10px] text-slate-500">{storeType(s.store_type)} · {storeStatus(s.status)} · {s.store_id}</p>{!s.has_sales&&<span className="text-[10px] text-amber-700">Chưa có đơn trong kỳ</span>}</td>
            <td className="tabular-nums"><strong>{money(s.revenue)}</strong><div className="mt-1 flex items-center gap-2"><span className="h-1 w-20 overflow-hidden rounded bg-blue-50"><i className="block h-full rounded bg-blue-500" style={{width:`${data.summary.revenue?s.revenue/data.summary.revenue*100:0}%`}}/></span><small className="text-slate-400">{data.summary.revenue?(s.revenue/data.summary.revenue*100).toFixed(1):'0'}%</small></div></td>
            <td className="tabular-nums">{s.orders.toLocaleString('vi-VN')}</td><td className="whitespace-nowrap tabular-nums">{money(s.aov)}</td><td><button type="button" aria-label={`Chi tiết cửa hàng ${s.store}`} onClick={()=>onStore(s.store_id)} className="map-control">Khám phá ↗</button></td>
          </tr>)}</tbody></table></div>
          {!filtered.length&&<p className="p-4 text-xs text-slate-500">Không có cửa hàng khớp bộ lọc.</p>}
          {filtered.length>8&&<Pagination {...page} label="Cửa hàng trong tỉnh" noun="cửa hàng"/>}
        </div>
        <aside className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 p-4"><h4 className="text-sm font-semibold">Doanh thu theo loại điểm bán</h4><p className="mb-4 mt-1 text-[11px] text-slate-500">Cùng kỳ, toàn bộ cửa hàng của {city}</p><AnalystHorizontalBars data={types} unit="VND" color="#2563eb"/>
          <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-6 text-slate-500"><p><strong className="text-slate-800">{stores.filter((s:any)=>s.has_sales).length}</strong> điểm bán có đơn trong kỳ</p><p><strong className="text-slate-800">{stores.filter((s:any)=>!s.has_sales).length}</strong> điểm bán chưa có đơn trong kỳ</p><p>Chọn tối đa 3 cửa hàng để đặt cạnh nhau. Dữ liệu bảng có thể xuất toàn bộ kết quả đang lọc.</p></div>
        </aside>
      </div>
      {compare.length>0&&<section className="mt-5 rounded-xl border border-blue-100 bg-blue-50/30 p-4" data-store-comparison><div className="mb-3 flex justify-between gap-2"><h4 className="text-sm font-semibold">So sánh cửa hàng · {compare.length}/3</h4><button type="button" onClick={()=>setComparison([])} className="text-xs text-blue-700">Xóa so sánh</button></div><div className="grid gap-3 md:grid-cols-3">{compare.map((s:any)=><div key={s.store_id} className="rounded-xl border border-blue-100 bg-white p-4"><button type="button" className="text-left text-xs font-semibold text-blue-800" onClick={()=>onStore(s.store_id)}>{s.store}</button><strong className="mt-3 block text-xl tracking-tight">{money(s.revenue)}</strong><p className="mt-2 text-xs text-slate-500">{s.orders} đơn · AOV {money(s.aov)}</p></div>)}</div></section>}
      </>}
      {selected&&<section data-store-exploration id="geographic-store-details" className="mt-5 scroll-mt-24 border-t border-slate-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-blue-600">{city} / {storeType(selected.store_type)}</p><h4 className="mt-1 text-base font-semibold">{selected.store}</h4></div><button type="button" onClick={()=>{onStore(null);document.getElementById('province-business-details')?.scrollIntoView({behavior:'smooth',block:'start'});}} className="map-control">← Danh sách cửa hàng</button></div>
        {storeResource.loading&&<p role="status" className="geo-resource-loading">Đang tải xu hướng và sản phẩm của cửa hàng…</p>}
        {storeResource.error&&<div role="alert" className="geo-resource-error">{storeResource.error} <button type="button" className="underline" onClick={storeResource.reload}>Thử lại</button></div>}
        {storeResource.data&&<><StoreMetricStrip summary={storeResource.data.summary}/>{storeResource.data.detail_available===false?<p className="rounded-xl bg-blue-50 p-4 text-xs leading-6 text-blue-900">Đang xem số liệu cửa hàng trong kỳ Tổng quan. Mở bài toán “Bản đồ doanh thu & đơn hàng” tại Báo cáo & Phân tích để xem xu hướng theo tuần và sản phẩm.</p>:<div className="grid min-w-0 gap-4 xl:grid-cols-2"><div className="min-w-0 rounded-xl border border-slate-100 p-4"><h5 className="mb-4 text-sm font-semibold">Diễn biến doanh thu theo tuần</h5>{storeResource.data.trend.length?<AnalystChart chart={{chart_type:'line',unit:'VND',granularity:'week',period:storeResource.data.period,data:storeResource.data.trend.map((r:any)=>({label:r.period,value:r.store_revenue}))}}/>:<p className="text-xs text-slate-500">Chưa có đơn hợp lệ trong kỳ.</p>}</div>
          <div className="min-w-0 rounded-xl border border-slate-100 p-4"><h5 className="mb-4 text-sm font-semibold">Top 8 sản phẩm theo doanh thu</h5>{storeResource.data.products.length?<><AnalystHorizontalBars data={storeResource.data.products.map((p:any)=>({label:p.product,value:p.product_revenue}))} unit="VND" color="#6366f1" ranking/><p className="mt-3 text-[10px] leading-5 text-slate-500">Doanh thu dòng món theo danh mục; không đồng nhất với tổng tiền đơn sau các điều chỉnh.</p></>:<p className="text-xs text-slate-500">Chưa có chi tiết sản phẩm trong kỳ.</p>}</div></div>}</>}
      </section>}
      <p className="mt-4 text-[10px] leading-5 text-slate-400">{data.definitions?.revenue} {data.definitions?.orders} {data.definitions?.network} {data.snapshot_type==='overview'?'Khám phá từ danh sách cửa hàng của kỳ Tổng quan đã tải.':'Các số liệu được đọc cùng một ảnh chụp dữ liệu cho mỗi lần khám phá.'}</p>
    </>}
  </section>;
};
