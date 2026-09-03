import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
} from 'lucide-react'
import { API_BASE_URL } from '../admin-dashboard/constants'

const fmtMoney = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ'

const SHIFT_TEMPLATES = [
  { id: 'SANG', name: 'Ca Sáng', time: '06:00 - 12:00', start: '06:00', end: '12:00', icon: Sun, bg: '#fffbeb', border: '#fef3c7', text: '#b45309', accent: '#f59e0b', badgeBg: '#fef3c7' },
  { id: 'CHIEU', name: 'Ca Chiều', time: '12:00 - 18:00', start: '12:00', end: '18:00', icon: Sunset, bg: '#fff7ed', border: '#ffedd5', text: '#c2410c', accent: '#f97316', badgeBg: '#ffedd5' },
  { id: 'TOI', name: 'Ca Tối', time: '18:00 - 23:00', start: '18:00', end: '23:00', icon: Moon, bg: '#f0fdf4', border: '#dcfce7', text: '#15803d', accent: '#16a34a', badgeBg: '#dcfce7' },
]

// Cấu hình danh mục và sản phẩm cho từng gói nhượng quyền
const KIOSK_PACKAGES = {
  XE_LUU_DONG: {
    name: 'Gói Xe Cà Phê Lưu Động',
    short: 'Xe Lưu Động',
    color: '#d97706',
    bg: '#fef3c7',
    border: '#fde68a',
    desc: 'Chỉ kinh doanh cà phê, trà & đồ uống pha chế nhanh mang đi',
  },
  KIOSK_CO_DINH: {
    name: 'Gói Kiosk Cố Định Take-Away',
    short: 'Kiosk Cố Định',
    color: '#7c3aed',
    bg: '#ede9fe',
    border: '#ddd6fe',
    desc: 'Kinh doanh đồ uống hoàn chỉnh & bánh ngọt ăn kèm',
  },
  CONTAINER_CAFE: {
    name: 'Gói Container Café Cao Cấp',
    short: 'Container Café',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    desc: 'Kinh doanh thực đơn đầy đủ: Thức uống chuyên nghiệp, bánh ngọt và bánh mặn',
  },
}

