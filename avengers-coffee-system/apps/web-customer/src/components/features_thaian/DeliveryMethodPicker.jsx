import React from 'react';

export default function DeliveryMethodPicker({ selectedMethod, onChange, lalamoveFee = 0, lalamoveLoading = false }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900">Phương thức giao hàng</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* INTERNAL Shipper */}
        <button
          type="button"
          onClick={() => onChange('INTERNAL')}
          className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
            selectedMethod === 'INTERNAL'
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 bg-white hover:border-indigo-200'
          }`}
        >
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-xl">
            🛵
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">Avengers Delivery</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">Shipper riêng của quán, theo dõi trên bản đồ</p>
            <p className="text-xs font-bold text-emerald-600 mt-1">Miễn phí giao hàng</p>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
            selectedMethod === 'INTERNAL' ? 'border-indigo-600' : 'border-gray-300'
          }`}>
            {selectedMethod === 'INTERNAL' && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
          </div>
        </button>

        {/* LALAMOVE */}
        <button
          type="button"
          onClick={() => onChange('LALAMOVE')}
          className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
            selectedMethod === 'LALAMOVE'
              ? 'border-[#F15A24] bg-orange-50'
              : 'border-gray-200 bg-white hover:border-orange-200'
          }`}
        >
          <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-xl">
            🚚
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">Giao hỏa tốc Lalamove</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">Giao nhanh tức thì bởi đối tác Lalamove</p>
            <div className="mt-1 flex items-center gap-2">
              {lalamoveLoading ? (
                <div className="h-4 w-16 bg-orange-200 animate-pulse rounded" />
              ) : (
                <p className="text-xs font-bold text-[#F15A24]">
                  {lalamoveFee > 0 ? `${lalamoveFee.toLocaleString('vi-VN')} đ` : 'Chờ tính phí...'}
                </p>
              )}
            </div>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
            selectedMethod === 'LALAMOVE' ? 'border-[#F15A24]' : 'border-gray-300'
          }`}>
            {selectedMethod === 'LALAMOVE' && <div className="w-2.5 h-2.5 bg-[#F15A24] rounded-full" />}
          </div>
        </button>
      </div>
    </div>
  );
}
