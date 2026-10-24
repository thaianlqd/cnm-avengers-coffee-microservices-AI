import { KioskStaffHeader, KioskStaffSchedulePanel, KioskStaffShiftManagement, KioskStaffAccount } from './KioskStaffWorkspace'
import KioskPosTerminal from './KioskPosTerminal'
import KioskOrdersPanel from './KioskOrdersPanel'
import { kioskCheckoutResult } from './kioskPosModel'
import { useKioskAvailability } from './useKioskAvailability'
import OperationalPageFrame from '../../components/console/OperationalPageFrame'
import { WorkspaceSidebar } from '../../components/console/WorkspaceNavigation'
import './KioskWorkspace.css'
import StatusBadge from '../../components/console/StatusBadge'
import { Table } from '../../components/ui/table'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PaginatedList } from '../../components/console/CompactPagination'
import CurrencyInput from '../../components/console/CurrencyInput'
import SearchableSelect from '../../components/console/SearchableSelect'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { WorkspaceErrorBoundary } from '../../components/console/WorkspaceErrorBoundary'
import {
  Monitor,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  PlusCircle,
  UserCheck,
  RotateCcw,
  Coffee,
  Check,
  X,
  RefreshCw,
  LogOut,
  Key,
  CreditCard,
  DollarSign,
  Receipt,
  PlayCircle,
  Lock,
  Search,
  ChevronLeft,
  ChevronRight,
  Store,
  FileText,
  User,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunset,
  Moon,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  CalendarDays,
  CheckCheck,
  Users,
  AlertTriangle,
  ArrowRight,
  Tag,
  Info,
  CheckSquare,
  Package,
  LayoutGrid,
  List
} from '../../components/console/WorkspaceIcons'
import { API_BASE_URL } from '../admin-dashboard/constants'

const SHIFT_TEMPLATES = [
  { id: 'SANG', name: 'Ca Sáng', time: '06:00 - 12:00', start: '06:00', end: '12:00', icon: Sun, bg: "#f6f8fa", border: '#fef3c7', text: '#b45309', accent: '#f59e0b', badgeBg: '#fef3c7' },
  { id: 'CHIEU', name: 'Ca Chiều', time: '12:00 - 18:00', start: '12:00', end: '18:00', icon: Sunset, bg: "#f6f8fa", border: '#ffedd5', text: '#c2410c', accent: '#f97316', badgeBg: '#ffedd5' },
  { id: 'TOI', name: 'Ca Tối', time: '18:00 - 23:00', start: '18:00', end: '23:00', icon: Moon, bg: "#f6f8fa", border: '#dbeafe', text: '#1d4ed8', accent: '#16354d', badgeBg: '#dbeafe' },
]

// Cấu hình danh mục và sản phẩm cho từng gói nhượng quyền
const KIOSK_PACKAGES = {
  XE_LUU_DONG: {
    name: 'Gói Xe Cà Phê Lưu Động',
    short: 'Xe Lưu Động',
    color: '#d97706',
    bg: "#f6f8fa",
    border: '#fde68a',
    desc: 'Chỉ kinh doanh cà phê, trà & đồ uống pha chế nhanh mang đi',
  },
  KIOSK_CO_DINH: {
    name: 'Gói Kiosk Cố Định Take-Away',
    short: 'Kiosk Cố Định',
    color: 'var(--primary)',
    bg: 'var(--primary-light)',
    border: '#ddd6fe',
    desc: 'Kinh doanh đồ uống hoàn chỉnh & bánh ngọt ăn kèm',
  },
  CONTAINER_CAFE: {
    name: 'Gói Container Café Cao Cấp',
    short: 'Container Café',
    color: '#16354d',
    bg: "#f6f8fa",
    border: '#bfdbfe',
    desc: 'Kinh doanh thực đơn đầy đủ: Thức uống chuyên nghiệp, bánh ngọt và bánh mặn',
  },
}

const STAFF_PAGES = [
          { id: 'pos', label: 'Bán hàng POS Kiosk', icon: Monitor },
          { id: 'pos_orders', label: 'Đơn bán hàng', icon: Receipt },
          { id: 'shift_schedule', label: 'Lịch làm & Đăng ký ca', icon: Calendar },
          { id: 'kiosk_shifts', label: 'Quản lý ca làm việc', icon: Clock },
          { id: 'account', label: 'Tài khoản cá nhân', icon: User },

]

