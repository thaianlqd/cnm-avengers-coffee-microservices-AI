import { useMemo, useState } from 'react'
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeOrderStatus, normalizeViText, paymentTag } from '../utils'

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

function layDanhSachTrangThaiCoTheChon(currentStatus, loaiDonHang) {
  if (!currentStatus) return ORDER_STATUSES
  if (currentStatus === 'DA_HUY') return ['DA_HUY']

  const currentIndex = ORDER_FLOW.indexOf(currentStatus)
  if (currentIndex < 0) return [currentStatus]

  const transitions = STATUS_TRANSITIONS[currentStatus] || []
  let possible = [currentStatus, ...transitions]
  
  if (['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'].includes(loaiDonHang)) {
    possible = possible.filter(s => s !== 'DANG_GIAO');
  }

  return possible;
}

function getOrderTypeLabel(loai) {
  if (loai === 'TAI_CHO' || loai === 'DUNG_TAI_CHO') return 'Tại quầy / Dùng tại chỗ'
  if (loai === 'MANG_DI' || loai === 'LAY_TAI_QUAN') return 'Lấy tại quán / Mang đi'
  if (loai === 'GIAO_TAN_NOI') return 'Giao tận nơi'
  return 'Online'
}

function coTheSuaDon(order) {
  return normalizeOrderStatus(order.trang_thai_don_hang) === 'MOI_TAO' && order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
}

function coTheXoaDon(order) {
  return ['MOI_TAO', 'DA_HUY'].includes(normalizeOrderStatus(order.trang_thai_don_hang))
}

function lyDoKhongSuaDon(order) {
  if (normalizeOrderStatus(order.trang_thai_don_hang) !== 'MOI_TAO') {
    return 'Đơn không còn ở trạng thái Mới tạo'
  }
  if (order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
    return 'Hiện chỉ cho sửa đơn COD'
  }
  return ''
}

