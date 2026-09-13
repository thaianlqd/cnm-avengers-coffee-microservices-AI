import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  TrendingUp,
  Users,
  Store,
  Zap,
  Clock,
  Activity,
  Calendar,
  Search,
  MoreVertical,
  RefreshCw,
  UserPlus,
  Repeat,
  AlertTriangle,
  BarChart3,
  PieChart,
  MapPin,
  ShieldCheck,
  ChevronDown,
  Info,
  Layers,
  Check,
  ArrowUpRight,
  Coffee,
  Ticket,
  ShoppingBag
} from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ'
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Vừa xong'
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return 'Vừa xong'

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMinutes = Math.floor(diffMs / (60 * 1000))

  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

  if (diffMinutes < 1) return 'Vừa xong'
  if (diffMinutes < 60) return `${diffMinutes} phút trước`
  if (isToday) return `Hôm nay, ${timeStr}`
  if (isYesterday) return `Hôm qua, ${timeStr}`
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}, ${timeStr}`
}

function getPeriod(dateInput) {
  if (!dateInput) return 'week'
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return 'week'

  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'yesterday'
  return 'week'
}

const ROLE_LABEL_MAP = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý chi nhánh',
  STAFF: 'Nhân viên phục vụ',
  CUSTOMER: 'Khách hàng thành viên',
  SHIPPER: 'Tài xế giao hàng',
  ACCOUNTANT: 'Kế toán',
  FRANCHISEE: 'Đối tác nhượng quyền',
  FRANCHISE_STAFF: 'Nhân viên Kiosk',
}

const ORDER_STATUS_MAP = {
  CHO_XAC_NHAN: 'Chờ xác nhận',
  MOI_TAO: 'Mới tạo',
  DANG_XU_LY: 'Đang xử lý',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao hàng',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

export function AdminOverviewDashboardPanel({
  statsState = { loading: false, error: '', data: null },
  dashboardSummary = {},
  roleChartRows = [],
  branchChartRows = [],
  recentOrders = [],
  recentUsers = [],
  branchesState = { items: [] },
  menuState = { items: [] },
  promotionsState = { items: [] }
}) {
  const [timeRange, setTimeRange] = useState('7_days')
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false)
  
  const [chartRange, setChartRange] = useState('this_week')
  const [isChartDropdownOpen, setIsChartDropdownOpen] = useState(false)

  const [activityTab, setActivityTab] = useState('today')
  const [activitySearch, setActivitySearch] = useState('')
  const [activeBarDay, setActiveBarDay] = useState('Mon')

  const timeDropdownRef = useRef(null)
  const chartDropdownRef = useRef(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target)) {
        setIsTimeDropdownOpen(false)
      }
      if (chartDropdownRef.current && !chartDropdownRef.current.contains(event.target)) {
        setIsChartDropdownOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const TIME_RANGE_OPTIONS = [
    { id: 'today', label: 'Hôm nay' },
    { id: '7_days', label: '7 ngày qua' },
    { id: 'last_week', label: 'Tuần trước' },
    { id: 'this_month', label: 'Tháng này' },
    { id: 'all_time', label: 'Toàn thời gian' }
  ]

  const CHART_RANGE_OPTIONS = [
    { id: 'this_week', label: 'Tuần này' },
    { id: 'last_week', label: 'Tuần trước' },
    { id: 'this_month', label: 'Tháng này' }
  ]

  const currentTimeLabel = TIME_RANGE_OPTIONS.find((opt) => opt.id === timeRange)?.label || '7 ngày qua'
  const currentChartLabel = CHART_RANGE_OPTIONS.find((opt) => opt.id === chartRange)?.label || 'Tuần này'

  // 1. TỔNG HỢP NHẬT KÝ HOẠT ĐỘNG THỰC TẾ TỪ HỆ THỐNG
  const allRealActivities = useMemo(() => {
    const list = []

    // Đơn hàng thực tế
    if (Array.isArray(recentOrders)) {
      recentOrders.forEach((order) => {
        const date = order.ngay_tao || order.created_at || order.createdAt
        const statusText = ORDER_STATUS_MAP[order.trang_thai_don_hang || order.status] || order.trang_thai_don_hang || 'Đã tạo đơn'
        const moneyText = order.tong_tien || order.thanh_tien || order.totalAmount ? ` • ${fmtMoney(order.tong_tien || order.thanh_tien || order.totalAmount)}` : ''
        list.push({
          id: `order-${order.id || order.ma_don_hang || Math.random()}`,
          type: 'order',
          title: `Đơn hàng #${order.ma_don_hang || order.id || 'POS'}`,
          desc: `${order.ten_khach_hang || 'Khách hàng'}${moneyText} (${statusText})`,
          rawDate: new Date(date || Date.now()),
          time: formatRelativeTime(date),
          period: getPeriod(date),
          color: '#10b981',
          bg: '#ecfdf5',
          icon: Coffee
        })
      })
    }

    // Tài khoản người dùng thực tế
    const usersList = Array.isArray(recentUsers) && recentUsers.length > 0 ? recentUsers : []
    if (Array.isArray(usersList)) {
      usersList.forEach((user) => {
        const date = user.ngay_tao || user.created_at || user.createdAt
        const roleName = ROLE_LABEL_MAP[user.vai_tro] || user.vai_tro || 'Thành viên'
        const contact = user.email || user.so_dien_thoai || user.ten_dang_nhap || 'Đã kích hoạt'
        list.push({
          id: `user-${user.id || user.ma_nguoi_dung || Math.random()}`,
          type: 'user',
          title: `Tài khoản mới: ${user.ho_ten || user.ten_dang_nhap || 'Người dùng'}`,
          desc: `Vai trò ${roleName} • ${contact}`,
          rawDate: new Date(date || Date.now()),
          time: formatRelativeTime(date),
          period: getPeriod(date),
          color: '#2563eb',
          bg: '#eff6ff',
          icon: UserPlus
        })
      })
    }

    // Món ăn thực đơn thực tế
    if (Array.isArray(menuState?.items)) {
      menuState.items.slice(0, 15).forEach((item) => {
        const date = item.ngay_tao || item.ngay_cap_nhat
        list.push({
          id: `menu-${item.id || item.code || Math.random()}`,
          type: 'menu',
          title: `Thực đơn: ${item.name || item.ten_san_pham}`,
          desc: `Danh mục: ${item.category || item.category_code || 'Menu'} • Giá: ${fmtMoney(item.price || item.gia_ban)}`,
          rawDate: new Date(date || Date.now() - 3600000),
          time: formatRelativeTime(date),
          period: getPeriod(date),
          color: '#f59e0b',
          bg: '#fffbeb',
          icon: RefreshCw
        })
      })
    }

    // Khuyến mãi thực tế
    if (Array.isArray(promotionsState?.items)) {
      promotionsState.items.forEach((promo) => {
        const date = promo.ngay_tao || promo.ngay_bat_dau
        const discountText = promo.loai_khuyen_mai === 'PERCENT' ? `${promo.gia_tri}%` : fmtMoney(promo.gia_tri)
        list.push({
          id: `promo-${promo.id || promo.ma_khuyen_mai || Math.random()}`,
          type: 'promo',
          title: `Khuyến mãi: ${promo.ten_khuyen_mai || promo.ma_khuyen_mai}`,
          desc: `Mã ${promo.ma_khuyen_mai} • Giảm ${discountText}`,
          rawDate: new Date(date || Date.now() - 7200000),
          time: formatRelativeTime(date),
          period: getPeriod(date),
          color: '#8b5cf6',
          bg: '#f5f3ff',
          icon: Ticket
        })
      })
    }

    // Chi nhánh thực tế
    if (Array.isArray(branchesState?.items)) {
      branchesState.items.forEach((branch) => {
        const date = branch.ngay_tao
        list.push({
          id: `branch-${branch.id || branch.ma_chi_nhanh || Math.random()}`,
          type: 'branch',
          title: `Chi nhánh: ${branch.ten_chi_nhanh || branch.ma_chi_nhanh}`,
          desc: `${branch.dia_chi_chi_tiet || branch.dia_chi || 'Đang sẵn sàng phục vụ'}`,
          rawDate: new Date(date || Date.now() - 86400000),
          time: formatRelativeTime(date),
          period: getPeriod(date),
          color: '#06b6d4',
          bg: '#ecfeff',
          icon: Store
        })
      })
    }

    // Sắp xếp giảm dần theo thời gian thực
    return list.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())
  }, [recentOrders, recentUsers, menuState?.items, promotionsState?.items, branchesState?.items])

  const filteredActivities = useMemo(() => {
    return allRealActivities.filter((act) => {
      if (activityTab === 'today' && act.period !== 'today') return false
      if (activityTab === 'yesterday' && act.period !== 'yesterday') return false
      if (activityTab === 'week' && act.period !== 'week' && act.period !== 'yesterday' && act.period !== 'today') return false
      if (!activitySearch) return true
      const q = activitySearch.toLowerCase()
      return act.title.toLowerCase().includes(q) || act.desc.toLowerCase().includes(q)
    })
  }, [allRealActivities, activityTab, activitySearch])

  // 2. TÍNH TOÁN BIỂU ĐỒ LƯU LƯỢNG & ĐƠN HÀNG THỰC TẾ
  const dynamicChartData = useMemo(() => {
    const events = []
    if (Array.isArray(recentOrders)) {
      recentOrders.forEach((o) => {
        const d = o.ngay_tao || o.created_at || o.createdAt
        if (d) events.push(new Date(d))
      })
    }
    const usersList = Array.isArray(recentUsers) && recentUsers.length > 0 ? recentUsers : []
    if (Array.isArray(usersList)) {
      usersList.forEach((u) => {
        const d = u.ngay_tao || u.created_at || u.createdAt
        if (d) events.push(new Date(d))
      })
    }

    const now = new Date()

    // A. TUẦN NÀY (Thứ 2 đến Chủ nhật)
    const currentDay = now.getDay() // 0 is Sun, 1 is Mon...
    const diffToMon = (currentDay === 0 ? -6 : 1) - currentDay
    const monDate = new Date(now)
    monDate.setDate(now.getDate() + diffToMon)
    monDate.setHours(0, 0, 0, 0)

    const DAYS_CONFIG = [
      { key: 'Mon', day: 'T2', label: 'Thứ Hai', offset: 0 },
      { key: 'Tue', day: 'T3', label: 'Thứ Ba', offset: 1 },
      { key: 'Wed', day: 'T4', label: 'Thứ Tư', offset: 2 },
      { key: 'Thu', day: 'T5', label: 'Thứ Năm', offset: 3 },
      { key: 'Fri', day: 'T6', label: 'Thứ Sáu', offset: 4 },
      { key: 'Sat', day: 'T7', label: 'Thứ Bảy', offset: 5 },
      { key: 'Sun', day: 'CN', label: 'Chủ Nhật', offset: 6 },
    ]

    const thisWeekBars = DAYS_CONFIG.map((slot) => {
      const slotDate = new Date(monDate)
      slotDate.setDate(monDate.getDate() + slot.offset)
      const dateStr = slotDate.toISOString().slice(0, 10)
      const count = events.filter((e) => e.toISOString().slice(0, 10) === dateStr).length
      return {
        key: slot.key,
        day: slot.day,
        label: `${slot.label} (${slotDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`,
        value: count,
      }
    })

    // B. TUẦN TRƯỚC
    const lastMonDate = new Date(monDate)
    lastMonDate.setDate(monDate.getDate() - 7)

    const lastWeekBars = DAYS_CONFIG.map((slot) => {
      const slotDate = new Date(lastMonDate)
      slotDate.setDate(lastMonDate.getDate() + slot.offset)
      const dateStr = slotDate.toISOString().slice(0, 10)
      const count = events.filter((e) => e.toISOString().slice(0, 10) === dateStr).length
      return {
        key: slot.key,
        day: slot.day,
        label: `${slot.label} (${slotDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`,
        value: count,
      }
    })

    // C. THÁNG NÀY (4 Tuần)
    const thisMonthBars = [
      { key: 'W1', day: 'T1', label: 'Tuần 1 (1 - 7)', start: 1, end: 7 },
      { key: 'W2', day: 'T2', label: 'Tuần 2 (8 - 14)', start: 8, end: 14 },
      { key: 'W3', day: 'T3', label: 'Tuần 3 (15 - 21)', start: 15, end: 21 },
      { key: 'W4', day: 'T4', label: 'Tuần 4 (22 - Cuối tháng)', start: 22, end: 31 },
    ].map((w) => {
      const count = events.filter((e) => {
        return (
          e.getFullYear() === now.getFullYear() &&
          e.getMonth() === now.getMonth() &&
          e.getDate() >= w.start &&
          e.getDate() <= w.end
        )
      }).length
      return {
        key: w.key,
        day: w.day,
        label: w.label,
        value: count,
      }
    })

    const computeHeights = (bars) => {
      const maxVal = Math.max(1, ...bars.map((b) => b.value))
      return bars.map((b) => ({
        ...b,
        height: b.value > 0 ? `${Math.max(Math.round((b.value / maxVal) * 100), 12)}%` : '8%'
      }))
    }

    const thisWeekProcessed = computeHeights(thisWeekBars)
    const lastWeekProcessed = computeHeights(lastWeekBars)
    const thisMonthProcessed = computeHeights(thisMonthBars)

    const sumThisWeek = thisWeekBars.reduce((acc, b) => acc + b.value, 0)
    const sumLastWeek = lastWeekBars.reduce((acc, b) => acc + b.value, 0)
    const sumThisMonth = thisMonthBars.reduce((acc, b) => acc + b.value, 0)

    const growthPercent = sumLastWeek > 0
      ? Math.round(((sumThisWeek - sumLastWeek) / sumLastWeek) * 100)
      : (sumThisWeek > 0 ? 100 : 0)

    return {
      this_week: thisWeekProcessed,
      last_week: lastWeekProcessed,
      this_month: thisMonthProcessed,
      totals: {
        this_week: sumThisWeek,
        last_week: sumLastWeek,
        this_month: sumThisMonth,
      },
      growth: {
        this_week: growthPercent >= 0 ? `+${growthPercent}% vs tuần trước` : `${growthPercent}% vs tuần trước`,
        last_week: `Tổng ${sumLastWeek} hoạt động tuần trước`,
        this_month: `Tổng ${sumThisMonth} hoạt động tháng này`,
      }
    }
  }, [recentOrders, recentUsers])

  const currentBars = dynamicChartData[chartRange] || dynamicChartData.this_week
  const selectedBar = currentBars.find((b) => b.key === activeBarDay) || currentBars[0]
  const currentTotal = dynamicChartData.totals[chartRange] ?? dynamicChartData.totals.this_week
  const currentGrowthText = dynamicChartData.growth[chartRange] ?? dynamicChartData.growth.this_week

  // 3. TÍNH TĂNG TRƯỞNG TÀI KHOẢN MỚI TRONG 7 NGÀY
  const userGrowthText = useMemo(() => {
    const usersList = Array.isArray(recentUsers) && recentUsers.length > 0 ? recentUsers : []
    if (!usersList.length) return 'Hệ thống vận hành thực'
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const recentCount = usersList.filter((u) => new Date(u.ngay_tao || u.createdAt || 0).getTime() >= sevenDaysAgo).length
    return recentCount > 0 ? `+${recentCount} tài khoản mới tuần này` : 'Tất cả tài khoản hệ thống'
  }, [recentUsers])

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f7f9fb', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      
      {/* 1. WELCOME HERO SECTION */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.02em', margin: 0 }}>
            Xin chào, Quản trị viên 👋
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.35rem', margin: 0 }}>
            Đây là bức tranh tổng thể về tình hình vận hành, người dùng và hoạt động thời gian thực trên toàn hệ thống.
          </p>
        </div>

        {/* Interactive Date Range Filter Dropdown */}
        <div style={{ position: 'relative' }} ref={timeDropdownRef}>
          <button
            type="button"
            onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#ffffff',
              border: isTimeDropdownOpen ? '1px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '0.5rem 0.95rem',
              fontSize: '0.825rem',
              fontWeight: '600',
              color: '#1f2937',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={15} color="#2563eb" />
            <span>{currentTimeLabel}</span>
            <ChevronDown size={14} color="#6b7280" style={{ transform: isTimeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {isTimeDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                width: '180px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                padding: '0.35rem',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.15rem'
              }}
            >
              {TIME_RANGE_OPTIONS.map((opt) => {
                const isSelected = timeRange === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTimeRange(opt.id)
                      setIsTimeDropdownOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? '#2563eb' : '#374151',
                      backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.1s ease'
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f9fafb' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} color="#2563eb" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {statsState.loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
          Đang đồng bộ số liệu thống kê hệ thống...
        </div>
      )}

      {statsState.error && (
        <div style={{ padding: '1rem 1.5rem', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '10px', border: '1px solid #fecaca', fontSize: '0.875rem', fontWeight: '600' }}>
          {statsState.error}
        </div>
      )}

      {!statsState.loading && (
        <>
          {/* 2. STATS OVERVIEW GRID (4 CARDS) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem'
          }}>
            
            {/* Card 1: Tổng Tài Khoản */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.35rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#6b7280' }}>Tổng Tài Khoản</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={16} color="#2563eb" />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  {fmtNumber(dashboardSummary.totalUsers || 0)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700', color: '#10b981' }}>
                  <TrendingUp size={13} />
                  <span>{userGrowthText}</span>
                </div>
                
                {/* Mini SVG Sparkline */}
                <div style={{ width: '60px', height: '24px' }}>
                  <svg width="100%" height="100%" viewBox="0 0 60 24" fill="none">
                    <path d="M2 18 L14 12 L26 15 L38 6 L50 9 L58 3" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card 2: Tỷ Lệ Hoạt Động */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.35rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#6b7280' }}>Tỷ Lệ Hoạt Động</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={16} color="#10b981" />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  {dashboardSummary.activeRate || 0}%
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '1rem' }}>
                <span style={{ color: '#10b981', fontWeight: '700' }}>{fmtNumber(dashboardSummary.activeUsers || 0)}</span>
                <span style={{ color: '#9ca3af', fontWeight: '500' }}>tài khoản đang hoạt động</span>
              </div>
            </div>

            {/* Card 3: Khối Vận Hành */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.35rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#6b7280' }}>Khối Vận Hành</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={16} color="#f59e0b" />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  {fmtNumber(dashboardSummary.workforceCount || 0)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '1rem' }}>
                <span style={{ color: '#2563eb', fontWeight: '700' }}>
                  {dashboardSummary.managerCount || 0} Quản lý, {dashboardSummary.staffCount || 0} Nhân viên
                </span>
              </div>
            </div>

            {/* Card 4: Chi Nhánh Toàn Hệ Thống */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.35rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#6b7280' }}>Mạng Lưới Chi Nhánh</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={16} color="#2563eb" />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#111827', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  {fmtNumber(dashboardSummary.branchCount || branchesState.items.length || 0)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '1rem' }}>
                <span style={{ color: '#10b981', fontWeight: '700' }}>
                  {branchesState.items.filter((b) => b.trang_thai === 'ACTIVE').length || dashboardSummary.branchCount || 0} Chi nhánh
                </span>
                <span style={{ color: '#9ca3af', fontWeight: '500' }}>sẵn sàng phục vụ</span>
              </div>
            </div>

          </div>

          {/* 3. MAIN SECTION: VOLUME TREND CHART & LATEST UPDATES FEED */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: '1.25rem'
          }}>
            
            {/* 3A. VOLUME TREND CHART CARD */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={18} color="#2563eb" />
                  <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827' }}>Biểu Đồ Lưu Lượng & Tương Tác</span>
                </div>

                {/* Interactive Chart Range Filter */}
                <div style={{ position: 'relative' }} ref={chartDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsChartDropdownOpen(!isChartDropdownOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      backgroundColor: '#f9fafb',
                      border: isChartDropdownOpen ? '1px solid #2563eb' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.775rem',
                      fontWeight: '600',
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Calendar size={13} color="#2563eb" />
                    <span>{currentChartLabel}</span>
                    <ChevronDown size={12} color="#6b7280" style={{ transform: isChartDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                  </button>

                  {isChartDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 4px)',
                        width: '140px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '0.25rem',
                        zIndex: 40,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.1rem'
                      }}
                    >
                      {CHART_RANGE_OPTIONS.map((opt) => {
                        const isSelected = chartRange === opt.id
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setChartRange(opt.id)
                              setIsChartDropdownOpen(false)
                              const newBars = dynamicChartData[opt.id] || []
                              if (newBars.length > 0) {
                                setActiveBarDay(newBars[0].key)
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.4rem 0.55rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: isSelected ? '700' : '500',
                              color: isSelected ? '#2563eb' : '#374151',
                              backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <span>{opt.label}</span>
                            {isSelected && <Check size={12} color="#2563eb" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.85rem', fontWeight: '800', color: '#111827' }}>
                  {fmtNumber(currentTotal)}
                </span>
                <span style={{ fontSize: '0.775rem', fontWeight: '700', color: '#10b981', marginLeft: '0.6rem' }}>
                  {currentGrowthText}
                </span>
              </div>

              {/* Bar Chart Container */}
              <div style={{
                position: 'relative',
                height: '210px',
                width: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '0.85rem',
                paddingTop: '2.5rem',
                marginTop: 'auto'
              }}>
                {/* Horizontal Grid lines */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontSize: '0.65rem',
                  color: '#9ca3af',
                  pointerEvents: 'none'
                }}>
                  <div style={{ borderBottom: '1px dashed #e5e7eb', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>Cao nhất</div>
                  <div style={{ borderBottom: '1px dashed #e5e7eb', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>75%</div>
                  <div style={{ borderBottom: '1px dashed #e5e7eb', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>50%</div>
                  <div style={{ borderBottom: '1px dashed #e5e7eb', width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>25%</div>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.5rem' }}>0</div>
                </div>

                {/* Bars */}
                {currentBars.map((b) => {
                  const isSelected = activeBarDay === b.key
                  return (
                    <div
                      key={b.key}
                      onClick={() => setActiveBarDay(b.key)}
                      style={{
                        position: 'relative',
                        flex: 1,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        cursor: 'pointer',
                        zIndex: 2
                      }}
                    >
                      {/* Active Tooltip */}
                      {isSelected && (
                        <div style={{
                          position: 'absolute',
                          top: '-24px',
                          backgroundColor: '#0f172a',
                          color: '#ffffff',
                          fontSize: '0.65rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                          whiteSpace: 'nowrap',
                          zIndex: 10
                        }}>
                          {b.label}: {b.value} hoạt động
                        </div>
                      )}

                      <div style={{
                        width: '100%',
                        maxWidth: chartRange === 'this_month' ? '56px' : '36px',
                        height: b.height,
                        backgroundColor: isSelected ? '#1e293b' : (b.value > 0 ? '#3b82f6' : '#e2e8f0'),
                        borderRadius: '4px 4px 0 0',
                        boxShadow: isSelected ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
                        transition: 'all 0.2s ease'
                      }} />

                      <span style={{
                        fontSize: '0.725rem',
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? '#0f172a' : '#9ca3af',
                        marginTop: '0.5rem'
                      }}>
                        {b.day}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3B. LATEST UPDATES (REAL SYSTEM FEED) */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.35rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.925rem', fontWeight: '700', color: '#111827' }}>Nhật Ký Hoạt Động</span>
                <Info size={16} color="#9ca3af" />
              </div>

              {/* Segmented Filter Pills */}
              <div style={{
                display: 'flex',
                backgroundColor: '#f3f4f6',
                padding: '0.25rem',
                borderRadius: '6px',
                marginBottom: '0.85rem',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                <button
                  type="button"
                  onClick={() => setActivityTab('today')}
                  style={{
                    flex: 1,
                    padding: '0.35rem 0',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: activityTab === 'today' ? '#ffffff' : 'transparent',
                    color: activityTab === 'today' ? '#111827' : '#6b7280',
                    boxShadow: activityTab === 'today' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                    fontWeight: activityTab === 'today' ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setActivityTab('yesterday')}
                  style={{
                    flex: 1,
                    padding: '0.35rem 0',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: activityTab === 'yesterday' ? '#ffffff' : 'transparent',
                    color: activityTab === 'yesterday' ? '#111827' : '#6b7280',
                    boxShadow: activityTab === 'yesterday' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                    fontWeight: activityTab === 'yesterday' ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Hôm qua
                </button>
                <button
                  type="button"
                  onClick={() => setActivityTab('week')}
                  style={{
                    flex: 1,
                    padding: '0.35rem 0',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: activityTab === 'week' ? '#ffffff' : 'transparent',
                    color: activityTab === 'week' ? '#111827' : '#6b7280',
                    boxShadow: activityTab === 'week' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                    fontWeight: activityTab === 'week' ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Tuần này
                </button>
              </div>

              {/* Quick Search */}
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Tìm kiếm sự kiện..."
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.5rem 0.4rem 1.85rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    outline: 'none',
                    color: '#111827'
                  }}
                />
              </div>

              <div style={{ fontSize: '0.675rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
                {filteredActivities.length} sự kiện được ghi nhận
              </div>

              {/* Timeline Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', maxHeight: '250px' }} className="custom-scrollbar">
                {filteredActivities.length > 0 ? (
                  filteredActivities.map((item) => {
                    const ItemIcon = item.icon
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '999px',
                          backgroundColor: item.bg,
                          color: item.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <ItemIcon size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.775rem', fontWeight: '700', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </p>
                          <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.7rem', color: '#6b7280', lineHeight: '1.3' }}>
                            {item.desc}
                          </p>
                        </div>
                        <span style={{ fontSize: '0.675rem', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {item.time}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.775rem' }}>
                    Chưa có sự kiện nào được ghi nhận trong khoảng thời gian này.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* 4. BOTTOM SECTION: ROLES & BRANCH BREAKDOWN */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '1.25rem'
          }}>
            
            {/* 4A. ROLE & WORKFORCE BREAKDOWN */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827', margin: 0 }}>
                  <PieChart size={18} color="#2563eb" /> Phân Bổ Vai Trò Người Dùng
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '500' }}>
                  Tổng: {fmtNumber(dashboardSummary.totalUsers || 0)} tài khoản
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {roleChartRows.length > 0 ? (
                  roleChartRows.map((row) => (
                    <div key={row.role} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', fontWeight: '600' }}>
                        <span style={{ color: '#374151' }}>{ROLE_LABEL_MAP[row.role] || row.role}</span>
                        <span style={{ color: '#4b5563' }}>{fmtNumber(row.count)} ({row.percent}%)</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: '#f3f4f6', height: '0.45rem', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#2563eb', height: '100%', borderRadius: '999px', width: `${Math.min(Math.max(row.percent, 0), 100)}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
                    Chưa có dữ liệu phân bổ vai trò
                  </div>
                )}
              </div>
            </div>

            {/* 4B. BRANCH DISTRIBUTION */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827', margin: 0 }}>
                  <MapPin size={18} color="#2563eb" /> Phân Bổ Chi Nhánh & Quy Mô
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700' }}>
                  {dashboardSummary.branchCount || branchesState.items.length || 0} Chi nhánh
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {branchChartRows.length > 0 ? (
                  branchChartRows.map((row) => (
                    <div key={row.code} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#111827' }}>{row.label}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280' }}>{fmtNumber(row.count)} tài khoản</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: '#f3f4f6', height: '0.45rem', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{
                          backgroundColor: '#2563eb',
                          height: '100%',
                          borderRadius: '999px',
                          opacity: row.percentOfMax === 100 ? 1 : (row.percentOfMax > 60 ? 0.8 : (row.percentOfMax > 30 ? 0.6 : 0.4)),
                          width: `${Math.min(Math.max(row.percentOfMax, 0), 100)}%`
                        }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
                    Chưa có dữ liệu phân bổ chi nhánh
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #dbeafe', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <Info size={15} color="#2563eb" style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#1e40af', lineHeight: '1.4' }}>
                  Tất cả các chi nhánh đều đang đồng bộ dữ liệu Menu, Bàn và Tồn kho với trung tâm máy chủ thời gian thực.
                </p>
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  )
}
