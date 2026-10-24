import ComboOrderDetail from './ComboOrderDetail'
import { comboIsPaid, comboStatusLabel } from './comboInvoice'
import KioskPosTerminal from './KioskPosTerminal'
import { kioskCheckoutResult, kioskPaymentLabel, kioskSaleStatus } from './kioskPosModel'
import KioskShiftPanel, { KioskTableLoading } from './KioskShiftPanel'
import KioskDebtPanel from './KioskDebtPanel'
import { Switch } from '../../components/ui/switch'
import { useKioskAvailability } from './useKioskAvailability'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import OperationalPageFrame from '../../components/console/OperationalPageFrame'
import { KioskIdentity, KioskPosPicker, KioskScheduleGrid, KioskScopePicker } from './KioskWorkspaceComponents'
import './KioskWorkspace.css'
import StatusBadge from '../../components/console/StatusBadge'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Table } from '../../components/ui/table'
import { Textarea } from '../../components/ui/textarea'
import { MapPin as WorkspaceSymbolMapPin, Store as WorkspaceSymbolStore, Check as WorkspaceSymbolCheck, Receipt as WorkspaceSymbolReceipt, CheckSquare as WorkspaceSymbolCheckSquare, BarChart3 as WorkspaceSymbolBarChart3, TrendingUp as WorkspaceSymbolTrendingUp, Award as WorkspaceSymbolAward, Printer as WorkspaceSymbolPrinter, CreditCard as WorkspaceSymbolCreditCard } from '../../components/console/WorkspaceIcons'
import SearchableSelect from '../../components/console/SearchableSelect'
import CurrencyInput from '../../components/console/CurrencyInput'
import { PaginatedList, PageNumbers } from '../../components/console/CompactPagination'
import { WorkspaceSidebar } from '../../components/console/WorkspaceNavigation'
import { getAdminSession } from '../../lib/adminFetch'
import { Chart, DashboardSkeleton } from '../../components/console/DashboardCharts'
import { WorkspaceErrorBoundary } from '../../components/console/WorkspaceErrorBoundary'
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
  Wallet,
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
  EyeOff,
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
  Star,
  MessageSquare
} from '../../components/console/WorkspaceIcons'
import { PosRefundVoidModal } from '../staff-dashboard/components/PosRefundVoidModal'

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
        <div style={{ padding: 40, background: "#f6f8fa", color: '#991b1b', minHeight: '100vh' }}>
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
  if (!c) return 'Khác';
  if (typeof c === 'string') return c;
  return c.ten_danh_muc || c.tenDanhMuc || c.ten_danh_muc_cha || c.name || c.ten || 'Khác';
};