function lyDoKhongXoaDon(order) {
  if (!['MOI_TAO', 'DA_HUY'].includes(normalizeOrderStatus(order.trang_thai_don_hang))) {
    return 'Chỉ xóa được đơn Mới tạo hoặc Đã hủy'
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
      kich_co: line.kich_co || '',
      luong_da: line.luong_da || '',
      do_ngot: line.do_ngot || '',
      loai_sua: line.loai_sua || '',
      ghi_chu: line.ghi_chu || '',
      toppings: line.toppings ? [...line.toppings] : [],
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
        const inUserId = (order.ma_nguoi_dung || '').toLowerCase().includes(q)
        if (!inId && !inCustomer && !inCashier && !inUserId) return false
      }
      if (filterType) {
        const loai = order.loai_don_hang
        if (filterType === 'ONLINE') {
          return !['TAI_CHO', 'MANG_DI', 'LAY_TAI_QUAN', 'DUNG_TAI_CHO'].includes(loai)
        }
        if (filterType === 'TAI_CHO') {
          return ['TAI_CHO', 'DUNG_TAI_CHO'].includes(loai)
        }
        if (filterType === 'MANG_DI') {
          return ['MANG_DI', 'LAY_TAI_QUAN'].includes(loai)
        }
        return loai === filterType;
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
            kich_co: '',
            luong_da: '',
            do_ngot: '',
            loai_sua: '',
            toppings: [],
          }
        }

        const updatedItem = { ...item, [key]: value };

        // Recalculate price if size, toppings, or milk type changes
        if (['kich_co', 'toppings', 'loai_sua'].includes(key)) {
          const matched = (inventoryState?.items || []).find((row) => Number(row.ma_san_pham) === item.ma_san_pham)
          if (matched) {
            let newPrice = Number(matched.price || 0)
            if (updatedItem.kich_co && matched.sizes && matched.sizes[updatedItem.kich_co]) {
              newPrice = Number(matched.sizes[updatedItem.kich_co])
            }
            if (updatedItem.loai_sua && matched.loai_sua && matched.loai_sua[updatedItem.loai_sua]) {
              newPrice += Number(matched.loai_sua[updatedItem.loai_sua])
            }
            if (updatedItem.toppings && updatedItem.toppings.length > 0 && matched.toppings) {
              updatedItem.toppings.forEach(t => {
                if (matched.toppings[t]) newPrice += Number(matched.toppings[t])
              })
            }
            updatedItem.gia_ban = newPrice
          }
        }

        if (key === 'so_luong') {
          return { ...updatedItem, so_luong: Math.max(1, Number(value) || 1) }
        }

        return updatedItem
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
      window.alert('Đơn hàng phải có ít nhất 1 món.')
      return
    }

    const payloadItems = editDraft.items
      .map((item) => ({
        ma_san_pham: Number(item.ma_san_pham),
        ten_san_pham: String(item.ten_san_pham || '').trim(),
        so_luong: Number(item.so_luong || 0),
        gia_ban: Number(item.gia_ban || 0),
        kich_co: item.kich_co || undefined,
        luong_da: item.luong_da || undefined,
        do_ngot: item.do_ngot || undefined,
        loai_sua: item.loai_sua || undefined,
        ghi_chu: item.ghi_chu || undefined,
        toppings: item.toppings && item.toppings.length > 0 ? item.toppings : undefined,
      }))
      .filter((item) => item.ma_san_pham > 0 && item.ten_san_pham && item.so_luong > 0 && item.gia_ban >= 0)

    if (!payloadItems.length) {
      window.alert('Danh sách món không hợp lệ.')
      return
    }

    if (order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' && editCashInsufficient) {
      window.alert('Tiền khách đưa chưa đủ để cập nhật đơn.')
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
      window.alert(error?.message || 'Không cập nhật được đơn hàng')
    }
  }

  const xuLyXoaDon = async (order) => {
    if (!window.confirm(`Xóa đơn ${order.ma_don_hang.slice(0, 8).toUpperCase()}? Thao tác này không thể hoàn tác.`)) {
      return
    }

    try {
      await onDeleteOrder(order.ma_don_hang, 'Staff xóa đơn nhập sai')
      if (editingOrderId === order.ma_don_hang) {
        huySuaDon()
      }
    } catch (error) {
      window.alert(error?.message || 'Không xóa được đơn hàng')
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
      <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: '#8a6750' }}>
        Tiền mặt thực thu = tiền khách đưa - tiền thối khách. Phần này đã được trừ trước khi tính đối soát cuối ca.
      </p>

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
          <article key={order.ma_don_hang} className={`order-card ${STAGE_CLASS[normalizeOrderStatus(order.trang_thai_don_hang)] || ''}`}>
            <div>
              <h3>{order.ma_don_hang.slice(0, 8).toUpperCase()}</h3>
              <p>Khách: {normalizeViText(order.ten_khach_hang) || order.ma_nguoi_dung}</p>
              <p className="order-card-addr">{normalizeViText(order.dia_chi_giao_hang) || 'Tại quán'}</p>
              <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="order-type-badge">
                  {getOrderTypeLabel(order.loai_don_hang)}
                </span>
                {['DUNG_TAI_CHO', 'TAI_CHO'].includes(order.loai_don_hang) && order.ma_ban && (
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px',
                    border: '1px solid #991b1b',
                    color: '#7f1d1d',
                    backgroundColor: '#fef2f2'
                  }}>
                    📍 Bàn {order.ma_ban}
                  </span>
                )}
                {order.loai_don_hang === 'GIAO_TAN_NOI' && (
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px',
                    border: '1px solid',
                    color: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#c2410c' : '#4338ca',
                    backgroundColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#fff7ed' : '#e0e7ff',
                    borderColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#ffedd5' : '#c7d2fe'
                  }}>
                    {order.phuong_thuc_giao_hang === 'LALAMOVE' ? '🚀 Lalamove' : '🛵 Shipper Nội Bộ'}
                  </span>
                )}
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
                {/* Bàn giao cho Shipper (Chỉ Giao tận nơi) */}
                {order.loai_don_hang === 'GIAO_TAN_NOI' && ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI'].includes(normalizeOrderStatus(order.trang_thai_don_hang)) && (
                  <button
                    type="button"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    disabled={updatingOrderId === order.ma_don_hang}
                    onClick={() => onUpdateStatus(order.ma_don_hang, 'DANG_GIAO')}
                    title="Xác nhận bàn giao đơn này cho Shipper"
                  >
                    🚴 Bàn giao Shipper
                  </button>
                )}
                {/* Nút Hoàn Thành (Cho đơn Dùng tại chỗ / Lấy tại quán) */}
                {['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'].includes(order.loai_don_hang) && ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO'].includes(normalizeOrderStatus(order.trang_thai_don_hang)) && (
                  <button
                    type="button"
                    style={{
                      background: 'linear-gradient(135deg, #059669, #047857)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    disabled={updatingOrderId === order.ma_don_hang}
                    onClick={() => onUpdateStatus(order.ma_don_hang, 'HOAN_THANH')}
                    title="Xác nhận đã phục vụ / giao cho khách"
                  >
                    ✅ Đã phục vụ / Giao khách
                  </button>
                )}
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
                <span className={`status-pill ${TONE_CLASS[normalizeOrderStatus(order.trang_thai_don_hang)] || 'tone-new'}`}>
                  {ORDER_STATUS_LABEL[normalizeOrderStatus(order.trang_thai_don_hang)] || order.trang_thai_don_hang}
                </span>
              </p>
              <p className="order-cashier">Thu ngân: {normalizeViText(order.ten_thu_ngan) || 'N/A'}</p>
            </div>
            <div className="status-update-box">
              <label htmlFor={`status-${order.ma_don_hang}`}>Trạng thái đơn</label>
              <select
                id={`status-${order.ma_don_hang}`}
                value={normalizeOrderStatus(order.trang_thai_don_hang)}
                onChange={(e) => onUpdateStatus(order.ma_don_hang, e.target.value)}
                disabled={updatingOrderId === order.ma_don_hang}
              >
                {layDanhSachTrangThaiCoTheChon(normalizeOrderStatus(order.trang_thai_don_hang), order.loai_don_hang).map((status) => (
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
                  {editDraft.items.map((line, index) => {
                    const matchedMenu = (inventoryState?.items || []).find(m => m.ma_san_pham === line.ma_san_pham);
                    return (
                    <div key={`${line.ma_san_pham}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                      <div className="pos-row">
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
                          onChange={(e) => capNhatDongMon(index, 'gia_ban', e.target.value)}
                          title="Giá bán"
                        />
                        <input
                          type="number"
                          value={Number(line.gia_ban || 0) * Number(line.so_luong || 0)}
                          readOnly
                          disabled
                          title="Thanh tien dong mon"
                        />
                        <button type="button" className="secondary" onClick={() => xoaDongMon(index)}>
                          Xóa
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {matchedMenu?.sizes && Object.keys(matchedMenu.sizes).length > 0 ? (
                          <select value={line.kich_co || ''} onChange={(e) => capNhatDongMon(index, 'kich_co', e.target.value)} style={{ width: '80px', fontSize: '0.75rem', padding: '0.35rem' }}>
                            <option value="">Size...</option>
                            {Object.keys(matchedMenu.sizes).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input type="text" placeholder="Size" value={line.kich_co || ''} onChange={(e) => capNhatDongMon(index, 'kich_co', e.target.value)} style={{ width: '60px', fontSize: '0.75rem', padding: '0.35rem' }} />
                        )}
                        
                        {matchedMenu?.luong_da && Object.keys(matchedMenu.luong_da).length > 0 ? (
                          <select value={line.luong_da || ''} onChange={(e) => capNhatDongMon(index, 'luong_da', e.target.value)} style={{ width: '90px', fontSize: '0.75rem', padding: '0.35rem' }}>
                            <option value="">Đá...</option>
                            {Object.keys(matchedMenu.luong_da).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input type="text" placeholder="Đá (VD: 50%)" value={line.luong_da || ''} onChange={(e) => capNhatDongMon(index, 'luong_da', e.target.value)} style={{ width: '90px', fontSize: '0.75rem', padding: '0.35rem' }} />
                        )}

                        {matchedMenu?.do_ngot && Object.keys(matchedMenu.do_ngot).length > 0 ? (
                          <select value={line.do_ngot || ''} onChange={(e) => capNhatDongMon(index, 'do_ngot', e.target.value)} style={{ width: '90px', fontSize: '0.75rem', padding: '0.35rem' }}>
                            <option value="">Ngọt...</option>
                            {Object.keys(matchedMenu.do_ngot).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input type="text" placeholder="Ngọt (VD: 50%)" value={line.do_ngot || ''} onChange={(e) => capNhatDongMon(index, 'do_ngot', e.target.value)} style={{ width: '90px', fontSize: '0.75rem', padding: '0.35rem' }} />
                        )}

                        {matchedMenu?.loai_sua && Object.keys(matchedMenu.loai_sua).length > 0 ? (
                          <select value={line.loai_sua || ''} onChange={(e) => capNhatDongMon(index, 'loai_sua', e.target.value)} style={{ width: '90px', fontSize: '0.75rem', padding: '0.35rem' }}>
                            <option value="">Sữa...</option>
                            {Object.keys(matchedMenu.loai_sua).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : null}

                        {matchedMenu?.toppings && Object.keys(matchedMenu.toppings).length > 0 ? (
                           <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', flex: 1, border: '1px solid #d1d5db', padding: '0.3rem', borderRadius: '4px' }}>
                             {Object.keys(matchedMenu.toppings).map(t => (
                               <label key={t} style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem', background: '#f3f4f6', padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer' }}>
                                 <input type="checkbox" checked={(line.toppings || []).includes(t)} onChange={(e) => {
                                   const current = new Set(line.toppings || []);
                                   if (e.target.checked) current.add(t);
                                   else current.delete(t);
                                   capNhatDongMon(index, 'toppings', Array.from(current));
                                 }} /> {t}
                               </label>
                             ))}
                           </div>
                        ) : (
                          <input type="text" placeholder="Topping (phân cách bằng dấu phẩy)" value={(line.toppings || []).join(', ')} onChange={(e) => capNhatDongMon(index, 'toppings', e.target.value ? e.target.value.split(',').map(s=>s.trim()).filter(Boolean) : [])} style={{ flex: 1, minWidth: '150px', fontSize: '0.75rem', padding: '0.35rem' }} />
                        )}

                        <input type="text" placeholder="Ghi chú" value={line.ghi_chu || ''} onChange={(e) => capNhatDongMon(index, 'ghi_chu', e.target.value)} style={{ flex: 1, minWidth: '120px', fontSize: '0.75rem', padding: '0.35rem' }} />
                      </div>
                    </div>
                  )})}
                </div>

                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  <div className="cash-box" style={{ margin: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#866955' }}>Tạm tính theo món</p>
                    <strong>{fmtMoney(editSubTotal)}</strong>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#9a7a65' }}>VAT 8% tham khảo: {fmtMoney(editVat)}</p>
                  </div>
                  <div className="cash-box" style={{ margin: 0 }}>
                    <label htmlFor={`edit-cash-${order.ma_don_hang}`}>Tiền khách đưa</label>
                    <input
                      id={`edit-cash-${order.ma_don_hang}`}
                      type="number"
                      min="0"
                      value={editCashInput}
                      onChange={(e) => setEditCashInput(Number(e.target.value) || 0)}
                    />
                    <p className={editCashInsufficient ? 'cash-warning' : ''}>
                      {editCashInsufficient ? 'Tiền khách đưa chưa đủ' : `Tiền thối: ${fmtMoney(editChange)}`}
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
