import React from 'react';

export default function DeliveryMethodPicker({ selectedMethod, onChange, lalamoveFee = 0, lalamoveLoading = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-gray-500">Phương thức giao hàng</label>
      <select
        value={selectedMethod || 'INTERNAL'}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors cursor-pointer"
      >
        <option value="INTERNAL">🛵 Avengers Delivery (Shipper riêng - Miễn phí)</option>
        <option value="LALAMOVE">
          🚚 Giao hỏa tốc Lalamove (
          {lalamoveLoading
            ? 'Đang tính phí...'
            : lalamoveFee > 0
            ? `${lalamoveFee.toLocaleString('vi-VN')} đ`
            : 'Chờ tính phí...'}
          )
        </option>
      </select>
    </div>
  );
}

