import React, { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { UserIcon, BookmarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function Support() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <main className="flex-grow w-full bg-white font-sans min-h-screen">
      {/* ── 1. HERO SECTION ── */}
      <section className="w-full bg-[#6c1417] py-24 px-4 flex flex-col items-center justify-center text-center">
        <h1 className="text-[36px] font-bold text-white mb-4">Chúng tôi có thể giúp gì?</h1>
        <p className="text-[16px] text-white font-medium mb-10">
          Chào mừng đến với Trung tâm khách hàng Highlands Coffee VN
        </p>
        
        {/* Search Bar */}
        <div className="relative w-full max-w-[650px]">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-14 pr-6 py-[18px] rounded-full border-none focus:ring-2 focus:ring-[#b22830] outline-none text-gray-800 text-[16px] shadow-sm"
            placeholder="Tìm kiếm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </section>

      {/* ── 2. CATEGORIES BLOCKS ── */}
      <section className="w-full max-w-[1200px] mx-auto px-4 py-16 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <a href="#" className="flex flex-col items-center justify-center bg-white border border-gray-100 shadow-sm rounded-sm py-12 px-6 hover:shadow-md transition-shadow group h-full">
            <div className="w-[80px] h-[80px] rounded-full bg-[#fcedee] flex items-center justify-center mb-6">
              <UserIcon className="h-10 w-10 text-[#d6212e]" strokeWidth={1.5} />
            </div>
            <h3 className="text-[18px] font-bold text-[#333333] uppercase tracking-wide">Đặt Hàng</h3>
            <p className="text-[13px] text-[#d6212e] font-bold mt-4 group-hover:underline">Xem Chi Tiết &rarr;</p>
          </a>
          
          {/* Card 2 */}
          <a href="#" className="flex flex-col items-center justify-center bg-white border border-gray-100 shadow-sm rounded-sm py-12 px-6 hover:shadow-md transition-shadow group h-full">
            <div className="w-[80px] h-[80px] rounded-full bg-[#fcedee] flex items-center justify-center mb-6">
              <BookmarkIcon className="h-10 w-10 text-[#d6212e]" strokeWidth={1.5} />
            </div>
            <h3 className="text-[18px] font-bold text-[#333333] uppercase tracking-wide">Thông Tin Thực Đơn</h3>
            <p className="text-[13px] text-[#d6212e] font-bold mt-4 group-hover:underline">Xem Chi Tiết &rarr;</p>
          </a>

          {/* Card 3 */}
          <a href="#" className="flex flex-col items-center justify-center bg-white border border-gray-100 shadow-sm rounded-sm py-12 px-6 hover:shadow-md transition-shadow group h-full">
            <div className="w-[80px] h-[80px] rounded-full bg-[#fcedee] flex items-center justify-center mb-6">
              <InformationCircleIcon className="h-10 w-10 text-[#d6212e]" strokeWidth={1.5} />
            </div>
            <h3 className="text-[18px] font-bold text-[#333333] uppercase tracking-wide">Hỗ Trợ</h3>
            <p className="text-[13px] text-[#d6212e] font-bold mt-4 group-hover:underline">Xem Chi Tiết &rarr;</p>
          </a>
        </div>
      </section>

      {/* ── 3. CONTACT US ── */}
      <section className="w-full max-w-[1200px] mx-auto px-4 pb-20">
        <h2 className="text-[26px] font-bold text-[#333333] mb-8">Liên Hệ</h2>
        <div className="bg-[#f3f4f6] rounded-xl p-8 md:p-12 text-[#333333]">
          <h3 className="text-[18px] font-bold mb-3">Trụ Sở Chính</h3>
          <p className="text-[15px] leading-relaxed mb-8 text-gray-700 max-w-[90%]">
            125-127 đường Nguyễn Cơ Thạch, phường An Lợi Đông, Thành phố Thủ Đức, TP. Hồ Chí Minh. Mã số DN: 0309965814 do Sở Kế hoạch và Đầu tư TP. Hồ Chí Minh cấp ngày 20/04/2010, sửa đổi lần thứ 30 ngày 30/08/2022.
          </p>

          <h3 className="text-[18px] font-bold mb-6 mt-10">Chăm Sóc Khách Hàng</h3>
          
          <div className="flex flex-wrap gap-4 mt-2">
            <a href="#" className="px-8 py-3 bg-[#be2831] text-white text-[15px] font-medium rounded-full hover:bg-[#8c1c24] transition-colors">
              Gửi tin nhắn
            </a>
            <a href="#" className="px-8 py-3 bg-[#be2831] text-white text-[15px] font-medium rounded-full hover:bg-[#8c1c24] transition-colors">
              Xem yêu cầu của tôi
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
