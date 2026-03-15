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

const ORDER_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH']
const STATUS_TRANSITIONS = {
  MOI_TAO: ['DA_XAC_NHAN', 'DA_HUY'],
  DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DA_HUY'],
  DANG_CHUAN_BI: ['DANG_GIAO', 'HOAN_THANH', 'DA_HUY'],
  DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
  HOAN_THANH: [],
  DA_HUY: [],
}

function layDanhSachTrangThaiCoTheChon(currentStatus) {
  if (!currentStatus) return ORDER_STATUSES
  if (currentStatus === 'DA_HUY') return ['DA_HUY']

  const currentIndex = ORDER_FLOW.indexOf(currentStatus)
  if (currentIndex < 0) return [currentStatus]

  const statuses = [currentStatus, ...ORDER_FLOW.slice(currentIndex + 1)]
  if ((STATUS_TRANSITIONS[currentStatus] || []).includes('DA_HUY')) {
    statuses.push('DA_HUY')
  }
  return statuses
}

function getOrderTypeLabel(loai) {
  if (loai === 'TAI_CHO') return 'Tại quầy'
  if (loai === 'MANG_DI') return 'Mang đi'
  return 'Online'
}

function coTheSuaDon(order) {
  return order.trang_thai_don_hang === 'MOI_TAO' && order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
}

function coTheXoaDon(order) {
  return ['MOI_TAO', 'DA_HUY'].includes(order.trang_thai_don_hang)
}

function lyDoKhongSuaDon(order) {
  if (order.trang_thai_don_hang !== 'MOI_TAO') {
    return 'Đơn không còn ở trạng thái Mới tạo'
  }
  if (order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
    return 'Hiện chỉ cho sửa đơn COD'
  }
  return ''
}

function lyDoKhongXoaDon(order) {
  if (!['MOI_TAO', 'DA_HUY'].includes(order.trang_thai_don_hang)) {
    return 'Chi xoa duoc don Moi tao hoac Da huy'
  }
  return ''
}

function taoDraftTuDon(order) {
  return {
    ten_khach_hang: order.ten_khach_hang || '',
    ma_ban: order.ma_ban || '',
    dia_chi_giao_hang: order.dia_chi_giao_hang || '',
    ghi_chu: order.ghi_chu || '',
    items: (order.chi_tiet || []).map((line) => ({
      ma_san_pham: Number(line.ma_san_pham),
      ten_san_pham: normalizeViText(line.ten_san_pham || ''),
      so_luong: Number(line.so_luong || 1),
      gia_ban: Number(line.gia_ban || 0),
    })),
  }
}

