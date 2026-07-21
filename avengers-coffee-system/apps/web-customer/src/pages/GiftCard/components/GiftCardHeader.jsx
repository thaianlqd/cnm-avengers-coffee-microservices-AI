import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NAV_ITEMS } from '../constants';

export const GiftCardHeader = ({ activePage, onNavigate }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'vi';
  const closeTimer = useRef(null);

  const handleMouseEnter = () => { clearTimeout(closeTimer.current); setDropdownOpen(true); };
  const handleMouseLeave = () => { closeTimer.current = setTimeout(() => setDropdownOpen(false), 150); };

  return (
    <header className="w-full bg-[#b22830] sticky top-0 z-50">
      <div className="mx-auto flex py-2.5 w-full max-w-[1280px] items-center px-4 md:px-8">
        {/* Logo */}
        <button onClick={() => onNavigate('home')} className="flex-shrink-0 focus:outline-none">
          <img src="/hc-assets/red_BG_logo800.png" alt="Avengers Coffee" className="h-[64px] w-auto object-contain" />
        </button>

        {/* Nav - right aligned */}
        <nav className="hidden lg:flex items-center gap-10 ml-auto mr-12">
          {NAV_ITEMS.map((item) =>
            item.hasDropdown ? (
              <div key={item.id} className="relative h-full flex items-center py-2" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                <button onClick={() => onNavigate(item.id)} className="text-[15px] font-bold text-white hover:opacity-80 transition-opacity">
                  {t(`giftcard.nav.${item.id}`)}
                </button>
                {dropdownOpen && (
                  <div className="absolute top-[40px] left-1/2 -translate-x-1/2 bg-white shadow-2xl z-50 min-w-[400px] py-5 px-6 rounded-b-md" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45"></div>
                    <div className="flex gap-12 relative">
                      <div className="flex-1">
                        <p className="text-[14px] font-black text-[#b22830] mb-3 uppercase tracking-wide">{t('giftcard.nav.boSuuTap2024')}</p>
                        <ul className="space-y-2">
                          {['Festive 2024 Collection', 'Chill Hè 2024 Collection'].map(it => (
                            <li key={it} className="flex items-start gap-1.5"><span className="text-gray-400 text-[11px] mt-1">▸</span><button onClick={() => onNavigate('bo-suu-tap')} className="text-[14px] font-medium text-[#444] hover:text-[#b22830] transition-colors text-left">{it}</button></li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-black text-[#b22830] mb-3 uppercase tracking-wide">{t('giftcard.nav.boSuuTap2025')}</p>
                        <ul className="space-y-2">
                          <li className="flex items-start gap-1.5"><span className="text-gray-400 text-[11px] mt-1">▸</span><button onClick={() => onNavigate('bo-suu-tap')} className="text-[14px] font-medium text-[#444] hover:text-[#b22830] transition-colors text-left">{t('giftcard.nav.theFestive2025')}</button></li>
                        </ul>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                      <button onClick={() => onNavigate('bo-suu-tap')} className="text-[14px] font-bold text-[#b22830] hover:underline uppercase">{t('giftcard.nav.xemTatCa')}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button key={item.id} onClick={() => onNavigate(item.id)}
                className={`text-[15px] font-bold transition-opacity whitespace-nowrap ${activePage === item.id ? 'text-white opacity-100' : 'text-white hover:opacity-80'}`}>
                {t(`giftcard.nav.${item.id}`)}
              </button>
            )
          )}
        </nav>

        {/* Flags - side by side */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button 
            onClick={() => i18n.changeLanguage('vi')}
            title="Tiếng Việt" 
            className={`transition-all hover:scale-110 rounded-[2px] ${currentLng === 'vi' ? 'ring-[1.5px] ring-white ring-offset-2 ring-offset-[#b22830] opacity-100' : 'opacity-60 hover:opacity-100'}`}
          >
            <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[18px] rounded-[1px] shadow-sm w-auto block" />
          </button>
          <button 
            onClick={() => i18n.changeLanguage('en')}
            title="English" 
            className={`transition-all hover:scale-110 rounded-[2px] ml-2 ${currentLng === 'en' ? 'ring-[1.5px] ring-white ring-offset-2 ring-offset-[#b22830] opacity-100' : 'opacity-60 hover:opacity-100'}`}
          >
            <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[18px] rounded-[1px] shadow-sm w-auto block" />
          </button>
        </div>
      </div>
    </header>
  );
};
