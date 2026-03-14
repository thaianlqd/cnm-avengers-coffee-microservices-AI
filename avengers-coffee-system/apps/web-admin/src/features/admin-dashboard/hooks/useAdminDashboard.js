import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL, ORDER_STATUSES, OVERVIEW_TIME_RANGES, PAYMENT_METHOD_LABEL } from '../constants'
import { cutTimeByRange, normalizeViText, toDateKey, toDateLabel } from '../utils'

function getVnDateKey(input) {
  const source = input ? new Date(input) : new Date()
  const vn = new Date(source.getTime() + 7 * 60 * 60 * 1000)
  const y = vn.getUTCFullYear()
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0')
  const d = String(vn.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function taoKhoangChotCaTheoNgay(shiftDate) {
  const dateKey = shiftDate || getVnDateKey()
  const from = new Date(`${dateKey}T07:00:00+07:00`).toISOString()
  const to = new Date(`${dateKey}T22:00:00+07:00`).toISOString()
  return { from, to }
}

export function useAdminDashboard() {
  const [loginForm, setLoginForm] = useState({ identifier: 'thaian_staff_macdinhchi', password: '123456' })
  const [loginStatus, setLoginStatus] = useState({ loading: false, error: '' })
  const [session, setSession] = useState(() => {
    const raw = window.localStorage.getItem('adminSession')
    if (!raw) return null

    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  const [activeTab, setActiveTab] = useState('overview')
  const [ordersState, setOrdersState] = useState({ loading: true, error: '', items: [] })
  const [inventoryState, setInventoryState] = useState({ loading: true, error: '', items: [] })
  const [updatingOrderId, setUpdatingOrderId] = useState('')
  const [savingStockId, setSavingStockId] = useState(0)
  const [savingMenuStatusId, setSavingMenuStatusId] = useState(0)
  const [overviewRange, setOverviewRange] = useState(OVERVIEW_TIME_RANGES[1].id)
  const [stockDrafts, setStockDrafts] = useState({})
  const [shiftInput, setShiftInput] = useState({ cashOpen: 1000000, cashClose: 3540000, note: '' })
  const [shiftDate, setShiftDate] = useState(() => getVnDateKey())
  const [shiftRange, setShiftRange] = useState(() => taoKhoangChotCaTheoNgay(getVnDateKey()))
  const [shiftPreview, setShiftPreview] = useState(null)
  const [shiftHistory, setShiftHistory] = useState([])
  const [shiftStatus, setShiftStatus] = useState({ loading: false, error: '', success: '' })
  const [closingShift, setClosingShift] = useState(false)
  const [approvingShiftId, setApprovingShiftId] = useState('')
  const [posForm, setPosForm] = useState({
    loai_don_hang: 'TAI_CHO',
    phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG',
    ten_khach_hang: '',
    ma_ban: '',
    ghi_chu: '',
  })
  const [posItems, setPosItems] = useState([{ ma_san_pham: 0, qty: 1, price: 0 }])
  const [posCashInput, setPosCashInput] = useState(0)
  const [creatingPosOrder, setCreatingPosOrder] = useState(false)
  const [posStatus, setPosStatus] = useState({ error: '', success: '' })
  const [lastPosOrder, setLastPosOrder] = useState(null)
  const [workShiftForm, setWorkShiftForm] = useState(() => ({
    staff_username: '',
    staff_name: '',
    shift_date: new Date().toISOString().slice(0, 10),
    shift_code: 'SANG',
    shift_codes: ['SANG'],
    note: '',
  }))
  const [workShiftState, setWorkShiftState] = useState({ loading: false, error: '', items: [] })
  const [myWorkShiftState, setMyWorkShiftState] = useState({ loading: false, error: '', items: [] })
  const [workforceUsersState, setWorkforceUsersState] = useState({ loading: false, error: '', items: [] })
  const [creatingWorkShift, setCreatingWorkShift] = useState(false)
  const [updatingWorkShiftId, setUpdatingWorkShiftId] = useState('')

  const sessionUsername = session?.user?.tenDangNhap || session?.user?.email || ''
  const sessionRole = session?.user?.vaiTro || session?.user?.vai_tro || 'STAFF'
  const sessionBranchCode = (session?.user?.coSoMa || session?.user?.co_so_ma || 'MAC_DINH_CHI').toUpperCase()

  const dongBoPaymentDetailsTheoDon = (prevPaymentDetails, order) => {
    if (!order) return prevPaymentDetails || null

    const tongTien = Number(order.tong_tien || 0)
    const maThamChieu = order?.giao_dich?.ma_tham_chieu || prevPaymentDetails?.ma_tham_chieu || ''
    const next = {
      ...(prevPaymentDetails || {}),
      ma_don_hang: order.ma_don_hang,
      so_tien: tongTien,
      ma_tham_chieu: maThamChieu,
    }

    // Keep existing QR format but refresh dynamic params so bill/preview stays in sync.
    if (next.qr_img_url && maThamChieu) {
      try {
        const qrUrl = new URL(next.qr_img_url)
        qrUrl.searchParams.set('amount', String(Math.round(tongTien)))
        qrUrl.searchParams.set('des', maThamChieu)
        next.qr_img_url = qrUrl.toString()
      } catch {
        // Leave original qr_img_url as-is when URL parsing fails.
      }
    }

    return next
  }
  const ORDER_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH']
  const ORDER_TRANSITIONS = {
    MOI_TAO: ['DA_XAC_NHAN', 'DA_HUY'],
    DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DA_HUY'],
    DANG_CHUAN_BI: ['DANG_GIAO', 'HOAN_THANH', 'DA_HUY'],
    DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
    HOAN_THANH: [],
    DA_HUY: [],
  }

  const xayDuongDiTrangThaiDon = (currentStatus, targetStatus) => {
    if (!currentStatus || !targetStatus) return null
    if (currentStatus === targetStatus) return []

    if (targetStatus === 'DA_HUY') {
      return (ORDER_TRANSITIONS[currentStatus] || []).includes('DA_HUY') ? ['DA_HUY'] : null
    }

    const currentIndex = ORDER_FLOW.indexOf(currentStatus)
    const targetIndex = ORDER_FLOW.indexOf(targetStatus)
    if (currentIndex < 0 || targetIndex < 0 || targetIndex < currentIndex) {
      return null
    }

    const path = []
    let cursor = currentStatus
    for (let i = currentIndex + 1; i <= targetIndex; i += 1) {
      const nextStep = ORDER_FLOW[i]
      if (!(ORDER_TRANSITIONS[cursor] || []).includes(nextStep)) {
        return null
      }
      path.push(nextStep)
      cursor = nextStep
    }

    return path
  }

  const refreshOrders = async () => {
    setOrdersState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const params = new URLSearchParams({ branch_code: sessionBranchCode })
      const response = await fetch(`${API_BASE_URL}/staff/orders?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.message || 'Không tải được danh sách đơn hàng')
      }

      const nextOrders = payload?.orders || []
      setOrdersState({ loading: false, error: '', items: nextOrders })

      setLastPosOrder((prev) => {
        if (!prev?.order?.ma_don_hang) return prev
        const matched = nextOrders.find((item) => item.ma_don_hang === prev.order.ma_don_hang)
        if (!matched) return prev
        return {
          ...prev,
          order: {
            ...prev.order,
            ...matched,
          },
          paymentDetails: dongBoPaymentDetailsTheoDon(prev.paymentDetails, {
            ...prev.order,
            ...matched,
          }),
        }
      })
    } catch (error) {
      setOrdersState({ loading: false, error: error.message || 'Không tải được danh sách đơn hàng', items: [] })
    }
  }

  const refreshMenuAndInventory = async () => {
    setInventoryState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const [menuRes, inventoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/menu/items`),
        fetch(`${API_BASE_URL}/inventory/items?branch_code=${encodeURIComponent(sessionBranchCode)}`),
      ])

      const menuPayload = await menuRes.json().catch(() => ({}))
      const inventoryPayload = await inventoryRes.json().catch(() => ([]))

      if (!menuRes.ok || !inventoryRes.ok) {
        throw new Error(menuPayload?.message || 'Không tải được thực đơn hoặc tồn kho')
      }

      const inventoryMap = new Map(
        (Array.isArray(inventoryPayload) ? inventoryPayload : []).map((row) => [Number(row.ma_san_pham), row]),
      )

      const merged = (menuPayload?.items || []).map((item) => {
        const productId = Number(item.id)
        const stock = inventoryMap.get(productId)
        const soLuongTon = Number(stock?.so_luong_ton ?? 0)
        const dangBan =
          stock?.dang_kinh_doanh !== undefined
            ? Boolean(stock.dang_kinh_doanh)
            : item.dang_ban !== undefined
              ? Boolean(item.dang_ban)
              : item.status
                ? item.status === 'available'
                : Boolean(item.trang_thai)

        return {
          ma_san_pham: productId,
          name: item.name,
          category: item.category,
          price: Number(item.price || 0),
          so_luong_ton: soLuongTon,
          muc_canh_bao: Number(stock?.muc_canh_bao ?? 0),
          dang_ban: dangBan,
        }
      })

      setInventoryState({ loading: false, error: '', items: merged })
      setStockDrafts(Object.fromEntries(merged.map((row) => [row.ma_san_pham, row.so_luong_ton])))
    } catch (error) {
      setInventoryState({ loading: false, error: error.message || 'Không tải được thực đơn/tồn kho', items: [] })
    }
  }

  useEffect(() => {
    if (!session) return

    refreshOrders()
    refreshMenuAndInventory()

    const timer = window.setInterval(() => {
      refreshOrders()
      refreshMenuAndInventory()
    }, 30000)

    return () => window.clearInterval(timer)
  }, [session])

  const taiLichLamViecManager = async () => {
    setWorkShiftState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/manager/work-shifts?branch_code=${encodeURIComponent(sessionBranchCode)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc lich lam viec')
      setWorkShiftState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setWorkShiftState({ loading: false, error: error.message || 'Khong tai duoc lich lam viec', items: [] })
    }
  }

  const taiDanhSachNhanSu = async () => {
    setWorkforceUsersState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/workforce?role=STAFF&branch_code=${encodeURIComponent(sessionBranchCode)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc danh sach nhan vien')
      setWorkforceUsersState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setWorkforceUsersState({ loading: false, error: error.message || 'Khong tai duoc danh sach nhan vien', items: [] })
    }
  }

  const taiLichLamViecCuaToi = async () => {
    if (!sessionUsername) return
    setMyWorkShiftState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ staff_username: sessionUsername })
      params.set('branch_code', sessionBranchCode)
      const response = await fetch(`${API_BASE_URL}/staff/work-shifts?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc lich ca cua ban')
      setMyWorkShiftState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setMyWorkShiftState({ loading: false, error: error.message || 'Khong tai duoc lich ca cua ban', items: [] })
    }
  }

  useEffect(() => {
    if (!session) return

    taiLichLamViecCuaToi()
    if (sessionRole === 'MANAGER') {
      taiLichLamViecManager()
      taiDanhSachNhanSu()
    }
  }, [session])

  const taiLichSuChotCa = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/history?limit=50&branch_code=${encodeURIComponent(sessionBranchCode)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Khong tai duoc lich su chot ca')
      }
      setShiftHistory(payload?.items || [])
    } catch {
      setShiftHistory([])
    }
  }

  const xemTruocDoiSoatCa = async ({ from, to, cashOpen, cashClose }) => {
    setShiftStatus((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const params = new URLSearchParams({
        shift_date: shiftDate,
        from,
        to,
        cash_open: String(cashOpen || 0),
        cash_close: String(cashClose || 0),
        branch_code: sessionBranchCode,
      })
      const response = await fetch(`${API_BASE_URL}/staff/shifts/preview?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.message || 'Khong xem truoc doi soat duoc')
      }

      setShiftPreview(payload)
      setShiftStatus((prev) => ({ ...prev, loading: false, error: '' }))
    } catch (error) {
      setShiftPreview(null)
      setShiftStatus((prev) => ({ ...prev, loading: false, error: error.message || 'Khong xem truoc doi soat duoc' }))
    }
  }

  const xoaCaLamViec = async (maCa) => {
    if (!window.confirm('Xác nhận xóa ca này? Không thể hoàn tác.')) return
    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/${maCa}?branch_code=${encodeURIComponent(sessionBranchCode)}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.message || 'Xóa ca thất bại')
      }
      await taiLichSuChotCa()
    } catch (error) {
      setShiftStatus((prev) => ({ ...prev, error: error.message }))
    }
  }

  const suaCaLamViec = async (maCa, fields) => {
    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/${maCa}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, branch_code: sessionBranchCode }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Cập nhật ca thất bại')
      await taiLichSuChotCa()
      return true
    } catch (error) {
      setShiftStatus((prev) => ({ ...prev, error: error.message }))
      return false
    }
  }

  const pheDuyetCaLamViec = async (maCa, payload) => {
    setApprovingShiftId(maCa)
    setShiftStatus((prev) => ({ ...prev, error: '', success: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/manager/shifts/${maCa}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          manager_name: sessionUsername || 'manager',
          branch_code: sessionBranchCode,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong phe duyet doi soat duoc')
      setShiftStatus((prev) => ({
        ...prev,
        success: payload.status === 'APPROVED' ? 'Da phe duyet bien ban doi soat.' : 'Da tu choi bien ban doi soat.',
      }))
      await taiLichSuChotCa()
      return true
    } catch (error) {
      setShiftStatus((prev) => ({ ...prev, error: error.message || 'Khong phe duyet doi soat duoc' }))
      return false
    } finally {
      setApprovingShiftId('')
    }
  }

  const chotCaTienMat = async () => {
    setShiftStatus((prev) => ({ ...prev, error: '', success: '' }))
    setClosingShift(true)

    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_date: shiftDate,
          from: shiftRange.from,
          to: shiftRange.to,
          cash_open: Number(shiftInput.cashOpen || 0),
          cash_close: Number(shiftInput.cashClose || 0),
          note: shiftInput.note?.trim() || undefined,
          staff_name: session?.user?.tenDangNhap || session?.user?.email || 'staff',
          branch_code: sessionBranchCode,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.message || 'Chot ca that bai')
      }

      setShiftStatus((prev) => ({ ...prev, success: 'Chot ca thanh cong, da luu bien ban doi soat.' }))
      await Promise.all([
        taiLichSuChotCa(),
        xemTruocDoiSoatCa({
          from: shiftRange.from,
          to: shiftRange.to,
          cashOpen: shiftInput.cashOpen,
          cashClose: shiftInput.cashClose,
        }),
      ])
    } catch (error) {
      setShiftStatus((prev) => ({ ...prev, error: error.message || 'Chot ca that bai' }))
    } finally {
      setClosingShift(false)
    }
  }

  useEffect(() => {
    if (!session) return

    setShiftRange(taoKhoangChotCaTheoNgay(shiftDate))

    xemTruocDoiSoatCa({
      from: taoKhoangChotCaTheoNgay(shiftDate).from,
      to: taoKhoangChotCaTheoNgay(shiftDate).to,
      cashOpen: shiftInput.cashOpen,
      cashClose: shiftInput.cashClose,
    })
    taiLichSuChotCa()
  }, [session, shiftDate])

  useEffect(() => {
    if (!session || activeTab !== 'shift') return

    const debounce = window.setTimeout(() => {
      xemTruocDoiSoatCa({
        from: shiftRange.from,
        to: shiftRange.to,
        cashOpen: shiftInput.cashOpen,
        cashClose: shiftInput.cashClose,
      })
    }, 250)

    return () => window.clearTimeout(debounce)
  }, [session, activeTab, shiftDate, shiftRange.from, shiftRange.to, shiftInput.cashOpen, shiftInput.cashClose])

  useEffect(() => {
    if (!inventoryState.items.length) return

    setPosItems((current) =>
      current.map((line) => {
        if (line.ma_san_pham && inventoryState.items.some((item) => item.ma_san_pham === line.ma_san_pham)) {
          return line
        }

        const firstItem = inventoryState.items[0]
        const firstSellableItem = inventoryState.items.find((item) => item.dang_ban)
        const fallbackItem = firstSellableItem || firstItem
        return {
          ma_san_pham: fallbackItem.ma_san_pham,
          qty: Math.max(1, Number(line.qty) || 1),
          price: Number(fallbackItem.price || 0),
        }
      }),
    )
  }, [inventoryState.items])

  const totals = useMemo(() => {
    const now = Date.now()
    const minTimestamp = cutTimeByRange(overviewRange, now)

    const analyticsOrders = ordersState.items.filter((order) => {
      const created = new Date(order.ngay_tao).getTime()
      return !Number.isNaN(created) && created >= minTimestamp
    })

    const gross = analyticsOrders.reduce((sum, order) => sum + Number(order.tong_tien || 0), 0)
    const inProgress = analyticsOrders.filter((order) =>
      ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO'].includes(order.trang_thai_don_hang),
    ).length
    const activeMenu = inventoryState.items.filter((item) => item.dang_ban).length
    const revenue = analyticsOrders
      .filter((order) => order.trang_thai_don_hang === 'HOAN_THANH')
      .reduce((sum, order) => sum + Number(order.tong_tien || 0), 0)

    return { gross, inProgress, activeMenu, revenue, analyticsCount: analyticsOrders.length }
  }, [ordersState.items, inventoryState.items, overviewRange])

  const posSubtotal = useMemo(
    () => posItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0),
    [posItems],
  )
  const posVat = useMemo(() => Math.round(posSubtotal * 0.08), [posSubtotal])
  const posTotal = useMemo(() => Math.round(posSubtotal), [posSubtotal])
  const posChange = useMemo(() => Math.max(0, Number(posCashInput || 0) - posTotal), [posCashInput, posTotal])
  const isCashMethod = posForm.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
  const posCashInsufficient = isCashMethod && Number(posCashInput || 0) < posTotal

  const overviewData = useMemo(() => {
    const now = new Date()
    const minTimestamp = cutTimeByRange(overviewRange, now.getTime())
    const filteredOrders = ordersState.items.filter((order) => {
      const createdTs = new Date(order.ngay_tao).getTime()
      return !Number.isNaN(createdTs) && createdTs >= minTimestamp
    })

    const hourly = []
    for (let i = 7; i >= 0; i -= 1) {
      const bucket = new Date(now)
      bucket.setMinutes(0, 0, 0)
      bucket.setHours(bucket.getHours() - i)
      hourly.push({
        key: bucket.toISOString(),
        label: `${String(bucket.getHours()).padStart(2, '0')}:00`,
        value: 0,
      })
    }

    const statusMap = new Map(ORDER_STATUSES.map((status) => [status, { status, count: 0, revenue: 0 }]))
    const paymentMap = new Map(Object.keys(PAYMENT_METHOD_LABEL).map((code) => [code, { code, count: 0, amount: 0 }]))
    const revenueByDayMap = new Map()
    const soldItemsMap = new Map()

    filteredOrders.forEach((order) => {
      const createdAt = new Date(order.ngay_tao)
      const hourKey = new Date(createdAt)
      hourKey.setMinutes(0, 0, 0)
      const foundHour = hourly.find((h) => h.key === hourKey.toISOString())
      if (foundHour) foundHour.value += 1

      const tongTien = Number(order.tong_tien || 0)
      if (!statusMap.has(order.trang_thai_don_hang)) {
        statusMap.set(order.trang_thai_don_hang, { status: order.trang_thai_don_hang, count: 0, revenue: 0 })
      }
      const statusRow = statusMap.get(order.trang_thai_don_hang)
      statusRow.count += 1
      statusRow.revenue += tongTien

      const paymentCode = order.phuong_thuc_thanh_toan
      if (!paymentMap.has(paymentCode)) {
        paymentMap.set(paymentCode, { code: paymentCode, count: 0, amount: 0 })
      }
      const paymentRow = paymentMap.get(paymentCode)
      paymentRow.count += 1
      paymentRow.amount += tongTien

      const dayKey = toDateKey(order.ngay_tao)
      if (!revenueByDayMap.has(dayKey)) {
        revenueByDayMap.set(dayKey, {
          key: dayKey,
          label: toDateLabel(order.ngay_tao),
          amount: 0,
          orders: 0,
        })
      }
      const dayRow = revenueByDayMap.get(dayKey)
      dayRow.amount += tongTien
      dayRow.orders += 1

      ;(order.chi_tiet || []).forEach((line) => {
        const productKey = String(line.ma_san_pham)
        if (!soldItemsMap.has(productKey)) {
          soldItemsMap.set(productKey, {
            ma_san_pham: line.ma_san_pham,
            ten_san_pham: line.ten_san_pham || `SP ${line.ma_san_pham}`,
            so_luong: 0,
            doanh_thu: 0,
          })
        }
        const itemRow = soldItemsMap.get(productKey)
        const qty = Number(line.so_luong || 0)
        const amount = Number(line.gia_ban || 0) * qty
        itemRow.so_luong += qty
        itemRow.doanh_thu += amount
      })
    })

    const statusRows = [...statusMap.values()].filter((row) => row.count > 0)
    const paymentRows = [...paymentMap.values()].filter((row) => row.count > 0)
    const paymentTotal = paymentRows.reduce((sum, row) => sum + row.count, 0)
    const maxHourly = Math.max(...hourly.map((h) => h.value), 1)
    const maxStatus = Math.max(...statusRows.map((h) => h.count), 1)
    const revenueByDay = [...revenueByDayMap.values()].sort((a, b) => a.key.localeCompare(b.key))
    const maxRevenueDay = Math.max(...revenueByDay.map((d) => d.amount), 1)
    const topItems = [...soldItemsMap.values()].sort((a, b) => b.so_luong - a.so_luong).slice(0, 6)

    const stockSummary = {
      total: inventoryState.items.length,
      available: inventoryState.items.filter((item) => item.so_luong_ton > 0).length,
      outOfStock: inventoryState.items.filter((item) => item.so_luong_ton <= 0).length,
      lowStock: inventoryState.items.filter(
        (item) => item.so_luong_ton > 0 && item.muc_canh_bao > 0 && item.so_luong_ton <= item.muc_canh_bao,
      ).length,
    }

    const grossValue = filteredOrders.reduce((sum, order) => sum + Number(order.tong_tien || 0), 0)
    const completedOrders = filteredOrders.filter((order) => order.trang_thai_don_hang === 'HOAN_THANH').length
    const cancelledOrders = filteredOrders.filter((order) => order.trang_thai_don_hang === 'DA_HUY').length
    const totalItemsSold = filteredOrders.reduce(
      (sum, order) =>
        sum +
        (order.chi_tiet || []).reduce((inner, line) => inner + Number(line.so_luong || 0), 0),
      0,
    )
    const averageOrderValue = filteredOrders.length ? Math.round(grossValue / filteredOrders.length) : 0
    const averageItemsPerOrder = filteredOrders.length ? Number((totalItemsSold / filteredOrders.length).toFixed(1)) : 0
    const completionRate = filteredOrders.length ? Math.round((completedOrders / filteredOrders.length) * 100) : 0
    const cancelRate = filteredOrders.length ? Math.round((cancelledOrders / filteredOrders.length) * 100) : 0
    const peakHour = hourly.reduce((best, item) => (item.value > best.value ? item : best), hourly[0] || { label: '--:--', value: 0 })
    const bestRevenueDay = revenueByDay.reduce((best, item) => (item.amount > (best?.amount || 0) ? item : best), revenueByDay[0] || null)
    const topPaymentMethod = [...paymentRows].sort((a, b) => b.count - a.count)[0] || null
    const inventoryHealthRate = stockSummary.total ? Math.round((stockSummary.available / stockSummary.total) * 100) : 0
    const efficiencyScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(completionRate * 0.55 + (100 - cancelRate) * 0.25 + inventoryHealthRate * 0.2),
      ),
    )

    const alerts = []
    if (stockSummary.outOfStock > 0) alerts.push(`Co ${stockSummary.outOfStock} mon tam het can bo sung`)
    if (stockSummary.lowStock > 0) alerts.push(`Co ${stockSummary.lowStock} mon sap cham muc canh bao`)
    if (cancelRate >= 20) alerts.push(`Ty le huy don dang cao ${cancelRate}%`)
    if (!alerts.length) alerts.push('Van hanh dang on dinh trong pham vi du lieu hien tai')

    return {
      hourly,
      statusRows,
      paymentRows,
      paymentTotal,
      maxHourly,
      maxStatus,
      revenueByDay,
      maxRevenueDay,
      topItems,
      stockSummary,
      filteredCount: filteredOrders.length,
      summary: {
        grossValue,
        completedOrders,
        cancelledOrders,
        totalItemsSold,
        averageOrderValue,
        averageItemsPerOrder,
        completionRate,
        cancelRate,
        peakHour,
        bestRevenueDay,
        topPaymentMethod,
        inventoryHealthRate,
        efficiencyScore,
        alerts,
      },
    }
  }, [ordersState.items, inventoryState.items, overviewRange])

  const login = async (event) => {
    event.preventDefault()
    setLoginStatus({ loading: true, error: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.identifier,
          password: loginForm.password,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload?.user) {
        throw new Error(payload?.message || 'Không thể đăng nhập với tài khoản này')
      }

      const nextSession = {
        loginAt: new Date().toISOString(),
        token: payload.accessToken,
        user: payload.user,
      }

      window.localStorage.setItem('adminSession', JSON.stringify(nextSession))
      setSession(nextSession)
      setLoginStatus({ loading: false, error: '' })
    } catch (error) {
      setLoginStatus({ loading: false, error: error.message || 'Đăng nhập thất bại' })
    }
  }

  const logout = () => {
    window.localStorage.removeItem('adminSession')
    setSession(null)
    setActiveTab('overview')
  }

  const capNhatTrangThaiDon = async (orderId, nextStatus) => {
    setUpdatingOrderId(orderId)

    try {
      const currentOrder = ordersState.items.find((order) => order.ma_don_hang === orderId)
      const fallbackOrder = lastPosOrder?.order?.ma_don_hang === orderId ? lastPosOrder.order : null
      const currentStatus = currentOrder?.trang_thai_don_hang || fallbackOrder?.trang_thai_don_hang || ''

      const path = currentStatus
        ? xayDuongDiTrangThaiDon(currentStatus, nextStatus)
        : [nextStatus]

      if (path === null) {
        throw new Error(`Khong the chuyen trang thai tu ${currentStatus || 'N/A'} sang ${nextStatus}`)
      }

      if (!path.length) return

      let appliedStatus = currentStatus
      let latestOrderPayload = null

      for (const stepStatus of path) {
        const response = await fetch(`${API_BASE_URL}/staff/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: stepStatus, branch_code: sessionBranchCode }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.message || 'Cập nhật trạng thái thất bại')
        }

        latestOrderPayload = payload?.order || null
        appliedStatus = latestOrderPayload?.trang_thai_don_hang || stepStatus
      }

      setOrdersState((prev) => ({
        ...prev,
        items: prev.items.map((order) =>
          order.ma_don_hang === orderId
            ? {
                ...order,
                ...(latestOrderPayload || {}),
                trang_thai_don_hang: appliedStatus,
              }
            : order,
        ),
      }))

      setLastPosOrder((prev) => {
        if (!prev?.order || prev.order.ma_don_hang !== orderId) return prev
        const mergedOrder = {
          ...prev.order,
          ...(latestOrderPayload || {}),
          trang_thai_don_hang: appliedStatus,
        }
        return {
          ...prev,
          order: mergedOrder,
          paymentDetails: dongBoPaymentDetailsTheoDon(prev.paymentDetails, mergedOrder),
        }
      })
    } catch (error) {
      window.alert(error.message || 'Cập nhật trạng thái thất bại')
    } finally {
      setUpdatingOrderId('')
    }
  }

  const capNhatDonChoStaff = async (orderId, payload) => {
    setUpdatingOrderId(orderId)
    try {
      const response = await fetch(`${API_BASE_URL}/staff/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, branch_code: sessionBranchCode }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.message || 'Cap nhat don hang that bai')
      }

      await refreshOrders()

      setLastPosOrder((prev) => {
        if (!prev?.order || prev.order.ma_don_hang !== orderId) return prev
        const mergedOrder = result?.order || prev.order
        return {
          ...prev,
          order: mergedOrder,
          paymentDetails: dongBoPaymentDetailsTheoDon(prev.paymentDetails, mergedOrder),
        }
      })

      return result
    } finally {
      setUpdatingOrderId('')
    }
  }

  const xoaDonChoStaff = async (orderId, reason = '') => {
    setUpdatingOrderId(orderId)
    try {
      const params = new URLSearchParams({ branch_code: sessionBranchCode })
      if (reason?.trim()) {
        params.set('reason', reason.trim())
      }

      const response = await fetch(`${API_BASE_URL}/staff/orders/${orderId}?${params.toString()}`, {
        method: 'DELETE',
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.message || 'Xoa don that bai')
      }

      await refreshOrders()

      setLastPosOrder((prev) => {
        if (!prev?.order || prev.order.ma_don_hang !== orderId) return prev
        return null
      })

      return result
    } finally {
      setUpdatingOrderId('')
    }
  }

  const capNhatTonKho = async (productId) => {
    const item = inventoryState.items.find((row) => row.ma_san_pham === productId)
    if (!item) return

    const soLuongMoi = Number(stockDrafts[productId] ?? item.so_luong_ton)
    if (Number.isNaN(soLuongMoi) || soLuongMoi < 0) {
      window.alert('Số lượng tồn kho phải là số lớn hơn hoặc bằng 0')
      return
    }

    setSavingStockId(productId)

    try {
      const response = await fetch(`${API_BASE_URL}/inventory/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_san_pham: productId,
          so_luong_ton: soLuongMoi,
          muc_canh_bao: item.muc_canh_bao,
          branch_code: sessionBranchCode,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Cập nhật tồn kho thất bại')
      }

      setInventoryState((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.ma_san_pham === productId ? { ...row, so_luong_ton: soLuongMoi } : row,
        ),
      }))
    } catch (error) {
      window.alert(error.message || 'Cập nhật tồn kho thất bại')
    } finally {
      setSavingStockId(0)
    }
  }

  const capNhatTrangThaiBanMon = async (productId, dangBan) => {
    setSavingMenuStatusId(productId)

    try {
      const item = inventoryState.items.find((row) => row.ma_san_pham === productId)
      if (!item) {
        throw new Error('Khong tim thay mon can cap nhat')
      }

      const response = await fetch(`${API_BASE_URL}/inventory/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_san_pham: productId,
          so_luong_ton: Number(item.so_luong_ton || 0),
          muc_canh_bao: Number(item.muc_canh_bao || 0),
          dang_kinh_doanh: Boolean(dangBan),
          branch_code: sessionBranchCode,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Cập nhật trạng thái bán thất bại')
      }

      setInventoryState((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.ma_san_pham === productId ? { ...row, dang_ban: Boolean(dangBan) } : row,
        ),
      }))
    } catch (error) {
      window.alert(error.message || 'Cập nhật trạng thái bán thất bại')
    } finally {
      setSavingMenuStatusId(0)
    }
  }

  const addPosItem = () => {
    const firstItem = inventoryState.items[0]
    setPosItems((current) => [
      ...current,
      {
        ma_san_pham: firstItem?.ma_san_pham || 0,
        qty: 1,
        price: Number(firstItem?.price || 0),
      },
    ])
  }

  const updatePosItem = (index, key, value) => {
    setPosItems((current) =>
      current.map((item, i) => {
        if (i !== index) return item

        if (key === 'ma_san_pham') {
          const productId = Number(value) || 0
          const inventoryItem = inventoryState.items.find((row) => row.ma_san_pham === productId)
          return {
            ...item,
            ma_san_pham: productId,
            price: Number(inventoryItem?.price || 0),
          }
        }

        if (key === 'qty') {
          return { ...item, qty: Math.max(1, Number(value) || 1) }
        }

        return { ...item, [key]: Number(value) || 0 }
      }),
    )
  }

  const removePosItem = (index) => {
    setPosItems((current) => current.filter((_, i) => i !== index))
  }

  const taoDonTaiQuay = async () => {
    if (!inventoryState.items.length) {
      setPosStatus({ error: 'Chưa có dữ liệu thực đơn để tạo đơn tại quầy', success: '' })
      return
    }

    const productMap = new Map(inventoryState.items.map((item) => [item.ma_san_pham, item]))
    const itemPayload = []

    for (const line of posItems) {
      const product = productMap.get(Number(line.ma_san_pham))
      const qty = Number(line.qty || 0)

      if (!product || qty <= 0) {
        setPosStatus({ error: 'Có dòng món không hợp lệ. Vui lòng kiểm tra lại.', success: '' })
        return
      }

      if (!product.dang_ban) {
        setPosStatus({ error: `Món "${normalizeViText(product.name)}" đang tạm ngưng bán. Vui lòng đổi món khác.`, success: '' })
        return
      }

      itemPayload.push({
        ma_san_pham: product.ma_san_pham,
        ten_san_pham: normalizeViText(product.name),
        so_luong: qty,
        gia_ban: Number(product.price || line.price || 0),
      })
    }

    if (!itemPayload.length) {
      setPosStatus({ error: 'Đơn tại quầy cần ít nhất 1 món', success: '' })
      return
    }

    setCreatingPosOrder(true)
    setPosStatus({ error: '', success: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/staff/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loai_don_hang: posForm.loai_don_hang,
          phuong_thuc_thanh_toan: posForm.phuong_thuc_thanh_toan,
          ten_khach_hang: posForm.ten_khach_hang?.trim() || undefined,
          ma_ban: posForm.loai_don_hang === 'TAI_CHO' ? posForm.ma_ban?.trim() || undefined : undefined,
          ghi_chu: posForm.ghi_chu?.trim() || undefined,
          tien_khach_dua: isCashMethod ? Number(posCashInput || 0) : undefined,
          ten_thu_ngan: session?.user?.tenDangNhap || session?.user?.email || 'staff',
          branch_code: sessionBranchCode,
          items: itemPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Không thể tạo đơn tại quầy')
      }

      await Promise.all([refreshOrders(), refreshMenuAndInventory()])

      const maDon = payload?.order?.ma_don_hang || payload?.don_hang?.ma_don_hang || 'N/A'
      const cashSnapshot = isCashMethod ? Number(posCashInput || 0) : 0
      setLastPosOrder({
        order: payload?.order || payload?.don_hang || null,
        paymentDetails: payload?.payment_details || null,
        cashSnapshot,
      })
      setPosStatus({ error: '', success: `Tạo đơn tại quầy thành công. Mã đơn: ${maDon}` })
      if (isCashMethod) {
        setPosCashInput(0)
      }
      setPosItems((current) => {
        const firstItem = inventoryState.items[0]
        if (!firstItem) return current
        return [{ ma_san_pham: firstItem.ma_san_pham, qty: 1, price: Number(firstItem.price || 0) }]
      })
    } catch (error) {
      setLastPosOrder(null)
      setPosStatus({ error: error.message || 'Tạo đơn tại quầy thất bại', success: '' })
    } finally {
      setCreatingPosOrder(false)
    }
  }

  const taoLichLamViec = async (event) => {
    event.preventDefault()
    setCreatingWorkShift(true)
    setWorkShiftState((prev) => ({ ...prev, error: '' }))

    try {
      const response = await fetch(`${API_BASE_URL}/manager/work-shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // shift_code kept for backward compatibility; shift_codes enables multi-shift creation.
        body: JSON.stringify({
          ...workShiftForm,
          shift_code: workShiftForm.shift_codes?.[0] || workShiftForm.shift_code || 'SANG',
          shift_codes: workShiftForm.shift_codes?.length ? workShiftForm.shift_codes : [workShiftForm.shift_code || 'SANG'],
          manager_username: sessionUsername || 'manager',
          branch_code: sessionBranchCode,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tao duoc lich lam viec')
      setWorkShiftForm((prev) => ({ ...prev, note: '' }))
      await Promise.all([taiLichLamViecManager(), taiLichLamViecCuaToi()])
    } catch (error) {
      setWorkShiftState((prev) => ({ ...prev, error: error.message || 'Khong tao duoc lich lam viec' }))
    } finally {
      setCreatingWorkShift(false)
    }
  }

  const capNhatChamCong = async (workShiftId, fields) => {
    setUpdatingWorkShiftId(workShiftId)
    setWorkShiftState((prev) => ({ ...prev, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/manager/work-shifts/${workShiftId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, branch_code: sessionBranchCode }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong cap nhat cham cong duoc')
      await Promise.all([taiLichLamViecManager(), taiLichLamViecCuaToi()])
    } catch (error) {
      setWorkShiftState((prev) => ({ ...prev, error: error.message || 'Khong cap nhat cham cong duoc' }))
    } finally {
      setUpdatingWorkShiftId('')
    }
  }

  const xoaLichLamViec = async (workShiftId) => {
    if (!window.confirm('Xoa lich lam viec nay?')) return
    setUpdatingWorkShiftId(workShiftId)
    setWorkShiftState((prev) => ({ ...prev, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/manager/work-shifts/${workShiftId}?branch_code=${encodeURIComponent(sessionBranchCode)}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong xoa duoc lich lam viec')
      await Promise.all([taiLichLamViecManager(), taiLichLamViecCuaToi()])
    } catch (error) {
      setWorkShiftState((prev) => ({ ...prev, error: error.message || 'Khong xoa duoc lich lam viec' }))
    } finally {
      setUpdatingWorkShiftId('')
    }
  }

  const inHoaDonPos = () => {
    if (!lastPosOrder?.order) return

    const order = lastPosOrder.order
    const payment = lastPosOrder.paymentDetails
    const popup = window.open('', '_blank', 'width=420,height=700')
    if (!popup) return

    const itemRows = (order.chi_tiet || [])
      .map((item) => {
        const ten = normalizeViText(item.ten_san_pham || 'San pham')
        const soLuong = Number(item.so_luong || 0)
        const gia = Number(item.gia_ban || 0)
        return `<tr><td>${ten}</td><td style="text-align:center;">${soLuong}</td><td style="text-align:right;">${gia.toLocaleString('vi-VN')}</td></tr>`
      })
      .join('')

    const tongTien = Number(order.tong_tien || 0)
    const tienKhachDua = Number((order.tien_khach_dua ?? lastPosOrder?.cashSnapshot) || 0)
    const tienThoi = Number(order.tien_thoi ?? Math.max(0, tienKhachDua - tongTien))
    const isCash = order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG'
    const qrSection = !isCash && payment?.qr_img_url
      ? `<div style="text-align:center;margin-top:8px;"><img src="${payment.qr_img_url}" style="max-width:180px;" /><div style="font-size:11px;">Ma tham chieu: ${payment.ma_tham_chieu || 'N/A'}</div></div>`
      : ''

    popup.document.write(`
      <html>
      <head>
        <title>Hoa don POS</title>
        <style>
          body { font-family: Arial, sans-serif; width: 300px; margin: 0 auto; color: #111; }
          h2, p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { font-size: 12px; padding: 4px 0; border-bottom: 1px dashed #ccc; }
          .total { font-weight: 700; margin-top: 8px; }
          .meta { font-size: 12px; }
        </style>
      </head>
      <body>
        <h2>Avengers Coffee</h2>
        <p class="meta">Ma don: ${(order.ma_don_hang || '').slice(0, 8).toUpperCase()}</p>
        <p class="meta">Loai don: ${order.loai_don_hang === 'TAI_CHO' ? 'Dung tai quay' : 'Mang di'}</p>
        <p class="meta">Thu ngan: ${normalizeViText(order.ten_thu_ngan || 'N/A')}</p>
        <p class="meta">Thoi gian: ${new Date(order.ngay_tao).toLocaleString('vi-VN')}</p>
        <table>
          <thead>
            <tr><th style="text-align:left;">Mon</th><th>SL</th><th style="text-align:right;">Gia</th></tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p class="total">Tong thanh toan: ${tongTien.toLocaleString('vi-VN')} d</p>
        ${isCash ? `<p class="meta">Tien khach dua: ${tienKhachDua.toLocaleString('vi-VN')} d</p><p class="meta">Tien thoi: ${tienThoi.toLocaleString('vi-VN')} d</p>` : ''}
        ${qrSection}
      </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  return {
    loginForm,
    setLoginForm,
    loginStatus,
    session,
    activeTab,
    setActiveTab,
    ordersState,
    inventoryState,
    updatingOrderId,
    savingStockId,
    savingMenuStatusId,
    overviewRange,
    setOverviewRange,
    stockDrafts,
    setStockDrafts,
    shiftInput,
    setShiftInput,
    shiftDate,
    setShiftDate,
    shiftRange,
    setShiftRange,
    shiftPreview,
    shiftHistory,
    shiftStatus,
    closingShift,
    approvingShiftId,
    posForm,
    setPosForm,
    posItems,
    posCashInput,
    setPosCashInput,
    posSubtotal,
    posVat,
    posTotal,
    posChange,
    isCashMethod,
    posCashInsufficient,
    creatingPosOrder,
    posStatus,
    lastPosOrder,
    workShiftForm,
    setWorkShiftForm,
    workShiftState,
    myWorkShiftState,
    workforceUsersState,
    creatingWorkShift,
    updatingWorkShiftId,
    totals,
    overviewData,
    login,
    logout,
    capNhatTrangThaiDon,
    capNhatDonChoStaff,
    xoaDonChoStaff,
    capNhatTonKho,
    capNhatTrangThaiBanMon,
    chotCaTienMat,
      suaCaLamViec,
      xoaCaLamViec,
    pheDuyetCaLamViec,
    addPosItem,
    updatePosItem,
    removePosItem,
    taoDonTaiQuay,
    inHoaDonPos,
    taoLichLamViec,
    capNhatChamCong,
    xoaLichLamViec,
  }
}
