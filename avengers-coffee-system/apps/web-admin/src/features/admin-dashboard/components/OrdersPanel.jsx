import { useMemo, useState } from 'react'
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeOrderStatus, normalizeViText, paymentTag } from '../utils'
import {
  ShoppingBag,
  CheckCircle2,
  TrendingUp,
  Coins,
  ArrowRightLeft,
  Wallet,
  Search,
  X,
  Filter,
  Clock,
  Coffee,
  Bike,
  Layers,
  Store,
  Globe,
  XCircle,
  Edit3,
  Trash2,
  MapPin,
  Truck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Check,
  LayoutGrid,
  Calendar,
  RotateCcw
} from 'lucide-react'

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

const ORDER_TYPE_OPTIONS = [
  { id: '', label: 'Tất cả loại đơn' },
  { id: 'TAI_CHO', label: 'Tại quầy / Dùng tại chỗ' },
  { id: 'MANG_DI', label: 'Mang đi / Lấy tại quán' },
  { id: 'ONLINE', label: 'Online / Giao hàng' },
]

const STATUS_OPTIONS = [
  { id: '', label: 'Mọi trạng thái' },
  { id: 'MOI_TAO', label: 'Mới tạo' },
  { id: 'DA_XAC_NHAN', label: 'Đã xác nhận' },
  { id: 'DANG_CHUAN_BI', label: 'Đang chuẩn bị' },
  { id: 'DANG_GIAO', label: 'Đang giao' },
  { id: 'HOAN_THANH', label: 'Hoàn thành' },
  { id: 'DA_HUY', label: 'Đã hủy' },
]

