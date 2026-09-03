import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';

export default function StaffDeliveryPanel() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debugText, setDebugText] = useState('');
  const [lalamoveLinks, setLalamoveLinks] = useState({});

  // COD State
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'cod'
  const [codRemits, setCodRemits] = useState([]);
  const [codLoading, setCodLoading] = useState(false);
  const [codStatusFilter, setCodStatusFilter] = useState('PENDING');
  const [codConfirming, setCodConfirming] = useState(null);

  const fetchDeliveries = async () => {
    try {
      const sessionStr = window.localStorage.getItem('adminSession') || '{}';
      const session = JSON.parse(sessionStr);
      const branchCode = (session?.user?.coSoMa || session?.user?.co_so_ma || 'MAC_DINH_CHI').toUpperCase();
      
      const res = await fetch(`${API_BASE_URL}/staff/orders?branch_code=${encodeURIComponent(branchCode)}`);
      const data = await res.json();
      const allOrders = data.orders || data.items || data.data || [];
      
      const deliveryOrders = allOrders.filter(o => {
        const s = String(o.trang_thai_don_hang || '').trim().toUpperCase();
        return s === 'DANG_CHUAN_BI' || s === 'DANG_GIAO';
      });
      
      setDeliveries(deliveryOrders);
      setDebugText(`Tổng đơn: ${allOrders.length} | Cơ sở: ${branchCode} | Đơn giao: ${deliveryOrders.length}`);
    } catch (err) {
      console.error(err);
      setDebugText(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchDeliveries();
      const intv = setInterval(fetchDeliveries, 15000);
      return () => clearInterval(intv);
    }
  }, [activeTab]);

  const fetchCodRemits = async () => {
    setCodLoading(true);
    try {
      const sessionStr = window.localStorage.getItem('adminSession') || '{}';
      const session = JSON.parse(sessionStr);
      const branchCode = (session?.user?.coSoMa || session?.user?.co_so_ma || 'HCM_DIEN_BIEN_PHU').toUpperCase();
      
      const res = await fetch(`${API_BASE_URL}/shippers/cod-remits?branch_code=${encodeURIComponent(branchCode)}${codStatusFilter ? `&status=${codStatusFilter}` : ''}`);
      const data = await res.json();
      setCodRemits(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCodLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'cod') fetchCodRemits();
  }, [activeTab, codStatusFilter]);

  const handleConfirmCod = async (remitId, status) => {
    if (!window.confirm(`Xác nhận chuyển phiếu thu hộ này thành ${status === 'CONFIRMED' ? 'Đã nhận tiền' : 'Từ chối'}?`)) return;
    setCodConfirming(remitId + status);
    try {
      const sessionStr = window.localStorage.getItem('adminSession') || '{}';
      const session = JSON.parse(sessionStr);
      
      const res = await fetch(`${API_BASE_URL}/shippers/cod-remits/${remitId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: status,
          confirmed_by: session?.user?.id || '00000000-0000-0000-0000-000000000000'
        })
      });
      if (res.ok) fetchCodRemits();
      else {
        const d = await res.json();
        alert(d.message || 'Lỗi');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setCodConfirming(null);
    }
  };

  const handleAssignInternal = async (orderId) => {
    try {
      const sessionStr = window.localStorage.getItem('adminSession') || '{}';
      const session = JSON.parse(sessionStr);
      const token = session?.accessToken || session?.token || '';

      const res = await fetch(`${API_BASE_URL}/shippers/orders/${orderId}/mark-ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      let data;
      try { data = await res.json(); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data?.message || `Lỗi ${res.status}`);
      }

      alert(`Đã chuyển đơn ${orderId.slice(0, 8)} sang trạng thái "Đang Giao"!\nShipper nội bộ có thể nhận đơn ngay.`);
      fetchDeliveries();
    } catch (err) {
      console.error(err);
      alert(`Lỗi khi chuyển đơn: ${err.message}`);
    }
  };

  const getCoordinatesFromAddress = async (addressStr) => {
    try {
      const parts = addressStr.split(',').map(p => p.trim());
      
      for (let i = 0; i < parts.length; i++) {
        const query = parts.slice(i).join(', ');
        if (!query || query.length < 3) continue;
        
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'AvengersCoffee/1.0 (demo)' }
        });
        const data = await res.json();
        
        if (data && data.length > 0) {
          return { lat: data[0].lat, lng: data[0].lon };
        }
        
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
    return null;
  };

  const handleCallLalamove = async (order) => {
    try {
      alert(`Bắt đầu lấy báo giá & gọi Lalamove cho đơn ${order.ma_don_hang}... (Sandbox)`);
      
      const trackingRes = await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${order.ma_don_hang}`);
      
      let pickupAddressStr = "220 Điện Biên Phủ, Phường Võ Thị Sáu, Quận 3, TP.HCM";
      let senderNameStr = "Highlands Coffee";
      let bCode = "MAC_DINH_CHI";
      try {
        const branchRes = await fetch(`${API_BASE_URL}/users/branches/public`);
        const branchData = await branchRes.json();
        const branches = branchData.data || branchData.items || [];
        
        const sessionStr = window.localStorage.getItem('adminSession') || '{}';
        const session = JSON.parse(sessionStr);
        bCode = (session?.user?.coSoMa || session?.user?.co_so_ma || 'HCM_DIEN_BIEN_PHU').toUpperCase();
        
        const currentBranch = branches.find(b => b.ma_chi_nhanh?.toUpperCase() === bCode || b.ma_co_so?.toUpperCase() === bCode || b.id === bCode);
        if (currentBranch) {
          if (currentBranch.dia_chi) pickupAddressStr = currentBranch.dia_chi;
          senderNameStr = currentBranch.ten_chi_nhanh || currentBranch.ten_co_so || currentBranch.name || "Highlands Coffee";
        }
      } catch (err) {
        console.error("Failed to fetch branch address:", err);
      }
      
      const deliveryAddressStr = order.dia_chi_giao_hang || "Quận 1, TP. Hồ Chí Minh";
      
      const BRANCH_COORDS = {
        'DIEN_BIEN_PHU': { lat: "10.783100", lng: "106.689600" },
        'MAC_DINH_CHI': { lat: "10.787612", lng: "106.697410" }
      };
      let pickupLat = BRANCH_COORDS[bCode]?.lat || "10.787612";
      let pickupLng = BRANCH_COORDS[bCode]?.lng || "106.697410";
      
      let deliveryLat = "10.782000";
      let deliveryLng = "106.700000";

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
          delivery_lng: deliveryLng
        })
      });
      
      let quoteData;
      try { quoteData = await quoteRes.json(); } catch (err) {}
      
      const quotationId = quoteData?.data?.data?.quotationId || quoteData?.data?.quotationId;
      const llmStops = quoteData?.data?.data?.stops || quoteData?.data?.stops || [];
      const senderStopId = llmStops[0]?.stopId;
      const recipientStopId = llmStops[1]?.stopId;

      if (!quoteRes.ok || !quotationId) {
        throw new Error(`Lỗi lấy báo giá từ Lalamove API: ${quoteData?.message || 'Không xác định'}`);
      }

      const orderRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotation_id: quotationId,
          sender_stop_id: senderStopId,
          recipient_stop_id: recipientStopId,
          sender_name: senderNameStr,
          sender_phone: "+84773670599",
          recipient_name: order.ten_khach_hang || "Khách Hàng",
          recipient_phone: "+84987654321",
          pickup_address: pickupAddressStr,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          delivery_address: deliveryAddressStr,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
          remarks: "Đơn nước Avengers Coffee, giao cẩn thận!"
        })
      });
      
      let orderData;
      try { orderData = await orderRes.json(); } catch (err) {}
      let llmOrder = orderData?.data?.data || orderData?.data;

      if (!orderRes.ok || !llmOrder?.orderId) {
         throw new Error(`Lỗi tạo đơn Lalamove API: ${orderData?.message || 'Lỗi không xác định'}`);
      }
      
      await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${order.ma_don_hang}/lalamove-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lalamove_order_id: llmOrder.orderId,
          share_link: llmOrder.shareLink
        })
      });

      setLalamoveLinks(prev => ({
        ...prev,
        [order.ma_don_hang]: llmOrder.shareLink
      }));

      alert(`Đã gọi Lalamove thành công!\nMã đơn LLM: ${llmOrder.orderRef || llmOrder.orderId}`);
    } catch (err) {
      console.error(err);
      alert('Lỗi khi gọi Lalamove: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem 1.5rem' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Truck size={20} color="#4f46e5" /> Quản lý NV giao hàng
          </h2>
          <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>
            Điều phối giao nhận qua Shipper nội bộ hoặc dịch vụ Lalamove
          </p>
        </div>

        <button
          type="button"
          onClick={() => activeTab === 'orders' ? fetchDeliveries() : fetchCodRemits()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', height: '32px', padding: '0 0.75rem', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
        >
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            background: 'none', border: 'none', padding: '0.5rem 0.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
            borderBottom: activeTab === 'orders' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'orders' ? '#4f46e5' : '#64748b'
          }}
        >
          Đơn Đang Giao
        </button>
        <button
          onClick={() => setActiveTab('cod')}
          style={{
            background: 'none', border: 'none', padding: '0.5rem 0.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
            borderBottom: activeTab === 'cod' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'cod' ? '#4f46e5' : '#64748b'
          }}
        >
          Đối Soát COD
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ height: '60px', backgroundColor: '#f1f5f9', borderRadius: '8px' }} />
          <div style={{ height: '60px', backgroundColor: '#f1f5f9', borderRadius: '8px' }} />
        </div>
      ) : deliveries.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={36} color="#059669" />
          <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: '600', color: '#334155' }}>Không có đơn hàng nào cần giao lúc này</p>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{debugText}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {deliveries.map((order) => (
            <div key={order.ma_don_hang} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.15rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem', alignItems: 'center' }}>
              
              {/* Info Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: '#4f46e5', fontWeight: '700' }}>
                    #{order.ma_don_hang.slice(0, 8).toUpperCase()}
                  </strong>
                  {order.phuong_thuc_giao_hang && (
                    <span style={{
                      fontSize: '0.68rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '4px',
                      backgroundColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#fff7ed' : '#e0e7ff',
                      color: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#c2410c' : '#4338ca',
                      border: `1px solid ${order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#ffedd5' : '#c7d2fe'}`
                    }}>
                      {order.phuong_thuc_giao_hang === 'LALAMOVE' ? 'Lalamove' : 'Shipper Nội Bộ'}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '0.78125rem', color: '#334155', fontWeight: '600' }}>
                  Khách: {order.ten_khach_hang || order.ma_nguoi_dung}
                </span>

                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={13} color="#64748b" /> {order.dia_chi_giao_hang || 'Tại quán'}
                </span>
              </div>

              {/* COD / Amount Column */}
              <div style={{ borderLeft: '1px solid #f1f5f9', paddingLeft: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>TIỀN THU COD</span>
                <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '600' }}>
                  {Number(order.tong_tien || 0).toLocaleString()} đ
                </span>
                <span style={{
                  fontSize: '0.7rem', fontWeight: '700', display: 'inline-block', width: 'fit-content',
                  padding: '0.15rem 0.5rem', borderRadius: '9999px', marginTop: '0.15rem',
                  backgroundColor: order.trang_thai_don_hang === 'DANG_GIAO' ? '#e0f2fe' : '#fef9c3',
                  color: order.trang_thai_don_hang === 'DANG_GIAO' ? '#0369a1' : '#854d0e'
                }}>
                  {order.trang_thai_don_hang === 'DANG_GIAO' ? 'Đang giao' : 'Đang chuẩn bị'}
                </span>
              </div>

              {/* Action Buttons Column */}
              <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {lalamoveLinks[order.ma_don_hang] ? (
                  <>
                    <span style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={13} /> Đã gọi Lalamove
                    </span>
                    <a
                      href={lalamoveLinks[order.ma_don_hang]}
                      target="_blank"
                      rel="noreferrer"
                      style={{ height: '32px', padding: '0 0.65rem', borderRadius: '6px', backgroundColor: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '0.75rem', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <ExternalLink size={13} /> Tracking
                    </a>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAssignInternal(order.ma_don_hang)}
                      style={{
                        height: '32px', padding: '0 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                        backgroundColor: order.phuong_thuc_giao_hang !== 'LALAMOVE' ? '#4f46e5' : '#ffffff',
                        color: order.phuong_thuc_giao_hang !== 'LALAMOVE' ? '#ffffff' : '#475569',
                        border: order.phuong_thuc_giao_hang !== 'LALAMOVE' ? 'none' : '1px solid #cbd5e1',
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                      }}
                    >
                      <Bike size={13} /> Shipper Nội Bộ
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCallLalamove(order)}
                      style={{
                        height: '32px', padding: '0 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                        backgroundColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#ea580c' : '#ffffff',
                        color: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#ffffff' : '#475569',
                        border: order.phuong_thuc_giao_hang === 'LALAMOVE' ? 'none' : '1px solid #cbd5e1',
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                      }}
                    >
                      <Navigation size={13} /> Lalamove
                    </button>
                  </>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
        </>
      ) : (
        <div style={{ padding: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {['PENDING', 'CONFIRMED', 'REJECTED', ''].map(s => (
                <button
                  key={s || 'all'}
                  onClick={() => setCodStatusFilter(s)}
                  style={{
                    padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: '700',
                    cursor: 'pointer', border: '1.5px solid',
                    backgroundColor: codStatusFilter === s ? '#1e40af' : '#fff',
                    color: codStatusFilter === s ? '#fff' : '#475569',
                    borderColor: codStatusFilter === s ? '#1e40af' : '#e2e8f0',
                  }}
                >
                  {s === 'PENDING' ? '⏳ Chờ duyệt' : s === 'CONFIRMED' ? '✅ Đã nhận tiền' : s === 'REJECTED' ? '❌ Từ chối' : 'Tất cả'}
                </button>
              ))}
            </div>
          </div>

          {codLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
          ) : codRemits.length === 0 ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={36} color="#cbd5e1" />
              <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: '600', color: '#334155' }}>Không có phiếu nộp COD nào {codStatusFilter ? `(${codStatusFilter})` : ''}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['⏰ Thời gian', '👨‍🚚 Shipper', '💵 Số tiền', '💬 Ghi chú', 'Trạng thái', 'Hành động'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.8rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codRemits.map((r, i) => {
                    const isPending = r.status === 'PENDING'
                    const isConfirmed = r.status === 'CONFIRMED'
                    return (
                      <tr key={r.id || i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isPending ? '#fffbeb' : isConfirmed ? '#f0fdf4' : '#fff1f2' }}>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.78rem' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                          {r.shipper_name || r.shipper_id?.slice(0, 8)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '800', color: '#dc2626', fontSize: '1rem' }}>
                          {Number(r.amount || 0).toLocaleString()} đ
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.8rem', maxWidth: '160px' }}>
                          {r.note || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700',
                            backgroundColor: isPending ? '#fffbeb' : isConfirmed ? '#ecfdf5' : '#fef2f2',
                            color: isPending ? '#b45309' : isConfirmed ? '#047857' : '#dc2626',
                            border: `1px solid ${isPending ? '#fde68a' : isConfirmed ? '#a7f3d0' : '#fecaca'}`,
                          }}>
                            {isPending ? '⏳ Chờ duyệt' : isConfirmed ? '✅ Đã nhận tiền' : '❌ Từ chối'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleConfirmCod(r.id, 'CONFIRMED')}
                                disabled={codConfirming === r.id + 'CONFIRMED'}
                                style={{
                                  padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700',
                                  background: '#059669', color: '#fff', border: 'none', cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'CONFIRMED' ? 0.6 : 1,
                                }}
                              >
                                <Check size={13} style={{ marginRight: 4 }} />Đã nhận
                              </button>
                              <button
                                onClick={() => handleConfirmCod(r.id, 'REJECTED')}
                                disabled={codConfirming === r.id + 'REJECTED'}
                                style={{
                                  padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700',
                                  background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'REJECTED' ? 0.6 : 1,
                                }}
                              >
                                <X size={13} style={{ marginRight: 4 }} />Từ chối
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                              {isConfirmed ? `✓ Đã xác nhận` : '✕ Đã từ chối'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
