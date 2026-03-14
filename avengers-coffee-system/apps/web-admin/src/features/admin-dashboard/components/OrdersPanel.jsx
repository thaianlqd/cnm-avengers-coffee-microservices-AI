import { useMemo, useState } from 'react'
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeViText, paymentTag } from '../utils'

const PAGE_SIZE = 8

const STAGE_CLASS = {
  MOI_TAO: 'stage-new',
  DA_XAC_NHAN: 'stage-brewing',
  DANG_CHUAN_BI: 'stage-brewing',
  DANG_GIAO: 'stage-ready',
  HOAN_THANH: 'stage-done',
  DA_HUY: 'stage-new',
}

const TONE_CLASS = {
  MOI_TAO: 'tone-new',
  DA_XAC_NHAN: 'tone-confirmed',
  DANG_CHUAN_BI: 'tone-preparing',
  DANG_GIAO: 'tone-shipping',
  HOAN_THANH: 'tone-done',
  DA_HUY: 'tone-cancelled',
}

const ORDER_TYPE_FILTERS = [
  { id: '', label: 'Tất cả', icon: '📋' },
  { id: 'TAI_CHO', label: 'Tại quầy', icon: '🏪' },
  { id: 'MANG_DI', label: 'Mang đi', icon: '🥤' },
  { id: 'ONLINE', label: 'Online', icon: '🌐' },
]

const STATUS_FILTERS = [
  { id: '', label: 'Mọi trạng thái' },
  ...ORDER_STATUSES.map((s) => ({ id: s, label: ORDER_STATUS_LABEL[s] })),
]

const PAYMENT_FILTERS = [
  { id: '', label: 'Mọi hình thức' },
  { id: 'THANH_TOAN_KHI_NHAN_HANG', label: 'Tiền mặt / COD' },
  { id: 'NGAN_HANG_QR', label: 'QR ngân hàng' },
  { id: 'VNPAY', label: 'VNPAY' },
]

function getOrderTypeLabel(loai) {
  if (loai === 'TAI_CHO') return 'Tại quầy'
  if (loai === 'MANG_DI') return 'Mang đi'
  return 'Online'
}