const getComboPerks = (combo) => {
  const name = (combo.ten_combo || '').toLowerCase();
  const price = combo.gia_ban || 0;
  let perks = [];
  
  if (name.includes('lưu động') || price < 50000000) {
    perks = [
      "Máy pha cafe 1 Group + Máy xay hạt",
      "10kg Cafe hạt rang mộc (100% Robusta/Arabica)",
      "2 Bộ đồng phục nhân viên Avengers",
      "Khóa đào tạo pha chế chuẩn (3 ngày)",
      "Xe lưu động & Dụng cụ pha chế cơ bản"
    ];
  } else if (name.includes('container') || price > 150000000) {
    perks = [
      "Máy pha cafe cao cấp 2 Group + 2 Máy xay",
      "50kg Cafe hạt & Đầy đủ bộ nguyên liệu",
      "6 Bộ đồng phục + Bảng tên nhân viên",
      "Đào tạo chuyên sâu tận nơi (7 ngày)",
      "Tủ lạnh lớn, Máy lạnh & Nội thất hoàn chỉnh",
      "Hệ thống POS & Két sắt tự động",
      "Gói Marketing Khai Trương (Banner, Loa, Bóng bay)",
      "Đặc quyền VIP: Hỗ trợ vận hành tháng đầu tiên"
    ];
  } else {
    perks = [
      "Máy pha cafe 2 Group + Máy xay tự động",
      "20kg Cafe hạt & Combo nguyên liệu pha chế",
      "4 Bộ đồng phục nhân viên",
      "Khóa đào tạo & quản lý vận hành (5 ngày)",
      "Tủ lạnh & Bảng hiệu LED vẫy",
      "Phần mềm quản lý POS & Quẹt thẻ"
    ];
  }
  
  if (combo.mo_ta && combo.mo_ta.length > 20) {
    perks.unshift(` ${combo.mo_ta}`);
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
    <div style={{ background: '#fff', borderRadius: 16, padding: 28, minWidth: 0, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <Button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</Button>
      </div>
      {children}
    </div>
  </div>
)

const apiFetch = async (path, opts = {}) => {
  const session = (getAdminSession() || {})
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
    bg: '#f6f8fa',
    headerBg: '#f6f8fa',
    text: '#263c50',
    border: '#cbd5e1',
    accent: '#526174',
    pillBg: '#f6f8fa',
  },
  {
    id: 'CHIEU',
    name: 'Ca Chiều',
    label: 'Ca Chiều (12:00 - 18:00)',
    time: '12:00 - 18:00',
    start: '12:00',
    end: '18:00',
    icon: Sunset,
    bg: '#f6f8fa',
    headerBg: '#f6f8fa',
    text: '#263c50',
    border: '#cbd5e1',
    accent: '#526174',
    pillBg: '#f6f8fa',
  },
  {
    id: 'TOI',
    name: 'Ca Tối',
    label: 'Ca Tối (18:00 - 23:00)',
    time: '18:00 - 23:00',
    start: '18:00',
    end: '23:00',
    icon: Moon,
    bg: '#f6f8fa',
    headerBg: '#f6f8fa',
    text: '#263c50',
    border: '#cbd5e1',
    accent: '#526174',
    pillBg: '#f6f8fa',
  },
];

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
  const [posKioskSelected, setPosKioskSelected] = useState(false)
  const [combos, setCombos] = useState([])
  const [dons, setDons] = useState([])
  const [selectedComboId,setSelectedComboId]=useState(null)
  const [paymentBusy,setPaymentBusy]=useState(false)
  const [congNos, setCongNos] = useState([])
  const [royalties, setRoyalties] = useState([])
  const [royaltyCalculating, setRoyaltyCalculating] = useState(false)
  
  // Wallet states
  const [walletInfo, setWalletInfo] = useState({ so_du_vi: 0, giao_dich: [] })
  const [depositAmount, setDepositAmount] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    if (!msg) return undefined
    const timeout = window.setTimeout(() => setMsg(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [msg])
  const [orderForm, setOrderForm] = useState({ kiosk_id: '', combo_id: '', so_luong: 1, phuong_thuc_thanh_toan: 'CONG_NO' })
  const [ordering, setOrdering] = useState(false)

  // Review Modal State
  const [reviewModal, setReviewModal] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewStats, setReviewStats] = useState({ avg: 0, total: 0 })
  const [loadingReviews, setLoadingReviews] = useState(false)

  const openReviewModal = async (kiosk) => {
    setReviewModal(kiosk)
    setLoadingReviews(true)
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/branch/${kiosk.ma_kiosk}`)
      if (res.ok) {
        const data = await res.json()
        setReviews(data.items || [])
        setReviewStats({ avg: data.diem_trung_binh || 0, total: data.tong_luot_danh_gia || 0 })
      } else {
        setReviews([])
        setReviewStats({ avg: 0, total: 0 })
      }
    } catch (err) {
      setReviews([])
      setReviewStats({ avg: 0, total: 0 })
    } finally {
      setLoadingReviews(false)
    }
  }

  const deleteReview = async (reviewId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đánh giá này không?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/${reviewId}`, { method: 'DELETE' });
      if (res.ok) {
        // Refresh
        openReviewModal(reviewModal);
      } else {
        alert("Có lỗi khi xóa đánh giá!");
      }
    } catch (err) {
      alert("Lỗi kết nối khi xóa đánh giá.");
    }
  }

  // ★ KIOSK CONTEXT
  const [activeKioskId, setActiveKioskId] = useState('')
  const [kioskFilterStatus, setKioskFilterStatus] = useState('ALL')
  const [kioskFilterType, setKioskFilterType] = useState('ALL')
  const [kioskPage, setKioskPage] = useState(1)

  // ─── 5.1: Sub-staff Management States (Thành An) ───
  const [subStaffList, setSubStaffList] = useState([])
  const [subStaffLoading, setSubStaffLoading] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
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
  const [showStaffPassword, setShowStaffPassword] = useState(false)

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
  const posSubmitLock = React.useRef(false)
  const [posSubmitting, setPosSubmitting] = useState(false)
  const [posOrderResult, setPosOrderResult] = useState(null)
  const [posCashInput, setPosCashInput] = useState('')
  const [kioskPrices, setKioskPrices] = useState([])

  // POS Orders state & Refund/Void states (Thành An)
  const [posOrders, setPosOrders] = useState([])
  const [posOrderLoading, setPosOrderLoading] = useState(false)
  const [posOrderError, setPosOrderError] = useState('')
  const posOrderCache = React.useRef(new Map())
  const posOrderRequests = React.useRef(new Map())
  const posOrderScope = React.useRef('')
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

  // Tất toán gói nhượng quyền states
  const [showTatToanModal, setShowTatToanModal] = useState(false);
  const [tatToanInfo, setTatToanInfo] = useState(null);
  const [tatToanMethod, setTatToanMethod] = useState('VIETQR');
  const [tatToanLoading, setTatToanLoading] = useState(false);
  const [tatToanSuccess, setTatToanSuccess] = useState(false);

  const openTatToanModal = async (kioskId) => {
    const kid = kioskId || activeKioskId;
    if (!kid) return;
    setTatToanLoading(true);
    setShowTatToanModal(true);
    setTatToanSuccess(false);
    try {
      const data = await apiFetch(`/franchise/kiosk/${kid}/thong-tin-tat-toan`);
      setTatToanInfo(data);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Lỗi lấy thông tin tất toán gói' });
      setShowTatToanModal(false);
    } finally {
      setTatToanLoading(false);
    }
  };

  const handleXacNhanTatToanGoi = async () => {
    if (!tatToanInfo?.kiosk?.id) return;
    setTatToanLoading(true);
    try {
      const res = await apiFetch(`/franchise/kiosk/${tatToanInfo.kiosk.id}/tat-toan-goi`, {
        method: 'POST',
        body: JSON.stringify({
          phuong_thuc: tatToanMethod,
          ma_giao_dich: `GD_${Date.now()}`
        })
      });
      setTatToanSuccess(true);
      setMsg({ type: 'success', text: res.message || 'Tất toán gói nhượng quyền thành công!' });
      setTimeout(() => {
        loadAll();
      }, 1500);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Tất toán thất bại' });
    } finally {
      setTatToanLoading(false);
    }
  };

  // Scoring Modal
  const [scoringCriteriaModal, setScoringCriteriaModal] = useState(false);

  // Expansion state
  const [expansionForm, setExpansionForm] = useState({ dia_chi_mat_bang: '', phuong_xa: '', thanh_pho: '', dien_tich_m2: '', goi_kiosk: 'KIOSK_CO_DINH' })
  const [expansionSubmitting, setExpansionSubmitting] = useState(false)


  const handleExpansionSubmit = async (e) => {
    e.preventDefault()
    setExpansionSubmitting(true)
    try {
      const res = await apiFetch('/franchise/dang-ky-noi-bo', { method: 'POST', body: JSON.stringify(expansionForm) })
      setMsg({ type: 'success', text: res.message })
      setExpansionForm({ dia_chi_mat_bang: '', phuong_xa: '', thanh_pho: '', dien_tich_m2: '', goi_kiosk: 'KIOSK_CO_DINH' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setExpansionSubmitting(false)
    }
  }

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
      const [k, c, d, cn, r, w] = await Promise.all([
        apiFetch('/franchise/kiosk/cua-toi'),
        apiFetch('/franchise/combo'),
        apiFetch('/franchise/don-mua-combo/cua-toi'),
        apiFetch('/franchise/cong-no/cua-toi'),
        apiFetch('/franchise/royalty/cua-toi'),
        apiFetch('/wallet/info'),
      ])
      setKiosks(k || [])
      setCombos(c || [])
      setDons(d || [])
      setCongNos(cn || [])
      if (w) setWalletInfo(w)
      const royaltiesData = r || []
      const royaltiesWithKiosk = royaltiesData.map(roy => {
        const kiosk = (k || []).find(kk => kk.id === roy.kiosk_id)
        return { ...roy, kiosk }
      })
      setRoyalties(royaltiesWithKiosk)
      if (k && k.length > 0) {
        const selected = k.find(item=>item.id===activeKioskIdRef.current) || k.find(item=>item.trang_thai==='DANG_HOAT_DONG') || k[0]
        setActiveKioskId(selected.id)
        setOrderForm(f=>({...f,kiosk_id:selected.id}))
      }

    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }

  // ─── 5.1: Staff API handlers ───
  const loadStaffList = async () => {
    setSubStaffLoading(true)
    try {
      const data = await apiFetch(`/franchise/staff${activeKioskId ? `?kiosk_id=${activeKioskId}` : ''}`)
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
      setMsg({ type: 'success', text: ` ${res.message || 'Tạo nhân viên con thành công!'}` })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Cập nhật nhân viên thành công!'}` })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Đã đặt lại mật khẩu nhân viên thành công!'}` })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Đã vô hiệu hóa nhân viên thành công!'}` })
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
      setMsg({ type: 'success', text: "Đã phê duyệt ca làm việc! Ca đã được chuyển vào lịch làm chính thức của Kiosk." })
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
      setMsg({ type: 'success', text: ` Đã duyệt thành công toàn bộ ${pendingList.length} ca đăng ký làm việc!` })
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
      setMsg({ type: 'success', text: "Phân ca làm việc cho nhân viên thành công!" })
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
      setMsg({ type: 'success', text: "Cập nhật điểm danh ca thành công!" })
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
      setMsg({ type: 'success', text: "Đã xóa ca làm việc thành công!" })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Mở ca làm việc thành công!'}` })
      setShowOpenShiftModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: ` ${err.message}` })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Đã gửi yêu cầu chốt ca, đang chờ quản lý duyệt.'}` })
      setShowCloseShiftModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: ` ${err.message}` })
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
      setMsg({ type: 'success', text: ` ${res.message || 'Đã cưỡng chế đóng ca thành công!'}` })
      setShowForceCloseModal(false)
      loadActiveKioskShift(activeKioskId)
      loadKioskShiftHistory(activeKioskId)
    } catch (err) {
      setMsg({ type: 'error', text: ` ${err.message}` })
    } finally {
      setShiftActionSubmitting(false)
    }
  }

  const handleKioskCloseApproval = async (decision, shift) => {
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk?.ma_kiosk || !shift?.id) return
    setShiftActionSubmitting(true)
    try {
      const res = await apiFetch(`/staff/kiosk-shifts/${shift.id}/close-approval`, {
        method: 'PATCH',
        body: JSON.stringify({ branch_code: kiosk.ma_kiosk, decision }),
      })
      setMsg({ type: 'success', text: res.message || (decision === 'APPROVE' ? 'Đã duyệt chốt ca.' : 'Đã từ chối yêu cầu chốt ca.') })
      await Promise.all([loadActiveKioskShift(activeKioskId), loadKioskShiftHistory(activeKioskId)])
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
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

  const loadPosOrders = async (customKioskId, customFilter, force = false) => {
    const kId = customKioskId || activeKioskIdRef.current
    const kiosk = kiosksRef.current.find(k => k.id === kId) || kiosksRef.current[0]
    if (!kiosk) return
    const filter = customFilter || posDateFilter
    const key = `${kiosk.ma_kiosk}:${filter}`
    posOrderScope.current = key
    const cached = posOrderCache.current.get(key)
    setPosOrders(cached?.orders || [])
    setPosOrderError('')
    if (!force && cached && Date.now() - cached.time < 15_000) { setPosOrderLoading(false); return }
    setPosOrderLoading(true)
    try {
      let request = posOrderRequests.current.get(key)
      if (!request) {
        request = (async () => {
            let query = `?branch_code=${encodeURIComponent(kiosk.ma_kiosk)}&limit=50`
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
            const orders = Array.isArray(data?.orders) ? data.orders : []
            posOrderCache.current.set(key, { orders, time: Date.now() })
            return orders
        })().finally(() => posOrderRequests.current.delete(key))
        posOrderRequests.current.set(key, request)
      }
      const orders = await request
      if (posOrderScope.current === key) setPosOrders(orders)
    } catch (e) {
      if (posOrderScope.current === key) setPosOrderError(e.message || 'Không tải được đơn bán hàng. Vui lòng thử lại.')
    } finally {
      if (posOrderScope.current === key) setPosOrderLoading(false)
    }
  }

  // ─── 5.4: Hoàn tiền & Hủy đơn hàng POS cho Kiosk (Thành An) ───
  const handleRefundVoidPos = async (orderId, payload) => {
    setVoidSubmitting(true)
    try {
      const kiosk = kiosks.find(k => k.id === activeKioskId)
      const finalPayload = { ...payload, branch_code: payload.branch_code || kiosk?.ma_kiosk }
      const res = await apiFetch(`/staff/orders/${orderId}/refund-void`, {
        method: 'POST',
        body: JSON.stringify(finalPayload),
      })
      setMsg({ type: 'success', text: ` ${res.message || 'Hoàn tiền thành công.'}` })
      setShowVoidModal(false)
      setVoidModalOrder(null)
      if (posOrderResult?.ma_don === orderId) {
        setPosOrderResult(prev => prev ? { ...prev, voided:true, order:{...prev.order,trang_thai_don_hang:'DA_HUY',trang_thai_thanh_toan:'DA_HOAN_TIEN'} } : null)
      }
      await Promise.all([
        loadPosOrders(activeKioskId, posDateFilter, true),
        loadActiveKioskShift(activeKioskId)
      ])
    } catch (e) {
      setMsg({ type: 'error', text: ` ${e.message}` })
      throw e
    } finally {
      setVoidSubmitting(false)
    }
  }

  const addToCart = (item, selectedToppingsList = []) => {
    if (!availability.ready || !availability.isSelling(item)) return
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
    const posCashInsufficient = posPayment === 'TIEN_MAT' && posCashNum < posTotal

  const submitPosOrder = async () => {
    if (!posCart.length || !activeKioskId) return
    const kiosk = kiosks.find(k => k.id === activeKioskId)
    if (!kiosk) return

    // ─── RÀNG BUỘC 1: Kiểm tra ca mở trước khi tạo đơn ───
    if (!activeKioskShift?.has_open_shift) {
      setMsg({
        type: 'error',
        text: ` Kiosk ${kiosk.ten_kiosk} (${kiosk.ma_kiosk}) chưa mở ca làm việc. Vui lòng mở ca trước khi thanh toán!`
      })
      setShowOpenShiftModal(true)
      return
    }

    if (posCashInsufficient) { setPosOrderResult({ success:false, error:'Số tiền khách đưa chưa đủ.' }); return }
    if (posSubmitLock.current) return
    posSubmitLock.current = true
    setPosSubmitting(true)
    try {
      const body = {
        branch_code: kiosk.ma_kiosk,
        loai_don_hang: 'MANG_DI',
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
      posOrderCache.current.clear()
      setPosOrderResult(kioskCheckoutResult(data, { total:posTotal, method:posPayment, cash:posCashInput }))
      setPosCart([])
      setPosCashInput('')
      loadActiveKioskShift(activeKioskId)
    } catch (e) {
      setPosOrderResult({ success: false, error: e.message })
    } finally { posSubmitLock.current = false; setPosSubmitting(false) }
  }

  // 1. Initial mount load
  useEffect(() => {
    loadAll(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('vnpay') === 'success') {
      setMsg({ type: 'success', text: "Thanh toán VNPay thành công!" })
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('vnpay') === 'failed') {
      setMsg({ type: 'error', text: "Thanh toán VNPay thất bại hoặc bị huỷ." })
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const datMuaCombo = async () => {
    if (!orderForm.kiosk_id || !orderForm.combo_id) { 
      setMsg({ type: 'error', text: 'Vui lòng click chọn một gói combo ở trên trước khi đặt mua!' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return; 
    }
    setOrdering(true)
    try {
      const res = await apiFetch('/franchise/don-mua-combo', { method: 'POST', body: JSON.stringify(orderForm) })
      if (res.vnpay_url) {
        window.location.href = res.vnpay_url
        return
      }
      setMsg({ type: 'success', text: ` ${res.message}` })
      setOrderForm(f => ({ ...f, combo_id: '', so_luong: 1 }))
      loadAll(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      console.error('LỖI KHI ĐẶT COMBO:', e)
      const errText = typeof e.message === 'string' ? e.message : JSON.stringify(e.message || e)
      setMsg({ type: 'error', text: errText })
      alert(`Lỗi: ${errText}`)
    }
    finally { setOrdering(false) }
  }

  const tongCongNo = congNos.filter(c => c.trang_thai !== 'DA_THANH_TOAN').reduce((s, c) => s + Number(c.so_tien) + Number(c.phi_phat_tre_han || 0), 0)

  const selectedKioskForOrder = kiosks.find(k => k.id === orderForm.kiosk_id) || kiosks[0];
  const availableCombos = useMemo(() => {
    return combos.filter(c => {
      if (!selectedKioskForOrder) return true;
      const name = (c.ten_combo || '').toLowerCase();
      const type = selectedKioskForOrder.loai_kiosk;
      if (type === 'XE_LUU_DONG') return name.includes('xe') || name.includes('lưu động');
      if (type === 'KIOSK_CO_DINH') return name.includes('cố định');
      if (type === 'CONTAINER_CAFE') return name.includes('container');
      return true;
    });
  }, [combos, selectedKioskForOrder]);

  useEffect(() => {
    if (availableCombos.length > 0 && !availableCombos.find(c => c.id === orderForm.combo_id)) {
      setOrderForm(f => ({ ...f, combo_id: availableCombos[0].id }));
    }
  }, [availableCombos, orderForm.combo_id]);

  // ★ COMPUTED from activeKioskId context
  const activeKiosk = kiosks.find(k => k.id === activeKioskId) || kiosks[0] || null
  const availability = useKioskAvailability(activeKiosk?.ma_kiosk, session?.token || session?.accessToken)
  const congNoTheoKiosk = congNos.filter(c => ['KHOI_TAO','NGUYEN_LIEU'].includes(c.loai_phat_sinh) && (!activeKioskId || c.kiosk_id === activeKioskId))
  const royaltyTheoKiosk = royalties.filter(r => !activeKioskId || r.kiosk_id === activeKioskId)
  const donTheoKiosk = dons.filter(d => !activeKioskId || d.kiosk_id === activeKioskId)
  const comboOrderTrend = useMemo(() => {
    const months = {}
    for (const order of dons) {
      const date = new Date(order.ngay_tao)
      if (!order.ngay_tao || !Number.isFinite(date.getTime())) continue
      const month = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7)
      months[month] = (months[month] || 0) + 1
    }
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }))
  }, [dons])

  const LOAI_KIOSK_LABEL = {
    'XE_LUU_DONG': { label: 'Xe lưu động', color: '#0369a1', bg: "#f6f8fa" },
    'KIOSK_CO_DINH': { label: 'Kiosk cố định', color: 'var(--primary)', bg: 'var(--primary-light)' },
    'CONTAINER_CAFE': { label: 'Container café', color: '#1e40af', bg: "#f6f8fa" },
  }

  const filterMenuByKiosk = (items, kType) => {
    if (!kType) return items;
    return items.filter(m => {
      const cat = String(getCategoryName(m.danh_muc || m.danhMuc)).toLowerCase()
      // Luôn loại bỏ các danh mục nội bộ không kinh doanh lẻ tại quầy Kiosk
      if (cat.includes('topping') || cat.includes('ưu đãi') || cat.includes('merchandise')) {
        return false
      }
      // 1. Gói Xe Cà Phê Lưu Động (XE_LUU_DONG)
      if (kType === 'XE_LUU_DONG') {
        const isCoffeeOrTea =
          cat.includes('cà phê') || cat.includes('espresso') ||
          cat.includes('americano') || cat.includes('latte') ||
          cat.includes('trà')
        const isFood = cat.includes('bánh') || cat.includes('pizza')
        return isCoffeeOrTea && !isFood
      }
      // 2. Gói Kiosk Cố Định (KIOSK_CO_DINH)
      if (kType === 'KIOSK_CO_DINH') {
        return !cat.includes('pizza') && !cat.includes('bánh mặn')
      }
      // 3. Gói Container Café (CONTAINER_CAFE)
      if (kType === 'CONTAINER_CAFE') {
        return !cat.includes('pizza')
      }
      return true
    })
  }

  const availableMenu = filterMenuByKiosk(menuItems, activeKiosk?.loai_kiosk)

  const packageMeta = useMemo(() => {
    if (!activeKiosk) return { name: 'Đang tải...', short: '...', bg: '#f6f8fa', color: '#526174', border: '#cbd5e1' }
    if (activeKiosk.loai_kiosk === 'CONTAINER_CAFE') {
      return { name: 'Gói VIP (Container)', short: 'VIP', bg: "#f6f8fa", color: '#991b1b', border: '#fecaca' }
    }
    if (activeKiosk.loai_kiosk === 'XE_LUU_DONG') {
      return { name: 'Gói Cơ Bản (Xe Kiosk)', short: 'Cơ Bản', bg: "#f6f8fa", color: '#1e40af', border: '#bfdbfe' }
    }
    return { name: 'Gói Tiêu Chuẩn (Cố Định)', short: 'Tiêu Chuẩn', bg: 'var(--primary-light)', color: 'var(--primary)', border: '#bfdbfe' }
  }, [activeKiosk])

  useEffect(() => {
    if (!activeKioskId) return;
    const kiosk = kiosks.find(k => k.id === activeKioskId);
    if (!kiosk?.ma_kiosk) return;
    fetch(`${API_BASE_URL}/orders/kiosk-prices?ma_kiosk=${kiosk.ma_kiosk}`)
      .then(r => r.json())
      .then(data => setKioskPrices(Array.isArray(data?.items) ? data.items : []))
      .catch(e => console.error('Lỗi tải giá kiosk:', e))
  }, [activeKioskId, kiosks])

  const packageAllowedMenu = useMemo(() => {
    return availableMenu.map(item => {
      const kp = kioskPrices.find(p => Number(p.ma_san_pham) === Number(item.ma_san_pham));
      return kp ? { ...item, gia_ban: kp.gia_kiosk } : item;
    });
  }, [availableMenu, kioskPrices])

  const switchKiosk = (kioskId) => {
    if (kioskId === activeKioskId) return true
    if (posCart.length && !window.confirm('Giỏ hàng chưa thanh toán sẽ được xóa khi đổi kiosk. Tiếp tục?')) return false
    setPosKioskSelected(false)
    setActiveKioskShift(null)
    setKioskPrices([])
    setActiveKioskId(kioskId)
    posOrderScope.current = ''
    setPosOrders([])
    setOrderForm(f => ({ ...f, kiosk_id: kioskId, combo_id: '' }))
    setPosCart([])
    setPosOrderResult(null)
    setMenuSearch('')
    setMenuCategory('')
    loadActiveKioskShift(kioskId)
    return true
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
  }, [tab, activeKioskId, posDateFilter, weekOffset])

  const TABS = [
    { id: 'dashboard', icon: Store, label: 'Tổng quan Kiosk' },
    { id: 'pos', icon: Coffee, label: 'Bán hàng POS' },
    { id: 'staff_manage', icon: Users, label: 'Quản lý nhân viên' },
    { id: 'shift_schedule', icon: CalendarDays, label: 'Phân ca làm việc' },
    { id: 'kiosk_shifts', icon: Clock, label: 'Ca trực & Chốt ca' },
    { id: 'pos_orders', icon: Receipt, label: 'Đơn bán hàng' },
    { id: 'menu', icon: FileText, label: 'Thực đơn' },
    { id: 'wallet', icon: Wallet, label: 'Ví điện tử' },
    { id: 'order', icon: Package, label: 'Đặt Combo' },
    { id: 'history', icon: FileText, label: 'Lịch sử nhập' },
    { id: 'debt', icon: CreditCard, label: 'Công nợ' },
    { id: 'royalty', icon: TrendingUp, label: "Chia sẻ doanh thu" },
    { id: 'expansion', icon: Store, label: 'Mở rộng chi nhánh' },
  ]

  const alertBanner = msg && (
    <div className="kiosk-staff-toast" role={msg.type === 'error' ? 'alert' : 'status'} style={{
      padding: '12px 18px', borderRadius: 8, marginBottom: 16,
      background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
      color: msg.type === 'success' ? '#166534' : '#991b1b',
      fontWeight: 500, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {msg.type === 'success' ? <CheckCircle2 size={18} color="#15803d" /> : <AlertTriangle size={18} color="#dc2626" />}
        <span>{msg.text}</span>
      </div>
      <Button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</Button>
    </div>
  )

  return (
    <ErrorBoundary>
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div className="console-shell franchise-owner-workspace kiosk-workspace" data-actor="partner" style={{ display: 'flex', minHeight: '100vh', fontFamily: '"Segoe UI",Inter,system-ui,sans-serif', background: '#f8fafc' }}>
        <WorkspaceSidebar groups={[
          { label: 'Điểm bán & vận hành', items: TABS.filter(item => ['dashboard','pos','staff_manage','shift_schedule','kiosk_shifts','pos_orders','menu'].includes(item.id)) },
          { label: 'Nguyên liệu & tài chính', items: TABS.filter(item => ['wallet','order','history','debt','royalty','expansion'].includes(item.id)) },
        ]} activeTab={tab} onSelect={setTab} session={session} label="Đối tác kiosk" onLogout={onLogout} />

        {/* ── Main Content Area ───────────────────────────── */}
        <main className="console-main" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <OperationalPageFrame groups={[
            {label:'Điểm bán & vận hành',items:TABS.filter(item=>['dashboard','pos','staff_manage','shift_schedule','kiosk_shifts','pos_orders','menu'].includes(item.id))},
            {label:'Nguyên liệu & tài chính',items:TABS.filter(item=>['wallet','order','history','debt','royalty','expansion'].includes(item.id))}
          ]} activeTab={tab} onSelect={setTab} session={session} onLogout={onLogout} branchName="Đối tác kiosk" headerContext={tab!=='wallet'&&kiosks.length>0?<KioskScopePicker kiosks={kiosks} value={activeKioskId} onChange={id=>{if(switchKiosk(id)&&tab==='pos')setPosKioskSelected(kiosks.find(k=>k.id===id)?.trang_thai==='DANG_HOAT_DONG')}}/>:null} pageDescriptions={{dashboard:'Theo dõi các kiosk, kết quả bán hàng và tình hình vận hành.',pos:'Chọn điểm bán, mở ca và nhận thanh toán tại kiosk.',shift_schedule:'Phân ca theo tuần, duyệt đăng ký và cập nhật chấm công.',staff_manage:'Quản lý tài khoản, quyền truy cập và kiosk được phân công.',kiosk_shifts:'Theo dõi ca bán hàng và đối chiếu tiền cuối ca.',pos_orders:'Tra cứu và xử lý các đơn bán tại kiosk.',order:'Chọn combo nguyên liệu và theo dõi thanh toán.',history:'Theo dõi các lần nhập combo của từng kiosk.',debt:'Đối chiếu công nợ và hạn thanh toán.',royalty:'Theo dõi khoản chia sẻ doanh thu với thương hiệu theo tỷ lệ phần trăm trong hợp đồng.',wallet:'Xem số dư và lịch sử giao dịch ví.',expansion:'Đăng ký thêm kiosk trong hệ thống.'}}>
          {/* Tab Body */}
          <div className="console-partner-body workspace-tab-content" style={{ padding: '24px 32px', flex: 1 }}>
            <WorkspaceErrorBoundary key={tab} inline>
            {alertBanner}
            {tab === 'pos' && posKioskSelected && availability.loading && <p role="status">Đang tải trạng thái bán của kiosk…</p>}
            {tab === 'pos' && posKioskSelected && availability.error && <div role="alert" className="workspace-form-error">{availability.error}<Button type="button" variant="outline" onClick={availability.reload}>Thử tải lại trạng thái bán</Button></div>}
            {tab === 'pos' && !loading && (!posKioskSelected ? <KioskPosPicker kiosks={kiosks} onSelect={id=>{if(switchKiosk(id))setPosKioskSelected(true)}}/> : <KioskIdentity kiosk={activeKiosk}><Button type="button" variant="outline" onClick={()=>{if(posCart.length && !window.confirm('Giỏ hàng chưa thanh toán sẽ được xóa khi đổi kiosk. Tiếp tục?'))return;setPosCart([]);setPosKioskSelected(false)}}>Đổi kiosk</Button></KioskIdentity>)}

            {loading ? (
              <DashboardSkeleton />
            ) : (
              <>
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 1: TỔNG QUAN (DASHBOARD) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'dashboard' && (
                  <div>
                    {/* Tiến độ gói nhượng quyền & Tất toán hợp đồng */}
                    {activeKiosk && (() => {
                      const goiDebt = congNos.find(c => c.kiosk_id === activeKiosk.id && c.loai_phat_sinh === 'KHOI_TAO');
                      const isChuaTatToan = goiDebt && goiDebt.trang_thai !== 'DA_THANH_TOAN';

                      return (
                        <div style={{
                          background: isChuaTatToan ? '#ffffff' : '#f0fdf4',
                          border: `1px solid ${isChuaTatToan ? '#e2e8f0' : '#bbf7d0'}`,
                          borderRadius: 12,
                          padding: '16px 20px',
                          marginBottom: 24,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 16,
                          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                              width: 42, height: 42, borderRadius: 10,
                              background: isChuaTatToan ? '#fef2f2' : '#dcfce7',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: isChuaTatToan ? '#b22830' : '#15803d'
                            }}>
                              {isChuaTatToan ? <CreditCard size={20} /> : <CheckCircle2 size={20} />}
                            </div>
                            <div>
                              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>
                                {isChuaTatToan ? 'Hợp Đồng Nhượng Quyền — Chờ Tất Toán 100%' : 'Hợp Đồng Nhượng Quyền Đã Hoàn Tất 100%'}
                              </div>
                              <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
                                Kiosk: <b>{activeKiosk.ten_kiosk}</b> ({activeKiosk.ma_kiosk}) · Gói: <b>{activeKiosk.loai_kiosk}</b>
                                {isChuaTatToan ? (
                                  <span> · Đã đặt cọc: <b style={{ color: '#15803d' }}>5.000.000đ</b> · Cần thanh toán nốt: <b style={{ color: '#b91c1c' }}>{fmtMoney(goiDebt.so_tien)}</b></span>
                                ) : (
                                  <span> · Toàn bộ chi phí gói nhượng quyền đã được tất toán</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            {isChuaTatToan ? (
                              <Button
                                onClick={() => openTatToanModal(activeKiosk.id)}
                                style={{
                                  padding: '8px 16px', borderRadius: 8, border: 'none',
                                  background: '#b22830', color: '#fff', fontSize: 13, fontWeight: 600,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                                }}
                              >
                                <CreditCard size={15} /> Thanh toán nốt gói ({fmtMoney(goiDebt.so_tien)})
                              </Button>
                            ) : (
                              <Button
                                onClick={() => openTatToanModal(activeKiosk.id)}
                                style={{
                                  padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                                  background: '#fff', color: '#475569', fontSize: 13, fontWeight: 500,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                                }}
                              >
                                <CheckCircle2 size={15} color="#15803d" /> Xem thông tin gói
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Hero Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 16, marginBottom: 28 }}>
                      {[
                        { icon: Store, label: 'Kiosk đang hoạt động', value: kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').length + ' / ' + kiosks.length, color: '#15803d', bg: "#f0fdf4" },
                        { icon: Users, label: 'Nhân sự con tại Kiosk', value: subStaffList.length, color: '#b22830', bg: '#fef2f2' },
                        { icon: Package, label: 'Tổng combo nguyên liệu', value: kiosks.reduce((s, k) => s + (k.so_combo_hien_tai || 0), 0), color: '#d97706', bg: "#fffbeb" },
                        { icon: CreditCard, label: 'Công nợ chưa thanh toán', value: fmtMoney(tongCongNo), color: tongCongNo > 0 ? '#b91c1c' : '#15803d', bg: tongCongNo > 0 ? "#fef2f2" : "#f0fdf4" },
                      ].map((s, i) => {
                        const IconComp = s.icon
                        return (
                          <div key={i} className="workspace-partner-stat" style={{ background: '#ffffff', borderRadius: 12, padding: '20px 22px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: '0.02em' }}>{s.label}</span>
                              <div style={{ width: 34, height: 34, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <IconComp size={18} color={s.color} />
                              </div>
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="console-charts">
                      <Chart title="Xu hướng nhập combo" subtitle="Số đơn theo tháng trong dữ liệu đã tải · giờ Việt Nam" type="line" rows={comboOrderTrend} />
                      <Chart title="Đơn nhập combo theo kiosk" subtitle="Toàn bộ đơn nhập trong dữ liệu đã tải" rows={kiosks.map(kiosk => ({label:kiosk.ten_kiosk || kiosk.ten || kiosk.ma_kiosk, value:dons.filter(order => order.kiosk_id === kiosk.id).length}))} />
                      <Chart title="Trạng thái điểm bán" type="donut" rows={Object.entries(kiosks.reduce((groups,kiosk) => {const label=kiosk.trang_thai || 'Chưa xác định';groups[label]=(groups[label] || 0)+1;return groups},{})).map(([label,value]) => ({label:({'DANG_HOAT_DONG':'Đang hoạt động','TAM_NGUNG':'Tạm ngưng','CHO_DUYET':'Chờ duyệt'})[label] || label,value}))} />
                      <Chart title="Giá trị công nợ theo kiosk" subtitle="Khoản chưa thanh toán và phí trễ hạn" format={fmtMoney} rows={kiosks.map(kiosk => ({label:kiosk.ten_kiosk || kiosk.ten || kiosk.ma_kiosk,value:congNos.filter(debt => debt.kiosk_id === kiosk.id && debt.trang_thai !== 'DA_THANH_TOAN').reduce((sum,debt) => sum+Number(debt.so_tien || 0)+Number(debt.phi_phat_tre_han || 0),0)}))} />
                    </div>

                    {/* Kiosk list cards */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', margin: 0 }}>Danh Sách Kiosk Của Tôi</h3>
                      <Button onClick={() => setTab('staff_manage')} style={{
                        padding: '8px 14px', background: '#b22830', color: '#fff', border: 'none', borderRadius: 8,
                        fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
                      }}>
                        <UserPlus size={15} /> Quản lý nhân viên
                      </Button>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                      <SearchableSelect className="franchise-filter-select"
                        value={kioskFilterStatus} 
                        onChange={(e) => { setKioskFilterStatus(e.target.value); setKioskPage(1); }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none' }}
                      >
                        <option value="ALL">Tất cả trạng thái</option>
                        <option value="DANG_HOAT_DONG">Đang hoạt động</option>
                        <option value="TAM_DUNG">Tạm dừng</option>
                      </SearchableSelect>

                      <SearchableSelect className="franchise-filter-select"
                        value={kioskFilterType} 
                        onChange={(e) => { setKioskFilterType(e.target.value); setKioskPage(1); }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none' }}
                      >
                        <option value="ALL">Tất cả loại hình</option>
                        {Object.keys(LOAI_KIOSK_LABEL).map(k => (
                          <option key={k} value={k}>{LOAI_KIOSK_LABEL[k].label}</option>
                        ))}
                      </SearchableSelect>
                    </div>

                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                      {(() => {
                        let filtered = kiosks.filter(k => {
                          if (kioskFilterStatus !== 'ALL' && k.trang_thai !== kioskFilterStatus) return false;
                          if (kioskFilterType !== 'ALL' && k.loai_kiosk !== kioskFilterType) return false;
                          return true;
                        });
                        const limit = 6;
                        const totalPages = Math.ceil(filtered.length / limit) || 1;
                        const start = (kioskPage - 1) * limit;
                        const paginated = filtered.slice(start, start + limit);

                        if (filtered.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b', gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>Không tìm thấy Kiosk phù hợp</div>;

                        return (
                          <>
                            {paginated.map(k => {
                              const loai = LOAI_KIOSK_LABEL[k.loai_kiosk] || { label: k.loai_kiosk, emoji: <WorkspaceSymbolStore size="1em" aria-hidden="true" />, color: '#64748b', bg: '#f8fafc' }
                              const kioskCongNo = congNos.filter(c => c.kiosk_id === k.id && c.trang_thai !== 'DA_THANH_TOAN')
                              const tongNoKiosk = kioskCongNo.reduce((s, c) => s + Number(c.so_tien), 0)
                              const isActive = k.id === activeKioskId
                              return (
                                <div key={k.id} style={{
                                  background: '#ffffff', borderRadius: 12, border: `1px solid ${isActive ? '#b22830' : '#e2e8f0'}`,
                                  boxShadow: isActive ? '0 0 0 1.5px #b22830' : '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
                                  overflow: 'hidden', transition: 'all .15s ease'
                                }}>
                                  <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', fontSize: 18, color: '#334155' }}>
                                        {loai.emoji}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: 14.5, color: '#0f172a' }}>{k.ten_kiosk}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>{loai.label} • <span style={{ fontFamily: 'monospace' }}>{k.ma_kiosk}</span></div>
                                      </div>
                                    </div>
                                    <StatusBadge status={k.trang_thai}>

                                      {k.trang_thai === 'DANG_HOAT_DONG' ? 'Đang hoạt động' : 'Tạm dừng'}
                                    </StatusBadge>
                                  </div>

                                  <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc' }}>
                                    <div>
                                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.02em' }}>COMBO NGUYÊN LIỆU</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{k.so_combo_hien_tai || 0}</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, color: tongNoKiosk > 0 ? '#b91c1c' : '#64748b', fontWeight: 600, letterSpacing: '0.02em' }}>CÔNG NỢ</div>
                                      <div style={{ fontSize: 16, fontWeight: 700, color: tongNoKiosk > 0 ? '#b91c1c' : '#0f172a', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(tongNoKiosk)}</div>
                                    </div>
                                  </div>

                                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', background: '#ffffff' }}>
                                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                                      <WorkspaceSymbolMapPin size="1.1em" aria-hidden="true" /> {k.dia_chi}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                      <Button onClick={() => openReviewModal(k)} style={{
                                        padding: '5px 10px', borderRadius: 6, border: '1px solid #fef08a', background: '#fefce8',
                                        color: '#854d0e', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                      }}>
                                        <Star size={13} /> Đánh giá
                                      </Button>
                                      <Button onClick={() => { switchKiosk(k.id); setTab('kiosk_shifts'); }} style={{
                                        padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#ffffff',
                                        color: '#334155', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                      }}>
                                        <Clock size={13} /> Ca trực
                                      </Button>
                                      <Button onClick={() => { switchKiosk(k.id); setTab('pos'); }} style={{
                                        padding: '5px 12px', borderRadius: 6, border: 'none', background: '#b22830',
                                        color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                      }}>
                                        <Coffee size={13} /> POS
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}

                            {/* Pagination controls */}
                            {totalPages > 1 && (
                              <div data-modal-actions="true" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
                                <Button
                                  disabled={kioskPage <= 1}
                                  onClick={() => setKioskPage(p => p - 1)}
                                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: kioskPage <= 1 ? '#f8fafc' : '#ffffff', color: kioskPage <= 1 ? '#94a3b8' : '#334155', cursor: kioskPage <= 1 ? 'not-allowed' : 'pointer', fontSize: 12.5 }}
                                >
                                  Trước
                                </Button>
                                <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>Trang {kioskPage} / {totalPages}</span>
                                <Button
                                  disabled={kioskPage >= totalPages}
                                  onClick={() => setKioskPage(p => p + 1)}
                                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: kioskPage >= totalPages ? '#f8fafc' : '#ffffff', color: kioskPage >= totalPages ? '#94a3b8' : '#334155', cursor: kioskPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12.5 }}
                                >
                                  Sau
                                </Button>
                              </div>
                            )}
                          </>
                        )
                      })()}
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
                      <Button onClick={() => {
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
                        padding: '12px 22px', background: 'var(--primary)', color: '#fff', border: 'none',
                        borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', transition: 'all .2s'
                      }}>
                        <UserPlus size={16} /> Thêm nhân viên con mới
                      </Button>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="franchise-filter-bar" style={{ display: 'flex', gap: 14, marginBottom: 22, background: '#fff', padding: '14px 18px', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div className="kiosk-search-field" style={{ flex: 1, minWidth: 260, position: 'relative' }}>
                        <Search size={18} color="#526174" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <Input
                          type="text"
                          value={staffSearch}
                          onChange={e => setStaffSearch(e.target.value)}
                          placeholder="Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại..."
                          style={{ width: '100%', padding: '10px 14px 10px 42px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#f6f8fa', boxSizing: 'border-box' }}
                        />
                      </div>
                      <Button onClick={loadStaffList} style={{ padding: '10px 16px', background: '#f6f8fa', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer', fontWeight: 700, color: '#526174', display: 'flex', alignItems: 'center', gap: 6, transition: 'background .15s' }}>
                        <RefreshCw size={14} /> Tải lại
                      </Button>
                      <div style={{ padding: '6px 14px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary-hover)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={15} /> {subStaffList.length} nhân sự
                      </div>
                    </div>

                    {/* Staff Table */}
                    {subStaffLoading ? (
                      <div style={{ textAlign: 'center', padding: 80, color: '#526174', fontSize: 15, background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#16354d' }} />
                        <div style={{ fontWeight: 700 }}>Đang tải danh sách nhân viên con...</div>
                      </div>
                    ) : (
                      <div className="kiosk-staff-table" style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <Table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 900, tableLayout: 'fixed' }}>
                            <thead>
                              <tr style={{ background: '#f6f8fa', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase', letterSpacing: '0.05em', width: '25%' }}>Nhân viên</th>
                                <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase', letterSpacing: '0.05em', width: '25%' }}>Liên hệ</th>
                                <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase', letterSpacing: '0.05em', width: '23%' }}>Kiosk</th>
                                <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase', letterSpacing: '0.05em', width: 130, textAlign: 'center' }}>Trạng thái</th>
                                <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase', letterSpacing: '0.05em', width: 140, textAlign: 'right' }}>Hành động</th>
                              </tr>
                            </thead>
                            <tbody>
                              <PaginatedList items={subStaffList.filter(s => {
                                const matchKiosk = !activeKioskId || s.kiosk_id === activeKioskId || s.co_so_ma === activeKiosk?.ma_kiosk
                                const matchSearch = !staffSearch || (s.ho_ten || '').toLowerCase().includes(staffSearch.toLowerCase()) || (s.ten_dang_nhap || '').toLowerCase().includes(staffSearch.toLowerCase()) || (s.so_dien_thoai || '').includes(staffSearch)
                                return matchKiosk && matchSearch
                              })} resetKey={JSON.stringify([staffSearch,activeKioskId])} layout="table" columns={5}>{s => {
                                const isActive = s.trang_thai === 'ACTIVE'
                                const kioskObj = kiosks.find(k => k.id === s.kiosk_id)
                                const kioskName = kioskObj?.ten_kiosk || s.co_so_ten || s.co_so_ma || 'Chưa gán'

                                return (
                                  <tr key={s.ma_nguoi_dung || s.id} style={{ borderBottom: '1px solid #f6f8fa', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f6f8fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    {/* Nhân viên */}
                                    <td style={{ padding: '14px 16px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                                          background: '#f6f8fa', color: '#142b3e',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontWeight: 600, fontSize: 16, border: '1px solid #cbd5e1'
                                        }}>
                                          {s.ho_ten?.charAt(0).toUpperCase() || 'U'}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: 600, color: '#142b3e', fontSize: 14 }}>{s.ho_ten}</div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginTop: 3 }}>
                                            <span style={{ fontSize: 12, color: '#526174' }}>@{s.ten_dang_nhap}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Liên hệ */}
                                    <td style={{ padding: '14px 16px', overflowWrap: 'anywhere' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#263c50', fontWeight: 600 }}>
                                          <Phone size={13} color="#526174" />
                                          <span>{s.so_dien_thoai || '—'}</span>
                                        </div>
                                        {s.email && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#526174' }}>
                                            <Mail size={13} color="#526174" />
                                            <span>{s.email}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    {/* Kiosk trực thuộc */}
                                    <td style={{ padding: '14px 16px' }}>
                                      <span className="kiosk-staff-location"><Store size={15} /><span>{kioskName}</span></span>
                                    </td>

                                    {/* Trạng thái */}
                                    <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                      <StatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'}>{isActive ? 'Hoạt động' : 'Đã khóa'}</StatusBadge>
                                    </td>

                                    {/* Hành động */}
                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                      <div className="kiosk-staff-row-actions">
                                        <Button variant="outline" size="icon" aria-label={`Sửa nhân viên ${s.ho_ten}`} onClick={() => {
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
                                          padding: '6px 10px', background: 'var(--primary-light)', color: '#0284c7', border: '1px solid #bae6fd',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Sửa thông tin & phân quyền POS">
                                          <Edit3 size={16} />
                                        </Button>
                                        <Button variant="outline" size="icon" aria-label={`Đặt lại mật khẩu ${s.ho_ten}`} onClick={() => {
                                          setSelectedStaff(s);
                                          setResetPwdInput('123456');
                                          setShowResetPwdModal(true);
                                        }} style={{
                                          padding: '6px 10px', background: "#f6f8fa", color: '#d97706', border: '1px solid #fde68a',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Đặt lại mật khẩu">
                                          <Key size={16} />
                                        </Button>
                                        <Button variant="outline" size="icon" data-intent="danger" aria-label={`Khóa nhân viên ${s.ho_ten}`} onClick={() => handleDeleteStaff(s)} style={{
                                          padding: '6px 10px', background: "#f6f8fa", color: '#dc2626', border: '1px solid #fecaca',
                                          borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'inline-flex',
                                          alignItems: 'center', gap: 4, transition: 'all .15s'
                                        }} title="Vô hiệu hóa tài khoản nhân viên">
                                          <Trash2 size={16} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              }}</PaginatedList>
                            </tbody>
                          </Table>
                        </div>

                        {subStaffList.length === 0 && (
                          <div style={{ textAlign: 'center', padding: 60, color: '#526174' }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f6f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                              <Users size={28} color="#526174" />
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 16, color: '#142b3e' }}>Chưa có tài khoản nhân viên con nào</div>
                            <p style={{ fontSize: 13, color: '#526174', marginTop: 4, maxWidth: 400, margin: '4px auto 0' }}>Bấm nút "Thêm nhân viên con mới" ở góc trên để cấp tài khoản cho nhân viên Kiosk của bạn.</p>
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
                  <div className="kiosk-schedule-panel">
                    <div className="kiosk-schedule-toolbar">
                      <div className="kiosk-week-navigation"><Button type="button" variant="outline" size="icon" aria-label="Tuần trước" onClick={()=>setWeekOffset(w=>w-1)}><ChevronLeft size={17}/></Button><span>{currentWeekDays[0]?.dateKey?.split('-').reverse().join('/')} – {currentWeekDays[6]?.dateKey?.split('-').reverse().join('/')}</span><Button type="button" variant="outline" size="icon" aria-label="Tuần sau" onClick={()=>setWeekOffset(w=>w+1)}><ChevronRight size={17}/></Button><Button type="button" variant="outline" onClick={()=>setWeekOffset(0)}>Tuần hiện tại</Button></div>
                      <div><Button type="button" variant="outline" size="icon" aria-label="Tải lại lịch phân ca" disabled={workShiftsLoading} onClick={()=>loadWorkShifts(activeKioskId,weekOffset)}><RefreshCw size={16}/></Button><Button type="button" variant="default" onClick={()=>{setShiftScheduleForm({staff_username:subStaffList[0]?.ten_dang_nhap||'',staff_name:subStaffList[0]?.ho_ten||'',shift_date:new Date().toLocaleDateString('sv-SE'),shift_code:'SANG',note:''});setShowCreateShiftModal(true)}}><Plus size={16}/>Phân ca mới</Button></div>
                    </div>

                    {shiftRequests.some(r=>r.trang_thai_yeu_cau==='PENDING')&&<div className="kiosk-pending-requests"><StatusBadge status="PENDING">{shiftRequests.filter(r=>r.trang_thai_yeu_cau==='PENDING').length} yêu cầu chờ duyệt</StatusBadge><span>Xem nguyện vọng đăng ký trước khi chốt lịch làm việc.</span><Button type="button" variant="outline" onClick={()=>setShowShiftRequestsModal(true)}>Xem yêu cầu</Button><Button type="button" variant="default" disabled={shiftRequestsLoading} onClick={handleApproveAllPending}><Check size={15}/>Duyệt tất cả</Button></div>}

                    <KioskScheduleGrid days={currentWeekDays} templates={SHIFT_TEMPLATES} items={workShifts} loading={workShiftsLoading} handlingId={approvingRequestId}
                      onAssign={(day,code)=>{setShiftScheduleForm({staff_username:subStaffList[0]?.ten_dang_nhap||'',staff_name:subStaffList[0]?.ho_ten||'',shift_date:day,shift_code:code,note:''});setShowCreateShiftModal(true)}}
                      onDelete={handleDeleteWorkShift} onApprove={handleApproveShiftRequest} onReject={handleRejectShiftRequest} onAttendance={handleUpdateAttendance}/>

                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB 4: CA TRỰC KIOSK & CHỐT CA (RÀNG BUỘC MỞ CA & 1 CA/KIOSK) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: GIÁM SÁT CA TRỰC & ĐỐI SOÁT KÉT TIỀN (kiosk_shifts) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'kiosk_shifts' && <KioskShiftPanel active={activeKioskShift} history={kioskShiftHistory} loading={activeKioskShiftLoading} historyLoading={kioskShiftHistoryLoading} busy={shiftActionSubmitting}
                  onRefresh={() => { loadActiveKioskShift(activeKioskId); loadKioskShiftHistory(activeKioskId) }}
                  onOpen={() => setShowOpenShiftModal(true)} onClose={() => setShowCloseShiftModal(true)} onForceClose={() => setShowForceCloseModal(true)} onOrders={() => setTab('pos_orders')} onReview={handleKioskCloseApproval} />}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ĐƠN BÁN HÀNG POS (pos_orders) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'pos_orders' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#526174' }}>Thời gian:</span>
                        <SearchableSelect className="franchise-filter-select" value={posDateFilter} onChange={e => setPosDateFilter(e.target.value)}
                          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff', outline: 'none', fontWeight: 600 }}>
                          <option value="today">Hôm nay</option>
                          <option value="week">Tuần này</option>
                          <option value="month">Tháng này</option>
                          <option value="all">Tất cả</option>
                        </SearchableSelect>
                        <Button onClick={() => loadPosOrders(activeKioskId, posDateFilter, true)} disabled={posOrderLoading} style={{ padding: '8px 14px', background: '#f6f8fa', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 700, color: '#526174' }}>
                          <RefreshCw size={14} /> Tải lại
                        </Button>
                      </div>
                    </div>

                    {posOrderError && <p className="workspace-form-error" role="alert">{posOrderError}</p>}
                    {posOrderLoading && !posOrders.length ? (
                      <KioskTableLoading label="Đang tải đơn bán hàng" />
                    ) : (
                      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                        <Table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f6f8fa', borderBottom: '1px solid #e2e8f0' }}>
                              {['Mã Đơn', 'Ngày tạo', 'Khách hàng', 'Tổng tiền', 'Thanh toán', 'Chi tiết món', 'Trạng thái', 'Thao tác'].map(h => (
                                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#526174', textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <PaginatedList items={posOrders} resetKey={JSON.stringify([activeKioskId,posDateFilter])} layout="table" columns={8}>{(d) => {
                              const isVoided = d.trang_thai_don_hang === 'DA_HUY' || d.trang_thai_thanh_toan === 'DA_HOAN_TIEN'
                              const isShiftOpen = !!activeKioskShift?.has_open_shift
                              const shiftOpenTime = activeKioskShift?.active_shift?.thoi_gian_mo_ca ? new Date(activeKioskShift.active_shift.thoi_gian_mo_ca).getTime() : 0
                              const orderTime = new Date(d.ngay_tao).getTime()
                              const isWithinActiveShift = isShiftOpen && orderTime >= shiftOpenTime

                              return (
                                <tr key={d.ma_don_hang} style={{ borderBottom: '1px solid #f6f8fa', background: isVoided ? '#fff7f7' : 'transparent' }}>
                                  <td style={{ padding: '14px 16px', fontWeight: 600, color: isVoided ? '#526174' : '#30382e', fontSize: 13 }}>
                                    #{d.ma_don_hang.substring(0, 8).toUpperCase()}
                                  </td>
                                  <td style={{ padding: '14px 16px', color: '#526174', fontSize: 13, fontWeight: 500 }}>{fmtDate(d.ngay_tao)}</td>
                                  <td style={{ padding: '14px 16px', color: '#526174', fontSize: 13, fontWeight: 600 }}>{d.ten_khach_hang || 'Khách tại quầy'}</td>
                                  <td style={{ padding: '14px 16px', fontWeight: 600, color: isVoided ? '#526174' : '#142b3e', fontSize: 15, textDecoration: isVoided ? 'line-through' : 'none' }}>
                                    {fmtMoney(d.tong_tien)}
                                  </td>
                                  <td style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: '#526174' }}>
                                    {kioskPaymentLabel(d.phuong_thuc_thanh_toan)}
                                  </td>
                                  <td style={{ padding: '14px 16px', fontSize: 12 }}>
                                    {d.chi_tiet?.map((ct, idx) => (
                                      <div key={idx} style={{ marginBottom: 2 }}>
                                        <span style={{ fontWeight: 700, color: isVoided ? '#526174' : '#263c50' }}>{ct.so_luong}x {ct.ten_san_pham}</span>
                                      </div>
                                    ))}
                                  </td>
                                  <td style={{ padding: '14px 16px' }}>
                                    <StatusBadge status={kioskSaleStatus(d).status}>{kioskSaleStatus(d).label}</StatusBadge>
                                  </td>
                                  <td style={{ padding: '14px 16px' }}>
                                    {isVoided ? (
                                      <Badge variant="outline" data-quiet-label="true" style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', background: "#f6f8fa", padding: '4px 8px', borderRadius: 6 }}>
                                        <WorkspaceSymbolCheck size="1.1em" aria-hidden="true" /> {d.trang_thai_thanh_toan === 'DA_HOAN_TIEN' ? 'Đã hoàn tiền' : 'Đã hủy'}
                                      </Badge>
                                    ) : d.trang_thai_thanh_toan !== 'DA_THANH_TOAN' ? (
                                      <span className="kiosk-muted">Chưa ghi nhận thu tiền</span>
                                    ) : isWithinActiveShift ? (
                                      <Button data-intent="danger"
                                        type="button"
                                        onClick={() => {
                                          setVoidModalOrder(d)
                                          setShowVoidModal(true)
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          border: '1.5px solid #e2e8f0',
                                          backgroundColor: '#ffffff',
                                          color: '#dc2626',
                                          fontWeight: 600,
                                          fontSize: 12,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        <RotateCcw size={13} color="#dc2626" />
                                        <span>Hoàn tiền</span>
                                      </Button>
                                    ) : (
                                      <Button data-intent="danger"
                                        type="button"
                                        disabled
                                        title={!isShiftOpen ? "Kiosk chưa mở ca làm việc" : "Đơn thuộc ca làm việc trước đã chốt - Không thể hoàn/hủy"}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          border: '1px solid #cbd5e1',
                                          backgroundColor: '#f6f8fa',
                                          color: '#526174',
                                          fontWeight: 600,
                                          fontSize: 12,
                                          cursor: 'not-allowed',
                                          opacity: 0.5,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5
                                        }}
                                      >
                                        <RotateCcw size={13} color="#526174" />
                                        <span>Hoàn tiền</span>
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              )
                            }}</PaginatedList>
                          </tbody>
                        </Table>
                        {posOrders.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#526174' }}>Chưa có đơn bán hàng nào trong thời gian này.</div>}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: THỰC ĐƠN (menu) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'menu' && (() => {
                  const filteredMenu = packageAllowedMenu.filter(m => {
                    const matchSearch = !menuSearch || (m.ten_san_pham || m.tenSanPham || '').toLowerCase().includes(menuSearch.toLowerCase())
                    const matchCat = !menuCategory || getCategoryName(m.danh_muc || m.danhMuc) === menuCategory
                    return matchSearch && matchCat
                  })
                  const categories = [...new Set(availableMenu.map(m => getCategoryName(m.danh_muc || m.danhMuc)).filter(Boolean))]
                  const totalPages = Math.ceil(filteredMenu.length / itemsPerPage) || 1
                  const currentKioskLabel = LOAI_KIOSK_LABEL[activeKiosk?.loai_kiosk]?.label || 'Container café'

                  return (
                    <div>
                      {/* Thống kê gói & bộ lọc tìm kiếm */}
                      <div style={{ background: '#ffffff', padding: '18px 24px', borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Badge variant="outline" data-quiet-label="true" style={{
                              padding: '5px 12px', borderRadius: 8, background: "#f6f8fa",
                              color: '#1e40af', border: '1px solid #bfdbfe', fontSize: 13, fontWeight: 600
                            }}>
                              Gói {currentKioskLabel}
                            </Badge>
                            <span style={{ fontSize: 13, color: '#526174', fontWeight: 600 }}>
                              Áp dụng: <strong style={{ color: '#142b3e' }}>{availableMenu.length}</strong> món chuẩn gói nhượng quyền
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#526174' }}>
                            Đang xem <b>{filteredMenu.length}</b> món phù hợp
                          </div>
                        </div>

                        <div className="franchise-filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          <Input
                            value={menuSearch}
                            onChange={e => { setMenuSearch(e.target.value); setMenuPage(1); }}
                            placeholder="Tìm kiếm tên món..."
                            style={{ flex: 1, minWidth: 220, padding: '10px 16px', border: '1.5px solid #cbd5e1', borderRadius: 10, fontSize: 14, outline: 'none', background: '#f6f8fa', color: '#142b3e' }}
                          />
                          <SearchableSelect
                            className="franchise-filter-select"
                            value={menuCategory}
                            onChange={e => { setMenuCategory(e.target.value); setMenuPage(1); }}
                            style={{ padding: '10px 16px', border: '1.5px solid #cbd5e1', borderRadius: 10, fontSize: 14, background: '#f6f8fa', outline: 'none', fontWeight: 700, color: '#263c50' }}
                          >
                            <option value=''>Tất cả danh mục ({availableMenu.length})</option>
                            {categories.map(c => {
                              const countInCat = availableMenu.filter(m => getCategoryName(m.danh_muc || m.danhMuc) === c).length
                              return <option key={c} value={c}>{c} ({countInCat})</option>
                            })}
                          </SearchableSelect>
                        </div>
                      </div>

                      {availability.error&&<div role="alert" className="workspace-form-error">{availability.error}<Button type="button" variant="outline" onClick={availability.reload}>Thử tải lại trạng thái bán</Button></div>}
                      {availability.loading&&<p role="status">Đang tải trạng thái bán của kiosk…</p>}
                      {/* Lưới sản phẩm */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                        {filteredMenu.slice((menuPage - 1) * itemsPerPage, menuPage * itemsPerPage).map((m, i) => {
                          const name = m.ten_san_pham || m.tenSanPham || 'Sản phẩm'
                          const price = m.gia_ban || m.gia || 0
                          const img = m.hinh_anh_url || m.hinhAnhUrl || m.hinh_anh || m.hinhAnh || m.imageUrl
                          return (
                            <div key={i} style={{ background: '#ffffff', borderRadius: 18, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
                              {img ? (
                                <div style={{ width: '100%', height: 160, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, borderBottom: '1px solid #f6f8fa' }}>
                                  <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <div style={{ width: '100%', paddingTop: '75%', position: 'relative', background: '#f6f8fa', borderBottom: '1px solid #f6f8fa' }}>
                                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#526174', fontWeight: 700 }}>
                                    Hình ảnh món
                                  </div>
                                </div>
                              )}
                              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 16, color: '#142b3e', marginBottom: 4 }}>{name}</div>
                                  <div style={{ fontSize: 12, color: '#526174', fontWeight: 500 }}>{getCategoryName(m.danh_muc || m.danhMuc)}</div>
                                </div>
                                <div className="kiosk-menu-footer">
                                  <div style={{ fontWeight: 600, color: '#142b3e', fontSize: 17 }}>{fmtMoney(price)}</div>
                                  <div className="kiosk-menu-selling"><StatusBadge status={availability.isSelling(m)}>{availability.isSelling(m)?'Đang bán':'Tạm ngưng'}</StatusBadge><Switch aria-label={`Bán ${name}`} checked={availability.isSelling(m)} disabled={!availability.ready||availability.savingId!==null||m.trang_thai===false} onCheckedChange={next=>availability.toggle(m,next)}/></div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {filteredMenu.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: 16, border: '1px dashed #cbd5e1', color: '#526174', marginTop: 12 }}>
                          Không tìm thấy món phù hợp với tiêu chí tìm kiếm.
                        </div>
                      )}

                      {/* Thanh phân trang hoàn chỉnh */}
                      {filteredMenu.length > 0 && (
                        <div style={{
                          marginTop: 24, padding: '16px 20px', background: '#ffffff', borderRadius: 16,
                          border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                        }}>
                          <div style={{ fontSize: 13, color: '#526174' }}>
                            Hiển thị <b>{(menuPage - 1) * itemsPerPage + 1}</b> – <b>{Math.min(menuPage * itemsPerPage, filteredMenu.length)}</b> trong tổng số <b>{filteredMenu.length}</b> món
                          </div>

                          {totalPages > 1 && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Button
                                disabled={menuPage <= 1}
                                onClick={() => setMenuPage(p => Math.max(1, p - 1))}
                                style={{
                                  padding: '7px 14px', borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  background: menuPage <= 1 ? '#f6f8fa' : '#ffffff',
                                  color: menuPage <= 1 ? '#526174' : '#30382e',
                                  fontWeight: 700, fontSize: 13,
                                  cursor: menuPage <= 1 ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Trang trước
                              </Button>

                              <PageNumbers page={menuPage} totalPages={totalPages} onChange={setMenuPage} />

                              <Button
                                disabled={menuPage >= totalPages}
                                onClick={() => setMenuPage(p => Math.min(totalPages, p + 1))}
                                style={{
                                  padding: '7px 14px', borderRadius: 8,
                                  border: '1px solid #cbd5e1',
                                  background: menuPage >= totalPages ? '#f6f8fa' : '#ffffff',
                                  color: menuPage >= totalPages ? '#526174' : '#30382e',
                                  fontWeight: 700, fontSize: 13,
                                  cursor: menuPage >= totalPages ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Trang sau
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ĐẶT COMBO (order) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'order' && (
                  <div className="franchise-page franchise-order">
                    {(() => {
                      const selectedKiosk = kiosks.find(k => k.id === orderForm.kiosk_id) || kiosks[0];
                      const isActive = selectedKiosk?.trang_thai === 'DANG_HOAT_DONG';
                      if (!isActive) {
                        return (
                          <div style={{ background: '#f6f8fa', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32, textAlign: 'center' }}>
                            <AlertCircle size={40} color="#526174" style={{ margin: '0 auto 16px' }} />
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#263c50', marginBottom: 8 }}>Kiosk chưa khai trương chính thức</div>
                            <div style={{ fontSize: 14, color: '#526174', lineHeight: 1.6 }}>
                              Kiosk <b>{selectedKiosk?.ten_kiosk || selectedKiosk?.ma_kiosk}</b> đang ở trạng thái <b>{selectedKiosk?.trang_thai || 'chưa xác định'}</b>.<br/>
                              Chỉ có thể đặt mua combo sau khi kiosk đã <b>ĐANG HOẠT ĐỘNG</b> chính thức.
                            </div>
                          </div>
                        );
                      }
                      return (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 32, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: '#142b3e', display: 'flex', alignItems: 'center', gap: 8 }}><Package size={20} /> Đặt Mua Combo Nguyên Liệu</h3>



                      <div style={{ marginBottom: 24 }}>
                        <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 12 }}>Chọn gói combo</Label>
                        <div style={{ display: 'grid', gap: 12 }}>
                          <PaginatedList items={availableCombos} resetKey={activeKioskId}>{c => (
                            <div key={c.id} onClick={() => setOrderForm(f => ({ ...f, combo_id: c.id }))} style={{
                              padding: '16px', border: `1px solid ${orderForm.combo_id === c.id ? 'var(--primary)' : '#e2e8f0'}`,
                              borderRadius: 12, cursor: 'pointer', background: orderForm.combo_id === c.id ? 'var(--primary-light)' : '#fff',
                              transition: 'all 0.2s'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 15, color: orderForm.combo_id === c.id ? 'var(--primary)' : '#142b3e' }}>{c.ten_combo}</div>
                                  <div style={{ fontSize: 13, color: '#526174', marginTop: 4 }}>Ước tính ~{c.so_ly_pha_che_uoc_tinh} ly</div>
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#142b3e' }}>{fmtMoney(c.gia_ban)}</div>
                              </div>
                            </div>
                          )}</PaginatedList>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Số lượng</Label>
                          <Input type="number" min="1" max="50" value={orderForm.so_luong}
                            onChange={e => setOrderForm(f => ({ ...f, so_luong: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                        </div>
                        <div>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Phương thức thanh toán</Label>
                          <SearchableSelect value={orderForm.phuong_thuc_thanh_toan}
                            onChange={e => setOrderForm(f => ({ ...f, phuong_thuc_thanh_toan: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff', outline: 'none' }}>
                            <option value="CONG_NO">Ghi nợ (Trả sau)</option>
                            <option value="VNPAY">VNPAY</option>
                            <option value="VI_DIEN_TU">Ví điện tử</option>
                          </SearchableSelect>
                        </div>
                      </div>

                      <Button className="franchise-action" onClick={datMuaCombo} disabled={ordering}
                        style={{
                          padding: '12px 20px', background: ordering ? "#f6f8fa" : '#142b3e',
                          color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, transition: 'background 0.2s'
                        }}>
                        {ordering ? 'Đang xử lý...' : <><Check size={18} /> Xác nhận đặt mua</>}
                      </Button>
                    </div>
                      );
                    })()}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: LỊCH SỬ NHẬP (history) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'history' && <div className="combo-purchase-history"><Table><colgroup><col style={{width:'16%'}}/><col style={{width:'31%'}}/><col style={{width:'18%'}}/><col style={{width:'18%'}}/><col style={{width:'17%'}}/></colgroup><thead><tr>{['Đơn hàng','Kiosk / Combo','Tổng tiền','Thanh toán','Trạng thái'].map(title=><th key={title}>{title}</th>)}</tr></thead><tbody><PaginatedList items={donTheoKiosk} resetKey={activeKioskId} layout="table" columns={5}>{order=><tr key={order.id} className="franchise-click-row" onClick={()=>setSelectedComboId(order.id)}><td><Button variant="link" onClick={event=>{event.stopPropagation();setSelectedComboId(order.id)}} aria-label={`Xem đơn ${String(order.id).slice(0,8)}`}>#{String(order.id).slice(0,8).toUpperCase()}</Button><small>{fmtDate(order.ngay_dat)}</small></td><td><strong>{order.kiosk?.ten_kiosk}</strong><small>{order.so_luong} × {order.combo?.ten_combo || 'Combo'}</small></td><td>{fmtMoney(order.tong_tien)}</td><td><StatusBadge tone={comboIsPaid(order)?'success':'warning'}>{comboIsPaid(order)?'Đã thanh toán':'Chưa thanh toán'}</StatusBadge></td><td>{comboStatusLabel(order.trang_thai)}</td></tr>}</PaginatedList></tbody></Table>{!donTheoKiosk.length&&<p className="franchise-empty">Chưa có đơn nhập combo.</p>}</div>}
                {selectedComboId && dons.find(order=>order.id===selectedComboId) && <ComboOrderDetail order={dons.find(order=>order.id===selectedComboId)} onClose={()=>setSelectedComboId(null)} busy={paymentBusy} onPay={async()=>{
                  const order=dons.find(order=>order.id===selectedComboId)
                  if(paymentBusy || !order?.cong_no_id || !window.confirm(`Thanh toán đơn ${fmtMoney(order.tong_can_thanh_toan ?? order.tong_tien)} bằng ví?`))return
                  setPaymentBusy(true)
                  try{await apiFetch(`/franchise/cong-no/${order.cong_no_id}/thanh-toan-vi`,{method:'PATCH'});setMsg({type:'success',text:'Đã thanh toán đơn combo.'});await loadAll(false)}catch(error){setMsg({type:'error',text:error.message})}finally{setPaymentBusy(false)}
                }}/>}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: VÍ ĐIỆN TỬ (wallet) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'wallet' && (
                  <div className="franchise-page franchise-wallet">
                    {/* Số dư ví */}
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, padding: 32, marginBottom: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Wallet size={28} color="var(--primary)" />
                          </div>
                          <div>
                            <div style={{ color: '#526174', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Số dư khả dụng</div>
                            <div style={{ fontSize: 36, fontWeight: 600, color: '#142b3e', marginTop: 4 }}>
                              {fmtMoney(walletInfo?.so_du_vi || 0)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 24 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#526174', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Nạp tiền vào ví</div>
                          <div className="franchise-deposit-controls" style={{ display: 'flex', gap: 12 }}>
                            <CurrencyInput 
                              placeholder="Nhập số tiền cần nạp..."
                              value={depositAmount}
                              onChange={e => setDepositAmount(e.target.value)}
                              style={{ flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', fontSize: 15, background: '#f6f8fa', color: '#142b3e' }}
                            />
                            <Button
                              disabled={depositLoading || !depositAmount || depositAmount <= 0}
                              onClick={async () => {
                                setDepositLoading(true)
                                try {
                                  await apiFetch('/wallet/deposit', {
                                    method: 'POST',
                                    body: JSON.stringify({ amount: Number(depositAmount), description: 'Nạp tiền vào ví' })
                                  })
                                  setMsg({ type: 'success', text: `Nạp thành công ${fmtMoney(depositAmount)} vào ví!` })
                                  setDepositAmount('')
                                  loadAll(false)
                                } catch (e) {
                                  setMsg({ type: 'error', text: e.message || 'Lỗi nạp tiền' })
                                } finally {
                                  setDepositLoading(false)
                                }
                              }}
                              style={{ 
                                padding: '0 24px', borderRadius: 8, border: 'none', 
                                background: 'var(--primary)', color: '#ffffff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                                opacity: (depositLoading || !depositAmount || depositAmount <= 0) ? 0.6 : 1,
                                transition: 'background .2s'
                              }}
                            >
                              {depositLoading ? 'Đang nạp...' : 'Nạp ngay'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Lịch sử giao dịch */}
                    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                      <h4 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#142b3e' }}>Lịch sử giao dịch</h4>
                      {(!walletInfo?.giao_dich || walletInfo.giao_dich.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#526174' }}>Chưa có giao dịch nào</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <PaginatedList items={walletInfo.giao_dich} resetKey={activeKioskId}>{(tx, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: 12, background: '#f6f8fa', border: '1px solid #e2e8f0' }}>
                              <div>
                                <div style={{ fontWeight: 600, color: '#30382e', fontSize: 14 }}>
                                  {tx.loai_giao_dich === 'NAP_TIEN' ? 'Nạp tiền vào ví' :
                                   tx.loai_giao_dich === 'MUA_COMBO' ? 'Thanh toán đơn mua combo' :
                                   tx.loai_giao_dich === 'TRA_CONG_NO' ? 'Thanh toán công nợ' : tx.loai_giao_dich}
                                </div>
                                <div style={{ fontSize: 12, color: '#526174', marginTop: 4 }}>
                                  {fmtDate(tx.ngay_giao_dich)} • {tx.mo_ta}
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 16, color: tx.so_tien > 0 ? '#16354d' : '#ef4444' }}>
                                {tx.so_tien > 0 ? '+' : ''}{fmtMoney(tx.so_tien)}
                              </div>
                            </div>
                          )}</PaginatedList>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: CÔNG NỢ (debt) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'debt' && <KioskDebtPanel debts={congNoTheoKiosk} scope={activeKioskId} onSettle={debt => openTatToanModal(debt.kiosk_id)}
                  onWalletPay={async debt => {
                    if (!window.confirm(`Xác nhận thanh toán ${fmtMoney(Number(debt.so_tien) + Number(debt.phi_phat_tre_han || 0))} bằng ví?`)) return
                    try { await apiFetch(`/franchise/cong-no/${debt.id}/thanh-toan-vi`, { method: 'PATCH' }); setMsg({ type: 'success', text: 'Thanh toán công nợ thành công!' }); await loadAll(false) } catch (e) { setMsg({ type: 'error', text: e.message || 'Thanh toán thất bại' }) }
                  }} onVnpayPay={async debt => {
                    try { const res = await apiFetch(`/franchise/cong-no/${debt.id}/tua-nhanh`, { method: 'POST' }); if (res.vnpay_url) window.location.href = res.vnpay_url; else setMsg({ type: 'error', text: 'Không lấy được link VNPay' }) } catch (e) { setMsg({ type: 'error', text: e.message }) }
                  }} />}

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* TAB: ROYALTY (royalty) */}
                {/* ═══════════════════════════════════════════════════════════ */}
                {tab === 'royalty' && (
                  <div className="franchise-page franchise-revenue-share">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#142b3e' }}>Bảng kê chia sẻ doanh thu</h3>
                      <Button
                        disabled={royaltyCalculating}
                        onClick={async () => {
                          setRoyaltyCalculating(true)
                          try {
                            const now = new Date()
                            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                            const thangTruoc = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`
                            const res = await apiFetch('/franchise/royalty/tinh-thang', { 
                              method: 'POST', 
                              body: JSON.stringify({ thang: thangTruoc }) 
                            })
                            setMsg({ type: 'success', text: `${res.message || "Đã tính Chia sẻ doanh thu thành công!"}` })
                            const data = await apiFetch('/franchise/royalty/cua-toi')
                            setRoyalties((Array.isArray(data) ? data : []).map(row => ({ ...row, kiosk: kiosks.find(k => k.id === row.kiosk_id) })))
                          } catch (e) {
                            setMsg({ type: 'error', text: e.message })
                          } finally { setRoyaltyCalculating(false) }
                        }}
                        style={{ padding: '8px 14px', background: '#f6f8fa', color: '#263c50', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 500, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <RefreshCw size={14} className={royaltyCalculating ? 'animate-spin' : undefined} /> {royaltyCalculating ? 'Đang tính…' : 'Tính chia sẻ doanh thu tháng trước'}
                      </Button>
                    </div>
                    <div style={{ display: 'grid', gap: 16 }}>
                      <PaginatedList items={royaltyTheoKiosk} resetKey={activeKioskId}>{r => (
                        <div key={r.id} style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#142b3e', fontSize: 16 }}>Tháng {r.thang}</div>
                              <div style={{ fontSize: 13, color: '#526174', marginTop: 4 }}>Kiosk: {r.kiosk?.ten_kiosk}</div>
                            </div>
                            <StatusBadge status={r.trang_thai}>
                              {r.trang_thai === 'DA_THANH_TOAN' ? 'Đã nộp' : r.trang_thai === 'DA_XAC_NHAN' ? 'Chờ nộp' : 'Chờ xác nhận bảng kê'}
                            </StatusBadge>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
                            <div style={{ borderTop: '1px solid #f6f8fa', paddingTop: 12 }}>
                              <div style={{ fontSize: 12, color: '#526174', fontWeight: 500 }}>Doanh thu</div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: '#142b3e', marginTop: 4 }}>{fmtMoney(r.doanh_thu_thuc_te)}</div>
                            </div>
                            <div style={{ borderTop: '1px solid #f6f8fa', paddingTop: 12 }}>
                              <div style={{ fontSize: 12, color: '#526174', fontWeight: 500 }}>Tỷ lệ</div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: '#263c50', marginTop: 4 }}>{r.ty_le_royalty}%</div>
                            </div>
                            <div style={{ borderTop: '1px solid #f6f8fa', paddingTop: 12 }}>
                              <div style={{ fontSize: 12, color: '#526174', fontWeight: 500 }}>Phí phải nộp</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#142b3e', marginTop: 4 }}>{fmtMoney(r.so_tien_royalty)}</div>
                            </div>
                          </div>
                          {r.trang_thai !== 'DA_THANH_TOAN' && Number(r.phi_phat_tre_han)>0 && <p style={{marginTop:16,fontSize:13,color:'#92400e'}}>Phí chậm nộp: {fmtMoney(r.phi_phat_tre_han)} · Tổng cần nộp: {fmtMoney(r.so_tien_can_nop)}</p>}
                          {r.trang_thai === 'DA_XAC_NHAN' && <div style={{display:'flex',justifyContent:'flex-end',marginTop:20}}><Button disabled={paymentBusy} onClick={async()=>{
                            if(paymentBusy || !window.confirm(`Nộp chia sẻ doanh thu tháng ${r.thang}: ${fmtMoney(r.so_tien_can_nop ?? r.so_tien_royalty)} bằng ví?`))return
                            setPaymentBusy(true)
                            try{await apiFetch(`/franchise/royalty/${r.id}/thanh-toan-vi`,{method:'PATCH'});setMsg({type:'success',text:'Đã nộp chia sẻ doanh thu. Hệ thống đã cập nhật bảng kê.'});await loadAll(false)}catch(error){setMsg({type:'error',text:error.message})}finally{setPaymentBusy(false)}
                          }}>{paymentBusy?'Đang thanh toán…':'Nộp qua ví điện tử'}</Button></div>}
                        </div>
                      )}</PaginatedList>
                      {royaltyTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#526174', fontSize: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16 }}>Chưa có dữ liệu chia sẻ doanh thu.</div>}
                    </div>
                  </div>
                )}

                {/* ── Mở rộng chi nhánh ── */}
                {/* ── Mở rộng chi nhánh ── */}
                {tab === 'expansion' && (
                  <div className="franchise-page franchise-expansion" style={{ animation: 'fadeIn 0.3s' }}>
                    <div style={{ marginBottom: 32 }}>
                      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#142b3e' }}>Mở Rộng Chi Nhánh</h2>
                      <p style={{ margin: 0, color: '#526174', fontSize: 14 }}>
                        Đăng ký mở thêm Kiosk nhượng quyền. Chọn mô hình phù hợp với khu vực kinh doanh mới của bạn.
                      </p>
                    </div>

                    {/* 3 Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 40 }}>
                      {/* Card 1 */}
                      <div 
                        onClick={() => setExpansionForm(f => ({ ...f, goi_kiosk: 'XE_LUU_DONG' }))}
                        style={{ 
                          background: '#fff', 
                          border: expansionForm.goi_kiosk === 'XE_LUU_DONG' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                          borderRadius: 16, padding: 24, cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                      >
                        {expansionForm.goi_kiosk === 'XE_LUU_DONG' && <div style={{ position: 'absolute', top: 16, right: 16 }}><CheckCircle2 size={20} color="var(--primary)" /></div>}
                        <div style={{ marginBottom: 16 }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#142b3e' }}>Xe Lưu Động</h3>
                          <span style={{ color: '#526174', fontSize: 12 }}>Vốn thấp nhất</span>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#142b3e', marginBottom: 12 }}>Từ 35 triệu</div>
                        <div style={{ fontSize: 13, color: '#526174', marginBottom: 20, lineHeight: 1.5 }}>Phù hợp người mới bắt đầu. Di chuyển linh hoạt.</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#263c50', borderTop: '1px solid #f6f8fa', paddingTop: 16 }}>
                          <div><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Không gian</div><div style={{ fontWeight: 500 }}>Xe đẩy/Xe máy</div></div>
                          <div style={{ textAlign: 'right' }}><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Phí duy trì</div><div style={{ fontWeight: 500 }}>4% / tháng</div></div>
                        </div>
                      </div>

                      {/* Card 2 */}
                      <div 
                        onClick={() => setExpansionForm(f => ({ ...f, goi_kiosk: 'KIOSK_CO_DINH' }))}
                        style={{ 
                          background: '#fff', 
                          border: expansionForm.goi_kiosk === 'KIOSK_CO_DINH' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                          borderRadius: 16, padding: 24, cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                      >
                        {expansionForm.goi_kiosk === 'KIOSK_CO_DINH' && <div style={{ position: 'absolute', top: 16, right: 16 }}><CheckCircle2 size={20} color="var(--primary)" /></div>}
                        <div style={{ marginBottom: 16 }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#142b3e' }}>Kiosk Cố Định</h3>
                          <span style={{ color: '#526174', fontSize: 12 }}>Phổ biến nhất</span>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#142b3e', marginBottom: 12 }}>Từ 60 triệu</div>
                        <div style={{ fontSize: 13, color: '#526174', marginBottom: 20, lineHeight: 1.5 }}>Quầy kiosk mang đi phù hợp mặt tiền nhỏ, sảnh.</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#263c50', borderTop: '1px solid #f6f8fa', paddingTop: 16 }}>
                          <div><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Không gian</div><div style={{ fontWeight: 500 }}>6 - 15 m²</div></div>
                          <div style={{ textAlign: 'right' }}><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Phí duy trì</div><div style={{ fontWeight: 500 }}>6% / tháng</div></div>
                        </div>
                      </div>

                      {/* Card 3 */}
                      <div 
                        onClick={() => setExpansionForm(f => ({ ...f, goi_kiosk: 'CONTAINER_CAFE' }))}
                        style={{ 
                          background: '#fff', 
                          border: expansionForm.goi_kiosk === 'CONTAINER_CAFE' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                          borderRadius: 16, padding: 24, cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                      >
                        {expansionForm.goi_kiosk === 'CONTAINER_CAFE' && <div style={{ position: 'absolute', top: 16, right: 16 }}><CheckCircle2 size={20} color="var(--primary)" /></div>}
                        <div style={{ marginBottom: 16 }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#142b3e' }}>Container Café</h3>
                          <span style={{ color: '#526174', fontSize: 12 }}>Cao cấp</span>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#142b3e', marginBottom: 12 }}>Từ 150 triệu</div>
                        <div style={{ fontSize: 13, color: '#526174', marginBottom: 20, lineHeight: 1.5 }}>Không gian container có chỗ ngồi mini, phá cách.</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#263c50', borderTop: '1px solid #f6f8fa', paddingTop: 16 }}>
                          <div><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Không gian</div><div style={{ fontWeight: 500 }}>15 - 25 m²</div></div>
                          <div style={{ textAlign: 'right' }}><div style={{ color: '#526174', marginBottom: 2, fontSize: 11 }}>Phí duy trì</div><div style={{ fontWeight: 500 }}>7% / tháng</div></div>
                        </div>
                      </div>
                    </div>

                    <form className="workspace-form" onSubmit={handleExpansionSubmit} style={{ background: '#fff', borderRadius: 16, padding: 32, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Thông tin mặt bằng dự kiến</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Địa chỉ mặt bằng dự kiến *</Label>
                          <Input type="text" required value={expansionForm.dia_chi_mat_bang} onChange={e => setExpansionForm(f => ({ ...f, dia_chi_mat_bang: e.target.value }))} placeholder="Số nhà, tên đường..." style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Phường / Xã *</Label>
                          <Input type="text" required value={expansionForm.phuong_xa} onChange={e => setExpansionForm(f => ({ ...f, phuong_xa: e.target.value }))} placeholder="Nhập Phường/Xã" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Thành phố / Tỉnh *</Label>
                          <Input type="text" required value={expansionForm.thanh_pho} onChange={e => setExpansionForm(f => ({ ...f, thanh_pho: e.target.value }))} placeholder="Nhập Thành phố/Tỉnh" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#526174', marginBottom: 8 }}>Diện tích dự kiến (m2)</Label>
                          <Input type="number" value={expansionForm.dien_tich_m2} onChange={e => setExpansionForm(f => ({ ...f, dien_tich_m2: e.target.value }))} placeholder="VD: 15" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Button type="submit" disabled={expansionSubmitting} style={{
                          padding: '12px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: expansionSubmitting ? 'not-allowed' : 'pointer', opacity: expansionSubmitting ? 0.7 : 1, transition: 'all 0.2s'
                        }}>
                          {expansionSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu mở rộng'}
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
                {/* ── Bán hàng POS ── */}
                {tab === 'pos' && posKioskSelected && (
                  activeKiosk?.trang_thai !== 'DANG_HOAT_DONG' ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', margin: '0 auto', maxWidth: 600, marginTop: 40 }}>
                      <Lock size={48} color="#526174" style={{ margin: '0 auto 16px' }} />
                      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#263c50', marginBottom: 8 }}>Kiosk Chưa Hoạt Động</h2>
                      <p style={{ color: '#526174' }}>Kiosk này hiện chưa khai trương chính thức hoặc chưa hoàn tất mua Combo nhượng quyền.<br />Vui lòng liên hệ Quản lý để biết thêm chi tiết.</p>
                    </div>
                  ) : activeKioskShiftLoading ? (
                    <div className="operation-surface operation-empty" role="status">Đang kiểm tra ca làm việc trước khi mở POS…</div>
                  ) : !activeKioskShift?.has_open_shift ? (
                    <div className="operation-surface kiosk-pos-shift-gate" role="status">
                      <Lock size={30} />
                      <h2>Cần mở ca trước khi bán hàng</h2>
                      <p>Mở ca và kiểm đếm tiền đầu ca để bắt đầu tạo đơn tại kiosk. Ca đã chốt chờ duyệt riêng trong lịch sử.</p>
                      <Button type="button" onClick={() => setTab('kiosk_shifts')}>Mở ca tại kiosk</Button>
                    </div>
                  ) : (
                  <KioskPosTerminal key={activeKioskId}
                    products={availability.ready ? packageAllowedMenu.filter(availability.isSelling) : []}
                    loading={menuLoading || !availability.ready} packageName={packageMeta.name}
                    cart={posCart.map(item => ({ id:item.cartItemId, productId:item.ma_san_pham, name:item.ten_san_pham, price:Number(item.gia_ban || item.gia || 0), quantity:item.sl, toppings:item.selectedToppings }))}
                    total={posTotal} payment={posPayment} cash={posCashInput} submitting={posSubmitting} result={posOrderResult}
                    onAdd={addToCart} onQuantity={updateCartQty} onRemove={removeFromCart} onClear={() => setPosCart([])}
                    onPayment={setPosPayment} onCash={setPosCashInput} onCheckout={submitPosOrder} onResult={setPosOrderResult}
                    onCheckPayment={async id => {
                      const response = await apiFetch(`/staff/orders?branch_code=${encodeURIComponent(activeKiosk.ma_kiosk)}&q=${encodeURIComponent(id)}&limit=1`)
                      return (response.orders || response.items || []).find(order => order.ma_don_hang === id)
                    }}
                    onOrders={() => { posOrderCache.current.clear(); setTab('pos_orders') }} />
                  )
                )}
              </>
            )}
            </WorkspaceErrorBoundary>
          </div>
          </OperationalPageFrame>
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
            <div className="kiosk-staff-dialog" style={{
              background: '#fff', borderRadius: 24, width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f6f8fa', color: '#142b3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Tạo Tài Khoản Nhân Viên Con</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>Phân quyền trực tiếp cho nhân viên vận hành Kiosk</p>
                  </div>
                </div>
                <Button onClick={() => setShowCreateStaffModal(false)} style={{ background: '#f6f8fa', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 600, color: '#526174' }}>×</Button>
              </div>

              <form className="workspace-form kiosk-staff-form" onSubmit={handleCreateStaff} style={{ padding: 26 }}>
                <div className="kiosk-staff-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Họ và tên *</Label>
                    <Input type="text" required value={staffForm.ho_ten} onChange={e => setStaffForm(f => ({ ...f, ho_ten: e.target.value }))} placeholder="Nguyễn Văn A"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Tên đăng nhập *</Label>
                    <Input type="text" required value={staffForm.ten_dang_nhap} onChange={e => setStaffForm(f => ({ ...f, ten_dang_nhap: e.target.value.toLowerCase().replace(/\s+/g, '') }))} placeholder="staff_an1"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div className="kiosk-staff-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Mật khẩu khởi tạo *</Label>
                    <div style={{ position: 'relative' }}>
                      <Input type={showStaffPassword ? "text" : "password"} required value={staffForm.mat_khau} onChange={e => setStaffForm(f => ({ ...f, mat_khau: e.target.value }))} placeholder="••••••"
                        style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                      <Button
                        type="button" 
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#526174', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {showStaffPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </Button>
                    </div>
                  </div>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Kiosk phân công *</Label>
                    <SearchableSelect value={staffForm.kiosk_id || activeKioskId} onChange={e => setStaffForm(f => ({ ...f, kiosk_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', background: '#f6f8fa', fontWeight: 600, boxSizing: 'border-box' }}>
                      {kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                    </SearchableSelect>
                  </div>
                </div>

                <div className="kiosk-staff-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Số điện thoại</Label>
                    <Input type="tel" value={staffForm.so_dien_thoai} onChange={e => setStaffForm(f => ({ ...f, so_dien_thoai: e.target.value }))} placeholder="0901234567"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div className="kiosk-staff-field">
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Email</Label>
                    <Input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@gmail.com"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Phân quyền POS chi tiết */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Label style={{ fontSize: 13, fontWeight: 600, color: '#142b3e', textTransform: 'uppercase' }}>Phân quyền thao tác POS</Label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button type="button" onClick={() => setStaffForm(f => ({ ...f, pos_permissions: POS_PERMISSIONS_LIST.map(p => p.id) }))} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f6f8fa', border: 'none', cursor: 'pointer' }}>Chọn tất cả</Button>
                      <Button type="button" onClick={() => setStaffForm(f => ({ ...f, pos_permissions: ['pos_allow_order'] }))} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f6f8fa', border: 'none', cursor: 'pointer' }}>Chỉ bán hàng</Button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {POS_PERMISSIONS_LIST.map(perm => {
                      const isChecked = (staffForm.pos_permissions || []).includes(perm.id)
                      return (
                        <Label key={perm.id} className="kiosk-staff-permission" style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${isChecked ? 'var(--primary)' : '#e2e8f0'}`, background: isChecked ? '#f6f8fa' : '#fff',
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
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#142b3e' }}>{perm.label}</div>
                            <div style={{ fontSize: 11, color: '#526174' }}>{perm.desc}</div>
                          </div>
                        </Label>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowCreateStaffModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {staffSubmitting ? 'Đang lưu...' : "Xác nhận tạo tài khoản"}
                  </Button>
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
              <div style={{ padding: '24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Chỉnh Sửa Nhân Viên: @{selectedStaff.ten_dang_nhap}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>Cập nhật thông tin và điều chỉnh quyền hạn POS</p>
                </div>
                <Button onClick={() => setShowEditStaffModal(false)} style={{ background: '#f6f8fa', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 600, color: '#526174' }}>×</Button>
              </div>

              <form className="workspace-form" onSubmit={handleUpdateStaff} style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Họ và tên</Label>
                    <Input type="text" value={staffForm.ho_ten} onChange={e => setStaffForm(f => ({ ...f, ho_ten: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Trạng thái tài khoản</Label>
                    <SearchableSelect value={staffForm.trang_thai} onChange={e => setStaffForm(f => ({ ...f, trang_thai: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f6f8fa', fontWeight: 600, boxSizing: 'border-box' }}>
                      <option value="ACTIVE">Hoạt động (Active)</option>
                      <option value="INACTIVE">Khóa tài khoản (Inactive)</option>
                    </SearchableSelect>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Số điện thoại</Label>
                    <Input type="tel" value={staffForm.so_dien_thoai} onChange={e => setStaffForm(f => ({ ...f, so_dien_thoai: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Kiosk trực thuộc</Label>
                    <SearchableSelect value={staffForm.kiosk_id || ''} onChange={e => setStaffForm(f => ({ ...f, kiosk_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f6f8fa', fontWeight: 600, boxSizing: 'border-box' }}>
                      {kiosks.map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                    </SearchableSelect>
                  </div>
                </div>

                {/* Phân quyền POS */}
                <div style={{ marginBottom: 24 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#142b3e', textTransform: 'uppercase', marginBottom: 10 }}>Cấp quyền thao tác POS</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {POS_PERMISSIONS_LIST.map(perm => {
                      const isChecked = (staffForm.pos_permissions || []).includes(perm.id)
                      return (
                        <Label key={perm.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${isChecked ? 'var(--primary)' : '#e2e8f0'}`, background: isChecked ? '#f6f8fa' : '#fff',
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
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#142b3e' }}>{perm.label}</div>
                            <div style={{ fontSize: 11, color: '#526174' }}>{perm.desc}</div>
                          </div>
                        </Label>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowEditStaffModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {staffSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
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
              <div style={{ padding: '24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Đặt Lại Mật Khẩu</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>Cho nhân viên: <b>@{selectedStaff.ten_dang_nhap}</b></p>
                </div>
                <Button onClick={() => setShowResetPwdModal(false)} style={{ background: '#f6f8fa', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 600, color: '#526174' }}>×</Button>
              </div>

              <form className="workspace-form" onSubmit={handleResetPassword} style={{ padding: 24 }}>
                <div style={{ marginBottom: 20 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Mật khẩu mới *</Label>
                  <Input type="password" required value={resetPwdInput} onChange={e => setResetPwdInput(e.target.value)} placeholder="Nhập mật khẩu mới..."
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowResetPwdModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: '1px solid #e2e8f0', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={staffSubmitting} style={{ flex: 2, padding: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {staffSubmitting ? 'Đang lưu...' : 'Xác nhận đổi MK'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 4: PHÂN CA LÀM VIỆC (SCHEDULE SHIFT) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showCreateShiftModal && <WorkspaceDialog title="Phân ca làm việc" subtitle={`${activeKiosk?.ten_kiosk || 'Kiosk'} · ${activeKiosk?.ma_kiosk || ''}`} icon={CalendarDays} busy={shiftScheduleSubmitting} onClose={()=>setShowCreateShiftModal(false)} className="kiosk-assignment-dialog">
          <form className="kiosk-assignment-form" onSubmit={handleCreateWorkShift}>
            <div className="kiosk-assignment-fields"><div><Label htmlFor="kiosk-shift-employee">Nhân viên nhận ca</Label><SearchableSelect id="kiosk-shift-employee" aria-label="Nhân viên nhận ca" required disabled={shiftScheduleSubmitting} value={shiftScheduleForm.staff_username} onChange={e=>setShiftScheduleForm(f=>({...f,staff_username:e.target.value}))} options={subStaffList.filter(staff=>!staff.kiosk_id||staff.kiosk_id===activeKioskId).map(staff=>({value:staff.ten_dang_nhap,label:`${staff.ho_ten||staff.ten_dang_nhap} · @${staff.ten_dang_nhap}`}))}/></div><div><Label htmlFor="kiosk-shift-date">Ngày làm việc</Label><Input id="kiosk-shift-date" type="date" required value={shiftScheduleForm.shift_date} disabled={shiftScheduleSubmitting} onChange={e=>setShiftScheduleForm(f=>({...f,shift_date:e.target.value}))}/></div></div>
            <fieldset className="kiosk-shift-options" disabled={shiftScheduleSubmitting}><legend>Chọn khung ca</legend><div>{SHIFT_TEMPLATES.map(template=>{const Icon=template.icon,selected=shiftScheduleForm.shift_code===template.id;return <Button type="button" variant={selected?'default':'outline'} key={template.id} aria-pressed={selected} onClick={()=>setShiftScheduleForm(f=>({...f,shift_code:template.id}))}><Icon size={25}/><strong>{template.name}</strong><span>{template.start}–{template.end}</span>{selected&&<Check size={15}/>}</Button>})}</div></fieldset>
            <div><Label htmlFor="kiosk-shift-note">Ghi chú phân công</Label><Textarea id="kiosk-shift-note" rows={3} value={shiftScheduleForm.note} disabled={shiftScheduleSubmitting} onChange={e=>setShiftScheduleForm(f=>({...f,note:e.target.value}))} placeholder="Nhiệm vụ hoặc lưu ý cho nhân viên…"/></div>
            <footer className="operation-footer"><Button type="button" variant="outline" disabled={shiftScheduleSubmitting} onClick={()=>setShowCreateShiftModal(false)}>Hủy</Button><Button type="submit" variant="default" disabled={shiftScheduleSubmitting||!shiftScheduleForm.staff_username}><Check size={16}/>{shiftScheduleSubmitting?'Đang lưu…':'Xác nhận phân ca'}</Button></footer>
          </form>
        </WorkspaceDialog>}

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
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: "linear-gradient(135deg, #f6f8fa, #fde68a)",
                    color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CalendarCheck size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>
                      Duyệt Yêu Cầu Đăng Ký Ca Làm Việc
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>
                      Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b>
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowShiftRequestsModal(false)}
                  style={{
                    background: '#f6f8fa', border: 'none', width: 32, height: 32,
                    borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#526174', transition: 'all .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f6f8fa'}
                >
                  <X size={16} />
                </Button>
              </div>

              {/* Filter Tabs */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid #f6f8fa', display: 'flex', gap: 8, background: '#f6f8fa' }}>
                {[
                  { id: 'PENDING', label: 'Chờ duyệt', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length, color: '#d97706', activeBg: '#fef3c7' },
                  { id: 'APPROVED', label: 'Đã duyệt (Chính thức)', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'APPROVED').length, color: '#16354d', activeBg: '#eff6ff' },
                  { id: 'REJECTED', label: 'Đã từ chối', count: shiftRequests.filter(r => r.trang_thai_yeu_cau === 'REJECTED').length, color: '#dc2626', activeBg: '#fef2f2' },
                  { id: 'ALL', label: 'Tất cả yêu cầu', count: shiftRequests.length, color: '#526174', activeBg: '#e2e8f0' },
                ].map(f => {
                  const isSel = shiftRequestTabFilter === f.id
                  return (
                    <Button
                      key={f.id}
                      onClick={() => setShiftRequestTabFilter(f.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 99, border: isSel ? `1px solid ${f.color}` : '1px solid #e2e8f0',
                        background: isSel ? f.activeBg : '#fff', color: isSel ? f.color : '#526174',
                        fontWeight: isSel ? 800 : 600, fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s'
                      }}
                    >
                      <span>{f.label}</span>
                      <Badge variant="outline" data-quiet-label="true" style={{
                        padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                        background: isSel ? f.color : '#f6f8fa', color: isSel ? '#fff' : '#526174'
                      }}>
                        {f.count}
                      </Badge>
                    </Button>
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
                      <div style={{ textAlign: 'center', padding: 50, color: '#526174' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f6f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                          <CheckCircle2 size={24} color="#526174" />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#142b3e' }}>Không có yêu cầu đăng ký ca nào</div>
                        <p style={{ fontSize: 12, color: '#526174', marginTop: 4 }}>
                          {shiftRequestTabFilter === 'PENDING'
                            ? 'Toàn bộ ca làm việc đăng ký đã được duyệt hoặc chưa có yêu cầu mới.'
                            : 'Không tìm thấy bản ghi phù hợp với bộ lọc.'}
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <PaginatedList items={filtered} resetKey={JSON.stringify([activeKioskId,shiftRequestTabFilter])}>{req => {
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
                                  : isApproved ? 'linear-gradient(135deg, #16354d, #1d4ed8)' : '#526174',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 600, flexShrink: 0
                              }}>
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: '#142b3e' }}>
                                  {req.staff_name} <span style={{ fontSize: 12, fontWeight: 600, color: '#526174' }}>@{req.staff_username}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#142b3e', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar size={13} color="#526174" /> {req.ngay_lam_viec}
                                  </span>
                                  <Badge variant="outline" data-quiet-label="true" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                    background: tmpl.bg, border: `1px solid ${tmpl.border}`, color: tmpl.text
                                  }}>
                                    <ShiftIcon size={12} color={tmpl.accent} /> {tmpl.name} ({tmpl.start}-{tmpl.end})
                                  </Badge>
                                </div>
                                {req.note && (
                                  <div style={{ fontSize: 12, color: '#526174', marginTop: 4, fontStyle: 'italic' }}>
                                    Ghi chú: &quot;{req.note}&quot;
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
                                  <Button data-intent="success"
                                    onClick={() => handleApproveShiftRequest(req.ma_ca_lam_viec)}
                                    disabled={approvingRequestId === req.ma_ca_lam_viec}
                                    style={{
                                      padding: '8px 14px', background: "linear-gradient(135deg, var(--primary), var(--primary))",
                                      color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 12,
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                      boxShadow: '0 2px 6px rgba(16,185,129,0.25)', transition: 'all .15s'
                                    }}
                                  >
                                    <Check size={14} /> Duyệt ca
                                  </Button>
                                  <Button data-intent="danger"
                                    onClick={() => handleRejectShiftRequest(req.ma_ca_lam_viec)}
                                    disabled={approvingRequestId === req.ma_ca_lam_viec}
                                    style={{
                                      padding: '8px 12px', background: "#f6f8fa", color: '#dc2626',
                                      border: '1px solid #fee2e2', borderRadius: 10, fontWeight: 700, fontSize: 12,
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                  >
                                    <X size={14} /> Từ chối
                                  </Button>
                                </div>
                              )}
                              {isApproved && (
                                <Badge variant="outline" data-quiet-label="true" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 99, background: "#f6f8fa",
                                  color: '#16354d', fontSize: 12, fontWeight: 600, border: '1px solid #bfdbfe'
                                }}>
                                  <CheckCircle2 size={13} /> Đã duyệt chính thức
                                </Badge>
                              )}
                              {isRejected && (
                                <Badge variant="outline" data-quiet-label="true" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '4px 10px', borderRadius: 99, background: "#f6f8fa",
                                  color: '#dc2626', fontSize: 12, fontWeight: 600, border: '1px solid #fecaca'
                                }}>
                                  <XCircle size={13} /> Đã từ chối
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      }}</PaginatedList>
                    </div>
                  )
                })()}
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f6f8fa' }}>
                <div style={{ fontSize: 12, color: '#526174' }}>
                  Tổng cộng: <b>{shiftRequests.length}</b> yêu cầu | Chờ duyệt: <b style={{ color: '#d97706' }}>{shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length}</b>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button data-intent="danger"
                    onClick={() => setShowShiftRequestsModal(false)}
                    style={{
                      padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1',
                      borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#526174', cursor: 'pointer'
                    }}
                  >
                    Đóng
                  </Button>
                  {shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length > 0 && (
                    <Button data-intent="success"
                      onClick={handleApproveAllPending}
                      disabled={shiftRequestsLoading}
                      style={{
                        padding: '8px 18px', background: "linear-gradient(135deg, var(--primary), var(--primary))",
                        color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 3px 10px rgba(16,185,129,0.35)'
                      }}
                    >
                      <Check size={16} /> Duyệt tất cả ({shiftRequests.filter(r => r.trang_thai_yeu_cau === 'PENDING').length} ca)
                    </Button>
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
            <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span><WorkspaceSymbolCheckSquare size="1.1em" aria-hidden="true" /></span> Tiêu Chí Chấm Điểm Kiosk
              </h3>
              <Button onClick={() => setScoringCriteriaModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#526174' }}>×</Button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto' }}>
              <p style={{ margin: '0 0 20px', color: '#526174', fontSize: 14, lineHeight: 1.6 }}>
                Điểm đánh giá hiệu suất của mỗi Kiosk được hệ thống tính toán <b>tự động & minh bạch</b> dựa trên hoạt động kinh doanh thực tế. Điểm khởi điểm là <b>100đ</b>.
              </p>
              
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#142b3e', textTransform: 'uppercase' }}><WorkspaceSymbolBarChart3 size="1.1em" aria-hidden="true" /> Điểm Trừ (Vi phạm)</h4>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ background: "#f6f8fa", padding: '12px 16px', borderRadius: 12, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 13 }}>Nợ quá hạn / Chưa thanh toán</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>-10đ / Khoản</span>
                  </div>
                  <div style={{ background: "#f6f8fa", padding: '12px 16px', borderRadius: 12, border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#92400e', fontWeight: 600, fontSize: 13 }}>Biên bản Đối soát: Cảnh báo Vàng</span>
                    <span style={{ color: '#d97706', fontWeight: 600 }}>-15đ / Biên bản</span>
                  </div>
                  <div style={{ background: "#f6f8fa", padding: '12px 16px', borderRadius: 12, border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 13 }}>Biên bản Đối soát: Cảnh báo Đỏ</span>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>-30đ / Biên bản</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#142b3e', textTransform: 'uppercase' }}><WorkspaceSymbolTrendingUp size="1.1em" aria-hidden="true" /> Điểm Cộng (Thành tích)</h4>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ background: "#f6f8fa", padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#1e40af', fontWeight: 600, fontSize: 13 }}>Tiêu thụ tích lũy &gt; 50 Combo gốc</span>
                    <span style={{ color: '#16354d', fontWeight: 600 }}>+10đ</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#142b3e', textTransform: 'uppercase' }}><WorkspaceSymbolAward size="1.1em" aria-hidden="true" /> Xếp Hạng</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 8, textAlign: 'center' }}>
                  <div style={{ background: '#fef08a', padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 600, color: '#854d0e', fontSize: 20 }}>S</div>
                    <div style={{ fontSize: 11, color: '#a16207', fontWeight: 700, marginTop: 4 }}>≥ 90đ</div>
                  </div>
                  <div style={{ background: "#f6f8fa", padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 20 }}>A</div>
                    <div style={{ fontSize: 11, color: 'var(--primary-hover)', fontWeight: 700, marginTop: 4 }}>≥ 70đ</div>
                  </div>
                  <div style={{ background: "#f6f8fa", padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 600, color: '#1e3a8a', fontSize: 20 }}>B</div>
                    <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginTop: 4 }}>≥ 50đ</div>
                  </div>
                  <div style={{ background: "#f6f8fa", padding: '10px', borderRadius: 12 }}>
                    <div style={{ fontWeight: 600, color: '#7f1d1d', fontSize: 20 }}>C</div>
                    <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, marginTop: 4 }}>&lt; 50đ</div>
                  </div>
                </div>
              </div>

            </div>
            <div style={{ padding: 20, background: '#f6f8fa', borderTop: '1px solid #e2e8f0' }}>
              <Button onClick={() => setScoringCriteriaModal(false)} style={{ width: '100%', padding: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Đã hiểu
              </Button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <Modal title="HÓA ĐƠN GIÁ TRỊ GIA TĂNG (Bản Thể Hiện)" onClose={() => setInvoiceModal(null)}>
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
              <div><b>Nội dung xuất:</b> {invoiceModal.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền và setup ban đầu' : "Thanh toán công nợ / Chia sẻ doanh thu"}</div>
              <div><b>Ngày thanh toán:</b> {new Date().toLocaleDateString('vi-VN')}</div>
            </div>

            <Table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 15 }}>
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
            </Table>
            
            <div style={{ textAlign: 'center', fontSize: 12, marginTop: 30, color: '#6b7280' }}>
              <div>(Đã ký bởi Công ty CP Avengers Coffee)</div>
              <div style={{ marginTop: 4 }}>* Đây là hóa đơn giả lập cho bài Demo.</div>
            </div>
          </div>
          <div data-modal-actions="true" style={{ marginTop: 20, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button data-intent="danger" onClick={() => setInvoiceModal(null)} style={{ padding: '8px 16px', background: '#fff', color: '#263c50', borderRadius: 8, border: '1px solid #d1d5db', fontWeight: 600, cursor: 'pointer' }}>Đóng</Button>
            <Button onClick={() => {
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
            }} style={{ padding: '8px 16px', background: "var(--primary)", color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}><WorkspaceSymbolPrinter size="1.1em" aria-hidden="true" /> In Hóa Đơn (PDF)</Button>
          </div>
        </Modal>
      )}

      {/* ── PAYMENT MODAL (DEMO) ───────────────────────── */}
      {showPayment && selectedDebt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setShowPayment(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s ease-out'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, var(--primary-hover), #0f4d70)', padding: '24px', textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}><WorkspaceSymbolCreditCard size="1.1em" aria-hidden="true" /></div>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Avengers Pay</h3>
              <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.8 }}>Thanh toán công nợ</p>
            </div>
            
            <div style={{ padding: 24 }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 14, color: '#526174', fontWeight: 600, textTransform: 'uppercase' }}>Số tiền cần thanh toán</div>
                <div style={{ fontSize: 36, fontWeight: 600, color: '#30382e', marginTop: 4 }}>
                  {fmtMoney(selectedDebt.so_tien)}
                </div>
                <div style={{ fontSize: 14, color: '#0f4d70', fontWeight: 700, marginTop: 4 }}>
                  {selectedDebt.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền ban đầu' : 'Thanh toán hóa đơn'}
                </div>
              </div>

              <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#526174', fontWeight: 600 }}>Số dư ví hiện tại:</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: walletBalance >= Number(selectedDebt.so_tien) ? '#16354d' : '#dc2626' }}>
                    {fmtMoney(walletBalance)}
                  </span>
                </div>
                {walletBalance < Number(selectedDebt.so_tien) && (
                  <Button onClick={handleNapTien} type="button" style={{
                    width: '100%', padding: '10px', background: 'var(--primary-subtle)', color: 'var(--primary-hover)',
                    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8
                  }}>
                    + Nạp thêm tiền vào ví
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <Button data-intent="danger" type="button" onClick={() => { setShowPayment(false); setSelectedDebt(null); }} disabled={paymentProcessing}
                  style={{ flex: 1, padding: '14px', background: '#f6f8fa', color: '#526174', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: paymentProcessing ? 'not-allowed' : 'pointer' }}>
                  Hủy bỏ
                </Button>
                <Button type="button" onClick={handleThanhToan} disabled={walletBalance < Number(selectedDebt.so_tien) || paymentProcessing}
                  style={{
                    flex: 2, padding: '14px', background: walletBalance < Number(selectedDebt.so_tien) ? "#f6f8fa" : 'var(--primary)',
                    color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
                    cursor: walletBalance < Number(selectedDebt.so_tien) || paymentProcessing ? 'not-allowed' : 'pointer',
                    boxShadow: walletBalance < Number(selectedDebt.so_tien) ? 'none' : '0 4px 14px rgba(79,70,229,0.4)'
                  }}>
                  {paymentProcessing ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                </Button>
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
              <div style={{ padding: '24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "#f6f8fa", color: '#16354d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PlayCircle size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Mở Ca Làm Việc Trực Tiếp</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b></p>
                  </div>
                </div>
                <Button onClick={() => setShowOpenShiftModal(false)} style={{ background: '#f6f8fa', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 600, color: '#526174' }}>×</Button>
              </div>

              <form className="workspace-form" onSubmit={handleOpenKioskShift} style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Nhân viên trực ca *</Label>
                  <SearchableSelect required value={openShiftForm.staff_username} onChange={e => {
                    const matched = subStaffList.find(s => s.ten_dang_nhap === e.target.value)
                    setOpenShiftForm(f => ({ ...f, staff_username: e.target.value, staff_name: matched?.ho_ten || e.target.value }))
                  }}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, background: '#f6f8fa', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}>
                    <option value={userName}>{userName} (Chủ nhượng quyền / Admin)</option>
                    {subStaffList.map(s => <option key={s.ma_nguoi_dung} value={s.ten_dang_nhap}>{s.ho_ten} (@{s.ten_dang_nhap})</option>)}
                  </SearchableSelect>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Tiền mặt bàn giao đầu ca (VNĐ) *</Label>
                  <CurrencyInput
                    required
                    value={openShiftForm.cash_open}
                    onChange={e => setOpenShiftForm(f => ({ ...f, cash_open: Number(e.target.value) }))}
                    placeholder="VD: 1.000.000"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 16, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 12, color: '#16354d', fontWeight: 700, marginTop: 4 }}>
                    Tiền lẻ mở két: {fmtMoney(openShiftForm.cash_open)}
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Ghi chú mở ca</Label>
                  <Input type="text" value={openShiftForm.note} onChange={e => setOpenShiftForm(f => ({ ...f, note: e.target.value }))} placeholder="Ví dụ: Bàn giao tiền lẻ đầy đủ..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowOpenShiftModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: "var(--primary)", color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang mở ca...' : "Bắt đầu mở ca"}
                  </Button>
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
              <div style={{ padding: '24px', borderBottom: '1px solid #f6f8fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "#f6f8fa", color: '#16354d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#142b3e' }}>Chốt Ca Kiểm Tiền Kiosk</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#526174' }}>Kiosk: <b>{activeKiosk?.ten_kiosk} ({activeKiosk?.ma_kiosk})</b></p>
                  </div>
                </div>
                <Button onClick={() => setShowCloseShiftModal(false)} style={{ background: '#f6f8fa', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 600, color: '#526174' }}>×</Button>
              </div>

              <form className="workspace-form" onSubmit={handleCloseKioskShift} style={{ padding: 24 }}>
                <div style={{ background: '#f6f8fa', borderRadius: 14, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: '#526174' }}>Tiền mặt đầu ca:</span>
                    <span style={{ fontWeight: 700, color: '#142b3e' }}>{fmtMoney(activeKioskShift.active_shift?.tien_dau_ca)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: '#526174' }}>Tiền mặt thu được trong ca:</span>
                    <span style={{ fontWeight: 700, color: '#16354d' }}>{fmtMoney(activeKioskShift.live_stats?.cash_revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8, fontSize: 14 }}>
                    <span style={{ fontWeight: 600, color: '#142b3e' }}>Tiền mặt kỳ vọng trong két:</span>
                    <span style={{ fontWeight: 600, color: '#d97706', fontSize: 16 }}>{fmtMoney(activeKioskShift.live_stats?.expected_cash)}</span>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Tiền mặt thực tế đếm được cuối ca (VNĐ) *</Label>
                  <CurrencyInput
                    required
                    value={closeShiftForm.cash_close}
                    onChange={e => setCloseShiftForm(f => ({ ...f, cash_close: Number(e.target.value) }))}
                    placeholder="VD: 5.000.000"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 16, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                  />
                  
                  {/* Difference feedback */}
                  {(() => {
                    const diff = Number(closeShiftForm.cash_close || 0) - Number(activeKioskShift.live_stats?.expected_cash || 0)
                    return (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: diff === 0 ? "#f6f8fa" : diff > 0 ? "#f6f8fa" : "#f6f8fa",
                        color: diff === 0 ? '#16354d' : diff > 0 ? '#d97706' : '#dc2626',
                        display: 'flex', justifyContent: 'space-between'
                      }}>
                        <span>Chênh lệch két tiền:</span>
                        <span>{diff === 0 ? "Chuẩn khớp 0đ" : diff > 0 ? `+ ${fmtMoney(diff)} (Thừa)` : `- ${fmtMoney(Math.abs(diff))} (Thiếu)`}</span>
                      </div>
                    )
                  })()}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Ghi chú chốt ca</Label>
                  <Textarea value={closeShiftForm.note} onChange={e => setCloseShiftForm(f => ({ ...f, note: e.target.value }))} placeholder="Lý do chênh lệch hoặc ghi chú bàn giao..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, minHeight: 70, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowCloseShiftModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: "var(--primary)", color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang chốt ca...' : "Xác nhận chốt ca"}
                  </Button>
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
              <div style={{ padding: '24px', borderBottom: '1px solid #fee2e2', background: "#f6f8fa", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f6f8fa", color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#991b1b' }}>Cưỡng Chế Đóng Ca Trực Kiosk</h3>
                  </div>
                </div>
                <Button onClick={() => setShowForceCloseModal(false)} style={{ background: "#f6f8fa", border: 'none', width: 28, height: 28, borderRadius: 14, cursor: 'pointer', fontWeight: 600, color: '#991b1b' }}>×</Button>
              </div>

              <form className="workspace-form" onSubmit={handleForceCloseKioskShift} style={{ padding: 24 }}>
                <p style={{ margin: '0 0 16px', color: '#526174', fontSize: 13, lineHeight: 1.5 }}>
                  Dùng chức năng này khi nhân viên trước đã về mà <b>quên chốt ca</b>, giúp giải phóng Kiosk để nhân viên ca sau có thể mở ca làm việc.
                </p>

                <div style={{ marginBottom: 20 }}>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#263c50', marginBottom: 6 }}>Lý do cưỡng chế bàn giao *</Label>
                  <Input type="text" required value={forceCloseReason} onChange={e => setForceCloseReason(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button data-intent="danger" type="button" onClick={() => setShowForceCloseModal(false)} style={{ flex: 1, padding: '12px', background: '#f6f8fa', color: '#526174', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Hủy</Button>
                  <Button type="submit" disabled={shiftActionSubmitting} style={{ flex: 2, padding: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}>
                    {shiftActionSubmitting ? 'Đang đóng ca...' : "Xác nhận ép đóng ca"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MODAL 8: HOÀN TIỀN MẶT & HỦY ĐƠN HÀNG POS (Thành An) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {showVoidModal && voidModalOrder && (
          <PosRefundVoidModal refundOnly
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
        {/* REVIEWS MODAL */}
        {reviewModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f6f8fa' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#142b3e', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <MessageSquare size={18} color="#eab308" /> Đánh Giá Khách Hàng - {reviewModal.ten_kiosk} ({reviewModal.ma_kiosk})
                </h3>
                <Button type="button" onClick={() => setReviewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#526174' }}>
                  <X size={20} />
                </Button>
              </div>
              
              <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                {loadingReviews ? (
                  <div style={{ textAlign: 'center', color: '#526174', fontSize: '0.875rem' }}>Đang tải danh sách đánh giá...</div>
                ) : reviews.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#526174', fontSize: '0.875rem' }}>Kiosk này chưa có đánh giá nào.</div>
                ) : (
                  <>
                    <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: "#f6f8fa", borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', color: '#92400e' }}>Đánh giá trung bình:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '1.1rem', color: '#b45309' }}>{reviewStats.avg} / 5.0</strong>
                        <span style={{ fontSize: '0.85rem', color: '#d97706' }}>({reviewStats.total} đánh giá)</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <PaginatedList items={reviews} resetKey={activeKioskId}>{(rv, idx) => (
                        <div key={idx} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f6f8fa', position: 'relative' }}>
                          <Button data-intent="danger" onClick={() => deleteReview(rv.id)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: "#f6f8fa", color: '#ef4444', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>Xóa</Button>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingRight: '3rem' }}>
                            <strong style={{ fontSize: '0.9rem', color: '#142b3e' }}>{rv.ten_nguoi_dung || 'Khách hàng ẩn danh'}</strong>
                            <span style={{ fontSize: '0.8rem', color: '#526174' }}>{new Date(rv.ngay_tao).toLocaleDateString('vi-VN')}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={14} fill={i < (rv.diem_tong_quan || 5) ? '#facc15' : 'transparent'} color={i < (rv.diem_tong_quan || 5) ? '#facc15' : '#cbd5e1'} />
                            ))}
                          </div>
                          {rv.nhan_xet && <div style={{ fontSize: '0.85rem', color: '#263c50', fontStyle: 'italic' }}>"{rv.nhan_xet}"</div>}
                        </div>
                      )}</PaginatedList>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: TẤT TOÁN GÓI NHƯỢNG QUYỀN (100% HỢP ĐỒNG) */}
        {showTatToanModal && (
          <Modal title="Tất Toán Gói Nhượng Quyền (Hoàn Tất 100% Hợp Đồng)" onClose={() => setShowTatToanModal(false)}>
            {tatToanLoading && !tatToanInfo ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Đang tải thông tin thanh toán...</div>
            ) : tatToanSuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Tất Toán Gói Nhượng Quyền Thành Công!</h3>
                <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
                  Hợp đồng nhượng quyền cho Kiosk <b>{tatToanInfo?.kiosk?.ten_kiosk}</b> đã được thanh toán hoàn tất 100%. Hệ thống đã cập nhật Kiosk sang trạng thái bàn giao thiết bị và thiết lập vận hành!
                </p>
                <Button data-intent="danger"
                  type="button"
                  onClick={() => { setShowTatToanModal(false); loadAll(); }}
                  style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--primary, #0f172a)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Xong & Đóng
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Thông tin gói & cọc */}
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Kiosk:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{tatToanInfo?.kiosk?.ten_kiosk} ({tatToanInfo?.kiosk?.ma_kiosk})</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Mô hình nhượng quyền:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{tatToanInfo?.kiosk?.loai_kiosk}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Tổng giá trị trọn gói:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{fmtMoney(tatToanInfo?.tong_tien_goi)}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Đã đặt cọc giữ chỗ:</span>
                    <div style={{ fontWeight: 600, color: '#16a34a' }}>5.000.000đ (Đã khấu trừ)</div>
                  </div>
                </div>

                {/* Số tiền cần thanh toán */}
                <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, border: '1.5px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>Số tiền còn lại cần thanh toán</div>
                    <div style={{ fontSize: 11, color: '#0f4d70', marginTop: 2 }}>Tất toán 100% hợp đồng gói nhượng quyền</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#16354d' }}>
                    {fmtMoney(tatToanInfo?.so_tien_con_lai)}
                  </div>
                </div>

                {/* Chọn phương thức */}
                <div>
                  <Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>Chọn hình thức thanh toán:</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { id: 'VIETQR', label: 'VietQR Ngân hàng', icon: Store },
                      { id: 'VNPAY', label: 'Cổng VNPay', icon: CreditCard },
                      { id: 'VI_DOI_TAC', label: 'Ví Đối Tác', icon: Wallet },
                    ].map(m => (
                      <Button
                        key={m.id}
                        type="button"
                        onClick={() => setTatToanMethod(m.id)}
                        style={{
                          padding: '10px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: tatToanMethod === m.id ? '2px solid #16354d' : '1px solid #cbd5e1',
                          background: tatToanMethod === m.id ? '#eff6ff' : '#fff',
                          color: tatToanMethod === m.id ? '#1e40af' : '#475569',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                        }}
                      >
                        <m.icon size={18} />
                        {m.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Chi tiết từng phương thức */}
                {tatToanMethod === 'VIETQR' && (
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 130, height: 130, background: '#fff', padding: 6, borderRadius: 8, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                      <img
                        src={tatToanInfo?.thong_tin_chuyen_khoan?.vietqr_url}
                        alt="VietQR thanh toán tất toán gói"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 180, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div>Ngân hàng: <b>MBBank (Quân Đội)</b></div>
                      <div>STK: <b style={{ fontFamily: 'monospace' }}>{tatToanInfo?.thong_tin_chuyen_khoan?.so_tai_khoan}</b></div>
                      <div>Chủ TK: <b>{tatToanInfo?.thong_tin_chuyen_khoan?.chu_tai_khoan}</b></div>
                      <div>Nội dung CK: <b style={{ color: '#16354d', fontFamily: 'monospace' }}>{tatToanInfo?.thong_tin_chuyen_khoan?.noi_dung}</b></div>
                    </div>
                  </div>
                )}

                {tatToanMethod === 'VNPAY' && (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Cổng Thanh Toán Trực Tuyến VNPay</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>Hỗ trợ thẻ ngân hàng nội địa, Visa/Mastercard và quét mã VNPAY-QR.</div>
                  </div>
                )}

                {tatToanMethod === 'VI_DOI_TAC' && (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Số dư ví đối tác hiện tại:</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: (walletBalance || 0) >= (tatToanInfo?.so_tien_con_lai || 0) ? '#16a34a' : '#dc2626' }}>
                        {fmtMoney(walletBalance || 0)}
                      </div>
                    </div>
                    {(walletBalance || 0) < (tatToanInfo?.so_tien_con_lai || 0) && (
                      <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>Số dư không đủ</span>
                    )}
                  </div>
                )}

                {/* Nút hành động */}
                <div data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <Button data-intent="danger"
                    type="button"
                    onClick={() => setShowTatToanModal(false)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 500 }}
                  >
                    Đóng
                  </Button>
                  <Button
                    type="button"
                    disabled={tatToanLoading || (tatToanMethod === 'VI_DOI_TAC' && (walletBalance || 0) < (tatToanInfo?.so_tien_con_lai || 0))}
                    onClick={handleXacNhanTatToanGoi}
                    style={{
                      padding: '8px 20px', borderRadius: 8, border: 'none', background: '#16354d', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      opacity: (tatToanLoading || (tatToanMethod === 'VI_DOI_TAC' && (walletBalance || 0) < (tatToanInfo?.so_tien_con_lai || 0))) ? 0.6 : 1
                    }}
                  >
                    {tatToanLoading ? 'Đang xử lý...' : `Xác Nhận Tất Toán ${fmtMoney(tatToanInfo?.so_tien_con_lai)}`}
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        )}

      </div>
    </ErrorBoundary>
  )
}
