import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import SearchableSelect from '../../components/console/SearchableSelect'
import CurrencyInput from '../../components/console/CurrencyInput'
import { Search, X, Plus, Minus, Trash2, ShoppingBag, Receipt, Coffee, ArrowRight, RefreshCw, ChevronLeft, ChevronRight } from '../../components/console/WorkspaceIcons'
import { normalizeViText } from '../admin-dashboard/utils'
import { kioskCategory, kioskMoney, kioskPaymentLabel, kioskSaleStatus } from './kioskPosModel'
import './KioskPosTerminal.css'

export default function KioskPosTerminal({ products = [], loading, packageName, cart = [], total, payment, cash, submitting, result, onAdd, onQuantity, onRemove, onClear, onPayment, onCash, onCheckout, onResult, onCheckPayment, onOrders }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [cashTouched, setCashTouched] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const cashId = useId()
  const callbacks = useRef({ onCheckPayment, onResult })
  callbacks.current = { onCheckPayment, onResult }
  const saleStatus = result?.success ? kioskSaleStatus(result.order || {}) : null
  const pending = result?.success && result.method !== 'TIEN_MAT' && saleStatus?.status === 'PENDING'
  const categories = useMemo(() => {
    const counts = new Map()
    products.forEach(item => { const name = kioskCategory(item); counts.set(name, (counts.get(name) || 0) + 1) })
    return [...counts.entries()]
  }, [products])
  const filtered = useMemo(() => products.filter(item => (!category || kioskCategory(item) === category) && normalizeViText(`${item.ten_san_pham} ${item.ma_san_pham}`).includes(normalizeViText(search))), [products, search, category])
  const pages = Math.max(1, Math.ceil(filtered.length / 9))
  const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * 9, currentPage * 9)
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0)
  const insufficient = payment === 'TIEN_MAT' && Number(cash || 0) < total
  const locked = submitting || pending
  const cashChoices = [...new Set([total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000])].filter(value => value > 0)

  useEffect(() => {
    if (!pending || !result.ma_don || !callbacks.current.onCheckPayment) return
    let cancelled = false, timer, attempts = 0
    const poll = async () => {
      try {
        const order = await callbacks.current.onCheckPayment(result.ma_don)
        if (cancelled) return
        if (order && kioskSaleStatus(order).status !== 'PENDING') {
          callbacks.current.onResult({ ...result, order })
          return
        }
      } catch { /* Keep the receipt visible; a temporary network failure is not payment failure. */ }
      if (!cancelled && ++attempts < 120) timer = setTimeout(poll, 5000)
    }
    timer = setTimeout(poll, 3000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [pending, result?.ma_don])

  const checkPayment = async () => {
    setChecking(true); setCheckError('')
    try {
      const order = await onCheckPayment(result.ma_don)
      if (order) { onResult({ ...result, order }); if (kioskSaleStatus(order).status === 'PENDING') setCheckError('Chưa nhận được xác nhận từ ngân hàng. Hệ thống sẽ tiếp tục kiểm tra.') }
      else setCheckError('Chưa có xác nhận thanh toán. Vui lòng kiểm tra lại sau.')
    } catch { setCheckError('Chưa kiểm tra được thanh toán. Vui lòng thử lại.') }
    finally { setChecking(false) }
  }
  const startNew = () => { onResult(null); setCashTouched(false); setCheckError('') }
  const add = item => { if (result) startNew(); onAdd(item) }

  return <div className="kiosk-sale-terminal" aria-label="Quầy bán hàng mang đi">
    <section className="kiosk-sale-catalog" aria-label="Thực đơn bán hàng">
      <header className="kiosk-sale-catalog-header"><div><h2>Thực đơn</h2><p>{products.length} món · {packageName || 'Bán mang đi'}</p></div><Badge variant="outline">Mang đi</Badge></header>
      <div className="kiosk-sale-search"><Search size={18} aria-hidden="true" /><Input aria-label="Tìm món bán hàng" placeholder="Tìm tên món hoặc mã sản phẩm…" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />{search && <Button variant="ghost" size="icon" aria-label="Xóa tìm kiếm món" onClick={() => { setSearch(''); setPage(1) }}><X size={16} /></Button>}</div>
      <div className="kiosk-sale-categories" aria-label="Danh mục món">
        {[[ '', products.length ], ...categories].map(([name, count]) => <Button type="button" key={name} variant={category === name ? 'default' : 'outline'} aria-pressed={category === name} onClick={() => { setCategory(name); setPage(1) }}>{name || 'Tất cả'} <span>{count}</span></Button>)}
      </div>
      {loading ? <div className="kiosk-sale-grid" role="status" aria-label="Đang tải thực đơn">{[0,1,2,3,4,5].map(key => <div key={key} className="workspace-shimmer kiosk-sale-placeholder" />)}</div> : !visible.length ? <div className="kiosk-sale-no-results"><Coffee size={30} /><h3>Không tìm thấy món</h3><p>Thử tên khác hoặc chọn tất cả danh mục.</p><Button variant="outline" onClick={() => { setSearch(''); setCategory(''); setPage(1) }}>Xóa bộ lọc</Button></div> : <div className="kiosk-sale-grid">
        {visible.map(item => { const count = cart.filter(line => line.productId === item.ma_san_pham).reduce((sum, line) => sum + line.quantity, 0); return <button type="button" key={item.ma_san_pham} className={`kiosk-sale-product${count ? ' is-selected' : ''}`} disabled={locked} onClick={() => add(item)} aria-label={`Thêm ${item.ten_san_pham}`}>
          <span className="kiosk-sale-product-image">{item.hinh_anh_url ? <img src={item.hinh_anh_url} alt="" loading="lazy" /> : <Coffee size={36} />}{count > 0 && <span className="kiosk-sale-product-count" aria-label={`${count} trong đơn`}>{count}</span>}</span>
          <span className="kiosk-sale-product-name">{item.ten_san_pham}</span><Badge variant="outline">{kioskCategory(item)}</Badge>
          <span className="kiosk-sale-product-bottom"><strong>{kioskMoney(item.gia_ban ?? item.gia)}</strong><span className="kiosk-sale-add"><Plus size={18} /></span></span>
        </button> })}
      </div>}
      <footer className="kiosk-sale-pagination"><span>{filtered.length ? `${(currentPage - 1) * 9 + 1}–${Math.min(currentPage * 9, filtered.length)}` : '0'} / {filtered.length} món</span><div><Button variant="outline" size="icon" disabled={currentPage === 1} aria-label="Trang món trước" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></Button><span>{currentPage} / {pages}</span><Button variant="outline" size="icon" disabled={currentPage === pages} aria-label="Trang món sau" onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></Button></div></footer>
    </section>
    <aside className="kiosk-sale-receipt" aria-label="Chi tiết đơn hàng" aria-busy={submitting}>
      <header className="kiosk-sale-receipt-header"><div><Receipt size={20} /><h2>Đơn mang đi</h2></div>{!result?.success && <span>{quantity} món</span>}{cart.length > 0 && !result?.success && <Button type="button" variant="ghost" disabled={locked} aria-label="Xóa toàn bộ món trong đơn" onClick={onClear}><Trash2 size={16} /></Button>}</header>
      {result?.success ? <div className="kiosk-sale-result" role="status" aria-live="polite">
        {saleStatus.status === 'HOAN_THANH' ? <>
          <svg className="kiosk-sale-success" viewBox="0 0 80 80" aria-hidden="true"><circle className="kiosk-sale-success-ring" cx="40" cy="40" r="34" /><path className="kiosk-sale-success-check" d="m24 40 11 11 22-23" /></svg>
          <h3>Thanh toán thành công</h3><p>Đơn mang đi đã hoàn tất.</p>
        </> : pending ? <><div className="kiosk-sale-payment-wait"><RefreshCw size={28} /></div><h3>Chờ thanh toán</h3><p>Đơn đã tạo. Đang chờ xác nhận nhận tiền.</p></> : <><ShoppingBag size={36} /><h3>{saleStatus.label}</h3><p>Vui lòng kiểm tra đơn trong danh sách bán hàng.</p></>}
        <strong className="kiosk-sale-result-amount">{kioskMoney(result.tong)}</strong><p className="kiosk-sale-result-code">Đơn #{String(result.ma_don || '').slice(0, 8).toUpperCase()} · {kioskPaymentLabel(result.method)}</p>
        {saleStatus.status === 'HOAN_THANH' && result.method === 'TIEN_MAT' && <dl className="kiosk-sale-result-cash"><div><dt>Khách đưa</dt><dd>{kioskMoney(result.cash)}</dd></div><div><dt>Tiền trả lại</dt><dd>{kioskMoney(result.change)}</dd></div></dl>}
        {pending && result.method === 'NGAN_HANG_QR' && result.payment_details?.qr_img_url && <img className="kiosk-sale-payment-qr" src={result.payment_details.qr_img_url} alt="Mã QR thanh toán đơn hàng" />}
        {pending && result.vnpay_url && <a className="kiosk-sale-payment-link" href={result.vnpay_url} target="_blank" rel="noreferrer">Mở thanh toán VNPay <ArrowRight size={16} /></a>}
        {pending && onCheckPayment && <Button variant="outline" disabled={checking} onClick={checkPayment}>{checking ? 'Đang kiểm tra…' : 'Kiểm tra thanh toán'}</Button>}
        {checkError && <p role="alert" className="kiosk-sale-error">{checkError}</p>}
        {!pending && <Button variant="default" className="kiosk-sale-new-order" onClick={startNew}>Tạo đơn mới <ArrowRight size={18} /></Button>}
        {onOrders && <Button variant="ghost" onClick={onOrders}>Xem đơn bán hàng</Button>}
      </div> : <>
        <div className="kiosk-sale-lines">{!cart.length ? <div className="kiosk-sale-empty"><ShoppingBag size={34} /><h3>Đơn hàng đang trống</h3><p>Chọn món bên trái để bắt đầu.</p></div> : cart.map(item => <div className="kiosk-sale-line" key={item.id}>
          <div className="kiosk-sale-line-top"><strong>{item.name}</strong><Button type="button" variant="ghost" size="icon" disabled={locked} aria-label={`Bỏ ${item.name}`} onClick={() => onRemove(item.id)}><X size={15} /></Button></div>
          {item.toppings?.length > 0 && <small>{item.toppings.map(t => t.name || t).join(', ')}</small>}
          <div className="kiosk-sale-line-bottom"><div className="kiosk-sale-quantity"><Button variant="outline" size="icon" disabled={locked} aria-label={`Giảm ${item.name}`} onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus size={14} /></Button><span>{item.quantity}</span><Button variant="outline" size="icon" disabled={locked} aria-label={`Tăng ${item.name}`} onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus size={14} /></Button></div><strong>{kioskMoney(item.price * item.quantity)}</strong></div>
        </div>)}</div>
        <div className="kiosk-sale-settlement"><div className="kiosk-sale-total"><span>Tổng thanh toán</span><strong>{kioskMoney(total)}</strong></div>
          <label htmlFor={`${cashId}-method`}>Phương thức thanh toán</label><SearchableSelect id={`${cashId}-method`} aria-label="Phương thức thanh toán" value={payment} disabled={locked} onChange={event => onPayment(event.target.value)} options={[{ value:'TIEN_MAT',label:'Tiền mặt' },{ value:'NGAN_HANG_QR',label:'Chuyển khoản QR' },{ value:'VNPAY',label:'VNPay' }]} />
          {payment === 'TIEN_MAT' && <><label htmlFor={cashId}>Tiền khách đưa</label><CurrencyInput id={cashId} value={cash} disabled={locked || !cart.length} placeholder="Nhập số tiền khách đưa" aria-invalid={cashTouched && insufficient} aria-describedby={cashTouched && insufficient ? `${cashId}-error` : undefined} onBlur={() => setCashTouched(true)} onChange={event => onCash(event.target.value)} />
            {cart.length > 0 && <div className="kiosk-sale-cash-shortcuts">{cashChoices.map(amount => <Button variant="outline" disabled={locked} key={amount} onClick={() => { onCash(amount); setCashTouched(true) }}>{amount === total ? 'Vừa đủ' : kioskMoney(amount)}</Button>)}</div>}
            {cashTouched && insufficient && cart.length > 0 && <p id={`${cashId}-error`} role="alert" className="kiosk-sale-error">Khách còn thiếu {kioskMoney(total - Number(cash || 0))}.</p>}
            <div className="kiosk-sale-change"><span>Tiền trả lại</span><strong>{kioskMoney(Math.max(0, Number(cash || 0) - total))}</strong></div>
          </>}
          {result?.success === false && <p role="alert" className="kiosk-sale-error">{result.error || 'Chưa tạo được đơn. Vui lòng thử lại.'}</p>}
          <Button type="button" variant="default" className="kiosk-sale-pay" disabled={!cart.length || locked || insufficient} onClick={onCheckout}>{submitting ? <><RefreshCw className="animate-spin" size={18} /> Đang tạo đơn…</> : <>{payment === 'TIEN_MAT' ? 'Thu tiền & hoàn tất' : 'Tạo đơn thanh toán'} <ArrowRight size={18} /></>}</Button>
          <p className="kiosk-sale-footnote">{payment === 'TIEN_MAT' ? 'Xác nhận sau khi đã nhận đủ tiền từ khách.' : 'Đơn hoàn tất khi hệ thống xác nhận nhận tiền.'}</p>
        </div>
      </>}
    </aside>
  </div>
}
