import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../admin-dashboard/constants';

export default function StaffDeliveryPanel() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [debugText, setDebugText] = useState('');
  const [lalamoveLinks, setLalamoveLinks] = useState({});

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
      setDebugText(`Tất cả đơn: ${allOrders.length} | Branch: ${branchCode} | Lọc được: ${deliveryOrders.length}`);
    } catch (err) {
      console.error(err);
      setDebugText(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    const intv = setInterval(fetchDeliveries, 15000);
    return () => clearInterval(intv);
  }, []);

  const handleAssignInternal = async (orderId) => {
    try {
      const sessionStr = window.localStorage.getItem('adminSession') || '{}';
      const session = JSON.parse(sessionStr);
      const token = session?.accessToken || session?.token || '';

      // Bước 1: Chuyển đơn sang DANG_GIAO để Shipper nội bộ thấy trong pool
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

      alert(`✅ Đã chuyển đơn ${orderId.slice(0, 8)} sang trạng thái "Đang Giao"!\nShipper nội bộ đang có thể nhận đơn ngay bây giờ.`);
      fetchDeliveries();
    } catch (err) {
      console.error(err);
      alert(`❌ Lỗi khi chuyển đơn: ${err.message}`);
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
        
        // Chờ 1.2s trước khi thử lại phần địa chỉ ngắn hơn để tránh Rate Limit
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
      
      // Lấy thông tin địa chỉ thật từ DB
      let pickupAddressStr = "220 Điện Biên Phủ, Phường Võ Thị Sáu, Quận 3, TP.HCM";
      let senderNameStr = "Highlands Coffee";
      let bCode = "MAC_DINH_CHI";
      try {
        const branchRes = await fetch(`${API_BASE_URL}/users/branches/public`);
        const branchData = await branchRes.json();
        const branches = branchData.data || branchData.items || [];
        
        const sessionStr = window.localStorage.getItem('adminSession') || '{}';
        const session = JSON.parse(sessionStr);
        bCode = (session?.user?.coSoMa || session?.user?.co_so_ma || 'MAC_DINH_CHI').toUpperCase();
        
        const currentBranch = branches.find(b => b.ma_chi_nhanh?.toUpperCase() === bCode || b.ma_co_so?.toUpperCase() === bCode || b.id === bCode);
        if (currentBranch) {
          if (currentBranch.dia_chi) pickupAddressStr = currentBranch.dia_chi;
          senderNameStr = currentBranch.ten_chi_nhanh || currentBranch.ten_co_so || currentBranch.name || "Highlands Coffee";
        }
      } catch (err) {
        console.error("Failed to fetch branch address:", err);
      }
      
      const deliveryAddressStr = order.dia_chi_giao_hang || "Quận 1, TP. Hồ Chí Minh";
      
      // Fallback toạ độ chuẩn cho các chi nhánh
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

      // Chạy thuật toán dò toạ độ siêu phân tích (cắt bớt nếu địa chỉ có rác)
      const pickupCoords = await getCoordinatesFromAddress(pickupAddressStr);
      if (pickupCoords) {
        pickupLat = pickupCoords.lat;
        pickupLng = pickupCoords.lng;
      }
      
      // Chờ 1 giây để tránh Rate Limit
      await new Promise(resolve => setTimeout(resolve, 1200));

      const deliveryCoords = await getCoordinatesFromAddress(deliveryAddressStr);
      if (deliveryCoords) {
        deliveryLat = deliveryCoords.lat;
        deliveryLng = deliveryCoords.lng;
      }

      let pickupAddress = pickupAddressStr;

      const quoteRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_address: pickupAddress,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          delivery_address: deliveryAddressStr,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng
        })
      });
      
      let quoteData;
      try {
        quoteData = await quoteRes.json();
      } catch (err) {}
      
      const quotationId = quoteData?.data?.data?.quotationId || quoteData?.data?.quotationId;
      const llmStops = quoteData?.data?.data?.stops || quoteData?.data?.stops || [];
      const senderStopId = llmStops[0]?.stopId;
      const recipientStopId = llmStops[1]?.stopId;

      if (!quoteRes.ok || !quotationId) {
        throw new Error(`Lỗi lấy báo giá từ Lalamove API: ${quoteData?.message || JSON.stringify(quoteData) || 'Không xác định'}`);
      }

      // 2. TẠO ĐƠN HÀNG LALAMOVE (Place Order)
      const orderRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        quotation_id: quotationId,
        sender_stop_id: senderStopId,
        recipient_stop_id: recipientStopId,
        sender_name: senderNameStr,
        sender_phone: "+84773670599", // SĐT chính chủ của Sandbox Partner Portal VN
        recipient_name: order.ten_khach_hang || "Khách Hàng",
        recipient_phone: "+84987654321",
        pickup_address: pickupAddress,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        delivery_address: deliveryAddressStr,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        remarks: "Đơn nước Avengers Coffee, giao cẩn thận!"
        })
      });
      
      let orderData;
      try {
        orderData = await orderRes.json();
      } catch (err) {}
      
      let llmOrder = orderData?.data?.data || orderData?.data;

      if (!orderRes.ok || !llmOrder?.orderId) {
         throw new Error(`Lỗi tạo đơn Lalamove API: ${orderData?.message || JSON.stringify(orderData) || 'Lỗi không xác định'}`);
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

      alert(`✅ Đã gọi Lalamove thành công!\nMã đơn LLM: ${llmOrder.orderRef || llmOrder.orderId}`);
      // Không cần fetchDeliveries ngay vì đã update state local
      
    } catch (err) {
      console.error(err);
      alert('❌ Lỗi khi gọi Lalamove: ' + err.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span>🛵</span> Quản lý Giao hàng
      </h2>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-100 rounded-lg w-full"></div>
          <div className="h-16 bg-gray-100 rounded-lg w-full"></div>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <span className="text-3xl mb-2 block">🎉</span>
          <p>Không có đơn hàng nào cần giao lúc này</p>
          <p className="text-xs mt-4 text-red-500 bg-red-50 inline-block p-1 rounded">Debug: {debugText}</p>
        </div>
      ) : (
        <div className="order-list">
          {deliveries.map(order => (
            <article key={order.ma_don_hang} className="order-card">
              <div>
                <h3>{order.ma_don_hang.slice(0, 8).toUpperCase()}</h3>
                <p>Khách: {order.ten_khach_hang || order.ma_nguoi_dung}</p>
                <p className="order-card-addr">📍 {order.dia_chi_giao_hang || 'Tại quán'}</p>
                {order.phuong_thuc_giao_hang && (
                  <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold', 
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '4px',
                      border: '1px solid',
                      color: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#c2410c' : '#4338ca',
                      backgroundColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#fff7ed' : '#e0e7ff',
                      borderColor: order.phuong_thuc_giao_hang === 'LALAMOVE' ? '#ffedd5' : '#c7d2fe'
                    }}>
                      Khách chọn: {order.phuong_thuc_giao_hang === 'LALAMOVE' ? '🚀 Lalamove' : '🛵 Shipper Nội Bộ'}
                    </span>
                  </p>
                )}
                
                <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
                  {lalamoveLinks[order.ma_don_hang] ? (
                    <>
                      <div style={{
                        background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                        padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 'bold'
                      }}>
                        ✅ Đã giao Lalamove
                      </div>
                      <a 
                        href={lalamoveLinks[order.ma_don_hang]} 
                        target="_blank" 
                        rel="noreferrer"
                        className="secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        🗺️ Xem Tracking
                      </a>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleAssignInternal(order.ma_don_hang)}
                        style={order.phuong_thuc_giao_hang !== 'LALAMOVE' ? {
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          color: '#fff', border: 'none', borderRadius: '6px',
                          padding: '0.35rem 0.75rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer'
                        } : {}}
                        className={order.phuong_thuc_giao_hang === 'LALAMOVE' ? "secondary" : ""}
                      >
                        {order.phuong_thuc_giao_hang !== 'LALAMOVE' && '✅ '}Shipper Nội Bộ
                      </button>
                      
                      <button 
                        onClick={() => handleCallLalamove(order)}
                        style={order.phuong_thuc_giao_hang === 'LALAMOVE' ? {
                          background: 'linear-gradient(135deg, #f97316, #ea580c)',
                          color: '#fff', border: 'none', borderRadius: '6px',
                          padding: '0.35rem 0.75rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer'
                        } : {}}
                        className={order.phuong_thuc_giao_hang !== 'LALAMOVE' ? "secondary" : ""}
                      >
                        {order.phuong_thuc_giao_hang === 'LALAMOVE' && '✅ '}Lalamove
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              <div style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#113a5d', marginBottom: '0.2rem' }}>COD</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0052cc', marginBottom: '0.2rem' }}>
                  {Number(order.tong_tien || 0).toLocaleString()} đ
                </div>
              </div>

              <div className="order-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#666', marginBottom: '0.2rem' }}>Trạng thái đơn</span>
                <span style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  backgroundColor: order.trang_thai_don_hang === 'DANG_GIAO' ? '#e0f2fe' : '#fef9c3',
                  color: order.trang_thai_don_hang === 'DANG_GIAO' ? '#0369a1' : '#854d0e',
                  border: `1px solid ${order.trang_thai_don_hang === 'DANG_GIAO' ? '#bae6fd' : '#fef08a'}`
                }}>
                  {order.trang_thai_don_hang}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
