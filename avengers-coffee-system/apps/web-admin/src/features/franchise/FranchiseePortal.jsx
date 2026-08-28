import React, { useState, useEffect, useCallback } from 'react'

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
          <h2>Đã xảy ra lỗi (White Screen)</h2>
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
    // Kiosk cố định hoặc Default
    perks = [
      '☕ Máy pha cafe 2 Group + Máy xay tự động',
      '📦 20kg Cafe hạt & Combo nguyên liệu pha chế',
      '👕 4 Bộ đồng phục nhân viên',
      '📚 Khóa đào tạo & quản lý vận hành (5 ngày)',
      '❄️ Tủ lạnh & Bảng hiệu LED vẫy',
      '🖥️ Phần mềm quản lý POS & Quẹt thẻ'
    ];
  }
  
  // Mix in the original description if it's meaningful
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

// ─── Franchisee Portal ─────────────────────────────────────────────────────
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

  // ★ KIOSK CONTEXT — trung tâm điều phiếu toàn bộ portal
  const [activeKioskId, setActiveKioskId] = useState('')

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

  // POS Orders state
  const [posOrders, setPosOrders] = useState([])
  const [posOrderLoading, setPosOrderLoading] = useState(false)
  const [posDateFilter, setPosDateFilter] = useState('today')

  // Shift closing state
  const [shiftPreview, setShiftPreview] = useState(null)
  const [shiftPreviewLoading, setShiftPreviewLoading] = useState(false)
  const [cashOpen, setCashOpen] = useState('')
  const [cashClose, setCashClose] = useState('')
  const [shiftNote, setShiftNote] = useState('')
  const [shiftSubmitting, setShiftSubmitting] = useState(false)

  // Payment states
  const [showPayment, setShowPayment] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const handleNapTien = () => setWalletBalance(prev => prev + 100000000);

  const handleThanhToan = async () => {
    if (!selectedDebt || walletBalance < Number(selectedDebt.so_tien)) return;
    setPaymentProcessing(true);
    await new Promise(r => setTimeout(r, 1500)); // fake delay
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

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [k, c, d, cn, r] = await Promise.all([
        apiFetch('/franchise/kiosk/cua-toi'),
        apiFetch('/franchise/combo'),
        apiFetch('/franchise/don-mua-combo/cua-toi'),
        apiFetch('/franchise/cong-no/cua-toi'),
        apiFetch('/franchise/royalty/cua-toi'),
      ])
      setKiosks(k); setCombos(c); setDons(d); setCongNos(cn); setRoyalties(r)
      // Chọn kiosk context mặc định: uu tiên kiosk đang hoạt động
      if (k.length > 0) {
        const defaultKiosk = k.find(kk => kk.trang_thai === 'DANG_HOAT_DONG') || k[0]
        setActiveKioskId(prev => prev || defaultKiosk.id)
        setOrderForm(f => ({ ...f, kiosk_id: f.kiosk_id || defaultKiosk.id }))
      }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [])

  const loadMenu = useCallback(async () => {
    setMenuLoading(true)
    try {
      const data = await fetch(`${API_BASE_URL}/menu/san-pham`).then(r => r.json())
      setMenuItems(Array.isArray(data) ? data : (data.data || []))
    } catch (e) { setMenuItems([]) }
    finally { setMenuLoading(false) }
  }, [])

  const loadPosOrders = useCallback(async () => {
    if (!activeKioskId) return;
    const kiosk = kiosks.find(k => k.id === activeKioskId);
    if (!kiosk) return;
    setPosOrderLoading(true);
    try {
      let query = `?branch_code=${kiosk.ma_kiosk}`;
      const now = new Date();
      let from, to;
      if (posDateFilter === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = new Date(from.getTime() + 24*60*60*1000 - 1);
      } else if (posDateFilter === 'week') {
        const day = now.getDay() || 7; 
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
        to = new Date(from.getTime() + 7*24*60*60*1000 - 1);
      } else if (posDateFilter === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      } else if (posDateFilter === 'year') {
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      }
      if (from && to) {
        query += `&date_from=${from.toISOString()}&date_to=${to.toISOString()}`;
      }
      const data = await apiFetch(`/staff/orders${query}`);
      setPosOrders(data.orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setPosOrderLoading(false);
    }
  }, [activeKioskId, kiosks, posDateFilter]);


  const addToCart = (item, selectedToppingsList = []) => {
    setPosCart(prev => {
      // Calculate topping surcharge
      const toppingPrice = selectedToppingsList.reduce((sum, t) => sum + Number(t.price || 0), 0)
      const basePrice = Number(item.gia_ban || item.gia || 0)
      
      // Create a unique cart item ID based on product and toppings
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
      const res = await fetch(`${API_BASE_URL}/staff/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JSON.parse(localStorage.getItem('adminSession') || '{}')?.token}` }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Lỗi hệ thống khi tạo đơn')
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
    } catch (e) {
      setPosOrderResult({ success: false, error: e.message })
    } finally { setPosSubmitting(false) }
  }

  const loadShiftPreview = useCallback(async () => {
    if (!activeKioskId) return;
    const kiosk = kiosks.find(k => k.id === activeKioskId);
    if (!kiosk) return;
    setShiftPreviewLoading(true);
    setShiftPreview(null);
    try {
      const res = await apiFetch(`/staff/shifts/preview?branch_code=${kiosk.ma_kiosk}`);
      setShiftPreview(res);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Lỗi khi tải báo cáo ca' });
    } finally {
      setShiftPreviewLoading(false);
    }
  }, [activeKioskId, kiosks]);

  const submitShiftClose = async () => {
    if (!activeKioskId) return;
    const kiosk = kiosks.find(k => k.id === activeKioskId);
    if (!kiosk) return;
    setShiftSubmitting(true);
    try {
      const body = {
        branch_code: kiosk.ma_kiosk,
        cash_open: Number(cashOpen) || 0,
        cash_close: Number(cashClose) || 0,
        notes: shiftNote
      };
      const res = await fetch(`${API_BASE_URL}/staff/shifts/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JSON.parse(localStorage.getItem('adminSession') || '{}')?.token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi khi chốt ca');
      setMsg({ type: 'success', text: '✅ Chốt ca thành công!' });
      setCashOpen('');
      setCashClose('');
      setShiftNote('');
      loadShiftPreview();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setShiftSubmitting(false);
    }
  };

  useEffect(() => { 
    loadAll() 
    const params = new URLSearchParams(window.location.search)
    if (params.get('vnpay') === 'success') {
      setMsg({ type: 'success', text: '✅ Thanh toán VNPay thành công!' })
      window.history.replaceState(null, '', window.location.pathname)
    } else if (params.get('vnpay') === 'failed') {
      setMsg({ type: 'error', text: '❌ Thanh toán VNPay thất bại hoặc bị huỷ.' })
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [loadAll])

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
      loadAll()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setOrdering(false) }
  }

  const tongCongNo = congNos.filter(c => c.trang_thai !== 'DA_THANH_TOAN').reduce((s, c) => s + Number(c.so_tien), 0)

  // ★ COMPUTED from activeKioskId context
  const activeKiosk = kiosks.find(k => k.id === activeKioskId) || kiosks[0] || null
  const congNoTheoKiosk = congNos.filter(c => !activeKioskId || c.kiosk_id === activeKioskId)
  const royaltyTheoKiosk = royalties.filter(r => !activeKioskId || r.kiosk_id === activeKioskId)
  const donTheoKiosk = dons.filter(d => !activeKioskId || d.kiosk_id === activeKioskId)
  const tongCongNoTheoKiosk = congNoTheoKiosk.filter(c => c.trang_thai !== 'DA_THANH_TOAN').reduce((s, c) => s + Number(c.so_tien), 0)

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

  // Khi đổi kiosk context, reset giỏ hàng POS, sync orderForm
  const switchKiosk = (kioskId) => {
    setActiveKioskId(kioskId)
    setOrderForm(f => ({ ...f, kiosk_id: kioskId, combo_id: '' }))
    setPosCart([])
    setPosOrderResult(null)
    setMenuSearch('')
    setMenuCategory('')
  }

  useEffect(() => {
    if (activeKioskId && orderForm.kiosk_id !== activeKioskId) {
      setOrderForm(f => ({ ...f, kiosk_id: activeKioskId, combo_id: '' }))
    }
  }, [activeKioskId])

  // Auto-select combo if there's only 1 matching the kiosk type
  useEffect(() => {
    if (tab === 'order' && orderForm.kiosk_id) {
      const selectedKiosk = kiosks.find(k => k.id === orderForm.kiosk_id);
      if (selectedKiosk) {
        const lk = String(selectedKiosk.loai_kiosk || '');
        const validCombos = combos.filter(c => {
          const tc = String(c.ten_combo || '').toLowerCase();
          if (lk === 'XE_LUU_DONG' && !tc.includes('lưu động')) return false;
          if (lk === 'KIOSK_CO_DINH' && !tc.includes('cố định')) return false;
          if (lk === 'CONTAINER_CAFE' && !tc.includes('container')) return false;
          return true;
        });
        if (validCombos.length === 1 && orderForm.combo_id !== validCombos[0].id) {
          setOrderForm(f => ({ ...f, combo_id: validCombos[0].id }));
        }
      }
    }
  }, [orderForm.kiosk_id, combos, tab, kiosks]);

  useEffect(() => {
    if (tab === 'dashboard') loadAll()
    if (tab === 'thuc-don') loadMenu()
    if (tab === 'pos' && menuItems.length === 0) loadMenu()
    if (tab === 'don-ban-hang') loadPosOrders()
    if (tab === 'chot-ca') loadShiftPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeKioskId, posDateFilter])

  const TABS = [
    { id: 'dashboard', icon: '🏠', label: 'Tổng quan' },
    { id: 'menu', icon: '☕', label: 'Thực đơn' },
    { id: 'pos', icon: '🖥️', label: 'POS Bán Hàng' },
    { id: 'pos_orders', icon: '🧾', label: 'Đơn bán hàng' },
    { id: 'order', icon: '📦', label: 'Đặt Combo' },
    { id: 'history', icon: '📋', label: 'Lịch sử nhập' },
    { id: 'debt', icon: '💳', label: 'Công nợ' },
    { id: 'royalty', icon: '📊', label: 'Royalty' },
    { id: 'chot-ca', icon: '⏰', label: 'Chốt ca' },
  ]

  // Load menu when switching to menu/pos tab
  useEffect(() => {
    if ((tab === 'menu' || tab === 'pos') && menuItems.length === 0) loadMenu()
  }, [tab, menuItems.length, loadMenu])

  useEffect(() => {
    if (tab === 'pos_orders') loadPosOrders()
  }, [tab, posDateFilter, loadPosOrders])

  const alertBanner = msg && (
    <div style={{
      padding: '12px 18px', borderRadius: 10, marginBottom: 16,
      background: msg.type === 'success' ? '#fef9c3' : '#fee2e2',
      color: msg.type === 'success' ? '#854d0e' : '#991b1b',
      fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span>{msg.text}</span>
      <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</button>
    </div>
  )

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: '"Segoe UI",Inter,system-ui,sans-serif', background: '#f8fafc' }}>
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside style={{
          width: 240, flexShrink: 0, background: 'linear-gradient(180deg, #451a03, #78350f)',
          display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'sticky', top: 0, height: '100vh',
          boxShadow: '4px 0 24px rgba(0,0,0,0.06)'
        }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)'
            }}>☕</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 14, lineHeight: 1.2, letterSpacing: '0.02em' }}>Avengers Coffee</div>
              <div style={{ color: '#fcd34d', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cổng Nhượng Quyền</div>
            </div>
          </div>
        </div>

        {/* User info */}
        <div style={{ padding: '20px 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 20, marginBottom: 12, border: '1px solid rgba(255,255,255,0.2)'
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{userName}</div>
          <div style={{
            display: 'inline-block', marginTop: 6, padding: '4px 10px', borderRadius: 99,
            background: 'rgba(255,255,255,0.15)', color: '#fde68a', fontSize: 10, fontWeight: 800, letterSpacing: '0.05em'
          }}>FRANCHISEE</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              fontWeight: 600, fontSize: 13, transition: 'all .2s',
              background: tab === t.id ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.7)',
              borderLeft: tab === t.id ? '3px solid #fff' : '3px solid transparent',
            }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 12px 0' }}>
          <button onClick={onLogout} style={{
            width: '100%', padding: '9px', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10, background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
            color: '#fef3c7', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>↩ Đăng xuất</button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {/* Top bar */}
        <header style={{
          background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.05)',
          padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 50
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e293b' }}>
              {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              {kiosks.length} kiosk • {kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').length} đang hoạt động
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {tongCongNo > 0 && (
              <div style={{
                padding: '6px 14px', background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, fontSize: 12, color: '#b91c1c', fontWeight: 700
              }}>
                ⚠️ Tổng nợ (tất cả Kiosk): {fmtMoney(tongCongNo)}
              </div>
            )}
            <button onClick={loadAll} style={{
              padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 8,
              background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 600
            }}>🔄 Làm mới</button>
          </div>
        </header>

        {/* ★ KIOSK CONTEXT SWITCHER — hiện trên tất cả tab trừ dashboard */}
        {tab !== 'dashboard' && kiosks.length > 0 && (
          <div style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', position: 'sticky', top: 60, zIndex: 40 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>🏪 Kiosk đang xem:</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {kiosks.map(k => {
                const loai = LOAI_KIOSK_LABEL[k.loai_kiosk] || { label: k.loai_kiosk, emoji: '🏪', color: '#374151', bg: '#f1f5f9' }
                const isActive = k.id === activeKioskId
                return (
                  <button key={k.id} onClick={() => switchKiosk(k.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                    borderRadius: 99, border: `2px solid ${isActive ? loai.color : '#e2e8f0'}`,
                    background: isActive ? loai.bg : '#f8fafc',
                    color: isActive ? loai.color : '#64748b',
                    cursor: 'pointer', fontWeight: isActive ? 800 : 600, fontSize: 13,
                    transition: 'all .15s', boxShadow: isActive ? `0 0 0 3px ${loai.bg}` : 'none'
                  }}>
                    <span>{loai.emoji}</span>
                    <span>{k.ten_kiosk} ({k.ma_kiosk})</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: isActive ? loai.color : '#e2e8f0', color: isActive ? '#fff' : '#94a3b8', fontWeight: 700 }}>
                      {loai.label}
                    </span>
                    {k.trang_thai !== 'DANG_HOAT_DONG' && (
                      <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>⚠️</span>
                    )}
                  </button>
                )
              })}
            </div>
            {activeKiosk && (
              <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                {activeKiosk.dia_chi}, {activeKiosk.thanh_pho}
              </div>
            )}
          </div>
        )}

        <div style={{ padding: '24px 28px' }}>
          {alertBanner}

          {loading ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '80px 0', color: '#a16207'
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <div style={{ fontWeight: 600 }}>Đang tải dữ liệu...</div>
            </div>
          ) : (
            <>
              {/* ─── DASHBOARD ─────────────────────────────── */}
              {tab === 'dashboard' && (
                <div>
                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
                    {[
                      { icon: '🎪', label: 'Kiosk đang hoạt động', value: kiosks.filter(k => k.trang_thai === 'DANG_HOAT_DONG').length + ' / ' + kiosks.length, color: '#059669', bg: '#ecfdf5' },
                      { icon: '📦', label: 'Tổng combo (tất cả kiosk)', value: kiosks.reduce((s, k) => s + (k.so_combo_hien_tai || 0), 0), color: '#d97706', bg: '#fffbeb' },
                      { icon: '💳', label: 'Công nợ chưa trả', value: fmtMoney(tongCongNo), color: tongCongNo > 0 ? '#dc2626' : '#059669', bg: tongCongNo > 0 ? '#fef2f2' : '#ecfdf5' },
                    ].map((s, i) => (
                      <div key={i} style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>{s.icon}</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#1e293b', marginTop: 6 }}>{s.value}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Kiosk cards */}
                  <h3 style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 16 }}>Tất cả Kiosk của tôi</h3>
                  <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                    {kiosks.map(k => {
                      const loai = LOAI_KIOSK_LABEL[k.loai_kiosk] || { label: k.loai_kiosk, emoji: '🏪', color: '#374151', bg: '#f1f5f9' }
                      const kioskCongNo = congNos.filter(c => c.kiosk_id === k.id && c.trang_thai !== 'DA_THANH_TOAN')
                      const tongNoKiosk = kioskCongNo.reduce((s, c) => s + Number(c.so_tien), 0)
                      return (
                        <div key={k.id} style={{
                          background: '#fff', borderRadius: 20, border: `2px solid ${k.id === activeKioskId ? loai.color : 'transparent'}`,
                          boxShadow: k.id === activeKioskId ? `0 0 0 4px ${loai.bg}` : '0 4px 20px -4px rgba(0,0,0,0.08)',
                          overflow: 'hidden', transition: 'all .2s'
                        }}>
                          <div style={{ background: loai.bg, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 28 }}>{loai.emoji}</span>
                              <div>
                                <div style={{ fontWeight: 900, fontSize: 15, color: loai.color }}>{k.ten_kiosk}</div>
                                <div style={{ fontSize: 11, color: loai.color, opacity: 0.8 }}>{loai.label} • {k.ma_kiosk}</div>
                              </div>
                            </div>
                            <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                              background: k.trang_thai === 'DANG_HOAT_DONG' ? '#dcfce7' : k.trang_thai === 'TAM_DUNG' ? '#ffedd5' : '#fef9c3',
                              color: k.trang_thai === 'DANG_HOAT_DONG' ? '#059669' : k.trang_thai === 'TAM_DUNG' ? '#c2410c' : '#92400e' }}>
                              {k.trang_thai === 'DANG_HOAT_DONG' ? '✅ Hoạt động' : k.trang_thai === 'TAM_DUNG' ? '⏸️ Tạm dừng' : '⏳ ' + k.trang_thai}
                            </span>
                          </div>
                          <div style={{ padding: '14px 18px', display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, background: '#fffbeb', borderRadius: 10, padding: '8px 12px', border: '1px solid #fde68a', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#a16207', fontWeight: 700 }}>COMBO CÒN</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: k.so_combo_hien_tai < 3 ? '#dc2626' : '#78350f' }}>{k.so_combo_hien_tai}</div>
                            </div>
                            {tongNoKiosk > 0 && (
                              <div style={{ flex: 1, background: '#fef2f2', borderRadius: 10, padding: '8px 12px', border: '1px solid #fecaca', textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#b91c1c', fontWeight: 700 }}>CÔNG NỢ</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: '#dc2626' }}>{fmtMoney(tongNoKiosk)}</div>
                              </div>
                            )}
                            {k.hop_dong && (
                              <div style={{ flex: 1, background: '#fef3c7', borderRadius: 10, padding: '8px 12px', border: '1px solid #fbbf24', textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#a16207', fontWeight: 700 }}>ROYALTY</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: '#d97706' }}>{k.hop_dong.ty_le_royalty_phan_tram}%</div>
                              </div>
                            )}
                          </div>
                          <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8 }}>
                            <div style={{ fontSize: 12, color: '#64748b', flex: 1 }}>📍 {k.dia_chi}, {k.thanh_pho}</div>
                            <button onClick={() => { switchKiosk(k.id); setTab('menu') }} style={{
                              padding: '5px 12px', borderRadius: 8, border: `1px solid ${loai.color}`, background: loai.bg,
                              color: loai.color, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}>Xem thực đơn →</button>
                            {k.trang_thai === 'DANG_HOAT_DONG' && (
                              <button onClick={() => { switchKiosk(k.id); setTab('pos') }} style={{
                                padding: '5px 12px', borderRadius: 8, border: 'none', background: '#f59e0b',
                                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                              }}>POS 🖥️</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ─── ĐẶT COMBO ─────────────────────────────── */}
              {tab === 'order' && (
                <div style={{ maxWidth: 680 }}>
                  <div style={{ background: '#fff', borderRadius: 24, padding: 32, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)' }}>
                    <h3 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 900, color: '#1e293b' }}>📦 Đặt Mua Combo Nguyên Liệu</h3>
                    {activeKiosk && (() => {
                      const loai = LOAI_KIOSK_LABEL[activeKiosk.loai_kiosk] || { label: activeKiosk.loai_kiosk, emoji: '🏪', color: '#374151', bg: '#f1f5f9' }
                      return (
                        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: loai.bg, border: `1px solid ${loai.color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 24 }}>{loai.emoji}</span>
                          <div>
                            <div style={{ fontWeight: 800, color: loai.color }}>{activeKiosk.ten_kiosk}</div>
                            <div style={{ fontSize: 12, color: loai.color, opacity: 0.8 }}>{loai.label} • {activeKiosk.ma_kiosk}</div>
                          </div>
                        </div>
                      )
                    })()}

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kiosk nhận hàng</label>
                      <select value={orderForm.kiosk_id} onChange={e => switchKiosk(e.target.value)}
                        style={{ width: '100%', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 14, background: '#f8fafc', color: '#1e293b', fontWeight: 600, outline: 'none' }}>
                        {kiosks.map(k => <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>)}
                      </select>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Chọn gói combo</label>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {combos.filter(c => {
                          const selectedKiosk = kiosks.find(k => k.id === orderForm.kiosk_id);
                          if (!selectedKiosk) return true;
                          const lk = String(selectedKiosk.loai_kiosk || '');
                          const tc = String(c.ten_combo || '').toLowerCase();
                          if (lk === 'XE_LUU_DONG' && !tc.includes('lưu động')) return false;
                          if (lk === 'KIOSK_CO_DINH' && !tc.includes('cố định')) return false;
                          if (lk === 'CONTAINER_CAFE' && !tc.includes('container')) return false;
                          return true;
                        }).map(c => (
                          <div key={c.id} onClick={() => setOrderForm(f => ({ ...f, combo_id: c.id }))}
                            style={{
                              padding: '20px', border: `2px solid ${orderForm.combo_id === c.id ? '#f59e0b' : '#e2e8f0'}`,
                              borderRadius: 16, cursor: 'pointer', background: orderForm.combo_id === c.id ? '#fffbeb' : '#fff', transition: 'all .2s',
                              boxShadow: orderForm.combo_id === c.id ? '0 4px 20px rgba(245,158,11,0.15)' : 'none'
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, paddingRight: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                  <div style={{ fontWeight: 900, fontSize: 18, color: '#1e293b' }}>{c.ten_combo}</div>
                                  {c.gia_ban > 100000000 && <span style={{ padding: '4px 10px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', fontSize: 11, fontWeight: 900, borderRadius: 99, letterSpacing: '0.05em' }}>PREMIUM 👑</span>}
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 12 }}>
                                  {getComboPerks(c).map((perk, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                                      <span style={{ color: '#059669', flexShrink: 0, marginTop: 2 }}>{perk.startsWith('📝') || perk.startsWith('☕') || perk.startsWith('📦') || perk.startsWith('👕') || perk.startsWith('📚') || perk.startsWith('🛠️') || perk.startsWith('❄️') || perk.startsWith('🖥️') || perk.startsWith('🎉') || perk.startsWith('🌟') ? '' : '✅'}</span>
                                      <span style={{ fontWeight: perk.includes('Đặc quyền VIP') ? 800 : 500 }}>{perk}</span>
                                    </div>
                                  ))}
                                </div>

                                <div style={{ fontSize: 13, color: '#059669', marginTop: 16, fontWeight: 800, padding: '6px 14px', background: '#ecfdf5', borderRadius: 8, display: 'inline-block', border: '1px solid #a7f3d0' }}>
                                  🔥 Ước tính pha được ~{c.so_ly_pha_che_uoc_tinh} ly · Doanh thu tiềm năng: {fmtMoney(c.doanh_thu_uoc_tinh_moi_combo)}
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: '#f8fafc', padding: '16px 20px', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Giá gói nhượng quyền</div>
                                <div style={{ fontWeight: 900, fontSize: 24, color: '#d97706', whiteSpace: 'nowrap' }}>{fmtMoney(c.gia_ban)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Số lượng</label>
                        <input type="number" min="1" max="50" value={orderForm.so_luong}
                          onChange={e => setOrderForm(f => ({ ...f, so_luong: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 16, fontWeight: 800, textAlign: 'center', boxSizing: 'border-box', background: '#f8fafc', color: '#1e293b', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thanh toán</label>
                        <select value={orderForm.phuong_thuc_thanh_toan}
                          onChange={e => setOrderForm(f => ({ ...f, phuong_thuc_thanh_toan: e.target.value }))}
                          style={{ width: '100%', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 14, background: '#f8fafc', color: '#1e293b', fontWeight: 600, outline: 'none' }}>
                          <option value="CONG_NO">💳 Ghi nợ (trả sau)</option>
                          <option value="CHUYEN_KHOAN">🏦 Chuyển khoản</option>
                          <option value="VNPAY">💻 VNPAY</option>
                          <option value="VI_DIEN_TU">📱 Ví điện tử (Avengers Pay)</option>
                        </select>
                      </div>
                    </div>

                    {orderForm.combo_id && (
                      <div style={{ padding: '16px 20px', background: '#fef9c3', borderRadius: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #fde047' }}>
                        <div style={{ fontSize: 14, color: '#a16207', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng thanh toán:</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#d97706' }}>
                          {fmtMoney((combos.find(c => c.id === orderForm.combo_id)?.gia_ban || 0) * orderForm.so_luong)}
                        </div>
                      </div>
                    )}

                    {msg && tab === 'order' && (
                      <div style={{ padding: '12px 18px', borderRadius: 12, marginBottom: 20, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{msg.text}</span>
                        <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
                      </div>
                    )}

                    <button onClick={datMuaCombo} disabled={ordering || !orderForm.combo_id}
                      style={{
                        width: '100%', padding: '16px', background: ordering ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#fff', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: 'pointer',
                        opacity: !orderForm.combo_id ? 0.5 : 1, letterSpacing: '0.02em', boxShadow: ordering ? 'none' : '0 8px 24px rgba(217,119,6,0.35)', transition: 'all .2s'
                      }}>
                      {ordering ? '⏳ Đang xử lý...' : '📦 Xác nhận đặt hàng'}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── ĐƠN BÁN HÀNG (POS) ───────────────────────── */}
              {tab === 'pos_orders' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e293b' }}>🧾 Đơn bán hàng tại quầy</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Lọc theo:</span>
                      <select value={posDateFilter} onChange={e => setPosDateFilter(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff', outline: 'none', fontWeight: 600 }}>
                        <option value="today">Hôm nay</option>
                        <option value="week">Tuần này</option>
                        <option value="month">Tháng này</option>
                        <option value="year">Năm nay</option>
                        <option value="all">Tất cả</option>
                      </select>
                      <button onClick={loadPosOrders} style={{ padding: '8px 12px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, color: '#475569' }}>🔄 Tải lại</button>
                    </div>
                  </div>

                  {posOrderLoading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 16, fontWeight: 600 }}>⏳ Đang tải dữ liệu...</div>
                  ) : (
                    <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {['Mã Đơn', 'Ngày tạo', 'Khách hàng', 'Tổng tiền', 'Thanh toán', 'Chi tiết', 'Trạng thái'].map(h => (
                              <th key={h} style={{ padding: '16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {posOrders.map((d) => (
                            <tr key={d.ma_don_hang} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff', transition: 'background .2s' }}>
                              <td style={{ padding: '16px', fontWeight: 800, color: '#1e293b', fontSize: 13 }}>#{d.ma_don_hang.substring(0, 8).toUpperCase()}</td>
                              <td style={{ padding: '16px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{fmtDate(d.ngay_tao)}</td>
                              <td style={{ padding: '16px', color: '#475569', fontSize: 13, fontWeight: 600 }}>{d.ma_nguoi_dung === 'GUEST' ? 'Khách vãng lai' : d.ten_khach_hang || 'Khách hàng'}</td>
                              <td style={{ padding: '16px', fontWeight: 900, color: '#d97706', fontSize: 15 }}>{fmtMoney(d.tong_tien)}</td>
                              <td style={{ padding: '16px' }}>
                                <div style={{ color: '#475569', fontSize: 12, fontWeight: 800 }}>
                                  {d.phuong_thuc_thanh_toan === 'VI_DIEN_TU' ? '📱 Avengers Pay' :
                                   d.phuong_thuc_thanh_toan === 'VNPAY' ? '💻 VNPAY' :
                                   d.phuong_thuc_thanh_toan === 'CHUYEN_KHOAN' ? '🏦 Chuyển khoản' :
                                   d.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? '💵 Tiền mặt' : d.phuong_thuc_thanh_toan || '—'}
                                </div>
                              </td>
                              <td style={{ padding: '16px', fontSize: 12 }}>
                                {d.chi_tiet?.map((ct, idx) => (
                                  <div key={idx} style={{ marginBottom: 4 }}>
                                    <span style={{ fontWeight: 700, color: '#334155' }}>{ct.so_luong}x {ct.ten_san_pham}</span>
                                    {ct.toppings && ct.toppings.length > 0 && (
                                      <span style={{ color: '#64748b', marginLeft: 4 }}>({ct.toppings.join(', ')})</span>
                                    )}
                                  </div>
                                ))}
                              </td>
                              <td style={{ padding: '16px' }}>
                                <span style={{
                                  padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                  background: d.trang_thai_don_hang === 'HOAN_THANH' ? '#dcfce7' : d.trang_thai_don_hang === 'DA_HUY' ? '#fee2e2' : '#fef9c3',
                                  color: d.trang_thai_don_hang === 'HOAN_THANH' ? '#059669' : d.trang_thai_don_hang === 'DA_HUY' ? '#dc2626' : '#d97706',
                                }}>
                                  {d.trang_thai_don_hang}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {posOrders.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#a16207' }}>Chưa có đơn bán hàng nào trong thời gian này.</div>}
                    </div>
                  )}
                </div>
              )}

              {/* ─── LỊCH SỬ NHẬP HÀNG ─────────────────────────────────── */}
              {tab === 'history' && (
                <div>
                  <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          {['Combo', 'Kiosk', 'Số lượng', 'Tổng tiền', 'Thanh toán', 'Ngày đặt', 'Trạng thái'].map(h => (
                            <th key={h} style={{ padding: '16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {donTheoKiosk.map((d, i) => (
                          <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff', transition: 'background .2s' }}>
                            <td style={{ padding: '16px', fontWeight: 800, color: '#1e293b', fontSize: 14 }}>{d.combo?.ten_combo || '—'}</td>
                            <td style={{ padding: '16px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{d.kiosk?.ten_kiosk || '—'} <br/><span style={{fontSize: 11, color: '#94a3b8'}}>{d.kiosk?.ma_kiosk}</span></td>
                            <td style={{ padding: '16px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>×{d.so_luong}</td>
                            <td style={{ padding: '16px', fontWeight: 900, color: '#d97706', fontSize: 15 }}>{fmtMoney(d.tong_tien)}</td>
                            <td style={{ padding: '16px' }}>
                              <div style={{ color: '#475569', fontSize: 13, fontWeight: 800, marginBottom: d.trang_thai_thanh_toan ? 6 : 0 }}>
                                {d.phuong_thuc_thanh_toan === 'VI_DIEN_TU' ? '📱 Avengers Pay' :
                                 d.phuong_thuc_thanh_toan === 'VNPAY' ? '💻 VNPAY' :
                                 d.phuong_thuc_thanh_toan === 'CHUYEN_KHOAN' ? '🏦 Chuyển khoản' :
                                 d.phuong_thuc_thanh_toan === 'CONG_NO' ? '💳 Ghi nợ' : d.phuong_thuc_thanh_toan || '—'}
                              </div>
                              {d.trang_thai_thanh_toan && (
                                <span style={{
                                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                                  background: d.trang_thai_thanh_toan === 'DA_THANH_TOAN' ? '#dcfce7' : d.trang_thai_thanh_toan === 'DANG_XU_LY' || d.trang_thai_thanh_toan === 'CHO_XAC_NHAN' ? '#dbeafe' : '#fef3c7',
                                  color: d.trang_thai_thanh_toan === 'DA_THANH_TOAN' ? '#15803d' : d.trang_thai_thanh_toan === 'DANG_XU_LY' || d.trang_thai_thanh_toan === 'CHO_XAC_NHAN' ? '#1d4ed8' : '#b45309',
                                }}>
                                  {d.trang_thai_thanh_toan === 'DA_THANH_TOAN' ? 'Đã thanh toán' : d.trang_thai_thanh_toan === 'DANG_XU_LY' || d.trang_thai_thanh_toan === 'CHO_XAC_NHAN' ? 'Đang xử lý' : 'Chưa thanh toán'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '16px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{fmtDate(d.ngay_dat)}</td>
                            <td style={{ padding: '16px' }}>
                              <span style={{
                                padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                background: d.trang_thai === 'DA_GIAO' ? '#dcfce7' : d.trang_thai === 'DA_DAT' ? '#fef9c3' : '#fee2e2',
                                color: d.trang_thai === 'DA_GIAO' ? '#059669' : d.trang_thai === 'DA_DAT' ? '#d97706' : '#dc2626',
                              }}>
                                {d.trang_thai === 'DA_GIAO' ? '✅ Đã giao' : d.trang_thai === 'DA_DAT' ? '⏳ Đã đặt' : '⏸️ Tạm hoãn'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {donTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#a16207' }}>Chưa có đơn nào.</div>}
                  </div>
                </div>
              )}

              {/* ─── CÔNG NỢ ─────────────────────────────────── */}
              {tab === 'debt' && (
                <div style={{ maxWidth: 680 }}>
                  {tongCongNoTheoKiosk > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, #fef9c3, #fde047)', borderRadius: 20, padding: '24px 28px', marginBottom: 28, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 40px -10px rgba(234,179,8,0.3)' }}>
                      <div>
                        <div style={{ fontSize: 14, color: '#a16207', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠️ Tổng công nợ chưa thanh toán</div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: '#b45309', marginTop: 6 }}>{fmtMoney(tongCongNoTheoKiosk)}</div>
                      </div>
                      <div style={{ fontSize: 48, opacity: 0.8 }}>📋</div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 16 }}>
                    {congNoTheoKiosk.map(c => (
                      <div key={c.id} style={{
                        background: '#fff', borderRadius: 24, padding: 24,
                        border: `1px solid ${c.trang_thai === 'QUA_HAN' ? '#fecaca' : 'rgba(0,0,0,0.04)'}`,
                        boxShadow: '0 8px 30px -10px rgba(0,0,0,0.08)', transition: 'all .2s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 16 }}>
                              {c.loai_phat_sinh === 'KHOI_TAO' ? '🏪 Phí nhượng quyền ban đầu' : c.loai_phat_sinh === 'NGUYEN_LIEU' ? '📦 Công nợ nguyên liệu' : '📊 Phí royalty'}
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, fontWeight: 700 }}>Kiosk: {c.kiosk?.ten_kiosk} ({c.kiosk?.ma_kiosk})</div>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>Hạn: {fmtDate(c.han_thanh_toan)}</div>
                            {c.trang_thai === 'QUA_HAN' && <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 800, marginTop: 8, display: 'inline-block', background: '#fef2f2', padding: '4px 10px', borderRadius: 99 }}>⚠️ Đã quá hạn!</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: c.trang_thai === 'DA_THANH_TOAN' ? '#059669' : '#d97706' }}>{fmtMoney(c.so_tien)}</div>
                            {c.trang_thai !== 'DA_THANH_TOAN' ? (
                              <button onClick={() => { setSelectedDebt(c); setShowPayment(true); }} style={{
                                marginTop: 8, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                                background: '#3b82f6', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(59,130,246,0.3)'
                              }}>💳 Thanh toán (Ví Avengers)</button>
                            ) : (
                              <span style={{
                                display: 'inline-block', marginTop: 8, padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                                background: '#dcfce7', color: '#059669'
                              }}>Đã thanh toán</span>
                            )}
                          </div>
                        </div>
                        {/* BREAKDOWN CHO KHOI TAO */}
                        {c.loai_phat_sinh === 'KHOI_TAO' && c.kiosk?.loai_kiosk && KIOSK_PACKAGES[c.kiosk.loai_kiosk] && (
                          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>📦 Bao gồm các hạng mục:</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {KIOSK_PACKAGES[c.kiosk.loai_kiosk].assets.map((asset, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                                  <span>- {asset.name}</span>
                                  <span style={{ fontWeight: 600 }}>{fmtMoney(asset.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {congNoTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 15, fontWeight: 600, background: '#fff', borderRadius: 24, border: '1px dashed #cbd5e1' }}>✅ Hiện tại bạn không có công nợ nào.</div>}
                  </div>
                </div>
              )}

              {/* ─── ROYALTY ─────────────────────────────────── */}
              {tab === 'royalty' && (
                <div style={{ maxWidth: 680 }}>
                  <div style={{ display: 'grid', gap: 20 }}>
                    {royaltyTheoKiosk.map(r => (
                      <div key={r.id} style={{ background: '#fff', borderRadius: 24, padding: 28, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                          <div>
                            <div style={{ fontWeight: 900, color: '#1e293b', fontSize: 18 }}>Tháng {r.thang}</div>
                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 700 }}>Kiosk: {r.kiosk?.ten_kiosk} ({r.kiosk?.ma_kiosk})</div>
                          </div>
                          <span style={{
                            padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800,
                            background: r.trang_thai === 'DA_THANH_TOAN' ? '#dcfce7' : r.trang_thai === 'DA_XAC_NHAN' ? '#dbeafe' : '#fef9c3',
                            color: r.trang_thai === 'DA_THANH_TOAN' ? '#059669' : r.trang_thai === 'DA_XAC_NHAN' ? '#1d4ed8' : '#d97706',
                          }}>
                            {r.trang_thai === 'DA_THANH_TOAN' ? '💰 Đã thanh toán' : r.trang_thai === 'DA_XAC_NHAN' ? '✅ Đã xác nhận' : '⏳ Chờ xác nhận'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                          {[
                            { label: 'Doanh thu', value: fmtMoney(r.doanh_thu_thuc_te), color: '#1e293b' },
                            { label: 'Tỷ lệ', value: `${r.ty_le_royalty}%`, color: '#d97706' },
                            { label: 'Phí phải trả', value: fmtMoney(r.so_tien_royalty), color: '#dc2626' },
                          ].map((item, i) => (
                            <div key={i} style={{ background: '#f8fafc', borderRadius: 16, padding: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: item.color, marginTop: 8 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        {r.ghi_chu_ke_toan && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef9c3', borderRadius: 8, fontSize: 12, color: '#92400e' }}>📝 {r.ghi_chu_ke_toan}</div>}
                      </div>
                    ))}
                    {royaltyTheoKiosk.length === 0 && <div style={{ textAlign: 'center', padding: 50, color: '#a16207', fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu royalty.</div>}
                  </div>
                </div>
              )}

              {/* ─── THỰC ĐƠN ───────────────────────────────── */}
              {tab === 'menu' && (() => {
                const kioskActive = activeKiosk?.trang_thai === 'DANG_HOAT_DONG'
                
                const filteredMenu = availableMenu.filter(m => {
                  const matchSearch = !menuSearch || (m.ten_san_pham || m.tenSanPham || '').toLowerCase().includes(menuSearch.toLowerCase())
                  const matchCat = !menuCategory || getCategoryName(m.danh_muc || m.danhMuc) === menuCategory
                  return matchSearch && matchCat
                })
                const categories = [...new Set(availableMenu.map(m => getCategoryName(m.danh_muc || m.danhMuc)).filter(Boolean))]
                if (!kioskActive) return (
                  <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🔒</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Kiosk đang chọn chưa hoạt động</div>
                    <div style={{ color: '#64748b', fontSize: 14 }}>Kiosk <b>{activeKiosk?.ten_kiosk}</b> đang ở trạng thái <b>{activeKiosk?.trang_thai}</b>. Hãy chọn một Kiosk đang hoạt động hoặc hoàn tất ký Hợp đồng.</div>
                  </div>
                )
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center', background: '#fff', padding: '16px 20px', borderRadius: 16, boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)' }}>
                      <input value={menuSearch} onChange={e => { setMenuSearch(e.target.value); setMenuPage(1); }} placeholder="🔍 Tìm kiếm tên món..."
                        style={{ flex: 1, minWidth: 200, padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, outline: 'none', transition: 'border-color .2s', background: '#f8fafc' }} />
                      <select value={menuCategory} onChange={e => { setMenuCategory(e.target.value); setMenuPage(1); }}
                        style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, background: '#f8fafc', outline: 'none', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                        <option value=''>🏷️ Tất cả danh mục</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={loadMenu} style={{ padding: '12px 16px', border: 'none', borderRadius: 12, background: '#f1f5f9', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#475569', transition: 'background .2s' }}>🔄 Tải lại</button>
                    </div>
                    {menuLoading ? (
                      <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 16, fontWeight: 600 }}>⏳ Đang tải thực đơn...</div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                          {filteredMenu.slice((menuPage - 1) * itemsPerPage, menuPage * itemsPerPage).map((m, i) => {
                            const name = m.ten_san_pham || m.tenSanPham || 'Sản phẩm'
                            const price = m.gia_ban || m.gia || 0
                            const img = m.hinh_anh_url || m.hinhAnhUrl || m.hinh_anh || m.hinhAnh || m.imageUrl
                            const isAvail = m.trang_thai !== 'HET_HANG' && m.is_available !== false && m.trangThai !== 'HET_HANG'
                            return (
                              <div key={i} style={{ 
                                background: '#fff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.04)', overflow: 'hidden', 
                                opacity: isAvail ? 1 : 0.6, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)', 
                                transition: 'transform .2s, box-shadow .2s', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.01)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)'; }}
                              >
                                {img ? (
                                  <div style={{ position: 'relative', width: '100%', paddingTop: '75%' }}>
                                    <img src={img} alt={name} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                  </div>
                                ) : (
                                  <div style={{ width: '100%', paddingTop: '75%', position: 'relative', background: 'linear-gradient(135deg, #fef3c7, #fde68a)' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>☕</div>
                                  </div>
                                )}
                                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b', marginBottom: 6, lineHeight: 1.3 }}>{name}</div>
                                    {getCategoryName(m.danh_muc || m.danhMuc) && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>{getCategoryName(m.danh_muc || m.danhMuc)}</div>}
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                    <div style={{ fontWeight: 900, color: '#ea580c', fontSize: 18 }}>{fmtMoney(price)}</div>
                                    {isAvail ? (
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        {(() => {
                                          let parsedToppings = null;
                                          try { parsedToppings = typeof m.toppings === 'string' ? JSON.parse(m.toppings) : m.toppings } catch(e){}
                                          const hasToppings = parsedToppings && Object.keys(parsedToppings).length > 0;
                                          
                                          return (
                                            <>
                                              {hasToppings && (
                                                <button onClick={(e) => { 
                                                  e.stopPropagation();
                                                  setSelectedProduct({ ...m, parsedToppings })
                                                  setSelectedToppings([])
                                                }}
                                                  style={{ padding: '8px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                  title="Tuỳ chỉnh Topping">
                                                  🥤+
                                                </button>
                                              )}
                                              <button onClick={(e) => { 
                                                e.stopPropagation();
                                                addToCart(m); setTab('pos')
                                              }}
                                                style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)' }}>
                                                Thêm
                                              </button>
                                            </>
                                          )
                                        })()}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 800, background: '#fee2e2', padding: '6px 12px', borderRadius: 8 }}>Hết hàng</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {filteredMenu.length === 0 && !menuLoading && (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 80, color: '#94a3b8', fontSize: 16, fontWeight: 600 }}>Không tìm thấy sản phẩm nào phù hợp.</div>
                          )}
                        </div>
                        
                        {/* Phân trang */}
                        {filteredMenu.length > itemsPerPage && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 32 }}>
                            <button onClick={() => setMenuPage(p => Math.max(1, p - 1))} disabled={menuPage === 1}
                              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #e2e8f0', background: menuPage === 1 ? '#f8fafc' : '#fff', color: menuPage === 1 ? '#cbd5e1' : '#1e293b', cursor: menuPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                              {'<'}
                            </button>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>
                              Trang <span style={{ color: '#0f172a', fontWeight: 900 }}>{menuPage}</span> / {Math.ceil(filteredMenu.length / itemsPerPage)}
                            </div>
                            <button onClick={() => setMenuPage(p => Math.min(Math.ceil(filteredMenu.length / itemsPerPage), p + 1))} disabled={menuPage === Math.ceil(filteredMenu.length / itemsPerPage)}
                              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #e2e8f0', background: menuPage === Math.ceil(filteredMenu.length / itemsPerPage) ? '#f8fafc' : '#fff', color: menuPage === Math.ceil(filteredMenu.length / itemsPerPage) ? '#cbd5e1' : '#1e293b', cursor: menuPage === Math.ceil(filteredMenu.length / itemsPerPage) ? 'not-allowed' : 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                              {'>'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

              {/* ─── POS BÁN HÀNG ──────────────────────────── */}
              {tab === 'pos' && (() => {
                const kioskActive = activeKiosk?.trang_thai === 'DANG_HOAT_DONG'
                if (!kioskActive) return (
                  <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🔒</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>POS chưa khả dụng</div>
                    <div style={{ color: '#64748b', fontSize: 14 }}>Kiosk <b>{activeKiosk?.ten_kiosk}</b> đang ở trạng thái <b>{activeKiosk?.trang_thai}</b>. Chọn một Kiosk đang hoạt động để dùng POS.</div>
                  </div>
                )
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start', height: 'calc(100vh - 120px)' }}>
                    {/* LEFT: Thực đơn chọn nhanh */}
                    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <style>{`
                          div::-webkit-scrollbar { display: none; }
                        `}</style>
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
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = inCart ? '0 0 0 3px rgba(245,158,11,0.2), 0 8px 16px rgba(0,0,0,0.06)' : '0 8px 16px rgba(0,0,0,0.06)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = inCart ? '0 0 0 3px rgba(245,158,11,0.2)' : '0 4px 12px rgba(0,0,0,0.03)'; }}
                                >
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
                                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', height: 39 }}>{name}</div>
                                      <div style={{ fontSize: 15, color: '#ea580c', fontWeight: 900, marginTop: 'auto' }}>{fmtMoney(price)}</div>
                                      {inCart && <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 800, marginTop: 4 }}>✓ Đã thêm </div>}
                                    </div>
                                  </div>

                                  {/* NÚT TOPPING (Nổi đè lên hình ảnh) */}
                                  {(() => {
                                    let parsedToppings = null;
                                    try { parsedToppings = typeof m.toppings === 'string' ? JSON.parse(m.toppings) : m.toppings } catch(e){}
                                    if (parsedToppings && Object.keys(parsedToppings).length > 0) {
                                      return (
                                        <button onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedProduct({ ...m, parsedToppings })
                                          setSelectedToppings([])
                                        }} style={{
                                          position: 'absolute', top: 8, right: 8, width: 40, height: 40, borderRadius: '50%', border: '2px solid #fff', background: '#f59e0b', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.4)', zIndex: 10
                                        }} title="Tuỳ chọn Topping">
                                          🥤+
                                        </button>
                                      )
                                    }
                                    return null;
                                  })()}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT: Giỏ hàng POS */}
                    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', position: 'sticky', top: 80 }}>
                      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: '#1e293b' }}>🖥️ Đơn hàng tại quầy</div>
                        <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(() => { const loai = LOAI_KIOSK_LABEL[activeKiosk?.loai_kiosk]; return loai ? <span>{loai.emoji}</span> : null })()}
                          <span style={{ color: '#1e293b', fontWeight: 700 }}>{activeKiosk?.ten_kiosk}</span>
                          <span style={{ color: '#94a3b8' }}>· {activeKiosk?.ma_kiosk}</span>
                        </div>
                      </div>

                      <div style={{ padding: '0 16px', maxHeight: 320, overflowY: 'auto' }}>
                        {posCart.length === 0 ? (
                          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Chưa có sản phẩm nào.<br/>Bấm vào thực đơn để thêm.</div>
                        ) : posCart.map(c => (
                          <div key={c.cartItemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #f8fafc' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.ten_san_pham || c.tenSanPham}</div>
                              {c.selectedToppings && c.selectedToppings.length > 0 && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>+ {c.selectedToppings.map(t => t.name).join(', ')}</div>
                              )}
                              <div style={{ fontSize: 12, color: '#d97706', fontWeight: 700, marginTop: 4 }}>{fmtMoney(c.gia_ban)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button onClick={() => updateCartQty(c.cartItemId, c.sl - 1)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 800, fontSize: 16, color: '#475569' }}>−</button>
                              <span style={{ fontWeight: 800, fontSize: 15, minWidth: 26, textAlign: 'center', color: '#0f172a' }}>{c.sl}</span>
                              <button onClick={() => updateCartQty(c.cartItemId, c.sl + 1)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 800, fontSize: 16, color: '#475569' }}>+</button>
                              <button onClick={() => removeFromCart(c.cartItemId)} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 800, marginLeft: 6 }}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>THANH TOÁN</label>
                          <select value={posPayment} onChange={e => setPosPayment(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                            <option value='TIEN_MAT'>💵 Tiền mặt</option>
                            <option value='CHUYEN_KHOAN'>🏦 Chuyển khoản</option>
                            <option value='VNPAY'>💻 VNPAY QR</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '12px 14px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>TỔNG CỘNG</span>
                          <span style={{ fontSize: 22, fontWeight: 900, color: '#d97706' }}>{fmtMoney(posTotal)}</span>
                        </div>

                        {posPayment === 'TIEN_MAT' && (
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>Tiền khách đưa (VNĐ)</label>
                            <input type="number" min="0" value={posCashInput === 0 ? '' : posCashInput} onChange={e => setPosCashInput(e.target.value === '' ? '' : Number(e.target.value))} onFocus={e => e.target.select()} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 700 }} />
                            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: posCashInsufficient ? '#ef4444' : '#10b981' }}>
                              {posCashInsufficient ? '⚠️ Tiền khách đưa chưa đủ' : `Tiền thối lại: ${fmtMoney(posChange)}`}
                            </div>
                          </div>
                        )}

                        {posOrderResult && (
                          <div style={{ marginBottom: 16, padding: '16px', borderRadius: 16, background: posOrderResult.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${posOrderResult.success ? '#bbf7d0' : '#fecaca'}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ color: posOrderResult.success ? '#15803d' : '#dc2626', fontWeight: 800, fontSize: 14 }}>
                              {posOrderResult.success ? `✅ Đơn #${posOrderResult.ma_don} tạo thành công! Tổng: ${fmtMoney(posOrderResult.tong)}` : `❌ Lỗi: ${posOrderResult.error}`}
                            </div>
                            
                            {posOrderResult.success && posOrderResult.vnpay_url && (
                              <div style={{ background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px dashed #22c55e' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Quét mã VNPAY để thanh toán</div>
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(posOrderResult.vnpay_url)}`} alt="VNPAY QR" style={{ width: 160, height: 160, margin: '0 auto', display: 'block', borderRadius: 8 }} />
                                <a href={posOrderResult.vnpay_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, padding: '8px 16px', background: '#005baa', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,91,170,0.3)' }}>Mở link VNPAY</a>
                              </div>
                            )}

                            {posOrderResult.success && posOrderResult.payment_details?.qr_img_url && !posOrderResult.vnpay_url && posOrderResult.method !== 'TIEN_MAT' && (
                              <div style={{ background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px dashed #22c55e' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Quét mã QR để thanh toán</div>
                                <img src={posOrderResult.payment_details.qr_img_url} alt="QR Thanh toán" style={{ width: 160, height: 160, margin: '0 auto', display: 'block', borderRadius: 8 }} />
                              </div>
                            )}
                          </div>
                        )}

                        <button onClick={submitPosOrder} disabled={posSubmitting || posCart.length === 0 || posCashInsufficient}
                          style={{ width: '100%', padding: '14px', background: (posCart.length === 0 || posCashInsufficient) ? '#cbd5e1' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: (posCart.length === 0 || posCashInsufficient) ? 'not-allowed' : 'pointer', boxShadow: (!posCart.length || posCashInsufficient) ? 'none' : '0 6px 20px rgba(217,119,6,0.35)' }}>
                          {posSubmitting ? '⏳ Đang tạo đơn...' : '🖥️ Xác nhận tạo đơn'}
                        </button>
                        {posCart.length > 0 && <button onClick={() => setPosCart([])} style={{ width: '100%', marginTop: 8, padding: '9px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 10, color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Xóa giỏ hàng</button>}
                      </div>
                    </div>
                  </div>
                )
              })()}
          {tab === 'chot-ca' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: '#1e293b', letterSpacing: '-0.02em' }}>Chốt ca làm việc</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>Kiểm soát dòng tiền và đối soát doanh thu cuối ngày tại Kiosk.</p>
                </div>
              </div>

              {shiftPreviewLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải dữ liệu ca...</div>
              ) : shiftPreview ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
                  {/* Left: Summary */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>📊 Báo cáo doanh thu Kiosk: {kiosks.find(k => k.id === activeKioskId)?.ten_kiosk || ''}</h3>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12 }}>
                          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Tổng doanh thu (VNĐ)</div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{fmtMoney(shiftPreview.total_revenue || 0)}</div>
                        </div>
                        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12 }}>
                          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Tổng số đơn</div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{shiftPreview.total_orders || 0}</div>
                        </div>
                      </div>

                      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#475569' }}>Chi tiết theo phương thức:</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                          <span style={{ fontWeight: 600, color: '#16a34a' }}>💵 Tiền mặt</span>
                          <span style={{ fontWeight: 800, color: '#15803d' }}>{fmtMoney(shiftPreview.revenue_by_method?.['THANH_TOAN_KHI_NHAN_HANG'] || 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                          <span style={{ fontWeight: 600, color: '#2563eb' }}>🏦 Chuyển khoản</span>
                          <span style={{ fontWeight: 800, color: '#1d4ed8' }}>{fmtMoney(shiftPreview.revenue_by_method?.['NGAN_HANG_QR'] || 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>💻 VNPAY</span>
                          <span style={{ fontWeight: 800, color: '#b91c1c' }}>{fmtMoney(shiftPreview.revenue_by_method?.['VNPAY'] || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Form */}
                  <div style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 20px -4px rgba(0,0,0,0.05)', alignSelf: 'start' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Thực hiện chốt ca</h3>
                    
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Tiền mặt đầu ca (VNĐ)</label>
                      <input type="number" value={cashOpen} onChange={e => setCashOpen(e.target.value)} placeholder="Tiền lẻ mở két..."
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Tiền mặt thực tế đếm được (VNĐ)</label>
                      <input type="number" value={cashClose} onChange={e => setCashClose(e.target.value)} placeholder="Tổng tiền trong két..."
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Ghi chú chốt ca</label>
                      <textarea value={shiftNote} onChange={e => setShiftNote(e.target.value)} placeholder="Nhập ghi chú nếu có (lệch tiền, lý do...)"
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, minHeight: 80, resize: 'vertical', outline: 'none' }} />
                    </div>

                    <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#64748b' }}>Tiền mặt trên hệ thống:</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmtMoney(Number(cashOpen || 0) + Number(shiftPreview.revenue_by_method?.['THANH_TOAN_KHI_NHAN_HANG'] || 0))}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Độ lệch:</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: (Number(cashClose || 0) - (Number(cashOpen || 0) + Number(shiftPreview.revenue_by_method?.['THANH_TOAN_KHI_NHAN_HANG'] || 0))) === 0 ? '#10b981' : '#ef4444' }}>
                          {fmtMoney(Number(cashClose || 0) - (Number(cashOpen || 0) + Number(shiftPreview.revenue_by_method?.['THANH_TOAN_KHI_NHAN_HANG'] || 0)))}
                        </span>
                      </div>
                    </div>

                    <button onClick={submitShiftClose} disabled={shiftSubmitting}
                      style={{ width: '100%', padding: '14px', background: shiftSubmitting ? '#cbd5e1' : '#0f172a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: shiftSubmitting ? 'not-allowed' : 'pointer' }}>
                      {shiftSubmitting ? '⏳ Đang xử lý...' : 'Xác nhận chốt ca'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có dữ liệu chốt ca hôm nay.</div>
              )}
            </>
          )}
            </>
          )}
        </div>
      </main>

      {/* ── TOPPING MODAL ───────────────────────── */}
      {selectedProduct && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }} onClick={() => setSelectedProduct(null)}>
          <div style={{
            background: '#fff', borderRadius: 24, width: '100%', maxWidth: 440, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.2s ease-out'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e293b' }}>{selectedProduct.ten_san_pham || selectedProduct.tenSanPham}</h3>
                <div style={{ fontSize: 14, color: '#d97706', fontWeight: 800, marginTop: 4 }}>{fmtMoney(selectedProduct.gia_ban || selectedProduct.gia)}</div>
              </div>
              <button onClick={() => setSelectedProduct(null)} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontSize: 16, fontWeight: 800, color: '#64748b' }}>×</button>
            </div>
            
            <div style={{ padding: 24, maxHeight: 400, overflowY: 'auto' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thêm Topping</h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(selectedProduct.parsedToppings || {}).map(([tName, tPrice]) => {
                  const isSelected = selectedToppings.find(t => t.name === tName)
                  return (
                    <label key={tName} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '14px 16px', borderRadius: 12, border: `2px solid ${isSelected ? '#f59e0b' : '#e2e8f0'}`, 
                      background: isSelected ? '#fffbeb' : '#fff', cursor: 'pointer', transition: 'all .2s' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ 
                          width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? '#f59e0b' : '#cbd5e1'}`, 
                          background: isSelected ? '#f59e0b' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{tName}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#64748b' }}>+{fmtMoney(tPrice)}</span>
                      <input type="checkbox" style={{ display: 'none' }} checked={!!isSelected} onChange={() => {
                        setSelectedToppings(prev => 
                          isSelected ? prev.filter(t => t.name !== tName) : [...prev, { name: tName, price: tPrice }]
                        )
                      }} />
                    </label>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: 24, borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <button onClick={() => {
                addToCart(selectedProduct, selectedToppings);
                setSelectedProduct(null);
                setTab('pos');
              }} style={{ 
                width: '100%', padding: 16, background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                color: '#fff', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(217, 119, 6, 0.3)'
              }}>
                + Thêm vào giỏ hàng • {fmtMoney((selectedProduct.gia_ban || selectedProduct.gia || 0) + selectedToppings.reduce((s,t)=>s+Number(t.price),0))}
              </button>
            </div>
          </div>
        </div>
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
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}} />
        </div>
      )}
      </div>
    </ErrorBoundary>
  )
}
