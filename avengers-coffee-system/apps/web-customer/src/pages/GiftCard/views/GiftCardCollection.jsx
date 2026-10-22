import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React, { useState } from 'react';

const CARD_COLLECTIONS = [
  {
    id: 'chill_2025',
    title: 'Chill Hè 2025 Collection',
    tag: 'Mùa Hè Sôi Động',
    year: '2025',
    desc: 'Bộ sưu tập Thẻ Chill Hè 2025 với 3 sắc thái rực rỡ, mang năng lượng tươi mới xua tan cái nóng hè oi bức.',
    cards: [
      {
        id: 'chill_1',
        name: 'Chill Hè Vàng',
        theme: 'chill_1',
        color: '#ffd600',
        badge: 'Bán Chạy',
        image: '/images/cards/chill_1.png',
        desc: 'Sắc vàng rực rỡ của ánh nắng ban mai, tràn ngập cảm hứng tích cực cho ngày làm việc mới.',
      },
      {
        id: 'chill_2',
        name: 'Chill Hè Xanh',
        theme: 'chill_2',
        color: '#00bcd4',
        badge: 'Tươi Mát',
        image: '/images/cards/chill_2.png',
        desc: 'Màu xanh ngọc thanh dịu tựa làn gió biển nhiệt đới mát lạnh, xua tan căng thẳng.',
      },
      {
        id: 'chill_3',
        name: 'Chill Hè Hồng',
        theme: 'chill_3',
        color: '#e91e63',
        badge: 'Được Yêu Thích',
        image: '/images/cards/chill_3.png',
        desc: 'Sắc hồng ngọt ngào, tinh tế thay lời tỏ tình và quan tâm dịu dàng đến người thương.',
      },
    ],
  },
  {
    id: 'tet_2025',
    title: 'Tết Mã 2025 Collection',
    tag: 'Xuân Ất Tỵ',
    year: '2025',
    desc: 'Thẻ "Vàng Kim" đón ngàn lộc may năm mới, gửi gắm chúc phúc vạn sự như ý, tấn tài tấn lộc.',
    cards: [
      {
        id: 'tet_2025',
        name: 'Tết Mã Vàng (Special Edition)',
        theme: 'tet_2025',
        color: '#d32f2f',
        badge: 'Phiên Bản Giới Hạn',
        image: '/images/cards/tet_2025.png',
        desc: 'Họa tiết phong thủy hoàng kim sang trọng, biểu trưng cho sự thịnh vượng, hanh thông.',
      },
    ],
  },
  {
    id: 'festive_2026',
    title: 'Festive 2026 Collection',
    tag: 'Mùa Đông & Giáng Sinh',
    year: '2026',
    desc: 'Thẻ chủ đề Mùa Lễ Hội Giáng Sinh với 2 tông màu đỏ ấm và xanh thông đặc trưng, lan tỏa sự ấm áp.',
    cards: [
      {
        id: 'festive_1',
        name: 'Festive Đỏ Lễ Hội',
        theme: 'festive_1',
        color: '#c62828',
        badge: 'Mùa Lễ Hội',
        image: '/images/cards/festive_1.png',
        desc: 'Sắc đỏ Giáng Sinh nồng ấm cùng hương vị cà phê nướng nồng nàn sum vầy bên gia đình.',
      },
      {
        id: 'festive_2',
        name: 'Festive Xanh Thông',
        theme: 'festive_2',
        color: '#2e7d32',
        badge: 'Mùa Lễ Hội',
        image: '/images/cards/festive_2.png',
        desc: 'Màu xanh lá thông biểu tượng cho sức sống bền bỉ và sự bình an trong mùa đông.',
      },
    ],
  },
  {
    id: 'thankyou_2026',
    title: 'Thank You 2026 Collection',
    tag: 'Tri Ân & Sinh Nhật',
    year: '2026',
    desc: 'Bộ thẻ Tri Ân độc quyền thay cho lời cảm ơn chân thành gửi đến những người đồng hành đáng quý.',
    cards: [
      {
        id: 'thankyou_1',
        name: 'Thank You Fan',
        theme: 'thankyou_1',
        color: '#795548',
        badge: 'Tri Ân',
        image: '/images/cards/thankyou_1.png',
        desc: 'Họa tiết vintage cà phê cổ điển, dành riêng cho những tín đồ trung thành của Avengers.',
      },
      {
        id: 'thankyou_2',
        name: 'Thank You Trắng',
        theme: 'thankyou_2',
        color: '#f5f5f5',
        badge: 'Thanh Lịch',
        image: '/images/cards/thankyou_2.png',
        desc: 'Nền trắng ngà ngọc trai tối giản, đường nét thanh thoát toát lên vẻ trang nhã tuyệt mỹ.',
      },
      {
        id: 'thankyou_3',
        name: 'Thank You Nâu Cà Phê',
        theme: 'thankyou_3',
        color: '#5d4037',
        badge: 'Đậm Đà',
        image: '/images/cards/thankyou_3.png',
        desc: 'Tông màu hạt cà phê rang mộc ấm áp, kết nối tình cảm qua từng ngụm cà phê thơm lành.',
      },
    ],
  },
];

