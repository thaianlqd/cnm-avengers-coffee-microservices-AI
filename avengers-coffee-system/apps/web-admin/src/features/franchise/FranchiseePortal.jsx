import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  UserPlus,
  Calendar,
  CalendarDays,
  CalendarCheck,
  Clock,
  ShieldCheck,
  Key,
  Trash2,
  Edit3,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  PlayCircle,
  XCircle,
  ArrowRight,
  Search,
  Filter,
  Sparkles,
  DollarSign,
  TrendingUp,
  User,
  UserCheck,
  Store,
  Check,
  X,
  RefreshCw,
  Eye,
  Coffee,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sliders,
  Receipt,
  FileText,
  CreditCard,
  Package,
  Phone,
  Mail,
  Plus,
  RotateCcw,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react'
import { PosRefundVoidModal } from '../staff-dashboard/features_thaian/PosRefundVoidModal'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#fee2e2', color: '#991b1b', minHeight: '100vh' }}>
          <h2>Đã xảy ra lỗi giao diện</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

import { API_BASE_URL } from '../admin-dashboard/constants'

const fmtMoney = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ'
const getCategoryName = (c) => {
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.ten_danh_muc || c.ten_danh_muc_cha || 'Khác';
};

const getComboPerks = (combo) => {
  const name = (combo.ten_combo || '').toLowerCase();
  const price = combo.gia_ban || 0;
  let perks = [];
  
  if (name.includes('lưu động') || price < 50000000) {
    perks = [
      '☕ Máy pha cafe 1 Group + Máy xay hạt',
      '📦 10kg Cafe hạt rang mộc (100% Robusta/Arabica)',
      '👕 2 Bộ đồng phục nhân viên Avengers',
      '📚 Khóa đào tạo pha chế chuẩn (3 ngày)',
      '🛠️ Xe lưu động & Dụng cụ pha chế cơ bản'
    ];
  } else if (name.includes('container') || price > 150000000) {
    perks = [
      '☕ Máy pha cafe cao cấp 2 Group + 2 Máy xay',
      '📦 50kg Cafe hạt & Đầy đủ bộ nguyên liệu',
      '👕 6 Bộ đồng phục + Bảng tên nhân viên',
      '📚 Đào tạo chuyên sâu tận nơi (7 ngày)',
      '❄️ Tủ lạnh lớn, Máy lạnh & Nội thất hoàn chỉnh',
      '🖥️ Hệ thống POS & Két sắt tự động',
      '🎉 Gói Marketing Khai Trương (Banner, Loa, Bóng bay)',
      '🌟 Đặc quyền VIP: Hỗ trợ vận hành tháng đầu tiên'
    ];
  } else {
    perks = [
      '☕ Máy pha cafe 2 Group + Máy xay tự động',
      '📦 20kg Cafe hạt & Combo nguyên liệu pha chế',
      '👕 4 Bộ đồng phục nhân viên',
      '📚 Khóa đào tạo & quản lý vận hành (5 ngày)',
      '❄️ Tủ lạnh & Bảng hiệu LED vẫy',
      '🖥️ Phần mềm quản lý POS & Quẹt thẻ'
    ];
  }
  
  if (combo.mo_ta && combo.mo_ta.length > 20) {
    perks.unshift(`📝 ${combo.mo_ta}`);
  }
  return perks;
}

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
  } catch (e) {
    return '—';
  }
};

// ─── Modal Component ───────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 28, minWidth: 480, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
      </div>
      {children}
    </div>
  </div>
)