export function FranchiseStaffPortal({ session, onLogout }) {
  const [profile, setProfile] = useState(session?.user || {})
  const user = { ...(session?.user || {}), ...profile }
  const userName = user.tenDangNhap || user.ten_dang_nhap || 'Nhân viên Kiosk'
  const userFullName = user.hoTen || user.ho_ten || userName
  const kioskCode = user.coSoMa || user.co_so_ma || ''
  const kioskName = user.coSoTen || user.co_so_ten || 'Kiosk Avengers'
  const token = session?.token || session?.accessToken
  const availability = useKioskAvailability(kioskCode, token)

  // ─── THÔNG TIN KIOSK & GÓI NHƯỢNG QUYỀN ĐĂNG KÝ ───
  const [kioskInfo, setKioskInfo] = useState(null)
  const [kioskInfoLoading, setKioskInfoLoading] = useState(Boolean(kioskCode))
  const [kioskInfoError, setKioskInfoError] = useState('')
  const [kioskInfoAttempt, setKioskInfoAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setKioskInfo(null)
    setKioskInfoError('')
    setKioskInfoLoading(Boolean(kioskCode))
    if (!kioskCode) return () => { current = false }
    fetch(`${API_BASE_URL}/franchise/kiosk/public`)
      .then(res => { if (!res.ok) throw new Error('Không tải được thông tin kiosk.'); return res.json() })
      .then(kiosks => {
        if (!current) return
        const found = (Array.isArray(kiosks) ? kiosks : []).find(k => k.ma_kiosk === kioskCode)
        // This public endpoint returns operating kiosks only and older responses omit the status field.
        setKioskInfo(found ? {...found, trang_thai: found.trang_thai || 'DANG_HOAT_DONG'} : null)
      })
      .catch(() => { if (current) setKioskInfoError('Chưa tải được thông tin kiosk. Kiểm tra kết nối rồi thử lại.') })
      .finally(() => { if (current) setKioskInfoLoading(false) })
    return () => { current = false }
  }, [kioskCode, kioskInfoAttempt])

  const currentPackageType = kioskInfo?.loai_kiosk || 'CONTAINER_CAFE'
  const packageMeta = KIOSK_PACKAGES[currentPackageType] || KIOSK_PACKAGES.CONTAINER_CAFE

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE_URL}/users/me`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setProfile(prev => ({ ...prev, ...data }))
          }
        })
        .catch(() => {})
    }
  }, [token])

  const [tab, setTab] = useState('pos') // 'pos' | 'shift_schedule' | 'kiosk_shifts' | 'account'
  const [msg, setMsg] = useState(null)

  const showToast = (type, text) => {
    setMsg({ type, text })
  }

  useEffect(() => {
    if (!msg) return undefined
    const timeout = window.setTimeout(() => setMsg(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [msg])

  // ─── API FETCH HELPER ───
  const apiFetch = useCallback(async (path, opts = {}) => {
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
  }, [token])

  // ─── TÍNH TOÁN TUẦN KẾ TIẾP & RÀNG BUỘC ĐĂNG KÝ CA ───
  const nextWeekRange = useMemo(() => {
    const now = new Date()
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const vnDayOfWeek = vnNow.getUTCDay()
    const isSunday = vnDayOfWeek === 0

    const currentMondayUtc = Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate() - (vnDayOfWeek === 0 ? 6 : vnDayOfWeek - 1)
    )

    const nextMondayDate = new Date(currentMondayUtc + 7 * 24 * 60 * 60 * 1000)
    const nextSundayDate = new Date(currentMondayUtc + 13 * 24 * 60 * 60 * 1000)

    const fmt = (d) => {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const fmtDisplay = (d) => {
      const day = String(d.getUTCDate()).padStart(2, '0')
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      return `${day}/${m}`
    }

    const nextDays = []
    const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật']
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMondayUtc + (7 + i) * 24 * 60 * 60 * 1000)
      nextDays.push({
        dateKey: fmt(d),
        display: fmtDisplay(d),
        label: dayNames[i],
      })
    }

    return {
      isSunday,
      nextMondayStr: fmt(nextMondayDate),
      nextSundayStr: fmt(nextSundayDate),
      nextMondayFmt: fmtDisplay(nextMondayDate),
      nextSundayFmt: fmtDisplay(nextSundayDate),
      nextDays,
    }
  }, [])

  const [rawMenuItems, setRawMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [kioskPrices, setKioskPrices] = useState([])

  useEffect(() => {
    if (!kioskCode) return;
    fetch(`${API_BASE_URL}/orders/kiosk-prices?ma_kiosk=${kioskCode}`)
      .then(r => r.json())
      .then(data => setKioskPrices(Array.isArray(data?.items) ? data.items : []))
      .catch(e => console.error('Lỗi tải giá kiosk:', e))
  }, [kioskCode])

  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('TIEN_MAT')
  const [cashGiven, setCashGiven] = useState('')
  const posSubmitLock = React.useRef(false)
  const [posSubmitting, setPosSubmitting] = useState(false)
  const [lastReceipt, setLastReceipt] = useState(null)

  const loadMenu = useCallback(async () => {
    setMenuLoading(true)
    try {
      let rawItems = []
      try {
        const res = await apiFetch(`/menu/items`)
        rawItems = Array.isArray(res) ? res : res?.items || []
      } catch {
        const res2 = await apiFetch(`/menu/san-pham`)
        rawItems = Array.isArray(res2) ? res2 : res2?.items || []
      }

      const normalized = (Array.isArray(rawItems) ? rawItems : []).map((item) => {
        const id = Number(item.ma_san_pham || item.id)
        const name = item.ten_san_pham || item.name || 'Sản phẩm'
        const price = Number(item.gia_ban || item.price || 0)
        let category = 'Món chính'
        if (typeof item.danh_muc === 'string' && item.danh_muc) {
          category = item.danh_muc
        } else if ((item.danhMuc?.ten_danh_muc || item.danhMuc?.tenDanhMuc)) {
          category = item.danhMuc.ten_danh_muc || item.danhMuc.tenDanhMuc
        } else if (item.category) {
          category = item.category
        }

        let image = item.hinh_anh_url || item.image || ''
        if (image && !image.startsWith('http') && !image.startsWith('/')) {
          image = `/${image}`
        }

        const isAvailable = item.dang_ban !== undefined 
          ? Boolean(item.dang_ban) 
          : (item.trang_thai !== undefined ? Boolean(item.trang_thai) : true)

        return {
          ma_san_pham: id,
          ten_san_pham: name,
          gia_ban: price,
          danh_muc: category,
          hinh_anh_url: image,
          mo_ta: item.mo_ta || item.description || '',
          dang_ban: isAvailable,
          sizes: item.sizes,
          toppings: item.toppings,
        }
      })

      setRawMenuItems(normalized)
    } catch (e) {
      console.error('Lỗi khi tải thực đơn:', e)
      setRawMenuItems([])
    } finally {
      setMenuLoading(false)
    }
  }, [apiFetch])

  // LỌC SẢN PHẨM CHUẨN XÁC THEO GÓI NHƯỢNG QUYỀN ĐÃ ĐĂNG KÝ
  const packageAllowedMenu = useMemo(() => {
    if (!Array.isArray(rawMenuItems) || !availability.ready) return []
    return rawMenuItems.filter(availability.isSelling).filter((item) => {
      const cat = String(item.danh_muc || '').trim()
      const catLower = cat.toLowerCase()

      // Luôn loại bỏ các danh mục nội bộ không kinh doanh lẻ tại quầy Kiosk
      if (catLower.includes('topping') || catLower.includes('ưu đãi') || catLower.includes('merchandise')) {
        return false
      }

      // 1. Gói Xe Cà Phê Lưu Động (XE_LUU_DONG):
      // Chỉ phục vụ cà phê và trà truyền thống
      if (currentPackageType === 'XE_LUU_DONG') {
        const isCoffeeOrTea =
          catLower.includes('cà phê') || catLower.includes('espresso') ||
          catLower.includes('americano') || catLower.includes('latte') ||
          catLower.includes('trà')
        const isFood = catLower.includes('bánh') || catLower.includes('pizza')
        return isCoffeeOrTea && !isFood
      }

      // 2. Gói Kiosk Cố Định (KIOSK_CO_DINH):
      // Đồ uống đầy đủ & Bánh ngọt (không bán đồ nướng mặn như Pizza, Bánh mặn)
      if (currentPackageType === 'KIOSK_CO_DINH') {
        const isFoodNotAllowed = catLower.includes('pizza') || catLower.includes('bánh mặn')
        return !isFoodNotAllowed
      }

      // 3. Gói Container Café (CONTAINER_CAFE):
      // Đầy đủ đồ uống, bánh ngọt và bánh mặn (không bán pizza nhà hàng)
      if (currentPackageType === 'CONTAINER_CAFE') {
        return !catLower.includes('pizza')
      }

      return true
    }).map((item) => {
      const kp = kioskPrices.find(p => Number(p.ma_san_pham) === Number(item.ma_san_pham));
      return kp ? { ...item, gia_ban: kp.gia_kiosk } : item;
    })
  }, [rawMenuItems, currentPackageType, kioskPrices, availability])

  // ─── TAB 2: WORK SHIFTS STATES & HANDLERS ───
  const [weekOffset, setWeekOffset] = useState(0)
  const [workShifts, setWorkShifts] = useState([])
  const [workShiftsLoading, setWorkShiftsLoading] = useState(false)
  const [myShiftRequests, setMyShiftRequests] = useState([])
  const [myRequestsLoading, setMyRequestsLoading] = useState(false)
  const [requestForm, setRequestForm] = useState({
    shift_date: nextWeekRange.nextMondayStr,
    shift_code: 'SANG',
    note: '',
  })
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [deletingRequestId, setDeletingRequestId] = useState('')
  const requestLock = React.useRef(false)

  const currentWeekDays = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay()
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay
    const monday = new Date(now)
    monday.setDate(now.getDate() + diffToMonday + weekOffset * 7)

    const days = []
    const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật']
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isToday = d.toDateString() === new Date().toDateString()
      days.push({ dateKey, label: dayLabels[i], date: d, isToday })
    }
    return days
  }, [weekOffset])

  const loadWorkShifts = useCallback(async () => {
    setWorkShiftsLoading(true)
    try {
      const fromDate = currentWeekDays[0].dateKey
      const toDate = currentWeekDays[6].dateKey
      const res = await apiFetch(`/manager/work-shifts?branch_code=${kioskCode}&from=${fromDate}&to=${toDate}`)
      setWorkShifts(res?.items || [])
    } catch (e) {
      console.error('Lỗi tải lịch ca chi nhánh:', e)
      try {
        const fromDate = currentWeekDays[0].dateKey
        const toDate = currentWeekDays[6].dateKey
        const myRes = await apiFetch(`/staff/work-shifts?staff_username=${userName}&branch_code=${kioskCode}&from=${fromDate}&to=${toDate}`)
        setWorkShifts(myRes?.items || [])
      } catch {
        setWorkShifts([])
      }
    } finally {
      setWorkShiftsLoading(false)
    }
  }, [apiFetch, currentWeekDays, kioskCode, userName])

  const loadMyShiftRequests = useCallback(async () => {
    setMyRequestsLoading(true)
    try {
      const res = await apiFetch(`/staff/work-shifts?staff_username=${userName}&branch_code=${kioskCode}`)
      setMyShiftRequests(res?.items || [])
    } catch (e) {
      console.error(e)
      setMyShiftRequests([])
    } finally {
      setMyRequestsLoading(false)
    }
  }, [apiFetch, userName, kioskCode])

  const handleCreateShiftRequest = async (e) => {
    if (e) e.preventDefault()
    if (nextWeekRange.isSunday) {
      setRequestError('Đã hết hạn đăng ký tuần tới. Liên hệ quản lý để bổ sung ca.')
      return
    }
    if (requestForm.shift_date < nextWeekRange.nextMondayStr || requestForm.shift_date > nextWeekRange.nextSundayStr) {
      setRequestError(`Chọn ngày trong tuần ${nextWeekRange.nextMondayFmt} – ${nextWeekRange.nextSundayFmt}.`)
      return
    }

    if (!kioskCode || requestLock.current) return
    requestLock.current = true
    setRequestError('')
    setRequestSubmitting(true)
    try {
      await apiFetch('/staff/work-shifts/requests', {
        method: 'POST',
        body: JSON.stringify({
          staff_username: userName,
          staff_name: userFullName,
          shift_date: requestForm.shift_date,
          shift_code: requestForm.shift_code,
          note: requestForm.note,
          branch_code: kioskCode,
        }),
      })
      showToast('success', 'Đã gửi yêu cầu đăng ký ca thành công! Yêu cầu đang chờ xét duyệt.')
      setRequestForm((f) => ({ ...f, note: '' }))
      loadWorkShifts()
      loadMyShiftRequests()
    } catch (err) {
      setRequestError(err.message)
    } finally {
      requestLock.current = false
      setRequestSubmitting(false)
    }
  }

  const handleDeleteMyRequest = async (requestId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy yêu cầu đăng ký ca làm việc này không?')) return
    setDeletingRequestId(requestId)
    try {
      await apiFetch(`/staff/work-shifts/requests/${requestId}?branch_code=${kioskCode}`, { method: 'DELETE' })
      showToast('success', 'Đã hủy yêu cầu đăng ký ca.')
      loadWorkShifts()
      loadMyShiftRequests()
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setDeletingRequestId('')
    }
  }

  const handleQuickSelectShift = (dateKey, shiftCode) => {
    if (nextWeekRange.isSunday) {
      setRequestError('Đã hết hạn đăng ký tuần tới.')
      return
    }
    if (dateKey < nextWeekRange.nextMondayStr || dateKey > nextWeekRange.nextSundayStr) {
      setRequestError(`Chọn ngày trong tuần ${nextWeekRange.nextMondayFmt} – ${nextWeekRange.nextSundayFmt}.`)
      return
    }
    setRequestError('')
    setRequestForm((prev) => ({
      ...prev,
      shift_date: dateKey,
      shift_code: shiftCode,
    }))
    showToast('info', `Đã chọn ngày ${dateKey} - Ca ${shiftCode === 'SANG' ? 'Sáng' : shiftCode === 'CHIEU' ? 'Chiều' : 'Tối'}. Vui lòng nhấn "Gửi đăng ký".`)
  }

  // ─── TAB 3: KIOSK LIVE SHIFTS ───
  const [activeKioskShift, setActiveKioskShift] = useState(null)
  const [activeShiftLoading, setActiveShiftLoading] = useState(false)
  const [kioskShiftHistory, setKioskShiftHistory] = useState([])
  const [shiftHistoryLoading, setShiftHistoryLoading] = useState(false)
  const [activeShiftError, setActiveShiftError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [shiftActionError, setShiftActionError] = useState('')
  const shiftActionLock = React.useRef(false)
  const [cashOpenInput, setCashOpenInput] = useState('')
  const [cashCloseInput, setCashCloseInput] = useState('')
  const [shiftNote, setShiftNote] = useState('')
  const [kioskShiftSubmitting, setKioskShiftSubmitting] = useState(false)

  const loadActiveKioskShift = useCallback(async () => {
    if (!kioskCode) { setActiveShiftError('Tài khoản chưa được phân công kiosk.'); return }
    setActiveShiftLoading(true)
    setActiveShiftError('')
    try {
      setActiveKioskShift(await apiFetch(`/staff/kiosk-shifts/active?branch_code=${encodeURIComponent(kioskCode)}`))
    } catch (error) {
      setActiveShiftError(error.message || 'Không tải được ca hiện tại. Vui lòng thử lại.')
    } finally { setActiveShiftLoading(false) }
  }, [apiFetch, kioskCode])

  const loadKioskShiftHistory = useCallback(async () => {
    if (!kioskCode) return
    setShiftHistoryLoading(true)
    setHistoryError('')
    try {
      const response = await apiFetch(`/staff/kiosk-shifts/history?branch_code=${encodeURIComponent(kioskCode)}&limit=20`)
      setKioskShiftHistory(Array.isArray(response) ? response : response?.items || [])
    } catch (error) {
      setHistoryError(error.message || 'Không tải được lịch sử ca. Vui lòng thử lại.')
    } finally { setShiftHistoryLoading(false) }
  }, [apiFetch, kioskCode])

  const handleOpenKioskShift = async (e) => {
    e.preventDefault()
    if (shiftActionLock.current || !kioskCode) return
    if (cashOpenInput === '' || !Number.isFinite(Number(cashOpenInput)) || Number(cashOpenInput) < 0) { setShiftActionError('Nhập số tiền mặt đầu ca hợp lệ.'); return }
    shiftActionLock.current = true
    setShiftActionError('')
    setKioskShiftSubmitting(true)
    try {
      await apiFetch('/staff/kiosk-shifts/open', {
        method:'POST', body:JSON.stringify({branch_code:kioskCode,staff_username:userName,staff_name:userFullName,cash_open:Number(cashOpenInput),note:shiftNote}),
      })
      showToast('success', 'Mở ca làm việc tại Kiosk thành công!')
      setShiftNote('')
      setCashCloseInput('')
      loadActiveKioskShift()
      loadKioskShiftHistory()
    } catch (err) {
      setShiftActionError(err.message)
    } finally {
      shiftActionLock.current = false
      setKioskShiftSubmitting(false)
    }
  }

  const handleCloseKioskShift = async (e) => {
    e.preventDefault()
    if (shiftActionLock.current || !kioskCode) return
    if (cashCloseInput === '' || !Number.isFinite(Number(cashCloseInput)) || Number(cashCloseInput) < 0) { setShiftActionError('Nhập số tiền mặt thực tế cuối ca.'); return }
    shiftActionLock.current = true
    setShiftActionError('')
    setKioskShiftSubmitting(true)
    try {
      await apiFetch('/staff/kiosk-shifts/close', {
        method: 'POST',
        body: JSON.stringify({
          branch_code: kioskCode,
          cash_close: Number(cashCloseInput) || 0,
          note: shiftNote,
        })
      })
      showToast('success', 'Đã chốt ca và gửi đối soát. Bạn có thể mở ca mới ngay.')
      setShiftNote('')
      setCashCloseInput('')
      loadActiveKioskShift()
      loadKioskShiftHistory()
    } catch (err) {
      setShiftActionError(err.message)
    } finally {
      shiftActionLock.current = false
      setKioskShiftSubmitting(false)
    }
  }

  // ─── INITIAL LOAD ───
  useEffect(() => {
    loadMenu()
    loadActiveKioskShift()
  }, [loadMenu, loadActiveKioskShift])

  useEffect(() => {
    if (tab === 'shift_schedule') {
      loadWorkShifts()
      loadMyShiftRequests()
    } else if (tab === 'kiosk_shifts') {
      loadActiveKioskShift()
      loadKioskShiftHistory()
    }
  }, [tab, loadWorkShifts, loadMyShiftRequests, loadActiveKioskShift, loadKioskShiftHistory])

  // Cart calculations
  const cartTotal = cart.reduce((sum, item) => sum + item.gia_ban * item.qty, 0)

  const addToCart = (product) => {
    if (!availability.ready || !availability.isSelling(product)) return
    setCart((prev) => {
      const exist = prev.find((p) => p.ma_san_pham === product.ma_san_pham)
      if (exist) {
        return prev.map((p) => (p.ma_san_pham === product.ma_san_pham ? { ...p, qty: p.qty + 1 } : p))
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }

  const updateCartQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((p) => (p.ma_san_pham === productId ? { ...p, qty: p.qty + delta } : p))
        .filter((p) => p.qty > 0)
    )
  }

  const removeCartItem = (productId) => {
    setCart((prev) => prev.filter((p) => p.ma_san_pham !== productId))
  }

  const handleCheckoutPos = async () => {
    if (cart.length === 0) return
    if (!activeKioskShift?.has_open_shift) {
      setLastReceipt({ success:false, error:'Kiosk chưa mở ca. Vui lòng mở ca trước khi thanh toán.' })
      return
    }
    if (paymentMethod === 'TIEN_MAT' && Number(cashGiven || 0) < cartTotal) {
      setLastReceipt({ success:false, error:'Số tiền khách đưa chưa đủ.' })
      return
    }

    if (posSubmitLock.current) return
    posSubmitLock.current = true
    setPosSubmitting(true)
    try {
      const mappedPayment = paymentMethod === 'TIEN_MAT' ? 'THANH_TOAN_KHI_NHAN_HANG' : paymentMethod

      const payload = {
        branch_code: kioskCode,
        ten_thu_ngan: userName,
        loai_don_hang: 'MANG_DI',
        phuong_thuc_thanh_toan: mappedPayment,
        tien_khach_dua: paymentMethod === 'TIEN_MAT' ? Number(cashGiven) || cartTotal : cartTotal,
        items: cart.map((i) => ({
          ma_san_pham: i.ma_san_pham,
          ten_san_pham: i.ten_san_pham,
          gia_ban: i.gia_ban,
          so_luong: i.qty,
        })),
      }

      const res = await apiFetch('/staff/orders', { method:'POST', body:JSON.stringify(payload) })
      setLastReceipt(kioskCheckoutResult(res, { total:cartTotal, method:paymentMethod, cash:cashGiven }))
      setCart([])
      setCashGiven('')
    } catch (err) {
      setLastReceipt({ success:false, error:err.message })
    } finally {
      posSubmitLock.current = false
      setPosSubmitting(false)
    }
  }

  const combinedShifts = useMemo(() => {
    const shiftMap = new Map()
    workShifts.forEach((s) => {
      const key = `${s.ma_ca_lam_viec || s.id}`
      shiftMap.set(key, s)
    })
    myShiftRequests.forEach((req) => {
      const key = `${req.ma_ca_lam_viec || req.id}`
      if (!shiftMap.has(key)) {
        shiftMap.set(key, req)
      }
    })
    return Array.from(shiftMap.values())
  }, [workShifts, myShiftRequests])

  return (
    <div className="console-shell console-kiosk-staff kiosk-workspace" data-actor="kiosk-staff">
      
      {msg && <div className={`kiosk-staff-feedback ${msg.type === 'error' ? 'is-error' : ''}`} role={msg.type === 'error' ? 'alert' : 'status'}>
        {msg.type === 'error' ? <XCircle size={20} /> : msg.type === 'info' ? <Info size={20} /> : <CheckCircle2 size={20} />}<span>{msg.text}</span><Button variant="ghost" size="icon" aria-label="Đóng thông báo" onClick={() => setMsg(null)}><X size={15} /></Button>
      </div>}

      <WorkspaceSidebar groups={[{label:'Điểm bán & vận hành',items:STAFF_PAGES}]} activeTab={tab} onSelect={setTab} session={{...session,user}} onLogout={onLogout} label="Nhân viên kiosk"/>
      <main className="console-main">
        <OperationalPageFrame groups={[{label:'Điểm bán & vận hành',items:STAFF_PAGES}]} activeTab={tab} onSelect={setTab} session={{...session,user}} onLogout={onLogout} branchName="Nhân viên kiosk" headerContext={<KioskStaffHeader name={kioskInfo?.ten_kiosk || kioskName} code={kioskCode} loading={kioskInfoLoading} active={kioskInfo?.trang_thai === 'DANG_HOAT_DONG'} />} pageDescriptions={{pos_orders:'Tra cứu đơn đã bán và hoàn tiền tại kiosk được phân công.',pos:'Mở ca, chọn món và nhận thanh toán tại kiosk được phân công.',shift_schedule:'Xem lịch làm việc và gửi yêu cầu đăng ký ca.',kiosk_shifts:'Kiểm đếm tiền, mở ca và gửi chốt ca để quản lý đối soát.',account:'Thông tin liên hệ và bảo mật tài khoản của bạn.'}}>
        <div className="console-kiosk-body">
        <WorkspaceErrorBoundary key={tab} inline>
        {tab==='pos'&&kioskInfo&&availability.loading&&<p role="status">Đang tải trạng thái bán của kiosk…</p>}
        {tab==='pos'&&kioskInfo&&availability.error&&<div className="workspace-form-error" role="alert">{availability.error}<Button type="button" variant="outline" onClick={availability.reload}>Thử tải lại trạng thái bán</Button></div>}
        
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 1: POS BÁN HÀNG TẠI KIOSK - CỐ ĐỊNH CHIỀU CAO KHÔNG CUỘN TRANG */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'pos' && (
          !kioskCode ? <div className="operation-empty" role="status">Tài khoản chưa được gắn kiosk. Liên hệ quản lý để phân công điểm bán.</div> :
          kioskInfoLoading ? <div className="operation-empty" role="status">Đang tải thông tin kiosk…</div> :
          kioskInfoError ? <div className="operation-surface" role="alert"><p>{kioskInfoError}</p><Button type="button" variant="outline" onClick={()=>setKioskInfoAttempt(n=>n+1)}><RefreshCw size={15}/>Thử tải lại kiosk</Button></div> :
          !kioskInfo ? <div className="operation-surface"><h2>Kiosk chưa sẵn sàng bán hàng</h2><p className="operation-note">Chưa tìm thấy kiosk được phân công trong danh sách đang hoạt động. Liên hệ quản lý để kiểm tra trạng thái.</p><Button type="button" variant="outline" onClick={()=>setKioskInfoAttempt(n=>n+1)}>Kiểm tra lại</Button></div> :
          kioskInfo?.trang_thai !== 'DANG_HOAT_DONG' ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', margin: '0 auto', maxWidth: 600, marginTop: 40 }}>
              <Lock size={48} color="#526174" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#263c50', marginBottom: 8 }}>Kiosk Chưa Hoạt Động</h2>
              <p style={{ color: '#526174' }}>Kiosk này hiện chưa khai trương chính thức hoặc chưa hoàn tất mua Combo nhượng quyền.<br />Vui lòng liên hệ Quản lý để biết thêm chi tiết.</p>
            </div>
          ) : activeShiftError ? (
            <div className="kiosk-staff-load-error" role="alert"><p>{activeShiftError}</p><Button variant="outline" onClick={loadActiveKioskShift}>Thử tải lại ca</Button></div>
          ) : activeShiftLoading ? (
            <div className="operation-surface operation-empty" role="status">Đang kiểm tra ca làm việc trước khi mở POS…</div>
          ) : !activeKioskShift?.has_open_shift ? (
            <div className="operation-surface kiosk-pos-shift-gate" role="status">
              <Lock size={30} />
              <h2>Cần mở ca trước khi bán hàng</h2>
              <p>Mở ca và kiểm đếm tiền đầu ca để bắt đầu tạo đơn tại kiosk. Ca đã chốt chờ duyệt riêng trong lịch sử.</p>
              <Button type="button" onClick={() => setTab('kiosk_shifts')}>Mở ca tại kiosk</Button>
            </div>
          ) : (
          <KioskPosTerminal key={kioskCode} products={packageAllowedMenu} loading={menuLoading || !availability.ready} packageName={packageMeta.name}
            cart={cart.map(item => ({ id:item.ma_san_pham, productId:item.ma_san_pham, name:item.ten_san_pham, price:item.gia_ban, quantity:item.qty }))}
            total={cartTotal} payment={paymentMethod} cash={cashGiven} submitting={posSubmitting} result={lastReceipt}
            onAdd={addToCart} onQuantity={(id, quantity) => { const item=cart.find(item=>item.ma_san_pham===id); if(item) updateCartQty(id,quantity-item.qty) }}
            onRemove={removeCartItem} onClear={() => setCart([])} onPayment={setPaymentMethod} onCash={setCashGiven}
            onCheckout={handleCheckoutPos} onResult={setLastReceipt} onOrders={() => setTab('pos_orders')} onCheckPayment={async id => {
              const response = await apiFetch(`/staff/orders?branch_code=${encodeURIComponent(kioskCode)}&q=${encodeURIComponent(id)}&limit=1`)
              return (response.orders || response.items || []).find(order => order.ma_don_hang === id)
            }} />
          )
        )}
        {tab === 'pos_orders' && <KioskOrdersPanel branchCode={kioskCode} token={token} canRefund={(user.pos_permissions || user.posPermissions || []).includes('pos_allow_cancel')} onRefund={loadActiveKioskShift} onMessage={showToast} />}
        {tab === 'shift_schedule' && <KioskStaffSchedulePanel nextWeek={nextWeekRange} templates={SHIFT_TEMPLATES}
          form={requestForm} onFormChange={form => { setRequestError(''); setRequestForm(form) }} onSubmit={handleCreateShiftRequest}
          submitting={requestSubmitting} requestError={requestError} requests={myShiftRequests} requestsLoading={myRequestsLoading}
          onDelete={handleDeleteMyRequest} deletingId={deletingRequestId} days={currentWeekDays} items={combinedShifts}
          calendarLoading={workShiftsLoading} weekOffset={weekOffset} onWeekChange={setWeekOffset}
          onRefresh={() => { loadWorkShifts(); loadMyShiftRequests() }} onQuickSelect={handleQuickSelectShift} username={userName} />}
        {tab === 'kiosk_shifts' && <KioskStaffShiftManagement active={activeKioskShift} loading={activeShiftLoading}
          loadError={activeShiftError} history={kioskShiftHistory} historyLoading={shiftHistoryLoading} historyError={historyError} username={userName}
          cashOpen={cashOpenInput} onCashOpen={setCashOpenInput} cashClose={cashCloseInput} onCashClose={setCashCloseInput}
          note={shiftNote} onNote={setShiftNote} busy={kioskShiftSubmitting} error={shiftActionError}
          onOpen={handleOpenKioskShift} onClose={handleCloseKioskShift} onRefresh={() => { loadActiveKioskShift(); loadKioskShiftHistory() }} onPos={() => setTab('pos')} />}
        {tab === 'account' && <KioskStaffAccount session={session} user={user} onProfileUpdated={updated => { setProfile(prev => ({...prev,...updated})); showToast('success','Đã cập nhật hồ sơ cá nhân.') }} />}
        </WorkspaceErrorBoundary>
        </div>
        </OperationalPageFrame>
      </main>

    </div>
  )
}

export default FranchiseStaffPortal
