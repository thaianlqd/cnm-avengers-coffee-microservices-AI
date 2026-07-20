import React, { useEffect, useState } from 'react';
import ShipperMapView from '../../components/features_thaian/ShipperMapView';
import { apiClient } from '../../lib/apiClient';

export default function OrderTrackingPage({ id, onBack }) {
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Rating states
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isRated, setIsRated] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const handleRateShipper = async () => {
    setSubmittingRating(true);
    try {
      await apiClient.post(`/customers/guest/orders/${id}/rate-shipper`, { rating, comment });
      setIsRated(true);
      alert('Cảm ơn bạn đã đánh giá Shipper!');
    } catch (err) {
      alert(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi đánh giá');
    } finally {
      setSubmittingRating(false);
    }
  };

  const fetchTracking = async () => {
    try {
      const res = await apiClient.get(`/shippers/delivery/tracking/${id}?t=${Date.now()}`);
      
      // Ensure coordinates are numbers because Postgres decimal comes as string
      if (res.data?.shipper_location?.latitude) {
        res.data.shipper_location.latitude = Number(res.data.shipper_location.latitude);
        res.data.shipper_location.longitude = Number(res.data.shipper_location.longitude);
      }
      
      setTrackingData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tìm thấy thông tin đơn hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(() => {
      fetchTracking();
    }, 5000); // Poll every 5s for realtime updates
    
    return () => clearInterval(interval);
  }, [id]);

  if (loading && !trackingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-bold text-gray-600">Đang tải thông tin đơn hàng...</p>
      </div>
    );
  }

  if (error || !trackingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="text-4xl mb-4">🔍</div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Không tìm thấy đơn hàng</h2>
        <p className="text-gray-500 mb-6">{error}</p>
        <button onClick={onBack} className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl shadow hover:bg-indigo-700">
          Quay lại
        </button>
      </div>
    );
  }

  const { order, tracking, shipper, shipper_location, timeline, lalamove } = trackingData;

  const getBranchInfo = (code) => {
    switch (code) {
      case 'NVL_DN': 
        return { address: 'Avengers Coffee - 200 Nguyễn Văn Linh, Đà Nẵng', storeLoc: { latitude: 16.0544, longitude: 108.2022 }, destLoc: { latitude: 16.0700, longitude: 108.2200 } };
      case 'HBT_HCM': 
        return { address: 'Avengers Coffee - 15 Hai Bà Trưng, TP.HCM', storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
      case 'PD_HN': 
        return { address: 'Avengers Coffee - 10 Phạm Đình Hổ, Hà Nội', storeLoc: { latitude: 21.0285, longitude: 105.8542 }, destLoc: { latitude: 21.0350, longitude: 105.8600 } };
      case 'MAC_DINH_CHI': 
        return { address: 'Avengers Coffee - 30 Mạc Đĩnh Chi, TP.HCM', storeLoc: { latitude: 10.7831, longitude: 106.6992 }, destLoc: { latitude: 10.7900, longitude: 106.7050 } };
      case 'HCM_DIEN_BIEN_PHU': 
        return { address: 'Avengers Coffee - Điện Biên Phủ, TP.HCM', storeLoc: { latitude: 10.7930, longitude: 106.7000 }, destLoc: { latitude: 10.8000, longitude: 106.7100 } };
      default: 
        return { address: `Avengers Coffee - ${code || 'Cửa hàng'}`, storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
    }
  };

  const branchInfo = getBranchInfo(tracking?.branch_code);

  const currentStep = [...timeline].reverse().find(s => s.completed) || timeline[0];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-3 sticky top-0 z-50 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-black text-gray-900 leading-tight">Theo dõi đơn hàng</h1>
          <p className="text-xs font-bold text-gray-500">#{order.ma_don_hang}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        
        {/* Status Banner */}
        <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-indigo-100 text-sm font-medium">Trạng thái hiện tại</p>
            <h2 className="text-xl font-black">{currentStep?.label || order.trang_thai_don_hang}</h2>
            {tracking?.delivery_mode === 'LAY_TAI_QUAN' && tracking.pickup_time && (
              <p className="text-sm mt-1">Giờ lấy: {new Date(tracking.pickup_time).toLocaleString('vi-VN')}</p>
            )}
            {tracking?.delivery_mode === 'GIAO_TAN_NOI' && tracking?.delivery_method && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-white/20 rounded text-xs font-bold text-white border border-white/30">
                {tracking.delivery_method === 'LALAMOVE' ? '🚀 Giao hỏa tốc Lalamove' : '🛵 Avengers Delivery'}
              </div>
            )}
          </div>
          <div className="text-4xl">{currentStep?.icon || '📦'}</div>
        </div>

        {/* Rating Section when Completed */}
        {order?.trang_thai_don_hang === 'HOAN_THANH' && !isRated && tracking?.delivery_mode === 'GIAO_TAN_NOI' && (
          <div className="bg-white p-5 rounded-2xl shadow-lg border-2 border-indigo-100 text-center animate-fade-in-up">
            <div className="text-4xl mb-2">🎉</div>
            <h3 className="font-black text-xl text-gray-900 mb-1">Giao hàng thành công!</h3>
            <p className="text-sm text-gray-500 mb-4">Bạn đánh giá tài xế giao hàng thế nào?</p>
            
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  key={star} 
                  onClick={() => setRating(star)}
                  className={`text-3xl transition-transform hover:scale-110 ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
                >
                  ★
                </button>
              ))}
            </div>
            
            <textarea 
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Chia sẻ thêm cảm nhận của bạn (không bắt buộc)..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm mb-4 outline-none focus:border-indigo-500 transition-colors"
              rows={2}
            />
            
            <button 
              onClick={handleRateShipper}
              disabled={submittingRating}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submittingRating ? 'Đang gửi...' : 'Gửi Đánh Giá'}
            </button>
          </div>
        )}

        {/* Map Section */}
        {tracking?.delivery_mode === 'GIAO_TAN_NOI' && order?.trang_thai_don_hang !== 'HOAN_THANH' && (
          <div className="space-y-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1 relative">
              <ShipperMapView 
                height="350px"
                shipperLocation={shipper_location?.latitude ? shipper_location : { latitude: branchInfo.storeLoc.latitude + 0.002, longitude: branchInfo.storeLoc.longitude - 0.001 }}
                storeLocation={tracking.store_location || branchInfo.storeLoc}
                destinationLocation={tracking.destination_location || branchInfo.destLoc}
                shipperName={shipper?.full_name || 'Tài xế'}
                deliveryStatus={order.trang_thai_don_hang}
                storeAddress={branchInfo.address}
              />
            </div>
            
            {/* Debug info */}
            <div className="bg-gray-800 text-xs text-white p-2 rounded w-full">
              <strong>DEBUG INFO:</strong><br/>
              Shipper ID: {trackingData?.shipper?.id ? trackingData.shipper.id.split('-')[0] : 'CHƯA NHẬN ĐƠN (null)'} <br/>
              Raw Loc: {JSON.stringify(trackingData?.shipper_location)} <br/>
              ALL Deliveries for this order in DB: {JSON.stringify(trackingData?.DEBUG_ALL_DELIVERIES)}
            </div>
          </div>
        )}

        {/* Shipper/Lalamove Info */}
        {shipper && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-indigo-100 text-2xl">
              {shipper.avatar_url ? <img src={shipper.avatar_url} alt="Shipper" className="w-full h-full object-cover" /> : '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-gray-900 truncate">{shipper.full_name}</h3>
              <p className="text-sm font-bold text-indigo-600">{shipper.phone}</p>
              <div className="flex items-center gap-2 mt-1 text-xs font-bold text-gray-500">
                <span className="bg-gray-100 px-2 py-0.5 rounded">{shipper.vehicle_plate}</span>
                {tracking?.delivery_method === 'LALAMOVE' && <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Lalamove</span>}
              </div>
            </div>
            <a href={`tel:${shipper.phone}`} className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex flex-shrink-0 items-center justify-center hover:bg-green-200 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </a>
          </div>
        )}

        {/* Lalamove specific info */}
        {lalamove?.share_link && (
          <div className="bg-orange-50 rounded-2xl shadow-sm border border-orange-200 p-4 flex flex-col items-center justify-center gap-2 text-center">
            {['ON_GOING', 'PICKED_UP', 'COMPLETED'].includes(lalamove.status) ? (
              <>
                <p className="text-sm font-bold text-orange-800">Theo dõi trực tiếp trên app Lalamove</p>
                <a
                  href={lalamove.share_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#F15A24] text-white px-6 py-2 rounded-xl font-bold hover:bg-orange-600 text-sm w-full"
                >
                  Mở link Lalamove
                </a>
              </>
            ) : (
              <div className="flex items-center gap-2 text-orange-700">
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold">Đang tìm tài xế Lalamove, vui lòng chờ giây lát...</p>
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-black text-gray-900 mb-4">Tiến trình đơn hàng</h3>
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.125rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
            {timeline.map((step, idx) => (
              <div key={step.key} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-9 h-9 rounded-full border-4 border-white z-10 font-bold text-sm flex-shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                  step.completed ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {step.icon}
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-gray-100 shadow-sm ml-2 md:ml-0 md:mr-2 md:group-odd:mr-0 md:group-odd:ml-2">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`font-bold ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</h4>
                    {step.time && (
                      <time className="text-[10px] font-medium text-gray-400">
                        {new Date(step.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute:'2-digit' })}
                      </time>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Details Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-black text-gray-900 mb-3 border-b border-gray-100 pb-3">Chi tiết đơn hàng</h3>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex gap-3 items-center">
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {item.hinh_anh_url ? <img src={item.hinh_anh_url} alt={item.ten_san_pham} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">☕</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{item.ten_san_pham}</p>
                  {item.kich_co && <p className="text-xs text-gray-500">Size: {item.kich_co}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{item.gia_ban.toLocaleString('vi-VN')} đ</p>
                  <p className="text-xs text-gray-500">x{item.so_luong}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="font-bold text-gray-600">Tổng cộng</span>
            <span className="font-black text-indigo-600 text-lg">{order.tong_tien.toLocaleString('vi-VN')} đ</span>
          </div>
        </div>

      </div>
    </div>
  );
}