export function OrdersPanel({ ordersState, updatingOrderId, onUpdateStatus }) {
  const [searchText, setSearchText] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [page, setPage] = useState(1)

  const filteredOrders = useMemo(() => {
    setPage(1)
    return ordersState.items.filter((order) => {
      if (searchText) {
        const q = searchText.toLowerCase()
        const inId = order.ma_don_hang.toLowerCase().includes(q)
        const inCustomer = (order.ten_khach_hang || '').toLowerCase().includes(q)
        const inCashier = (order.ten_thu_ngan || '').toLowerCase().includes(q)
        const inGuest = (order.ma_nguoi_dung || '').toLowerCase().includes(q)
        if (!inId && !inCustomer && !inCashier && !inGuest) return false
      }
      if (filterType) {
        if (filterType === 'ONLINE') {
          if (order.loai_don_hang === 'TAI_CHO' || order.loai_don_hang === 'MANG_DI') return false
        } else {
          if (order.loai_don_hang !== filterType) return false
        }
      }
      if (filterStatus && order.trang_thai_don_hang !== filterStatus) return false
      if (filterPayment && order.phuong_thuc_thanh_toan !== filterPayment) return false
      return true
    })
  }, [ordersState.items, searchText, filterType, filterStatus, filterPayment])

  const hasActiveFilter = searchText || filterType || filterStatus || filterPayment
  const resetFilters = () => {
    setSearchText('')
    setFilterType('')
    setFilterStatus('')
    setFilterPayment('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Luồng đơn hàng</h2>
        <span>Dữ liệu thật từ hệ thống</span>
      </div>

      {/* ── Filter bar ── */}
      <div className="orders-filter-bar">
        {/* Search */}
        <div className="ofb-search-row">
          <div className="ofb-search-wrap">
            <svg className="ofb-search-icon" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              className="ofb-search-input"
              type="text"
              placeholder="Tìm mã đơn, tên khách, thu ngân..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button className="ofb-clear-btn" type="button" onClick={() => setSearchText('')} aria-label="Xóa tìm kiếm">
                ×
              </button>
            )}
          </div>
          <div className="ofb-result-count">
            {hasActiveFilter ? (
              <>
                <span className="ofb-count-badge">{filteredOrders.length}</span>
                <span>/ {ordersState.items.length} đơn</span>
                <button className="ofb-reset-link" type="button" onClick={resetFilters}>
                  Xóa bộ lọc
                </button>
              </>
            ) : (
              <span>{ordersState.items.length} đơn hàng</span>
            )}
          </div>
        </div>

        {/* Filter groups */}
        <div className="ofb-filter-rows">
          <div className="ofb-filter-group">
            <span className="ofb-group-label">Loại đơn</span>
            <div className="ofb-chips">
              {ORDER_TYPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`ofb-chip ${filterType === f.id ? 'ofb-chip--active' : ''}`}
                  onClick={() => setFilterType(f.id)}
                >
                  <span className="ofb-chip-icon">{f.icon}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ofb-filter-group">
            <span className="ofb-group-label">Trạng thái</span>
            <div className="ofb-chips">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`ofb-chip ofb-chip--status ${filterStatus === f.id ? 'ofb-chip--active' : ''}`}
                  onClick={() => setFilterStatus(f.id)}
                >
                  {f.id && <span className={`ofb-dot ${TONE_CLASS[f.id] || ''}`} />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ofb-filter-group">
            <span className="ofb-group-label">Thanh toán</span>
            <div className="ofb-chips">
              {PAYMENT_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`ofb-chip ${filterPayment === f.id ? 'ofb-chip--active' : ''}`}
                  onClick={() => setFilterPayment(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* ── End filter bar ── */}

      <div className="order-list">
        {ordersState.loading ? (
          <div className="ofb-loading">
            <span className="ofb-spinner" />
            Đang tải đơn hàng...
          </div>
        ) : null}
        {ordersState.error ? <p className="error-text">{ordersState.error}</p> : null}
        {!ordersState.loading && !ordersState.error && filteredOrders.length === 0 ? (
          <div className="ofb-empty">
            <span>🔍</span>
            <p>{hasActiveFilter ? 'Không có đơn hàng khớp với bộ lọc.' : 'Chưa có đơn hàng để hiển thị.'}</p>
            {hasActiveFilter && (
              <button className="ofb-reset-link" type="button" onClick={resetFilters}>
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : null}
        {pageOrders.map((order) => (
          <article key={order.ma_don_hang} className={`order-card ${STAGE_CLASS[order.trang_thai_don_hang] || ''}`}>
            <div>
              <h3>{order.ma_don_hang.slice(0, 8).toUpperCase()}</h3>
              <p>Khách: {normalizeViText(order.ten_khach_hang) || order.ma_nguoi_dung}</p>
              <p className="order-card-addr">{normalizeViText(order.dia_chi_giao_hang) || 'Tại quán'}</p>
              <p>
                <span className="order-type-badge">
                  {getOrderTypeLabel(order.loai_don_hang)}
                </span>
              </p>
            </div>
            <div>
              <p className="order-payment-pill">{paymentTag(order.phuong_thuc_thanh_toan)}</p>
              <strong className="order-amount">{fmtMoney(order.tong_tien)}</strong>
              <p>
                <span className={`status-pill ${TONE_CLASS[order.trang_thai_don_hang] || 'tone-new'}`}>
                  {ORDER_STATUS_LABEL[order.trang_thai_don_hang] || order.trang_thai_don_hang}
                </span>
              </p>
              <p className="order-cashier">Thu ngân: {normalizeViText(order.ten_thu_ngan) || 'N/A'}</p>
            </div>
            <div className="status-update-box">
              <label htmlFor={`status-${order.ma_don_hang}`}>Trạng thái đơn</label>
              <select
                id={`status-${order.ma_don_hang}`}
                value={order.trang_thai_don_hang}
                onChange={(e) => onUpdateStatus(order.ma_don_hang, e.target.value)}
                disabled={updatingOrderId === order.ma_don_hang}
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              <span>{new Date(order.ngay_tao).toLocaleString('vi-VN')}</span>
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination-bar">
          <button
            className="pg-btn"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >‹ Trước</button>
          <div className="pg-pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`pg-num ${safePage === p ? 'pg-num--active' : ''}`}
                onClick={() => setPage(p)}
              >{p}</button>
            ))}
          </div>
          <button
            className="pg-btn"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >Tiếp ›</button>
          <span className="pg-info">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredOrders.length)} / {filteredOrders.length}</span>
        </div>
      )}
    </section>
  )
}
