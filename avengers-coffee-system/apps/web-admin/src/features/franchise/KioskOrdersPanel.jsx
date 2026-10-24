import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Table } from '../../components/ui/table'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import SearchableSelect from '../../components/console/SearchableSelect'
import StatusBadge from '../../components/console/StatusBadge'
import { RefreshCw, Search, Receipt, RotateCcw } from '../../components/console/WorkspaceIcons'
import { KioskTableLoading } from './KioskShiftPanel'
import { API_BASE_URL } from '../admin-dashboard/constants'
import { kioskMoney, kioskPaymentLabel, kioskSaleStatus } from './kioskPosModel'
import './KioskOrdersPanel.css'

const time = value => new Date(value).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'})
export default function KioskOrdersPanel({ branchCode, token, canRefund=true, onRefund, onMessage }) {
  const [range,setRange]=useState('today'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0)
  const [orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null)
  const [refund,setRefund]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[refundError,setRefundError]=useState('')
  const lock=useRef(false),refundRequest=useRef(0)
  useEffect(()=>()=>{refundRequest.current++},[])
  const request=async(path,options={})=>{
    const response=await fetch(`${API_BASE_URL}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}})
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message || 'Chưa tải được dữ liệu. Vui lòng thử lại.');return data
  }
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1)},300);return()=>clearTimeout(timer)},[search])
  useEffect(()=>{
    const controller=new AbortController();let current=true
    if(!branchCode){setOrders([]);setLoading(false);return()=>controller.abort()}
    setLoading(true);setError('')
    const params=new URLSearchParams({branch_code:branchCode,limit:'20',page:String(page)})
    if(query)params.set('q',query)
    const now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),now.getDate())
    if(range==='week')from.setDate(from.getDate()-(from.getDay()||7)+1)
    if(range==='month')from.setDate(1)
    if(range!=='all'){params.set('date_from',from.toISOString());params.set('date_to',new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999).toISOString())}
    fetch(`${API_BASE_URL}/staff/orders?${params}`,{signal:controller.signal,headers:token?{Authorization:`Bearer ${token}`}:{}}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message || 'Không tải được đơn hàng.');if(current)setOrders(data.orders || [])}).catch(error=>{if(current && error.name!=='AbortError')setError(error.message)}).finally(()=>{if(current)setLoading(false)})
    return()=>{current=false;controller.abort()}
  },[branchCode,token,range,query,page,revision])
  const startRefund=async order=>{
    const requestId=++refundRequest.current
    setRefund({order,checking:true});setReason('');setRefundError('')
    try{const eligibility=await request(`/staff/orders/${encodeURIComponent(order.ma_don_hang)}/refund-eligibility?branch_code=${encodeURIComponent(branchCode)}`);if(requestId===refundRequest.current)setRefund({order,...eligibility,checking:false})}
    catch(error){if(requestId===refundRequest.current)setRefund({order,checking:false,hop_le:false,ly_do:error.message})}
  }
  const submit=async event=>{
    event.preventDefault();if(lock.current || !refund?.hop_le || !canRefund)return
    if(!reason.trim()){setRefundError('Vui lòng nhập lý do hoàn tiền.');return}
    lock.current=true;setBusy(true);setRefundError('')
    try{await request(`/staff/orders/${encodeURIComponent(refund.order.ma_don_hang)}/refund-void`,{method:'POST',body:JSON.stringify({branch_code:branchCode,reason:reason.trim()})});setRefund(null);setSelected(null);setRevision(value=>value+1);onMessage?.('success','Đã hoàn tiền đơn hàng.');onRefund?.()}
    catch(error){setRefundError(error.message)}finally{lock.current=false;setBusy(false)}
  }
  return <div className="kiosk-order-history">
    <div className="kiosk-orders-toolbar"><label className="kiosk-orders-search"><Search size={17} aria-hidden="true"/><Input aria-label="Tìm đơn bán hàng" placeholder="Tìm mã đơn, tên món…" value={search} onChange={event=>setSearch(event.target.value)}/></label><SearchableSelect aria-label="Thời gian đơn hàng" value={range} onChange={event=>{setRange(event.target.value);setPage(1)}} options={[{value:'today',label:'Hôm nay'},{value:'week',label:'Tuần này'},{value:'month',label:'Tháng này'},{value:'all',label:'Tất cả thời gian'}]}/><Button variant="outline" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15}/>Tải lại</Button></div>
    {error && <p role="alert" className="workspace-form-error">{error}</p>}
    {!canRefund && <p className="kiosk-order-hint">Bạn có thể xem đơn tại kiosk. Cần được quản lý cấp quyền hủy đơn để hoàn tiền.</p>}
    {loading ? <KioskTableLoading label="Đang tải đơn bán hàng"/> : !orders.length ? <div className="kiosk-orders-empty"><Receipt size={28}/><p>Chưa có đơn bán hàng trong thời gian này.</p></div> : <div className="kiosk-orders-table"><Table><thead><tr><th>Đơn hàng</th><th>Thời gian</th><th>Thanh toán</th><th>Tổng tiền</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>{orders.map(order=><tr key={order.ma_don_hang}><td><strong>#{order.ma_don_hang.slice(0,8).toUpperCase()}</strong><small>{order.chi_tiet?.reduce((sum,item)=>sum+Number(item.so_luong||0),0)} món · {order.ten_khach_hang || 'Khách tại quầy'}</small></td><td>{time(order.ngay_tao)}</td><td>{kioskPaymentLabel(order.phuong_thuc_thanh_toan)}</td><td className="kiosk-orders-money">{kioskMoney(order.tong_tien)}</td><td><StatusBadge status={kioskSaleStatus(order).status}>{kioskSaleStatus(order).label}</StatusBadge></td><td><div className="kiosk-order-actions"><Button variant="outline" size="sm" onClick={()=>setSelected(order)}>Chi tiết</Button>{order.trang_thai_thanh_toan==='DA_THANH_TOAN' && order.trang_thai_don_hang!=='DA_HUY' && <Button variant="outline" size="sm" data-intent="danger" disabled={!canRefund} onClick={()=>startRefund(order)}><RotateCcw size={14}/>Hoàn tiền</Button>}</div></td></tr>)}</tbody></Table></div>}
    <footer className="kiosk-orders-pagination"><span>Trang {page}</span><Button variant="outline" disabled={page===1 || loading} onClick={()=>setPage(value=>value-1)}>Trước</Button><Button variant="outline" disabled={orders.length<20 || loading} onClick={()=>setPage(value=>value+1)}>Sau</Button></footer>
    {selected && <WorkspaceDialog title={`Đơn #${selected.ma_don_hang.slice(0,8).toUpperCase()}`} subtitle={`${time(selected.ngay_tao)} · ${kioskPaymentLabel(selected.phuong_thuc_thanh_toan)}`} onClose={()=>setSelected(null)} className="kiosk-order-dialog" footer={<Button variant="outline" onClick={()=>setSelected(null)}>Đóng</Button>}><div className="kiosk-order-detail"><StatusBadge status={kioskSaleStatus(selected).status}>{kioskSaleStatus(selected).label}</StatusBadge><ul>{selected.chi_tiet?.map((item,index)=><li key={item.id || index}><span>{item.so_luong} × {item.ten_san_pham}</span><strong>{kioskMoney(Number(item.gia_ban)*Number(item.so_luong))}</strong></li>)}</ul><dl><div><dt>Tổng thanh toán</dt><dd>{kioskMoney(selected.tong_tien)}</dd></div>{selected.tien_khach_dua!=null && <><div><dt>Tiền khách đưa</dt><dd>{kioskMoney(selected.tien_khach_dua)}</dd></div><div><dt>Tiền thối</dt><dd>{kioskMoney(selected.tien_thoi)}</dd></div></>}</dl>{selected.ghi_chu && <p>{selected.ghi_chu}</p>}</div></WorkspaceDialog>}
    {refund && <WorkspaceDialog title="Hoàn tiền đơn hàng" subtitle={`Đơn #${refund.order.ma_don_hang.slice(0,8).toUpperCase()} · ${kioskMoney(refund.order.tong_tien)}`} onClose={()=>{if(!busy){refundRequest.current++;setRefund(null)}}} busy={busy} className="kiosk-order-dialog" footer={<><Button variant="outline" disabled={busy} onClick={()=>{refundRequest.current++;setRefund(null)}}>Đóng</Button>{refund.hop_le && <Button variant="destructive" form="kiosk-order-refund" type="submit" disabled={busy}>{busy?'Đang hoàn tiền…':'Xác nhận hoàn tiền'}</Button>}</>}><form id="kiosk-order-refund" className="kiosk-order-detail" onSubmit={submit}>{refund.checking ? <KioskTableLoading rows={2} label="Đang kiểm tra điều kiện hoàn tiền"/> : !refund.hop_le ? <p role="alert">{refund.ly_do}</p> : <><p>Đơn được ghi nhận hoàn tiền và hủy sau khi xác nhận.</p><label htmlFor="kiosk-refund-reason">Lý do hoàn tiền <span>*</span></label><Textarea id="kiosk-refund-reason" required maxLength={1000} rows={3} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Nhập lý do để quản lý đối chiếu…"/>{refundError && <p className="workspace-form-error" role="alert">{refundError}</p>}</>}</form></WorkspaceDialog>}
  </div>
}
