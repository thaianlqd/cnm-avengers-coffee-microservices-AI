import React, { useState } from 'react';
import { 
  MapPinIcon, 
  PhoneIcon, 
  EnvelopeIcon, 
  PaperAirplaneIcon,
  CheckCircleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

export default function OrderFooter({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <footer className="w-full bg-[#18181b] text-gray-300 font-sans border-t border-gray-800 relative z-10">
      {/* Top Red Accent Strip */}
      <div className="w-full h-1.5 bg-gradient-to-r from-[#80071c] via-[#b22830] to-amber-600"></div>

      {/* Main Footer Content */}
      <div className="max-w-[1240px] mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">

          {/* ── COL 1: BRAND & COMPANY INFO (4 Cols) ── */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <img 
                src="/hc-assets/red_BG_logo800.png" 
                alt="Avengers Coffee" 
                className="h-12 w-auto object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wide">Avengers Coffee</h3>
                <p className="text-[11px] text-amber-400 font-extrabold uppercase tracking-widest">Highlands Coffee® Authorized</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 font-medium leading-relaxed">
              Highlands Coffee® Order thuộc CÔNG TY CỔ PHẦN DỊCH VỤ CÀ PHÊ CAO NGUYÊN tự hào là nhà phân phối hợp lệ cho tất cả các sản phẩm mang thương hiệu Highlands Coffee®. Trụ sở văn phòng:
            </p>

            <ul className="space-y-2.5 text-xs text-gray-300 font-medium">
              <li className="flex items-start gap-2.5">
                <MapPinIcon className="w-4 h-4 text-[#b22830] shrink-0 mt-0.5" />
                <span className="text-gray-300 leading-normal">
                  125-127 Nguyễn Cơ Thạch, Phường An Lợi Đông, TP. Thủ Đức, TP. Hồ Chí Minh. MSDN: 0309965814.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <PhoneIcon className="w-4 h-4 text-[#b22830] shrink-0" />
                <span className="text-white font-extrabold">Hotline: 1900 1755</span>
              </li>
              <li className="flex items-center gap-2.5">
                <EnvelopeIcon className="w-4 h-4 text-[#b22830] shrink-0" />
                <span className="text-gray-300 truncate">customerservice@highlandscoffee.com.vn</span>
              </li>
            </ul>

            {/* Social Media Pills */}
            <div className="pt-2 flex items-center gap-2.5">
              <a 
                href="https://facebook.com" 
                target="_blank" 
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-[#1877f2] text-white flex items-center justify-center transition-colors shadow-2xs"
                title="Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
              </a>
              <a 
                href="https://zalo.me" 
                target="_blank" 
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-[#0068ff] text-white flex items-center justify-center text-xs font-black transition-colors shadow-2xs"
                title="Zalo"
              >
                Zalo
              </a>
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-[#e4405f] text-white flex items-center justify-center transition-colors shadow-2xs"
                title="Instagram"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
              </a>
            </div>
          </div>

          {/* ── COL 2: CHÍNH SÁCH (3 Cols) ── */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider border-b border-gray-800 pb-2">
              Chính Sách & Quyền Lợi
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-gray-400">
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('chinh-sach-dat-hang')} 
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Chính sách đặt hàng & giao nhận
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Chính sách bảo mật thông tin
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Chính sách thanh toán VNPAY Online
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('hoi-vien')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Quyền lợi hội viên Loyalty Club
                </button>
              </li>
            </ul>
          </div>

          {/* ── COL 3: HỖ TRỢ KHÁCH HÀNG (2 Cols) ── */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider border-b border-gray-800 pb-2">
              Hỗ Trợ Khách Hàng
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-gray-400">
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('tra-cuu-don-hang')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Tra cứu đơn hàng
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('cua-hang')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Tìm cửa hàng gần bạn
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('ho-tro')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Trung tâm trợ giúp & FAQ
                </button>
              </li>
              <li>
                <button 
                  type="button" 
                  onClick={() => onNavigate?.('vong-quay')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  Vòng quay may mắn
                </button>
              </li>
            </ul>
          </div>

          {/* ── COL 4: ĐĂNG KÝ NHẬN TIN (3 Cols) ── */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider border-b border-gray-800 pb-2">
              Đăng Ký Nhận Ưu Đãi
            </h4>
            <p className="text-xs text-gray-400 font-medium leading-relaxed">
              Nhận thông báo ưu đãi độc quyền, mã voucher và sản phẩm mới nhất từ Highlands Coffee.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-2 pt-1">
              <div className="relative flex items-center">
                <input
                  type="email"
                  placeholder="Nhập địa chỉ email của bạn..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-white placeholder-gray-500 outline-none focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] transition-all"
                  required
                />
                <button
                  type="submit"
                  className="absolute right-1.5 p-1.5 rounded-lg bg-[#b22830] hover:bg-[#8f1d24] text-white transition-colors cursor-pointer"
                  title="Đăng ký"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
              </div>
              {subscribed && (
                <p className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4" /> Đăng ký nhận tin thành công!
                </p>
              )}
            </form>

            <div className="pt-2 flex items-center gap-3">
              <img 
                src="/hc-assets/logo_bct.png" 
                alt="Đã thông báo Bộ Công Thương" 
                className="h-10 w-auto object-contain" 
                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
              />
              <span className="text-[10px] text-gray-500 font-semibold flex items-center gap-1">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-500" /> Bản quyền bảo hộ 100%
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Copyright Line */}
      <div className="border-t border-gray-800/80 bg-[#111113] py-5 px-4">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-medium">
          <p>© 2026 Highlands Coffee®. Tất cả các quyền được bảo lưu.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <a href="#" className="hover:text-gray-300 transition-colors">Điều khoản sử dụng</a>
            <span>•</span>
            <a href="#" className="hover:text-gray-300 transition-colors">Bảo mật thông tin</a>
            <span>•</span>
            <a href="#" className="hover:text-gray-300 transition-colors">Sơ đồ trang web</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
