import { useState } from 'react';
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
  XMarkIcon
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
    { id: 'order', label: 'THỰC ĐƠN' },
    { id: 'about', label: 'VỀ HIGHLANDS' },
    { id: 'news', label: 'NGHỀ NGHIỆP' },
    { id: 'contact', label: 'HỖ TRỢ' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#b22830] shadow-lg">
      {/* Top bar */}
      <div className="mx-auto flex h-[84px] w-full max-w-[1380px] items-center justify-between px-4 md:px-6 relative">
        
        {/* Left nav */}
        <nav className="hidden flex-1 items-center justify-start gap-8 lg:flex">
          {leftNavItems.map((item) => (
            <div key={item.id} className="group relative flex h-full items-center">
              <button
                type="button"
                onClick={() => {
                  onTabChange?.(item.id);
                  if (item.id === 'order') {
                    onSelectedCatIdChange?.('all');
                  }
                }}
                className={`relative py-7 text-[14px] font-black uppercase tracking-widest transition-all ${
                  activeTab === item.id 
                    ? 'text-white' 
                    : 'text-white hover:text-white/80'
                }`}
              >
                {item.label}
              </button>

              {item.id === 'order' && categories.length > 0 && (
                <div className="fixed left-0 top-[84px] w-full bg-[#53382c] shadow-2xl invisible opacity-0 -translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-[60] border-t-2 border-[#b22830]">
                  <div className="mx-auto max-w-[1380px] px-10 py-8 flex flex-row justify-between items-start">
                    {/* Grouping Logic inline for UI */}
                    {(() => {
                      const coffeeCats = categories.filter(c => 
                        c.ten_danh_muc.toLowerCase().includes('cà phê') || 
                        c.ten_danh_muc.toLowerCase().includes('phindi') || 
                        c.ten_danh_muc.toLowerCase().includes('espresso')
                      );
                      const teaCats = categories.filter(c => 
                        c.ten_danh_muc.toLowerCase().includes('trà') && 
                        !c.ten_danh_muc.toLowerCase().includes('cà phê')
                      );
                      const freezeCats = categories.filter(c => 
                        c.ten_danh_muc.toLowerCase().includes('freeze')
                      );
                      const usedIds = new Set([
                        ...coffeeCats.map(c => c.ma_danh_muc),
                        ...teaCats.map(c => c.ma_danh_muc),
                        ...freezeCats.map(c => c.ma_danh_muc)
                      ]);
                      const otherCats = categories.filter(c => !usedIds.has(c.ma_danh_muc));

                      const cols = [
                        { title: 'CÀ PHÊ', items: coffeeCats },
                        { title: 'TRÀ', items: teaCats },
                        { title: 'FREEZE', items: freezeCats },
                        { title: 'KHÁC', items: otherCats }
                      ];

                      return cols.map((col, idx) => (
                        <div key={idx} className="flex flex-col min-w-[200px]">
                          <h4 className="text-[#c99551] font-bold text-[14px] uppercase mb-4 tracking-wide">
                            {col.title}
                          </h4>
                          <ul className="flex flex-col gap-3">
                            {col.items.map(cat => (
                              <li key={cat.ma_danh_muc}>
                                <button
                                  type="button"
                                  className="text-white text-[14px] hover:text-[#c99551] transition-colors text-left"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTabChange?.('order');
                                    onSelectedCatIdChange?.(cat.ma_danh_muc);
                                    // Bỏ focus/hover để đóng dropdown nếu cần
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
          ))}
        </nav>

        {/* Center logo */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex shrink-0 cursor-pointer items-center justify-center z-10"
          onClick={() => onTabChange?.('home')}
        >
          <img src="/hc-assets/red_BG_logo800.png" alt="Logo" className="h-[60px] w-auto" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>

        {/* Right nav & tools */}
        <div className="hidden flex-1 items-center justify-end gap-6 lg:flex">
          
          {/* Đặt hàng CTA */}
          <button
            type="button"
            onClick={() => onTabChange?.('order')}
            className={`rounded-full px-5 py-2 text-[13px] font-black tracking-widest transition-all uppercase ${
              activeTab === 'order'
                ? 'bg-transparent text-white'
                : 'text-white hover:text-white/80'
            }`}
          >
            ĐẶT HÀNG
          </button>

          <div className="flex items-center gap-3">
            {/* Tìm kiếm cửa hàng */}
            <button
              type="button"
              onClick={() => onTabChange?.('stores')}
              className="flex items-center gap-1.5 text-[13px] font-medium text-white hover:text-white/80 transition-colors"
            >
              <MapPinIcon className="h-4 w-4" />
              Tìm kiếm cửa hàng
            </button>

            <div className="mx-2 h-4 w-px bg-white/30"></div>

            {/* Language Flags */}
            <div className="flex items-center gap-2 mr-2">
              <button type="button" className="transition-transform hover:scale-110">
                <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[18px] rounded-[2px] shadow-sm w-auto" />
              </button>
              <button type="button" className="transition-transform hover:scale-110 opacity-60 hover:opacity-100">
                <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[18px] rounded-[2px] shadow-sm w-auto" />
              </button>
            </div>

            {/* Search */}
            {isOrderTab && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSearchPopover((prev) => !prev)}
                className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
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
          </div>

          {/* Temporarily hidden: Notifications, User Account, Favorites, Cart */}
        </div>

        {/* Mobile hamburger */}
        <div className="flex flex-1 items-center justify-end gap-2 lg:hidden">
          {/* Temporarily hidden: Mobile Cart */}
          <button
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="rounded-full p-2 text-white"
          >
            {showMobileMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div className="border-t border-white/10 bg-[#a80f28] lg:hidden">
          <div className="mx-auto max-w-[1380px] px-4 py-4">
            <div className="grid gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onTabChange?.(item.id);
                    setShowMobileMenu(false);
                  }}
                  className={`rounded-lg px-4 py-3 text-left text-[13px] font-extrabold tracking-[0.1em] transition-colors ${
                    activeTab === item.id ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {/* Temporarily hidden: Mobile Login & Favorites */}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}