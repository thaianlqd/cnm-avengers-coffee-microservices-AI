import React from 'react';

export const GiftCardFooter = ({ onNavigate }) => (
  <footer className="w-full bg-[#b22830] text-white font-sans mt-auto">
    <div className="mx-auto max-w-[1280px] px-6 lg:px-8 pt-10 pb-4">
      <div className="flex flex-col md:flex-row justify-between gap-12 pb-8 border-b border-white/20">
        
        {/* Col 1 */}
        <div className="flex flex-col gap-4 w-[320px] flex-shrink-0">
          <div className="mb-2">
            <img src="/hc-assets/red_BG_logo800.png" alt="Avengers Coffee" className="w-[64px] h-[64px] object-contain" />
          </div>
          <p className="text-[14px] text-white/95 leading-[1.6]">
            <strong className="font-bold">Thẻ Avengers Coffee</strong> với thiết kế tinh tế, sử dụng dễ dàng - là món quà nhỏ bé để bạn trao tay người thương thay vạn lời muốn nói.
          </p>
          <div className="flex items-center gap-4 mt-2">
            <a href="https://facebook.com" target="_blank" rel="noreferrer" className="text-white hover:text-white/80 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M22.675 0h-21.35C.597 0 0 .597 0 1.325v21.351C0 23.403.597 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.597 1.323-1.324V1.325C24 .597 23.403 0 22.675 0z"/></svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer" className="text-white hover:text-white/80 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <span className="text-white/90 text-[14px] font-medium ml-2">Avengers Coffee</span>
          </div>
        </div>

        {/* Col 2 */}
        <div className="flex flex-col gap-1 w-[280px]">
          <h4 className="text-[15px] font-bold text-white mb-3">Avengers Gift Card</h4>
          {[
            { id: 've-the', label: 'Về thẻ Avengers Coffee' },
            { id: 'bo-suu-tap', label: 'Bộ sưu tập thẻ' },
            { id: 'chinh-sach', label: 'Chính sách' },
            { id: 'ho-tro', label: 'Hỗ trợ' },
            { id: 'mua-so-luong-lon', label: 'Mua số lượng lớn' },
            { id: 'khuyen-mai', label: 'Khuyến Mãi' },
          ].map(item => (
            <button key={item.id} onClick={() => onNavigate(item.id)} className="text-[14px] text-white hover:opacity-80 text-left w-fit transition-opacity leading-[2.2]">{item.label}</button>
          ))}
        </div>

        {/* Col 3 */}
        <div className="flex flex-col gap-3 w-[340px] flex-shrink-0">
          <h4 className="text-[15px] font-bold text-white mb-2">Liên Hệ</h4>
          <p className="text-[14px] text-white leading-relaxed mb-2">135/37/50 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam</p>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 flex-shrink-0"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.06 13.18 19.79 19.79 0 01.07 4.6 2 2 0 012.06 2.43h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 10.05a16 16 0 006.19 6.19l1.71-1.71a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            <a href="tel:19001755" className="text-[14px] hover:opacity-80 font-bold">19001755</a>
          </div>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 flex-shrink-0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <a href="mailto:customerservice@avengers-coffee.vn" className="text-[14px] text-white hover:opacity-80 transition-opacity">customerservice@avengers-coffee.vn</a>
          </div>
        </div>
        
      </div>
      <div className="py-6 text-center">
        <p className="text-[14px] text-white font-medium">© 2024 Avengers Coffee All Rights Reserved.</p>
      </div>
    </div>
  </footer>
);
