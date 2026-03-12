import { useState } from 'react';
import { 
  ShoppingCartIcon, 
  UserIcon, 
  MagnifyingGlassIcon, 
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ClipboardDocumentListIcon,
  BellAlertIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

function fmtNotificationTime(value) {
  if (!value) return 'vua xong';
  const now = Date.now();
  const created = new Date(value).getTime();
  const diff = Math.max(0, Math.floor((now - created) / 1000));

  if (diff < 60) return `${diff}s truoc`;
  if (diff < 3600) return `${Math.floor(diff / 60)}p truoc`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h truoc`;
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
  sortBy,
  onSortByChange,
  filteredCount = 0,
  onResetSearchFilters,
  onOpenAccount, 
  onLogout, 
  onOpenCart,
  onOpenOrderHistory,
  onOpenProfile,
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
    <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[84px] w-full max-w-[1240px] items-center gap-4 px-4 md:px-6">
        
        {/* Block trái: Logo */}
        <div className="min-w-[280px] text-[22px] font-black tracking-tighter uppercase cursor-pointer">
          THE <span className="text-tch-orange">AVENGERS</span> HOUSE
        </div>

        {/* Block giữa: Menu điều hướng */}
        <nav className="hidden flex-1 items-center justify-center gap-9 lg:flex">
          <button
            type="button"
            onClick={() => onTabChange?.('home')}
            className={`relative text-[13px] font-black uppercase tracking-wide transition-colors hover:text-tch-orange ${activeTab === 'home' ? 'text-tch-orange after:absolute after:-bottom-[31px] after:left-0 after:h-[2px] after:w-full after:bg-tch-orange' : 'text-gray-700'}`}
          >
            Trang chủ
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('order')}
            className={`relative text-[13px] font-black uppercase tracking-wide transition-colors hover:text-tch-orange ${activeTab === 'order' ? 'text-tch-orange after:absolute after:-bottom-[31px] after:left-0 after:h-[2px] after:w-full after:bg-tch-orange' : 'text-gray-700'}`}
          >
            Đặt hàng
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('news')}
            className={`relative text-[13px] font-black uppercase tracking-wide transition-colors hover:text-tch-orange ${activeTab === 'news' ? 'text-tch-orange after:absolute after:-bottom-[31px] after:left-0 after:h-[2px] after:w-full after:bg-tch-orange' : 'text-gray-700'}`}
          >
            Tin tức
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('stores')}
            className={`relative text-[13px] font-black uppercase tracking-wide transition-colors hover:text-tch-orange ${activeTab === 'stores' ? 'text-tch-orange after:absolute after:-bottom-[31px] after:left-0 after:h-[2px] after:w-full after:bg-tch-orange' : 'text-gray-700'}`}
          >
            Cửa hàng
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('contact')}
            className={`relative text-[13px] font-black uppercase tracking-wide transition-colors hover:text-tch-orange ${activeTab === 'contact' ? 'text-tch-orange after:absolute after:-bottom-[31px] after:left-0 after:h-[2px] after:w-full after:bg-tch-orange' : 'text-gray-700'}`}
          >
            Liên hệ
          </button>
        </nav>

        {/* Block phải: Các chức năng */}
        <div className="flex min-w-[280px] items-center justify-end space-x-3">
          {isOrderTab && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSearchPopover((prev) => !prev)}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <MagnifyingGlassIcon className="h-6 w-6" />
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
                        placeholder="Tim theo ten, mo ta, danh muc..."
                      />

                      <select
                        value={selectedCatId}
                        onChange={(e) => onSelectedCatIdChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="all">Tat ca loai</option>
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
                        <option value="ALL">Tat ca tinh trang</option>
                        <option value="AVAILABLE">Dang ban</option>
                        <option value="OUT_OF_STOCK">Het mon</option>
                      </select>

                      <select
                        value={priceFilter}
                        onChange={(e) => onPriceFilterChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="ALL">Tat ca khoang gia</option>
                        <option value="DUOI_30000">Duoi 30.000đ</option>
                        <option value="TU_30000_DEN_50000">30.000đ - 50.000đ</option>
                        <option value="TREN_50000">Tren 50.000đ</option>
                      </select>

                      <select
                        value={sortBy}
                        onChange={(e) => onSortByChange?.(e.target.value)}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      >
                        <option value="DEFAULT">Sap xep mac dinh</option>
                        <option value="NAME_ASC">Ten A-Z</option>
                        <option value="NAME_DESC">Ten Z-A</option>
                        <option value="PRICE_ASC">Gia thap den cao</option>
                        <option value="PRICE_DESC">Gia cao den thap</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                        Tim thay {filteredCount} san pham
                      </p>
                      <button
                        type="button"
                        onClick={onResetSearchFilters}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-500 hover:border-tch-orange hover:text-tch-orange"
                      >
                        Xoa bo loc
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
                className="relative rounded-full border border-orange-100 bg-orange-50 p-2.5 text-tch-orange transition-all hover:bg-orange-100 active:scale-95"
                title="Thong bao"
              >
                <BellAlertIcon className="h-5 w-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black text-white">
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
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Thong bao</p>
                        <p className="text-sm font-bold text-gray-700">{unreadNotificationCount} chua doc</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onReadAllNotifications?.()}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-gray-500 hover:border-tch-orange hover:text-tch-orange"
                      >
                        Doc tat ca
                      </button>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto bg-[#fffdfa]">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm font-semibold text-gray-400">Chua co thong bao nao.</div>
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
              className="flex items-center space-x-2 rounded-full border border-orange-100 bg-orange-50 px-4 py-2 transition-all hover:bg-orange-100 active:scale-95"
            >
               <UserIcon className="h-5 w-5 text-tch-orange" />
               <span className="text-[13px] font-bold text-gray-700 truncate max-w-[100px]">
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
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Tài khoản của bác</p>
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
              className="rounded-full border border-orange-100 bg-orange-50 p-2.5 text-tch-orange transition-all hover:bg-orange-100 active:scale-95"
              title="Trang cá nhân"
            >
              <UserCircleIcon className="h-5 w-5" />
            </button>
          )}

          {/* Giỏ hàng */}
          <button
            type="button"
            onClick={onOpenCart}
            className="relative rounded-full bg-tch-orange p-2.5 text-white shadow-lg shadow-orange-200 transition-transform hover:scale-105 active:scale-95"
          >
            <ShoppingCartIcon className="h-5 w-5 text-white" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-tch-orange text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center border-2 border-tch-orange">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}