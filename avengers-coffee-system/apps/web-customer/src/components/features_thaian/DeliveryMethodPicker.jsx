import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import React from 'react';

export default function DeliveryMethodPicker({ selectedMethod, onChange, lalamoveFee = 0, lalamoveLoading = false }) {
  useUiLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-gray-500">{ui("Phương thức giao hàng")}</label>
      <select
        value={selectedMethod || 'INTERNAL'}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors cursor-pointer"
      >
        <option value="INTERNAL">{ui("🛵 Avengers Delivery (Shipper riêng - Miễn phí)")}</option>
        <option value="LALAMOVE">{ui("🚚 Giao hỏa tốc Lalamove (")}{lalamoveLoading
            ? ui("Đang tính phí...")
            : lalamoveFee > 0
            ? ui("{{v0}} đ", {v0:lalamoveFee.toLocaleString(uiLocale())})
            : ui("Chờ tính phí...")}
          )
        </option>
      </select>
    </div>
  );
}

