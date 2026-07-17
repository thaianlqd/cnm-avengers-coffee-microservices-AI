import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../admin-dashboard/constants';

export default function StaffDeliveryPanel() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [debugText, setDebugText] = useState('');

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

  const handleCallLalamove = async (order) => {
    try {
      alert(`Bắt đầu lấy báo giá & gọi Lalamove cho đơn ${order.ma_don_hang}... (Sandbox)`);
      
      const trackingRes = await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${order.ma_don_hang}`);
      // Tọa độ HỒNG KÔNG (Mặc định)
      let pickupLat = "22.336677"; // HK
      let pickupLng = "114.175713";
      let deliveryLat = "22.316677";
      let deliveryLng = "114.185713";
      let pickupAddress = "Avengers Coffee HK";

      if (trackingRes.ok) {
        const trackingData = await trackingRes.json();
        const tracking = trackingData?.tracking;
        if (tracking?.store_location?.latitude) {
          pickupLat = tracking.store_location.latitude.toString();
          pickupLng = tracking.store_location.longitude.toString();
        }
        if (tracking?.destination_location?.latitude) {
          deliveryLat = tracking.destination_location.latitude.toString();
          deliveryLng = tracking.destination_location.longitude.toString();
        }
      }

      // TẠM THỜI ÉP BUỘC TOẠ ĐỘ HK Ở ĐÂY ĐỂ TEST VỚI MÃ HK
      pickupLat = "22.336677";
      pickupLng = "114.175713";
      deliveryLat = "22.316677";
      deliveryLng = "114.185713";

      const deliveryAddressStr = "Mong Kok, HK"; // order.dia_chi_giao_hang || "Bến Thành, Quận 1, Hồ Chí Minh";

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
      } catch (err) {
        throw new Error(`Server returned non-JSON response (status ${quoteRes.status}). The server might be restarting or down.`);
      }
      
      if (!quoteRes.ok || (!quoteData?.data?.data?.quotationId && !quoteData?.data?.quotationId)) {
         throw new Error(quoteData?.message || 'Không thể lấy báo giá Lalamove. Vui lòng kiểm tra lại địa chỉ hoặc API Key.');
      }

      const quotationId = quoteData?.data?.data?.quotationId || quoteData?.data?.quotationId;
      const stops = quoteData?.data?.data?.stops || quoteData?.data?.stops || [];
      const senderStopId = stops[0]?.stopId;
      const recipientStopId = stops[1]?.stopId;

      if (!senderStopId || !recipientStopId) {
        throw new Error('Không lấy được thông tin điểm dừng từ Lalamove.');
      }
      
      const orderRes = await fetch(`${API_BASE_URL}/shippers/delivery/lalamove/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotation_id: quotationId,
          sender_stop_id: senderStopId,
          recipient_stop_id: recipientStopId,
          sender_name: "Avengers Coffee",
          sender_phone: "+84901234567",
          recipient_name: "Khach Hang",
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
      
      const orderData = await orderRes.json();
      if (!orderRes.ok || orderData.statusCode >= 400) {
        throw new Error(orderData.message || 'Lỗi khi gọi Lalamove API.');
      }

      const llmOrder = orderData?.data?.data || orderData?.data;
      if (!llmOrder || !llmOrder.orderId) {
         throw new Error('Lalamove trả về kết quả rỗng.');
      }
      
      await fetch(`${API_BASE_URL}/shippers/delivery/tracking/${order.ma_don_hang}/lalamove-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lalamove_order_id: llmOrder?.orderId,
          share_link: llmOrder?.shareLink
        })
      });

      alert(`✅ Đã gọi Lalamove thành công!\nMã đơn LLM: ${llmOrder?.orderRef || llmOrder?.orderId}`);
      fetchDeliveries();
      
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
        <div className="space-y-3">
          {deliveries.map(order => (
            <div key={order.ma_don_hang} className="border border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-indigo-700">#{order.ma_don_hang}</span>
                  <span className="text-xs text-gray-500 ml-2">{new Date(order.ngay_tao).toLocaleTimeString()}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-bold ${
                  order.trang_thai_don_hang === 'DANG_GIAO' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {order.trang_thai_don_hang}
                </span>
              </div>
              
              <div className="text-sm text-gray-600 mb-3">
                <p>📍 {order.dia_chi_giao_hang || 'Khách lấy tại quán'}</p>
                <p>💰 {Number(order.tong_tien).toLocaleString()} đ</p>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => handleAssignInternal(order.ma_don_hang)}
                  className="flex-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-1.5 rounded text-sm font-bold border border-indigo-200 transition-colors"
                >
                  Shipper Nội Bộ
                </button>
                <button 
                  onClick={() => handleCallLalamove(order)}
                  className="flex-1 bg-orange-50 text-orange-700 hover:bg-orange-100 py-1.5 rounded text-sm font-bold border border-orange-200 transition-colors flex items-center justify-center gap-1"
                >
                  🚚 Gọi Lalamove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
