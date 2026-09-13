import React, { useState, useEffect } from 'react';
import { 
  TruckIcon, 
  XMarkIcon, 
  MagnifyingGlassIcon, 
  ClockIcon, 
  ArrowLeftIcon,
  ShieldCheckIcon,
  MapPinIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import OrderLookupPage from '../pages/features_thaian/OrderLookupPage';
import OrderTrackingPage from '../pages/features_thaian/OrderTrackingPage';

export default function OrderTrackingModal({ isOpen, onClose, initialOrderId = null }) {
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId);

  useEffect(() => {
    if (initialOrderId) {
      setSelectedOrderId(initialOrderId);
    }
  }, [initialOrderId]);

  useEffect(() => {
    if (!isOpen) {
      // Don't reset selectedOrderId immediately to prevent flashing during close animation
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col z-10 animate-scaleUp">
        
        {/* Top Modal Header */}
        <div className="bg-[#b22830] px-6 py-4 flex items-center justify-between text-white shrink-0 border-b border-red-900/40">
          <div className="flex items-center gap-3">
            {selectedOrderId ? (
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center text-white"
                title="Quay lại tra cứu"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <TruckIcon className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-wide text-white leading-tight font-sans">
                {selectedOrderId ? `Theo Dõi Đơn Hàng #${selectedOrderId}` : 'Tra Cứu & Theo Dõi Đơn Hàng'}
              </h3>
              <p className="text-xs text-amber-200 font-medium leading-tight">
                {selectedOrderId ? 'Cập nhật lộ trình tài xế thời gian thực' : 'Theo dõi trạng thái giao hàng tức thì'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all cursor-pointer"
            title="Đóng"
          >
            <XMarkIcon className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto bg-[#faf8f5]">
          {selectedOrderId ? (
            <div className="p-2 sm:p-4">
              <OrderTrackingPage
                id={selectedOrderId}
                onBack={() => setSelectedOrderId(null)}
              />
            </div>
          ) : (
            <div className="p-2 sm:p-4">
              <OrderLookupPage
                onSelectOrder={(orderId) => setSelectedOrderId(orderId)}
                onBack={onClose}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
