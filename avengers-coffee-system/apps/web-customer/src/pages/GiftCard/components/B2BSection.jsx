import React from 'react';
import { B2B_BANNER } from '../constants';

export const B2BSection = ({ onNavigate }) => (
  <section className="py-10 bg-white px-6">
    <div className="max-w-[1024px] mx-auto border border-gray-100 bg-white shadow-[0_4px_25px_-5px_rgba(0,0,0,0.08)] rounded-2xl px-6 md:px-12 py-12 text-center font-sans">
      <h2 className="text-[32px] font-black text-[#b22830] mb-3">Giải pháp doanh nghiệp</h2>
      <p className="text-[15px] text-[#222] font-bold mb-10 max-w-[600px] mx-auto">
        Vui lòng nhấn "liên hệ" để gửi thông tin cho chúng tôi nếu bạn cần mua số lượng lớn để được hỗ trợ tốt nhất
      </p>
      {/* Banner container matches screenshot aspect */}
      <div className="mx-auto rounded-[32px] overflow-hidden mb-10 shadow-sm border border-gray-50">
        <img src={B2B_BANNER} alt="Giải pháp doanh nghiệp" className="w-full h-auto object-cover block" />
      </div>
      <button
        onClick={() => onNavigate('mua-so-luong-lon')}
        className="w-full md:w-[480px] py-4 bg-[#b22830] text-white font-bold rounded-full text-[16px] hover:bg-[#8c1f24] transition-colors shadow-md"
      >
        Liên Hệ
      </button>
    </div>
  </section>
);
