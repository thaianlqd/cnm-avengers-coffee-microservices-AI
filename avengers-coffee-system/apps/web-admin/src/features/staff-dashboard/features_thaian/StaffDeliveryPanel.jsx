import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '../../admin-dashboard/constants';
import {
  Truck,
  Bike,
  Navigation,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Package,
  Check,
  X,
  Users,
  UserPlus,
  Edit3,
  RotateCcw,
  Receipt,
  Search,
  Filter,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Key,
  Copy,
  ChevronDown,
  Store,
  CheckCheck,
  XCircle,
} from 'lucide-react';

export default function StaffDeliveryPanel() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'cod' | 'shippers'

  // Orders State
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL'); // 'ALL' | 'DANG_CHUAN_BI' | 'DANG_GIAO'
  const [lalamoveLinks, setLalamoveLinks] = useState({});
  const [assignPickerOrderId, setAssignPickerOrderId] = useState(null);
  const [assigningOrderId, setAssigningOrderId] = useState(null);

  // COD Audit State
  const [codRemits, setCodRemits] = useState([]);
  const [codLoading, setCodLoading] = useState(false);
  const [codStatusFilter, setCodStatusFilter] = useState('PENDING'); // 'PENDING' | 'CONFIRMED' | 'REJECTED' | ''
  const [codConfirming, setCodConfirming] = useState(null);

  // Branch Shippers State
  const [branchShippers, setBranchShippers] = useState([]);
  const [shippersLoading, setShippersLoading] = useState(false);
  const [shipperSearch, setShipperSearch] = useState('');
  const [shipperStatusFilter, setShipperStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'

  // Modals for Shipper Management
  const [editingShipper, setEditingShipper] = useState(null);
  const [resetTargetShipper, setResetTargetShipper] = useState(null);
  const [resetPassInput, setResetPassInput] = useState('123456');
  const [resetResult, setResetResult] = useState(null);
  const [isAddShipperOpen, setIsAddShipperOpen] = useState(false);
  const [newShipperForm, setNewShipperForm] = useState({
    username: '',
    full_name: '',
    phone: '',
    email: '',
    vehicle_type: 'MOTORBIKE',
    vehicle_plate: '',
    password: '123456',
  });
  const [submittingAction, setSubmittingAction] = useState(false);

  // Copy Feedback
  const [copiedKey, setCopiedKey] = useState(false);

  // Helpers to read session info
  const getSession = () => {
    try {
      return JSON.parse(window.localStorage.getItem('adminSession') || '{}');
    } catch {
      return {};
    }
  };

  const getBranchCode = () => {
    const session = getSession();
    return (session?.user?.coSoMa || session?.user?.co_so_ma || 'MAC_DINH_CHI').toUpperCase();
  };

  const getBranchDisplayName = () => {
    const session = getSession();
    return (
      session?.user?.tenCoSo ||
      session?.user?.co_so_ten ||
      session?.user?.branch_name ||
      getBranchCode().replace(/_/g, ' ')
    );
  };

  const getUserRole = () => {
    const session = getSession();
    return String(session?.user?.vai_tro || session?.user?.vaiTro || session?.user?.role || '').toUpperCase();
  };

  const isManager = () => {
    const r = getUserRole();
    return r.includes('MANAGER') || r.includes('ADMIN') || r === 'QUAN_LY' || r === 'CHU_QUAN';
  };

  const getAuthHeaders = () => {
    const session = getSession();
    const token = session?.accessToken || session?.token || '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // --- FETCH DATA ---
  const fetchDeliveries = async () => {
    try {
      const branchCode = getBranchCode();
      const res = await fetch(`${API_BASE_URL}/staff/orders?branch_code=${encodeURIComponent(branchCode)}`);
      const data = await res.json();
      const allOrders = data.orders || data.items || data.data || [];

      const deliveryOrders = allOrders.filter((o) => {
        const s = String(o.trang_thai_don_hang || '').trim().toUpperCase();
        return s === 'DANG_CHUAN_BI' || s === 'DANG_GIAO';
      });

      setDeliveries(deliveryOrders);
    } catch (err) {
      console.error('[fetchDeliveries] Lỗi:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCodRemits = async () => {
    setCodLoading(true);
    try {
      const branchCode = getBranchCode();
      const query = `${API_BASE_URL}/shippers/cod-remits?branch_code=${encodeURIComponent(branchCode)}${
        codStatusFilter ? `&status=${codStatusFilter}` : ''
      }`;
      const res = await fetch(query);
      const data = await res.json();
      setCodRemits(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch (err) {
      console.error('[fetchCodRemits] Lỗi:', err);
    } finally {
      setCodLoading(false);
    }
  };

  const fetchBranchShippers = async () => {
    setShippersLoading(true);
    try {
      const branchCode = getBranchCode();
      const res = await fetch(`${API_BASE_URL}/shippers?branch_code=${encodeURIComponent(branchCode)}`);
      const data = await res.json();
      setBranchShippers(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch (err) {
      console.error('[fetchBranchShippers] Lỗi:', err);
    } finally {
      setShippersLoading(false);
    }
  };

  // Sync on tab change
  useEffect(() => {
    if (activeTab === 'shippers' && !isManager()) {
      setActiveTab('orders');
      return;
    }

    if (activeTab === 'orders') {
      fetchDeliveries();
      fetchBranchShippers();
      const intv = setInterval(fetchDeliveries, 15000);
      return () => clearInterval(intv);
    } else if (activeTab === 'cod') {
      fetchCodRemits();
    } else if (activeTab === 'shippers') {
      fetchBranchShippers();
    }
  }, [activeTab, codStatusFilter]);

  // --- ACTIONS: ORDERS ---
  const handleAssignInternal = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/shippers/orders/${orderId}/mark-ready`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `Lỗi ${res.status}`);

      alert(`Đã chuyển đơn #${orderId.slice(0, 8).toUpperCase()} sang trạng thái "Đang Giao" để shipper tự nhận.`);
      fetchDeliveries();
    } catch (err) {
      alert(`Lỗi khi chuyển đơn: ${err.message}`);
    }
  };

  const handleAssignToShipper = async (orderId, shipperId) => {
    const shipperObj = branchShippers.find((s) => s.id === shipperId);
    const shipperName = shipperObj?.full_name || shipperObj?.username || 'tài xế';
    if (!window.confirm(`Xác nhận phân công đơn #${orderId.slice(0, 8).toUpperCase()} cho tài xế ${shipperName}?`)) {
      return;
    }

    setAssigningOrderId(orderId);
    try {
      const session = getSession();
      const managerId = session?.user?.id || 'staff';

      const res = await fetch(`${API_BASE_URL}/shippers/assign-order`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ma_don_hang: orderId,
          shipper_id: shipperId,
          manager_id: managerId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `Lỗi ${res.status}`);

      alert(`Đã giao đơn cho tài xế ${shipperName} thành công!`);
      setAssignPickerOrderId(null);
      fetchDeliveries();
    } catch (err) {
      alert(`Lỗi khi chỉ định: ${err.message}`);
    } finally {
      setAssigningOrderId(null);
    }
  };

  const getCoordinatesFromAddress = async (addressStr) => {
    try {
      const parts = addressStr.split(',').map((p) => p.trim());
      for (let i = 0; i < parts.length; i++) {
        const query = parts.slice(i).join(', ');
        if (!query || query.length < 3) continue;

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
          { headers: { 'User-Agent': 'AvengersCoffee/1.0' } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          return { lat: data[0].lat, lng: data[0].lon };
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    } catch (err) {
      console.warn('Geocoding error:', err);
    }
    return null;
  };

  const handleCallLalamove = async (order) => {
    try {
      alert(`Đang lấy báo giá và kết nối dịch vụ Lalamove cho đơn #${order.ma_don_hang.slice(0, 8).toUpperCase()}...`);

      const trackingRes = await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${order.ma_don_hang}`);

      let pickupAddressStr = '220 Điện Biên Phủ, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh';
      let pickupLat = '10.787612';
      let pickupLng = '106.697410';

      try {
        const branchRes = await fetch(`${API_BASE_URL}/users/branches/public`);
        const branchData = await branchRes.json();
        const branches = branchData.data || branchData.items || [];
        const bCode = getBranchCode();
        const currentBranch = branches.find(
          (b) =>
            b.ma_chi_nhanh?.toUpperCase() === bCode ||
            b.ma_co_so?.toUpperCase() === bCode ||
            b.id === bCode
        );
        if (currentBranch) {
          if (currentBranch.dia_chi) pickupAddressStr = currentBranch.dia_chi;
          if (currentBranch.vi_do && currentBranch.kinh_do) {
            pickupLat = currentBranch.vi_do.toString();
            pickupLng = currentBranch.kinh_do.toString();
          }
        }
      } catch (err) {
        console.warn('Failed to fetch branch coords:', err);
      }

      const deliveryAddressStr = order.dia_chi_giao_hang || 'TP. Hồ Chí Minh';
      let deliveryLat = '10.782000';
      let deliveryLng = '106.700000';

      if (trackingRes.ok) {
        const trackingData = await trackingRes.json();
        if (trackingData?.delivery_lat && trackingData?.delivery_lng) {
          deliveryLat = trackingData.delivery_lat.toString();
          deliveryLng = trackingData.delivery_lng.toString();
        }
      }

      const pickupCoords = await getCoordinatesFromAddress(pickupAddressStr);
      if (pickupCoords) {
        pickupLat = pickupCoords.lat.toString();
        pickupLng = pickupCoords.lng.toString();
      }

      const quoteRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_address: pickupAddressStr,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          delivery_address: deliveryAddressStr,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
        }),
      });

      const quoteData = await quoteRes.json().catch(() => ({}));
      if (!quoteRes.ok) {
        throw new Error(quoteData?.message || 'Không lấy được báo giá Lalamove');
      }

      const quotationId = quoteData.quotationId;
      const amount = quoteData.priceBreakdown?.total || '30000';

      const orderRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_don_hang: order.ma_don_hang,
          quotation_id: quotationId,
          recipient_name: order.ten_khach_hang || 'Khách Hàng',
          recipient_phone: order.so_dien_thoai || '0901234567',
          remarks: `Đơn #${order.ma_don_hang.slice(0, 8).toUpperCase()} - Cà phê đồ uống`,
          sender_name: 'Avengers Coffee',
          sender_phone: '19001234',
        }),
      });

      const llmData = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok) {
        throw new Error(llmData?.message || 'Không tạo được đơn Lalamove');
      }

      const llmOrder = llmData.order || llmData;
      if (llmOrder?.shareLink) {
        setLalamoveLinks((prev) => ({
          ...prev,
          [order.ma_don_hang]: llmOrder.shareLink,
        }));
      }

      alert(`Đã gọi Lalamove thành công!\nMã đơn Lalamove: ${llmOrder.orderRef || llmOrder.orderId}`);
    } catch (err) {
      alert(`Lỗi khi gọi Lalamove: ${err.message}`);
    }
  };

  // --- ACTIONS: COD AUDIT ---
  const handleConfirmCod = async (remitId, status) => {
    const actionText = status === 'CONFIRMED' ? 'Xác nhận đã nhận đủ tiền' : 'Từ chối phiếu nộp';
    if (!window.confirm(`Bạn có chắc chắn muốn "${actionText}" cho phiếu thu hộ này không?`)) return;

    setCodConfirming(remitId + status);
    try {
      const session = getSession();
      const res = await fetch(`${API_BASE_URL}/shippers/cod-remits/${remitId}/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: status,
          confirmed_by: session?.user?.id || 'manager',
        }),
      });

      if (res.ok) {
        fetchCodRemits();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.message || 'Lỗi khi xử lý phiếu COD');
      }
    } catch (e) {
      alert(`Lỗi: ${e.message}`);
    } finally {
      setCodConfirming(null);
    }
  };

  // --- ACTIONS: SHIPPER MANAGEMENT (BY MANAGER) ---
  const handleOpenEditShipper = (shipper) => {
    setEditingShipper({
      id: shipper.id,
      username: shipper.username,
      full_name: shipper.full_name || '',
      phone: shipper.phone || '',
      email: shipper.email || '',
      vehicle_type: shipper.vehicle_type || 'MOTORBIKE',
      vehicle_plate: shipper.vehicle_plate || '',
      status: shipper.status || 'ACTIVE',
      new_password: '',
    });
  };

  const handleSaveEditShipper = async (e) => {
    e.preventDefault();
    if (!editingShipper) return;
    setSubmittingAction(true);

    try {
      const payload = {
        full_name: editingShipper.full_name.trim(),
        phone: editingShipper.phone.trim(),
        email: editingShipper.email.trim() || null,
        vehicle_type: editingShipper.vehicle_type,
        vehicle_plate: editingShipper.vehicle_plate.trim(),
        status: editingShipper.status,
      };

      if (editingShipper.new_password && editingShipper.new_password.trim()) {
        payload.password = editingShipper.new_password.trim();
      }

      const res = await fetch(`${API_BASE_URL}/shippers/${editingShipper.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Không thể cập nhật tài xế');

      alert(`Đã cập nhật thông tin tài xế "${editingShipper.full_name}" thành công!`);
      setEditingShipper(null);
      fetchBranchShippers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenResetAccount = (shipper) => {
    setResetTargetShipper(shipper);
    setResetPassInput('123456');
  };

  const handleConfirmResetAccount = async () => {
    if (!resetTargetShipper) return;
    setSubmittingAction(true);

    try {
      const res = await fetch(`${API_BASE_URL}/shippers/${resetTargetShipper.id}/reset-account`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password: resetPassInput.trim() || '123456' }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Lỗi khi reset tài khoản');

      setResetResult({
        username: resetTargetShipper.username,
        full_name: resetTargetShipper.full_name,
        password: data.default_password || resetPassInput.trim() || '123456',
        message: data.message,
      });

      setResetTargetShipper(null);
      fetchBranchShippers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCreateNewShipper = async (e) => {
    e.preventDefault();
    setSubmittingAction(true);

    try {
      const branchCode = getBranchCode();
      const payload = {
        username: newShipperForm.username.trim(),
        full_name: newShipperForm.full_name.trim(),
        phone: newShipperForm.phone.trim(),
        email: newShipperForm.email.trim() || null,
        vehicle_type: newShipperForm.vehicle_type,
        vehicle_plate: newShipperForm.vehicle_plate.trim(),
        branch_code: branchCode,
        status: 'ACTIVE',
        password: newShipperForm.password.trim() || '123456',
      };

      if (!payload.username || !payload.full_name || !payload.phone) {
        alert('Vui lòng điền đầy đủ Tên đăng nhập, Họ và tên, và Số điện thoại');
        setSubmittingAction(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/shippers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Không thể tạo tài xế');

      alert(`Đã thêm mới tài xế "${payload.full_name}" (@${payload.username}) vào cơ sở thành công!`);
      setIsAddShipperOpen(false);
      setNewShipperForm({
        username: '',
        full_name: '',
        phone: '',
        email: '',
        vehicle_type: 'MOTORBIKE',
        vehicle_plate: '',
        password: '123456',
      });
      fetchBranchShippers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  // --- FILTERED DATA CALCULATIONS ---
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((order) => {
      // Status filter
      if (orderStatusFilter !== 'ALL') {
        const s = String(order.trang_thai_don_hang || '').trim().toUpperCase();
        if (s !== orderStatusFilter) return false;
      }
      // Search filter
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const code = String(order.ma_don_hang || '').toLowerCase();
        const customer = String(order.ten_khach_hang || order.ma_nguoi_dung || '').toLowerCase();
        const address = String(order.dia_chi_giao_hang || '').toLowerCase();
        return code.includes(q) || customer.includes(q) || address.includes(q);
      }
      return true;
    });
  }, [deliveries, orderStatusFilter, orderSearch]);

  const ordersPreparingCount = useMemo(() => {
    return deliveries.filter((d) => String(d.trang_thai_don_hang).toUpperCase() === 'DANG_CHUAN_BI').length;
  }, [deliveries]);

  const ordersDeliveringCount = useMemo(() => {
    return deliveries.filter((d) => String(d.trang_thai_don_hang).toUpperCase() === 'DANG_GIAO').length;
  }, [deliveries]);

  const totalCodInTransit = useMemo(() => {
    return deliveries.reduce((sum, d) => sum + Number(d.tong_tien || 0), 0);
  }, [deliveries]);

  const pendingCodCount = useMemo(() => {
    return codRemits.filter((r) => r.status === 'PENDING').length;
  }, [codRemits]);

  const totalCodPendingAmount = useMemo(() => {
    return codRemits
      .filter((r) => r.status === 'PENDING')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [codRemits]);

  const totalCodConfirmedToday = useMemo(() => {
    return codRemits
      .filter((r) => r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [codRemits]);

  const filteredShippers = useMemo(() => {
    return branchShippers.filter((s) => {
      if (shipperStatusFilter !== 'ALL') {
        if (s.status !== shipperStatusFilter) return false;
      }
      if (shipperSearch.trim()) {
        const q = shipperSearch.toLowerCase();
        const name = String(s.full_name || '').toLowerCase();
        const username = String(s.username || '').toLowerCase();
        const phone = String(s.phone || '').toLowerCase();
        return name.includes(q) || username.includes(q) || phone.includes(q);
      }
      return true;
    });
  }, [branchShippers, shipperStatusFilter, shipperSearch]);

  const activeShippersCount = useMemo(() => {
    return branchShippers.filter((s) => s.status === 'ACTIVE').length;
  }, [branchShippers]);

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem 1.5rem', backgroundColor: '#F8FAFC', minHeight: '100vh' }}>

      {/* ─── HEADER CHÍNH ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: '1.25rem 1.5rem',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={22} color="#4F46E5" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.02em' }}>
                Quản lý Giao Hàng & Đội Ngũ Tài Xế
              </h1>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Store size={14} color="#64748B" />
                Cơ sở: <strong style={{ color: '#1E293B' }}>{getBranchDisplayName()}</strong>
                <span style={{ color: '#CBD5E1' }}>•</span>
                Mã: <code style={{ backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', color: '#4F46E5', fontWeight: '600' }}>{getBranchCode()}</code>
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {activeTab === 'shippers' && isManager() && (
            <button
              type="button"
              onClick={() => setIsAddShipperOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                height: '38px',
                padding: '0 1.1rem',
                borderRadius: '10px',
                backgroundColor: '#16A34A',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#15803D')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#16A34A')}
            >
              <UserPlus size={16} /> Thêm tài xế mới
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'orders') fetchDeliveries();
              else if (activeTab === 'cod') fetchCodRemits();
              else fetchBranchShippers();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              height: '38px',
              padding: '0 0.95rem',
              borderRadius: '10px',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
          >
            <RefreshCw size={15} color="#64748B" /> Làm mới
          </button>
        </div>
      </div>

      {/* ─── THANH ĐIỀU HƯỚNG TABS (SEGMENTED PILL HIỆN ĐẠI) ────────────────── */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        backgroundColor: '#E2E8F0',
        padding: '0.35rem',
        borderRadius: '14px',
        width: 'fit-content'
      }}>
        {/* Tab 1: Đơn Đang Giao */}
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 1.15rem',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: activeTab === 'orders' ? '700' : '600',
            cursor: 'pointer',
            backgroundColor: activeTab === 'orders' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'orders' ? '#4F46E5' : '#475569',
            boxShadow: activeTab === 'orders' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Package size={17} color={activeTab === 'orders' ? '#4F46E5' : '#64748B'} />
          Đơn Đang Giao
          {deliveries.length > 0 && (
            <span style={{
              backgroundColor: activeTab === 'orders' ? '#EEF2FF' : '#CBD5E1',
              color: activeTab === 'orders' ? '#4F46E5' : '#334155',
              padding: '0.1rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: '800'
            }}>
              {deliveries.length}
            </span>
          )}
        </button>

        {/* Tab 2: Đối Soát COD */}
        <button
          type="button"
          onClick={() => setActiveTab('cod')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 1.15rem',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: activeTab === 'cod' ? '700' : '600',
            cursor: 'pointer',
            backgroundColor: activeTab === 'cod' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'cod' ? '#4F46E5' : '#475569',
            boxShadow: activeTab === 'cod' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Receipt size={17} color={activeTab === 'cod' ? '#4F46E5' : '#64748B'} />
          Đối Soát Tiền Thu Hộ COD
          {pendingCodCount > 0 && (
            <span style={{
              backgroundColor: '#FEF3C7',
              color: '#B45309',
              padding: '0.1rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: '800',
              border: '1px solid #FDE68A'
            }}>
              {pendingCodCount} chờ duyệt
            </span>
          )}
        </button>

        {/* Tab 3: Tài Xế Cơ Sở (CHỈ DÀNH RIÊNG CHO QUẢN LÝ / MANAGER) */}
        {isManager() && (
          <button
            type="button"
            onClick={() => setActiveTab('shippers')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.15rem',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.86rem',
              fontWeight: activeTab === 'shippers' ? '700' : '600',
              cursor: 'pointer',
              backgroundColor: activeTab === 'shippers' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'shippers' ? '#4F46E5' : '#475569',
              boxShadow: activeTab === 'shippers' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Bike size={17} color={activeTab === 'shippers' ? '#4F46E5' : '#64748B'} />
            Đội Ngũ Tài Xế Cơ Sở
            {branchShippers.length > 0 && (
              <span style={{
                backgroundColor: activeTab === 'shippers' ? '#EEF2FF' : '#CBD5E1',
                color: activeTab === 'shippers' ? '#4F46E5' : '#334155',
                padding: '0.1rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {branchShippers.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── TAB 1: ĐƠN ĐANG GIAO (ORDERS IN TRANSIT) ─────────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Thẻ Thống Kê Nhanh (KPIs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={24} color="#D97706" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Đang Chuẩn Bị</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0F172A' }}>{ordersPreparingCount} đơn</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bike size={24} color="#0284C7" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Đang Giao Hàng</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0F172A' }}>{ordersDeliveringCount} đơn</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={24} color="#16A34A" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Tổng Thu Hộ COD</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#16A34A' }}>{totalCodInTransit.toLocaleString()} đ</div>
              </div>
            </div>
          </div>

          {/* Bộ lọc và Tìm kiếm */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              {[
                { id: 'ALL', label: 'Tất cả đơn' },
                { id: 'DANG_CHUAN_BI', label: 'Đang chuẩn bị' },
                { id: 'DANG_GIAO', label: 'Đang giao' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(tab.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: orderStatusFilter === tab.id ? '#4F46E5' : '#FFFFFF',
                    color: orderStatusFilter === tab.id ? '#FFFFFF' : '#475569',
                    borderColor: orderStatusFilter === tab.id ? '#4F46E5' : '#E2E8F0',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Tìm mã đơn, tên khách, địa chỉ..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  paddingLeft: '32px',
                  paddingRight: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.78rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Danh sách Đơn Hàng */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '26px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} color="#16A34A" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#1E293B' }}>
                Không có đơn hàng nào cần điều phối
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                Tất cả đơn hàng giao tận nơi tại cơ sở đã được xử lý hoặc chưa phát sinh đơn mới.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {filteredDeliveries.map((order) => {
                const isDelivering = String(order.trang_thai_don_hang || '').toUpperCase() === 'DANG_GIAO';
                const isLalamove = order.phuong_thuc_giao_hang === 'LALAMOVE';

                return (
                  <div
                    key={order.ma_don_hang}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '1.15rem 1.35rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 1fr 1fr',
                      gap: '1.25rem',
                      alignItems: 'center',
                    }}
                  >
                    {/* Cột 1: Thông tin Đơn hàng & Khách hàng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <strong style={{ fontSize: '0.92rem', color: '#4F46E5', fontWeight: '800', letterSpacing: '0.5px' }}>
                          #{order.ma_don_hang.slice(0, 8).toUpperCase()}
                        </strong>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: isLalamove ? '#FFF7ED' : '#EEF2FF',
                          color: isLalamove ? '#C2410C' : '#4338CA',
                          border: `1px solid ${isLalamove ? '#FFEDD5' : '#C7D2FE'}`,
                        }}>
                          {isLalamove ? 'Dịch vụ Lalamove' : 'Shipper Nội Bộ'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: '#0F172A', fontWeight: '700' }}>
                        Khách: {order.ten_khach_hang || order.ma_nguoi_dung || 'Khách Hàng'}
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
                        <MapPin size={14} color="#64748B" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{order.dia_chi_giao_hang || 'Tại quán'}</span>
                      </div>
                    </div>

                    {/* Cột 2: Tiền COD & Trạng Thái Đơn */}
                    <div style={{ borderLeft: '1px solid #F1F5F9', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>TIỀN THU HỘ COD</span>
                      <span style={{ fontSize: '1.05rem', color: '#0F172A', fontWeight: '800' }}>
                        {Number(order.tong_tien || 0).toLocaleString()} đ
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        width: 'fit-content',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        backgroundColor: isDelivering ? '#E0F2FE' : '#FEF3C7',
                        color: isDelivering ? '#0369A1' : '#B45309',
                        border: `1px solid ${isDelivering ? '#BAE6FD' : '#FDE68A'}`,
                      }}>
                        {isDelivering ? <Bike size={12} /> : <Clock size={12} />}
                        {isDelivering ? 'Đang giao hàng' : 'Đang chuẩn bị'}
                      </span>
                    </div>

                    {/* Cột 3: Nút Hành Động Điều Phối */}
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {lalamoveLinks[order.ma_don_hang] ? (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span style={{
                            backgroundColor: '#ECFDF5',
                            color: '#059669',
                            border: '1px solid #A7F3D0',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}>
                            <CheckCircle2 size={14} /> Đã gọi Lalamove
                          </span>
                          <a
                            href={lalamoveLinks[order.ma_don_hang]}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              height: '34px',
                              padding: '0 0.75rem',
                              borderRadius: '8px',
                              backgroundColor: '#FFFFFF',
                              color: '#2563EB',
                              border: '1px solid #BFDBFE',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <ExternalLink size={14} /> Theo dõi
                          </a>
                        </div>
                      ) : (
                        <>
                          {assignPickerOrderId === order.ma_don_hang ? (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.45rem',
                              minWidth: '240px',
                              backgroundColor: '#F8FAFC',
                              padding: '0.65rem',
                              borderRadius: '10px',
                              border: '1px solid #CBD5E1',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <Bike size={14} /> Chọn tài xế cơ sở
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setAssignPickerOrderId(null)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                                >
                                  <X size={14} color="#64748B" />
                                </button>
                              </div>

                              {branchShippers.filter((s) => s.status === 'ACTIVE').length === 0 ? (
                                <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: '600', padding: '0.35rem 0' }}>
                                  Hiện không có tài xế nào đang online
                                </span>
                              ) : (
                                branchShippers
                                  .filter((s) => s.status === 'ACTIVE')
                                  .map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      disabled={assigningOrderId === order.ma_don_hang}
                                      onClick={() => handleAssignToShipper(order.ma_don_hang, s.id)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.55rem',
                                        padding: '0.45rem 0.65rem',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        backgroundColor: '#FFFFFF',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s',
                                        opacity: assigningOrderId === order.ma_don_hang ? 0.6 : 1,
                                      }}
                                    >
                                      <div style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Bike size={14} color="#4F46E5" />
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {s.full_name}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                          {s.phone || s.vehicle_plate || `@${s.username}`}
                                        </div>
                                      </div>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A', flexShrink: 0 }} />
                                    </button>
                                  ))
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setAssignPickerOrderId(null);
                                  handleAssignInternal(order.ma_don_hang);
                                }}
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#64748B',
                                  background: '#FFFFFF',
                                  border: '1px dashed #CBD5E1',
                                  borderRadius: '6px',
                                  padding: '0.4rem 0.5rem',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  fontWeight: '600',
                                }}
                              >
                                Đưa vào kho để shipper tự nhận
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAssignPickerOrderId(order.ma_don_hang)}
                              style={{
                                height: '36px',
                                padding: '0 0.85rem',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                backgroundColor: '#4F46E5',
                                color: '#FFFFFF',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 1px 3px rgba(79, 70, 229, 0.2)',
                              }}
                            >
                              <Bike size={15} /> Chỉ định tài xế
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCallLalamove(order)}
                            style={{
                              height: '36px',
                              padding: '0 0.85rem',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              backgroundColor: '#EA580C',
                              color: '#FFFFFF',
                              border: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 1px 3px rgba(234, 88, 12, 0.2)',
                            }}
                          >
                            <Navigation size={15} /> Gọi Lalamove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── TAB 2: ĐỐI SOÁT COD (COD REMITTANCE AUDIT) ─────────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'cod' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Thẻ Thống Kê COD (KPIs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={24} color="#D97706" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Chờ Quản Lý Duyệt</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#D97706' }}>
                  {totalCodPendingAmount.toLocaleString()} đ
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{pendingCodCount} phiếu nộp</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={24} color="#16A34A" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Đã Xác Nhận Đủ</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#16A34A' }}>
                  {totalCodConfirmedToday.toLocaleString()} đ
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Đã nộp vào quỹ cơ sở</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={24} color="#4F46E5" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Tổng Số Phiếu Ghi Nhận</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0F172A' }}>
                  {codRemits.length} phiếu
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Theo lịch sử đối soát</span>
              </div>
            </div>
          </div>

          {/* Bộ lọc trạng thái nộp COD (Không dùng icon emoji) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {[
                { id: 'PENDING', label: 'Chờ duyệt', icon: Clock, count: pendingCodCount },
                { id: 'CONFIRMED', label: 'Đã nhận tiền', icon: CheckCircle2 },
                { id: 'REJECTED', label: 'Từ chối', icon: XCircle },
                { id: '', label: 'Tất cả phiếu' },
              ].map((filter) => {
                const IconComponent = filter.icon;
                const isSelected = codStatusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setCodStatusFilter(filter.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.9rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: '1px solid',
                      backgroundColor: isSelected ? '#1E40AF' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : '#475569',
                      borderColor: isSelected ? '#1E40AF' : '#E2E8F0',
                      transition: 'all 0.15s',
                    }}
                  >
                    {IconComponent && <IconComponent size={14} />}
                    {filter.label}
                    {filter.count > 0 && (
                      <span style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#FEF3C7',
                        color: isSelected ? '#FFFFFF' : '#B45309',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                      }}>
                        {filter.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bảng Danh Sách Phiếu Nộp COD */}
          {codLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', backgroundColor: '#FFFFFF', borderRadius: '14px' }}>
              Đang tải danh sách phiếu đối soát...
            </div>
          ) : codRemits.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '3rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <CheckCircle2 size={36} color="#CBD5E1" />
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: '700', color: '#334155' }}>
                Không có phiếu nộp COD nào trong mục này
              </p>
              <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                Khi shipper hoàn thành các đơn hàng thu hộ tiền mặt và bấm nộp tiền tại quán, phiếu sẽ xuất hiện ở đây.
              </span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Thời Gian Nộp</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Tài Xế Nộp Tiền</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Số Tiền Thu Hộ</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Ghi Chú Đính Kèm</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Trạng Thái Duyệt</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '0.78rem' }}>Thao Tác Quản Lý</th>
                  </tr>
                </thead>
                <tbody>
                  {codRemits.map((r, i) => {
                    const isPending = r.status === 'PENDING';
                    const isConfirmed = r.status === 'CONFIRMED';
                    return (
                      <tr
                        key={r.id || i}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          backgroundColor: isPending ? '#FFFBEB' : '#FFFFFF',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '0.85rem 1rem', color: '#64748B', fontSize: '0.78rem' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0F172A' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Bike size={15} color="#4F46E5" />
                            <span>{r.shipper_name || r.shipper_id?.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '800', color: '#16A34A', fontSize: '0.98rem' }}>
                          {Number(r.amount || 0).toLocaleString()} đ
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748B', fontSize: '0.78rem', maxWidth: '180px' }}>
                          {r.note || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.2rem 0.65rem',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            backgroundColor: isPending ? '#FEF3C7' : isConfirmed ? '#DCFCE7' : '#FEE2E2',
                            color: isPending ? '#B45309' : isConfirmed ? '#15803D' : '#DC2626',
                            border: `1px solid ${isPending ? '#FDE68A' : isConfirmed ? '#86EFAC' : '#FECACA'}`,
                          }}>
                            {isPending ? <Clock size={12} /> : isConfirmed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {isPending ? 'Chờ xác nhận' : isConfirmed ? 'Đã nhận tiền' : 'Đã từ chối'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleConfirmCod(r.id, 'CONFIRMED')}
                                disabled={codConfirming === r.id + 'CONFIRMED'}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.4rem 0.75rem',
                                  borderRadius: '8px',
                                  fontSize: '0.76rem',
                                  fontWeight: '700',
                                  backgroundColor: '#16A34A',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'CONFIRMED' ? 0.6 : 1,
                                }}
                              >
                                <Check size={13} /> Xác nhận đã thu
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmCod(r.id, 'REJECTED')}
                                disabled={codConfirming === r.id + 'REJECTED'}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.4rem 0.75rem',
                                  borderRadius: '8px',
                                  fontSize: '0.76rem',
                                  fontWeight: '700',
                                  backgroundColor: '#FFFFFF',
                                  color: '#DC2626',
                                  border: '1.5px solid #FECACA',
                                  cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'REJECTED' ? 0.6 : 1,
                                }}
                              >
                                <X size={13} /> Từ chối
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: '600' }}>
                              {isConfirmed ? 'Hoàn tất đối soát' : 'Đã hủy phiếu'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── TAB 3: TÀI XẾ CƠ SỞ (BRANCH SHIPPERS MANAGEMENT - DÀNH CHO QUẢN LÝ) ─── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'shippers' && isManager() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Thẻ Thống Kê Tài Xế (KPIs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={24} color="#4F46E5" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Tổng Đội Ngũ Tài Xế</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0F172A' }}>{branchShippers.length} tài xế</div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Phân quyền trực thuộc cơ sở</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bike size={24} color="#16A34A" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Sẵn Sàng Nhận Đơn</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#16A34A' }}>{activeShippersCount} tài xế</div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Đang trực tuyến trên ứng dụng</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', padding: '1.15rem 1.25rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={24} color="#64748B" />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Ngoại Tuyến / Tạm Nghỉ</span>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#64748B' }}>
                  {branchShippers.length - activeShippersCount} tài xế
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Chưa mở ứng dụng</span>
              </div>
            </div>
          </div>

          {/* Thanh công cụ tìm kiếm và lọc */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {[
                { id: 'ALL', label: 'Tất cả tài xế' },
                { id: 'ACTIVE', label: 'Đang hoạt động' },
                { id: 'INACTIVE', label: 'Tạm ngưng' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setShipperStatusFilter(tab.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    backgroundColor: shipperStatusFilter === tab.id ? '#4F46E5' : '#FFFFFF',
                    color: shipperStatusFilter === tab.id ? '#FFFFFF' : '#475569',
                    borderColor: shipperStatusFilter === tab.id ? '#4F46E5' : '#E2E8F0',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Tìm tên, tài khoản, số điện thoại..."
                value={shipperSearch}
                onChange={(e) => setShipperSearch(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  paddingLeft: '32px',
                  paddingRight: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.78rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Lưới Danh Sách Thẻ Tài Xế */}
          {shippersLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px' }} />
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px' }} />
            </div>
          ) : filteredShippers.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.6rem',
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '28px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bike size={28} color="#94A3B8" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#1E293B' }}>
                Không tìm thấy tài xế nào
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', maxWidth: '420px', lineHeight: 1.5 }}>
                Chưa có nhân viên giao hàng nào khớp với điều kiện tìm kiếm. Quản lý có thể thêm mới tài xế bằng nút "Thêm tài xế mới" phía trên.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {filteredShippers.map((s) => {
                const isActive = s.status === 'ACTIVE';
                const vehicleName =
                  s.vehicle_type === 'CAR'
                    ? 'Ô tô'
                    : s.vehicle_type === 'ELECTRIC_BIKE'
                    ? 'Xe máy điện'
                    : 'Xe máy';

                return (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '1.25rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      position: 'relative',
                    }}
                  >
                    {/* Header Thẻ: Avatar, Tên & Trạng Thái */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '22px',
                            backgroundColor: '#EEF2FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <Bike size={22} color="#4F46E5" />
                          </div>
                          <span style={{
                            position: 'absolute',
                            bottom: '0',
                            right: '0',
                            width: '12px',
                            height: '12px',
                            borderRadius: '6px',
                            backgroundColor: isActive ? '#16A34A' : '#94A3B8',
                            border: '2px solid #FFFFFF',
                          }} />
                        </div>

                        <div>
                          <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0F172A' }}>
                            {s.full_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span>@{s.username}</span>
                            <span>•</span>
                            <span style={{ color: '#D97706', fontWeight: '700' }}>★ {Number(s.rating || 4.8).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      <span style={{
                        padding: '0.2rem 0.65rem',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        backgroundColor: isActive ? '#DCFCE7' : '#F1F5F9',
                        color: isActive ? '#15803D' : '#64748B',
                        border: `1px solid ${isActive ? '#86EFAC' : '#E2E8F0'}`,
                      }}>
                        {isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
                      </span>
                    </div>

                    {/* Chi Tiết Phương Tiện & Liên Hệ */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                      fontSize: '0.8rem',
                      backgroundColor: '#F8FAFC',
                      padding: '0.75rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid #F1F5F9',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Phone size={13} color="#64748B" /> Số điện thoại:
                        </span>
                        <strong style={{ color: '#0F172A' }}>{s.phone || 'Chưa cập nhật'}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Truck size={13} color="#64748B" /> Phương tiện:
                        </span>
                        <span style={{ fontWeight: '700', color: '#334155' }}>
                          {vehicleName} ({s.vehicle_plate || 'Chưa có biển số'})
                        </span>
                      </div>

                      {s.email && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#64748B' }}>Email:</span>
                          <span style={{ color: '#475569' }}>{s.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Bộ Nút Quản Lý Cho Manager */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '0.75rem',
                      marginTop: 'auto',
                    }}>
                      {/* Nút Cập Nhật Thông Tin */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditShipper(s)}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: '#EEF2FF',
                          color: '#4F46E5',
                          border: '1px solid #C7D2FE',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E0E7FF')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EEF2FF')}
                      >
                        <Edit3 size={14} /> Sửa thông tin
                      </button>

                      {/* Nút Reset Tài Khoản */}
                      <button
                        type="button"
                        onClick={() => handleOpenResetAccount(s)}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: '#FEF2F2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEE2E2')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                      >
                        <RotateCcw size={14} /> Reset tài khoản
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── MODAL 1: CẬP NHẬT THÔNG TIN TÀI XẾ ───────────────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {editingShipper && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0F172A' }}>
                  Cập Nhật Thông Tin Tài Xế
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Tài khoản: @{editingShipper.username}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingShipper(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#64748B" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditShipper} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Họ và tên tài xế *
                </label>
                <input
                  type="text"
                  required
                  value={editingShipper.full_name}
                  onChange={(e) => setEditingShipper({ ...editingShipper, full_name: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Số điện thoại *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editingShipper.phone}
                    onChange={(e) => setEditingShipper({ ...editingShipper, phone: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={editingShipper.email}
                    onChange={(e) => setEditingShipper({ ...editingShipper, email: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Loại phương tiện
                  </label>
                  <select
                    value={editingShipper.vehicle_type}
                    onChange={(e) => setEditingShipper({ ...editingShipper, vehicle_type: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MOTORBIKE">Xe máy</option>
                    <option value="ELECTRIC_BIKE">Xe máy điện</option>
                    <option value="CAR">Ô tô</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Biển số xe
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 59X1-12345"
                    value={editingShipper.vehicle_plate}
                    onChange={(e) => setEditingShipper({ ...editingShipper, vehicle_plate: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Trạng thái hoạt động
                </label>
                <select
                  value={editingShipper.status}
                  onChange={(e) => setEditingShipper({ ...editingShipper, status: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                >
                  <option value="ACTIVE">Đang hoạt động (Cho phép nhận đơn)</option>
                  <option value="INACTIVE">Tạm ngưng (Không nhận đơn)</option>
                  <option value="ON_BREAK">Đang nghỉ</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Đổi mật khẩu mới (Để trống nếu không đổi)
                </label>
                <input
                  type="text"
                  placeholder="Nhập mật khẩu mới nếu cần đổi"
                  value={editingShipper.new_password}
                  onChange={(e) => setEditingShipper({ ...editingShipper, new_password: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingShipper(null)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                    opacity: submittingAction ? 0.6 : 1,
                  }}
                >
                  {submittingAction ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── MODAL 2: RESET TÀI KHOẢN TÀI XẾ ──────────────────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {resetTargetShipper && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={24} color="#DC2626" />
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0F172A' }}>
                  Xác Nhận Reset Tài Khoản
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>
                  Hành động này sẽ thiết lập lại mật khẩu đăng nhập của tài xế <strong style={{ color: '#0F172A' }}>{resetTargetShipper.full_name}</strong> (@{resetTargetShipper.username}), đồng thời mở khóa tài khoản và xóa phiên làm việc bị kẹt nếu có.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Mật khẩu mặc định sau khi reset
                </label>
                <input
                  type="text"
                  value={resetPassInput}
                  onChange={(e) => setResetPassInput(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.9rem', fontWeight: '700', color: '#0F172A', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setResetTargetShipper(null)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={handleConfirmResetAccount}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                    opacity: submittingAction ? 0.6 : 1,
                  }}
                >
                  {submittingAction ? 'Đang reset...' : 'Xác Nhận Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── MODAL 3: KẾT QUẢ RESET TÀI KHOẢN (CREDENTIALS DISPLAY) ───────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {resetResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={24} color="#16A34A" />
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0F172A' }}>
                  Reset Tài Khoản Thành Công!
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                  Vui lòng gửi thông tin đăng nhập mới cho tài xế <strong style={{ color: '#0F172A' }}>{resetResult.full_name}</strong>:
                </p>
              </div>

              {/* Thông Tin Đăng Nhập */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Tên đăng nhập:</span>
                  <strong style={{ fontSize: '0.92rem', color: '#0F172A' }}>@{resetResult.username}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Mật khẩu mới:</span>
                  <code style={{ fontSize: '1rem', fontWeight: '800', color: '#16A34A', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                    {resetResult.password}
                  </code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`Tài khoản: @${resetResult.username}\nMật khẩu: ${resetResult.password}`)}
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {copiedKey ? <CheckCheck size={16} color="#16A34A" /> : <Copy size={16} />}
                  {copiedKey ? 'Đã sao chép!' : 'Sao chép thông tin'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetResult(null)}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#4F46E5',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hoàn tất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── MODAL 4: THÊM TÀI XẾ MỚI TRỰC THUỘC CƠ SỞ ───────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {isAddShipperOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0F172A' }}>
                  Thêm Tài Xế Mới
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Cơ sở tiếp nhận: {getBranchDisplayName()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddShipperOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#64748B" />
              </button>
            </div>

            <form onSubmit={handleCreateNewShipper} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Tên đăng nhập *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: shipper_bd02"
                    value={newShipperForm.username}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, username: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Mật khẩu ban đầu
                  </label>
                  <input
                    type="text"
                    required
                    value={newShipperForm.password}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, password: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Họ và tên tài xế *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Trần Hoàng Nam"
                  value={newShipperForm.full_name}
                  onChange={(e) => setNewShipperForm({ ...newShipperForm, full_name: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Số điện thoại *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="VD: 0909123456"
                    value={newShipperForm.phone}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, phone: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Email (Tùy chọn)
                  </label>
                  <input
                    type="email"
                    placeholder="VD: shipper@gmail.com"
                    value={newShipperForm.email}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, email: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Loại phương tiện
                  </label>
                  <select
                    value={newShipperForm.vehicle_type}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, vehicle_type: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MOTORBIKE">Xe máy</option>
                    <option value="ELECTRIC_BIKE">Xe máy điện</option>
                    <option value="CAR">Ô tô</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Biển số xe
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 59X1-99999"
                    value={newShipperForm.vehicle_plate}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, vehicle_plate: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddShipperOpen(false)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                    opacity: submittingAction ? 0.6 : 1,
                  }}
                >
                  {submittingAction ? 'Đang tạo...' : 'Tạo Tài Xế'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
