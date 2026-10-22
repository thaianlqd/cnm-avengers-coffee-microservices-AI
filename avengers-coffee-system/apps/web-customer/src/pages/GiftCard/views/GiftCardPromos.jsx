import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React, { useState } from 'react';

const PROMOTIONS = [
  {
    id: 'promo-1',
    category: 'topup',
    title: 'Tặng Ngay 10% Giá Trị Khi Nạp Thẻ Từ 200.000đ',
    badge: 'Đang Diễn Ra',
    badgeColor: 'bg-emerald-500',
    image: '/images/cards/chill_1.png',
    period: 'Áp dụng: 01/10/2026 - 31/12/2026',
    desc: 'Ưu đãi đặc biệt nạp ví đầu tuần! Tặng thêm 10% trực tiếp vào số dư ví khi mua hoặc nạp thẻ quà tặng Avengers Coffee mệnh giá từ 200.000đ trở lên.',
    terms: 'Áp dụng cho mọi tài khoản thành viên. Tiền thưởng được cộng tự động vào ví trong vòng 5 phút.',
  },
  {
    id: 'promo-2',
    category: 'festive',
    title: 'Rộn Ràng Mùa Lễ Hội: Tặng Voucher Đồ Uống Miễn Phí',
    badge: 'Mùa Lễ Hội',
    badgeColor: 'bg-[#b22830]',
    image: '/images/cards/festive_1.png',
    period: 'Áp dụng: 15/11/2026 - 15/01/2027',
    desc: 'Khi gửi tặng Thẻ Festive Mùa Lễ Hội mệnh giá từ 300.000đ, người gửi sẽ nhận ngay 01 e-voucher miễn phí 01 ly Phin Sữa Đá cỡ lớn tại quầy.',
    terms: 'E-voucher có giá trị 30 ngày kể từ ngày nhận. Áp dụng tại toàn bộ hệ thống Avengers Coffee.',
  },
  {
    id: 'promo-3',
    category: 'loyalty',
    title: 'Thứ Tư Tri Ân: X2 Điểm Hội Viên Khi Dùng Ví Thẻ',
    badge: 'Hàng Tuần',
    badgeColor: 'bg-amber-500',
    image: '/images/cards/thankyou_2.png',
    period: 'Áp dụng: Mọi ngày Thứ Tư hàng tuần',
    desc: 'Nhân đôi điểm thưởng Avengers Rewards cho mọi giao dịch thanh toán bằng số dư Thẻ Quà Tặng vào ngày thứ Tư. Thăng hạng Gold/Diamond siêu tốc!',
    terms: 'Điểm thưởng X2 được cộng tự động sau khi đơn hàng hoàn tất.',
  },
  {
    id: 'promo-4',
    category: 'combo',
    title: 'Combo Quà Tặng Trà Chiều & Bánh Ngọt Đi Kèm Thẻ',
    badge: 'Đặc Quyền',
    badgeColor: 'bg-purple-600',
    image: '/images/brand/tea-and-croissant-v1.jpg',
    period: 'Áp dụng: Khung giờ 14h00 - 18h00 mỗi ngày',
    desc: 'Tặng e-coupon giảm 30% bánh nướng khi kích hoạt thẻ quà tặng thành công. Tận hưởng buổi trà chiều chuẩn vị cùng người thân yêu.',
    terms: 'Áp dụng khi mua kèm đồ uống bất kỳ trên app hoặc trực tiếp tại quán.',
  },
];