const PAYMENT_OPTIONS = [
  { id: '', label: 'Mọi phương thức' },
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
    return (ordersState?.items || []).filter((order) => {
      if (searchText) {
        const q = searchText.toLowerCase()
        const inId = String(order.ma_don_hang || '').toLowerCase().includes(q)
        const inCustomer = (order.ten_khach_hang || '').toLowerCase().includes(q)
        const inCashier = (order.ten_thu_ngan || '').toLowerCase().includes(q)
        const inUserId = String(order.ma_nguoi_dung || '').toLowerCase().includes(q)
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
  }, [ordersState?.items, searchText, filterType, filterStatus, filterPayment, filterDate, filterMonth])

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
      .reduce((sum, order) => sum + Math.max(0, Number(order.tien_thoi_khach || 0)), 0)

    return {
      completedCount: completed.length,
      tongDoanhThu,
      tienMatThuVao,
      tienThoi,
      tienMatThucThu: Math.max(0, tienMatThuVao - tienThoi),
    }
  }, [filteredOrders])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageOrders = filteredOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const batDauSuaDon = (order) => {
    setEditingOrderId(order.ma_don_hang)
    setEditDraft(taoDraftTuDon(order))
    setEditCashInput(Number(order.tien_khach_dua ?? order.tong_tien ?? 0))
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

  const editSubTotal = useMemo(() => {
    if (!editDraft) return 0
    return editDraft.items.reduce((sum, item) => sum + Number(item.gia_ban || 0) * Number(item.so_luong || 0), 0)
  }, [editDraft])

  const editVat = useMemo(() => Math.round(editSubTotal * 0.08), [editSubTotal])
  const editChange = useMemo(() => Math.max(0, editCashInput - editSubTotal), [editCashInput, editSubTotal])
  const editCashInsufficient = editCashInput < editSubTotal

  const luuSuaDon = async (order) => {
    if (!editDraft || editCashInsufficient) return
    try {
      const payloadItems = editDraft.items.map((item) => ({
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        so_luong: item.so_luong,
        gia_ban: item.gia_ban,
        kich_co: item.kich_co || undefined,
        luong_da: item.luong_da || undefined,
        do_ngot: item.do_ngot || undefined,
        loai_sua: item.loai_sua || undefined,
        ghi_chu: item.ghi_chu || undefined,
        toppings: item.toppings && item.toppings.length ? item.toppings : undefined,
      }))

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
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      
      {/* HEADER TITLE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={20} color="#4f46e5" /> Quản Lý Đơn Hàng
          </h1>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>
            Theo dõi, lọc đơn hàng real-time, xử lý trạng thái và quản lý doanh thu đối soát theo ca làm việc.
          </p>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
        
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={18} color="#059669" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', display: 'block' }}>Đơn hoàn thành</span>
            <strong style={{ display: 'block', fontSize: '1.1rem', color: '#0f172a', marginTop: '0.05rem' }}>{financeSummary.completedCount}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={18} color="#4f46e5" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', display: 'block' }}>Doanh thu hoàn thành</span>
            <strong style={{ display: 'block', fontSize: '1.05rem', color: '#4f46e5', marginTop: '0.05rem' }}>{fmtMoney(financeSummary.tongDoanhThu)}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Coins size={18} color="#2563eb" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', display: 'block' }}>Tiền mặt thu vào</span>
            <strong style={{ display: 'block', fontSize: '1.05rem', color: '#2563eb', marginTop: '0.05rem' }}>{fmtMoney(financeSummary.tienMatThuVao)}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowRightLeft size={18} color="#d97706" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', display: 'block' }}>Tiền thối khách</span>
            <strong style={{ display: 'block', fontSize: '1.05rem', color: '#d97706', marginTop: '0.05rem' }}>{fmtMoney(financeSummary.tienThoi)}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} color="#16a34a" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', display: 'block' }}>Tiền mặt thực thu</span>
            <strong style={{ display: 'block', fontSize: '1.05rem', color: '#16a34a', marginTop: '0.05rem' }}>{fmtMoney(financeSummary.tienMatThucThu)}</strong>
          </div>
        </div>

      </div>

      {/* COMPACT & NEAT FILTER BAR CARD */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        
        {/* Row 1: Search & Counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.75rem', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
            <Search size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <input
              style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.8125rem', color: '#0f172a' }}
              type="text"
              placeholder="Tìm kiếm mã đơn, tên khách, số điện thoại, thu ngân..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button type="button" onClick={() => setSearchText('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}>
                <X size={14} color="#64748b" />
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.78125rem', color: '#64748b', fontWeight: '600' }}>
            {hasActiveFilter ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Khớp: <strong style={{ color: '#4f46e5' }}>{filteredOrders.length}</strong> / {(ordersState?.items || []).length} đơn</span>
                <button type="button" onClick={resetFilters} style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <RotateCcw size={12} /> Xóa bộ lọc
                </button>
              </div>
            ) : (
              <span>Tổng số: <strong style={{ color: '#0f172a' }}>{(ordersState?.items || []).length}</strong> đơn</span>
            )}
          </div>
        </div>

        {/* Row 2: Compact Dropdown Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', alignItems: 'center' }}>
          
          {/* Select: Trạng thái */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ height: '36px', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: filterStatus ? '#e0e7ff' : '#ffffff', fontSize: '0.8125rem', fontWeight: filterStatus ? '700' : '500', color: filterStatus ? '#4f46e5' : '#334155', cursor: 'pointer' }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          {/* Select: Loại đơn */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ height: '36px', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: filterType ? '#e0e7ff' : '#ffffff', fontSize: '0.8125rem', fontWeight: filterType ? '700' : '500', color: filterType ? '#4f46e5' : '#334155', cursor: 'pointer' }}
          >
            {ORDER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          {/* Select: Thanh toán */}
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            style={{ height: '36px', padding: '0 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: filterPayment ? '#e0e7ff' : '#ffffff', fontSize: '0.8125rem', fontWeight: filterPayment ? '700' : '500', color: filterPayment ? '#4f46e5' : '#334155', cursor: 'pointer' }}
          >
            {PAYMENT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          {/* Input: Ngày */}
          <input
            type="date"
            title="Lọc theo ngày"
            value={filterDate}
            onChange={(e) => {
              setFilterDate(e.target.value)
              if (e.target.value) setFilterMonth('')
            }}
            style={{ height: '36px', padding: '0 0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: filterDate ? '#e0e7ff' : '#ffffff', fontSize: '0.78125rem', color: '#0f172a' }}
          />

          {/* Input: Tháng */}
          <input
            type="month"
            title="Lọc theo tháng"
            value={filterMonth}
            onChange={(e) => {
              setFilterMonth(e.target.value)
              if (e.target.value) setFilterDate('')
            }}
            style={{ height: '36px', padding: '0 0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: filterMonth ? '#e0e7ff' : '#ffffff', fontSize: '0.78125rem', color: '#0f172a' }}
          />

        </div>

      </div>

      {/* ORDERS LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {ordersState?.loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            Đang tải danh sách đơn hàng...
          </div>
        ) : null}

        {ordersState?.error ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#dc2626', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', fontWeight: '600', fontSize: '0.84rem' }}>
            {ordersState.error}
          </div>
        ) : null}

        {!ordersState?.loading && !ordersState?.error && filteredOrders.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={32} color="#94a3b8" />
            <p style={{ margin: 0, fontWeight: '600', fontSize: '0.84rem' }}>{hasActiveFilter ? 'Không có đơn hàng nào khớp với bộ lọc.' : 'Chưa có đơn hàng để hiển thị.'}</p>
            {hasActiveFilter && (
              <button type="button" onClick={resetFilters} style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.85rem', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer' }}>
                Xóa tất cả bộ lọc
              </button>
            )}
          </div>
        ) : null}

        {pageOrders.map((order) => {
          const status = normalizeOrderStatus(order.trang_thai_don_hang)

          return (
            <article
              key={order.ma_don_hang}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '1rem 1.25rem',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Order Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.65rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', letterSpacing: '0.01em' }}>
                      #{order.ma_don_hang.slice(0, 8).toUpperCase()}
                    </strong>
                    
                    <span style={{ padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                      {getOrderTypeLabel(order.loai_don_hang)}
                    </span>

                    {['DUNG_TAI_CHO', 'TAI_CHO'].includes(order.loai_don_hang) && order.ma_ban && (
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '700', backgroundColor: '#fffbe0', color: '#b45309', border: '1px solid #fef08a', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <MapPin size={11} color="#b45309" /> Bàn {order.ma_ban}
                      </span>
                    )}

                    {order.loai_don_hang === 'GIAO_TAN_NOI' && (
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '700', backgroundColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#fff7ed' : '#e0e7ff', color: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#c2410c' : '#4338ca', border: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '1px solid #ffedd5' : '1px solid #c7d2fe', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Truck size={11} /> {order.phuong_thuc_giao_hang === 'LALAMOVE' ? 'Lalamove' : 'Shipper Nội Bộ'}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.78125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                    <span>Khách: <strong style={{ color: '#334155', fontWeight: '600' }}>{normalizeViText(order.ten_khach_hang) || order.ma_nguoi_dung}</strong></span>
                    <span>Địa chỉ: <strong style={{ color: '#334155', fontWeight: '500' }}>{normalizeViText(order.dia_chi_giao_hang) || 'Tại quán'}</strong></span>
                    <span>Thu ngân: <strong style={{ color: '#334155', fontWeight: '500' }}>{normalizeViText(order.ten_thu_ngan) || 'N/A'}</strong></span>
                  </div>
                </div>

                {/* Right side: Amount & Status Badge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                  <span style={{ fontSize: '1rem', color: '#0f172a', fontWeight: '500' }}>
                    {fmtMoney(order.tong_tien)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '0.1rem 0.45rem', borderRadius: '4px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569' }}>
                      {paymentTag(order.phuong_thuc_thanh_toan)}
                    </span>
                    <span className={`status-pill ${TONE_CLASS[status] || 'tone-new'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.55rem' }}>
                      {ORDER_STATUS_LABEL[status] || status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Actions Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                
                {/* Status Dropdown selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor={`status-${order.ma_don_hang}`} style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#475569' }}>
                    Cập nhật trạng thái:
                  </label>
                  <select
                    id={`status-${order.ma_don_hang}`}
                    value={status}
                    onChange={(e) => onUpdateStatus(order.ma_don_hang, e.target.value)}
                    disabled={updatingOrderId === order.ma_don_hang}
                    style={{ height: '32px', padding: '0 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '0.78125rem', fontWeight: '700', color: '#0f172a', cursor: 'pointer' }}
                  >
                    {layDanhSachTrangThaiCoTheChon(status, order.loai_don_hang).map((st) => (
                      <option key={st} value={st}>
                        {ORDER_STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={12} color="#94a3b8" />
                    {new Date(order.ngay_tao).toLocaleString('vi-VN')}
                  </span>
                </div>

                {/* Direct Action Quick Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  
                  {/* Edit button */}
                  <button
                    type="button"
                    disabled={updatingOrderId === order.ma_don_hang || !coTheSuaDon(order)}
                    title={!coTheSuaDon(order) ? lyDoKhongSuaDon(order) : ''}
                    onClick={() => batDauSuaDon(order)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      height: '32px',
                      padding: '0 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: coTheSuaDon(order) ? 'pointer' : 'not-allowed',
                      opacity: coTheSuaDon(order) ? 1 : 0.4
                    }}
                  >
                    <Edit3 size={13} color="#2563eb" /> Sửa đơn
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    disabled={updatingOrderId === order.ma_don_hang || !coTheXoaDon(order)}
                    title={!coTheXoaDon(order) ? lyDoKhongXoaDon(order) : ''}
                    onClick={() => xuLyXoaDon(order)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      height: '32px',
                      padding: '0 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #fecaca',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: coTheXoaDon(order) ? 'pointer' : 'not-allowed',
                      opacity: coTheXoaDon(order) ? 1 : 0.4
                    }}
                  >
                    <Trash2 size={13} color="#dc2626" /> Xóa đơn
                  </button>

                  {/* Bàn giao Shipper button */}
                  {order.loai_don_hang === 'GIAO_TAN_NOI' && ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI'].includes(status) && (
                    <button
                      type="button"
                      disabled={updatingOrderId === order.ma_don_hang}
                      onClick={() => onUpdateStatus(order.ma_don_hang, 'DANG_GIAO')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        height: '32px',
                        padding: '0 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                      }}
                    >
                      <Bike size={14} color="#ffffff" /> Bàn giao Shipper
                    </button>
                  )}

                  {/* Hoàn thành button */}
                  {['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'].includes(order.loai_don_hang) && ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO'].includes(status) && (
                    <button
                      type="button"
                      disabled={updatingOrderId === order.ma_don_hang}
                      onClick={() => onUpdateStatus(order.ma_don_hang, 'HOAN_THANH')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        height: '32px',
                        padding: '0 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(5,150,105,0.2)'
                      }}
                    >
                      <CheckCircle2 size={14} color="#ffffff" /> Đã phục vụ / Giao khách
                    </button>
                  )}

                </div>
              </div>

              {/* Edit Form Draft (if active) */}
              {editingOrderId === order.ma_don_hang && editDraft ? (
                <div style={{ marginTop: '0.5rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>Tên khách hàng</label>
                      <input
                        type="text"
                        style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a' }}
                        value={editDraft.ten_khach_hang}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, ten_khach_hang: e.target.value }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>Mã bàn</label>
                      <input
                        type="text"
                        style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a' }}
                        value={editDraft.ma_ban}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, ma_ban: e.target.value }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>Địa chỉ giao hàng</label>
                      <input
                        type="text"
                        style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a' }}
                        value={editDraft.dia_chi_giao_hang}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, dia_chi_giao_hang: e.target.value }))}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>Ghi chú đơn</label>
                      <input
                        type="text"
                        style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a' }}
                        value={editDraft.ghi_chu}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, ghi_chu: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Items edit list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {editDraft.items.map((line, index) => {
                      const matchedMenu = (inventoryState?.items || []).find(m => m.ma_san_pham === line.ma_san_pham);
                      return (
                        <div key={`${line.ma_san_pham}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <select
                              value={line.ma_san_pham}
                              onChange={(e) => capNhatDongMon(index, 'ma_san_pham', e.target.value)}
                              style={{ flex: 2, height: '34px', padding: '0 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78125rem', fontWeight: '600' }}
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
                              style={{ width: '65px', height: '34px', padding: '0 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78125rem', fontWeight: '600' }}
                              placeholder="SL"
                            />

                            <input
                              type="number"
                              min="0"
                              value={line.gia_ban}
                              onChange={(e) => capNhatDongMon(index, 'gia_ban', e.target.value)}
                              style={{ width: '100px', height: '34px', padding: '0 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78125rem', fontWeight: '600' }}
                              title="Giá bán"
                            />

                            <input
                              type="number"
                              value={Number(line.gia_ban || 0) * Number(line.so_luong || 0)}
                              readOnly
                              disabled
                              style={{ width: '100px', height: '34px', padding: '0 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#e2e8f0', fontSize: '0.78125rem', fontWeight: '700', color: '#0f172a' }}
                            />

                            <button type="button" onClick={() => xoaDongMon(index)} style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', height: '34px', padding: '0 0.65rem', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '0.75rem' }}>
                              Xóa
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {matchedMenu?.sizes && Object.keys(matchedMenu.sizes).length > 0 ? (
                              <select value={line.kich_co || ''} onChange={(e) => capNhatDongMon(index, 'kich_co', e.target.value)} style={{ height: '30px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}>
                                <option value="">Size...</option>
                                {Object.keys(matchedMenu.sizes).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <input type="text" placeholder="Size" value={line.kich_co || ''} onChange={(e) => capNhatDongMon(index, 'kich_co', e.target.value)} style={{ height: '30px', width: '65px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                            )}
                            
                            {matchedMenu?.luong_da && Object.keys(matchedMenu.luong_da).length > 0 ? (
                              <select value={line.luong_da || ''} onChange={(e) => capNhatDongMon(index, 'luong_da', e.target.value)} style={{ height: '30px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}>
                                <option value="">Đá...</option>
                                {Object.keys(matchedMenu.luong_da).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <input type="text" placeholder="Đá (50%)" value={line.luong_da || ''} onChange={(e) => capNhatDongMon(index, 'luong_da', e.target.value)} style={{ height: '30px', width: '75px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                            )}

                            {matchedMenu?.do_ngot && Object.keys(matchedMenu.do_ngot).length > 0 ? (
                              <select value={line.do_ngot || ''} onChange={(e) => capNhatDongMon(index, 'do_ngot', e.target.value)} style={{ height: '30px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}>
                                <option value="">Ngọt...</option>
                                {Object.keys(matchedMenu.do_ngot).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <input type="text" placeholder="Ngọt (50%)" value={line.do_ngot || ''} onChange={(e) => capNhatDongMon(index, 'do_ngot', e.target.value)} style={{ height: '30px', width: '75px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                            )}

                            <input type="text" placeholder="Ghi chú món" value={line.ghi_chu || ''} onChange={(e) => capNhatDongMon(index, 'ghi_chu', e.target.value)} style={{ height: '30px', flex: 1, minWidth: '110px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary & Cash Input Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>TẠM TÍNH THEO MÓN</span>
                      <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a', marginTop: '0.1rem' }}>{fmtMoney(editSubTotal)}</strong>
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>VAT 8% tham khảo: {fmtMoney(editVat)}</span>
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e2e8f0' }}>
                      <label htmlFor={`edit-cash-${order.ma_don_hang}`} style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block' }}>Tiền khách đưa (VNĐ)</label>
                      <input
                        id={`edit-cash-${order.ma_don_hang}`}
                        type="number"
                        min="0"
                        style={{ height: '32px', width: '100%', padding: '0 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: '700', marginTop: '0.2rem' }}
                        value={editCashInput}
                        onChange={(e) => setEditCashInput(Number(e.target.value) || 0)}
                      />
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.72rem', fontWeight: '700', color: editCashInsufficient ? '#dc2626' : '#059669' }}>
                        {editCashInsufficient ? '⚠️ Tiền khách đưa chưa đủ' : `Tiền thối khách: ${fmtMoney(editChange)}`}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                    <button type="button" onClick={themDongMon} disabled={!(inventoryState?.items || []).length} style={{ backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', height: '34px', padding: '0 0.85rem', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '0.78125rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Plus size={14} /> Thêm món
                    </button>

                    <button type="button" onClick={huySuaDon} style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', height: '34px', padding: '0 0.85rem', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '0.78125rem' }}>
                      Hủy bỏ
                    </button>

                    <button
                      type="button"
                      className="btn-save-green"
                      onClick={() => luuSuaDon(order)}
                      disabled={updatingOrderId === order.ma_don_hang || editCashInsufficient}
                      style={{ height: '34px', padding: '0 1.1rem', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.78125rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Check size={15} color="#ffffff" />
                      <span>{updatingOrderId === order.ma_don_hang ? 'Đang lưu...' : 'Lưu Cập Nhật Đơn'}</span>
                    </button>
                  </div>
                </div>
              ) : null}

            </article>
          )
        })}
      </div>

      {/* PAGINATION FOOTER */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '0.78125rem', color: '#64748b', paddingTop: '0.75rem', marginTop: '0.35rem', borderTop: '1px solid #f1f5f9' }}>
          <span>Hiển thị <strong>{(safePage - 1) * PAGE_SIZE + 1} - {Math.min(safePage * PAGE_SIZE, filteredOrders.length)}</strong> trên tổng số <strong>{filteredOrders.length}</strong> đơn hàng</span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button type="button" className="admin-pg-btn" onClick={() => setPage(1)} disabled={safePage <= 1} title="Trang đầu">
              <ChevronsLeft size={16} />
            </button>
            <button type="button" className="admin-pg-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} title="Trang trước">
              <ChevronLeft size={16} />
            </button>
            <span style={{ margin: '0 0.5rem', fontWeight: '700', color: '#334155', fontSize: '0.78125rem' }}>Trang {safePage} / {totalPages}</span>
            <button type="button" className="admin-pg-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} title="Trang sau">
              <ChevronRight size={16} />
            </button>
            <button type="button" className="admin-pg-btn" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} title="Trang cuối">
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}

    </section>
  )
}
