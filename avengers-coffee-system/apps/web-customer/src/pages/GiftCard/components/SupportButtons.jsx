import React from 'react';

export const SupportButtons = ({ onNavigate }) => (
  <section className="py-16 bg-white text-center px-6">
    <h2 className="text-[22px] font-black uppercase tracking-wide text-[#1a1a1a] mb-10">
      Hỗ Trợ Thẻ Avengers Coffee
    </h2>
    <div className="flex flex-wrap gap-4 justify-center">
      {[
        { id: 've-the', label: 'Về Thẻ Avengers Coffee' },
        { id: 'chinh-sach', label: 'Điều khoản sử dụng' },
        { id: 'ho-tro', label: 'FAQs' },
      ].map(item => (
        <button key={item.id} onClick={() => onNavigate(item.id)}
          className="px-10 py-2.5 border-2 border-[#b22830] text-[#b22830] rounded-full text-[15px] font-bold hover:bg-[#b22830] hover:text-white transition-all shadow-sm">
          {item.label}
        </button>
      ))}
    </div>
  </section>
);
