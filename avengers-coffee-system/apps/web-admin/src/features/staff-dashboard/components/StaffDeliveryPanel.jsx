import StatusBadge from '../../../components/console/StatusBadge'
import { Popover, PopoverTrigger, PopoverContent } from '../../../components/ui/popover'
import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Input } from '../../../components/ui/input'
import { Table } from '../../../components/ui/table'
import { Label } from '../../../components/ui/label'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { Star as WorkspaceSymbolStar } from '../../../components/console/WorkspaceIcons'
import { PaginatedList } from '../../../components/console/CompactPagination'
import { getAdminSession } from '../../../lib/adminFetch'
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
} from '../../../components/console/WorkspaceIcons';

function DriverRating({ value }) {
  const rating = Number(value || 0)
  if (!rating) return <small className="driver-rating-empty">Chưa có đánh giá</small>
  return <span className="driver-rating" aria-label={`Đánh giá ${rating.toFixed(1)} trên 5 sao`}><span aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <WorkspaceSymbolStar key={index} size={13} fill={rating >= index + 0.5 ? 'currentColor' : 'none'} />)}</span><strong>{rating.toFixed(1)}</strong></span>
}

export default function StaffDeliveryPanel({ session: providedSession } = {}) {
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
  const [assignedShipperInfo, setAssignedShipperInfo] = useState({});

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
      return providedSession || getAdminSession() || {};
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

      // Check all active deliveries so orders already claimed during preparation cannot be reassigned.
      const ordersToCheck = deliveryOrders;
      const shipperMap = {};
      await Promise.all(ordersToCheck.map(async (o) => {
        try {
          const tRes = await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${o.ma_don_hang}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            const accepted = ['CONFIRMED','PICKING_UP','IN_TRANSIT','DELIVERED'].includes(tData.assignment_status);
            if (accepted && tData.shipper?.id) shipperMap[o.ma_don_hang] = { id:tData.shipper.id,name:tData.shipper.full_name,accepted:true };
            else if (tData.assignment_status==='PENDING' && tData.assigned_shipper_id) shipperMap[o.ma_don_hang] = { id:tData.assigned_shipper_id,accepted:false };

          }
        } catch (e) {
          console.warn('[fetchTracking] Error:', e);
        }
      }));
      setAssignedShipperInfo(shipperMap);
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

      alert(`Đã phân công cho ${shipperName}. Tài xế cần nhận đơn trên ứng dụng.`);
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
        status: 'INACTIVE',
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
    <div className="manager-delivery" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem 1.5rem', backgroundColor: '#f8f9f6', minHeight: '100vh' }}>

      {/* ─── HEADER CHÍNH ──────────────────────────────────────────────────────── */}
      <div className="delivery-panel-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: '1.25rem 1.5rem',
        borderRadius: '16px',
        border: '1px solid #e2e4df',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div>
          <WorkspacePanelIntro><div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={22} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#252927', letterSpacing: '-0.02em' }}>
                Quản lý Shipper & Đội Ngũ Tài Xế
              </h1>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem', color: '#69736a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Store size={14} color="#69736a" />
                Cơ sở: <strong style={{ color: '#30382e' }}>{getBranchDisplayName()}</strong>
                <span style={{ color: '#ccd3c7' }}>•</span>
                Mã: <code style={{ backgroundColor: '#f4f5f2', padding: '1px 6px', borderRadius: '4px', color: 'var(--primary)', fontWeight: '600' }}>{getBranchCode()}</code>
              </p>
            </div>
          </div></WorkspacePanelIntro>
        </div>

      </div>

      {/* ─── THANH ĐIỀU HƯỚNG TABS (SEGMENTED PILL HIỆN ĐẠI) ────────────────── */}
      <div className="delivery-nav-row">
      <div className="operation-tabs delivery-tabs" style={{
        display: 'flex',
        gap: '0.5rem',
        backgroundColor: "#f4f5f2",
        padding: '0.35rem',
        borderRadius: '14px',
        width: 'fit-content'
      }}>
        {/* Tab 1: Đơn Đang Giao */}
        <Button data-selected={activeTab === 'orders'}
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
            color: activeTab === 'orders' ? 'var(--primary)' : '#596255',
            boxShadow: activeTab === 'orders' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Package size={17} color={activeTab === 'orders' ? 'var(--primary)' : '#69736a'} />
          Đơn Đang Giao
          {deliveries.length > 0 && (
            <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
              backgroundColor: activeTab === 'orders' ? 'var(--primary-light)' : "#f4f5f2",
              color: activeTab === 'orders' ? 'var(--primary)' : '#414743',
              padding: '0.1rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: '600'
            }}>
              {deliveries.length}
            </Badge>
          )}
        </Button>

        {/* Tab 2: Đối Soát COD */}
        <Button data-selected={activeTab === 'cod'}
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
            color: activeTab === 'cod' ? 'var(--primary)' : '#596255',
            boxShadow: activeTab === 'cod' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Receipt size={17} color={activeTab === 'cod' ? 'var(--primary)' : '#69736a'} />
          Đối Soát Tiền Thu Hộ COD
          {pendingCodCount > 0 && (
            <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
              backgroundColor: "#f4f5f2",
              color: '#B45309',
              padding: '0.1rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: '600',
              border: '1px solid #FDE68A'
            }}>
              {pendingCodCount} chờ duyệt
            </Badge>
          )}
        </Button>

        {/* Tab 3: Tài Xế Cơ Sở (CHỈ DÀNH RIÊNG CHO QUẢN LÝ / MANAGER) */}
        {isManager() && (
          <Button data-selected={activeTab === 'shippers'}
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
              color: activeTab === 'shippers' ? 'var(--primary)' : '#596255',
              boxShadow: activeTab === 'shippers' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Bike size={17} color={activeTab === 'shippers' ? 'var(--primary)' : '#69736a'} />
            Đội Ngũ Tài Xế Cơ Sở
            {branchShippers.length > 0 && (
              <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
                backgroundColor: activeTab === 'shippers' ? 'var(--primary-light)' : "#f4f5f2",
                color: activeTab === 'shippers' ? 'var(--primary)' : '#414743',
                padding: '0.1rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: '600'
              }}>
                {branchShippers.length}
              </Badge>
            )}
          </Button>
        )}
      </div>
      {activeTab === 'shippers' && isManager() && <Button className="admin-button-primary delivery-add-driver" type="button" onClick={() => setIsAddShipperOpen(true)}><UserPlus size={16} />Thêm tài xế</Button>}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* ─── TAB 1: ĐƠN ĐANG GIAO (ORDERS IN TRANSIT) ─────────────────────────── */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Thẻ Thống Kê Nhanh (KPIs) */}


          {/* Bộ lọc và Tìm kiếm */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #e2e4df',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              {[
                { id: 'ALL', label: 'Tất cả đơn' },
                { id: 'DANG_CHUAN_BI', label: 'Đang chuẩn bị' },
                { id: 'DANG_GIAO', label: 'Đang giao' },
              ].map((tab) => (
                <Button data-selected={orderStatusFilter === tab.id}
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
                    backgroundColor: orderStatusFilter === tab.id ? 'var(--primary)' : '#FFFFFF',
                    color: orderStatusFilter === tab.id ? '#FFFFFF' : '#596255',
                    borderColor: orderStatusFilter === tab.id ? 'var(--primary)' : '#e2e4df',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} color="#85907d" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <Input data-input-prefix="true"
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
                  border: '1px solid #ccd3c7',
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
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #e2e4df' }} />
              <div style={{ height: '70px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #e2e4df' }} />
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #e2e4df',
              borderRadius: '16px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '26px', backgroundColor: '#f4f5f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} color="#2563eb" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#30382e' }}>
                Không có đơn hàng nào cần điều phối
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#69736a' }}>
                Tất cả đơn hàng giao tận nơi tại cơ sở đã được xử lý hoặc chưa phát sinh đơn mới.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <PaginatedList items={filteredDeliveries} resetKey={JSON.stringify([activeTab,orderSearch,orderStatusFilter,codStatusFilter,shipperSearch,shipperStatusFilter])}>{(order) => {
                const isDelivering = String(order.trang_thai_don_hang || '').toUpperCase() === 'DANG_GIAO';
                const isLalamove = order.phuong_thuc_giao_hang === 'LALAMOVE';

                return (
                  <article key={order.ma_don_hang} className="delivery-order-row"><div className="delivery-order-identity"><strong>#{order.ma_don_hang.slice(0, 8).toUpperCase()} · {order.ten_khach_hang || order.ma_nguoi_dung || 'Khách hàng'}</strong><span>{order.dia_chi_giao_hang || 'Chưa cập nhật địa chỉ'}</span><small>{isLalamove ? 'Dịch vụ Lalamove' : 'Đội giao hàng cửa hàng'}</small></div><div className="delivery-order-amount"><span>{order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? 'Thu hộ COD' : 'Giá trị đơn'}</span><strong>{Number(order.tong_tien || 0).toLocaleString('vi-VN')} đ</strong></div><StatusBadge status={assignedShipperInfo[order.ma_don_hang]?.accepted ? 'DANG_GIAO' : 'PENDING'}>{assignedShipperInfo[order.ma_don_hang]?.accepted ? 'Tài xế đã nhận' : isDelivering ? 'Chờ tài xế nhận' : 'Đang chuẩn bị'}</StatusBadge>
                  {lalamoveLinks[order.ma_don_hang] ? <a className="delivery-track-link" href={lalamoveLinks[order.ma_don_hang]} target="_blank" rel="noreferrer"><ExternalLink size={15} />Theo dõi Lalamove</a> : assignedShipperInfo[order.ma_don_hang]?.accepted ? <div className="delivery-assignment-status"><Bike size={15} /><span>{assignedShipperInfo[order.ma_don_hang] ? `Đã nhận bởi ${assignedShipperInfo[order.ma_don_hang].name || assignedShipperInfo[order.ma_don_hang].id}` : 'Đơn đã có tài xế · không thể chỉ định lại'}</span></div> : <Popover><PopoverTrigger asChild><Button variant="outline"><Truck size={15} />{assignedShipperInfo[order.ma_don_hang] ? 'Đổi tài xế · chờ nhận' : 'Điều phối'}<ChevronDown size={13} /></Button></PopoverTrigger><PopoverContent align="end" className="workspace-action-popover delivery-action-panel"><p>Chọn tài xế hoặc dịch vụ giao hàng</p><div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {lalamoveLinks[order.ma_don_hang] ? (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <Badge variant="outline" data-quiet-label="true" style={{
                            backgroundColor: "#f4f5f2",
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}>
                            <CheckCircle2 size={14} /> Đã gọi Lalamove
                          </Badge>
                          <a
                            href={lalamoveLinks[order.ma_don_hang]}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              height: '34px',
                              padding: '0 0.75rem',
                              borderRadius: '8px',
                              backgroundColor: '#FFFFFF',
                              color: 'var(--primary)',
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
                              backgroundColor: '#f8f9f6',
                              padding: '0.65rem',
                              borderRadius: '10px',
                              border: '1px solid #ccd3c7',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e4df', paddingBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <Bike size={14} /> Chọn tài xế cơ sở
                                </span>
                                <Button
                                  type="button"
                                  onClick={() => setAssignPickerOrderId(null)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                                >
                                  <X size={14} color="#69736a" />
                                </Button>
                              </div>

                              {branchShippers.filter((s) => s.status === 'ACTIVE').length === 0 ? (
                                <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: '600', padding: '0.35rem 0' }}>
                                  Hiện không có tài xế nào đang online
                                </span>
                              ) : (
                                branchShippers
                                  .filter((s) => s.status === 'ACTIVE')
                                  .map((s) => (
                                    <Button
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
                                        border: '1px solid #e2e4df',
                                        backgroundColor: '#FFFFFF',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s',
                                        opacity: assigningOrderId === order.ma_don_hang ? 0.6 : 1,
                                      }}
                                    >
                                      <div style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Bike size={14} color="var(--primary)" />
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#252927', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {s.full_name}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#69736a' }}>
                                          {s.phone || s.vehicle_plate || `@${s.username}`}
                                        </div>
                                      </div>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb', flexShrink: 0 }} />
                                    </Button>
                                  ))
                              )}

                              <Button
                                type="button"
                                onClick={() => {
                                  setAssignPickerOrderId(null);
                                  handleAssignInternal(order.ma_don_hang);
                                }}
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#69736a',
                                  background: '#FFFFFF',
                                  border: '1px dashed #ccd3c7',
                                  borderRadius: '6px',
                                  padding: '0.4rem 0.5rem',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  fontWeight: '600',
                                }}
                              >
                                Đưa vào kho để shipper tự nhận
                              </Button>
                            </div>
                          ) : assignedShipperInfo[order.ma_don_hang]?.accepted ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '8px',
                              backgroundColor: "#f4f5f2",
                              border: '1px solid #bfdbfe',
                            }}>
                              <Bike size={14} color="#1d4ed8" />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e40af' }}>
                                  Đang giao bởi: {assignedShipperInfo[order.ma_don_hang].name || assignedShipperInfo[order.ma_don_hang].id}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#1d4ed8' }}>
                                  {assignedShipperInfo[order.ma_don_hang].phone} {assignedShipperInfo[order.ma_don_hang].vehicle_plate ? `• ${assignedShipperInfo[order.ma_don_hang].vehicle_plate}` : ''}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              onClick={() => setAssignPickerOrderId(order.ma_don_hang)}
                              style={{
                                height: '36px',
                                padding: '0 0.85rem',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                backgroundColor: 'var(--primary)',
                                color: '#FFFFFF',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 1px 3px rgba(79, 70, 229, 0.2)',
                              }}
                            >
                              <Bike size={15} /> Chỉ định tài xế
                            </Button>
                          )}

                          <Button
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
                          </Button>
                        </>
                      )}
                    </div></PopoverContent></Popover>}</article>
                );
              }}</PaginatedList>
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


          {/* Bộ lọc trạng thái nộp COD (Không dùng icon emoji) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #e2e4df',
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
                  <Button data-selected={isSelected}
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
                      backgroundColor: isSelected ? 'var(--primary)' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : '#596255',
                      borderColor: isSelected ? 'var(--primary)' : '#e2e4df',
                      transition: 'all 0.15s',
                    }}
                  >
                    {IconComponent && <IconComponent size={14} />}
                    {filter.label}
                    {filter.count > 0 && (
                      <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : "#f4f5f2",
                        color: isSelected ? '#FFFFFF' : '#B45309',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                      }}>
                        {filter.count}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Bảng Danh Sách Phiếu Nộp COD */}
          {codLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#85907d', backgroundColor: '#FFFFFF', borderRadius: '14px' }}>
              Đang tải danh sách phiếu đối soát...
            </div>
          ) : codRemits.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #e2e4df',
              borderRadius: '14px',
              padding: '3rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <CheckCircle2 size={36} color="#ccd3c7" />
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: '700', color: '#414743' }}>
                Không có phiếu nộp COD nào trong mục này
              </p>
              <span style={{ fontSize: '0.78rem', color: '#85907d' }}>
                Khi shipper hoàn thành các đơn hàng thu hộ tiền mặt và bấm nộp tiền tại quán, phiếu sẽ xuất hiện ở đây.
              </span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF', border: '1px solid #e2e4df', borderRadius: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <Table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9f6', borderBottom: '2px solid #e2e4df' }}>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Thời Gian Nộp</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Tài Xế Nộp Tiền</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Số Tiền Thu Hộ</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Ghi Chú Đính Kèm</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Trạng Thái Duyệt</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: '700', color: '#596255', fontSize: '0.78rem' }}>Thao Tác Quản Lý</th>
                  </tr>
                </thead>
                <tbody>
                  <PaginatedList items={codRemits} resetKey={JSON.stringify([activeTab,orderSearch,orderStatusFilter,codStatusFilter,shipperSearch,shipperStatusFilter])} layout="table" columns={6}>{(r, i) => {
                    const isPending = r.status === 'PENDING';
                    const isConfirmed = r.status === 'CONFIRMED';
                    return (
                      <tr
                        key={r.id || i}
                        style={{
                          borderBottom: '1px solid #f4f5f2',
                          backgroundColor: isPending ? "#f4f5f2" : '#FFFFFF',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '0.85rem 1rem', color: '#69736a', fontSize: '0.78rem' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#252927' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Bike size={15} color="var(--primary)" />
                            <span>{r.shipper_name || r.shipper_id?.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#2563eb', fontSize: '0.98rem' }}>
                          {Number(r.amount || 0).toLocaleString()} đ
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#69736a', fontSize: '0.78rem', maxWidth: '180px' }}>
                          {r.note || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <StatusBadge status={r.status}>{isPending ? 'Chờ xác nhận' : isConfirmed ? 'Đã nhận tiền' : 'Đã từ chối'}</StatusBadge>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'center' }}>
                              <Button data-intent="success"
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
                                  backgroundColor: "var(--primary)",
                                  color: '#FFFFFF',
                                  border: 'none',
                                  cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'CONFIRMED' ? 0.6 : 1,
                                }}
                              >
                                <Check size={13} /> Xác nhận đã thu
                              </Button>
                              <Button data-intent="danger"
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
                              </Button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.76rem', color: '#85907d', fontWeight: '600' }}>
                              {isConfirmed ? 'Hoàn tất đối soát' : 'Đã hủy phiếu'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }}</PaginatedList>
                </tbody>
              </Table>
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


          {/* Thanh công cụ tìm kiếm và lọc */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #e2e4df',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {[
                { id: 'ALL', label: 'Tất cả tài xế' },
                { id: 'ACTIVE', label: 'Đang hoạt động' },
                { id: 'INACTIVE', label: 'Tạm ngưng' },
              ].map((tab) => (
                <Button data-selected={shipperStatusFilter === tab.id}
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
                    backgroundColor: shipperStatusFilter === tab.id ? 'var(--primary)' : '#FFFFFF',
                    color: shipperStatusFilter === tab.id ? '#FFFFFF' : '#596255',
                    borderColor: shipperStatusFilter === tab.id ? 'var(--primary)' : '#e2e4df',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} color="#85907d" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <Input data-input-prefix="true"
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
                  border: '1px solid #ccd3c7',
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
              border: '1px solid #e2e4df',
              borderRadius: '16px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.6rem',
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '28px', backgroundColor: '#f4f5f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bike size={28} color="#85907d" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#30382e' }}>
                Không tìm thấy tài xế nào
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#69736a', maxWidth: '420px', lineHeight: 1.5 }}>
                Chưa có nhân viên giao hàng nào khớp với điều kiện tìm kiếm. Quản lý có thể thêm mới tài xế bằng nút "Thêm tài xế mới" phía trên.
              </p>
            </div>
          ) : (
            <div className="operation-table-frame manager-driver-table"><Table><thead><tr><th style={{width:'24%'}}>Tài xế</th><th style={{width:'24%'}}>Liên hệ</th><th style={{width:'21%'}}>Phương tiện</th><th style={{width:'16%'}}>Trạng thái</th><th style={{width:'15%'}}>Thao tác</th></tr></thead><tbody><PaginatedList items={filteredShippers} resetKey={JSON.stringify([shipperSearch,shipperStatusFilter])} layout="table" columns={5}>{s => <tr key={s.id}><td><strong>{s.full_name || s.username}</strong><small>@{s.username}</small><DriverRating value={s.rating} /></td><td>{s.phone || 'Chưa cập nhật'}<small>{s.email || ''}</small></td><td>{s.vehicle_type === 'CAR' ? 'Ô tô' : s.vehicle_type === 'ELECTRIC_BIKE' ? 'Xe máy điện' : 'Xe máy'}<small>{s.vehicle_plate || 'Chưa có biển số'}</small></td><td><StatusBadge status={s.status}>{s.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'}</StatusBadge></td><td><div className="operation-row-actions"><Button variant="outline" size="icon" aria-label={`Sửa tài xế ${s.full_name || s.username}`} title="Sửa thông tin" onClick={() => handleOpenEditShipper(s)}><Edit3 size={15} /></Button><Button variant="outline" size="icon" aria-label={`Đặt lại tài khoản ${s.full_name || s.username}`} title="Đặt lại tài khoản" data-intent="danger" onClick={() => handleOpenResetAccount(s)}><RotateCcw size={15} /></Button></div></td></tr>}</PaginatedList></tbody></Table></div>
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
              borderBottom: '1px solid #e2e4df',
              backgroundColor: '#f8f9f6',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', color: '#252927' }}>
                  Cập Nhật Thông Tin Tài Xế
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#69736a' }}>
                  Tài khoản: @{editingShipper.username}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setEditingShipper(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#69736a" />
              </Button>
            </div>

            {/* Modal Form */}
            <form className="workspace-form" onSubmit={handleSaveEditShipper} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <div>
                <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                  Họ và tên tài xế *
                </Label>
                <Input
                  type="text"
                  required
                  value={editingShipper.full_name}
                  onChange={(e) => setEditingShipper({ ...editingShipper, full_name: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Số điện thoại *
                  </Label>
                  <Input
                    type="tel"
                    required
                    value={editingShipper.phone}
                    onChange={(e) => setEditingShipper({ ...editingShipper, phone: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={editingShipper.email}
                    onChange={(e) => setEditingShipper({ ...editingShipper, email: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Loại phương tiện
                  </Label>
                  <SearchableSelect
                    value={editingShipper.vehicle_type}
                    onChange={(e) => setEditingShipper({ ...editingShipper, vehicle_type: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MOTORBIKE">Xe máy</option>
                    <option value="ELECTRIC_BIKE">Xe máy điện</option>
                    <option value="CAR">Ô tô</option>
                  </SearchableSelect>
                </div>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Biển số xe
                  </Label>
                  <Input
                    type="text"
                    placeholder="VD: 59X1-12345"
                    value={editingShipper.vehicle_plate}
                    onChange={(e) => setEditingShipper({ ...editingShipper, vehicle_plate: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                  Trạng thái hoạt động
                </Label>
                <SearchableSelect
                  value={editingShipper.status}
                  onChange={(e) => setEditingShipper({ ...editingShipper, status: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                >
                  <option value="ACTIVE">Đang hoạt động (Cho phép nhận đơn)</option>
                  <option value="INACTIVE">Tạm ngưng (Không nhận đơn)</option>
                  <option value="ON_BREAK">Đang nghỉ</option>
                </SearchableSelect>
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                  Đổi mật khẩu mới (Để trống nếu không đổi)
                </Label>
                <Input
                  type="text"
                  placeholder="Nhập mật khẩu mới nếu cần đổi"
                  value={editingShipper.new_password}
                  onChange={(e) => setEditingShipper({ ...editingShipper, new_password: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              {/* Modal Actions */}
              <div data-modal-actions="true" style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button data-intent="danger"
                  type="button"
                  onClick={() => setEditingShipper(null)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #ccd3c7',
                    backgroundColor: '#FFFFFF',
                    color: '#596255',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: "var(--primary)",
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                    opacity: submittingAction ? 0.6 : 1,
                  }}
                >
                  {submittingAction ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </Button>
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
              <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: "#f4f5f2", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={24} color="#DC2626" />
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#252927' }}>
                  Xác Nhận Reset Tài Khoản
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#69736a', lineHeight: 1.5 }}>
                  Hành động này sẽ thiết lập lại mật khẩu đăng nhập của tài xế <strong style={{ color: '#252927' }}>{resetTargetShipper.full_name}</strong> (@{resetTargetShipper.username}), đồng thời mở khóa tài khoản và xóa phiên làm việc bị kẹt nếu có.
                </p>
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                  Mật khẩu mặc định sau khi reset
                </Label>
                <Input
                  type="text"
                  value={resetPassInput}
                  onChange={(e) => setResetPassInput(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.9rem', fontWeight: '700', color: '#252927', boxSizing: 'border-box' }}
                />
              </div>

              <div data-modal-actions="true" style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button data-intent="danger"
                  type="button"
                  onClick={() => setResetTargetShipper(null)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #ccd3c7',
                    backgroundColor: '#FFFFFF',
                    color: '#596255',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </Button>
                <Button
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
                </Button>
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
              <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: "#f4f5f2", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={24} color="#2563eb" />
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#252927' }}>
                  Reset Tài Khoản Thành Công!
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#69736a' }}>
                  Vui lòng gửi thông tin đăng nhập mới cho tài xế <strong style={{ color: '#252927' }}>{resetResult.full_name}</strong>:
                </p>
              </div>

              {/* Thông Tin Đăng Nhập */}
              <div style={{
                backgroundColor: '#f8f9f6',
                border: '1px solid #e2e4df',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#69736a' }}>Tên đăng nhập:</span>
                  <strong style={{ fontSize: '0.92rem', color: '#252927' }}>@{resetResult.username}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#69736a' }}>Mật khẩu mới:</span>
                  <code style={{ fontSize: '1rem', fontWeight: '600', color: '#2563eb', backgroundColor: "#f4f5f2", padding: '2px 8px', borderRadius: '6px' }}>
                    {resetResult.password}
                  </code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <Button
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
                    border: '1px solid #ccd3c7',
                    backgroundColor: '#FFFFFF',
                    color: '#414743',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {copiedKey ? <CheckCheck size={16} color="#2563eb" /> : <Copy size={16} />}
                  {copiedKey ? 'Đã sao chép!' : 'Sao chép thông tin'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setResetResult(null)}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hoàn tất
                </Button>
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
              borderBottom: '1px solid #e2e4df',
              backgroundColor: '#f8f9f6',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', color: '#252927' }}>
                  Thêm Tài Xế Mới
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#69736a' }}>
                  Cơ sở tiếp nhận: {getBranchDisplayName()}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setIsAddShipperOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#69736a" />
              </Button>
            </div>

            <form className="workspace-form" onSubmit={handleCreateNewShipper} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Tên đăng nhập *
                  </Label>
                  <Input
                    type="text"
                    required
                    placeholder="VD: shipper_bd02"
                    value={newShipperForm.username}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, username: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Mật khẩu ban đầu
                  </Label>
                  <Input
                    type="text"
                    required
                    value={newShipperForm.password}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, password: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                  Họ và tên tài xế *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="VD: Trần Hoàng Nam"
                  value={newShipperForm.full_name}
                  onChange={(e) => setNewShipperForm({ ...newShipperForm, full_name: e.target.value })}
                  style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Số điện thoại *
                  </Label>
                  <Input
                    type="tel"
                    required
                    placeholder="VD: 0909123456"
                    value={newShipperForm.phone}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, phone: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Email (Tùy chọn)
                  </Label>
                  <Input
                    type="email"
                    placeholder="VD: shipper@gmail.com"
                    value={newShipperForm.email}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, email: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Loại phương tiện
                  </Label>
                  <SearchableSelect
                    value={newShipperForm.vehicle_type}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, vehicle_type: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="MOTORBIKE">Xe máy</option>
                    <option value="ELECTRIC_BIKE">Xe máy điện</option>
                    <option value="CAR">Ô tô</option>
                  </SearchableSelect>
                </div>
                <div>
                  <Label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#414743', marginBottom: '0.35rem' }}>
                    Biển số xe
                  </Label>
                  <Input
                    type="text"
                    placeholder="VD: 59X1-99999"
                    value={newShipperForm.vehicle_plate}
                    onChange={(e) => setNewShipperForm({ ...newShipperForm, vehicle_plate: e.target.value })}
                    style={{ width: '100%', height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div data-modal-actions="true" style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button data-intent="danger"
                  type="button"
                  onClick={() => setIsAddShipperOpen(false)}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #ccd3c7',
                    backgroundColor: '#FFFFFF',
                    color: '#596255',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={submittingAction}
                  style={{
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: "var(--primary)",
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                    opacity: submittingAction ? 0.6 : 1,
                  }}
                >
                  {submittingAction ? 'Đang tạo...' : 'Tạo Tài Xế'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
