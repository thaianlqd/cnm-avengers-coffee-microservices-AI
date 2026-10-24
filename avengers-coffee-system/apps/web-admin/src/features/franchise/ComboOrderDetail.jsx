import { useState } from 'react'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import StatusBadge from '../../components/console/StatusBadge'
import { Button } from '../../components/ui/button'
import { Download, Printer, Eye } from '../../components/console/WorkspaceIcons'
import { comboHasInvoice, comboInvoiceNumber, comboIsPaid, comboStatusLabel, openComboInvoice } from './comboInvoice'
import './ComboOrderDetail.css'

const money = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`
const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—'
export default function ComboOrderDetail({ order, onClose, busy = false, onAccept, onDeliver, onPostpone, onPay }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const invoice = comboHasInvoice(order)
  const paid = comboIsPaid(order)
  const exportInvoice = async mode => {
    if (exporting) return
    setExporting(true); setError('')
    try { await openComboInvoice(order, mode) } catch (error) { setError(error.message) } finally { setExporting(false) }
  }
  return <WorkspaceDialog title="Chi tiết đơn combo" onClose={onClose} busy={busy || exporting} className="combo-order-dialog">
    <div className="combo-order-document">
      <header><div><p>{invoice ? 'Hóa đơn đơn combo' : 'Đơn đặt combo'}</p><h2>#{String(order.id).slice(0, 8).toUpperCase()}</h2><small>{date(order.ngay_dat || order.ngay_tao)}</small></div>{paid ? <div className="combo-paid-stamp">Đã thanh toán</div> : <StatusBadge tone="warning">Chưa thanh toán</StatusBadge>}</header>
      <dl className="combo-order-meta"><div><dt>Kiosk</dt><dd>{order.kiosk?.ten_kiosk || order.kiosk_id}<small>{order.kiosk?.ma_kiosk}</small></dd></div><div><dt>Trạng thái đơn</dt><dd>{comboStatusLabel(order.trang_thai)}</dd></div><div><dt>Hạn thanh toán</dt><dd>{date(order.han_thanh_toan)}</dd></div></dl>
      <div className="combo-order-line"><div><strong>{order.combo?.ten_combo || 'Combo nguyên liệu'}</strong>{order.combo?.mo_ta && <p>{order.combo.mo_ta}</p>}<small>{order.so_luong} × {money(order.don_gia)}</small></div><strong>{money(order.tong_tien)}</strong></div>
      <div className="combo-order-total"><span>Tổng đơn hàng</span><strong>{money(order.tong_tien)}</strong></div>
      {!paid && Number(order.phi_phat_tre_han)>0 && <p className="combo-order-note">Phí chậm thanh toán: {money(order.phi_phat_tre_han)} · Cần thanh toán: {money(order.tong_can_thanh_toan)}</p>}
      {order.ghi_chu_admin && <p className="combo-order-note">Ghi chú: {order.ghi_chu_admin}</p>}
      {invoice ? <p className="combo-order-note">Số hóa đơn: {comboInvoiceNumber(order)}. Chứng từ đơn hàng, không thay thế hóa đơn điện tử thuế.</p> : <p className="combo-order-note">Hóa đơn sẽ sẵn sàng sau khi quản lý chấp nhận đơn.</p>}
      {error && <p role="alert" className="workspace-form-error">{error}</p>}
      <footer>{invoice && <div className="combo-invoice-actions"><Button variant="outline" disabled={exporting} onClick={()=>exportInvoice('preview')}><Eye size={15}/>Xem hóa đơn</Button><Button variant="outline" disabled={exporting} onClick={()=>exportInvoice('download')}><Download size={15}/>{exporting ? 'Đang tạo PDF…' : 'Tải PDF'}</Button><Button variant="outline" disabled={exporting} onClick={()=>exportInvoice('print')}><Printer size={15}/>In hóa đơn</Button></div>}
        <div className="combo-order-actions">
          {onPostpone && order.trang_thai === 'DA_DAT' && <Button variant="outline" disabled={busy} onClick={onPostpone}>Tạm hoãn</Button>}
          {onAccept && order.trang_thai === 'DA_DAT' && <Button disabled={busy} onClick={onAccept}>{busy ? 'Đang xử lý…' : 'Chấp nhận đơn'}</Button>}
          {onDeliver && order.trang_thai === 'DA_XAC_NHAN' && <Button disabled={busy} onClick={onDeliver}>{busy ? 'Đang xử lý…' : 'Xác nhận đã giao'}</Button>}
          {onPay && invoice && !paid && order.cong_no_id && <Button disabled={busy} onClick={onPay}>{busy ? 'Đang thanh toán…' : 'Thanh toán qua ví'}</Button>}
        </div></footer>
    </div>
  </WorkspaceDialog>
}