export const GiftCardCollection = ({ onNavigate }) => {
  useUiLanguage();
  const [activeTab, setActiveTab] = useState('all');

  const filteredCollections = activeTab === 'all'
    ? CARD_COLLECTIONS
    : CARD_COLLECTIONS.filter(c => c.id === activeTab);

  const totalCards = CARD_COLLECTIONS.reduce((acc, c) => acc + c.cards.length, 0);

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Header Banner */}
      <section className="bg-gradient-to-r from-[#80141a] via-[#a8222a] to-[#590e13] text-white py-16 px-4">
        <div className="max-w-[1140px] mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/15 text-amber-200 text-xs font-semibold tracking-wider uppercase mb-4 backdrop-blur-sm">
            {ui("Bộ Sưu Tập Nghệ Thuật")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
            {ui("Thư Viện Thẻ Quà Tặng Avengers Coffee")}
          </h1>
          <p className="text-stone-200 text-sm md:text-base max-w-[680px] mx-auto leading-relaxed font-light">
            {ui("Khám phá hơn {{count}} thiết kế thẻ độc quyền được chế tác công phu theo các mùa trong năm. Mỗi tấm thẻ là một câu chuyện tình cảm đặc biệt.", { count: totalCards })}
          </p>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 pt-10">

        {/* Filter Tabs */}
        <div className="flex items-center justify-start md:justify-center gap-2 overflow-x-auto pb-4 mb-12 scrollbar-none">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-5 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-[#b22830] text-white shadow-md shadow-red-900/20'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            {ui("Tất Cả ({{v0}} Mẫu)", { v0: totalCards })}
          </button>
          {CARD_COLLECTIONS.map(col => (
            <button
              key={col.id}
              onClick={() => setActiveTab(col.id)}
              className={`px-5 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === col.id
                  ? 'bg-[#b22830] text-white shadow-md shadow-red-900/20'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              {ui(col.title.replace(' Collection', ''))}
            </button>
          ))}
        </div>

        {/* Collections List */}
        <div className="space-y-16">
          {filteredCollections.map(collection => (
            <div key={collection.id} className="bg-white rounded-3xl p-6 md:p-10 border border-stone-200/70 shadow-[0_8px_30px_-5px_rgba(0,0,0,0.04)]">
              {/* Collection Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-8 pb-6 border-b border-stone-100">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-semibold mb-2">
                    <span>{collection.tag}</span>
                    <span>•</span>
                    <span>{collection.year}</span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
                    {ui(collection.title)}
                  </h2>
                  <p className="text-xs md:text-sm text-stone-500 mt-1 max-w-[650px]">
                    {ui(collection.desc)}
                  </p>
                </div>
                <div className="text-xs font-semibold text-stone-400">
                  {collection.cards.length} {ui("mẫu thiết kế")}
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {collection.cards.map(card => (
                  <div
                    key={card.id}
                    className="group bg-[#fcfaf7] rounded-2xl overflow-hidden border border-stone-200/60 hover:border-[#b22830]/40 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col"
                  >
                    {/* Card Graphic Container */}
                    <div className="relative p-5 pb-2 bg-gradient-to-b from-stone-100/70 to-transparent flex items-center justify-center">
                      <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden shadow-[0_8px_20px_-3px_rgba(0,0,0,0.18)] group-hover:scale-105 transition-transform duration-300 bg-stone-200">
                        <img
                          src={card.image}
                          alt={card.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {/* Badge */}
                      <span className="absolute top-7 right-7 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/75 text-white backdrop-blur-sm shadow-md">
                        {ui(card.badge)}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 pt-3 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-stone-300 flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: card.color }}
                        />
                        <h3 className="font-bold text-stone-900 text-base">
                          {ui(card.name)}
                        </h3>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed mb-5 flex-1">
                        {ui(card.desc)}
                      </p>

                      {/* Action Button */}
                      <button
                        onClick={() => onNavigate('home')}
                        className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#b22830] text-[#b22830] hover:text-white font-bold text-xs border border-[#b22830]/30 hover:border-transparent transition-all shadow-xs flex items-center justify-center gap-1.5 group/btn"
                      >
                        <span>{ui("Chọn Thẻ Này Tặng Ngay")}</span>
                        <span className="group-hover/btn:translate-x-0.5 transition-transform">→</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Global Bottom CTA */}
        <div className="mt-16 text-center bg-white rounded-3xl p-10 border border-stone-200/80 shadow-md">
          <h3 className="text-xl md:text-2xl font-bold text-stone-900 mb-2">
            {ui("Chưa tìm thấy mẫu thẻ bạn cần?")}
          </h3>
          <p className="text-xs md:text-sm text-stone-500 max-w-[500px] mx-auto mb-6">
            {ui("Doanh nghiệp muốn thiết kế mẫu thẻ riêng mang đậm dấu ấn thương hiệu hoặc đặt mua số lượng lớn?")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onNavigate('mua-so-luong-lon')}
              className="px-6 py-3 bg-[#b22830] hover:bg-[#911f26] text-white font-bold rounded-full text-xs md:text-sm transition-all shadow-md"
            >
              {ui("Tư Vấn Thẻ Doanh Nghiệp")}
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-full text-xs md:text-sm transition-all"
            >
              {ui("Quay Lại Đặt Thẻ")}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
