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
  CheckCircleIcon
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

  return (
    <header className="sticky top-0 z-50 border-b border-[#ece6de] bg-white backdrop-blur-sm">
      <div className="mx-auto flex h-[92px] w-full max-w-[1380px] items-center gap-2 px-4 md:px-6">
        
        {/* Block trái: Logo */}
        <div className="brand-serif inline-flex w-auto shrink-0 cursor-pointer items-center gap-1 pr-4 text-[24px] font-black tracking-tight text-[#17120d] md:text-[26px] xl:text-[28px]" style={{ whiteSpace: 'nowrap' }}>
          <span>THE</span>
          <span className="text-tch-orange">AVENGERS</span>
          <span>HOUSE</span>
        </div>

        {/* Block giữa: Menu điều hướng */}
        <nav className="hidden flex-1 items-center justify-center gap-6 lg:flex xl:gap-8">
          <button
            type="button"
            onClick={() => onTabChange?.('home')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'home' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Trang chủ
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('order')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'order' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Đặt hàng
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('news')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'news' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Tin tức
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('stores')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'stores' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Cửa hàng
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('contact')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'contact' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Liên hệ
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('vouchers')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'vouchers' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Khuyến mãi
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('privacy')}
            className={`relative whitespace-nowrap text-[17px] font-black tracking-[0.02em] transition-colors hover:text-tch-orange ${activeTab === 'privacy' ? 'text-tch-orange after:absolute after:-bottom-[35px] after:left-0 after:h-[3px] after:w-full after:bg-tch-orange' : 'text-[#1c1713]'}`}
          >
            Chuyện nhà
          </button>
        </nav>

        {/* Block phải: Các chức năng */}
        <div className="ml-3 flex min-w-0 shrink-0 items-center justify-end gap-2 xl:ml-5 xl:gap-3">
          {isOrderTab && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSearchPopover((prev) => !prev)}
                className="rounded-full border border-transparent p-1.5 text-[#6d6257] transition-colors hover:border-[#dacbb9] hover:bg-white hover:text-[#3f3328]"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
              </button>

              {showSearchPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSearchPopover(false)}></div>
                  <div className="absolute right-0 top-full z-50 mt-3 w-[92vw] max-w-[940px] rounded-[22px] border border-orange-100 bg-white p-4 shadow-2xl shadow-orange-100/70">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                      <input
                        value={searchKeyword}
                        onChange={(e) => onSearchKeywordChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                        placeholder="Tìm theo tên, mô tả, danh mục..."
                      />

                      <select
                        value={selectedCatId}
                        onChange={(e) => onSelectedCatIdChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
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
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="ALL">Tất cả tình trạng</option>
                        <option value="AVAILABLE">Đang bán</option>
                        <option value="OUT_OF_STOCK">Hết món</option>
                      </select>

                      <select
                        value={priceFilter}
                        onChange={(e) => onPriceFilterChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="ALL">Tất cả khoảng giá</option>
                        <option value="DUOI_30000">Dưới 30.000đ</option>
                        <option value="TU_30000_DEN_50000">30.000đ - 50.000đ</option>
                        <option value="TREN_50000">Trên 50.000đ</option>
                      </select>

                      <select
                        value={criteriaFilter}
                        onChange={(e) => onCriteriaFilterChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="ALL">Tất cả tiêu chí</option>
                        <option value="PROMO">Khuyến mãi / Giảm giá</option>
                        <option value="HOT">Món hot</option>
                        <option value="NEW">Món mới</option>
                      </select>

                      <select
                        value={sortBy}
                        onChange={(e) => onSortByChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="DEFAULT">Sắp xếp mặc định</option>
                        <option value="NAME_ASC">Tên A-Z</option>
                        <option value="NAME_DESC">Tên Z-A</option>
                        <option value="PRICE_ASC">Giá thấp đến cao</option>
                        <option value="PRICE_DESC">Giá cao đến thấp</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                        Tìm thấy {filteredCount} sản phẩm
                      </p>
                      <button
                        type="button"
                        onClick={onResetSearchFilters}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-500 hover:border-tch-orange hover:text-tch-orange"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {isLoggedIn && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotificationPopover((prev) => !prev)}
                className="relative rounded-full border border-[#decfbe] bg-[#fffaf3] p-1.5 text-tch-orange transition-all hover:bg-[#f9efdf] active:scale-95"
                title="Thông báo"
              >
                <BellAlertIcon className="h-4 w-4" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[9px] font-black text-white">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {showNotificationPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotificationPopover(false)}></div>
                  <div className="absolute right-0 top-full z-50 mt-3 w-[92vw] max-w-[420px] overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Thông báo</p>
                        <p className="text-sm font-bold text-gray-700">{unreadNotificationCount} chưa đọc</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onReadAllNotifications?.()}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-gray-500 hover:border-tch-orange hover:text-tch-orange"
                      >
                        Đọc tất cả
                      </button>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto bg-[#fffdfa]">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm font-semibold text-gray-400">Chưa có thông báo nào.</div>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onReadNotification?.(item.id)}
                            className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-orange-50 ${
                              item.da_doc ? 'bg-white' : 'bg-orange-50/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-gray-800">{item.tieu_de}</p>
                                <p className="mt-1 text-xs font-semibold text-gray-500">{item.noi_dung}</p>
                                <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{fmtNotificationTime(item.ngay_tao)}</p>
                              </div>
                              {item.da_doc ? null : <CheckCircleIcon className="h-5 w-5 shrink-0 text-tch-orange" />}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Cụm Tài khoản & Dropdown Đăng xuất */}
          <div className="relative">
            <button
              type="button"
              onClick={() => isLoggedIn ? setShowDropdown(!showDropdown) : onOpenAccount()}
              className="flex items-center space-x-2 rounded-full border border-[#decfbe] bg-[#fffaf3] px-3 py-1.5 transition-all hover:bg-[#f9efdf] active:scale-95"
            >
               <UserIcon className="h-4 w-4 text-tch-orange" />
               <span className="text-[12px] font-bold text-gray-700 truncate max-w-[80px]">
                 {userName}
               </span>
            </button>

            {/* Dropdown Menu (Chỉ hiện khi đã đăng nhập và nhấn vào tên) */}
            {isLoggedIn && showDropdown && (
              <>
                {/* Lớp phủ để đóng menu khi nhấn ra ngoài */}
                <div className="fixed inset-0 z-[-1]" onClick={() => setShowDropdown(false)}></div>
                
                <div className="absolute right-0 mt-3 w-56 bg-white rounded-[24px] shadow-2xl border border-gray-100 overflow-hidden py-3 animate-in fade-in zoom-in duration-200">
                  <div className="px-5 py-3 border-b border-gray-50 mb-2">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Tài khoản của bạn</p>
                    <p className="text-sm font-bold text-gray-800 truncate">{userName}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenProfile}
                    className="w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold text-gray-600 hover:bg-orange-50 hover:text-tch-orange transition-colors"
                  >
                    <UserCircleIcon className="h-5 w-5" />
                    Trang cá nhân
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenOrderHistory?.();
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold text-gray-600 hover:bg-orange-50 hover:text-tch-orange transition-colors"
                  >
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                    Lịch sử đơn hàng
                  </button>

                  <div className="border-t border-gray-100 my-2 mx-5"></div>

                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-[13px] font-black uppercase text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <ArrowRightOnRectangleIcon className="h-5 w-5" />
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Hồ sơ (nếu đã đăng nhập) */}
          {isLoggedIn && (
            <button
              type="button"
              onClick={() => onOpenProfile?.()}
              className="rounded-full border border-orange-100 bg-orange-50 p-1.5 text-tch-orange transition-all hover:bg-orange-100 active:scale-95"
              title="Trang cá nhân"
            >
              <UserCircleIcon className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenFavorites}
            className="relative rounded-full border border-rose-100 bg-rose-50 p-1.5 text-rose-500 transition-all hover:bg-rose-100 active:scale-95"
            title="San pham yeu thich"
          >
            <HeartIcon className="h-4 w-4" />
            {favoriteCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black text-white">
                {favoriteCount > 9 ? '9+' : favoriteCount}
              </span>
            )}
          </button>

          {/* Giỏ hàng */}
          <button
            type="button"
            onClick={onOpenCart}
            className="relative rounded-full bg-tch-orange p-1.5 text-white shadow-lg shadow-orange-200 transition-transform hover:scale-105 active:scale-95"
          >
            <ShoppingCartIcon className="h-4 w-4 text-white" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-tch-orange text-[9px] font-black rounded-full h-4 w-4 flex items-center justify-center border-2 border-tch-orange">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}