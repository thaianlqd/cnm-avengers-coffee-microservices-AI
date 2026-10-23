import { preloadPage } from '../../lib/pageModules';
import './Header.css';
import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import { menuCategoryLabel } from '../../lib/categoryLabels';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCartIcon,
  HeartIcon,
  UserIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ClipboardDocumentListIcon,
  BellAlertIcon,
  CheckCircleIcon,
  MapPinIcon,
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  InformationCircleIcon,
  BriefcaseIcon,
  ChatBubbleLeftEllipsisIcon,
  NewspaperIcon,
  ArrowRightIcon,
  BuildingStorefrontIcon,
  TruckIcon,
} from '../common/icons';

function fmtNotificationTime(value) {
  if (!value) return 'vừa xong';
  const now = Date.now();
  const created = new Date(value).getTime();
  const diff = Math.max(0, Math.floor((now - created) / 1000));

  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return new Date(value).toLocaleDateString(uiLocale());
}

export default function Header({
  userName = 'Đăng nhập',
  userAvatar = '',
  cartCount = 0,
  activeTab = 'order',
  onTabChange,
  searchKeyword,
  onSearchKeywordChange,
  selectedCatId,
  onSelectedCatIdChange,
  categories = [],
  availabilityFilter,
  onAvailabilityFilterChange,
  priceFilter,
  onPriceFilterChange,
  criteriaFilter,
  onCriteriaFilterChange,
  sortBy,
  onSortByChange,
  filteredCount = 0,
  onResetSearchFilters,
  onOpenAccount,
  onLogout,
  onOpenCart,
  onOpenOrderHistory,
  onOpenProfile,
  onOpenFavorites,
  favoriteCount = 0,
  notifications = [],
  unreadNotificationCount = 0,
  onReadNotification,
  onReadAllNotifications,
}) {
  useUiLanguage();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSearchPopover, setShowSearchPopover] = useState(false);
  const [showNotificationPopover, setShowNotificationPopover] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [homeScrolled, setHomeScrolled] = useState(() => window.scrollY > 40);

  useEffect(() => {
    if (activeTab !== 'home') return;
    const onScroll = () => setHomeScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeTab]);

  const { t, i18n } = useTranslation();
  const currentLng = i18n.resolvedLanguage || 'vi';

  const handleOpenProfile = () => {
    setShowDropdown(false);
    if (isLoggedIn) {
      onOpenProfile?.();
    } else {
      onOpenAccount?.();
    }
  };

  // Kiểm tra xem đã đăng nhập chưa
  const isLoggedIn = Boolean(userName && userName !== 'Đăng nhập' && userName !== 'Sign in');
  const isOrderTab = activeTab === 'order';

  const isEn = currentLng === 'en';
  const leftNavItems = [
    { id: 'menu-intro', label: isEn ? 'MENU' : 'THỰC ĐƠN', dropdownTabId: 'menu-intro' },
    { id: 'about', label: isEn ? 'ABOUT AVENGERS' : 'VỀ AVENGERS' },
    { id: 'nhuong-quyen', label: isEn ? 'FRANCHISE' : 'NHƯỢNG QUYỀN' },
    { id: 'news', label: isEn ? 'NEWS' : 'TIN TỨC' },
    {
      id: 'contact',
      label: isEn ? 'SUPPORT' : 'HỖ TRỢ',
      dropdownTabId: 'support',
      subItems: [
        { id: 'contact', label: isEn ? 'Customer Support' : 'Hỗ trợ khách hàng', icon: ChatBubbleLeftEllipsisIcon },
        { id: 'careers', label: isEn ? 'Careers' : 'Nghề nghiệp', icon: BriefcaseIcon },
      ],
    },
  ];

  const mobileNavItems = [
    { id: 'order', label: isEn ? 'MENU' : 'THỰC ĐƠN', icon: HomeIcon },
    { id: 'about', label: isEn ? 'ABOUT AVENGERS' : 'VỀ AVENGERS', icon: InformationCircleIcon },
    { id: 'nhuong-quyen', label: isEn ? 'FRANCHISE' : 'NHƯỢNG QUYỀN', icon: BuildingStorefrontIcon },
    { id: 'news', label: isEn ? 'NEWS' : 'TIN TỨC', icon: NewspaperIcon },
    { id: 'contact', label: isEn ? 'CUSTOMER SUPPORT' : 'HỖ TRỢ KHÁCH HÀNG', icon: ChatBubbleLeftEllipsisIcon },
    { id: 'careers', label: isEn ? 'CAREERS' : 'NGHỀ NGHIỆP', icon: BriefcaseIcon },
    { id: 'stores', label: isEn ? 'FIND A STORE' : 'TÌM KIẾM CỬA HÀNG', icon: MapPinIcon },
    { id: 'tracking', label: t('header.tracking') || 'TRA CỨU ĐƠN', icon: TruckIcon },
  ];

  const homeStyle = activeTab === 'home';
  return (
    <header className={homeStyle
      ? `customer-public-header hc-home-header ${homeScrolled || showMobileMenu ? 'hc-home-header--solid' : ''} top-0 z-50 font-sans`
      : 'customer-public-header sticky top-0 z-50 bg-[#b22830] shadow-md border-b border-white/10 font-sans'}>
      {/* Main Top bar */}
      <div className="hc-header-bar mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8 relative h-[88px] xl:h-[94px]">

        {/* ── LEFT NAVIGATION ── */}
        <div className="hidden lg:flex flex-1 items-center justify-start min-w-0">
          <nav className="hc-header-desktop-nav hidden lg:flex items-center justify-start gap-6 xl:gap-8 2xl:gap-10">
            {leftNavItems.map((item) => {
              const isActive =
                activeTab === item.id ||
                (item.id === 'menu-intro' && (activeTab === 'menu-intro' || activeTab === 'order')) ||
                (item.dropdownTabId === 'support' && (activeTab === 'other-group' || activeTab === 'contact' || activeTab === 'lien-he' || activeTab === 'careers'));
              return (
                <div key={item.id} className="group relative flex h-full items-center">
                  <button
                    type="button"
                    onPointerEnter={() => preloadPage(item.id)}
                    onFocus={() => preloadPage(item.id)}
                    onClick={() => {
                      onTabChange?.(item.id);
                      if (item.id === 'order' || item.id === 'menu-intro') {
                        onSelectedCatIdChange?.('all');
                      }
                    }}
                    className={`relative py-6 text-[14px] xl:text-[15px] 2xl:text-[16px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'text-white underline underline-offset-[10px] decoration-2'
                        : 'text-white hover:text-white/80'
                    }`}
                  >
                    {ui(item.label)}
                  </button>

                  {/* Dropdown for HỖ TRỢ (2 sub-pages: Nghề nghiệp & Hỗ trợ khách hàng) */}
                  {item.dropdownTabId === 'support' && (
                    <div className="absolute left-0 top-[72px] pt-2 invisible opacity-0 -translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-[60]">
                      <div className="w-[220px] bg-white rounded-xl shadow-2xl border border-stone-200/80 py-2 overflow-hidden">
                        {item.subItems.map((sub) => {
                          const SubIcon = sub.icon;
                          const isSubActive = activeTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onPointerEnter={() => preloadPage(sub.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                onTabChange?.(sub.id);
                              }}
                              className={`flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-[14px] font-bold transition-colors cursor-pointer ${
                                isSubActive
                                  ? 'bg-red-50 text-[#b22830]'
                                  : 'text-stone-700 hover:bg-red-50 hover:text-[#b22830]'
                              }`}
                            >
                              {SubIcon && <SubIcon className="w-4 h-4 flex-shrink-0" />}
                              <span>{sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dropdown Mega Menu for THỰC ĐƠN */}
                  {item.dropdownTabId === 'menu-intro' && categories.length > 0 && (
                    <div className="fixed left-0 top-[88px] xl:top-[94px] bg-[#941e28] w-full shadow-2xl invisible opacity-0 -translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-[60] border-t border-white/10">
                      <div className="mx-auto max-w-[1380px] px-10 py-8 flex flex-row justify-between items-start gap-8">
                        {(() => {
                          const parentCats = categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
                          const cols = parentCats.map(parent => {
                            const children = categories.filter(c => String(c.ma_danh_muc_cha) === String(parent.ma_danh_muc));
                            return {
                              id: parent.ma_danh_muc,
                              title: menuCategoryLabel(parent.ten_danh_muc, currentLng),
                              items: children
                            };
                          });

                          return cols.map((col, idx) => (
                            <div key={idx} className="flex flex-col min-w-[180px] flex-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTabChange?.('menu-intro');
                                  onSelectedCatIdChange?.(`group-${col.id}`);
                                  document.activeElement?.blur();
                                }}
                                className="text-[#e2b078] hover:text-white font-semibold text-[14px] mb-3.5 tracking-wider text-left transition-colors cursor-pointer border-b border-amber-800/40 pb-2"
                              >
                                {col.title}
                              </button>
                              <ul className="flex flex-col gap-2.5">
                                {col.items.map(cat => (
                                  <li key={cat.ma_danh_muc}>
                                    <button
                                      type="button"
                                      className="text-white/80 hover:text-white hover:translate-x-1 text-[13px] font-medium transition-all text-left block w-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onTabChange?.('menu-intro');
                                        onSelectedCatIdChange?.(cat.ma_danh_muc);
                                        document.activeElement?.blur();
                                      }}
                                    >
                                      {menuCategoryLabel(cat.ten_danh_muc, currentLng)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* ── CENTER LOGO ── */}
        <button
          type="button"
          aria-label={currentLng === 'en' ? 'Avengers Coffee home' : 'Trang chủ Avengers Coffee'}
          className="flex-shrink-0 flex items-center justify-center z-10 px-4 cursor-pointer bg-transparent border-0 transition-transform hover:scale-105 active:scale-95 duration-200"
          onClick={() => {
            onSelectedCatIdChange?.('all');
            onTabChange?.('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img
            src="/hc-assets/logo-white.png"
            alt="Avengers Coffee"
            className="h-[76px] sm:h-[82px] lg:h-[88px] w-auto object-contain drop-shadow-md py-0.5"
          />
        </button>

        {/* ── RIGHT NAVIGATION ── */}
        <div className="flex-1 flex items-center justify-end min-w-0">
          <div className="hc-header-desktop-actions hidden lg:flex items-center justify-end gap-6 xl:gap-8">
            {/* ĐẶT HÀNG link */}
            <button
              type="button"
              onPointerEnter={() => preloadPage('order')}
              onFocus={() => preloadPage('order')}
              onClick={() => {
                onTabChange?.('order');
                onSelectedCatIdChange?.('all');
              }}
              className={`py-6 text-[14px] xl:text-[15px] 2xl:text-[16px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'order'
                  ? 'text-white underline underline-offset-[10px] decoration-2'
                  : 'text-white hover:text-white/80'
              }`}
            >
              {isEn ? 'ORDER' : 'ĐẶT HÀNG'}
            </button>

            {/* Tìm kiếm cửa hàng */}
            <button
              type="button"
              onPointerEnter={() => preloadPage('stores')}
              onFocus={() => preloadPage('stores')}
              onClick={() => onTabChange?.('stores')}
              className={`flex items-center gap-1.5 text-[14px] xl:text-[15px] font-medium text-white hover:text-white/80 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'stores' ? 'text-white font-bold' : 'text-white'
              }`}
            >
              <MapPinIcon className="h-4 w-4 flex-shrink-0 opacity-90" />
              <span>{isEn ? 'Find a Store' : 'Tìm kiếm cửa hàng'}</span>
            </button>

            {/* Language Switcher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i18n.changeLanguage('vi')}
                title={ui("Tiếng Việt")}
                aria-label={ui("Tiếng Việt")}
                aria-pressed={currentLng === 'vi'}
                className={`transition-all cursor-pointer ${
                  currentLng === 'vi' ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[18px] w-auto rounded-[2px] shadow-sm block" />
              </button>
              <button
                type="button"
                onClick={() => i18n.changeLanguage('en')}
                title="English"
                aria-label="English"
                aria-pressed={currentLng === 'en'}
                className={`transition-all cursor-pointer ${
                  currentLng === 'en' ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[18px] w-auto rounded-[2px] shadow-sm block" />
              </button>
            </div>
          </div>

          {/* ── MOBILE HAMBURGER BUTTON ── */}
          <div className="hc-header-mobile-actions flex items-center gap-2 ml-2 lg:hidden">
            <button
              type="button"
              onClick={() => {
                onTabChange?.('order');
                onSelectedCatIdChange?.('all');
              }}
              className="inline-flex items-center whitespace-nowrap border border-white/70 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white hover:bg-white hover:text-[#b22830]"
            >
              {isEn ? 'ORDER' : 'ĐẶT HÀNG'}
            </button>
            <button
              type="button"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label={isEn ? 'Toggle navigation' : 'Mở hoặc đóng điều hướng'}
              aria-expanded={showMobileMenu}
              aria-controls="customer-mobile-navigation"
              className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              {showMobileMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── MOBILE NAVIGATION DRAWER ── */}
      {showMobileMenu && (
        <div id="customer-mobile-navigation" className={`border-t border-white/10 animate-in slide-in-from-top-2 duration-200 ${homeStyle ? 'xl:hidden bg-[#941e28]' : 'lg:hidden bg-[#9c1820]'}`}>
          <div className="mx-auto max-w-[1380px] px-4 py-4">
            <div className="grid gap-1">
              {mobileNavItems.map((item) => {
                const ItemIcon = item.icon;
                const isActive = activeTab === item.id || (item.id === 'order' && activeTab === 'menu-intro');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabChange?.(item.id);
                      if (item.id === 'order') {
                        onSelectedCatIdChange?.('all');
                      }
                      setShowMobileMenu(false);
                    }}
                    className={`flex items-center gap-3.5 rounded-xl px-4 py-3 text-left text-[13px] font-bold tracking-wide transition-colors ${
                      isActive ? 'bg-white/20 text-white font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <ItemIcon className="h-5 w-5 flex-shrink-0" />
                    {ui(item.label)}
                  </button>
                );
              })}

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between px-4">
                <span className="text-xs text-white/70 font-semibold">{ui("Ngôn ngữ / Language")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => i18n.changeLanguage('vi')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      currentLng === 'vi' ? 'bg-white text-[#b22830]' : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    VN
                  </button>
                  <button
                    type="button"
                    onClick={() => i18n.changeLanguage('en')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      currentLng === 'en' ? 'bg-white text-[#b22830]' : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