export function OrdersPanel({
  ordersState,
  inventoryState,
  updatingOrderId,
  onUpdateStatus,
  onUpdateOrder,
  onDeleteOrder,
}) {
  const [searchText, setSearchText] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const [editingOrderId, setEditingOrderId] = useState('')
  const [editDraft, setEditDraft] = useState(null)
  const [editCashInput, setEditCashInput] = useState(0)

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
      if (filterDate) {
        const ngayTao = new Date(order.ngay_tao)
        if (Number.isNaN(ngayTao.getTime()) || ngayTao.toLocaleDateString('sv-SE') !== filterDate) return false
      }
      if (filterMonth) {
        const ngayTao = new Date(order.ngay_tao)
        const thangNam = `${ngayTao.getFullYear()}-${String(ngayTao.getMonth() + 1).padStart(2, '0')}`
        if (Number.isNaN(ngayTao.getTime()) || thangNam !== filterMonth) return false
      }
      return true
    })
  }, [ordersState.items, searchText, filterType, filterStatus, filterPayment, filterDate, filterMonth])

  const hasActiveFilter = searchText || filterType || filterStatus || filterPayment || filterDate || filterMonth
  const resetFilters = () => {
    setSearchText('')
    setFilterType('')
    setFilterStatus('')
    setFilterPayment('')
    setFilterDate('')
    setFilterMonth('')
    setPage(1)
  }

  const financeSummary = useMemo(() => {
    const completed = filteredOrders.filter((order) => order.trang_thai_don_hang === 'HOAN_THANH')
    const tongDoanhThu = completed.reduce((sum, order) => sum + Number(order.tong_tien || 0), 0)
    const tienMatThuVao = completed
      .filter((order) => order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG')
      .reduce((sum, order) => sum + Math.max(Number((order.tien_khach_dua ?? order.tong_tien) || 0), Number(order.tong_tien || 0)), 0)
    const tienThoi = completed
      .filter((order) => order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG')
      .reduce((sum, order) => sum + Math.max(Number(order.tien_thoi || 0), 0), 0)
    const tienMatThucThu = Math.max(tienMatThuVao - tienThoi, 0)

    return {
      completedCount: completed.length,
      tongDoanhThu,
      tienMatThuVao,
      tienThoi,
      tienMatThucThu,
    }
  }, [filteredOrders])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const editSubTotal = useMemo(() => {
    if (!editDraft) return 0
    return editDraft.items.reduce((sum, item) => sum + Number(item.gia_ban || 0) * Number(item.so_luong || 0), 0)
  }, [editDraft])
  const editVat = useMemo(() => Number((editSubTotal * 0.08).toFixed(0)), [editSubTotal])
  const editChange = useMemo(() => Math.max(0, Number(editCashInput || 0) - Number(editSubTotal || 0)), [editCashInput, editSubTotal])
  const editCashInsufficient = useMemo(() => Number(editCashInput || 0) < Number(editSubTotal || 0), [editCashInput, editSubTotal])

  const batDauSuaDon = (order) => {
    setEditingOrderId(order.ma_don_hang)
    setEditDraft(taoDraftTuDon(order))
    setEditCashInput(Number(order.tong_tien || 0))
  }

  const huySuaDon = () => {
    setEditingOrderId('')
    setEditDraft(null)
    setEditCashInput(0)
  }

  const capNhatDongMon = (index, key, value) => {
    setEditDraft((prev) => {
      if (!prev) return prev
      const nextItems = prev.items.map((item, i) => {
        if (i !== index) return item

        if (key === 'ma_san_pham') {
          const productId = Number(value) || 0
          const matched = (inventoryState?.items || []).find((row) => Number(row.ma_san_pham) === productId)
          return {
            ...item,
            ma_san_pham: productId,
            ten_san_pham: normalizeViText(matched?.name || item.ten_san_pham || ''),
            gia_ban: Number(matched?.price || item.gia_ban || 0),
          }
        }

        if (key === 'so_luong') {
          return { ...item, so_luong: Math.max(1, Number(value) || 1) }
        }

        return { ...item, [key]: value }
      })

      return { ...prev, items: nextItems }
    })
  }

  const themDongMon = () => {
    const first = (inventoryState?.items || [])[0]
    if (!first) return
    setEditDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            ma_san_pham: Number(first.ma_san_pham),
            ten_san_pham: normalizeViText(first.name || ''),
            so_luong: 1,
            gia_ban: Number(first.price || 0),
          },
        ],
      }
    })
  }

  const xoaDongMon = (index) => {
    setEditDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }
    })
  }

  const luuSuaDon = async (order) => {
    if (!editDraft) return

    if (!editDraft.items.length) {
      window.alert('Don hang phai co it nhat 1 mon.')
      return
    }

    const payloadItems = editDraft.items
      .map((item) => ({
        ma_san_pham: Number(item.ma_san_pham),
        ten_san_pham: String(item.ten_san_pham || '').trim(),
        so_luong: Number(item.so_luong || 0),
        gia_ban: Number(item.gia_ban || 0),
      }))
      .filter((item) => item.ma_san_pham > 0 && item.ten_san_pham && item.so_luong > 0 && item.gia_ban >= 0)

    if (!payloadItems.length) {
      window.alert('Danh sach mon khong hop le.')
      return
    }

    if (order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' && editCashInsufficient) {
      window.alert('Tien khach dua chua du de cap nhat don.')
      return
    }

    try {
      await onUpdateOrder(order.ma_don_hang, {
        ten_khach_hang: editDraft.ten_khach_hang,
        ma_ban: editDraft.ma_ban,
        dia_chi_giao_hang: editDraft.dia_chi_giao_hang,
        ghi_chu: editDraft.ghi_chu,
        tien_khach_dua: order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(editCashInput || 0) : undefined,
        items: payloadItems,
      })
      huySuaDon()
    } catch (error) {
      window.alert(error?.message || 'Khong cap nhat duoc don hang')
    }
  }

  const xuLyXoaDon = async (order) => {
    if (!window.confirm(`Xoa don ${order.ma_don_hang.slice(0, 8).toUpperCase()}? Thao tac nay khong the hoan tac.`)) {
      return
    }

    try {
      await onDeleteOrder(order.ma_don_hang, 'Staff xoa don nhap sai')
      if (editingOrderId === order.ma_don_hang) {
        huySuaDon()
      }
    } catch (error) {
      window.alert(error?.message || 'Khong xoa duoc don hang')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Luồng đơn hàng</h2>
        <span>Dữ liệu thật từ hệ thống</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <div className="cash-box" style={{ margin: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Đơn hoàn thành</p>
          <strong>{financeSummary.completedCount}</strong>
        </div>
        <div className="cash-box" style={{ margin: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Doanh thu hoàn thành</p>
          <strong>{fmtMoney(financeSummary.tongDoanhThu)}</strong>
        </div>
        <div className="cash-box" style={{ margin: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Tiền mặt thu vào</p>
          <strong>{fmtMoney(financeSummary.tienMatThuVao)}</strong>
        </div>
        <div className="cash-box" style={{ margin: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Tiền thối khách</p>
          <strong>{fmtMoney(financeSummary.tienThoi)}</strong>
        </div>
        <div className="cash-box" style={{ margin: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Tiền mặt thực thu</p>
          <strong>{fmtMoney(financeSummary.tienMatThucThu)}</strong>
        </div>
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

          <div className="ofb-filter-group">
            <span className="ofb-group-label">Lọc theo ngày/tháng</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
              <label>
                <span style={{ display: 'block', fontSize: '0.76rem', color: '#8b6b55', marginBottom: '0.2rem' }}>Theo ngày</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value)
                    if (e.target.value) setFilterMonth('')
                  }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '0.76rem', color: '#8b6b55', marginBottom: '0.2rem' }}>Theo tháng</span>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value)
                    if (e.target.value) setFilterDate('')
                  }}
                />
              </label>
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
              <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={updatingOrderId === order.ma_don_hang || !coTheSuaDon(order)}
                  title={!coTheSuaDon(order) ? lyDoKhongSuaDon(order) : ''}
                  onClick={() => batDauSuaDon(order)}
                >
                  Sửa đơn
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={updatingOrderId === order.ma_don_hang || !coTheXoaDon(order)}
                  title={!coTheXoaDon(order) ? lyDoKhongXoaDon(order) : ''}
                  onClick={() => xuLyXoaDon(order)}
                >
                  Xóa đơn
                </button>
              </div>
              {!coTheSuaDon(order) || !coTheXoaDon(order) ? (
                <p style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: '#8d6f59' }}>
                  {!coTheSuaDon(order) ? `${lyDoKhongSuaDon(order)}. ` : ''}
                  {!coTheXoaDon(order) ? `${lyDoKhongXoaDon(order)}.` : ''}
                </p>
              ) : null}
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
                {layDanhSachTrangThaiCoTheChon(order.trang_thai_don_hang).map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              <span>{new Date(order.ngay_tao).toLocaleString('vi-VN')}</span>
            </div>

            {editingOrderId === order.ma_don_hang && editDraft ? (
              <div style={{ gridColumn: '1 / -1', marginTop: '0.75rem', borderTop: '1px dashed #ead7c8', paddingTop: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  <label>
                    <span style={{ fontSize: '0.78rem', color: '#866955' }}>Tên khách</span>
                    <input
                      value={editDraft.ten_khach_hang}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, ten_khach_hang: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: '0.78rem', color: '#866955' }}>Mã bàn</span>
                    <input
                      value={editDraft.ma_ban}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, ma_ban: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: '0.78rem', color: '#866955' }}>Địa chỉ giao hàng</span>
                    <input
                      value={editDraft.dia_chi_giao_hang}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, dia_chi_giao_hang: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: '0.78rem', color: '#866955' }}>Ghi chú</span>
                    <input
                      value={editDraft.ghi_chu}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, ghi_chu: e.target.value }))}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  {editDraft.items.map((line, index) => (
                    <div key={`${line.ma_san_pham}-${index}`} className="pos-row">
                      <select
                        value={line.ma_san_pham}
                        onChange={(e) => capNhatDongMon(index, 'ma_san_pham', e.target.value)}
                      >
                        {(inventoryState?.items || []).map((menuItem) => (
                          <option key={menuItem.ma_san_pham} value={menuItem.ma_san_pham}>
                            {normalizeViText(menuItem.name)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={line.so_luong}
                        onChange={(e) => capNhatDongMon(index, 'so_luong', e.target.value)}
                      />
                      <input
                        type="number"
                        min="0"
                        value={line.gia_ban}
                        readOnly
                        disabled
                        title="Gia duoc khoa theo menu"
                      />
                      <input
                        type="number"
                        value={Number(line.gia_ban || 0) * Number(line.so_luong || 0)}
                        readOnly
                        disabled
                        title="Thanh tien dong mon"
                      />
                      <button type="button" className="secondary" onClick={() => xoaDongMon(index)}>
                        Xóa dòng
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  <div className="cash-box" style={{ margin: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Tam tinh theo mon</p>
                    <strong>{fmtMoney(editSubTotal)}</strong>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#9a7a65' }}>VAT 8% tham khao: {fmtMoney(editVat)}</p>
                  </div>
                  <div className="cash-box" style={{ margin: 0 }}>
                    <label htmlFor={`edit-cash-${order.ma_don_hang}`}>Tien khach dua</label>
                    <input
                      id={`edit-cash-${order.ma_don_hang}`}
                      type="number"
                      min="0"
                      value={editCashInput}
                      onChange={(e) => setEditCashInput(Number(e.target.value) || 0)}
                    />
                    <p className={editCashInsufficient ? 'cash-warning' : ''}>
                      {editCashInsufficient ? 'Tien khach dua chua du' : `Tien thoi: ${fmtMoney(editChange)}`}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary" onClick={themDongMon} disabled={!(inventoryState?.items || []).length}>
                    Thêm món
                  </button>
                  <button
                    type="button"
                    onClick={() => luuSuaDon(order)}
                    disabled={updatingOrderId === order.ma_don_hang || editCashInsufficient}
                  >
                    {updatingOrderId === order.ma_don_hang ? 'Đang lưu...' : 'Lưu cập nhật đơn'}
                  </button>
                  <button type="button" className="secondary" onClick={huySuaDon}>
                    Hủy
                  </button>
                </div>
              </div>
            ) : null}
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