export const GiftCardPromos = ({ onNavigate }) => {
  useUiLanguage();
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filtered = selectedCategory === 'all'
    ? PROMOTIONS
    : PROMOTIONS.filter(p => p.category === selectedCategory);

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Hero Banner */}
      <section className="bg-gradient-to-r from-[#7d141b] via-[#a32029] to-[#4c0b0f] text-white py-16 px-4">
        <div className="max-w-[1140px] mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/15 text-amber-200 text-xs font-semibold tracking-wider uppercase mb-4 backdrop-blur-sm">
            {ui("Ưu Đãi Đặc Biệt")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
            {ui("Chương Trình Khuyến Mãi Thẻ Quà Tặng")}
          </h1>
          <p className="text-stone-200 text-sm md:text-base max-w-[680px] mx-auto leading-relaxed font-light">
            {ui("Tổng hợp các ưu đãi tặng kèm, chiết khấu nạp ví và đặc quyền độc quyền dành cho khách hàng sử dụng Thẻ Quà Tặng Avengers Coffee.")}
          </p>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 pt-10">

        {/* Feature Hero Campaign Banner */}
        <div className="relative rounded-3xl overflow-hidden shadow-xl mb-12 border border-stone-200 bg-stone-900">
          <img
            src="/campaigns/highlands-christmas-party.jpg"
            alt="Avengers Coffee Campaign"
            className="w-full h-64 md:h-80 object-cover opacity-60 scale-105 hover:scale-100 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-stone-950 via-stone-950/70 to-transparent flex items-center p-8 md:p-12">
            <div className="max-w-[550px] text-white">
              <span className="inline-block px-3 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold uppercase tracking-wider mb-3 shadow-md">
                {ui("Sự Kiện Nổi Bật")}
              </span>
              <h2 className="text-2xl md:text-4xl font-black tracking-tight mb-3">
                {ui("Lễ Hội Trao Quà - Nhận Ngàn Lộc May")}
              </h2>
              <p className="text-stone-300 text-xs md:text-sm leading-relaxed mb-6">
                {ui("Tặng thẻ cho bạn bè ngay hôm nay để nhận cơ hội trúng vé du lịch và hàng nghìn voucher quà tặng cà phê miễn phí suốt cả năm!")}
              </p>
              <button
                onClick={() => onNavigate && onNavigate('home')}
                className="px-6 py-3 bg-[#b22830] hover:bg-[#8c1f24] text-white font-bold rounded-xl text-xs md:text-sm transition-all shadow-md"
              >
                {ui("Tham Gia & Mua Thẻ Ngay")}
              </button>
            </div>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex items-center justify-start md:justify-center gap-2 overflow-x-auto pb-4 mb-10 scrollbar-none">
          {[
            { id: 'all', label: 'Tất Cả Ưu Đãi' },
            { id: 'topup', label: 'Khuyến Mãi Nạp Ví' },
            { id: 'festive', label: 'Mùa Lễ Hội' },
            { id: 'loyalty', label: 'Điểm Thưởng Hội Viên' },
            { id: 'combo', label: 'Combo & Voucher' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-5 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                selectedCategory === tab.id
                  ? 'bg-[#b22830] text-white shadow-md shadow-red-900/20'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              {ui(tab.label)}
            </button>
          ))}
        </div>

        {/* Promotions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filtered.map(promo => (
            <div
              key={promo.id}
              className="group bg-white rounded-3xl overflow-hidden border border-stone-200/80 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.05)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              {/* Promo Image Container */}
              <div className="relative h-56 bg-stone-100 overflow-hidden">
                <img
                  src={promo.image}
                  alt={promo.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white ${promo.badgeColor} shadow-md`}>
                  {ui(promo.badge)}
                </span>
              </div>

              {/* Promo Content */}
              <div className="p-6 md:p-8 flex flex-col flex-1">
                <div className="text-[11px] font-semibold text-stone-400 mb-2 flex items-center gap-1.5">
                  <span>📅</span>
                  <span>{ui(promo.period)}</span>
                </div>

                <h3 className="text-lg md:text-xl font-bold text-stone-900 mb-3 group-hover:text-[#b22830] transition-colors leading-snug">
                  {ui(promo.title)}
                </h3>

                <p className="text-xs md:text-sm text-stone-600 leading-relaxed mb-4 flex-1">
                  {ui(promo.desc)}
                </p>

                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-[11px] text-stone-500 mb-6">
                  <span className="font-bold text-stone-700">Điều kiện: </span>
                  {ui(promo.terms)}
                </div>

                <button
                  onClick={() => onNavigate && onNavigate('home')}
                  className="w-full py-3 bg-[#b22830] hover:bg-[#8c1f24] text-white font-bold rounded-xl text-xs md:text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <span>{ui("Mua Thẻ Nhận Ưu Đãi")}</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