export function FranchiseStaffPortal({ session, onLogout }) {
  const [profile, setProfile] = useState(session?.user || {})
  const user = { ...(session?.user || {}), ...profile }
  const userName = user.tenDangNhap || user.ten_dang_nhap || 'Nhân viên Kiosk'
  const userFullName = user.hoTen || user.ho_ten || userName
  const kioskCode = user.coSoMa || user.co_so_ma || 'KSK-011'
  const kioskName = user.coSoTen || user.co_so_ten || 'Kiosk Avengers'
  const token = session?.token || session?.accessToken

  // ─── THÔNG TIN KIOSK & GÓI NHƯỢNG QUYỀN ĐĂNG KÝ ───
  const [kioskInfo, setKioskInfo] = useState(null)
  useEffect(() => {
    fetch(`${API_BASE_URL}/franchise/kiosk/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((kiosks) => {
        const found = (Array.isArray(kiosks) ? kiosks : []).find((k) => k.ma_kiosk === kioskCode)
        if (found) {
          setKioskInfo(found)
        }
      })
      .catch(() => {})
  }, [kioskCode])

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
    setTimeout(() => setMsg(null), 4000)
  }

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

  // ─── TAB 1: POS STATES & HANDLERS ───
  const [rawMenuItems, setRawMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuCategory, setMenuCategory] = useState('')
  const [posViewMode, setPosViewMode] = useState('grid') // 'grid' | 'compact'
  const [posPage, setPosPage] = useState(1)
  const ITEMS_PER_PAGE = 12

  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('TIEN_MAT')
  const [cashGiven, setCashGiven] = useState('')
  const [posDiscount, setPosDiscount] = useState(0)
  const [posSubmitting, setPosSubmitting] = useState(false)
  const [lastReceipt, setLastReceipt] = useState(null)

  const loadMenu = useCallback(async () => {
    setMenuLoading(true)
    try {
      let rawItems = []
      try {
        const res = await apiFetch(`/menu/items`)
        rawItems = Array.isArray(res) ? res : res?.items || []
      } catch (e1) {
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
        } else if (item.danhMuc?.ten_danh_muc) {
          category = item.danhMuc.ten_danh_muc
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
    if (!Array.isArray(rawMenuItems)) return []
    return rawMenuItems.filter((item) => {
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
    })
  }, [rawMenuItems, currentPackageType])

  // Reset trang về 1 khi người dùng đổi từ khóa tìm kiếm hoặc đổi danh mục
  useEffect(() => {
    setPosPage(1)
  }, [menuSearch, menuCategory])

  // Danh sách sản phẩm sau khi tìm kiếm và chọn danh mục
  const filteredProducts = useMemo(() => {
    return packageAllowedMenu.filter((item) => {
      const matchSearch = !menuSearch || (item.ten_san_pham || '').toLowerCase().includes(menuSearch.toLowerCase())
      const matchCat = !menuCategory || item.danh_muc === menuCategory
      return matchSearch && matchCat
    })
  }, [packageAllowedMenu, menuSearch, menuCategory])

  // Phân trang sản phẩm để tránh cuộn chuột quá dài
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1
  const paginatedProducts = useMemo(() => {
    const start = (posPage - 1) * ITEMS_PER_PAGE
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredProducts, posPage])

  // Danh sách các danh mục có trong gói kèm số lượng món
  const categoryCounts = useMemo(() => {
    const map = new Map()
    packageAllowedMenu.forEach((item) => {
      const cat = item.danh_muc || 'Món khác'
      map.set(cat, (map.get(cat) || 0) + 1)
    })
    return map
  }, [packageAllowedMenu])

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
      } catch (err2) {
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
      window.alert('Hạn chót đăng ký ca làm cho tuần sau đã kết thúc (trước Chủ Nhật hàng tuần). Quản lý chi nhánh đang xét duyệt lịch.')
      return
    }
    if (requestForm.shift_date < nextWeekRange.nextMondayStr || requestForm.shift_date > nextWeekRange.nextSundayStr) {
      window.alert(`Chỉ được đăng ký ca làm việc cho tuần kế tiếp (${nextWeekRange.nextMondayFmt} – ${nextWeekRange.nextSundayFmt}).`)
      return
    }

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
      showToast('error', err.message)
    } finally {
      setRequestSubmitting(false)
    }
  }

  const handleDeleteMyRequest = async (requestId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy yêu cầu đăng ký ca làm việc này không?')) return
    try {
      await apiFetch(`/staff/work-shifts/requests/${requestId}?branch_code=${kioskCode}`, { method: 'DELETE' })
      showToast('success', 'Đã hủy yêu cầu đăng ký ca.')
      loadWorkShifts()
      loadMyShiftRequests()
    } catch (err) {
      showToast('error', err.message)
    }
  }

  const handleQuickSelectShift = (dateKey, shiftCode) => {
    if (nextWeekRange.isSunday) {
      window.alert('Cổng đăng ký ca cho tuần tới đã đóng vào 23:59 Thứ 7.')
      return
    }
    if (dateKey < nextWeekRange.nextMondayStr || dateKey > nextWeekRange.nextSundayStr) {
      window.alert(`Chỉ có thể đăng ký ca cho tuần kế tiếp (${nextWeekRange.nextMondayFmt} – ${nextWeekRange.nextSundayFmt}).`)
      return
    }
    setRequestForm((prev) => ({
      ...prev,
      shift_date: dateKey,
      shift_code: shiftCode,
    }))
    showToast('info', `Đã chọn ngày ${dateKey} - Ca ${shiftCode === 'SANG' ? 'Sáng' : shiftCode === 'CHIEU' ? 'Chiều' : 'Tối'}. Vui lòng nhấn "Gửi yêu cầu đăng ký ca".`)
  }

  // ─── TAB 3: KIOSK LIVE SHIFTS ───
  const [activeKioskShift, setActiveKioskShift] = useState(null)
  const [activeShiftLoading, setActiveShiftLoading] = useState(false)
  const [kioskShiftHistory, setKioskShiftHistory] = useState([])
  const [shiftHistoryLoading, setShiftHistoryLoading] = useState(false)
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [cashOpenInput, setCashOpenInput] = useState(500000)
  const [cashCloseInput, setCashCloseInput] = useState(0)
  const [shiftNote, setShiftNote] = useState('')
  const [kioskShiftSubmitting, setKioskShiftSubmitting] = useState(false)

  const loadActiveKioskShift = useCallback(async () => {
    setActiveShiftLoading(true)
    try {
      let res = null
      try {
        res = await apiFetch(`/staff/kiosk-shifts/active?branch_code=${kioskCode}`)
      } catch {
        res = await apiFetch(`/manager/kiosks/${kioskCode}/live-shift`).catch(() => null)
      }
      setActiveKioskShift(res)
    } catch (e) {
      console.error(e)
    } finally {
      setActiveShiftLoading(false)
    }
  }, [apiFetch, kioskCode])

  const loadKioskShiftHistory = useCallback(async () => {
    setShiftHistoryLoading(true)
    try {
      let res = null
      try {
        res = await apiFetch(`/staff/kiosk-shifts/history?branch_code=${kioskCode}&limit=20`)
      } catch {
        res = await apiFetch(`/manager/kiosks/${kioskCode}/shift-history`).catch(() => [])
      }
      setKioskShiftHistory(Array.isArray(res) ? res : res?.items || [])
    } catch (e) {
      console.error(e)
      setKioskShiftHistory([])
    } finally {
      setShiftHistoryLoading(false)
    }
  }, [apiFetch, kioskCode])

  const handleOpenKioskShift = async (e) => {
    e.preventDefault()
    setKioskShiftSubmitting(true)
    try {
      try {
        await apiFetch('/staff/kiosk-shifts/open', {
          method: 'POST',
          body: JSON.stringify({
            branch_code: kioskCode,
            staff_username: userName,
            staff_name: userFullName,
            cash_open: Number(cashOpenInput) || 0,
            note: shiftNote,
          })
        })
      } catch {
        await apiFetch(`/manager/kiosks/${kioskCode}/open-shift`, {
          method: 'POST',
          body: JSON.stringify({
            staff_username: userName,
            staff_name: userFullName,
            cash_open: Number(cashOpenInput) || 0,
            note: shiftNote,
          })
        })
      }
      showToast('success', 'Mở ca làm việc tại Kiosk thành công!')
      setShowOpenShiftModal(false)
      loadActiveKioskShift()
      loadKioskShiftHistory()
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setKioskShiftSubmitting(false)
    }
  }

  const handleCloseKioskShift = async (e) => {
    e.preventDefault()
    setKioskShiftSubmitting(true)
    try {
      try {
        await apiFetch('/staff/kiosk-shifts/close', {
          method: 'POST',
          body: JSON.stringify({
            branch_code: kioskCode,
            cash_close: Number(cashCloseInput) || 0,
            note: shiftNote,
            staff_username: userName,
          })
        })
      } catch {
        await apiFetch(`/manager/kiosks/${kioskCode}/close-shift`, {
          method: 'POST',
          body: JSON.stringify({
            cash_close: Number(cashCloseInput) || 0,
            note: shiftNote,
          })
        })
      }
      showToast('success', 'Chốt ca làm việc và kiểm kê tiền mặt thành công!')
      setShowCloseShiftModal(false)
      loadActiveKioskShift()
      loadKioskShiftHistory()
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setKioskShiftSubmitting(false)
    }
  }

  // ─── TAB 4: ACCOUNT / CHANGE PASSWORD ───
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('error', 'Mật khẩu xác nhận không khớp!')
      return
    }
    setChangingPassword(true)
    try {
      await apiFetch('/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      })
      showToast('success', 'Đổi mật khẩu thành công!')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setChangingPassword(false)
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
  const cartSubtotal = useMemo(() => cart.reduce((acc, item) => acc + item.gia_ban * item.qty, 0), [cart])
  const cartTotal = useMemo(() => Math.max(0, cartSubtotal - posDiscount), [cartSubtotal, posDiscount])
  const cartChange = useMemo(() => {
    if (paymentMethod !== 'TIEN_MAT' || !cashGiven) return 0
    return Math.max(0, Number(cashGiven) - cartTotal)
  }, [paymentMethod, cashGiven, cartTotal])

  const addToCart = (product) => {
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
      window.alert('Kiosk chưa mở ca làm việc. Vui lòng mở ca trước khi thanh toán đơn hàng!')
      return
    }
    if (paymentMethod === 'TIEN_MAT' && Number(cashGiven || 0) < cartTotal) {
      window.alert('Số tiền khách đưa không đủ để thanh toán!')
      return
    }

    setPosSubmitting(true)
    try {
      const mappedPayment =
        paymentMethod === 'TIEN_MAT'
          ? 'THANH_TOAN_KHI_NHAN_HANG'
          : paymentMethod === 'NGAN_HANG_QR'
          ? 'NGAN_HANG_QR'
          : 'THANH_TOAN_KHI_NHAN_HANG'

      const payload = {
        branch_code: kioskCode,
        ten_thu_ngan: userName,
        loai_don_hang: 'TAI_CHO',
        phuong_thuc_thanh_toan: mappedPayment,
        tien_khach_dua: paymentMethod === 'TIEN_MAT' ? Number(cashGiven) || cartTotal : cartTotal,
        items: cart.map((i) => ({
          ma_san_pham: i.ma_san_pham,
          ten_san_pham: i.ten_san_pham,
          gia_ban: i.gia_ban,
          so_luong: i.qty,
        })),
      }

      let res = null
      try {
        res = await apiFetch('/staff/orders', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      } catch (err1) {
        res = await apiFetch('/orders/pos', {
          method: 'POST',
          body: JSON.stringify({ ...payload, chi_nhanh_ma: kioskCode, tong_tien: cartTotal }),
        })
      }

      showToast('success', 'Đã tạo đơn hàng POS thành công!')
      setLastReceipt({ ...payload, ma_don_hang: res?.order?.ma_don_hang || res?.ma_don_hang || `POS-${Date.now().toString().slice(-6)}`, created_at: new Date() })
      setCart([])
      setCashGiven('')
      setPosDiscount(0)
    } catch (err) {
      showToast('error', err.message)
    } finally {
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      
      {/* ─── TOAST NOTIFICATION ─── */}
      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          padding: '12px 18px', borderRadius: 12,
          background: msg.type === 'error' ? '#ef4444' : msg.type === 'info' ? '#2563eb' : '#059669',
          color: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700
        }}>
          {msg.type === 'error' ? <XCircle size={18} /> : msg.type === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff',
            boxShadow: '0 4px 10px rgba(16,185,129,0.25)'
          }}>
            <Coffee size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Avengers Coffee</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0'
              }}>
                Nhân viên Kiosk
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Store size={13} color="#10b981" />
              <span>{kioskName} ({kioskCode})</span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span style={{ color: packageMeta.color, fontWeight: 700 }}>{packageMeta.name}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{userFullName}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>@{userName}</div>
          </div>

          <button
            onClick={onLogout}
            style={{
              padding: '8px 14px', background: '#fef2f2', border: '1px solid #fee2e2',
              color: '#dc2626', borderRadius: 10, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fef2f2'}
          >
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </header>

      {/* ─── NAVIGATION TABS VỚI HIỆU ỨNG SELECTED RÕ RÀNG ─── */}
      <div style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '6px 24px',
        display: 'flex', gap: 10, overflowX: 'auto'
      }}>
        {[
          { id: 'pos', label: 'Bán hàng POS Kiosk', icon: Monitor },
          { id: 'shift_schedule', label: 'Lịch làm & Đăng ký ca', icon: Calendar },
          { id: 'kiosk_shifts', label: 'Mở / Chốt ca Kiosk', icon: Clock },
          { id: 'account', label: 'Tài khoản cá nhân', icon: User },
        ].map((t) => {
          const Icon = t.icon
          const isSelected = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 16px',
                borderRadius: 12,
                border: isSelected ? '1px solid #10b981' : '1px solid transparent',
                background: isSelected ? '#ecfdf5' : 'transparent',
                color: isSelected ? '#047857' : '#64748b',
                fontWeight: isSelected ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all .2s ease',
                boxShadow: isSelected ? '0 2px 8px rgba(16,185,129,0.15)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = '#f1f5f9'
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon size={16} color={isSelected ? '#059669' : '#94a3b8'} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main style={{ flex: 1, padding: 20, maxWidth: 1440, width: '100%', margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden' }}>
        
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 1: POS BÁN HÀNG TẠI KIOSK - CỐ ĐỊNH CHIỀU CAO KHÔNG CUỘN TRANG */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'pos' && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 390px', gap: 20,
            alignItems: 'start', width: '100%', height: 'calc(100vh - 150px)', minHeight: 640
          }}>
            {/* Left: Menu & Product Select với Header cố định và vùng cuộn riêng */}
            <div style={{
              background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
              padding: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', minWidth: 0,
              width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex',
              flexDirection: 'column', overflow: 'hidden'
            }}>
              {/* Header cố định: Thông tin gói nhượng quyền & Chế độ xem */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 8, background: packageMeta.bg,
                    color: packageMeta.color, border: `1px solid ${packageMeta.border}`,
                    fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <Package size={14} />
                    <span>{packageMeta.name}</span>
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Áp dụng: <b>{packageAllowedMenu.length}</b> món theo gói
                  </span>
                </div>

                {/* Nút chuyển chế độ xem: Lưới ảnh hoặc Danh sách gọn */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
                  <button
                    onClick={() => setPosViewMode('grid')}
                    title="Dạng lưới hình ảnh"
                    style={{
                      padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: posViewMode === 'grid' ? '#ffffff' : 'transparent',
                      color: posViewMode === 'grid' ? '#059669' : '#64748b',
                      fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                      boxShadow: posViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <LayoutGrid size={14} /> Lưới
                  </button>
                  <button
                    onClick={() => setPosViewMode('compact')}
                    title="Dạng danh sách gọn - xem nhiều món cùng lúc"
                    style={{
                      padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: posViewMode === 'compact' ? '#ffffff' : 'transparent',
                      color: posViewMode === 'compact' ? '#059669' : '#64748b',
                      fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                      boxShadow: posViewMode === 'compact' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <List size={14} /> Gọn
                  </button>
                </div>
              </div>

              {/* Ô tìm kiếm nhanh */}
              <div style={{ position: 'relative', width: '100%', marginBottom: 10 }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Tìm kiếm nhanh tên món cafe, trà, bánh..."
                  style={{
                    width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10,
                    border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color .15s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#10b981'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
                {menuSearch && (
                  <button
                    onClick={() => setMenuSearch('')}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Thanh lọc danh mục với số lượng món */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', width: '100%', maxWidth: '100%', paddingBottom: 6, marginBottom: 10, scrollbarWidth: 'thin' }}>
                <button
                  onClick={() => setMenuCategory('')}
                  style={{
                    padding: '6px 14px', borderRadius: 99,
                    border: !menuCategory ? '1px solid #059669' : '1px solid #e2e8f0',
                    background: !menuCategory ? '#059669' : '#ffffff',
                    color: !menuCategory ? '#ffffff' : '#475569',
                    fontWeight: !menuCategory ? 800 : 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    boxShadow: !menuCategory ? '0 2px 6px rgba(5,150,105,0.25)' : 'none',
                    transition: 'all .15s ease', flexShrink: 0
                  }}
                >
                  Tất cả ({packageAllowedMenu.length})
                </button>
                {Array.from(categoryCounts.entries()).map(([cat, count]) => {
                  const isCatActive = menuCategory === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => setMenuCategory(cat)}
                      style={{
                        padding: '6px 14px', borderRadius: 99,
                        border: isCatActive ? '1px solid #059669' : '1px solid #e2e8f0',
                        background: isCatActive ? '#059669' : '#ffffff',
                        color: isCatActive ? '#ffffff' : '#475569',
                        fontWeight: isCatActive ? 800 : 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                        boxShadow: isCatActive ? '0 2px 6px rgba(5,150,105,0.25)' : 'none',
                        transition: 'all .15s ease', flexShrink: 0
                      }}
                    >
                      {cat} ({count})
                    </button>
                  )
                })}
              </div>

              {/* Vùng hiển thị sản phẩm có cuộn chuột riêng biệt */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
                {menuLoading ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px', color: '#059669' }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Đang kiểm tra thực đơn gói {packageMeta.short}...</div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b', background: '#f8fafc', borderRadius: 12 }}>
                    <Coffee size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Không tìm thấy sản phẩm phù hợp</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      {menuSearch ? 'Thử tìm với từ khóa khác' : 'Chưa có món trong danh mục này'}
                    </div>
                  </div>
                ) : posViewMode === 'grid' ? (
                  /* Dạng Lưới Thẻ Ảnh (Grid) */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, boxSizing: 'border-box' }}>
                    {paginatedProducts.map((item) => (
                      <div
                        key={item.ma_san_pham}
                        onClick={() => addToCart(item)}
                        style={{
                          background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0',
                          padding: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                          justifyContent: 'space-between', minHeight: 165, transition: 'all .15s ease',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#10b981'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(16,185,129,0.12)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)'
                        }}
                      >
                        {/* Ảnh món */}
                        <div style={{ width: '100%', height: 80, borderRadius: 8, background: '#f8fafc', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {item.hinh_anh_url ? (
                            <img
                              src={item.hinh_anh_url}
                              alt={item.ten_san_pham}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextSibling.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div style={{ display: item.hinh_anh_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#94a3b8' }}>
                            <Coffee size={24} />
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a', marginBottom: 3, lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.ten_san_pham}
                          </div>
                          <span style={{ fontSize: 9, color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                            {item.danh_muc}
                          </span>
                        </div>

                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 900, fontSize: 13, color: '#059669' }}>
                            {fmtMoney(item.gia_ban)}
                          </span>
                          <span style={{
                            width: 24, height: 24, borderRadius: 6, background: '#ecfdf5',
                            color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 900
                          }}>
                            +
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Dạng Danh Sách Gọn (Compact Rows) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {paginatedProducts.map((item) => (
                      <div
                        key={item.ma_san_pham}
                        onClick={() => addToCart(item)}
                        style={{
                          background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0',
                          padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', transition: 'all .15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#10b981'
                          e.currentTarget.style.background = '#f0fdf4'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.background = '#ffffff'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {item.hinh_anh_url ? (
                              <img src={item.hinh_anh_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                            ) : (
                              <Coffee size={16} color="#94a3b8" />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.ten_san_pham}
                            </div>
                            <span style={{ fontSize: 10, color: '#64748b' }}>{item.danh_muc}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontWeight: 900, fontSize: 13, color: '#059669' }}>
                            {fmtMoney(item.gia_ban)}
                          </span>
                          <button
                            type="button"
                            style={{
                              padding: '4px 10px', borderRadius: 6, background: '#ecfdf5',
                              color: '#059669', border: '1px solid #a7f3d0', fontWeight: 800,
                              fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2
                            }}
                          >
                            <Plus size={12} /> Thêm
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer cố định: Thanh phân trang thông minh */}
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
              }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Hiển thị <b>{(posPage - 1) * ITEMS_PER_PAGE + 1}</b> – <b>{Math.min(posPage * ITEMS_PER_PAGE, filteredProducts.length)}</b> trong <b>{filteredProducts.length}</b> món
                </span>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      disabled={posPage <= 1}
                      onClick={() => setPosPage((p) => Math.max(1, p - 1))}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                        background: posPage <= 1 ? '#f8fafc' : '#ffffff',
                        color: posPage <= 1 ? '#cbd5e1' : '#334155',
                        cursor: posPage <= 1 ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700
                      }}
                    >
                      Trước
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - posPage) <= 1)
                      .map((p, idx, arr) => (
                        <React.Fragment key={p}>
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ fontSize: 11, color: '#94a3b8' }}>...</span>}
                          <button
                            onClick={() => setPosPage(p)}
                            style={{
                              width: 26, height: 26, borderRadius: 6,
                              border: posPage === p ? '1px solid #059669' : '1px solid #e2e8f0',
                              background: posPage === p ? '#059669' : '#ffffff',
                              color: posPage === p ? '#ffffff' : '#334155',
                              fontWeight: posPage === p ? 800 : 600, fontSize: 11, cursor: 'pointer'
                            }}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      ))}

                    <button
                      disabled={posPage >= totalPages}
                      onClick={() => setPosPage((p) => Math.min(totalPages, p + 1))}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                        background: posPage >= totalPages ? '#f8fafc' : '#ffffff',
                        color: posPage >= totalPages ? '#cbd5e1' : '#334155',
                        cursor: posPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700
                      }}
                    >
                      Sau
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Cart & Order Summary cố định chiều cao */}
            <div style={{
              background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
              padding: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.03)', minWidth: 0,
              boxSizing: 'border-box', height: '100%', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Receipt size={17} color="#059669" /> Đơn hàng tại quầy Kiosk
                </h3>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    style={{ background: '#fee2e2', border: 'none', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>

              {/* Cart Item List với cuộn chuột riêng */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                    <ShoppingBag size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Chưa có món nào được chọn</div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>Nhấn vào món bên trái để thêm vào đơn</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cart.map((item) => (
                      <div key={item.ma_san_pham} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {item.ten_san_pham}
                          </div>
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 800 }}>{fmtMoney(item.gia_ban)}</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <button
                            onClick={() => updateCartQty(item.ma_san_pham, -1)}
                            style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Minus size={11} />
                          </button>
                          <span style={{ fontSize: 12, fontWeight: 800, width: 20, textAlign: 'center' }}>{item.qty}</span>
                          <button
                            onClick={() => updateCartQty(item.ma_san_pham, 1)}
                            style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Plus size={11} />
                          </button>
                          <button
                            onClick={() => removeCartItem(item.ma_san_pham)}
                            title="Xóa món"
                            style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Calculation Breakdown */}
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                  <span>Tạm tính ({cart.reduce((a, c) => a + c.qty, 0)} món):</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtMoney(cartSubtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 900, color: '#059669', paddingTop: 6, borderTop: '1px dashed #cbd5e1' }}>
                  <span>Tổng thanh toán:</span>
                  <span>{fmtMoney(cartTotal)}</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Phương thức thanh toán
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { id: 'TIEN_MAT', label: 'Tiền mặt' },
                    { id: 'NGAN_HANG_QR', label: 'QR Pay' },
                    { id: 'THE', label: 'Thẻ' },
                  ].map((m) => {
                    const isSelected = paymentMethod === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id)}
                        style={{
                          padding: '7px 4px', borderRadius: 8,
                          border: isSelected ? '1.5px solid #059669' : '1px solid #cbd5e1',
                          background: isSelected ? '#ecfdf5' : '#fff',
                          color: isSelected ? '#047857' : '#475569',
                          fontWeight: isSelected ? 800 : 600, fontSize: 11, cursor: 'pointer',
                          boxShadow: isSelected ? '0 2px 5px rgba(16,185,129,0.15)' : 'none',
                          transition: 'all .15s ease'
                        }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cash Given & Change */}
              {paymentMethod === 'TIEN_MAT' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Tiền khách đưa
                  </label>
                  <input
                    type="number"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    placeholder="Nhập số tiền..."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {Number(cashGiven) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, fontWeight: 700, color: '#047857' }}>
                      <span>Tiền thối lại:</span>
                      <span>{fmtMoney(cartChange)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Checkout CTA Button */}
              <button
                onClick={handleCheckoutPos}
                disabled={cart.length === 0 || posSubmitting}
                style={{
                  width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                  background: cart.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', fontSize: 13, fontWeight: 800, cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: cart.length === 0 ? 'none' : '0 4px 12px rgba(16,185,129,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all .2s ease'
                }}
              >
                {posSubmitting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    <span>Hoàn tất &amp; Thanh toán ({fmtMoney(cartTotal)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 2: LỊCH LÀM VIỆC & ĐĂNG KÝ CA KIOSK */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'shift_schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
            
            {/* Form Đăng ký nguyện vọng ca làm việc */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlusCircle size={22} color="#059669" /> Đăng ký nguyện vọng ca làm việc Kiosk
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                    Yêu cầu đăng ký ca sẽ được chuyển trực tiếp tới <b>Quản lý nhượng quyền</b> của Kiosk ({kioskName}) để xét duyệt chính thức.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '6px 14px', borderRadius: 99, background: '#ecfdf5',
                    color: '#047857', border: '1px solid #a7f3d0', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <CalendarDays size={14} />
                    <span>Tuần kế tiếp: {nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}</span>
                  </span>
                </div>
              </div>

              {/* Sunday Warning Alert */}
              {nextWeekRange.isSunday ? (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 18
                }}>
                  <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: 'block', color: '#b45309', marginBottom: 2 }}>Cổng đăng ký ca tuần tới đã đóng</strong>
                    Thời hạn đăng ký ca kết thúc trước Chủ Nhật hàng tuần (hạn chót 23:59 Thứ 7). Quản lý đang tiến hành xét duyệt lịch làm việc chính thức.
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
                  padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                  color: '#166534', fontSize: 12, fontWeight: 600, marginBottom: 18
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color="#15803d" style={{ flexShrink: 0 }} />
                    <span>Chỉ nhận đăng ký ca cho <b>tuần kế tiếp</b> ({nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}). Hạn chót gửi yêu cầu trước Chủ Nhật (23:59 Thứ 7).</span>
                  </div>
                  {weekOffset !== 1 && (
                    <button
                      onClick={() => setWeekOffset(1)}
                      style={{
                        padding: '5px 12px', background: '#059669', color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <span>Xem lịch tuần kế tiếp</span> <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleCreateShiftRequest} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                
                {/* 1. Chọn ngày làm việc với các nút chọn nhanh */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>
                      1. Chọn ngày làm việc trong tuần tới *
                    </label>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Phạm vi hợp lệ: {nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}
                    </span>
                  </div>

                  {/* Nút chọn nhanh 7 ngày tuần tới */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
                    {nextWeekRange.nextDays.map((d) => {
                      const isSelected = requestForm.shift_date === d.dateKey
                      return (
                        <button
                          key={d.dateKey}
                          type="button"
                          disabled={nextWeekRange.isSunday}
                          onClick={() => setRequestForm((f) => ({ ...f, shift_date: d.dateKey }))}
                          style={{
                            padding: '8px 4px', borderRadius: 10, textAlign: 'center',
                            border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                            background: isSelected ? '#ecfdf5' : '#ffffff',
                            color: isSelected ? '#047857' : '#334155',
                            cursor: nextWeekRange.isSunday ? 'not-allowed' : 'pointer',
                            transition: 'all .15s ease',
                            boxShadow: isSelected ? '0 2px 8px rgba(16,185,129,0.2)' : 'none'
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: isSelected ? 800 : 600 }}>{d.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2 }}>{d.display}</div>
                        </button>
                      )
                    })}
                  </div>

                  <input
                    type="date"
                    value={requestForm.shift_date}
                    min={nextWeekRange.nextMondayStr}
                    max={nextWeekRange.nextSundayStr}
                    disabled={nextWeekRange.isSunday}
                    onChange={(e) => setRequestForm((f) => ({ ...f, shift_date: e.target.value }))}
                    required
                    style={{
                      width: '100%', maxWidth: 260, padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 13, outline: 'none', background: nextWeekRange.isSunday ? '#f1f5f9' : '#fff', boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 2. Chọn Khung ca làm việc dạng Cards trực quan - Dùng radio dot không dùng icon checkmark */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 8 }}>
                    2. Chọn khung ca làm việc *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {SHIFT_TEMPLATES.map((tmpl) => {
                      const Icon = tmpl.icon
                      const isSelected = requestForm.shift_code === tmpl.id
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => {
                            if (!nextWeekRange.isSunday) {
                              setRequestForm((f) => ({ ...f, shift_code: tmpl.id }))
                            }
                          }}
                          style={{
                            padding: 14, borderRadius: 12, cursor: nextWeekRange.isSunday ? 'not-allowed' : 'pointer',
                            border: isSelected ? `2px solid ${tmpl.accent}` : '1px solid #e2e8f0',
                            background: isSelected ? tmpl.bg : '#ffffff',
                            boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all .15s ease', display: 'flex', alignItems: 'center', gap: 12
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, background: tmpl.badgeBg,
                            color: tmpl.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            <Icon size={18} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: isSelected ? tmpl.text : '#0f172a' }}>
                              {tmpl.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{tmpl.time}</div>
                          </div>
                          
                          {/* Radio pill trạng thái chọn - không dùng icon dấu tích */}
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            border: isSelected ? `5px solid ${tmpl.accent}` : '2px solid #cbd5e1',
                            background: '#ffffff', transition: 'all .15s ease', flexShrink: 0
                          }} />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Ghi chú */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 6 }}>
                    3. Ghi chú cho Quản lý Kiosk (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={requestForm.note}
                    disabled={nextWeekRange.isSunday}
                    onChange={(e) => setRequestForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Ví dụ: Đăng ký làm thêm ca, xin ưu tiên trực máy pha chính..."
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 13, outline: 'none', background: nextWeekRange.isSunday ? '#f1f5f9' : '#fff', boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Submit Action - Nút xanh lá nổi bật theo chuẩn UX */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                  <button
                    type="submit"
                    disabled={requestSubmitting || nextWeekRange.isSunday}
                    style={{
                      padding: '12px 28px', borderRadius: 12, border: 'none',
                      background: nextWeekRange.isSunday ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff', fontSize: 14, fontWeight: 800,
                      cursor: nextWeekRange.isSunday || requestSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: nextWeekRange.isSunday ? 'none' : '0 4px 14px rgba(16,185,129,0.3)',
                      transition: 'all .2s ease'
                    }}
                  >
                    <Send size={16} />
                    <span>{requestSubmitting ? 'Đang gửi đăng ký...' : 'Gửi yêu cầu đăng ký ca'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Bảng Lịch Tuần Kiosk - Hiển thị ca của mình & đồng nghiệp */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={20} color="#059669" /> Lịch phân ca làm việc tại Kiosk
                  </h3>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    Thời gian: <b>{currentWeekDays[0].dateKey}</b> đến <b>{currentWeekDays[6].dateKey}</b>
                  </div>
                </div>

                {/* Nút lọc tuần với Selected Style rõ nét */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setWeekOffset((p) => p - 1)}
                    style={{
                      padding: '8px 14px', background: '#ffffff', border: '1px solid #cbd5e1',
                      borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: '#334155', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <ChevronLeft size={14} /> Tuần trước
                  </button>

                  <button
                    onClick={() => setWeekOffset(0)}
                    style={{
                      padding: '8px 16px',
                      background: weekOffset === 0 ? '#059669' : '#ffffff',
                      color: weekOffset === 0 ? '#ffffff' : '#334155',
                      border: weekOffset === 0 ? '1px solid #059669' : '1px solid #cbd5e1',
                      borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                      boxShadow: weekOffset === 0 ? '0 2px 8px rgba(5,150,105,0.25)' : 'none',
                      transition: 'all .15s ease'
                    }}
                  >
                    Tuần này
                  </button>

                  <button
                    onClick={() => setWeekOffset(1)}
                    style={{
                      padding: '8px 16px',
                      background: weekOffset === 1 ? '#059669' : '#ffffff',
                      color: weekOffset === 1 ? '#ffffff' : '#334155',
                      border: weekOffset === 1 ? '1px solid #059669' : '1px solid #cbd5e1',
                      borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                      boxShadow: weekOffset === 1 ? '0 2px 8px rgba(5,150,105,0.25)' : 'none',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'all .15s ease'
                    }}
                  >
                    <Sparkles size={14} color={weekOffset === 1 ? '#ffffff' : '#059669'} />
                    <span>Tuần kế tiếp (Đang nhận ca)</span>
                  </button>

                  <button
                    onClick={() => setWeekOffset((p) => p + 1)}
                    style={{
                      padding: '8px 14px', background: '#ffffff', border: '1px solid #cbd5e1',
                      borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: '#334155', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    Tuần sau <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Grid 7 Cột Lịch tuần - Không bị tràn ngang màn hình */}
              {workShiftsLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#059669' }} />
                  <div>Đang tải lịch phân ca Kiosk...</div>
                </div>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto', paddingBottom: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: 10, width: '100%' }}>
                    {currentWeekDays.map((day) => {
                      const dayShifts = combinedShifts.filter((s) => s.ngay_lam_viec === day.dateKey && s.trang_thai_yeu_cau !== 'REJECTED')
                      return (
                        <div key={day.dateKey} style={{
                          background: '#ffffff', borderRadius: 14,
                          border: day.isToday ? '2px solid #059669' : '1px solid #e2e8f0',
                          overflow: 'hidden', minHeight: 380, display: 'flex', flexDirection: 'column',
                          boxShadow: day.isToday ? '0 4px 12px rgba(5,150,105,0.1)' : '0 2px 6px rgba(0,0,0,0.02)'
                        }}>
                          {/* Header Ngày */}
                          <div style={{
                            padding: '10px 6px', textAlign: 'center',
                            background: day.isToday ? '#059669' : '#f8fafc',
                            color: day.isToday ? '#ffffff' : '#0f172a',
                            borderBottom: '1px solid #e2e8f0'
                          }}>
                            <div style={{ fontWeight: 800, fontSize: 13 }}>{day.label}</div>
                            <div style={{ fontSize: 11, opacity: day.isToday ? 0.9 : 0.7, marginTop: 2 }}>
                              {day.date.getDate()}/{day.date.getMonth() + 1}
                            </div>
                            {day.isToday && (
                              <span style={{ display: 'inline-block', fontSize: 10, background: '#ffffff', color: '#059669', padding: '1px 6px', borderRadius: 99, fontWeight: 900, marginTop: 4 }}>
                                Hôm nay
                              </span>
                            )}
                          </div>

                          {/* 3 Khung ca trong ngày */}
                          <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {SHIFT_TEMPLATES.map((tmpl) => {
                              const matching = dayShifts.filter((s) => s.ma_khung_ca === tmpl.id)
                              const hasMyShift = matching.some((s) => s.staff_username === userName)
                              const Icon = tmpl.icon

                              return (
                                <div key={tmpl.id} style={{
                                  background: tmpl.bg, borderRadius: 10, padding: 8,
                                  border: hasMyShift ? '1.5px solid #059669' : `1px solid ${tmpl.border}`,
                                  display: 'flex', flexDirection: 'column', gap: 6
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: tmpl.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Icon size={12} /> {tmpl.name}
                                    </span>
                                    <span style={{ fontSize: 9, color: tmpl.text, opacity: 0.8, fontWeight: 600 }}>
                                      {tmpl.start} - {tmpl.end}
                                    </span>
                                  </div>

                                  {matching.length === 0 ? (
                                    <div style={{ padding: '6px 2px', textAlign: 'center' }}>
                                      <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 4 }}>
                                        Chưa có người trực
                                      </div>
                                      {!nextWeekRange.isSunday && day.dateKey >= nextWeekRange.nextMondayStr && day.dateKey <= nextWeekRange.nextSundayStr && (
                                        <button
                                          type="button"
                                          onClick={() => handleQuickSelectShift(day.dateKey, tmpl.id)}
                                          style={{
                                            padding: '4px 8px', background: '#ffffff', border: `1px solid ${tmpl.border}`,
                                            borderRadius: 6, fontSize: 10, fontWeight: 800, color: tmpl.text,
                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3
                                          }}
                                        >
                                          <Plus size={10} /> Đăng ký ca
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    matching.map((s) => {
                                      const isMe = s.staff_username === userName
                                      const isPending = s.trang_thai_yeu_cau === 'PENDING'
                                      const isApproved = s.trang_thai_yeu_cau === 'APPROVED'

                                      return (
                                        <div
                                          key={s.ma_ca_lam_viec || `${s.staff_username}-${s.ngay_lam_viec}-${s.ma_khung_ca}`}
                                          style={{
                                            background: '#ffffff', borderRadius: 8, padding: '6px 8px',
                                            border: isMe ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                                            boxShadow: isMe ? '0 2px 6px rgba(16,185,129,0.15)' : '0 1px 3px rgba(0,0,0,0.02)',
                                            fontSize: 11
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                            <span style={{ fontWeight: 800, color: isMe ? '#059669' : '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                              {isMe ? <UserCheck size={12} color="#059669" /> : <User size={12} color="#64748b" />}
                                              {s.staff_name || s.staff_username} {isMe && '(Tôi)'}
                                            </span>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {isPending && (
                                              <span style={{
                                                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                                                background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                                                display: 'inline-flex', alignItems: 'center', gap: 4
                                              }}>
                                                <Clock size={11} color="#b45309" /> Chờ duyệt
                                              </span>
                                            )}
                                            {isApproved && (
                                              <span style={{
                                                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                                                background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0',
                                                display: 'inline-flex', alignItems: 'center', gap: 4
                                              }}>
                                                <ShieldCheck size={11} color="#15803d" /> Đã duyệt
                                              </span>
                                            )}
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

            {/* Danh sách lịch sử yêu cầu ca của cá nhân */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={18} color="#059669" /> Lịch sử đăng ký ca làm việc của tôi tại Kiosk
                </h3>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  Tổng cộng: <b>{myShiftRequests.length}</b> ca đã đăng ký
                </span>
              </div>

              {myShiftRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 12 }}>
                  <Calendar size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div>Bạn chưa có lịch ca hoặc yêu cầu đăng ký ca nào.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myShiftRequests.slice(0, 15).map((req) => {
                    const isPending = req.trang_thai_yeu_cau === 'PENDING'
                    const isApproved = req.trang_thai_yeu_cau === 'APPROVED' || !req.trang_thai_yeu_cau
                    const isRejected = req.trang_thai_yeu_cau === 'REJECTED'

                    const shiftTmpl = SHIFT_TEMPLATES.find((t) => t.id === req.ma_khung_ca) || SHIFT_TEMPLATES[0]
                    const Icon = shiftTmpl.icon

                    return (
                      <div
                        key={req.ma_ca_lam_viec || `${req.ngay_lam_viec}-${req.ma_khung_ca}`}
                        style={{
                          background: '#f8fafc', borderRadius: 12, padding: '12px 16px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                          border: '1px solid #e2e8f0', transition: 'all .15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: 10, background: shiftTmpl.badgeBg,
                            color: shiftTmpl.text, display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Icon size={18} />
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                                {req.ngay_lam_viec}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', color: shiftTmpl.text }}>
                                {req.ten_ca || shiftTmpl.name} ({req.gio_bat_dau || shiftTmpl.start} - {req.gio_ket_thuc || shiftTmpl.end})
                              </span>
                            </div>
                            {req.note && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                                "{req.note}"
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {isPending && (
                            <>
                              <span style={{
                                padding: '4px 12px', borderRadius: 99, background: '#fef3c7', color: '#b45309',
                                border: '1px solid #fde68a', fontSize: 12, fontWeight: 800,
                                display: 'inline-flex', alignItems: 'center', gap: 5
                              }}>
                                <Clock size={13} color="#b45309" /> Chờ Quản lý duyệt
                              </span>
                              <button
                                onClick={() => handleDeleteMyRequest(req.ma_ca_lam_viec)}
                                style={{
                                  padding: '6px 12px', background: '#ef4444', color: '#ffffff',
                                  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                  display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(239,68,68,0.25)'
                                }}
                              >
                                <Trash2 size={13} /> Hủy yêu cầu
                              </button>
                            </>
                          )}
                          {isApproved && (
                            <span style={{
                              padding: '4px 12px', borderRadius: 99, background: '#dcfce7', color: '#15803d',
                              border: '1px solid #bbf7d0', fontSize: 12, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 5
                            }}>
                              <ShieldCheck size={13} color="#15803d" /> Đã duyệt chính thức
                            </span>
                          )}
                          {isRejected && (
                            <span style={{
                              padding: '4px 12px', borderRadius: 99, background: '#fef2f2', color: '#dc2626',
                              border: '1px solid #fecaca', fontSize: 12, fontWeight: 800,
                              display: 'inline-flex', alignItems: 'center', gap: 5
                            }}>
                              <AlertTriangle size={13} color="#dc2626" /> Từ chối {req.ghi_chu_duyet && `(${req.ghi_chu_duyet})`}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 3: MỞ / CHỐT CA KIOSK - FULL WIDTH DASHBOARD */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'kiosk_shifts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)', gap: 24, width: '100%', alignItems: 'start', boxSizing: 'border-box' }}>
            {/* Cột trái: Trạng thái ca trực hiện tại & Thao tác mở/chốt ca */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={20} color="#059669" /> Trạng thái ca làm việc hiện tại
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    Chi nhánh: <b style={{ color: '#0f172a' }}>{kioskName} ({kioskCode})</b>
                  </span>
                </div>

                {activeShiftLoading ? (
                  <div style={{ textAlign: 'center', padding: '50px 0', color: '#64748b' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#059669' }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Đang kiểm tra dữ liệu ca Kiosk...</div>
                  </div>
                ) : activeKioskShift?.has_open_shift ? (
                  <div>
                    <div style={{
                      background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14,
                      padding: 20, marginBottom: 20
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{
                          padding: '5px 12px', borderRadius: 99, background: '#059669', color: '#fff',
                          fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6,
                          boxShadow: '0 2px 6px rgba(5,150,105,0.25)'
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
                          Đang mở ca bán hàng
                        </span>
                        <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                          Mở lúc: {new Date(activeKioskShift.active_shift?.thoi_gian_mo || activeKioskShift.active_shift?.thoi_gian_mo_ca).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>

                      {/* 4 Ô thống kê trực tiếp trong ca */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: '#ffffff', padding: 14, borderRadius: 12, border: '1px solid #d1fae5' }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Tiền mặt trong két đầu ca:</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                            {fmtMoney(activeKioskShift.active_shift?.tien_dau_ca)}
                          </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: 14, borderRadius: 12, border: '1px solid #d1fae5' }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Nhân viên mở ca:</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                            {activeKioskShift.active_shift?.staff_name || activeKioskShift.active_shift?.staff_username || userFullName}
                          </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: 14, borderRadius: 12, border: '1px solid #d1fae5' }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Doanh thu trong ca:</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#059669', marginTop: 4 }}>
                            {fmtMoney(activeKioskShift.live_stats?.total_revenue || 0)}
                          </div>
                        </div>

                        <div style={{ background: '#ffffff', padding: 14, borderRadius: 12, border: '1px solid #d1fae5' }}>
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Số đơn hoàn thành:</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                            {activeKioskShift.live_stats?.total_orders || 0} đơn
                          </div>
                        </div>
                      </div>

                      {activeKioskShift.live_stats?.expected_cash ? (
                        <div style={{
                          background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: 10,
                          padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                            Tiền mặt kỳ vọng trong két hiện tại:
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 900, color: '#15803d' }}>
                            {fmtMoney(activeKioskShift.live_stats.expected_cash)}
                          </span>
                        </div>
                      ) : null}

                      <button
                        onClick={() => setShowCloseShiftModal(true)}
                        style={{
                          width: '100%', padding: '12px 20px', borderRadius: 12, border: 'none',
                          background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                          fontWeight: 800, fontSize: 14, cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(16,185,129,0.3)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all .2s ease'
                        }}
                      >
                        <Lock size={16} />
                        <span>Kiểm kê tiền mặt &amp; Chốt ca Kiosk</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14,
                    padding: 32, textAlign: 'center'
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 16, background: '#f1f5f9',
                      color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px'
                    }}>
                      <Lock size={24} />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
                      Kiosk hiện chưa mở ca làm việc
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '0 auto 20px', maxWidth: 420, lineHeight: 1.5 }}>
                      Bạn cần bắt đầu mở ca bán hàng và kiểm đếm số tiền mặt thực tế có trong két trước khi tạo đơn tại quầy POS.
                    </p>
                    <button
                      onClick={() => setShowOpenShiftModal(true)}
                      style={{
                        padding: '12px 28px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                        fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex',
                        alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                        transition: 'all .2s ease'
                      }}
                    >
                      <PlayCircle size={18} />
                      <span>Bắt đầu mở ca Kiosk</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Thẻ hướng dẫn quy trình kiểm két */}
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color="#059669" /> Quy trình kiểm két &amp; Bàn giao ca Kiosk
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#475569' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>1</span>
                    <span><b>Đầu ca:</b> Kiểm đếm toàn bộ tiền mặt thực tế trong két, nhập chính xác vào hệ thống và xác nhận mở ca.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>2</span>
                    <span><b>Trong ca:</b> Thu ngân chỉ tạo đơn và in hóa đơn cho khách khi ca làm việc đang ở trạng thái Mở.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>3</span>
                    <span><b>Cuối ca:</b> Kiểm đếm tiền mặt thực tế, đối chiếu với số liệu kỳ vọng của hệ thống và ghi chú chênh lệch (nếu có).</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Lịch sử các phiên ca làm việc tại Kiosk */}
            <div style={{
              background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
              padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CalendarDays size={18} color="#059669" /> Lịch sử các phiên ca tại Kiosk
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Nhật ký kiểm kê và bàn giao két tiền giữa các nhân viên trực
                  </div>
                </div>

                <button
                  onClick={() => {
                    loadActiveKioskShift()
                    loadKioskShiftHistory()
                  }}
                  style={{
                    padding: '6px 12px', background: '#f8fafc', border: '1px solid #cbd5e1',
                    borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#334155', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5
                  }}
                >
                  <RefreshCw size={12} /> Làm mới
                </button>
              </div>

              {shiftHistoryLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#059669' }} />
                  <div>Đang tải lịch sử ca Kiosk...</div>
                </div>
              ) : kioskShiftHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: 12, color: '#94a3b8' }}>
                  <Clock size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Chưa có lịch sử phiên ca nào</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Các phiên ca sau khi chốt kiểm kê sẽ được lưu lại đầy đủ tại đây
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {kioskShiftHistory.map((s) => {
                    const isOpen = s.trang_thai === 'OPEN'
                    const openTime = s.thoi_gian_mo_ca ? new Date(s.thoi_gian_mo_ca).toLocaleString('vi-VN') : '—'
                    const closeTime = s.thoi_gian_dong_ca ? new Date(s.thoi_gian_dong_ca).toLocaleString('vi-VN') : '—'
                    const diff = s.chenh_lech !== null ? Number(s.chenh_lech) : 0

                    return (
                      <div
                        key={s.id || s.ma_phien_ca}
                        style={{
                          background: isOpen ? '#f0fdf4' : '#ffffff',
                          border: isOpen ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                          borderRadius: 12, padding: 16, transition: 'all .15s ease',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                              {s.staff_name || s.staff_username || 'Nhân viên'}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              @{s.staff_username}
                            </span>
                          </div>

                          <span style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                            background: isOpen ? '#dcfce7' : '#f1f5f9',
                            color: isOpen ? '#15803d' : '#475569',
                            border: isOpen ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}>
                            {isOpen ? <ShieldCheck size={12} color="#15803d" /> : <CheckCircle2 size={12} color="#475569" />}
                            <span>{isOpen ? 'Đang mở' : 'Đã chốt ca'}</span>
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11, background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Tiền đầu ca:</span>
                            <b style={{ color: '#0f172a' }}>{fmtMoney(s.tien_dau_ca)}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Doanh thu TM:</span>
                            <b style={{ color: '#059669' }}>{fmtMoney(s.tien_mat_he_thong || 0)}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Tiền nộp cuối:</span>
                            <b style={{ color: '#0f172a' }}>{s.tien_cuoi_ca !== null ? fmtMoney(s.tien_cuoi_ca) : '—'}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Chênh lệch:</span>
                            <b style={{ color: diff === 0 ? '#059669' : diff > 0 ? '#0284c7' : '#dc2626' }}>
                              {s.chenh_lech !== null ? (diff > 0 ? `+${fmtMoney(diff)}` : fmtMoney(diff)) : '—'}
                            </b>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                          <span>Mở: {openTime}</span>
                          <span>Đóng: {closeTime}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 4: TÀI KHOẢN CÁ NHÂN - FULL WIDTH 2-COLUMN LAYOUT */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'account' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 24, width: '100%', alignItems: 'start', boxSizing: 'border-box' }}>
            {/* Cột trái: Thông tin nhân sự & Chi nhánh Kiosk */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 900, boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                    flexShrink: 0
                  }}>
                    {userFullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{userFullName}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>@{userName}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 99, background: '#ecfdf5',
                        color: '#047857', border: '1px solid #a7f3d0', fontSize: 11, fontWeight: 800
                      }}>
                        Nhân viên Kiosk nhượng quyền
                      </span>
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Store size={16} color="#059669" /> Thông tin Kiosk làm việc
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13, marginBottom: 20 }}>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Chi nhánh làm việc:</span>
                    <b style={{ color: '#0f172a' }}>{kioskName}</b>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Mã định danh Kiosk:</span>
                    <b style={{ color: '#059669' }}>{kioskCode}</b>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Mô hình hợp đồng:</span>
                    <b style={{ color: packageMeta.color }}>{packageMeta.name}</b>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Trạng thái nhân sự:</span>
                    <b style={{ color: '#059669' }}>Đang hoạt động</b>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>Hòm thư điện tử (Email):</span>
                    <b style={{ color: '#0f172a' }}>{user.email || `${userName}@avengerscoffee.vn`}</b>
                  </div>
                </div>
              </div>

              {/* Thẻ quyền hạn tài khoản tại quầy POS */}
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 22, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCheck size={16} color="#059669" /> Quyền hạn vận hành được cấp phép
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#475569' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={15} color="#059669" />
                    <span>Tạo đơn bán hàng POS và xuất phiếu in hóa đơn cho khách</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={15} color="#059669" />
                    <span>Mở ca làm việc và kiểm kê két tiền mặt tại chi nhánh Kiosk</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={15} color="#059669" />
                    <span>Đăng ký nguyện vọng lịch ca làm việc theo tuần cho Quản lý duyệt</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={15} color="#059669" />
                    <span>Tra cứu danh mục sản phẩm theo đúng gói hợp đồng nhượng quyền</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Đổi mật khẩu đăng nhập & Tiêu chuẩn bảo mật */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Key size={18} color="#059669" /> Đổi mật khẩu tài khoản
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
                  Đổi mật khẩu định kỳ giúp bảo vệ tài khoản thu ngân và doanh thu ca của bạn.
                </p>

                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Mật khẩu hiện tại *
                    </label>
                    <input
                      type="password"
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đang sử dụng"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                        fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#10b981'}
                      onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Mật khẩu mới *
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                        fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#10b981'}
                      onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Xác nhận mật khẩu mới *
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới vừa tạo"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                        fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#10b981'}
                      onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword}
                    style={{
                      marginTop: 6, padding: '12px 24px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff',
                      fontWeight: 800, fontSize: 14, cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all .2s ease'
                    }}
                  >
                    <Key size={16} />
                    <span>{changingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu mới'}</span>
                  </button>
                </form>
              </div>

              {/* Thẻ hướng dẫn an toàn bảo mật */}
              <div style={{
                background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box'
              }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={15} color="#059669" /> Lưu ý an toàn tài khoản Kiosk
                </h4>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                  • Tuyệt đối không cung cấp mật khẩu đăng nhập cho khách hàng hoặc nhân viên ca khác.<br />
                  • Luôn bấm <b>Đăng xuất</b> hoặc <b>Chốt ca Kiosk</b> khi rời khỏi quầy POS.<br />
                  • Nếu nghi ngờ mật khẩu bị lộ, vui lòng đổi mật khẩu ngay và báo Quản lý Kiosk.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL MỞ CA KIOSK ─── */}
      {showOpenShiftModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setShowOpenShiftModal(false)}>
          <div style={{
            background: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 420,
            padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
              Mở ca làm việc tại Kiosk ({kioskCode})
            </h3>
            <form onSubmit={handleOpenKioskShift} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Tiền mặt trong két đầu ca (VNĐ)</label>
                <input type="number" required value={cashOpenInput} onChange={(e) => setCashOpenInput(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Ghi chú ca</label>
                <input type="text" value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} placeholder="Nhận bàn giao ca..." style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowOpenShiftModal(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                <button type="submit" disabled={kioskShiftSubmitting} style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>
                  {kioskShiftSubmitting ? 'Đang mở...' : 'Xác nhận mở ca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL CHỐT CA KIOSK ─── */}
      {showCloseShiftModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setShowCloseShiftModal(false)}>
          <div style={{
            background: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 420,
            padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
              Kiểm kê tiền mặt &amp; Chốt ca Kiosk ({kioskCode})
            </h3>
            <form onSubmit={handleCloseKioskShift} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Tiền mặt thực tế trong két cuối ca (VNĐ)</label>
                <input type="number" required value={cashCloseInput} onChange={(e) => setCashCloseInput(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>Ghi chú chốt ca</label>
                <input type="text" value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} placeholder="Bàn giao ca thành công..." style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowCloseShiftModal(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                <button type="submit" disabled={kioskShiftSubmitting} style={{ flex: 2, padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>
                  {kioskShiftSubmitting ? 'Đang chốt...' : 'Xác nhận chốt ca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FranchiseStaffPortal
