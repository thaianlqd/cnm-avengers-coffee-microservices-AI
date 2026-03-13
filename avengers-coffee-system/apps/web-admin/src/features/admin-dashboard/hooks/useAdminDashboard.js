import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL, ORDER_STATUSES, OVERVIEW_TIME_RANGES, PAYMENT_METHOD_LABEL } from '../constants'
import { cutTimeByRange, normalizeViText, toDateKey, toDateLabel } from '../utils'

export function useAdminDashboard() {
  const [loginForm, setLoginForm] = useState({ identifier: 'thaian_admin', password: '123456' })
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
  const [shiftRange, setShiftRange] = useState(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: now.toISOString() }
  })
  const [shiftPreview, setShiftPreview] = useState(null)
  const [shiftHistory, setShiftHistory] = useState([])
  const [shiftStatus, setShiftStatus] = useState({ loading: false, error: '', success: '' })
  const [closingShift, setClosingShift] = useState(false)
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

  const refreshOrders = async () => {
    setOrdersState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const response = await fetch(`${API_BASE_URL}/staff/orders`)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.message || 'Không tải được danh sách đơn hàng')
      }

      setOrdersState({ loading: false, error: '', items: payload?.orders || [] })
    } catch (error) {
      setOrdersState({ loading: false, error: error.message || 'Không tải được danh sách đơn hàng', items: [] })
    }
  }

  const refreshMenuAndInventory = async () => {
    setInventoryState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const [menuRes, inventoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/menu/items`),
        fetch(`${API_BASE_URL}/inventory/items`),
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
          item.dang_ban !== undefined
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

  const taiLichSuChotCa = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/history?limit=50`)
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
        from,
        to,
        cash_open: String(cashOpen || 0),
        cash_close: String(cashClose || 0),
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
      const response = await fetch(`${API_BASE_URL}/staff/shifts/${maCa}`, { method: 'DELETE' })
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
        body: JSON.stringify(fields),
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

  const chotCaTienMat = async () => {
    setShiftStatus((prev) => ({ ...prev, error: '', success: '' }))
    setClosingShift(true)

    try {
      const response = await fetch(`${API_BASE_URL}/staff/shifts/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: shiftRange.from,
          to: shiftRange.to,
          cash_open: Number(shiftInput.cashOpen || 0),
          cash_close: Number(shiftInput.cashClose || 0),
          note: shiftInput.note?.trim() || undefined,
          staff_name: session?.user?.tenDangNhap || session?.user?.email || 'staff',
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

    xemTruocDoiSoatCa({
      from: shiftRange.from,
      to: shiftRange.to,
      cashOpen: shiftInput.cashOpen,
      cashClose: shiftInput.cashClose,
    })
    taiLichSuChotCa()
  }, [session])

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
  }, [session, activeTab, shiftRange.from, shiftRange.to, shiftInput.cashOpen, shiftInput.cashClose])

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
      const response = await fetch(`${API_BASE_URL}/staff/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Cập nhật trạng thái thất bại')
      }

      setOrdersState((prev) => ({
        ...prev,
        items: prev.items.map((order) =>
          order.ma_don_hang === orderId ? { ...order, trang_thai_don_hang: nextStatus } : order,
        ),
      }))

      setLastPosOrder((prev) => {
        if (!prev?.order || prev.order.ma_don_hang !== orderId) return prev
        return {
          ...prev,
          order: {
            ...prev.order,
            trang_thai_don_hang: nextStatus,
          },
        }
      })
    } catch (error) {
      window.alert(error.message || 'Cập nhật trạng thái thất bại')
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
      const response = await fetch(`${API_BASE_URL}/menu/items/${productId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dang_ban: Boolean(dangBan) }),
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
          ten_thu_ngan: session?.user?.tenDangNhap || session?.user?.email || 'staff',
          items: itemPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Không thể tạo đơn tại quầy')
      }

      await Promise.all(
        itemPayload.map(async (line) => {
          const current = productMap.get(line.ma_san_pham)
          if (!current) return

          const soLuongMoi = Math.max(0, Number(current.so_luong_ton || 0) - Number(line.so_luong || 0))
          await fetch(`${API_BASE_URL}/inventory/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ma_san_pham: line.ma_san_pham,
              so_luong_ton: soLuongMoi,
              muc_canh_bao: Number(current.muc_canh_bao || 0),
            }),
          })
        }),
      )

      await Promise.all([refreshOrders(), refreshMenuAndInventory()])

      const maDon = payload?.order?.ma_don_hang || payload?.don_hang?.ma_don_hang || 'N/A'
      setLastPosOrder({
        order: payload?.order || payload?.don_hang || null,
        paymentDetails: payload?.payment_details || null,
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
    const tienKhachDua = Number(posCashInput || 0)
    const tienThoi = Math.max(0, tienKhachDua - tongTien)
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
    shiftRange,
    setShiftRange,
    shiftPreview,
    shiftHistory,
    shiftStatus,
    closingShift,
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
    totals,
    overviewData,
    login,
    logout,
    capNhatTrangThaiDon,
    capNhatTonKho,
    capNhatTrangThaiBanMon,
    chotCaTienMat,
      suaCaLamViec,
      xoaCaLamViec,
    addPosItem,
    updatePosItem,
    removePosItem,
    taoDonTaiQuay,
    inHoaDonPos,
  }
}
