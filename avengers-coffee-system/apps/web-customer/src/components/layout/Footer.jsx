import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Footer({ onTabChange }) {
  const { i18n } = useTranslation();
  const currentLng = i18n.resolvedLanguage || 'vi';
  const isEn = currentLng === 'en';

  const navigate = (tab) => {
    onTabChange?.(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="w-full bg-[#b22830] text-white font-sans py-12 sm:py-16 border-t border-red-900/40">
      <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-10 lg:gap-14">

          {/* Left: Brand Badge & Copyright */}
          <div className="flex flex-col items-start gap-6 shrink-0">
            <button
              type="button"
              onClick={() => navigate('home')}
              className="cursor-pointer transition-transform hover:scale-105 active:scale-95 bg-transparent border-none p-0"
              aria-label="Avengers Coffee Home"
            >
              <img
                src="/hc-assets/logo-white.png"
                alt="Avengers Coffee"
                className="h-20 sm:h-24 w-auto object-contain drop-shadow-md"
              />
            </button>
            <p className="text-xs sm:text-[13px] text-white/85 font-normal tracking-wide">
              © 2026 Avengers Coffee. All rights reserved
            </p>
          </div>

          {/* Right: Columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 lg:gap-14 w-full max-w-[880px]">
            {/* Col 1: VỀ AVENGERS */}
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-bold text-white uppercase tracking-wider mb-4">
                {isEn ? 'ABOUT AVENGERS' : 'VỀ AVENGERS'}
              </h4>
              <ul className="space-y-2.5 text-[13px] sm:text-[14px] text-white/90 font-normal">
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('about')}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer text-left bg-transparent border-none p-0"
                  >
                    {isEn ? 'Origin' : 'Nguồn gốc'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('order')}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer text-left bg-transparent border-none p-0"
                  >
                    {isEn ? 'Services' : 'Dịch vụ'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('careers')}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer text-left bg-transparent border-none p-0"
                  >
                    {isEn ? 'Careers' : 'Nghề Nghiệp'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('contact')}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer text-left bg-transparent border-none p-0"
                  >
                    {isEn ? 'Support' : 'Hỗ trợ'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 2: HỆ THỐNG CỬA HÀNG */}
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-bold text-white uppercase tracking-wider mb-4">
                {isEn ? 'STORE SYSTEM' : 'HỆ THỐNG CỬA HÀNG'}
              </h4>
              <ul className="space-y-2.5 text-[13px] sm:text-[14px] text-white/90 font-normal">
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('stores')}
                    className="hover:text-white hover:underline underline-offset-4 transition-colors cursor-pointer text-left bg-transparent border-none p-0"
                  >
                    {isEn ? 'Find nearest store' : 'Tìm cửa hàng gần nhất'}
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: TIN TỨC */}
            <div>
              <button
                type="button"
                onClick={() => navigate('news')}
                className="text-[14px] sm:text-[15px] font-bold text-white uppercase tracking-wider mb-4 hover:underline underline-offset-4 transition-colors cursor-pointer text-left block bg-transparent border-none p-0"
              >
                {isEn ? 'NEWS' : 'TIN TỨC'}
              </button>
            </div>

            {/* Col 4: THEO DÕI CHÚNG TÔI */}
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-bold text-white uppercase tracking-wider mb-4">
                {isEn ? 'FOLLOW US' : 'THEO DÕI CHÚNG TÔI'}
              </h4>
              <div className="flex items-center gap-3">
                <a
                  href="https://www.facebook.com/highlandscoffeevietnam"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="w-8 h-8 rounded-full bg-white text-[#b22830] flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
                </a>
                <a
                  href="https://www.instagram.com/highlandscoffeevietnam"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="w-8 h-8 rounded-full bg-white text-[#b22830] flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                </a>
                <a
                  href="https://www.youtube.com/@HighlandsCoffeeVietnam"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="YouTube"
                  className="w-8 h-8 rounded-full bg-white text-[#b22830] flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
                <a
                  href="https://www.tiktok.com/@highlandscoffeevietnam"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="TikTok"
                  className="w-8 h-8 rounded-full bg-white text-[#b22830] flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}
