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
    { id: 'menu-intro', label: t('header.menu'), dropdownTabId: 'order', icon: HomeIcon },
    { id: 'about', label: t('header.about'), icon: InformationCircleIcon },
    { id: 'careers', label: t('header.careers'), icon: BriefcaseIcon },
    { id: 'contact', label: t('header.support'), icon: ChatBubbleLeftEllipsisIcon },
  ];

  const mobileNavItems = [
    { id: 'menu-intro', label: t('header.menu'), icon: HomeIcon },
    { id: 'news', label: 'TIN TỨC', icon: NewspaperIcon },
    { id: 'about', label: t('header.about'), icon: InformationCircleIcon },
    { id: 'careers', label: t('header.careers'), icon: BriefcaseIcon },
    { id: 'contact', label: t('header.support'), icon: ChatBubbleLeftEllipsisIcon },
    { id: 'stores', label: t('header.findStore'), icon: MapPinIcon },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#b22830] shadow-lg">
      {/* Top bar */}
      <div className="mx-auto flex h-[90px] w-full max-w-[1380px] items-center justify-between px-4 md:px-6 relative">

        {/* Left nav */}
        <nav className="hidden flex-1 items-center justify-start gap-1 lg:flex">
          {leftNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'menu-intro' && activeTab === 'order');
            return (
              <div key={item.id} className="group relative flex h-full items-center">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange?.(item.id);
                    if (item.id === 'menu-intro') {
                      onSelectedCatIdChange?.('all');
                    }
                  }}
                  className={`relative flex flex-col items-center gap-[3px] px-4 py-2 rounded-xl transition-all duration-200 ${isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 h-[3px] w-[28px] rounded-full bg-white opacity-90" />
                  )}
                </button>

                {item.dropdownTabId === 'order' && categories.length > 0 && (
                  <div className="fixed left-0 top-[90px] w-full bg-[#53382c] shadow-2xl invisible opacity-0 -translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-[60] border-t-2 border-[#b22830]">
                    <div className="mx-auto max-w-[1380px] px-10 py-8 flex flex-row justify-between items-start">
                      {(() => {
                        const parentCats = categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
                        const cols = parentCats.map(parent => {
                          const children = categories.filter(c => String(c.ma_danh_muc_cha) === String(parent.ma_danh_muc));
                          return {
                            id: `group-${parent.ma_danh_muc}`,
                            title: parent.ten_danh_muc,
                            items: children
                          };
                        });

                        return cols.map((col, idx) => (
                          <div key={idx} className="flex flex-col min-w-[200px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTabChange?.('menu-intro');
                                onSelectedCatIdChange?.(col.id);
                                document.activeElement?.blur();
                              }}
                              className="text-[#c99551] hover:text-white font-bold text-[14px] uppercase mb-4 tracking-wide text-left transition-colors cursor-pointer"
                            >
                              {col.title}
                            </button>
                            <ul className="flex flex-col gap-3">
                              {col.items.map(cat => (
                                <li key={cat.ma_danh_muc}>
                                  <button
                                    type="button"
                                    className="text-white text-[14px] hover:text-[#c99551] transition-colors text-left"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onTabChange?.('menu-intro');
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

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex shrink-0 cursor-pointer items-center justify-center z-10"
          onClick={() => {
            onSelectedCatIdChange?.('all');
            onTabChange?.('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img src="/hc-assets/red_BG_logo800.png" alt="Logo" className="h-[80px] w-auto transition-transform hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>

        <div className="hidden flex-1 items-center justify-end gap-2 lg:flex">
          <button
            type="button"
            onClick={() => onTabChange?.('news')}
            className={`flex flex-col items-center gap-[3px] px-3 py-2 rounded-xl transition-all duration-200 ${activeTab === 'news'
                ? 'bg-white/15 text-white'
                : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
          >
            <NewspaperIcon className="h-5 w-5" />
            <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">TIN TỨC</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange?.('stores')}
            className={`flex flex-col items-center gap-[3px] px-3 py-2 rounded-xl transition-all duration-200 ${activeTab === 'stores'
                ? 'bg-white/15 text-white'
                : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
          >
            <MapPinIcon className="h-5 w-5" />
            <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">{t('header.findStore')}</span>
          </button>

          <div className="flex items-center gap-2 mx-1">
            <button
              type="button"
              onClick={() => i18n.changeLanguage('vi')}
              className={`transition-all hover:scale-110 ${currentLng === 'vi' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#b22830] opacity-100 rounded-sm' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[18px] rounded-[2px] shadow-sm w-auto block" />
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage('en')}
              className={`transition-all hover:scale-110 ${currentLng === 'en' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#b22830] opacity-100 rounded-sm' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[18px] rounded-[2px] shadow-sm w-auto block" />
            </button>
          </div>

          {isOrderTab && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSearchPopover((prev) => !prev)}
                className="flex flex-col items-center gap-[3px] px-3 py-2 rounded-xl text-white/75 hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-widest">Tìm</span>
              </button>

              {showSearchPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSearchPopover(false)}></div>
                  <div className="absolute right-0 top-full z-50 mt-3 w-[92vw] max-w-[940px] rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                      <input
                        value={searchKeyword}
                        onChange={(e) => onSearchKeywordChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                        placeholder="Tìm theo tên, mô tả, danh mục..."
                      />

                      <select
                        value={selectedCatId}
                        onChange={(e) => onSelectedCatIdChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                      >
                        <option value="all">Tất cả loại</option>
                        {categories.map((cat) => (
                          <option key={cat.ma_danh_muc} value={cat.ma_danh_muc}>
                            {cat.ten_danh_muc}
                          </option>
                        ))}
                      </select>

                      <select
                        value={availabilityFilter}
                        onChange={(e) => onAvailabilityFilterChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                      >
                        <option value="ALL">Tất cả tình trạng</option>
                        <option value="AVAILABLE">Đang bán</option>
                        <option value="OUT_OF_STOCK">Hết món</option>
                      </select>

                      <select
                        value={priceFilter}
                        onChange={(e) => onPriceFilterChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                      >
                        <option value="ALL">Tất cả khoảng giá</option>
                        <option value="DUOI_30000">Dưới 30.000đ</option>
                        <option value="TU_30000_DEN_50000">30.000đ - 50.000đ</option>
                        <option value="TREN_50000">Trên 50.000đ</option>
                      </select>

                      <select
                        value={criteriaFilter}
                        onChange={(e) => onCriteriaFilterChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                      >
                        <option value="ALL">Tất cả tiêu chí</option>
                        <option value="PROMO">Khuyến mãi / Giảm giá</option>
                        <option value="HOT">Món hot</option>
                        <option value="NEW">Món mới</option>
                      </select>

                      <select
                        value={sortBy}
                        onChange={(e) => onSortByChange?.(e.target.value)}
                        className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a8b46]"
                      >
                        <option value="DEFAULT">Sắp xếp mặc định</option>
                        <option value="NAME_ASC">Tên A-Z</option>
                        <option value="NAME_DESC">Tên Z-A</option>
                        <option value="PRICE_ASC">Giá thấp đến cao</option>
                        <option value="PRICE_DESC">Giá cao đến thấp</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Tìm thấy {filteredCount} sản phẩm
                      </p>
                      <button
                        type="button"
                        onClick={onResetSearchFilters}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 hover:border-[#1a8b46] hover:text-[#1a8b46]"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="h-8 w-px bg-white/25 mx-1" />

          <button
            type="button"
            onClick={() => onTabChange?.('order')}
            className="group flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-black uppercase tracking-wider text-[#b22830] shadow-lg transition-all duration-200 hover:bg-[#f8e8e8] hover:shadow-xl active:scale-95"
          >
            <span>{t('header.order')}</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#b22830] transition-transform duration-200 group-hover:translate-x-0.5">
              <ArrowRightIcon className="h-3.5 w-3.5 text-white" />
            </span>
          </button>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="rounded-full p-2 text-white"
          >
            {showMobileMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {showMobileMenu && (
        <div className="border-t border-white/10 bg-[#a80f28] lg:hidden">
          <div className="mx-auto max-w-[1380px] px-4 py-4">
            <div className="grid gap-1">
              {mobileNavItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabChange?.(item.id);
                      setShowMobileMenu(false);
                    }}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-[13px] font-extrabold tracking-[0.1em] transition-colors ${activeTab === item.id ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <ItemIcon className="h-5 w-5 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}