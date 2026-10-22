import { uiText as ui, useUiLanguage } from "../../lib/uiText";
import React, { useState } from 'react';
import {
  RiMapPin2Fill,
  RiPhoneLine,
  RiMailLine,
  RiSendPlaneFill,
  RiCheckboxCircleFill,
  RiShieldCheckFill,
  RiFacebookFill,
  RiInstagramLine,
} from 'react-icons/ri';
import { useTranslation } from 'react-i18next';

export default function Footer({ onTabChange }) {
  useUiLanguage();
  const { t } = useTranslation();
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

  const navigate = (tab) => {
    onTabChange?.(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="w-full bg-[#b22830] text-white font-sans border-t border-red-800/80 relative z-10">
      {/* Main Footer Content */}
      <div className="max-w-[1240px] mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">

          {/* ── COL 1: BRAND & COMPANY INFO (4 Cols) ── */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/images/brand/logo-white.png"
                alt="Avengers Coffee"
                className="h-14 sm:h-16 w-auto object-contain drop-shadow-sm"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">Avengers Coffee</h3>
              </div>
            </div>

            <p className="text-xs text-red-100/90 font-medium leading-relaxed">
              {t('orderFooter.companyDesc')}
            </p>

            <ul className="space-y-2.5 text-xs text-red-100/90 font-medium">
              <li className="flex items-start gap-2.5">
                <RiMapPin2Fill className="w-4 h-4 text-white shrink-0 mt-0.5" />
                <button
                  type="button"
                  onClick={() => navigate('stores')}
                  className="text-left text-white underline underline-offset-4 hover:text-red-200 transition-colors cursor-pointer"
                >
                  {t('orderFooter.findStore')}
                </button>
              </li>
              <li className="flex items-center gap-2.5">
                <RiPhoneLine className="w-4 h-4 text-white shrink-0" />
                <span className="text-white font-semibold">Hotline: 1900 1755</span>
              </li>
              <li className="flex items-center gap-2.5">
                <RiMailLine className="w-4 h-4 text-white shrink-0" />
                <span className="text-red-100 truncate">cskh@avengerscoffee.vn</span>
              </li>
            </ul>

            {/* Social Media Pills */}
            <div className="pt-2 flex items-center gap-2.5">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white text-white hover:text-[#1877f2] flex items-center justify-center transition-all shadow-sm"
                title="Facebook"
              >
                <RiFacebookFill className="w-4 h-4" />
              </a>
              <a
                href="https://zalo.me"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white text-white hover:text-[#0068ff] flex items-center justify-center text-xs font-bold transition-all shadow-sm"
                title="Zalo"
              >
                Zalo
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white text-white hover:text-[#e4405f] flex items-center justify-center transition-all shadow-sm"
                title="Instagram"
              >
                <RiInstagramLine className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* ── COL 2: CHÍNH SÁCH (3 Cols) ── */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-white tracking-wider border-b border-white/20 pb-2">
              {t('orderFooter.policies')}
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-red-100/90">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('chinh-sach-dat-hang')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.orderPolicy')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('chinh-sach-dat-hang')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.privacyPolicy')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('chinh-sach-dat-hang')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.paymentPolicy')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('membership')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.memberBenefits')}
                </button>
              </li>
            </ul>
          </div>

          {/* ── COL 3: HỖ TRỢ KHÁCH HÀNG (2 Cols) ── */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-xs font-bold text-white tracking-wider border-b border-white/20 pb-2">
              {t('orderFooter.support')}
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-red-100/90">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('tra-cuu-don')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.trackOrder')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('stores')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.findStore')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('contact')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.helpCenter')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('lucky-wheel')}
                  className="hover:text-white hover:translate-x-1 transition-all cursor-pointer bg-transparent border-none p-0 text-left"
                >
                  {t('orderFooter.luckyWheel')}
                </button>
              </li>
            </ul>
          </div>

          {/* ── COL 4: ĐĂNG KÝ NHẬN TIN (3 Cols) ── */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-white tracking-wider border-b border-white/20 pb-2">
              {t('orderFooter.subscribe')}
            </h4>
            <p className="text-xs text-red-100/90 font-medium leading-relaxed">
              {t('orderFooter.subscribeDesc')}
            </p>

            <form onSubmit={handleSubscribe} className="space-y-2 pt-1">
              <div className="relative flex items-center">
                <input
                  type="email"
                  placeholder={t('orderFooter.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/15 border border-white/30 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-white placeholder-red-200 outline-none focus:bg-white/25 focus:border-white transition-all font-medium"
                  required
                />
                <button
                  type="submit"
                  className="absolute right-1.5 p-1.5 rounded-lg bg-white text-[#b22830] hover:bg-red-100 transition-colors cursor-pointer shadow-sm"
                  title={ui("Đăng ký")}
                >
                  <RiSendPlaneFill className="w-4 h-4" />
                </button>
              </div>
              {subscribed && (
                <p className="text-[11px] font-bold text-white flex items-center gap-1 bg-white/20 px-2 py-1 rounded-md animate-fade-in">
                  <RiCheckboxCircleFill className="w-4 h-4 text-emerald-300" /> {t('orderFooter.subscribeSuccess')}
                </p>
              )}
            </form>

            <div className="pt-2 flex items-center gap-3">
              <img
                src="/hc-assets/logo_bct.png"
                alt={ui("Đã thông báo Bộ Công Thương")}
                className="h-10 w-auto object-contain bg-white rounded-md p-1 shadow-sm"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span className="text-[10px] text-red-100 font-semibold flex items-center gap-1">
                <RiShieldCheckFill className="w-4 h-4 text-emerald-300" /> {t('orderFooter.copyrightText')}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Copyright Line */}
      <div className="border-t border-white/15 bg-[#961f26] py-5 px-4">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-red-200 font-medium">
          <p>{t('orderFooter.allRightsReserved')}</p>
          <div className="flex items-center gap-4 text-[11px]">
            <a href="#" className="hover:text-white transition-colors">{t('orderFooter.termsOfUse')}</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">{t('orderFooter.privacyPolicy')}</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">{t('orderFooter.siteMap')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
