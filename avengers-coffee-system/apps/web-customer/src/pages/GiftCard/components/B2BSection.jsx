import { uiText as ui } from "../../../lib/uiText";
import React from 'react';
import { B2B_BANNER } from '../constants';

export const B2BSection = ({ onNavigate }) => (
  <section className="py-16 bg-white px-4 md:px-6">
    <div className="max-w-[1140px] mx-auto overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-[#5a1418] text-white shadow-2xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 items-center">
        {/* Left Column - Content */}
        <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-4 w-fit backdrop-blur-sm">
            {ui("Avengers Coffee B2B Solutions")}
          </div>

          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mb-4 tracking-tight leading-tight">
            {ui("Giải Pháp Quà Tặng Doanh Nghiệp")}
          </h2>

          <p className="text-stone-300 text-sm md:text-base leading-relaxed mb-8">
            {ui("Trao gửi sự tri ân trân quý đến đối tác, khách hàng và nhân viên với giải pháp Thẻ Quà Tặng Avengers Coffee doanh nghiệp. Linh hoạt ngân sách, tối ưu chi phí và nâng tầm thương hiệu.")}
          </p>

          {/* Quick Perks */}
          <div className="grid grid-cols-2 gap-4 mb-8 text-xs md:text-sm">
            <div className="flex items-center gap-2.5 text-stone-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
              <span>{ui("Chiết khấu tới 15%")}</span>
            </div>
            <div className="flex items-center gap-2.5 text-stone-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
              <span>{ui("Hóa đơn VAT tức thì")}</span>
            </div>
            <div className="flex items-center gap-2.5 text-stone-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
              <span>{ui("In logo doanh nghiệp")}</span>
            </div>
            <div className="flex items-center gap-2.5 text-stone-200">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</span>
              <span>{ui("Giao mã bảo mật 24/7")}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => onNavigate('mua-so-luong-lon')}
              className="px-8 py-3.5 bg-[#b22830] hover:bg-[#992027] text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-red-900/40 hover:-translate-y-0.5"
            >
              {ui("Yêu Cầu Báo Giá & Tư Vấn")}
            </button>
            <button
              onClick={() => onNavigate('bo-suu-tap')}
              className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm backdrop-blur-sm transition-all"
            >
              {ui("Xem Các Mẫu Thẻ")}
            </button>
          </div>
        </div>

        {/* Right Column - Image */}
        <div className="relative h-64 lg:h-full min-h-[320px] overflow-hidden">
          <img
            src={B2B_BANNER}
            alt={ui("Giải pháp doanh nghiệp")}
            className="w-full h-full object-cover object-center scale-105 hover:scale-100 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-stone-900 via-stone-900/30 to-transparent"></div>
        </div>
      </div>
    </div>
  </section>
);