const apiFetch = async (path, opts = {}) => {
  const session = JSON.parse(localStorage.getItem('adminSession') || '{}')
  const token = session?.token || session?.accessToken
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Lỗi ${res.status}`)
  }
  return res.json()
}

const KIOSK_PACKAGES = {
  'XE_LUU_DONG': {
    assets: [
      { name: 'Xe đẩy / xe máy cải tiến có mái che', price: 12000000 },
      { name: 'Máy pha cà phê phin chuẩn thương hiệu', price: 2000000 },
      { name: 'Dụng cụ pha chế & ly in logo', price: 1500000 },
      { name: 'Training 2 ngày & Hỗ trợ tuyến đường', price: 1000000 }
    ],
    comboName: 'Combo Nguyên Liệu Đầu Kỳ',
    comboPrice: 3500000
  },
  'KIOSK_CO_DINH': {
    assets: [
      { name: 'Quầy kiosk thiết kế chuẩn thương hiệu', price: 25000000 },
      { name: 'Máy pha espresso bán tự động', price: 15000000 },
      { name: 'Bộ dụng cụ pha chế hoàn chỉnh', price: 3000000 },
      { name: 'Chi phí thi công, setup & training', price: 1500000 }
    ],
    comboName: 'Combo Nguyên Liệu Đầu Kỳ',
    comboPrice: 5500000
  },
  'CONTAINER_CAFE': {
    assets: [
      { name: 'Container 20ft, Nội thất & Decor', price: 40000000 },
      { name: 'Máy espresso chuyên nghiệp + máy xay', price: 25000000 },
      { name: 'Bộ phần mềm POS & thiết bị', price: 2500000 }
    ],
    comboName: 'Combo Nguyên Liệu Đầu Kỳ',
    comboPrice: 7500000
  }
};

const POS_PERMISSIONS_LIST = [
  { id: 'pos_allow_order', label: 'Tạo đơn bán hàng POS', desc: 'Cho phép nhân viên thao tác chọn món và in đơn tại quầy POS' },
  { id: 'pos_allow_cancel', label: 'Hủy đơn / Hủy món', desc: 'Cho phép nhân viên hủy đơn hoặc hủy món khi có sự cố' },
  { id: 'pos_allow_discount', label: 'Áp dụng mã giảm giá / Chiết khấu', desc: 'Cho phép áp dụng voucher giảm giá hoặc chiết khấu đơn hàng' },
  { id: 'pos_allow_open_close_shift', label: 'Mở ca & Chốt ca kiểm tiền', desc: 'Cho phép nhân viên mở ca đầu ngày và kiểm đếm chốt ca cuối ngày' },
  { id: 'pos_allow_view_report', label: 'Xem báo cáo doanh thu ca', desc: 'Xem số liệu doanh thu và số lượng đơn hàng bán trong ca' },
];

const SHIFT_TEMPLATES = [
  {
    id: 'SANG',
    name: 'Ca Sáng',
    label: 'Ca Sáng (06:00 - 12:00)',
    time: '06:00 - 12:00',
    start: '06:00',
    end: '12:00',
    icon: Sun,
    bg: '#fffdf5',
    headerBg: '#fef3c7',
    text: '#92400e',
    border: '#fde68a',
    accent: '#d97706',
    pillBg: '#fef3c7',
  },
  {
    id: 'CHIEU',
    name: 'Ca Chiều',
    label: 'Ca Chiều (12:00 - 18:00)',
    time: '12:00 - 18:00',
    start: '12:00',
    end: '18:00',
    icon: Sunset,
    bg: '#f0f9ff',
    headerBg: '#e0f2fe',
    text: '#0369a1',
    border: '#bae6fd',
    accent: '#0284c7',
    pillBg: '#e0f2fe',
  },
  {
    id: 'TOI',
    name: 'Ca Tối',
    label: 'Ca Tối (18:00 - 23:00)',
    time: '18:00 - 23:00',
    start: '18:00',
    end: '23:00',
    icon: Moon,
    bg: '#faf5ff',
    headerBg: '#f3e8ff',
    text: '#6b21a8',
    border: '#e9d5ff',
    accent: '#7c3aed',
    pillBg: '#f3e8ff',
  },
];

const ATTENDANCE_STATUS_CONFIG = {
  ASSIGNED: {
    label: 'Chờ nhận ca',
    bg: '#f8fafc',
    text: '#475569',
    border: '#cbd5e1',
    dot: '#94a3b8',
    icon: Clock,
  },
  PRESENT: {
    label: 'Đúng giờ',
    bg: '#ecfdf5',
    text: '#047857',
    border: '#a7f3d0',
    dot: '#10b981',
    icon: CheckCircle2,
  },
  LATE: {
    label: 'Đi muộn',
    bg: '#fffbeb',
    text: '#b45309',
    border: '#fde68a',
    dot: '#f59e0b',
    icon: AlertTriangle,
  },
  ABSENT: {
    label: 'Vắng mặt',
    bg: '#fef2f2',
    text: '#dc2626',
    border: '#fecaca',
    dot: '#ef4444',
    icon: XCircle,
  },
};

const getStaffInitials = (name) => {
  if (!name) return 'NV';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function FranchiseePortal({ session, onLogout }) {
  const userName =
    session?.user?.ho_ten || session?.user?.hoTen ||
    session?.user?.ten_dang_nhap || session?.user?.tenDangNhap || 'Franchisee'

  const [tab, setTab] = useState('dashboard')
  const [kiosks, setKiosks] = useState([])
  const [combos, setCombos] = useState([])
  const [dons, setDons] = useState([])
  const [congNos, setCongNos] = useState([])
  const [royalties, setRoyalties] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [orderForm, setOrderForm] = useState({ kiosk_id: '', combo_id: '', so_luong: 1, phuong_thuc_thanh_toan: 'CONG_NO' })
  const [ordering, setOrdering] = useState(false)

  // ★ KIOSK CONTEXT
  const [activeKioskId, setActiveKioskId] = useState('')

  // ─── 5.1: Sub-staff Management States (Thành An) ───
  const [subStaffList, setSubStaffList] = useState([])
  const [subStaffLoading, setSubStaffLoading] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffKioskFilter, setStaffKioskFilter] = useState('')
  const [showCreateStaffModal, setShowCreateStaffModal] = useState(false)
  const [showEditStaffModal, setShowEditStaffModal] = useState(false)
  const [showResetPwdModal, setShowResetPwdModal] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [staffForm, setStaffForm] = useState({
    ten_dang_nhap: '',
    mat_khau: '',
    ho_ten: '',
    email: '',
    so_dien_thoai: '',
    kiosk_id: '',
    pos_permissions: ['pos_allow_order', 'pos_allow_open_close_shift', 'pos_allow_view_report'],
    trang_thai: 'ACTIVE',
  })
  const [resetPwdInput, setResetPwdInput] = useState('')
  const [staffSubmitting, setStaffSubmitting] = useState(false)

  // ─── 5.2: Work Shift Scheduling States ───
  const [workShifts, setWorkShifts] = useState([])
  const [workShiftsLoading, setWorkShiftsLoading] = useState(false)
  const [shiftRequests, setShiftRequests] = useState([])
  const [shiftRequestsLoading, setShiftRequestsLoading] = useState(false)
  const [showShiftRequestsModal, setShowShiftRequestsModal] = useState(false)
  const [approvingRequestId, setApprovingRequestId] = useState('')
  const [shiftRequestTabFilter, setShiftRequestTabFilter] = useState('PENDING')
  const [weekOffset, setWeekOffset] = useState(0)
  const [showCreateShiftModal, setShowCreateShiftModal] = useState(false)
  const [shiftScheduleForm, setShiftScheduleForm] = useState({
    staff_username: '',
    staff_name: '',
    shift_date: new Date().toISOString().split('T')[0],
    shift_code: 'SANG',
    note: '',
  })
  const [shiftScheduleSubmitting, setShiftScheduleSubmitting] = useState(false)

  // ─── 5.3: Kiosk Live Shift Sessions & Constraints ───
  const [activeKioskShift, setActiveKioskShift] = useState(null)
  const [activeKioskShiftLoading, setActiveKioskShiftLoading] = useState(false)
  const [kioskShiftHistory, setKioskShiftHistory] = useState([])
  const [kioskShiftHistoryLoading, setKioskShiftHistoryLoading] = useState(false)
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [showForceCloseModal, setShowForceCloseModal] = useState(false)
  const [openShiftForm, setOpenShiftForm] = useState({ staff_username: '', staff_name: '', cash_open: 500000, note: '' })
  const [closeShiftForm, setCloseShiftForm] = useState({ cash_close: 0, note: '' })
  const [forceCloseReason, setForceCloseReason] = useState('Bàn giao ca / Ca trước quên chốt ca')
  const [shiftActionSubmitting, setShiftActionSubmitting] = useState(false)

  // Menu & POS states
  const [menuItems, setMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuCategory, setMenuCategory] = useState('')
  const [menuPage, setMenuPage] = useState(1)
  const itemsPerPage = 12
  const [posCart, setPosCart] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedToppings, setSelectedToppings] = useState([])
  const [posPayment, setPosPayment] = useState('TIEN_MAT')
  const [posSubmitting, setPosSubmitting] = useState(false)
  const [posOrderResult, setPosOrderResult] = useState(null)
  const [posCashInput, setPosCashInput] = useState('')

  // POS Orders state & Refund/Void states (Thành An)
  const [posOrders, setPosOrders] = useState([])
  const [posOrderLoading, setPosOrderLoading] = useState(false)
  const [posDateFilter, setPosDateFilter] = useState('today')
  const [voidModalOrder, setVoidModalOrder] = useState(null)
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [voidSubmitting, setVoidSubmitting] = useState(false)

  // Payment states
  const [showPayment, setShowPayment] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null);

  // Scoring Modal
  const [scoringCriteriaModal, setScoringCriteriaModal] = useState(false);

  const handleNapTien = () => setWalletBalance(prev => prev + 100000000);

  const handleThanhToan = async () => {
    if (!selectedDebt || walletBalance < Number(selectedDebt.so_tien)) return;
    setPaymentProcessing(true);
    await new Promise(r => setTimeout(r, 1500));
    setWalletBalance(prev => prev - Number(selectedDebt.so_tien));
    try {
      const res = await apiFetch(`/franchise/cong-no/${selectedDebt.id}/thanh-toan-vi`, { method: 'PATCH' });
      setMsg({ type: 'success', text: res.message });
      loadAll();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setPaymentProcessing(false);
      setShowPayment(false);
      setSelectedDebt(null);
    }
  };

  const kiosksRef = React.useRef(kiosks)
  kiosksRef.current = kiosks
  const activeKioskIdRef = React.useRef(activeKioskId)
  activeKioskIdRef.current = activeKioskId

  const loadAll = async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      const [k, c, d, cn, r] = await Promise.all([
        apiFetch('/franchise/kiosk/cua-toi'),
        apiFetch('/franchise/combo'),
        apiFetch('/franchise/don-mua-combo/cua-toi'),
        apiFetch('/franchise/cong-no/cua-toi'),
        apiFetch('/franchise/royalty/cua-toi'),
      ])
      setKiosks(k || [])
      setCombos(c || [])
      setDons(d || [])
      setCongNos(cn || [])
      setRoyalties(r || [])
      if (k && k.length > 0) {
        setActiveKioskId(prev => {
          if (prev && k.some(kk => kk.id === prev)) return prev
          const defaultKiosk = k.find(kk => kk.trang_thai === 'DANG_HOAT_DONG') || k[0]
          return defaultKiosk.id
        })
        setOrderForm(f => ({ ...f, kiosk_id: f.kiosk_id || k[0].id }))
      }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }

  // ─── 5.1: Staff API handlers ───
  const loadStaffList = async () => {
    setSubStaffLoading(true)
    try {
      const data = await apiFetch(`/franchise/staff${staffKioskFilter ? `?kiosk_id=${staffKioskFilter}` : ''}`)
      setSubStaffList(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setSubStaffList([])
    } finally {
      setSubStaffLoading(false)
    }
  }

  const handleCreateStaff = async (e) => {
    e.preventDefault()
    if (!staffForm.ten_dang_nhap || !staffForm.mat_khau || !staffForm.ho_ten) {
      setMsg({ type: 'error', text: 'Vui lòng nhập tên đăng nhập, mật khẩu và họ tên nhân viên!' })
      return
    }
    setStaffSubmitting(true)
    try {
      const res = await apiFetch('/franchise/staff', {
        method: 'POST',
        body: JSON.stringify({
          ...staffForm,
          kiosk_id: staffForm.kiosk_id || activeKioskId,
        })
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Tạo nhân viên con thành công!'}` })
      setShowCreateStaffModal(false)
      setStaffForm({
        ten_dang_nhap: '',
        mat_khau: '',
        ho_ten: '',
        email: '',
        so_dien_thoai: '',
        kiosk_id: '',
        pos_permissions: ['pos_allow_order', 'pos_allow_open_close_shift', 'pos_allow_view_report'],
        trang_thai: 'ACTIVE',
      })
      loadStaffList()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setStaffSubmitting(false)
    }
  }

  const handleUpdateStaff = async (e) => {
    e.preventDefault()
    if (!selectedStaff) return
    setStaffSubmitting(true)
    try {
      const res = await apiFetch(`/franchise/staff/${selectedStaff.ma_nguoi_dung}`, {
        method: 'PATCH',
        body: JSON.stringify(staffForm)
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Cập nhật nhân viên thành công!'}` })
      setShowEditStaffModal(false)
      setSelectedStaff(null)
      loadStaffList()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setStaffSubmitting(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!selectedStaff || !resetPwdInput) return
    setStaffSubmitting(true)
    try {
      const res = await apiFetch(`/franchise/staff/${selectedStaff.ma_nguoi_dung}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ mat_khau_moi: resetPwdInput })
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Đã đặt lại mật khẩu nhân viên thành công!'}` })
      setShowResetPwdModal(false)
      setSelectedStaff(null)
      setResetPwdInput('')
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setStaffSubmitting(false)
    }
  }

  const handleDeleteStaff = async (staff) => {
    if (!window.confirm(`Bạn có chắc chắn muốn vô hiệu hóa tài khoản nhân viên "${staff.ho_ten}" (${staff.ten_dang_nhap})?`)) return
    try {
      const res = await apiFetch(`/franchise/staff/${staff.ma_nguoi_dung}`, { method: 'DELETE' })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Đã vô hiệu hóa nhân viên thành công!'}` })
      loadStaffList()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  // ─── 5.2: Work Shift Scheduling Handlers ───
  const currentWeekDays = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay() || 7 // Monday is 1, Sunday is 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDay + 1 + (weekOffset * 7))
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({
        label: dayNames[i],
        date: d,
        dateKey: dateKey,
        isToday: new Date().toISOString().split('T')[0] === dateKey,
      })
    }
    return days
  }, [weekOffset])

  const loadShiftRequests = async (customKioskId) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk?.ma_kiosk) return
    setShiftRequestsLoading(true)
    try {
      const res = await apiFetch(`/manager/work-shifts/requests?branch_code=${kiosk.ma_kiosk}`)
      setShiftRequests(res?.items || [])
    } catch (e) {
      console.error(e)
      setShiftRequests([])
    } finally {
      setShiftRequestsLoading(false)
    }
  }

  const handleApproveShiftRequest = async (requestId) => {
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    setApprovingRequestId(requestId)
    try {
      await apiFetch(`/manager/work-shifts/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'APPROVED',
          branch_code: kiosk?.ma_kiosk,
        })
      })
      setMsg({ type: 'success', text: '✅ Đã phê duyệt ca làm việc! Ca đã được chuyển vào lịch làm chính thức của Kiosk.' })
      await Promise.all([
        loadWorkShifts(activeKioskId, weekOffset),
        loadShiftRequests(activeKioskId),
      ])
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setApprovingRequestId('')
    }
  }

  const handleRejectShiftRequest = async (requestId) => {
    const reason = window.prompt('Nhập lý do từ chối (tùy chọn):', 'Kiosk đã đủ nhân sự trong khung ca này')
    if (reason === null) return
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    setApprovingRequestId(requestId)
    try {
      await apiFetch(`/manager/work-shifts/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'REJECTED',
          review_note: reason,
          branch_code: kiosk?.ma_kiosk,
        })
      })
      setMsg({ type: 'success', text: 'Đã từ chối yêu cầu đăng ký ca.' })
      await Promise.all([
        loadWorkShifts(activeKioskId, weekOffset),
        loadShiftRequests(activeKioskId),
      ])
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setApprovingRequestId('')
    }
  }

  const handleApproveAllPending = async () => {
    const pendingList = shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING')
    if (pendingList.length === 0) return
    if (!window.confirm(`Bạn có chắc muốn duyệt tất cả ${pendingList.length} ca đăng ký của nhân viên?`)) return
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    setShiftRequestsLoading(true)
    try {
      for (const req of pendingList) {
        await apiFetch(`/manager/work-shifts/requests/${req.ma_ca_lam_viec}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'APPROVED',
            branch_code: kiosk?.ma_kiosk,
          })
        })
      }
      setMsg({ type: 'success', text: `✅ Đã duyệt thành công toàn bộ ${pendingList.length} ca đăng ký làm việc!` })
      await Promise.all([
        loadWorkShifts(activeKioskId, weekOffset),
        loadShiftRequests(activeKioskId),
      ])
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setShiftRequestsLoading(false)
    }
  }

  const loadWorkShifts = async (customKioskId, customOffset) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk?.ma_kiosk) return
    setWorkShiftsLoading(true)
    try {
      const fromDate = currentWeekDays[0].dateKey
      const toDate = currentWeekDays[6].dateKey
      const res = await apiFetch(`/manager/work-shifts?branch_code=${kiosk.ma_kiosk}&from=${fromDate}&to=${toDate}`)
      setWorkShifts(res?.items || [])
      loadShiftRequests(kId)
    } catch (e) {
      console.error(e)
      setWorkShifts([])
    } finally {
      setWorkShiftsLoading(false)
    }
  }

  const handleCreateWorkShift = async (e) => {
    e.preventDefault()
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk || !shiftScheduleForm.staff_username) {
      setMsg({ type: 'error', text: 'Vui lòng chọn nhân viên và kiosk!' })
      return
    }
    setShiftScheduleSubmitting(true)
    try {
      const matchedStaff = subStaffList.find(s => s.ten_dang_nhap === shiftScheduleForm.staff_username)
      await apiFetch('/manager/work-shifts', {
        method: 'POST',
        body: JSON.stringify({
          staff_username: shiftScheduleForm.staff_username,
          staff_name: matchedStaff?.ho_ten || shiftScheduleForm.staff_username,
          shift_date: shiftScheduleForm.shift_date,
          shift_code: shiftScheduleForm.shift_code,
          note: shiftScheduleForm.note,
          branch_code: kiosk.ma_kiosk,
        })
      })
      setMsg({ type: 'success', text: '✅ Phân ca làm việc cho nhân viên thành công!' })
      setShowCreateShiftModal(false)
      loadWorkShifts(activeKioskId, weekOffset)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setShiftScheduleSubmitting(false)
    }
  }

  const handleUpdateAttendance = async (shiftId, attendanceStatus) => {
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    try {
      await apiFetch(`/manager/work-shifts/${shiftId}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({
          attendance_status: attendanceStatus,
          branch_code: kiosk?.ma_kiosk,
        })
      })
      setMsg({ type: 'success', text: '✅ Cập nhật điểm danh ca thành công!' })
      loadWorkShifts(activeKioskId, weekOffset)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  const handleDeleteWorkShift = async (shiftId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy ca làm việc này?')) return
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    try {
      await apiFetch(`/manager/work-shifts/${shiftId}?branch_code=${kiosk?.ma_kiosk}`, { method: 'DELETE' })
      setMsg({ type: 'success', text: '✅ Đã xóa ca làm việc thành công!' })
      loadWorkShifts(activeKioskId, weekOffset)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  // ─── 5.3: Kiosk Live Shift Monitor Handlers & Constraints ───
  const loadActiveKioskShift = async (customKioskId) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk?.ma_kiosk) return
    setActiveKioskShiftLoading(true)
    try {
      const data = await apiFetch(`/staff/kiosk-shifts/active?branch_code=${kiosk.ma_kiosk}`)
      setActiveKioskShift(data)
    } catch (e) {
      console.error(e)
      setActiveKioskShift(null)
    } finally {
      setActiveKioskShiftLoading(false)
    }
  }

  const loadKioskShiftHistory = async (customKioskId) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk?.ma_kiosk) return
    setKioskShiftHistoryLoading(true)
    try {
      const data = await apiFetch(`/staff/kiosk-shifts/history?branch_code=${kiosk.ma_kiosk}&limit=20`)
      setKioskShiftHistory(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setKioskShiftHistory([])
    } finally {
      setKioskShiftHistoryLoading(false)
    }
  }

  const handleOpenKioskShift = async (e) => {
    e.preventDefault()
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk) return
    setShiftActionSubmitting(true)
    try {
      const matchedStaff = subStaffList.find(s => s.ten_dang_nhap === openShiftForm.staff_username)
      const res = await apiFetch('/staff/kiosk-shifts/open', {
        method: 'POST',
        body: JSON.stringify({
          branch_code: kiosk.ma_kiosk,
          cash_open: Number(openShiftForm.cash_open) || 0,
          staff_username: openShiftForm.staff_username || userName,
          staff_name: matchedStaff?.ho_ten || openShiftForm.staff_name || userName,
          note: openShiftForm.note,
        })
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Mở ca làm việc thành công!'}` })
      setShowOpenShiftModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setShiftActionSubmitting(false)
    }
  }

  const handleCloseKioskShift = async (e) => {
    e.preventDefault()
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk) return
    setShiftActionSubmitting(true)
    try {
      const res = await apiFetch('/staff/kiosk-shifts/close', {
        method: 'POST',
        body: JSON.stringify({
          branch_code: kiosk.ma_kiosk,
          cash_close: Number(closeShiftForm.cash_close) || 0,
          note: closeShiftForm.note,
        })
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Chốt ca làm việc thành công!'}` })
      setShowCloseShiftModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setShiftActionSubmitting(false)
    }
  }

  const handleForceCloseKioskShift = async (e) => {
    e.preventDefault()
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk) return
    if (!window.confirm(`Xác nhận cưỡng chế đóng ca trực tiếp trên Kiosk ${kiosk.ma_kiosk}?`)) return
    setShiftActionSubmitting(true)
    try {
      const res = await apiFetch('/staff/kiosk-shifts/force-close', {
        method: 'POST',
        body: JSON.stringify({
          branch_code: kiosk.ma_kiosk,
          reason: forceCloseReason,
        })
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Đã cưỡng chế đóng ca thành công!'}` })
      setShowForceCloseModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setShiftActionSubmitting(false)
    }
  }

  const loadMenu = async () => {
    setMenuLoading(true)
    try {
      const data = await fetch(`${API_BASE_URL}/menu/san-pham`).then(r => r.json())
      setMenuItems(Array.isArray(data) ? data : (data.data || []))
    } catch (e) { setMenuItems([]) }
    finally { setMenuLoading(false) }
  }

  const loadPosOrders = async (customKioskId, customFilter) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk) return
    setPosOrderLoading(true)
    try {
      const filter = customFilter || posDateFilter
      let query = `?branch_code=${kiosk.ma_kiosk}`
      const now = new Date()
      let from, to
      if (filter === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        to = new Date(from.getTime() + 24*60*60*1000 - 1)
      } else if (filter === 'week') {
        const day = now.getDay() || 7 
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1)
        to = new Date(from.getTime() + 7*24*60*60*1000 - 1)
      } else if (filter === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1)
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      } else if (filter === 'year') {
        from = new Date(now.getFullYear(), 0, 1)
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      }
      if (from && to) {
        query += `&date_from=${from.toISOString()}&date_to=${to.toISOString()}`
      }
      const data = await apiFetch(`/staff/orders${query}`)
      setPosOrders(data.orders || [])
    } catch (e) {
      console.error(e)
    } finally {
      setPosOrderLoading(false)
    }
  }

  // ─── 5.4: Hoàn tiền & Hủy đơn hàng POS cho Kiosk (Thành An) ───
  const handleRefundVoidPos = async (orderId, payload) => {
    setVoidSubmitting(true)
    try {
      const res = await apiFetch(`/staff/orders/${orderId}/refund-void`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setMsg({ type: 'success', text: `✅ ${res.message || 'Đã hoàn tiền mặt và hủy đơn hàng POS thành công!'}` })
      setShowVoidModal(false)
      setVoidModalOrder(null)
      if (posOrderResult?.ma_don === orderId) {
        setPosOrderResult(prev => prev ? { ...prev, voided: true } : null)
      }
      await Promise.all([
        loadPosOrders(activeKioskId),
        loadActiveKioskShift(activeKioskId)
      ])
    } catch (e) {
      setMsg({ type: 'error', text: `❌ ${e.message}` })
      throw e
    } finally {
      setVoidSubmitting(false)
    }
  }

  const addToCart = (item, selectedToppingsList = []) => {
    setPosCart(prev => {
      const toppingPrice = selectedToppingsList.reduce((sum, t) => sum + Number(t.price || 0), 0)
      const basePrice = Number(item.gia_ban || item.gia || 0)
      const toppingSignature = selectedToppingsList.map(t => t.name).sort().join(',')
      const cartItemId = toppingSignature ? `${item.ma_san_pham}_${toppingSignature}` : item.ma_san_pham
      const existing = prev.find(c => c.cartItemId === cartItemId)
      if (existing) {
        return prev.map(c => c.cartItemId === cartItemId ? { ...c, sl: c.sl + 1 } : c)
      }
      return [...prev, { ...item, cartItemId, sl: 1, gia_ban: basePrice + toppingPrice, selectedToppings: selectedToppingsList }]
    })
  }

  const removeFromCart = (cartItemId) => setPosCart(prev => prev.filter(c => c.cartItemId !== cartItemId))
  const updateCartQty = (cartItemId, sl) => {
    if (sl <= 0) return removeFromCart(cartItemId)
    setPosCart(prev => prev.map(c => c.cartItemId === cartItemId ? { ...c, sl } : c))
  }

  const posTotal = posCart.reduce((s, c) => s + Number(c.gia_ban || c.gia || 0) * c.sl, 0)
  const posCashNum = Number(posCashInput) || 0
  const posChange = Math.max(0, posCashNum - posTotal)
  const posCashInsufficient = posPayment === 'TIEN_MAT' && posCashNum > 0 && posCashNum < posTotal

  const submitPosOrder = async () => {
    if (!posCart.length || !activeKioskId) return
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk) return

    // ─── RÀNG BUỘC 1: Kiểm tra ca mở trước khi tạo đơn ───
    if (!activeKioskShift?.has_open_shift) {
      setMsg({
        type: 'error',
        text: `⚠️ Kiosk ${kiosk.ten_kiosk} (${kiosk.ma_kiosk}) chưa mở ca làm việc. Vui lòng mở ca trước khi thanh toán!`
      })
      setShowOpenShiftModal(true)
      return
    }

    setPosSubmitting(true)
    try {
      const body = {
        branch_code: kiosk.ma_kiosk,
        loai_don_hang: 'TAI_CHO',
        phuong_thuc_thanh_toan: posPayment === 'TIEN_MAT' ? 'THANH_TOAN_KHI_NHAN_HANG' : posPayment,
        tien_khach_dua: posPayment === 'TIEN_MAT' && posCashInput ? Number(posCashInput) : undefined,
        items: posCart.map(c => ({ 
          ma_san_pham: c.ma_san_pham,
          ten_san_pham: c.ten_san_pham || c.tenSanPham || 'Sản phẩm',
          so_luong: c.sl, 
          gia_ban: Number(c.gia_ban || c.gia || 0),
          toppings: c.selectedToppings?.length ? c.selectedToppings.map(t => t.name) : []
        }))
      }
      const data = await apiFetch('/staff/orders', { method: 'POST', body: JSON.stringify(body) })
      setPosOrderResult({ 
        success: true, 
        ma_don: data.ma_don_hang || data.id || data.data?.ma_don_hang || data.order?.ma_don_hang, 
        tong: posTotal,
        method: posPayment,
        payment_details: data.payment_details || data.paymentDetails || data.data?.payment_details,
        vnpay_url: data.vnpay_url || data.vnpayUrl || data.data?.vnpay_url || data.data?.payment_details?.vnpay_url || data.redirect_url
      })
      setPosCart([])
      setPosCashInput('')
      loadActiveKioskShift(activeKioskId)
    } catch (e) {
      setPosOrderResult({ success: false, error: e.message })
    } finally { setPosSubmitting(false) }
  }

  // 1. Initial mount load
  useEffect(() => {
    loadAll(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('vnpay') === 'success') {
      setMsg({ type: 'success', text: '✅ Thanh toán VNPay thành công!' })
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('vnpay') === 'failed') {
      setMsg({ type: 'error', text: '❌ Thanh toán VNPay thất bại hoặc bị huỷ.' })
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const datMuaCombo = async () => {
    if (!orderForm.kiosk_id || !orderForm.combo_id) { setMsg({ type: 'error', text: 'Vui lòng chọn kiosk và combo!' }); return }
    setOrdering(true)
    try {
      const res = await apiFetch('/franchise/don-mua-combo', { method: 'POST', body: JSON.stringify(orderForm) })
      if (res.vnpay_url) {
        window.location.href = res.vnpay_url
        return
      }
      setMsg({ type: 'success', text: `✅ ${res.message}` })
      setOrderForm(f => ({ ...f, combo_id: '', so_luong: 1 }))
      loadAll(false)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setOrdering(false) }
  }

  const tongCongNo = congNos.filter(c => c.trang_thai !== 'DA_THANH_TOAN').reduce((s, c) => s + Number(c.so_tien) + Number(c.phi_phat_tre_han || 0), 0)

  // ★ COMPUTED from activeKioskId context
  const activeKiosk = kiosks.find(k => k.id === activeKioskId) || kiosks[0] || null
  const congNoTheoKiosk = congNos.filter(c => !activeKioskId || c.kiosk_id === activeKioskId)
  const royaltyTheoKiosk = royalties.filter(r => !activeKioskId || r.kiosk_id === activeKioskId)
  const donTheoKiosk = dons.filter(d => !activeKioskId || d.kiosk_id === activeKioskId)
  const tongCongNoTheoKiosk = congNoTheoKiosk.filter(c => c.trang_thai !== 'DA_THANH_TOAN').reduce((s, c) => s + Number(c.so_tien) + Number(c.phi_phat_tre_han || 0), 0)

  const LOAI_KIOSK_LABEL = {
    'XE_LUU_DONG': { label: 'Xe lưu động', emoji: '🚚', color: '#0369a1', bg: '#e0f2fe' },
    'KIOSK_CO_DINH': { label: 'Kiosk cố định', emoji: '🏪', color: '#7c3aed', bg: '#ede9fe' },
    'CONTAINER_CAFE': { label: 'Container café', emoji: '📦', color: '#065f46', bg: '#d1fae5' },
  }

  const filterMenuByKiosk = (items, kType) => {
    if (!kType) return items;
    if (kType === 'XE_LUU_DONG') {
      return items.filter(m => {
        const cat = String(getCategoryName(m.danh_muc || m.danhMuc)).toLowerCase()
        return cat.includes('cà phê') || cat.includes('espresso') || cat.includes('americano') || cat.includes('trà')
      })
    }
    if (kType === 'KIOSK_CO_DINH') {
      return items.filter(m => {
        const cat = String(getCategoryName(m.danh_muc || m.danhMuc)).toLowerCase()
        return !cat.includes('pizza') && !cat.includes('bánh mặn')
      })
    }
    return items;
  }

  const availableMenu = filterMenuByKiosk(menuItems, activeKiosk?.loai_kiosk)

  const switchKiosk = (kioskId) => {
    setActiveKioskId(kioskId)
    setOrderForm(f => ({ ...f, kiosk_id: kioskId, combo_id: '' }))
    setPosCart([])
    setPosOrderResult(null)
    setMenuSearch('')
    setMenuCategory('')
    loadActiveKioskShift(kioskId)
  }

  // 2. Load tab-specific data on tab/kiosk change
  useEffect(() => {
    if (tab === 'staff_manage') {
      loadStaffList()
    } else if (tab === 'shift_schedule') {
      loadStaffList()
      loadWorkShifts(activeKioskId, weekOffset)
    } else if (tab === 'kiosk_shifts') {
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
      loadStaffList()
    } else if (tab === 'menu') {
      if (menuItems.length === 0) loadMenu()
    } else if (tab === 'pos') {
      if (menuItems.length === 0) loadMenu()
      loadActiveKioskShift(activeKioskId)
      loadStaffList()
    } else if (tab === 'pos_orders') {
      loadPosOrders(activeKioskId, posDateFilter)
      loadActiveKioskShift(activeKioskId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeKioskId, posDateFilter, weekOffset, staffKioskFilter])

  const TABS = [
    { id: 'dashboard', icon: Store, label: 'Tổng quan Kiosk' },
    { id: 'staff_manage', icon: Users, label: 'Quản lý nhân viên' },
    { id: 'shift_schedule', icon: CalendarDays, label: 'Phân ca làm việc' },
    { id: 'kiosk_shifts', icon: Clock, label: 'Ca trực & Chốt ca' },
    { id: 'pos', icon: Coffee, label: 'POS Bán Hàng' },
    { id: 'pos_orders', icon: Receipt, label: 'Đơn bán hàng' },
    { id: 'menu', icon: FileText, label: 'Thực đơn' },
    { id: 'order', icon: Package, label: 'Đặt Combo' },
    { id: 'history', icon: FileText, label: 'Lịch sử nhập' },
    { id: 'debt', icon: CreditCard, label: 'Công nợ' },
    { id: 'royalty', icon: TrendingUp, label: 'Royalty' },
  ]

  const alertBanner = msg && (
    <div style={{
      padding: '12px 18px', borderRadius: 12, marginBottom: 16,
      background: msg.type === 'success' ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${msg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
      color: msg.type === 'success' ? '#065f46' : '#991b1b',
      fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {msg.type === 'success' ? <CheckCircle2 size={18} color="#059669" /> : <AlertTriangle size={18} color="#dc2626" />}
        <span>{msg.text}</span>
      </div>
      <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</button>
    </div>
  )

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: '"Segoe UI",Inter,system-ui,sans-serif', background: '#f8fafc' }}>
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside style={{
          width: 256, flexShrink: 0, background: 'linear-gradient(180deg, #3f1d0b, #652b0f)',
          display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'sticky', top: 0, height: '100vh',
          boxShadow: '4px 0 24px rgba(0,0,0,0.08)'
        }}>
          {/* Logo */}
          <div style={{ padding: '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(245,158,11,0.3)'
              }}>
                <Coffee size={24} color="#ffffff" />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 15, lineHeight: 1.2, letterSpacing: '0.02em' }}>Avengers Coffee</div>
                <div style={{ color: '#fcd34d', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quản Lý Nhượng Quyền</div>
              </div>
            </div>
          </div>

          {/* User info */}
          <div style={{ padding: '16px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 18, border: '1px solid rgba(255,255,255,0.2)'
              }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{userName}</div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(245,158,11,0.2)', color: '#fde68a', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em'
                }}>
                  <ShieldCheck size={12} /> FRANCHISEE ADMIN
                </div>
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            {TABS.map(t => {
              const IconComp = t.icon
              const isSelected = tab === t.id
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  border: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  fontWeight: isSelected ? 800 : 600, fontSize: 13, transition: 'all .2s',
                  background: isSelected ? 'rgba(255,255,255,0.18)' : 'transparent',
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.75)',
                  boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                }}>
                  <IconComp size={18} color={isSelected ? '#fcd34d' : 'rgba(255,255,255,0.8)'} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Logout */}
          <div style={{ padding: '16px 14px 0' }}>
            <button onClick={onLogout} style={{
              width: '100%', padding: '10px', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12, background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
              color: '#fef3c7', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background .2s'
            }}>
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* ── Main Content Area ───────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <header style={{
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0',
            padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, zIndex: 50
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                {(() => {
                  const currTab = TABS.find(t => t.id === tab)
                  if (!currTab) return null
                  const IconC = currTab.icon
                  return <><IconC size={22} color="#b45309" /> {currTab.label}</>
                })()}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                {kiosks.length} Kiosk trực thuộc • {kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').length} đang hoạt động
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {tongCongNo > 0 && (
                <div style={{
                  padding: '6px 14px', background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 99, fontSize: 12, color: '#b45309', fontWeight: 700
                }}>
                  Công nợ: {fmtMoney(tongCongNo)}
                </div>
              )}

              <button onClick={() => { loadAll(); loadActiveKioskShift(); }} style={{
                padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 10,
                background: '#fff', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'background .2s'
              }}>
                <RefreshCw size={14} /> Làm mới
              </button>
            </div>
          </header>

          {/* KIOSK CONTEXT SELECTOR BAR */}
          {tab !== 'dashboard' && kiosks.length > 0 && (
            <div style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', position: 'sticky', top: 68, zIndex: 40 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                🏪 Kiosk đang chọn:
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                {kiosks.map(k => {
                  const loai = LOAI_KIOSK_LABEL[k.loai_kiosk] || { label: k.loai_kiosk, emoji: '🏪', color: '#374151', bg: '#f1f5f9' }
                  const isActive = k.id === activeKioskId
                  return (
                    <button key={k.id} onClick={() => switchKiosk(k.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                      borderRadius: 99, border: `2px solid ${isActive ? loai.color : '#e2e8f0'}`,
                      background: isActive ? loai.bg : '#f8fafc',
                      color: isActive ? loai.color : '#64748b',
                      cursor: 'pointer', fontWeight: isActive ? 800 : 600, fontSize: 13,
                      transition: 'all .15s', boxShadow: isActive ? `0 0 0 3px ${loai.bg}` : 'none'
                    }}>
                      <span>{loai.emoji}</span>
                      <span>{k.ten_kiosk} ({k.ma_kiosk})</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: isActive ? loai.color : '#e2e8f0', color: isActive ? '#fff' : '#94a3b8', fontWeight: 800 }}>
                        {loai.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              {activeKiosk && (
                <div style={{ fontSize: 12, color: '#64748b', flexShrink: 0, fontWeight: 500 }}>
                  📍 {activeKiosk.dia_chi}, {activeKiosk.thanh_pho}
                </div>
              )}
            </div>
          )}

          {/* Tab Body */}
          <div style={{ padding: '24px 32px', flex: 1 }}>
            {alertBanner}

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#a16207' }}>
                <RefreshCw size={32} className="animate-spin" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 700, fontSize: 15 }}>Đang tải dữ liệu Kiosk...</div>
              </div>
            ) : (
              <>
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 1: TỔNG QUAN (DASHBOARD) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'dashboard' && (
                  <div>
                    {/* Hero Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 32 }}>
                      {[
                        { icon: Store, label: 'Kiosk đang hoạt động', value: kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').length + ' / ' + kiosks.length, color: '#059669', bg: '#ecfdf5' },
                        { icon: Users, label: 'Nhân sự con tại Kiosk', value: subStaffList.length || '—', color: '#2563eb', bg: '#eff6ff' },
                        { icon: Package, label: 'Tổng combo nguyên liệu', value: kiosks.reduce((s, k) => s + (k.so_combo_hien_tai || 0), 0), color: '#d97706', bg: '#fffbeb' },
                        { icon: CreditCard, label: 'Công nợ chưa thanh toán', value: fmtMoney(tongCongNo), color: tongCongNo > 0 ? '#dc2626' : '#059669', bg: tongCongNo > 0 ? '#fef2f2' : '#ecfdf5' },
                      ].map((s, i) => {
                        const IconComp = s.icon
                        return (
                          <div key={i} style={{ background: '#fff', borderRadius: 20, padding: '22px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                              <IconComp size={22} color={s.color} />
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{s.value}</div>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Kiosk list cards */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ fontWeight: 900, fontSize: 18, color: '#0f172a', margin: 0 }}>Danh Sách Kiosk Của Tôi</h3>
                      <button onClick={() => setTab('staff_manage')} style={{
                        padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10,
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                      }}>
                        <UserPlus size={16} /> Quản lý nhân viên
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
                      {kiosks.map(k => {
                        const loai = LOAI_KIOSK_LABEL[k.loai_kiosk] || { label: k.loai_kiosk, emoji: '🏪', color: '#374151', bg: '#f1f5f9' }
                        const kioskCongNo = congNos.filter(c => c.kiosk_id === k.id && c.trang_thai !== 'DA_THANH_TOAN')
                        const tongNoKiosk = kioskCongNo.reduce((s, c) => s + Number(c.so_tien), 0)
                        return (
                          <div key={k.id} style={{
                            background: '#fff', borderRadius: 20, border: `2px solid ${k.id === activeKioskId ? loai.color : '#e2e8f0'}`,
                            boxShadow: k.id === activeKioskId ? `0 0 0 4px ${loai.bg}` : '0 4px 16px rgba(0,0,0,0.04)',
                            overflow: 'hidden', transition: 'all .2s'
                          }}>
                            <div style={{ background: loai.bg, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 28 }}>{loai.emoji}</span>
                                <div>
                                  <div style={{ fontWeight: 900, fontSize: 16, color: loai.color }}>{k.ten_kiosk}</div>
                                  <div style={{ fontSize: 12, color: loai.color, opacity: 0.85, fontWeight: 600 }}>{loai.label} • {k.ma_kiosk}</div>
                                </div>
                              </div>
                              <span style={{
                                padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                background: k.trang_thai === 'DANG_HOAT_DONG' ? '#dcfce7' : '#fee2e2',
                                color: k.trang_thai === 'DANG_HOAT_DONG' ? '#059669' : '#dc2626'
                              }}>
                                {k.trang_thai === 'DANG_HOAT_DONG' ? 'Đang hoạt động' : 'Tạm dừng'}
                              </span>
                            </div>

                            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div style={{ background: '#fffbeb', borderRadius: 12, padding: '10px 14px', border: '1px solid #fde68a' }}>
                                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>COMBO NGUYÊN LIỆU</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: '#78350f', marginTop: 2 }}>{k.so_combo_hien_tai || 0}</div>
                              </div>
                              <div style={{ background: tongNoKiosk > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 12, padding: '10px 14px', border: `1px solid ${tongNoKiosk > 0 ? '#fecaca' : '#bbf7d0'}` }}>
                                <div style={{ fontSize: 11, color: tongNoKiosk > 0 ? '#991b1b' : '#166534', fontWeight: 700 }}>CÔNG NỢ</div>
                                <div style={{ fontSize: 15, fontWeight: 900, color: tongNoKiosk > 0 ? '#dc2626' : '#059669', marginTop: 2 }}>{fmtMoney(tongNoKiosk)}</div>
                              </div>
                            </div>

                            <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                                📍 {k.dia_chi}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { switchKiosk(k.id); setTab('kiosk_shifts'); }} style={{
                                  padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
                                  color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                }}>
                                  <Clock size={14} /> Ca trực
                                </button>
                                <button onClick={() => { switchKiosk(k.id); setTab('pos'); }} style={{
                                  padding: '6px 12px', borderRadius: 8, border: 'none', background: '#059669',
                                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                }}>
                                  <Coffee size={14} /> Bán hàng POS
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 2: QUẢN LÝ NHÂN VIÊN CON TẠI KIOSK (FEATURE 5.1) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'staff_manage' && (
                  <div>
                    {/* Header & Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Danh Sách Nhân Viên Con Tại Kiosk</h3>
                        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
                          Tạo tài khoản nhân viên, phân công Kiosk làm việc và phân quyền thao tác trên máy POS.
                        </p>
                      </div>
                      <button onClick={() => {
                        setStaffForm({
                          ten_dang_nhap: '',
                          mat_khau: '123456',
                          ho_ten: '',
                          email: '',
                          so_dien_thoai: '',
                          kiosk_id: activeKioskId || (kiosks[0]?.id || ''),
                          pos_permissions: ['pos_allow_order', 'pos_allow_open_close_shift', 'pos_allow_view_report'],
                          trang_thai: 'ACTIVE',
                        });
                        setShowCreateStaffModal(true);
                      }} style={{
                        padding: '12px 22px', background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', border: 'none',
                        borderRadius: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: 8, boxShadow: '0 6px 18px rgba(5,150,105,0.3)', transition: 'all .2s'
                      }}>
                        <UserPlus size={18} /> Thêm nhân viên con mới
                      </button>
                    </div>

                    {/* Filter & Search Bar */}
                    <div style={{ display: 'flex', gap: 14, marginBottom: 22, background: '#fff', padding: '14px 18px', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                        <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          type="text"
                          value={staffSearch}
                          onChange={e => setStaffSearch(e.target.value)}
                          placeholder="Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại..."
                          style={{ width: '100%', padding: '10px 14px 10px 42px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
                        />
                      </div>
                      <select
                        value={staffKioskFilter}
                        onChange={e => setStaffKioskFilter(e.target.value)}
                        style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, background: '#f8fafc', fontWeight: 600, color: '#334155', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="">🏪 Tất cả Kiosk trực thuộc</option>
                        {kiosks.map(k => (
                          <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>
                        ))}
                      </select>
                      <button onClick={loadStaffList} style={{ padding: '10px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, transition: 'background .15s' }}>
                        <RefreshCw size={14} /> Tải lại
                      </button>
                      <div style={{ padding: '6px 14px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={15} /> {subStaffList.length} nhân sự
                      </div>
                    </div>

                    {/* Staff Table */}
                    {subStaffLoading ? (
                      <div style={{ textAlign: 'center', padding: 80, color: '#64748b', fontSize: 15, background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#059669' }} />
                        <div style={{ fontWeight: 700 }}>Đang tải danh sách nhân viên con...</div>
                      </div>
                    ) : (
                      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 920 }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '22%' }}>Nhân Viên</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '14%' }}>Tài Khoản</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Liên Hệ</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Kiosk Trực Thuộc</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '24%' }}>Quyền Hạn POS</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '12%', textAlign: 'center' }}>Trạng Thái</th>
                                <th style={{ padding: '16px 20px', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', width: '16%', textAlign: 'right' }}>Hành Động</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subStaffList.filter(s => {
                                const matchKiosk = !staffKioskFilter || s.kiosk_id === staffKioskFilter || s.co_so_ma === staffKioskFilter
                                const matchSearch = !staffSearch || (s.ho_ten || '').toLowerCase().includes(staffSearch.toLowerCase()) || (s.ten_dang_nhap || '').toLowerCase().includes(staffSearch.toLowerCase()) || (s.so_dien_thoai || '').includes(staffSearch)
                                return matchKiosk && matchSearch
                              }).map(s => {
                                const perms = Array.isArray(s.pos_permissions) ? s.pos_permissions : []
                                const isActive = s.trang_thai === 'ACTIVE'
                                const kioskObj = kiosks.find(k => k.id === s.kiosk_id)
                                const kioskName = kioskObj?.ten_kiosk || s.co_so_ten || s.co_so_ma || 'Chưa gán'

                                return (
                                  <tr key={s.ma_nguoi_dung || s.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    {/* Nhân viên */}
                                    <td style={{ padding: '16px 20px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontWeight: 900, fontSize: 16, border: '2px solid #fff', boxShadow: '0 2px 8px rgba(245,158,11,0.25)'
                                        }}>
                                          {s.ho_ten?.charAt(0).toUpperCase() || 'U'}
                                        </div>
                                        <div>
                                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{s.ho_ten}</div>
                                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Tham gia: {fmtDate(s.ngay_tao)}</div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Tài khoản */}
                                    <td style={{ padding: '16px 20px' }}>
                                      <span style={{
                                        fontWeight: 800, color: '#1e293b', fontSize: 13, background: '#f1f5f9',
                                        padding: '4px 10px', borderRadius: 8, display: 'inline-block', border: '1px solid #e2e8f0'
                                      }}>
                                        @{s.ten_dang_nhap}
                                      </span>
                                    </td>

                                    {/* Liên hệ */}
                                    <td style={{ padding: '16px 20px' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', fontWeight: 600 }}>
                                          <Phone size={13} color="#64748b" />
                                          <span>{s.so_dien_thoai || '—'}</span>
                                        </div>
                                        {s.email && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                                            <Mail size={13} color="#94a3b8" />
                                            <span>{s.email}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    {/* Kiosk trực thuộc */}
                                    <td style={{ padding: '16px 20px' }}>
                                      <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                                        borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontSize: 12,
                                        fontWeight: 800, border: '1px solid #bfdbfe', maxWidth: 220, whiteSpace: 'nowrap'
                                      }}>
                                        <Store size={14} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{kioskName}</span>
                                      </div>
                                    </td>

                                    {/* Quyền hạn POS */}
                                    <td style={{ padding: '16px 20px' }}>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {perms.length === 0 ? (
                                          <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Chưa cấp quyền</span>
                                        ) : perms.length === 5 ? (
                                          <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 800, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            ⭐ Toàn quyền POS
                                          </span>
                                        ) : (
                                          perms.map(p => {
                                            const pObj = POS_PERMISSIONS_LIST.find(x => x.id === p)
                                            return (
                                              <span key={p} style={{
                                                padding: '3px 8px', borderRadius: 6, background: '#f0fdf4',
                                                color: '#15803d', fontSize: 11, fontWeight: 700, border: '1px solid #bbf7d0',
                                                whiteSpace: 'nowrap'
                                              }} title={pObj?.desc}>
                                                ✓ {pObj?.label || p}
                                              </span>
                                            )
                                          })
                                        )}
                                      </div>
                                    </td>

                                    {/* Trạng thái */}
                                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800,
                                        background: isActive ? '#ecfdf5' : '#fef2f2',
                                        color: isActive ? '#065f46' : '#991b1b',
                                        border: `1px solid ${isActive ? '#a7f3d0' : '#fecaca'}`,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#10b981' : '#ef4444' }}></span>
                                        {isActive ? 'Hoạt động' : 'Đã khóa'}
                                      </span>
                                    </td>

                                    {/* Hành động */}
                                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                        <button onClick={() => {
                                          setSelectedStaff(s);
                                          setStaffForm({
                                            ho_ten: s.ho_ten || '',
                                            email: s.email || '',
                                            so_dien_thoai: s.so_dien_thoai || '',
                                            kiosk_id: s.kiosk_id || '',
                                            pos_permissions: Array.isArray(s.pos_permissions) ? s.pos_permissions : [],
                                            trang_thai: s.trang_thai || 'ACTIVE',
                                          });
                                          setShowEditStaffModal(true);
                                        }} style={{
                                          padding: '6px 10px', background: '#eff6ff', color: '#0284c7', border: '1px solid #bae6fd',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Sửa thông tin & phân quyền POS">
                                          <Edit3 size={13} /> Sửa
                                        </button>
                                        <button onClick={() => {
                                          setSelectedStaff(s);
                                          setResetPwdInput('123456');
                                          setShowResetPwdModal(true);
                                        }} style={{
                                          padding: '6px 10px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Đặt lại mật khẩu">
                                          <Key size={13} /> Đổi MK
                                        </button>
                                        <button onClick={() => handleDeleteStaff(s)} style={{
                                          padding: '6px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Vô hiệu hóa tài khoản nhân viên">
                                          <Trash2 size={13} /> Khóa
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {subStaffList.length === 0 && (
                          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                              <Users size={28} color="#94a3b8" />
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>Chưa có tài khoản nhân viên con nào</div>
                            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, maxWidth: 400, margin: '4px auto 0' }}>Bấm nút "Thêm nhân viên con mới" ở góc trên để cấp tài khoản cho nhân viên Kiosk của bạn.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 3: PHÂN CA LÀM VIỆC (WORK SHIFT SCHEDULING) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'shift_schedule' && (
                  <div>
                    {/* ── Header Controls ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Lịch & Phân Ca Làm Việc Tại Kiosk</h3>
                          {activeKiosk && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                              borderRadius: 99, background: '#ecfdf5', border: '1px solid #a7f3d0',
                              color: '#065f46', fontSize: 12, fontWeight: 800
                            }}>
                              <Store size={14} color="#059669" />
                              <span>{activeKiosk.ten_kiosk} ({activeKiosk.ma_kiosk})</span>
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
                          Lập lịch phân công ca làm việc theo tuần cho nhân viên và theo dõi chấm công tại kiosk.
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Kiosk quick switch if multiple kiosks */}
                        {kiosks.length > 1 && (
                          <select
                            value={activeKioskId}
                            onChange={e => switchKiosk(e.target.value)}
                            style={{
                              padding: '9px 14px', borderRadius: 12, border: '1px solid #cbd5e1',
                              background: '#fff', fontSize: 13, fontWeight: 700, color: '#334155',
                              outline: 'none', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                            }}
                          >
                            {kiosks.map(k => (
                              <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>
                            ))}
                          </select>
                        )}

                        {/* Week Navigator */}
                        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 14, padding: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                          <button
                            onClick={() => setWeekOffset(w => w - 1)}
                            style={{
                              padding: '8px 12px', border: 'none', background: 'transparent',
                              cursor: 'pointer', borderRadius: 10, fontWeight: 700, fontSize: 13,
                              color: '#475569', display: 'flex', alignItems: 'center', gap: 4,
                              transition: 'background .15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <ChevronLeft size={16} /> Tuần trước
                          </button>
                          <button
                            onClick={() => setWeekOffset(0)}
                            style={{
                              padding: '8px 14px', border: weekOffset === 0 ? '1px solid #a7f3d0' : '1px solid transparent',
                              background: weekOffset === 0 ? '#ecfdf5' : 'transparent',
                              color: weekOffset === 0 ? '#047857' : '#64748b',
                              cursor: 'pointer', borderRadius: 10, fontWeight: 800, fontSize: 13,
                              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s'
                            }}
                          >
                            <Calendar size={14} />
                            <span>Tuần này ({currentWeekDays[0]?.dateKey?.split('-').slice(1).reverse().join('/')} - {currentWeekDays[6]?.dateKey?.split('-').slice(1).reverse().join('/')})</span>
                          </button>
                          <button
                            onClick={() => setWeekOffset(w => w + 1)}
                            style={{
                              padding: '8px 12px', border: 'none', background: 'transparent',
                              cursor: 'pointer', borderRadius: 10, fontWeight: 700, fontSize: 13,
                              color: '#475569', display: 'flex', alignItems: 'center', gap: 4,
                              transition: 'background .15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Tuần sau <ChevronRight size={16} />
                          </button>
                        </div>

                        {/* Reload Button */}
                        <button
                          onClick={() => loadWorkShifts(activeKioskId, weekOffset)}
                          title="Tải lại lịch phân ca"
                          style={{
                            padding: '10px', background: '#fff', border: '1px solid #cbd5e1',
                            borderRadius: 12, cursor: 'pointer', color: '#475569', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                          }}
                        >
                          <RefreshCw size={15} className={workShiftsLoading ? 'animate-spin' : ''} />
                        </button>

                        {/* Add Shift Button (Green CTA) */}
                        <button
                          onClick={() => {
                            setShiftScheduleForm({
                              staff_username: subStaffList[0]?.ten_dang_nhap || '',
                              staff_name: subStaffList[0]?.ho_ten || '',
                              shift_date: new Date().toISOString().split('T')[0],
                              shift_code: 'SANG',
                              note: '',
                            });
                            setShowCreateShiftModal(true);
                          }}
                          style={{
                            padding: '10px 18px', background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: '0 4px 14px rgba(16,185,129,0.35)', transition: 'all .2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                          <Plus size={16} /> Phân ca mới
                        </button>
                      </div>
                    </div>

                    {/* ── Pending Shift Requests Banner for Franchisee ── */}
                    {(() => {
                      const pendingList = shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING')
                      if (pendingList.length === 0) return null

                      return (
                        <div style={{
                          marginBottom: 16, padding: '12px 18px', borderRadius: 14,
                          background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                          border: '1px solid #fcd34d', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                          boxShadow: '0 4px 12px rgba(217,119,6,0.06)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: 10, background: '#fef3c7',
                              color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: '1px solid #fcd34d', flexShrink: 0
                            }}>
                              <CalendarCheck size={20} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>
                                Có {pendingList.length} yêu cầu đăng ký ca làm việc mới
                              </div>
                              <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                                Nhân viên đã gửi yêu cầu phân ca tuần kế tiếp cần duyệt
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => setShowShiftRequestsModal(true)}
                              style={{
                                padding: '7px 12px', background: '#ffffff', border: '1px solid #cbd5e1',
                                borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#475569',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'all .15s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                              onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                            >
                              <FileText size={14} /> Danh sách chờ ({pendingList.length})
                            </button>
                            <button
                              onClick={handleApproveAllPending}
                              disabled={shiftRequestsLoading}
                              style={{
                                padding: '7px 14px', background: 'linear-gradient(135deg, #10b981, #059669)',
                                border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, color: '#ffffff',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                boxShadow: '0 3px 8px rgba(16,185,129,0.3)', transition: 'all .15s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                              <Check size={14} /> Duyệt tất cả ({pendingList.length} ca)
                            </button>
                          </div>
                        </div>
                      )
                    })()}

                    {/* ── Weekly Schedule Grid ── */}
                    {workShiftsLoading ? (
                      <div style={{ textAlign: 'center', padding: 80, color: '#64748b', background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#059669' }} />
                        <div style={{ fontWeight: 700 }}>Đang tải lịch phân ca làm việc tuần...</div>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', paddingBottom: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(180px, 1fr))', gap: 12, minWidth: 1260 }}>
                          {currentWeekDays.map((day) => {
                            const dayShifts = workShifts.filter(s => s.ngay_lam_viec === day.dateKey)
                            const activeDayShifts = dayShifts.filter(s => s.trang_thai_yeu_cau !== 'REJECTED')

                            return (
                              <div key={day.dateKey} style={{
                                background: '#fff', borderRadius: 16,
                                border: day.isToday ? '2px solid #059669' : '1px solid #e2e8f0',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 560,
                                boxShadow: day.isToday ? '0 8px 24px -4px rgba(5,150,105,0.18)' : '0 2px 10px rgba(0,0,0,0.03)',
                                transition: 'all .2s'
                              }}>
                                {/* Day Header */}
                                <div style={{
                                  padding: '14px 10px',
                                  background: day.isToday ? 'linear-gradient(135deg, #064e3b, #047857)' : '#f8fafc',
                                  borderBottom: day.isToday ? 'none' : '1px solid #e2e8f0',
                                  textAlign: 'center', color: day.isToday ? '#fff' : '#0f172a'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{day.label}</span>
                                    <span style={{
                                      padding: '1px 6px', borderRadius: 6,
                                      background: day.isToday ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                                      fontSize: 10, fontWeight: 800,
                                      color: day.isToday ? '#a7f3d0' : '#475569'
                                    }}>
                                      {activeDayShifts.length} ca
                                    </span>
                                  </div>

                                  <div style={{
                                    display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 99,
                                    background: day.isToday ? '#ffffff' : '#f1f5f9',
                                    fontSize: 11, fontWeight: 800, color: day.isToday ? '#047857' : '#475569',
                                    border: day.isToday ? 'none' : '1px solid #e2e8f0'
                                  }}>
                                    {String(day.date.getDate()).padStart(2, '0')}/{String(day.date.getMonth() + 1).padStart(2, '0')}
                                  </div>

                                  {day.isToday && (
                                    <div style={{ marginTop: 4 }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        background: 'rgba(255,255,255,0.2)', padding: '2px 8px',
                                        borderRadius: 99, fontSize: 10, fontWeight: 800, color: '#a7f3d0'
                                      }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                                        Hôm nay
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Shift slots */}
                                <div style={{ padding: 10, flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowX: 'hidden', overflowY: 'auto' }}>
                                  {SHIFT_TEMPLATES.map((tmpl) => {
                                    const matchingShifts = activeDayShifts.filter(s => s.ma_khung_ca === tmpl.id)
                                    const ShiftIcon = tmpl.icon
                                    return (
                                      <div key={tmpl.id} style={{
                                        background: tmpl.bg, borderRadius: 12, padding: 10, border: `1px solid ${tmpl.border}`,
                                        display: 'flex', flexDirection: 'column', gap: 8
                                      }}>
                                        {/* Slot Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <ShiftIcon size={14} color={tmpl.accent} />
                                            <span style={{ fontWeight: 800, fontSize: 12, color: tmpl.text, letterSpacing: '0.01em' }}>
                                              {tmpl.name}
                                            </span>
                                          </div>
                                          <span style={{
                                            fontSize: 10, color: tmpl.accent, fontWeight: 700,
                                            background: 'rgba(255,255,255,0.92)', padding: '2px 6px',
                                            borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap'
                                          }}>
                                            {tmpl.start} - {tmpl.end}
                                          </span>
                                        </div>

                                        {/* Matching Shifts (Official + Pending) */}
                                        {matchingShifts.length === 0 ? (
                                          <button
                                            onClick={() => {
                                              setShiftScheduleForm({
                                                staff_username: subStaffList[0]?.ten_dang_nhap || '',
                                                staff_name: subStaffList[0]?.ho_ten || '',
                                                shift_date: day.dateKey,
                                                shift_code: tmpl.id,
                                                note: '',
                                              });
                                              setShowCreateShiftModal(true);
                                            }}
                                            style={{
                                              border: `1px dashed ${tmpl.border}`, background: 'rgba(255,255,255,0.7)',
                                              borderRadius: 8, padding: '9px 4px', color: tmpl.accent,
                                              fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                              transition: 'all .15s'
                                            }}
                                            onMouseEnter={e => {
                                              e.currentTarget.style.background = '#ffffff'
                                              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'
                                            }}
                                            onMouseLeave={e => {
                                              e.currentTarget.style.background = 'rgba(255,255,255,0.7)'
                                              e.currentTarget.style.boxShadow = 'none'
                                            }}
                                          >
                                            <Plus size={13} /> Phân ca
                                          </button>
                                        ) : (
                                          matchingShifts.map((shift) => {
                                            const isPending = shift.trang_thai_yeu_cau === 'PENDING'
                                            const attStatus = shift.trang_thai_cham_cong || 'ASSIGNED'
                                            const statusCfg = ATTENDANCE_STATUS_CONFIG[attStatus] || ATTENDANCE_STATUS_CONFIG.ASSIGNED
                                            const staffDisplay = shift.staff_name || shift.staff_username
                                            const initials = getStaffInitials(staffDisplay)

                                            // Card Ca Chờ Duyệt
                                            if (isPending) {
                                              return (
                                                <div key={shift.ma_ca_lam_viec} style={{
                                                  background: '#fffdf5', borderRadius: 10, padding: 8,
                                                  border: '1.5px dashed #f59e0b',
                                                  boxShadow: '0 2px 6px rgba(245,158,11,0.08)',
                                                  display: 'flex', flexDirection: 'column', gap: 6
                                                }}>
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{
                                                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                                                      background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                                                      display: 'inline-flex', alignItems: 'center', gap: 3
                                                    }}>
                                                      <Clock size={10} /> Chờ duyệt
                                                    </span>
                                                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>Nguyện vọng</span>
                                                  </div>

                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                    <div style={{
                                                      width: 28, height: 28, borderRadius: '50%',
                                                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                      fontSize: 11, fontWeight: 800, flexShrink: 0
                                                    }}>
                                                      {initials}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                      <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={staffDisplay}>
                                                        {staffDisplay}
                                                      </div>
                                                      <div style={{ fontSize: 10, color: '#64748b' }}>
                                                        @{shift.staff_username}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  {(shift.ghi_chu || shift.note) && (
                                                    <div style={{
                                                      fontSize: 10, color: '#92400e', background: 'rgba(254,243,199,0.5)',
                                                      padding: '3px 6px', borderRadius: 4, fontStyle: 'italic',
                                                      textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                                                    }} title={shift.ghi_chu || shift.note}>
                                                      "{shift.ghi_chu || shift.note}"
                                                    </div>
                                                  )}

                                                  {/* Action Buttons for Pending Shift */}
                                                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                    <button
                                                      onClick={() => handleApproveShiftRequest(shift.ma_ca_lam_viec)}
                                                      disabled={approvingRequestId === shift.ma_ca_lam_viec}
                                                      style={{
                                                        flex: 1, padding: '5px 8px',
                                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                                        color: '#fff', border: 'none', borderRadius: 8,
                                                        fontWeight: 800, fontSize: 11, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        gap: 3, boxShadow: '0 2px 6px rgba(16,185,129,0.25)',
                                                        transition: 'all .15s'
                                                      }}
                                                      title="Duyệt ca này thành lịch chính thức"
                                                    >
                                                      <Check size={12} /> Duyệt ca
                                                    </button>
                                                    <button
                                                      onClick={() => handleRejectShiftRequest(shift.ma_ca_lam_viec)}
                                                      disabled={approvingRequestId === shift.ma_ca_lam_viec}
                                                      style={{
                                                        padding: '5px 8px', background: '#fef2f2', color: '#dc2626',
                                                        border: '1px solid #fee2e2', borderRadius: 8,
                                                        fontWeight: 700, fontSize: 11, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        gap: 3, transition: 'all .15s'
                                                      }}
                                                      title="Từ chối yêu cầu ca"
                                                    >
                                                      <X size={12} /> Từ chối
                                                    </button>
                                                  </div>
                                                </div>
                                              )
                                            }

                                            // Card Ca Đã Duyệt / Chính Thức
                                            return (
                                              <div key={shift.ma_ca_lam_viec} style={{
                                                background: '#fff', borderRadius: 10, padding: 8, border: '1px solid #e2e8f0',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 6
                                              }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                    <div style={{
                                                      width: 28, height: 28, borderRadius: '50%',
                                                      background: 'linear-gradient(135deg, #059669, #047857)',
                                                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                      fontSize: 11, fontWeight: 800, flexShrink: 0
                                                    }}>
                                                      {initials}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                      <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={staffDisplay}>
                                                        {staffDisplay}
                                                      </div>
                                                      <div style={{ fontSize: 10, color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                        @{shift.staff_username}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <button
                                                    onClick={() => handleDeleteWorkShift(shift.ma_ca_lam_viec)}
                                                    style={{
                                                      background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626',
                                                      borderRadius: 6, cursor: 'pointer', padding: '4px', display: 'flex',
                                                      alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                                                      flexShrink: 0
                                                    }}
                                                    title="Hủy ca làm việc"
                                                    onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
                                                  >
                                                    <Trash2 size={12} />
                                                  </button>
                                                </div>

                                                {(shift.ghi_chu || shift.note) && (
                                                  <div style={{
                                                    fontSize: 10, color: '#64748b', fontStyle: 'italic',
                                                    background: '#f8fafc', padding: '3px 6px', borderRadius: 4,
                                                    textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                                                  }} title={shift.ghi_chu || shift.note}>
                                                    Ghi chú: {shift.ghi_chu || shift.note}
                                                  </div>
                                                )}

                                                {/* Attendance Selector */}
                                                <div>
                                                  <select
                                                    value={attStatus}
                                                    onChange={e => handleUpdateAttendance(shift.ma_ca_lam_viec, e.target.value)}
                                                    style={{
                                                      width: '100%', fontSize: 11, fontWeight: 800, padding: '4px 6px', borderRadius: 6,
                                                      border: `1px solid ${statusCfg.border}`,
                                                      background: statusCfg.bg,
                                                      color: statusCfg.text,
                                                      outline: 'none', cursor: 'pointer'
                                                    }}
                                                  >
                                                    <option value="ASSIGNED">Chờ nhận ca</option>
                                                    <option value="PRESENT">Đúng giờ (Có mặt)</option>
                                                    <option value="LATE">Đi muộn</option>
                                                    <option value="ABSENT">Vắng mặt</option>
                                                  </select>
                                                </div>
                                              </div>
                                            )
                                          })
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 4: CA TRỰC KIOSK & CHỐT CA (RÀNG BUỘC MỞ CA & 1 CA/KIOSK) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'kiosk_shifts' && (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Giám Sát & Quản Lý Ca Trực Kiosk</h3>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
                          Ràng buộc mở ca trực tiếp trên máy POS, kiểm soát dòng tiền đầu ca & cuối ca, ngăn trùng lặp ca.
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => { loadActiveKioskShift(); loadKioskShiftHistory(); }} style={{
                          padding: '10px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12,
                          fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}>
                          <RefreshCw size={14} /> Cập nhật số liệu
                        </button>
                      </div>
                    </div>

                    {/* LIVE ACTIVE SHIFT CARD */}
                    {activeKioskShiftLoading ? (
                      <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Đang kiểm tra trạng thái ca trực...</div>
                    ) : activeKioskShift?.has_open_shift ? (
                      <div style={{
                        background: 'linear-gradient(135deg, #064e3b, #047857)', borderRadius: 24, padding: '28px', color: '#fff',
                        boxShadow: '0 10px 30px rgba(4,120,87,0.25)', marginBottom: 32
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 800, marginBottom: 12 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                              KIOSK ĐANG TRONG CA TRỰC MỞ
                            </div>
                            <h2 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 900 }}>
                              Thu ngân: {activeKioskShift.active_shift?.staff_name || activeKioskShift.active_shift?.staff_username}
                            </h2>
                            <div style={{ fontSize: 13, opacity: 0.85 }}>
                              Tài khoản: @{activeKioskShift.active_shift?.staff_username} • Mở lúc: {fmtDate(activeKioskShift.active_shift?.thoi_gian_mo_ca)} (Đã trực {activeKioskShift.live_stats?.duration_minutes} phút)
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => {
                              setCloseShiftForm({
                                cash_close: activeKioskShift.live_stats?.expected_cash || 0,
                                note: '',
                              });
                              setShowCloseShiftModal(true);
                            }} style={{
                              padding: '12px 20px', background: '#fff', color: '#065f46', border: 'none', borderRadius: 12,
                              fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                              boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
                            }}>
                              <CheckCircle2 size={16} /> Chốt ca làm việc
                            </button>
                            <button onClick={() => setShowForceCloseModal(true)} style={{
                              padding: '12px 16px', background: 'rgba(239,68,68,0.25)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.4)',
                              borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                            }} title="Cưỡng chế đóng ca khi nhân viên trước quên chốt">
                              <ShieldAlert size={16} /> Cưỡng chế bàn giao
                            </button>
                          </div>
                        </div>

                        {/* Live Metrics Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px' }}>
                            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Tiền mặt đầu ca</div>
                            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{fmtMoney(activeKioskShift.active_shift?.tien_dau_ca)}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px' }}>
                            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Doanh thu trong ca</div>
                            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{fmtMoney(activeKioskShift.live_stats?.total_revenue)}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px' }}>
                            <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 700, textTransform: 'uppercase' }}>Số đơn bán tại quầy</div>
                            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{activeKioskShift.live_stats?.total_orders} đơn</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 800, textTransform: 'uppercase', color: '#fef08a' }}>Tiền mặt kỳ vọng trong két</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#fef08a', marginTop: 4 }}>{fmtMoney(activeKioskShift.live_stats?.expected_cash)}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: '#fff', borderRadius: 24, padding: '36px', border: '2px dashed #cbd5e1',
                        textAlign: 'center', marginBottom: 32
                      }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                          <Clock size={28} />
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Kiosk Hiện Chưa Mở Ca Làm Việc</h3>
                        <p style={{ margin: '0 auto 20px', maxWidth: 480, color: '#64748b', fontSize: 14 }}>
                          Theo quy định ràng buộc, nhân viên chỉ có thể thực hiện thao tác bán hàng trên máy POS khi Kiosk đang có ca làm việc mở. Vui lòng mở ca và kê khai tiền mặt đầu ca để bắt đầu.
                        </p>
                        <button onClick={() => {
                          setOpenShiftForm({
                            staff_username: subStaffList[0]?.ten_dang_nhap || userName,
                            staff_name: subStaffList[0]?.ho_ten || userName,
                            cash_open: 500000,
                            note: '',
                          });
                          setShowOpenShiftModal(true);
                        }} style={{
                          padding: '12px 24px', background: '#059669', color: '#fff', border: 'none',
                          borderRadius: 14, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'inline-flex',
                          alignItems: 'center', gap: 8, boxShadow: '0 6px 20px rgba(5,150,105,0.35)'
                        }}>
                          <PlayCircle size={18} /> Mở ca làm việc ngay
                        </button>
                      </div>
                    )}

                    {/* KIOSK SHIFT HISTORY */}
                    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                        Lịch Sử Ca Trực & Đối Soát Két Tiền Kiosk
                      </h4>

                      {kioskShiftHistoryLoading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Đang tải lịch sử ca...</div>
                      ) : kioskShiftHistory.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có ca trực nào được ghi nhận trên Kiosk này.</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                {['Thời Gian', 'Thu Ngân', 'Đầu Ca', 'Doanh Thu', 'Số Đơn', 'Cuối Ca Thực Tế', 'Chênh Lệch', 'Trạng Thái'].map(h => (
                                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {kioskShiftHistory.map(shift => {
                                const isForceClosed = shift.trang_thai === 'FORCE_CLOSED'
                                const isClosed = shift.trang_thai === 'CLOSED'
                                const diff = shift.chenh_lech
                                return (
                                  <tr key={shift.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '14px', fontSize: 13, color: '#1e293b' }}>
                                      <div style={{ fontWeight: 700 }}>{fmtDate(shift.thoi_gian_mo_ca)}</div>
                                      <div style={{ fontSize: 11, color: '#64748b' }}>Đóng: {shift.thoi_gian_dong_ca ? fmtDate(shift.thoi_gian_dong_ca) : 'Đang mở'}</div>
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13, color: '#0f172a', fontWeight: 700 }}>
                                      {shift.staff_name || shift.staff_username}
                                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>@{shift.staff_username}</div>
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                                      {fmtMoney(shift.tien_dau_ca)}
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13, fontWeight: 800, color: '#059669' }}>
                                      {fmtMoney(shift.doanh_thu_he_thong)}
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                      {shift.tong_don_hang} đơn
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                                      {shift.tien_cuoi_ca !== null ? fmtMoney(shift.tien_cuoi_ca) : '—'}
                                    </td>
                                    <td style={{ padding: '14px', fontSize: 13 }}>
                                      {diff === null || diff === undefined ? (
                                        <span style={{ color: '#94a3b8' }}>—</span>
                                      ) : diff === 0 ? (
                                        <span style={{ color: '#059669', fontWeight: 800 }}>✓ Khớp chuẩn 0đ</span>
                                      ) : diff > 0 ? (
                                        <span style={{ color: '#d97706', fontWeight: 800 }}>+ {fmtMoney(diff)} (Thừa)</span>
                                      ) : (
                                        <span style={{ color: '#dc2626', fontWeight: 800 }}>- {fmtMoney(Math.abs(diff))} (Thiếu)</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '14px' }}>
                                      <span style={{
                                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                        background: shift.trang_thai === 'OPEN' ? '#ecfdf5' : isForceClosed ? '#fee2e2' : '#f1f5f9',
                                        color: shift.trang_thai === 'OPEN' ? '#059669' : isForceClosed ? '#dc2626' : '#475569',
                                        border: `1px solid ${shift.trang_thai === 'OPEN' ? '#a7f3d0' : isForceClosed ? '#fecaca' : '#cbd5e1'}`
                                      }}>
                                        {shift.trang_thai === 'OPEN' ? '🟢 Đang mở' : isForceClosed ? '⚠️ Ép đóng ca' : '✓ Đã chốt ca'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 5: POS BÁN HÀNG (INTEGRATED SHIFT CONSTRAINT) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'pos' && (() => {
                  const kioskActive = activeKiosk?.trang_thai === 'DANG_HOAT_DONG'
                  if (!kioskActive) return (
                    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                      <div style={{ fontSize: 60, marginBottom: 16 }}>🔒</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>POS chưa khả dụng</div>
                      <div style={{ color: '#64748b', fontSize: 14 }}>Kiosk <b>{activeKiosk?.ten_kiosk}</b> đang ở trạng thái <b>{activeKiosk?.trang_thai}</b>. Chọn một Kiosk đang hoạt động để dùng POS.</div>
                    </div>
                  )

                  const hasOpenShift = activeKioskShift?.has_open_shift

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* SHIFT CONSTRAINT BANNER IN POS */}
                      {!hasOpenShift && (
                        <div style={{
                          background: '#fef2f2', border: '2px solid #fecaca', borderRadius: 16, padding: '16px 20px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                          boxShadow: '0 4px 16px rgba(220,38,38,0.08)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Lock size={20} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#991b1b', fontSize: 15 }}>Chức năng thanh toán POS bị khóa — Kiosk chưa mở ca làm việc</div>
                              <div style={{ color: '#b91c1c', fontSize: 13 }}>Theo ràng buộc vận hành, nhân viên cần mở ca và kê khai tiền mặt đầu ca trước khi tạo đơn bán hàng.</div>
                            </div>
                          </div>
                          <button onClick={() => {
                            setOpenShiftForm({
                              staff_username: subStaffList[0]?.ten_dang_nhap || userName,
                              staff_name: subStaffList[0]?.ho_ten || userName,
                              cash_open: 500000,
                              note: '',
                            });
                            setShowOpenShiftModal(true);
                          }} style={{
                            padding: '10px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 10,
                            fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                          }}>
                            <PlayCircle size={16} /> Mở ca bán hàng ngay
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start', height: 'calc(100vh - 160px)' }}>
                        {/* LEFT: Thực đơn chọn nhanh */}
                        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexWrap: 'nowrap', overflowX: 'auto' }}>
                            <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="🔍 Tìm sản phẩm nhanh..."
                              style={{ flexShrink: 0, width: 220, padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 14, outline: 'none', fontWeight: 600, color: '#1e293b' }} />
                            {[...new Set(availableMenu.map(m => getCategoryName(m.danh_muc || m.danhMuc)).filter(Boolean))].map(c => (
                              <button key={c} onClick={() => setMenuCategory(prev => prev === c ? '' : c)}
                                style={{ flexShrink: 0, padding: '8px 18px', borderRadius: 99, border: menuCategory === c ? 'none' : '1px solid #cbd5e1', background: menuCategory === c ? '#0f172a' : '#fff', color: menuCategory === c ? '#fff' : '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all .2s' }}>{c}</button>
                            ))}
                          </div>
                          
                          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                            {menuLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Đang tải...</div> : (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
                                {availableMenu.filter(m => {
                                  const matchSearch = !menuSearch || (m.ten_san_pham || m.tenSanPham || '').toLowerCase().includes(menuSearch.toLowerCase())
                                  const matchCat = !menuCategory || getCategoryName(m.danh_muc || m.danhMuc) === menuCategory
                                  return matchSearch && matchCat && m.trang_thai !== 'HET_HANG' && m.is_available !== false
                                }).map((m, i) => {
                                  const name = m.ten_san_pham || m.tenSanPham || 'SP'
                                  const price = Number(m.gia_ban || m.gia || 0)
                                  const img = m.hinh_anh_url || m.hinhAnhUrl || m.hinh_anh || m.hinhAnh || m.imageUrl
                                  const inCart = posCart.find(c => c.ma_san_pham === m.ma_san_pham)
                                  return (
                                    <div key={i} style={{
                                      position: 'relative',
                                      background: inCart ? '#fffbeb' : '#fff', borderRadius: 16, border: `2px solid ${inCart ? '#f59e0b' : 'transparent'}`, overflow: 'hidden',
                                      padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column',
                                      boxShadow: inCart ? '0 0 0 3px rgba(245,158,11,0.2)' : '0 4px 12px rgba(0,0,0,0.03)', transition: 'transform .1s, box-shadow .1s'
                                    }}>
                                      <div onClick={() => addToCart(m)} style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        {img ? (
                                          <div style={{ width: '100%', paddingTop: '75%', position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
                                            <img src={img} alt={name} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                          </div>
                                        ) : (
                                          <div style={{ width: '100%', paddingTop: '75%', position: 'relative', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>☕</div>
                                          </div>
                                        )}
                                        <div style={{ padding: '14px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6, lineHeight: 1.4, height: 39, overflow: 'hidden' }}>{name}</div>
                                          <div style={{ fontSize: 15, color: '#ea580c', fontWeight: 900, marginTop: 'auto' }}>{fmtMoney(price)}</div>
                                          {inCart && <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 800, marginTop: 4 }}>✓ Đã chọn ({inCart.sl})</div>}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* RIGHT: Giỏ hàng POS */}
                        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', position: 'sticky', top: 80 }}>
                          <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 900, fontSize: 16, color: '#1e293b' }}>🖥️ Đơn Hàng Tại Quầy</div>
                              {hasOpenShift ? (
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: 99 }}>
                                  ● Thu ngân: {activeKioskShift.active_shift?.staff_name}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 99 }}>
                                  ● Chưa mở ca
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Kiosk: {activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</div>
                          </div>

                          <div style={{ padding: '0 16px', maxHeight: 280, overflowY: 'auto' }}>
                            {posCart.length === 0 ? (
                              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chưa có sản phẩm nào.<br/>Bấm vào thực đơn để thêm.</div>
                            ) : posCart.map(c => (
                              <div key={c.cartItemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #f8fafc' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.ten_san_pham || c.tenSanPham}</div>
                                  <div style={{ fontSize: 12, color: '#d97706', fontWeight: 700, marginTop: 2 }}>{fmtMoney(c.gia_ban)}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <button onClick={() => updateCartQty(c.cartItemId, c.sl - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 800 }}>−</button>
                                  <span style={{ fontWeight: 800, fontSize: 14, minWidth: 22, textAlign: 'center' }}>{c.sl}</span>
                                  <button onClick={() => updateCartQty(c.cartItemId, c.sl + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 800 }}>+</button>
                                  <button onClick={() => removeFromCart(c.cartItemId)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', fontWeight: 800, marginLeft: 4 }}>×</button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ marginBottom: 12 }}>
                              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>HÌNH THỨC THANH TOÁN</label>
                              <select value={posPayment} onChange={e => setPosPayment(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                                <option value='TIEN_MAT'>💵 Tiền mặt</option>
                                <option value='CHUYEN_KHOAN'>🏦 Chuyển khoản QR</option>
                                <option value='VNPAY'>💻 VNPAY QR</option>
                              </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '12px 14px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>TỔNG CỘNG</span>
                              <span style={{ fontSize: 20, fontWeight: 900, color: '#d97706' }}>{fmtMoney(posTotal)}</span>
                            </div>

                            {posPayment === 'TIEN_MAT' && (
                              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Tiền khách đưa (VNĐ)</label>
                                <input type="number" min="0" value={posCashInput === 0 ? '' : posCashInput} onChange={e => setPosCashInput(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700, boxSizing: 'border-box' }} />
                                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: posCashInsufficient ? '#ef4444' : '#10b981' }}>
                                  {posCashInsufficient ? '⚠️ Tiền khách đưa chưa đủ' : `Tiền thối lại: ${fmtMoney(posChange)}`}
                                </div>
                              </div>
                            )}

                            {posOrderResult && (
                              <div style={{ marginBottom: 12, padding: '12px', borderRadius: 12, background: posOrderResult.success ? (posOrderResult.voided ? '#fee2e2' : '#f0fdf4') : '#fef2f2', border: `1px solid ${posOrderResult.success ? (posOrderResult.voided ? '#fecaca' : '#bbf7d0') : '#fecaca'}` }}>
                                <div style={{ color: posOrderResult.success ? (posOrderResult.voided ? '#991b1b' : '#15803d') : '#dc2626', fontWeight: 800, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                  <span>{posOrderResult.voided ? `⚠️ Đơn #${posOrderResult.ma_don} đã được hoàn tiền mặt & hủy` : (posOrderResult.success ? `✅ Đơn #${posOrderResult.ma_don} thành công!` : `❌ Lỗi: ${posOrderResult.error}`)}</span>
                                  {posOrderResult.success && !posOrderResult.voided && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVoidModalOrder({
                                          ma_don_hang: posOrderResult.ma_don,
                                          tong_tien: posOrderResult.tong,
                                          phuong_thuc_thanh_toan: posOrderResult.method,
                                          trang_thai_thanh_toan: 'DA_THANH_TOAN',
                                          trang_thai_don_hang: 'HOAN_THANH',
                                          ngay_tao: new Date().toISOString()
                                        })
                                        setShowVoidModal(true)
                                      }}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 8,
                                        border: '1px solid #fecaca',
                                        backgroundColor: '#dc2626',
                                        color: '#ffffff',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        boxShadow: '0 2px 5px rgba(220,38,38,0.25)'
                                      }}
                                    >
                                      <RotateCcw size={12} color="#fff" /> Hoàn tiền mặt &amp; Hủy đơn
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            <button onClick={submitPosOrder} disabled={posSubmitting || posCart.length === 0 || posCashInsufficient || !hasOpenShift}
                              style={{
                                width: '100%', padding: '14px', background: (!hasOpenShift || posCart.length === 0 || posCashInsufficient) ? '#cbd5e1' : '#059669',
                                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                                cursor: (!hasOpenShift || posCart.length === 0 || posCashInsufficient) ? 'not-allowed' : 'pointer',
                                boxShadow: (!hasOpenShift || !posCart.length || posCashInsufficient) ? 'none' : '0 6px 16px rgba(5,150,105,0.35)'
                              }}>
                              {posSubmitting ? '⏳ Đang tạo đơn...' : !hasOpenShift ? '🔒 Cần mở ca để bán hàng' : '🖥️ Thanh toán & In đơn'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ĐƠN BÁN HÀNG POS (pos_orders) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'pos_orders' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e293b' }}>🧾 Đơn Bán Hàng Tại Quầy Kiosk</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Thời gian:</span>
                        <select value={posDateFilter} onChange={e => setPosDateFilter(e.target.value)}
                          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff', outline: 'none', fontWeight: 600 }}>
                          <option value="today">Hôm nay</option>
                          <option value="week">Tuần này</option>
                          <option value="month">Tháng này</option>
                          <option value="all">Tất cả</option>
                        </select>
                        <button onClick={loadPosOrders} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 700, color: '#475569' }}>
                          <RefreshCw size={14} /> Tải lại
                        </button>
                      </div>
                    </div>

                    {posOrderLoading ? (
                      <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 15 }}>⏳ Đang tải dữ liệu đơn...</div>
                    ) : (
                      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {['Mã Đơn', 'Ngày tạo', 'Khách hàng', 'Tổng tiền', 'Thanh toán', 'Chi tiết món', 'Trạng thái', 'Thao tác'].map(h => (
                                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {posOrders.map((d) => {
                              const isVoided = d.trang_thai_don_hang === 'DA_HUY' || d.trang_thai_thanh_toan === 'DA_HOAN_TIEN'
                              const isShiftOpen = !!activeKioskShift?.has_open_shift
                              const shiftOpenTime = activeKioskShift?.active_shift?.thoi_gian_mo_ca ? new Date(activeKioskShift.active_shift.thoi_gian_mo_ca).getTime() : 0
                              const orderTime = new Date(d.ngay_tao).getTime()
                              const isWithinActiveShift = isShiftOpen && orderTime >= shiftOpenTime

                              return (
                                <tr key={d.ma_don_hang} style={{ borderBottom: '1px solid #f1f5f9', background: isVoided ? '#fff7f7' : 'transparent' }}>
                                  <td style={{ padding: '14px 16px', fontWeight: 800, color: isVoided ? '#94a3b8' : '#1e293b', fontSize: 13 }}>
                                    #{d.ma_don_hang.substring(0, 8).toUpperCase()}
                                  </td>
                                  <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{fmtDate(d.ngay_tao)}</td>
                                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: 13, fontWeight: 600 }}>{d.ten_khach_hang || 'Khách tại quầy'}</td>
                                  <td style={{ padding: '14px 16px', fontWeight: 900, color: isVoided ? '#94a3b8' : '#d97706', fontSize: 15, textDecoration: isVoided ? 'line-through' : 'none' }}>
                                    {fmtMoney(d.tong_tien)}
                                  </td>
                                  <td style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                    {d.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? '💵 Tiền mặt' : d.phuong_thuc_thanh_toan}
                                  </td>
                                  <td style={{ padding: '14px 16px', fontSize: 12 }}>
                                    {d.chi_tiet?.map((ct, idx) => (
                                      <div key={idx} style={{ marginBottom: 2 }}>
                                        <span style={{ fontWeight: 700, color: isVoided ? '#94a3b8' : '#334155' }}>{ct.so_luong}x {ct.ten_san_pham}</span>
                                      </div>
                                    ))}
                                  </td>
                                  <td style={{ padding: '14px 16px' }}>
                                    {isVoided ? (
                                      <span style={{
                                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                        background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: 4
                                      }}>
                                        <RotateCcw size={11} /> Đã hủy &amp; Hoàn tiền
                                      </span>
                                    ) : (
                                      <span style={{
                                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                        background: d.trang_thai_don_hang === 'HOAN_THANH' ? '#dcfce7' : '#fef9c3',
                                        color: d.trang_thai_don_hang === 'HOAN_THANH' ? '#059669' : '#d97706',
                                      }}>
                                        {d.trang_thai_don_hang === 'HOAN_THANH' ? 'Hoàn thành' : d.trang_thai_don_hang}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '14px 16px' }}>
                                    {isVoided ? (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fef2f2', padding: '4px 8px', borderRadius: 6 }}>
                                        ✓ Đã xuất quỹ hoàn trả
                                      </span>
                                    ) : isWithinActiveShift ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVoidModalOrder(d)
                                          setShowVoidModal(true)
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          border: '1.5px solid #dc2626',
                                          backgroundColor: '#dc2626',
                                          color: '#ffffff',
                                          fontWeight: 800,
                                          fontSize: 12,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        <RotateCcw size={13} color="#ffffff" />
                                        <span>Hoàn Tiền &amp; Hủy POS</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled
                                        title={!isShiftOpen ? "Kiosk chưa mở ca làm việc" : "Đơn thuộc ca làm việc trước đã chốt - Không thể hoàn/hủy"}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          border: '1px solid #cbd5e1',
                                          backgroundColor: '#f8fafc',
                                          color: '#94a3b8',
                                          fontWeight: 600,
                                          fontSize: 12,
                                          cursor: 'not-allowed',
                                          opacity: 0.5,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5
                                        }}
                                      >
                                        <RotateCcw size={13} color="#94a3b8" />
                                        <span>Hoàn Tiền &amp; Hủy POS</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {posOrders.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#a16207' }}>Chưa có đơn bán hàng nào trong thời gian này.</div>}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: THỰC ĐƠN (menu) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'menu' && (() => {
                  const filteredMenu = availableMenu.filter(m => {
                    const matchSearch = !menuSearch || (m.ten_san_pham || m.tenSanPham || '').toLowerCase().includes(menuSearch.toLowerCase())
                    const matchCat = !menuCategory || getCategoryName(m.danh_muc || m.danhMuc) === menuCategory
                    return matchSearch && matchCat
                  })
                  const categories = [...new Set(availableMenu.map(m => getCategoryName(m.danh_muc || m.danhMuc)).filter(Boolean))]
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center', background: '#fff', padding: '16px 20px', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                        <input value={menuSearch} onChange={e => { setMenuSearch(e.target.value); setMenuPage(1); }} placeholder="🔍 Tìm kiếm tên món..."
                          style={{ flex: 1, minWidth: 200, padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14, outline: 'none', background: '#f8fafc' }} />
                        <select value={menuCategory} onChange={e => { setMenuCategory(e.target.value); setMenuPage(1); }}
                          style={{ padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14, background: '#f8fafc', outline: 'none', fontWeight: 600, color: '#334155' }}>
                          <option value=''>🏷️ Tất cả danh mục</option>
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                        {filteredMenu.slice((menuPage - 1) * itemsPerPage, menuPage * itemsPerPage).map((m, i) => {
                          const name = m.ten_san_pham || m.tenSanPham || 'Sản phẩm'
                          const price = m.gia_ban || m.gia || 0
                          const img = m.hinh_anh_url || m.hinhAnhUrl || m.hinh_anh || m.hinhAnh || m.imageUrl
                          return (
                            <div key={i} style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                              {img ? (
                                <div style={{ position: 'relative', width: '100%', paddingTop: '75%' }}>
                                  <img src={img} alt={name} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                              ) : (
                                <div style={{ width: '100%', paddingTop: '75%', position: 'relative', background: 'linear-gradient(135deg, #fef3c7, #fde68a)' }}>
                                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>☕</div>
                                </div>
                              )}
                              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 4 }}>{name}</div>
                                  <div style={{ fontSize: 12, color: '#64748b' }}>{getCategoryName(m.danh_muc || m.danhMuc)}</div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                  <div style={{ fontWeight: 900, color: '#d97706', fontSize: 17 }}>{fmtMoney(price)}</div>
                                  <button onClick={() => { addToCart(m); setTab('pos'); }} style={{ padding: '6px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                    Bán tại POS →
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ĐẶT COMBO (order) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'order' && (
                  <div style={{ maxWidth: 680 }}>
                    <div style={{ background: '#fff', borderRadius: 24, padding: 32, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                      <h3 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>📦 Đặt Mua Combo Nguyên Liệu</h3>
                      
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>Kiosk nhận hàng</label>
                        <select value={orderForm.kiosk_id} onChange={e => switchKiosk(e.target.value)}
                          style={{ width: '100%', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 14, background: '#f8fafc', color: '#1e293b', fontWeight: 600, outline: 'none' }}>
                          {kiosks.map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                        </select>
                      </div>

                      <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 10, textTransform: 'uppercase' }}>Chọn gói combo</label>
                        <div style={{ display: 'grid', gap: 12 }}>
                          {combos.map(c => (
                            <div key={c.id} onClick={() => setOrderForm(f => ({ ...f, combo_id: c.id }))} style={{
                              padding: '18px', border: `2px solid ${orderForm.combo_id === c.id ? '#f59e0b' : '#e2e8f0'}`,
                              borderRadius: 16, cursor: 'pointer', background: orderForm.combo_id === c.id ? '#fffbeb' : '#fff'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>{c.ten_combo}</div>
                                  <div style={{ fontSize: 13, color: '#059669', fontWeight: 700, marginTop: 4 }}>Ước tính ~{c.so_ly_pha_che_uoc_tinh} ly</div>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#d97706' }}>{fmtMoney(c.gia_ban)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8 }}>Số lượng combo</label>
                          <input type="number" min="1" max="50" value={orderForm.so_luong}
                            onChange={e => setOrderForm(f => ({ ...f, so_luong: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 16, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8 }}>Phương thức thanh toán</label>
                          <select value={orderForm.phuong_thuc_thanh_toan}
                            onChange={e => setOrderForm(f => ({ ...f, phuong_thuc_thanh_toan: e.target.value }))}
                            style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 14, background: '#f8fafc', fontWeight: 600 }}>
                            <option value="CONG_NO">💳 Ghi nợ (Trả sau)</option>
                            <option value="VNPAY">💻 VNPAY</option>
                            <option value="VI_DIEN_TU">📱 Ví Avengers</option>
                          </select>
                        </div>
                      </div>

                      <button onClick={datMuaCombo} disabled={ordering || !orderForm.combo_id}
                        style={{
                          width: '100%', padding: '16px', background: ordering ? '#cbd5e1' : '#059669',
                          color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer',
                          boxShadow: '0 6px 20px rgba(5,150,105,0.3)'
                        }}>
                        {ordering ? '⏳ Đang xử lý...' : '✓ Xác nhận đặt mua Combo'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: LỊCH SỬ NHẬP (history) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'history' && (
                  <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.02)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          {['Combo', 'Kiosk', 'Số lượng', 'Tổng tiền', 'Thanh toán', 'Ngày đặt', 'Trạng thái'].map(h => (
                            <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {donTheoKiosk.map((d) => (
                          <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0f172a' }}>{d.combo?.ten_combo || 'Combo'}</td>
                            <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>{d.kiosk?.ten_kiosk} ({d.kiosk?.ma_kiosk})</td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'center' }}>×{d.so_luong}</td>
                            <td style={{ padding: '14px 16px', fontWeight: 900, color: '#d97706' }}>{fmtMoney(d.tong_tien)}</td>
                            <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700 }}>{d.phuong_thuc_thanh_toan}</td>
                            <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>{fmtDate(d.ngay_dat)}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: d.trang_thai === 'DA_GIAO' ? '#dcfce7' : '#fef9c3', color: d.trang_thai === 'DA_GIAO' ? '#059669' : '#d97706' }}>
                                {d.trang_thai === 'DA_GIAO' ? 'Đã giao' : d.trang_thai}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {donTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#a16207' }}>Chưa có đơn nhập combo nào.</div>}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: CÔNG NỢ (debt) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'debt' && (
                  <div style={{ maxWidth: 680 }}>
                    <div style={{ display: 'grid', gap: 16 }}>
                      {congNoTheoKiosk.map(c => (
                        <div key={c.id} style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>
                                {c.loai_phat_sinh === 'KHOI_TAO' ? '🏪 Phí nhượng quyền ban đầu' : '📦 Công nợ nguyên liệu'}
                              </div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Kiosk: {c.kiosk?.ten_kiosk} ({c.kiosk?.ma_kiosk})</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 20, fontWeight: 900, color: '#d97706' }}>{fmtMoney(c.so_tien)}</div>
                              <span style={{ display: 'inline-block', marginTop: 6, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: c.trang_thai === 'DA_THANH_TOAN' ? '#dcfce7' : '#fef2f2', color: c.trang_thai === 'DA_THANH_TOAN' ? '#059669' : '#dc2626' }}>
                                {c.trang_thai === 'DA_THANH_TOAN' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {congNoTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#059669', background: '#ecfdf5', borderRadius: 16 }}>✓ Bạn không có khoản nợ nào.</div>}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ROYALTY (royalty) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'royalty' && (
                  <div style={{ maxWidth: 680 }}>
                    <div style={{ display: 'grid', gap: 16 }}>
                      {royaltyTheoKiosk.map(r => (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 17 }}>Tháng {r.thang}</div>
                              <div style={{ fontSize: 13, color: '#64748b' }}>Kiosk: {r.kiosk?.ten_kiosk} ({r.kiosk?.ma_kiosk})</div>
                            </div>
                            <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800, background: r.trang_thai === 'DA_THANH_TOAN' ? '#dcfce7' : '#fef3c7', color: r.trang_thai === 'DA_THANH_TOAN' ? '#059669' : '#d97706' }}>
                              {r.trang_thai === 'DA_THANH_TOAN' ? 'Đã thanh toán' : 'Chờ đối soát'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>DOANH THU</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{fmtMoney(r.doanh_thu_thuc_te)}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>TỶ LỆ</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: '#d97706', marginTop: 4 }}>{r.ty_le_royalty}%</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>PHÍ PHẢI NỘP</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: '#dc2626', marginTop: 4 }}>{fmtMoney(r.so_tien_royalty)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {royaltyTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chưa có dữ liệu royalty tháng nào.</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 1: TẠO NHÂN VIÊN CON (CREATE STAFF) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showCreateStaffModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowCreateStaffModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Tạo Tài Khoản Nhân Viên Con</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Phân quyền trực tiếp cho nhân viên vận hành Kiosk</p>
                  </div>
                </div>
                <button onClick={() => setShowCreateStaffModal(false)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 800, color: '#64748b' }}>×</button>
              </div>

              <form onSubmit={handleCreateStaff} style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Họ và tên *</label>
                    <input type="text" required value={staffForm.ho_ten} onChange={e => setStaffForm(f => ({ ...f, ho_ten: e.target.value }))} placeholder="Nguyễn Văn A"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Tên đăng nhập *</label>
                    <input type="text" required value={staffForm.ten_dang_nhap} onChange={e => setStaffForm(f => ({ ...f, ten_dang_nhap: e.target.value.toLowerCase().replace(/\s+/g, '') }))} placeholder="staff_an1"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Mật khẩu khởi tạo *</label>
                    <input type="password" required value={staffForm.mat_khau} onChange={e => setStaffForm(f => ({ ...f, mat_khau: e.target.value }))} placeholder="••••••"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Kiosk phân công *</label>
                    <select value={staffForm.kiosk_id || activeKioskId} onChange={e => setStaffForm(f => ({ ...f, kiosk_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#f8fafc', fontWeight: 600, boxSizing: 'border-box' }}>
                      {kiosks.map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Số điện thoại</label>
                    <input type="tel" value={staffForm.so_dien_thoai} onChange={e => setStaffForm(f => ({ ...f, so_dien_thoai: e.target.value }))} placeholder="0901234567"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Email</label>
                    <input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@gmail.com"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Phân quyền POS chi tiết */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>Phân quyền thao tác POS</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setStaffForm(f => ({ ...f, pos_permissions: POS_PERMISSIONS_LIST.map(p => p.id) }))} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>Chọn tất cả</button>
                      <button type="button" onClick={() => setStaffForm(f => ({ ...f, pos_permissions: ['pos_allow_order'] }))} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>Chỉ bán hàng</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {POS_PERMISSIONS_LIST.map(perm => {
                      const isChecked = (staffForm.pos_permissions || []).includes(perm.id)
                      return (
                        <label key={perm.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${isChecked ? '#a7f3d0' : '#e2e8f0'}`, background: isChecked ? '#f0fdf4' : '#fff',
                          cursor: 'pointer', transition: 'all .15s'
                        }}>
                          <input type="checkbox" checked={isChecked} onChange={() => {
                            setStaffForm(f => {
                              const curr = f.pos_permissions || []
                              return {
                                ...f,
                                pos_permissions: isChecked ? curr.filter(x => x !== perm.id) : [...curr, perm.id]
                              }
                            })
                          }} style={{ marginTop: 3 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{perm.label}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{perm.desc}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowCreateStaffModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {staffSubmitting ? 'Đang lưu...' : '✓ Xác nhận tạo tài khoản'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 2: SỬA THÔNG TIN & PHÂN QUYỀN POS */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showEditStaffModal && selectedStaff && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowEditStaffModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Chỉnh Sửa Nhân Viên: @{selectedStaff.ten_dang_nhap}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Cập nhật thông tin và điều chỉnh quyền hạn POS</p>
                </div>
                <button onClick={() => setShowEditStaffModal(false)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 800, color: '#64748b' }}>×</button>
              </div>

              <form onSubmit={handleUpdateStaff} style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Họ và tên</label>
                    <input type="text" value={staffForm.ho_ten} onChange={e => setStaffForm(f => ({ ...f, ho_ten: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Trạng thái tài khoản</label>
                    <select value={staffForm.trang_thai} onChange={e => setStaffForm(f => ({ ...f, trang_thai: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f8fafc', fontWeight: 600, boxSizing: 'border-box' }}>
                      <option value="ACTIVE">Hoạt động (Active)</option>
                      <option value="INACTIVE">Khóa tài khoản (Inactive)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Số điện thoại</label>
                    <input type="tel" value={staffForm.so_dien_thoai} onChange={e => setStaffForm(f => ({ ...f, so_dien_thoai: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Kiosk trực thuộc</label>
                    <select value={staffForm.kiosk_id || ''} onChange={e => setStaffForm(f => ({ ...f, kiosk_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f8fafc', fontWeight: 600, boxSizing: 'border-box' }}>
                      {kiosks.map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                    </select>
                  </div>
                </div>

                {/* Phân quyền POS */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: 10 }}>Cấp quyền thao tác POS</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {POS_PERMISSIONS_LIST.map(perm => {
                      const isChecked = (staffForm.pos_permissions || []).includes(perm.id)
                      return (
                        <label key={perm.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${isChecked ? '#a7f3d0' : '#e2e8f0'}`, background: isChecked ? '#f0fdf4' : '#fff',
                          cursor: 'pointer'
                        }}>
                          <input type="checkbox" checked={isChecked} onChange={() => {
                            setStaffForm(f => {
                              const curr = f.pos_permissions || []
                              return {
                                ...f,
                                pos_permissions: isChecked ? curr.filter(x => x !== perm.id) : [...curr, perm.id]
                              }
                            })
                          }} style={{ marginTop: 3 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{perm.label}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{perm.desc}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowEditStaffModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {staffSubmitting ? 'Đang lưu...' : '✓ Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 3: ĐỔI MẬT KHẨU NHÂN VIÊN */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showResetPwdModal && selectedStaff && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowResetPwdModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 420, overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Đặt Lại Mật Khẩu</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Cho nhân viên: <b>@{selectedStaff.ten_dang_nhap}</b></p>
                </div>
                <button onClick={() => setShowResetPwdModal(false)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 800, color: '#64748b' }}>×</button>
              </div>

              <form onSubmit={handleResetPassword} style={{ padding: 24 }}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Mật khẩu mới *</label>
                  <input type="password" required value={resetPwdInput} onChange={e => setResetPwdInput(e.target.value)} placeholder="Nhập mật khẩu mới..."
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowResetPwdModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(217,119,6,0.3)' }}>
                    {staffSubmitting ? 'Đang lưu...' : '✓ Xác nhận đổi MK'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 4: PHÂN CA LÀM VIỆC (SCHEDULE SHIFT) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showCreateShiftModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowCreateShiftModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 520, overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                    color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CalendarDays size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Phân Ca Làm Việc Tại Kiosk</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateShiftModal(false)}
                  style={{
                    background: '#f1f5f9', border: 'none', width: 32, height: 32,
                    borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#64748b', transition: 'all .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleCreateWorkShift} style={{ padding: 24 }}>
                {/* Chọn nhân viên */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Nhân viên nhận ca *
                  </label>
                  <select
                    required
                    value={shiftScheduleForm.staff_username}
                    onChange={e => setShiftScheduleForm(f => ({ ...f, staff_username: e.target.value }))}
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 14, background: '#f8fafc', fontWeight: 600, outline: 'none',
                      boxSizing: 'border-box', cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Chọn nhân viên kiosk --</option>
                    {subStaffList.map(s => (
                      <option key={s.ma_nguoi_dung} value={s.ten_dang_nhap}>
                        {s.ho_ten} (@{s.ten_dang_nhap})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ngày làm việc */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Ngày làm việc *
                  </label>
                  <input
                    type="date"
                    required
                    value={shiftScheduleForm.shift_date}
                    onChange={e => setShiftScheduleForm(f => ({ ...f, shift_date: e.target.value }))}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Khung ca làm việc (Visual Selector Cards) */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                    Khung ca làm việc *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {SHIFT_TEMPLATES.map((tmpl) => {
                      const isSelected = shiftScheduleForm.shift_code === tmpl.id
                      const IconComp = tmpl.icon
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => setShiftScheduleForm(f => ({ ...f, shift_code: tmpl.id }))}
                          style={{
                            padding: '12px 10px', borderRadius: 12, cursor: 'pointer',
                            border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                            background: isSelected ? '#ecfdf5' : '#ffffff',
                            textAlign: 'center', transition: 'all .15s',
                            boxShadow: isSelected ? '0 4px 12px rgba(5,150,105,0.15)' : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                          }}
                        >
                          <IconComp size={20} color={isSelected ? '#059669' : tmpl.accent} />
                          <div style={{ fontWeight: 800, fontSize: 12, color: isSelected ? '#047857' : '#0f172a' }}>
                            {tmpl.name}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                            {tmpl.time}
                          </div>
                          {isSelected && (
                            <div style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 2, color: '#059669', fontSize: 10, fontWeight: 800 }}>
                              <Check size={12} /> Đã chọn
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Ghi chú ca */}
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Ghi chú ca làm (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={shiftScheduleForm.note}
                    onChange={e => setShiftScheduleForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Ví dụ: Phụ trách pha chế máy 1, chốt doanh thu ca..."
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateShiftModal(false)}
                    style={{
                      flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569',
                      border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700,
                      cursor: 'pointer', transition: 'background .15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={shiftScheduleSubmitting}
                    style={{
                      flex: 2, padding: '12px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800,
                      fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all .2s'
                    }}
                  >
                    {shiftScheduleSubmitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Xác nhận phân ca</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 4.1: DUYỆT YÊU CẦU ĐĂNG KÝ CA LÀM VIỆC */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showShiftRequestsModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowShiftRequestsModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 780, maxHeight: '85vh',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CalendarCheck size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                      Duyệt Yêu Cầu Đăng Ký Ca Làm Việc
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShiftRequestsModal(false)}
                  style={{
                    background: '#f1f5f9', border: 'none', width: 32, height: 32,
                    borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#64748b', transition: 'all .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Filter Tabs */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, background: '#f8fafc' }}>
                {[
                  { id: 'PENDING', label: 'Chờ duyệt', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length, color: '#d97706', activeBg: '#fef3c7' },
                  { id: 'APPROVED', label: 'Đã duyệt (Chính thức)', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'APPROVED').length, color: '#059669', activeBg: '#ecfdf5' },
                  { id: 'REJECTED', label: 'Đã từ chối', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'REJECTED').length, color: '#dc2626', activeBg: '#fef2f2' },
                  { id: 'ALL', label: 'Tất cả yêu cầu', count: shiftRequests.length, color: '#475569', activeBg: '#e2e8f0' },
                ].map(f => {
                  const isSel = shiftRequestTabFilter === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setShiftRequestTabFilter(f.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 99, border: isSel ? `1px solid ${f.color}` : '1px solid #e2e8f0',
                        background: isSel ? f.activeBg : '#fff', color: isSel ? f.color : '#64748b',
                        fontWeight: isSel ? 800 : 600, fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s'
                      }}
                    >
                      <span>{f.label}</span>
                      <span style={{
                        padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 800,
                        background: isSel ? f.color : '#f1f5f9', color: isSel ? '#fff' : '#64748b'
                      }}>
                        {f.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Request List Body */}
              <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
                {(() => {
                  const filtered = shiftRequests.filter(r => {
                    if (shiftRequestTabFilter === 'ALL') return true
                    return r.trang_thai_yeu_cau === shiftRequestTabFilter
                  })

                  if (filtered.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                          <CheckCircle2 size={24} color="#94a3b8" />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Không có yêu cầu đăng ký ca nào</div>
                        <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          {shiftRequestTabFilter === 'PENDING'
                            ? 'Toàn bộ ca làm việc đăng ký đã được duyệt hoặc chưa có yêu cầu mới.'
                            : 'Không tìm thấy bản ghi phù hợp với bộ lọc.'}
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {filtered.map(req => {
                        const isPending = req.trang_thai_yeu_cau === 'PENDING'
                        const isApproved = req.trang_thai_yeu_cau === 'APPROVED'
                        const isRejected = req.trang_thai_yeu_cau === 'REJECTED'
                        const tmpl = SHIFT_TEMPLATES.find(t => t.id === req.ma_khung_ca) || SHIFT_TEMPLATES[0]
                        const ShiftIcon = tmpl.icon
                        const initials = getStaffInitials(req.staff_name || req.staff_username)

                        return (
                          <div key={req.ma_ca_lam_viec} style={{
                            background: isPending ? '#fffdf5' : '#ffffff',
                            borderRadius: 14, padding: 14,
                            border: isPending ? '1.5px solid #fde68a' : '1px solid #e2e8f0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: 16, flexWrap: 'wrap', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                          }}>
                            {/* Left: Staff & Shift Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%',
                                background: isPending
                                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                  : isApproved ? 'linear-gradient(135deg, #059669, #047857)' : '#94a3b8',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 800, flexShrink: 0
                              }}>
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                                  {req.staff_name} <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>@{req.staff_username}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar size={13} color="#64748b" /> {req.ngay_lam_viec}
                                  </span>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                    background: tmpl.bg, border: `1px solid ${tmpl.border}`, color: tmpl.text
                                  }}>
                                    <ShiftIcon size={12} color={tmpl.accent} /> {tmpl.name} ({tmpl.start}-{tmpl.end})
                                  </span>
                                </div>
                                {req.note && (
                                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                                    Ghi chú: "{req.note}"
                                  </div>
                                )}
                                {req.ghi_chu_duyet && (
                                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>
                                    Lý do từ chối: {req.ghi_chu_duyet}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Status & Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {isPending && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    onClick={() => handleApproveShiftRequest(req.ma_ca_lam_viec)}
                                    disabled={approvingRequestId === req.ma_ca_lam_viec}
                                    style={{
                                      padding: '8px 14px', background: 'linear-gradient(135deg, #10b981, #059669)',
                                      color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12,
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                      boxShadow: '0 2px 6px rgba(16,185,129,0.25)', transition: 'all .15s'
                                    }}
                                  >
                                    <Check size={14} /> Duyệt ca
                                  </button>
                                  <button
                                    onClick={() => handleRejectShiftRequest(req.ma_ca_lam_viec)}
                                    disabled={approvingRequestId === req.ma_ca_lam_viec}
                                    style={{
                                      padding: '8px 12px', background: '#fef2f2', color: '#dc2626',
                                      border: '1px solid #fee2e2', borderRadius: 10, fontWeight: 700, fontSize: 12,
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                  >
                                    <X size={14} /> Từ chối
                                  </button>
                                </div>
                              )}
                              {isApproved && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 99, background: '#ecfdf5',
                                  color: '#059669', fontSize: 12, fontWeight: 800, border: '1px solid #a7f3d0'
                                }}>
                                  <CheckCircle2 size={13} /> Đã duyệt chính thức
                                </span>
                              )}
                              {isRejected && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 99, background: '#fef2f2',
                                  color: '#dc2626', fontSize: 12, fontWeight: 800, border: '1px solid #fecaca'
                                }}>
                                  <XCircle size={13} /> Đã từ chối
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Tổng cộng: <b>{shiftRequests.length}</b> yêu cầu | Chờ duyệt: <b style={{ color: '#d97706' }}>{shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length}</b>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowShiftRequestsModal(false)}
                    style={{
                      padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1',
                      borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#475569', cursor: 'pointer'
                    }}
                  >
                    Đóng
                  </button>
                  {shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length > 0 && (
                    <button
                      onClick={handleApproveAllPending}
                      disabled={shiftRequestsLoading}
                      style={{
                        padding: '8px 18px', background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 3px 10px rgba(16,185,129,0.35)'
                      }}
                    >
                      <Check size={16} /> Duyệt tất cả ({shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length} ca)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Scoring Criteria Modal */}
      {scoringCriteriaModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 24, width: '100%', maxWidth: 500, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s ease-out',
            display: 'flex', flexDirection: 'column', maxHeight: '90vh'
          }}>
            <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎯</span> Tiêu Chí Chấm Điểm Kiosk
              </h3>
              <button onClick={() => setScoringCriteriaModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto' }}>
              <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14, lineHeight: 1.6 }}>
                Điểm đánh giá hiệu suất của mỗi Kiosk được hệ thống tính toán <b>tự động & minh bạch</b> dựa trên hoạt động kinh doanh thực tế. Điểm khởi điểm là <b>100đ</b>.
              </p>
              
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>📉 Điểm Trừ (Vi phạm)</h4>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ background: '#fef2f2', padding: '12px 16px', borderRadius: 12, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 13 }}>Nợ quá hạn / Chưa thanh toán</span>
                    <span style={{ color: '#dc2626', fontWeight: 900 }}>-10đ / Khoản</span>
                  </div>
                  <div style={{ background: '#fffbeb', padding: '12px 16px', borderRadius: 12, border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#92400e', fontWeight: 600, fontSize: 13 }}>Biên bản Đối soát: Cảnh báo Vàng</span>
                    <span style={{ color: '#d97706', fontWeight: 900 }}>-15đ / Biên bản</span>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '12px 16px', borderRadius: 12, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 13 }}>Biên bản Đối soát: Cảnh báo Đỏ</span>
                    <span style={{ color: '#dc2626', fontWeight: 900 }}>-30đ / Biên bản</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>📈 Điểm Cộng (Thành tích)</h4>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ background: '#ecfdf5', padding: '12px 16px', borderRadius: 12, border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#065f46', fontWeight: 600, fontSize: 13 }}>Tiêu thụ tích lũy &gt; 50 Combo gốc</span>
                    <span style={{ color: '#059669', fontWeight: 900 }}>+10đ</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>🏆 Xếp Hạng</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div style={{ background: '#fef08a', padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 900, color: '#854d0e', fontSize: 20 }}>S</div>
                    <div style={{ fontSize: 11, color: '#a16207', fontWeight: 700, marginTop: 4 }}>≥ 90đ</div>
                  </div>
                  <div style={{ background: '#bfdbfe', padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 900, color: '#1e3a8a', fontSize: 20 }}>A</div>
                    <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginTop: 4 }}>≥ 70đ</div>
                  </div>
                  <div style={{ background: '#bbf7d0', padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 900, color: '#14532d', fontSize: 20 }}>B</div>
                    <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700, marginTop: 4 }}>≥ 50đ</div>
                  </div>
                  <div style={{ background: '#fecaca', padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 900, color: '#7f1d1d', fontSize: 20 }}>C</div>
                    <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, marginTop: 4 }}>&lt; 50đ</div>
                  </div>
                </div>
              </div>

            </div>
            <div style={{ padding: 20, background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setScoringCriteriaModal(false)} style={{ width: '100%', padding: '12px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <Modal title="🖨️ HÓA ĐƠN GIÁ TRỊ GIA TĂNG (Bản Thể Hiện)" onClose={() => setInvoiceModal(null)}>
          <div id="invoice-print-area" style={{ padding: '20px 30px', background: '#fff', border: '1px dashed #ccc', color: '#111827', fontFamily: 'monospace' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 5px 0' }}>CÔNG TY CP AVENGERS COFFEE</h2>
              <div style={{ fontSize: 13 }}>MST: 0123456789 - SĐT: 1900 1234</div>
              <div style={{ fontSize: 13 }}>Địa chỉ: 123 Đường Nhượng Quyền, TP. HCM</div>
              <hr style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }}/>
              <h3 style={{ margin: '0 0 5px 0' }}>HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h3>
              <div style={{ fontSize: 12 }}>Bản thể hiện của hóa đơn điện tử</div>
            </div>
            
            <div style={{ marginBottom: 15, fontSize: 13, lineHeight: '1.6' }}>
              <div><b>Khách hàng:</b> {invoiceModal.kiosk?.ten_kiosk}</div>
              <div><b>Mã Kiosk:</b> {invoiceModal.kiosk?.ma_kiosk}</div>
              <div><b>Nội dung xuất:</b> {invoiceModal.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền và setup ban đầu' : 'Thanh toán công nợ / Royalty'}</div>
              <div><b>Ngày thanh toán:</b> {new Date().toLocaleDateString('vi-VN')}</div>
            </div>

            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 15 }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #ccc', textAlign: 'left' }}>
                  <th style={{ paddingBottom: 5 }}>Nội dung</th>
                  <th style={{ paddingBottom: 5, textAlign: 'right' }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ paddingTop: 10 }}>Tiền hàng (chưa VAT)</td>
                  <td style={{ paddingTop: 10, textAlign: 'right' }}>{fmtMoney((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) / 1.08)}</td>
                </tr>
                <tr>
                  <td style={{ paddingTop: 5 }}>Thuế GTGT (8%)</td>
                  <td style={{ paddingTop: 5, textAlign: 'right' }}>{fmtMoney((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) - ((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) / 1.08))}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ paddingTop: 10, borderTop: '1px dashed #ccc' }}>TỔNG CỘNG</td>
                  <td style={{ paddingTop: 10, borderTop: '1px dashed #ccc', textAlign: 'right' }}>{fmtMoney(Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0))}</td>
                </tr>
              </tbody>
            </table>
            
            <div style={{ textAlign: 'center', fontSize: 12, marginTop: 30, color: '#6b7280' }}>
              <div>(Đã ký bởi Công ty CP Avengers Coffee)</div>
              <div style={{ marginTop: 4 }}>* Đây là hóa đơn giả lập cho bài Demo.</div>
            </div>
          </div>
          <div style={{ marginTop: 20, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setInvoiceModal(null)} style={{ padding: '8px 16px', background: '#fff', color: '#374151', borderRadius: 8, border: '1px solid #d1d5db', fontWeight: 600, cursor: 'pointer' }}>Đóng</button>
            <button onClick={() => {
              const printContent = document.getElementById('invoice-print-area').innerHTML;
              const printWindow = window.open('', '_blank');
              printWindow.document.write(`
                <html>
                  <head>
                    <title>Hoa don VAT - Avengers Coffee</title>
                    <style>
                      body { font-family: monospace; padding: 20px; color: #111827; max-width: 800px; margin: 0 auto; }
                      table { width: 100%; border-collapse: collapse; }
                      th, td { text-align: left; }
                      hr { border-top: 1px dashed #ccc; }
                      @media print {
                        @page { margin: 0; size: A5 landscape; }
                        body { padding: 30px; }
                      }
                    </style>
                  </head>
                  <body>
                    ${printContent}
                  </body>
                </html>
              `);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                printWindow.print();
                printWindow.close();
              }, 250);
            }} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>🖨️ In Hóa Đơn (PDF)</button>
          </div>
        </Modal>
      )}

      {/* ── PAYMENT MODAL (DEMO) ───────────────────────── */}
      {showPayment && selectedDebt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{ background: 'linear-gradient(135deg, #4338ca, #3b82f6)', padding: '24px', textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💳</div>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Avengers Pay</h3>
              <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.8 }}>Thanh toán công nợ</p>
            </div>
            
            <div style={{ padding: 24 }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Số tiền cần thanh toán</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
                  {fmtMoney(selectedDebt.so_tien)}
                </div>
                <div style={{ fontSize: 14, color: '#3b82f6', fontWeight: 700, marginTop: 4 }}>
                  {selectedDebt.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền ban đầu' : 'Thanh toán hóa đơn'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Số dư ví hiện tại:</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: walletBalance >= Number(selectedDebt.so_tien) ? '#059669' : '#dc2626' }}>
                    {fmtMoney(walletBalance)}
                  </span>
                </div>
                {walletBalance < Number(selectedDebt.so_tien) && (
                  <button onClick={handleNapTien} type="button" style={{
                    width: '100%', padding: '10px', background: '#dbeafe', color: '#1d4ed8',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8
                  }}>
                    + Nạp nhanh 100.000.000đ (Test)
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => { setShowPayment(false); setSelectedDebt(null); }} disabled={paymentProcessing}
                  style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: paymentProcessing ? 'not-allowed' : 'pointer' }}>
                  Hủy bỏ
                </button>
                <button type="button" onClick={handleThanhToan} disabled={walletBalance < Number(selectedDebt.so_tien) || paymentProcessing}
                  style={{
                    flex: 2, padding: '14px', background: walletBalance < Number(selectedDebt.so_tien) ? '#cbd5e1' : '#4f46e5',
                    color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                    cursor: walletBalance < Number(selectedDebt.so_tien) || paymentProcessing ? 'not-allowed' : 'pointer',
                    boxShadow: walletBalance < Number(selectedDebt.so_tien) ? 'none' : '0 4px 14px rgba(79,70,229,0.4)'
                  }}>
                  {paymentProcessing ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL 5: MỞ CA LÀM VIỆC (OPEN KIOSK SHIFT) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showOpenShiftModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setShowOpenShiftModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 460, overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PlayCircle size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Mở Ca Làm Việc Trực Tiếp</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b></p>
                  </div>
                </div>
                <button onClick={() => setShowOpenShiftModal(false)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 800, color: '#64748b' }}>×</button>
              </div>

              <form onSubmit={handleOpenKioskShift} style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Nhân viên trực ca *</label>
                  <select required value={openShiftForm.staff_username} onChange={e => {
                    const matched = subStaffList.find(s => s.ten_dang_nhap === e.target.value)
                    setOpenShiftForm(f => ({ ...f, staff_username: e.target.value, staff_name: matched?.ho_ten || e.target.value }))
                  }}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f8fafc', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}>
                    <option value={userName}>{userName} (Chủ nhượng quyền / Admin)</option>
                    {subStaffList.map(s => <option key={s.ma_nguoi_dung} value={s.ten_dang_nhap}>{s.ho_ten} (@{s.ten_dang_nhap})</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Tiền mặt bàn giao đầu ca (VNĐ) *</label>
                  <input type="number" required min="0" step="1000" value={openShiftForm.cash_open} onChange={e => setOpenShiftForm(f => ({ ...f, cash_open: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 16, fontWeight: 800, outline: 'none', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: 12, color: '#059669', fontWeight: 700, marginTop: 4 }}>
                    Tiền lẻ mở két: {fmtMoney(openShiftForm.cash_open)}
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Ghi chú mở ca</label>
                  <input type="text" value={openShiftForm.note} onChange={e => setOpenShiftForm(f => ({ ...f, note: e.target.value }))} placeholder="Ví dụ: Bàn giao tiền lẻ đầy đủ..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowOpenShiftModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang mở ca...' : '✓ Bắt đầu mở ca'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 6: CHỐT CA LÀM VIỆC (CLOSE KIOSK SHIFT) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showCloseShiftModal && activeKioskShift?.has_open_shift && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowCloseShiftModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 480, overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Chốt Ca Kiểm Tiền Kiosk</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b></p>
                  </div>
                </div>
                <button onClick={() => setShowCloseShiftModal(false)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 800, color: '#64748b' }}>×</button>
              </div>

              <form onSubmit={handleCloseKioskShift} style={{ padding: 24 }}>
                <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Tiền mặt đầu ca:</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtMoney(activeKioskShift.active_shift?.tien_dau_ca)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Tiền mặt thu được trong ca:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{fmtMoney(activeKioskShift.live_stats?.cash_revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>Tiền mặt kỳ vọng trong két:</span>
                    <span style={{ fontWeight: 900, color: '#d97706', fontSize: 16 }}>{fmtMoney(activeKioskShift.live_stats?.expected_cash)}</span>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Tiền mặt thực tế đếm được cuối ca (VNĐ) *</label>
                  <input type="number" required min="0" value={closeShiftForm.cash_close} onChange={e => setCloseShiftForm(f => ({ ...f, cash_close: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 16, fontWeight: 800, outline: 'none', boxSizing: 'border-box' }} />
                  
                  {/* Difference feedback */}
                  {(() => {
                    const diff = Number(closeShiftForm.cash_close || 0) - Number(activeKioskShift.live_stats?.expected_cash || 0)
                    return (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                        background: diff === 0 ? '#ecfdf5' : diff > 0 ? '#fffbeb' : '#fef2f2',
                        color: diff === 0 ? '#059669' : diff > 0 ? '#d97706' : '#dc2626',
                        display: 'flex', justifyContent: 'space-between'
                      }}>
                        <span>Chênh lệch két tiền:</span>
                        <span>{diff === 0 ? '✓ Chuẩn khớp 0đ' : diff > 0 ? `+ ${fmtMoney(diff)} (Thừa)` : `- ${fmtMoney(Math.abs(diff))} (Thiếu)`}</span>
                      </div>
                    )
                  })()}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Ghi chú chốt ca</label>
                  <textarea value={closeShiftForm.note} onChange={e => setCloseShiftForm(f => ({ ...f, note: e.target.value }))} placeholder="Lý do chênh lệch hoặc ghi chú bàn giao..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, minHeight: 70, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowCloseShiftModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang chốt ca...' : '✓ Xác nhận chốt ca'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 7: CƯỠNG CHẾ ĐÓNG CA (FORCE CLOSE KIOSK SHIFT) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showForceCloseModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} onClick={() => setShowForceCloseModal(false)}>
            <div style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 440, overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #fee2e2', background: '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#991b1b' }}>Cưỡng Chế Đóng Ca Trực Kiosk</h3>
                  </div>
                </div>
                <button onClick={() => setShowForceCloseModal(false)} style={{ background: '#fee2e2', border: 'none', width: 28, height: 28, borderRadius: 14, cursor: 'pointer', fontWeight: 800, color: '#991b1b' }}>×</button>
              </div>

              <form onSubmit={handleForceCloseKioskShift} style={{ padding: 24 }}>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                  Dùng chức năng này khi nhân viên trước đã về mà <b>quên chốt ca</b>, giúp giải phóng Kiosk để nhân viên ca sau có thể mở ca làm việc.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Lý do cưỡng chế bàn giao *</label>
                  <input type="text" required value={forceCloseReason} onChange={e => setForceCloseReason(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setShowForceCloseModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang đóng ca...' : '⚠️ Xác nhận ép đóng ca'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 8: HOÀN TIỀN MẶT & HỦY ĐƠN HÀNG POS (Thành An) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showVoidModal && voidModalOrder && (
          <PosRefundVoidModal
            order={voidModalOrder}
            activeShift={activeKioskShift?.active_shift || activeKioskShift}
            isOpen={showVoidModal}
            onClose={() => {
              setShowVoidModal(false)
              setVoidModalOrder(null)
            }}
            onConfirmRefundVoid={handleRefundVoidPos}
            processing={voidSubmitting}
          />
        )}

      </div>
    </ErrorBoundary>
  )
}
