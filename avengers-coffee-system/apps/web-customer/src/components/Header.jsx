import { useState } from 'react';
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
  PhoneIcon,
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
} from '@heroicons/react/24/outline';

function fmtNotificationTime(value) {
  if (!value) return 'vừa xong';
  const now = Date.now();
  const created = new Date(value).getTime();
  const diff = Math.max(0, Math.floor((now - created) / 1000));

  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return new Date(value).toLocaleDateString('vi-VN');
}

export default function Header({
  userName = 'Đăng nhập',
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSearchPopover, setShowSearchPopover] = useState(false);
  const [showNotificationPopover, setShowNotificationPopover] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'vi';

  const handleOpenProfile = () => {
    setShowDropdown(false);
    if (isLoggedIn) {
      onOpenProfile?.();
    } else {
      onOpenAccount?.();
    }
  };

  // Kiểm tra xem đã đăng nhập chưa
  const isLoggedIn = userName !== 'Đăng nhập';
  const isOrderTab = activeTab === 'order';

  const leftNavItems = [
    { id: 'order', label: t('header.menu') || 'THỰC ĐƠN', dropdownTabId: 'order', icon: HomeIcon },
    { id: 'about', label: t('header.about') || 'VỀ CHÚNG TÔI', icon: InformationCircleIcon },
    { id: 'nhuong-quyen', label: 'NHƯỢNG QUYỀN', icon: BuildingStorefrontIcon },
  ];

  const rightNavItems = [
    { id: 'news', label: 'TIN TỨC', icon: NewspaperIcon },
    { id: 'stores', label: t('header.findStore') || 'CỬA HÀNG', icon: MapPinIcon },
  ];

  const mobileNavItems = [
    { id: 'order', label: t('header.menu') || 'THỰC ĐƠN', icon: HomeIcon },
    { id: 'tracking', label: 'TRA CỨU ĐƠN HÀNG', icon: TruckIcon },
    { id: 'news', label: 'TIN TỨC', icon: NewspaperIcon },
    { id: 'about', label: t('header.about') || 'VỀ CHÚNG TÔI', icon: InformationCircleIcon },
    { id: 'nhuong-quyen', label: 'NHƯỢNG QUYỀN', icon: BuildingStorefrontIcon },
    { id: 'stores', label: t('header.findStore') || 'TÌM KIẾM CỬA HÀNG', icon: MapPinIcon },
    { id: 'careers', label: t('header.careers') || 'NGHỀ NGHIỆP', icon: BriefcaseIcon },
    { id: 'contact', label: t('header.support') || 'HỖ TRỢ KHÁCH HÀNG', icon: ChatBubbleLeftEllipsisIcon },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#b22830] shadow-md border-b border-red-900/40">
      {/* Main Top bar */}
      <div className="mx-auto flex h-[84px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* ── LEFT NAVIGATION ── */}
        <nav className="hidden lg:flex flex-1 items-center justify-start gap-2">
          {leftNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'order' && (activeTab === 'menu-intro' || activeTab === 'order'));
            return (
              <div key={item.id} className="group relative flex h-full items-center">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange?.(item.id);
                    if (item.id === 'order' || item.id === 'menu-intro') {
                      onSelectedCatIdChange?.('all');
                    }
                  }}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-white/20 text-white font-black shadow-xs'
                      : 'text-white/85 hover:bg-white/10 hover:text-white font-bold'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0 opacity-90" />
                  <span className="text-[13px] uppercase tracking-wider whitespace-nowrap">
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-[3px] w-[24px] rounded-full bg-amber-300" />
                  )}
                </button>

                {/* Dropdown Mega Menu for THỰC ĐƠN */}
                {item.dropdownTabId === 'order' && categories.length > 0 && (
                  <div className="fixed left-0 top-[84px] w-full bg-[#4a2e23] shadow-2xl invisible opacity-0 -translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-[60] border-t-2 border-amber-500/80">
                    <div className="mx-auto max-w-[1380px] px-10 py-8 flex flex-row justify-between items-start gap-8">
                      {(() => {
                        const parentCats = categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
                        const cols = parentCats.map(parent => {
                          const children = categories.filter(c => String(c.ma_danh_muc_cha) === String(parent.ma_danh_muc));
                          return {
                            id: parent.ma_danh_muc,
                            title: parent.ten_danh_muc,
                            items: children
                          };
                        });

                        return cols.map((col, idx) => (
                          <div key={idx} className="flex flex-col min-w-[180px] flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTabChange?.('order');
                                onSelectedCatIdChange?.(col.id);
                                document.activeElement?.blur();
                              }}
                              className="text-[#e2b078] hover:text-white font-black text-[14px] uppercase mb-3.5 tracking-wider text-left transition-colors cursor-pointer border-b border-amber-800/40 pb-2"
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
                                      onTabChange?.('order');
                                      onSelectedCatIdChange?.(cat.ma_danh_muc);
                                      document.activeElement?.blur();
                                    }}
                                  >
                                    {cat.ten_danh_muc}
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

        {/* ── CENTER LOGO ── */}
        <div
          className="flex shrink-0 cursor-pointer items-center justify-center px-4 transition-transform hover:scale-105 active:scale-95 duration-200"
          onClick={() => {
            onSelectedCatIdChange?.('all');
            onTabChange?.('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img 
            src="/hc-assets/red_BG_logo800.png" 
            alt="Avengers Coffee" 
            className="h-[64px] sm:h-[72px] w-auto drop-shadow-md" 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
        </div>

        {/* ── RIGHT NAVIGATION ── */}
        <div className="hidden lg:flex flex-1 items-center justify-end gap-2.5">
          {rightNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange?.(item.id)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-white/20 text-white font-black shadow-xs'
                    : 'text-white/85 hover:bg-white/10 hover:text-white font-bold'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0 opacity-90" />
                <span className="text-[13px] uppercase tracking-wider whitespace-nowrap">
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 h-[3px] w-[24px] rounded-full bg-amber-300" />
                )}
              </button>
            );
          })}

          {/* Language Switcher */}
          <div className="flex items-center gap-1.5 mx-1.5 bg-black/15 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => i18n.changeLanguage('vi')}
              title="Tiếng Việt"
              className={`p-1 rounded transition-all cursor-pointer ${
                currentLng === 'vi' ? 'bg-white shadow-xs scale-105' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[14px] w-auto rounded-[2px] block" />
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage('en')}
              title="English"
              className={`p-1 rounded transition-all cursor-pointer ${
                currentLng === 'en' ? 'bg-white shadow-xs scale-105' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[14px] w-auto rounded-[2px] block" />
            </button>
          </div>

          {/* ORDER CTA BUTTON */}
          <button
            type="button"
            onClick={() => {
              onTabChange?.('order');
              onSelectedCatIdChange?.('all');
            }}
            className="group flex items-center gap-2.5 rounded-full bg-white px-5 py-2.5 text-[13px] font-black uppercase tracking-wider text-[#b22830] shadow-md transition-all duration-200 hover:bg-red-50 hover:shadow-lg active:scale-95 cursor-pointer ml-1"
          >
            <span>{t('header.order') || 'ĐẶT HÀNG'}</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#b22830] transition-transform duration-200 group-hover:translate-x-1 text-white">
              <ArrowRightIcon className="h-3 w-3 stroke-[3]" />
            </span>
          </button>
        </div>

        {/* ── MOBILE HAMBURGER BUTTON ── */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            {showMobileMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ── MOBILE NAVIGATION DRAWER ── */}
      {showMobileMenu && (
        <div className="border-t border-white/10 bg-[#9c1820] lg:hidden animate-in slide-in-from-top-2 duration-200">
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
                      isActive ? 'bg-white/20 text-white font-black' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <ItemIcon className="h-5 w-5 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between px-4">
                <span className="text-xs text-white/70 font-semibold">Ngôn ngữ / Language</span>
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