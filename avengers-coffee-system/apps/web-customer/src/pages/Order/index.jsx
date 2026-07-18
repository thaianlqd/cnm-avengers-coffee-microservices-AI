import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MagnifyingGlassIcon, UserCircleIcon, ShoppingCartIcon, PhoneIcon, ClipboardDocumentListIcon, ArrowRightOnRectangleIcon, UserIcon, ListBulletIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import ProductCard from '../../components/ProductCard';

const MENU_ICONS = [
  '/hc-assets/menu_icon_1.png',
  '/hc-assets/menu_icon_2.png',
  '/hc-assets/menu_icon_3.png',
  '/hc-assets/menu_icon_4.png',
  '/hc-assets/menu_icon_5.png',
  '/hc-assets/menu_icon_6.png',
  '/hc-assets/menu_icon_7.png',
  '/hc-assets/menu_icon_8.png',
  '/hc-assets/menu_icon_9.png',
  '/hc-assets/menu_icon_10.png',
  '/hc-assets/menu_icon_11.png',
];

export default function OrderPage({
  menuSections = [],
  products = [],
  categories = [],
  cartCount = 0,
  onOpenCart,
  userName,
  onOpenAccount,
  onViewDetail,
  onQuickAdd,
  isFavoriteProduct,
  onToggleFavorite,
  searchKeyword,
  onSearchKeywordChange,
  voucherItems = [], // To display at the top
  aiRecommendedProducts = [], // AI Top 3 mon hop gu
  onOpenProductPage, // Mo trang chi tiet san pham rieng
  children, // Render specific page content if provided
  onLogout,
  onOpenOrderHistory,
  onOpenProfile,
  onNavigate,
  selectedCatId,
  onSelectedCatIdChange,
}) {
  const [activeCategory, setActiveCategory] = useState(selectedCatId || 'all');
  
  useEffect(() => {
    if (selectedCatId) {
      setActiveCategory(selectedCatId);
    }
  }, [selectedCatId]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchViewMode, setSearchViewMode] = useState('list'); // 'list' | 'grid'
  const [isSearchBoxOpen, setIsSearchBoxOpen] = useState(false);
  const [copiedVoucherCode, setCopiedVoucherCode] = useState(null);

  const fullText = "Xin chào, bạn cần gì hôm nay?";
  const [placeholderText, setPlaceholderText] = useState("");

  useEffect(() => {
    let i = 0;
    let isDeleting = false;
    let timeoutId;
    
    const typeWriter = () => {
      setPlaceholderText(fullText.substring(0, i) + (isDeleting ? "" : "|"));
      
      let typeSpeed = 100;
      
      if (isDeleting) {
        typeSpeed /= 2;
        i--;
      } else {
        i++;
      }
      
      if (!isDeleting && i === fullText.length) {
        typeSpeed = 2000;
        isDeleting = true;
      } else if (isDeleting && i === 0) {
        isDeleting = false;
        typeSpeed = 500;
      }
      
      timeoutId = setTimeout(typeWriter, typeSpeed);
    };
    
    timeoutId = setTimeout(typeWriter, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  const [sortByOrder, setSortByOrder] = useState('default'); // 'default' | 'price-asc' | 'price-desc' | 'name-asc'
  const [expandedParents, setExpandedParents] = useState({});
  const mobileMenuRef = useRef(null);
  const dropdownRef = useRef(null);
  const productsContainerRef = useRef(null);

  const matchingSearchProducts = useMemo(() => {
    if (!searchKeyword || !String(searchKeyword).trim()) return [];
    const kw = String(searchKeyword).trim().toLowerCase();
    return products.filter((p) => String(p.ten_san_pham || p.name || '').toLowerCase().includes(kw));
  }, [products, searchKeyword]);

  const isMenuAlwaysOpen = false;

  useEffect(() => {
    function handleClickOutside(event) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCopyVoucherCode = (code) => {
    navigator.clipboard.writeText(code);
    alert(`Đã sao chép mã: ${code}`);
  };

  const renderVoucher = (voucher) => {
    const isPercent = voucher.loai_khuyen_mai === 'PERCENT';
    const valueText = isPercent ? `${voucher.gia_tri}%` : `${(voucher.gia_tri / 1000)}K`;
    
    return (
      <div key={voucher.ma_khuyen_mai} className="flex border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm min-w-[280px] max-w-[320px] flex-shrink-0 relative">
        <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-r border-gray-200"></div>
        <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-l border-gray-200"></div>
        
        <div className="bg-[#68c582] text-white flex flex-col justify-center items-center w-[90px] p-2">
          <span className="text-[14px] font-bold">GIẢM</span>
          <span className="text-[26px] font-black leading-none mt-1">{valueText}</span>
        </div>
        
        <div className="p-4 flex-1 flex flex-col justify-center border-l border-dashed border-gray-200 pl-4">
          <h4 className="text-[12px] font-black text-gray-800 uppercase">NHẬP MÃ: {voucher.ma_khuyen_mai}</h4>
          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 font-medium">{voucher.mo_ta || `Giảm ${valueText} cho hóa đơn hợp lệ`}</p>
          <div className="mt-3 flex items-center justify-between">
            <button 
              onClick={() => handleCopyVoucherCode(voucher.ma_khuyen_mai)}
              className="bg-[#b22830] text-white text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-red-800 transition-colors uppercase tracking-wider"
            >
              Sao chép mã
            </button>
            <button className="text-[11px] text-[#1f6fb2] hover:underline font-medium">Điều kiện</button>
          </div>
        </div>
      </div>
    );
  };

  const handleCategorySelect = (id) => {
    setActiveCategory(id);
    if (onSelectedCatIdChange) onSelectedCatIdChange(id);
    if (onNavigate) onNavigate('order');
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
    
    // Smooth scroll to products container if available
    setTimeout(() => {
      if (productsContainerRef.current) {
        const headerOffset = 100; // Offset for sticky headers
        const elementPosition = productsContainerRef.current.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  const toggleParent = (parentId, e) => {
    e.stopPropagation();
    setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  const parentCats = categories.filter(c => c.cap_bac === 1);
  const categoryMenuItems = (
    <>
      <li className="border-b border-gray-100">
        <button
          type="button"
          onClick={() => handleCategorySelect('all')}
          className={`w-full flex items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-gray-50 ${
            activeCategory === 'all' ? 'bg-[#fcf8f2] text-[#b22830] font-bold' : 'text-[#333333]'
          }`}
        >
          <span className="text-[13px] font-medium w-full text-center uppercase">Xem tất cả danh mục</span>
        </button>
      </li>
      {parentCats.map((parent, idx) => {
        const iconUrl = MENU_ICONS[idx % MENU_ICONS.length];
        const isActive = activeCategory === parent.ma_danh_muc;
        return (
          <li key={parent.ma_danh_muc} className="flex flex-col border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => handleCategorySelect(parent.ma_danh_muc)}
              className={`w-full flex items-center justify-between px-6 py-3 text-left transition-colors hover:bg-gray-50 bg-[#f9f9f9] ${
                isActive ? 'text-[#b22830] font-bold' : 'text-[#333333]'
              }`}
            >
              <div className="flex items-center gap-4">
                <img src={iconUrl} alt={parent.ten_danh_muc} className="w-[18px] h-[18px] object-contain" />
                <span className="text-[13px] font-bold uppercase">
                  {parent.ten_danh_muc}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </>
  );

  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      {/* ── TOP HEADER (Full Width) ── */}
      <header className="w-full h-[84px] bg-white flex items-center px-4 lg:px-6 sticky top-0 z-[60] shadow-sm gap-4 border-b border-gray-100 relative">
        
        {/* Mobile Toggle & Logo */}
        <div className="flex items-center h-full relative" ref={mobileMenuRef}>
          {/* Mobile Menu Button */}
          <button 
            className="w-10 h-10 flex flex-col justify-center gap-1 cursor-pointer mr-2 lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
            <span className="w-6 h-0.5 bg-gray-800 block"></span>
          </button>
          
          <div className="flex-shrink-0 h-full flex items-center lg:ml-6 lg:w-[260px]">
            {!isScrolled ? (
              <img 
                src="/hc-assets/logo.png" 
                alt="Highlands Coffee" 
                className="h-[60px] w-auto object-contain cursor-pointer" 
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('order');
                  } else {
                    window.location.href = '/?tab=order';
                  }
                }} 
              />
            ) : (
              <div 
                ref={isScrolled ? dropdownRef : null}
                className="flex items-center gap-4 cursor-pointer w-full relative h-full select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(prev => !prev);
                }}
              >
                <div className="w-5 flex flex-col gap-[3px]">
                  <span className="w-full h-[2px] bg-gray-800 block"></span>
                  <span className="w-full h-[2px] bg-gray-800 block"></span>
                  <span className="w-full h-[2px] bg-gray-800 block"></span>
                </div>
                <span className="text-[14px] font-bold text-gray-800 uppercase whitespace-nowrap">Danh mục sản phẩm</span>

                {/* Dropdown List in Top Header */}
                <ul 
                  className={`absolute top-[84px] left-[-24px] w-[260px] bg-white shadow-xl border border-gray-100 transition-all duration-200 z-[100] ${
                    isDropdownOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible pointer-events-none translate-y-2'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {categoryMenuItems}
                </ul>
              </div>
            )}
          </div>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="absolute top-[84px] left-0 w-[260px] bg-white border border-gray-200 shadow-lg rounded-b-md z-[100] max-h-[calc(100vh-100px)] overflow-y-auto lg:hidden">
              <ul className="py-2 w-full">
                {categoryMenuItems}
              </ul>
            </div>
          )}
        </div>
        <div className="flex-1 max-w-[500px]">
          <div className="relative">
            <input
              type="text"
              placeholder={placeholderText}
              className="w-full bg-[#f3f4f6] rounded-[20px] pl-6 pr-12 py-2.5 text-[14px] text-gray-700 outline-none focus:ring-1 focus:ring-gray-300 transition-all border border-gray-200"
              value={searchKeyword || ''}
              onFocus={() => { if (searchKeyword && String(searchKeyword).trim()) setIsSearchBoxOpen(true); }}
              onChange={(e) => {
                onSearchKeywordChange?.(e.target.value);
                setIsSearchBoxOpen(true);
              }}
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-[#e4d5c7] rounded-full text-[#b22830] shadow-sm hover:bg-[#d4c3b0] transition-colors">
              <MagnifyingGlassIcon className="w-4 h-4 font-bold" />
            </button>

            {/* FLOATING SEARCH RESULTS DROPDOWN */}
            {isSearchBoxOpen && searchKeyword && String(searchKeyword).trim() && (
              <div className="absolute top-full left-0 right-0 mt-2.5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
                  <span className="text-[14px] font-bold text-gray-700">
                    Kết quả tìm kiếm cho <span className="text-[#b22830] font-black">{searchKeyword}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSearchViewMode('list')}
                      className={`p-1.5 rounded-md transition-colors ${searchViewMode === 'list' ? 'bg-gray-200 text-[#b22830]' : 'text-gray-400 hover:bg-gray-100'}`}
                      title="Danh sách"
                    >
                      <ListBulletIcon className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchViewMode('grid')}
                      className={`p-1.5 rounded-md transition-colors ${searchViewMode === 'grid' ? 'bg-gray-200 text-[#b22830]' : 'text-gray-400 hover:bg-gray-100'}`}
                      title="Lưới"
                    >
                      <Squares2X2Icon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-5 py-2 bg-white border-b border-gray-100 text-xs">
                  <span className="font-semibold text-gray-700">Hiển thị kết quả theo:</span>
                  <span className="px-3 py-1 rounded-full bg-gray-400 text-white font-bold text-[12px]">Sản phẩm</span>
                </div>

                <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                  {matchingSearchProducts.length === 0 ? (
                    <div className="p-8 text-center text-sm font-medium text-gray-500">
                      Không tìm thấy sản phẩm phù hợp với từ khóa "{searchKeyword}".
                    </div>
                  ) : searchViewMode === 'list' ? (
                    <div className="divide-y divide-gray-100">
                      {matchingSearchProducts.map((p) => (
                        <div
                          key={p.ma_san_pham || p.id}
                          onClick={() => {
                            setIsSearchBoxOpen(false);
                            onViewDetail?.(p);
                          }}
                          className="flex items-center justify-between px-5 py-3 hover:bg-[#fcf8f2] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={p.hinh_anh_url || p.img}
                              alt={p.ten_san_pham || p.name}
                              className="w-14 h-14 object-contain rounded bg-[#fdfaf5] p-1 border border-gray-100"
                            />
                            <span className="font-bold text-sm text-[#333333]">
                              {p.ten_san_pham || p.name}
                            </span>
                          </div>
                          <span className="font-black text-sm text-[#b22830]">
                            {(Number(p.gia_ban) || 0).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 p-4">
                      {matchingSearchProducts.map((p) => (
                        <div
                          key={p.ma_san_pham || p.id}
                          onClick={() => {
                            setIsSearchBoxOpen(false);
                            onViewDetail?.(p);
                          }}
                          className="flex flex-col rounded-xl border border-gray-100 p-3 hover:shadow-md cursor-pointer transition-all bg-white"
                        >
                          <img
                            src={p.hinh_anh_url || p.img}
                            alt={p.ten_san_pham || p.name}
                            className="h-28 w-full object-contain rounded-lg bg-[#fdfaf5] p-2"
                          />
                          <span className="font-bold text-xs text-[#333333] line-clamp-1 mt-2">
                            {p.ten_san_pham || p.name}
                          </span>
                          <span className="font-black text-sm text-[#b22830] mt-1">
                            {(Number(p.gia_ban) || 0).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={() => setIsSearchBoxOpen(false)}
                    className="text-xs font-bold text-gray-700 hover:text-[#b22830] transition-colors"
                  >
                    Xem thêm sản phẩm có chứa <span className="text-[#b22830] font-black">{searchKeyword}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-6 ml-auto mr-2 lg:mr-8">
          <div className="hidden md:flex items-center gap-2">
            <img src="/hc-assets/uk.png" alt="EN" className="w-[30px] h-auto object-contain cursor-pointer hover:opacity-80 transition-opacity" />
          </div>
          
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-full border border-[#b22830] flex items-center justify-center text-[#b22830]">
              <PhoneIcon className="w-[18px] h-[18px]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] text-gray-700 font-bold leading-tight">Giao tận nơi</span>
              <span className="text-[14px] font-black text-[#333333] leading-tight">19001755</span>
            </div>
          </div>

          <div className="relative group cursor-pointer">
            <div 
              className="flex items-center gap-3"
              onClick={!userName ? onOpenAccount : onOpenProfile}
            >
              <div className="w-[34px] h-[34px] rounded-full border border-[#b22830] flex items-center justify-center text-[#b22830] group-hover:bg-[#b22830] group-hover:text-white transition-colors">
                <UserCircleIcon className="w-5 h-5" />
              </div>
              <div className="hidden lg:flex flex-col">
                <span className="text-[12px] text-gray-700 font-bold leading-tight">Tài khoản</span>
                <span className="text-[12px] font-normal text-gray-500 leading-tight line-clamp-1">{userName || 'Đăng nhập'}</span>
                {userName && (
                  <span 
                    onClick={(e) => { e.stopPropagation(); onLogout?.(); }}
                    className="text-[11px] text-[#b22830] hover:text-red-800 font-bold mt-0.5 transition-colors"
                  >
                    Đăng xuất
                  </span>
                )}
              </div>
            </div>

          </div>

          <button
            onClick={onOpenCart}
            className="flex items-center gap-3 px-4 py-1.5 border border-[#b22830] rounded-md hover:bg-red-50 transition-colors bg-white h-[38px] cursor-pointer"
          >
            <ShoppingCartIcon className="w-5 h-5 text-[#b22830]" />
            <span className="text-[14px] font-bold text-[#333333] mr-1">Giỏ hàng</span>
            <span className="bg-[#f3f4f6] text-[#b22830] text-[13px] font-bold px-2 py-0.5 rounded-[4px] min-w-[24px] text-center border border-gray-200">
              {cartCount}
            </span>
          </button>
        </div>
      </header>

      {/* ── MAIN LAYOUT (Full Width) ── */}
      <div className="flex w-full mx-auto max-w-[1440px] px-0 lg:px-4 relative">
        
        {/* ── MAIN CONTENT (Red bar + Banner + Products) ── */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          
          {/* Red Menu Bar */}
          <div className="w-full h-[50px] bg-[#b22830] relative z-20 flex items-center px-6 lg:px-8 gap-8">
            {/* Categories Dropdown in Red Bar */}
            <div 
              ref={!isScrolled ? dropdownRef : null}
              className="relative h-full w-[260px] flex shrink-0 items-center bg-white px-6 cursor-pointer select-none"
              onClick={(e) => {
                e.stopPropagation();
                setIsDropdownOpen(prev => !prev);
              }}
            >
              <div className="w-5 flex flex-col gap-[3px] mr-3">
                <span className="w-full h-[2px] bg-[#b22830] block"></span>
                <span className="w-full h-[2px] bg-[#b22830] block"></span>
                <span className="w-full h-[2px] bg-[#b22830] block"></span>
              </div>
              <span className="text-[14px] font-bold text-[#b22830] uppercase whitespace-nowrap">Danh mục sản phẩm</span>

              {/* Dropdown List */}
              <ul 
                className={`absolute top-[50px] left-0 w-[260px] bg-white shadow-xl border border-gray-100 transition-all duration-200 z-[100] ${
                  (isDropdownOpen && !isScrolled) ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible pointer-events-none translate-y-2'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {categoryMenuItems}
              </ul>
            </div>

            {children && (
              <button
                type="button"
                onClick={() => onNavigate?.('order')}
                className="flex items-center gap-1.5 text-white hover:text-gray-200 transition-colors bg-transparent border-none p-0 cursor-pointer font-black text-[13px] uppercase tracking-wider mr-auto"
              >
                <span>←</span>
                <span>Quay lại Thực đơn</span>
              </button>
            )}

            <button type="button" onClick={() => onNavigate?.('chinh-sach-dat-hang')} className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer">
              <img src="/hc-assets/icon_chinhsach.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span className="text-[13px] font-medium">Chính sách đổi trả</span>
            </button>
            <button type="button" onClick={() => onNavigate?.('lien-he')} className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer">
              <img src="/hc-assets/icon_lienhe.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span className="text-[13px] font-medium">Liên hệ</span>
            </button>
            <a href="#" className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
              <img src="/hc-assets/icon_bank.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span className="text-[13px] font-medium">Bankrista Thịnh Vượng</span>
            </a>
          </div>

          {/* Content Area */}
          <div className="w-full bg-white pb-10">
            {children ? (
              children
            ) : (
              <>
                {/* Hero Banner Area (Only show when viewing all categories) */}
                {activeCategory === 'all' && (
                  <div className="w-full mb-10 px-6 lg:px-8">
                    {/* Banner */}
                    <div className="w-full relative group bg-[#42a853] rounded-2xl overflow-hidden shadow-sm">
                      <img src="/hc-assets/slider_1.jpg" alt="Tươi Tỉnh Ngày Hè" className="w-full h-auto object-cover max-h-[600px]" />
                    </div>
                  </div>
                )}

                {/* Vouchers horizontally scrollable (Top-level if activeCategory is 'all') */}
                {activeCategory === 'all' && voucherItems && voucherItems.length > 0 && (
                  <div className="px-6 lg:px-8 mb-10">
                    <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar">
                      {voucherItems.map(renderVoucher)}
                    </div>
                  </div>
                )}

                {/* AI TOP 3 RECOMMENDED PRODUCTS UNDER VOUCHER */}
                {activeCategory === 'all' && aiRecommendedProducts && aiRecommendedProducts.length > 0 && (
                  <div className="px-6 lg:px-8 mb-10">
                    <div className="bg-white rounded-2xl border border-orange-100 p-6 md:p-8 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-gray-100 pb-5 mb-6">
                        <div>
                          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d67b3c]">
                            SMART RECOMMENDATION
                          </span>
                          <h2 className="mt-1 text-2xl md:text-3xl font-black uppercase tracking-tight text-[#113a5d]">
                            TOP 3 MÓN HỢP GU CỦA BẠN
                          </h2>
                          <p className="mt-1 text-sm font-medium text-gray-600">
                            Cá nhân hóa theo lịch sử mua hàng, đánh giá, yêu thích và xu hướng dùng ưu đãi.
                          </p>
                          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#2c6e91]">
                            DONG BO CUSTOMER VOI TOP HANH VI 30 NGAY
                          </p>
                        </div>
                        <button
                          type="button"
                          className="self-start inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-orange-300 bg-orange-50/50 text-xs font-bold text-[#d67b3c] uppercase tracking-wider"
                        >
                          AI PERSONAL
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {aiRecommendedProducts.slice(0, 3).map((product) => {
                          const isFav = isFavoriteProduct ? isFavoriteProduct(product) : false;
                          return (
                            <div
                              key={product.ma_san_pham || product.id}
                              onClick={() => onViewDetail?.(product)}
                              className="group relative flex flex-col justify-between rounded-[24px] bg-[#faf8f4] p-5 cursor-pointer transition-all hover:shadow-md"
                            >
                              <div>
                                <div className="relative mb-4 flex h-[200px] items-center justify-center overflow-hidden rounded-2xl bg-white/60 p-3">
                                  <img
                                    src={product.hinh_anh_url || product.img || '/hc-assets/caphe-1.png'}
                                    alt={product.ten_san_pham || product.name}
                                    className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleFavorite?.(product);
                                    }}
                                    className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm transition-colors ${
                                      isFav ? 'text-[#b22830]' : 'text-gray-400 hover:text-[#b22830]'
                                    }`}
                                  >
                                    ♥
                                  </button>
                                </div>

                                <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                                  {product?.danhMuc?.ten_danh_muc || 'CÀ PHÊ'}
                                </p>
                                <h3 className="mt-1 text-lg font-black uppercase text-[#222222] line-clamp-1">
                                  {product.ten_san_pham || product.name}
                                </h3>
                                <p className="mt-2 text-xl font-black text-[#222222]">
                                  {(Number(product.gia_ban) || 39000).toLocaleString('vi-VN')} đ
                                </p>
                              </div>

                              <div className="mt-5 grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => onViewDetail?.(product)}
                                  className="w-full rounded-full border border-[#c8762d] bg-white py-2 text-center text-xs font-bold uppercase text-[#c8762d] transition-colors hover:bg-orange-50"
                                >
                                  CHI TIẾT
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onQuickAdd?.(product)}
                                  className="w-full rounded-full bg-[#b85d19] py-2 text-center text-xs font-bold uppercase text-white transition-colors hover:bg-[#a04e13]"
                                >
                                  THÊM
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mobile Horizontal Scroll Category Tab Bar (Sticky top below main header) */}
                <div className="lg:hidden sticky top-[84px] z-30 bg-white border-b border-gray-100 py-3 shadow-md overflow-x-auto no-scrollbar flex gap-2 px-6">
                  <button
                    type="button"
                    onClick={() => handleCategorySelect('all')}
                    className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-bold uppercase transition-all flex-shrink-0 ${
                      activeCategory === 'all'
                        ? 'bg-[#b22830] text-white shadow-sm'
                        : 'bg-[#f5f5f5] text-[#333333] hover:bg-gray-200'
                    }`}
                  >
                    Tất cả
                  </button>
                  {parentCats.map((parent, idx) => {
                    const iconUrl = MENU_ICONS[idx % MENU_ICONS.length];
                    const isActive = activeCategory === parent.ma_danh_muc;
                    return (
                      <button
                        key={parent.ma_danh_muc}
                        type="button"
                        onClick={() => handleCategorySelect(parent.ma_danh_muc)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase transition-all flex-shrink-0 ${
                          isActive
                            ? 'bg-[#b22830] text-white shadow-sm'
                            : 'bg-[#f5f5f5] text-[#333333] hover:bg-gray-200'
                        }`}
                      >
                        <img 
                          src={iconUrl} 
                          alt="" 
                          className={`w-3.5 h-3.5 object-contain ${isActive ? 'brightness-0 invert' : ''}`} 
                        />
                        {parent.ten_danh_muc}
                      </button>
                    );
                  })}
                </div>

                {/* Main Two-Column Layout for Products */}
                <div ref={productsContainerRef} className="flex flex-col lg:flex-row gap-8 px-6 lg:px-8 mt-6">
                  
                  {/* Left Column: Sticky Sidebar Category Menu (Desktop only) */}
                  <div className="hidden lg:block w-[260px] flex-shrink-0 sticky top-[100px] self-start z-10">
                    <div className="bg-[#fdfaf6] rounded-2xl border border-[#ebdccb] p-5 shadow-sm">
                      <h3 className="text-[13px] font-black text-[#b22830] uppercase mb-4 tracking-widest pb-2 border-b border-[#ebdccb]">
                        Danh mục món ăn
                      </h3>
                      <ul className="space-y-1.5">
                        <li>
                          <button
                            type="button"
                            onClick={() => handleCategorySelect('all')}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all ${
                              activeCategory === 'all'
                                ? 'bg-[#b22830] text-white font-bold shadow-md'
                                : 'text-[#333333] hover:bg-gray-100 font-medium'
                            }`}
                          >
                            <span className="text-[13px] uppercase tracking-wide">Xem tất cả</span>
                          </button>
                        </li>
                        {parentCats.map((parent, idx) => {
                          const iconUrl = MENU_ICONS[idx % MENU_ICONS.length];
                          const isActive = activeCategory === parent.ma_danh_muc;
                          return (
                            <li key={parent.ma_danh_muc}>
                              <button
                                type="button"
                                onClick={() => handleCategorySelect(parent.ma_danh_muc)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all ${
                                  isActive
                                    ? 'bg-[#b22830] text-white font-bold shadow-md'
                                    : 'text-[#333333] hover:bg-gray-100 font-medium'
                                }`}
                              >
                                <img 
                                  src={iconUrl} 
                                  alt="" 
                                  className={`w-5 h-5 object-contain ${isActive ? 'brightness-0 invert' : ''}`} 
                                />
                                <span className="text-[13px] uppercase tracking-wide">{parent.ten_danh_muc}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Products List & Category Details */}
                  <div className="flex-1 min-w-0">
                    
                    {/* Separate Category View Header (Breadcrumbs, sorting, title) */}
                    {activeCategory !== 'all' && (
                      <div className="mb-6">
                        <div className="text-[13px] text-[#999999] mb-4 font-medium">
                          <span className="cursor-pointer hover:text-gray-800" onClick={() => handleCategorySelect('all')}>Trang chủ</span>
                          <span className="mx-2">/</span>
                          <span className="text-[#333333]">
                            {menuSections.find(s => s.id === activeCategory)?.label || 'Danh mục'}
                          </span>
                        </div>
                        
                        {/* Vouchers horizontally scrollable */}
                        {voucherItems && voucherItems.length > 0 && (
                          <div className="flex overflow-x-auto gap-4 pb-4 mb-6 custom-scrollbar">
                            {voucherItems.map(renderVoucher)}
                          </div>
                        )}

                        {/* Category Title */}
                        <div className="mb-6 border-b border-gray-100 pb-4">
                          <h1 className="text-[28px] font-serif font-bold text-[#111111] mb-2">
                            Danh mục
                          </h1>
                          <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#333333] mb-4">
                            <span className="font-bold">Sắp xếp:</span>
                            <button
                              type="button"
                              onClick={() => setSortByOrder('name-asc')}
                              className={`transition-colors font-medium ${sortByOrder === 'name-asc' ? 'text-[#b22830] font-black underline' : 'text-[#666666] hover:text-[#b22830]'}`}
                            >
                              Tên A → Z
                            </button>
                            <button
                              type="button"
                              onClick={() => setSortByOrder('name-desc')}
                              className={`transition-colors font-medium ${sortByOrder === 'name-desc' ? 'text-[#b22830] font-black underline' : 'text-[#666666] hover:text-[#b22830]'}`}
                            >
                              Tên Z → A
                            </button>
                            <button
                              type="button"
                              onClick={() => setSortByOrder('price-asc')}
                              className={`transition-colors font-medium ${sortByOrder === 'price-asc' ? 'text-[#b22830] font-black underline' : 'text-[#666666] hover:text-[#b22830]'}`}
                            >
                              Giá tăng dần
                            </button>
                            <button
                              type="button"
                              onClick={() => setSortByOrder('price-desc')}
                              className={`transition-colors font-medium ${sortByOrder === 'price-desc' ? 'text-[#b22830] font-black underline' : 'text-[#666666] hover:text-[#b22830]'}`}
                            >
                              Giá giảm dần
                            </button>
                            <button
                              type="button"
                              onClick={() => setSortByOrder('newest')}
                              className={`transition-colors font-medium ${sortByOrder === 'newest' ? 'text-[#b22830] font-black underline' : 'text-[#666666] hover:text-[#b22830]'}`}
                            >
                              Hàng mới
                            </button>
                          </div>
                          <div className="text-[13px] font-bold text-[#333333] uppercase">
                            HIỂN THỊ: <span className="text-[#b22830] font-black text-[15px]">{activeCategory === 'all' ? 'TẤT CẢ DANH MỤC' : categories.find(c => String(c.ma_danh_muc) === String(activeCategory).replace('group-', ''))?.ten_danh_muc || 'CÀ PHÊ'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Product Grids */}
                    <div className="space-y-12">
                      {menuSections
                        .filter((section) => {
                          if (activeCategory === 'all') return true;
                          const parsedActive = String(activeCategory).replace('group-', '');
                          if (String(section.id) === parsedActive) return true;
                          const sectionCat = categories.find(c => String(c.ma_danh_muc) === String(section.id));
                          if (sectionCat && String(sectionCat.ma_danh_muc_cha) === parsedActive) return true;
                          return false;
                        })
                        .map((section, idx) => {
                          const parsedActive = String(activeCategory).replace('group-', '');
                          const isParentCategory = activeCategory === 'all' ? false : categories.find(c => String(c.ma_danh_muc) === parsedActive)?.cap_bac === 1;
                          const showSectionTitle = activeCategory === 'all' || isParentCategory;
                          
                          const allItems = section.subSections.flatMap(sub => sub.items);
                          const sortedItems = [...allItems].sort((a, b) => {
                            if (sortByOrder === 'price-asc') return Number(a.gia_ban || 0) - Number(b.gia_ban || 0);
                            if (sortByOrder === 'price-desc') return Number(b.gia_ban || 0) - Number(a.gia_ban || 0);
                            if (sortByOrder === 'name-asc') return String(a.ten_san_pham || '').localeCompare(String(b.ten_san_pham || ''), 'vi');
                            return 0;
                          });
                          const displayItems = activeCategory === 'all' ? sortedItems.slice(0, 10) : sortedItems;
                          const hasMore = activeCategory === 'all' && allItems.length > 10;
                          const parentCatIndex = parentCats.findIndex(c => String(c.ma_danh_muc) === String(section.id));
                          const sectionIconUrl = parentCatIndex !== -1 ? MENU_ICONS[parentCatIndex % MENU_ICONS.length] : MENU_ICONS[idx % MENU_ICONS.length];

                          return (
                            <section key={section.id} id={`category-${section.id}`} className="scroll-mt-[120px]">
                              {showSectionTitle && (
                                <div className="flex items-center justify-between border-b border-[#ebdccb] pb-3 mb-8">
                                  <div className="flex items-center gap-3">
                                    <img src={sectionIconUrl} className="w-8 h-8 object-contain" alt="" />
                                    <h3 className="text-lg md:text-xl font-black text-[#8c252a] tracking-wider uppercase font-sans">
                                      {section.label}
                                    </h3>
                                  </div>
                                  <div className="h-0.5 flex-1 bg-[#ebdccb] ml-4 hidden md:block opacity-40"></div>
                                </div>
                              )}

                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                                {displayItems.map((p) => {
                                  // Custom Product Card styling for Order page
                                  return (
                                    <div key={p.ma_san_pham} className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative flex flex-col">
                                      <div className="relative aspect-square overflow-hidden bg-[#f9f9f9] cursor-pointer" onClick={() => (onOpenProductPage ? onOpenProductPage(p) : onViewDetail?.(p))}>
                                        <img src={p.hinh_anh_url} alt={p.ten_san_pham} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        
                                        {/* Badges */}
                                        {p.la_hot && (
                                          <div className="absolute bottom-0 left-0 bg-[#f37021] text-white text-[14px] font-black uppercase px-3 py-2 z-10 w-[90px] text-center leading-tight">
                                            BÁN CHẠY!
                                          </div>
                                        )}
                                        {!p.la_hot && p.la_moi && (
                                          <div className="absolute bottom-0 left-0 bg-[#00a651] text-white text-[14px] font-black uppercase px-3 py-2 z-10 w-[90px] text-center leading-tight">
                                            THỬ NGAY!
                                          </div>
                                        )}
                                        {p.dang_giam_gia && (
                                          <div className="absolute top-2 left-2 w-10 h-10 rounded-full bg-[#b22830] text-white flex items-center justify-center text-[12px] font-bold z-10">
                                            -{Math.round((1 - p.gia_ban / p.gia_niem_yet) * 100)}%
                                          </div>
                                        )}
                                      </div>

                                      <div className="p-4 flex flex-col flex-1">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Highlands Coffee</p>
                                        <h4 className="text-[14px] font-bold text-[#333333] mb-2 leading-tight cursor-pointer hover:text-[#b22830]" onClick={() => onViewDetail?.(p)}>
                                          {p.ten_san_pham}
                                        </h4>
                                        <div className="mt-auto flex items-end justify-between">
                                          <div className="flex flex-col">
                                            <span className="text-[15px] font-bold text-[#b22830]">
                                              {Number(p.gia_ban).toLocaleString('vi-VN')}đ
                                            </span>
                                            {p.dang_giam_gia && (
                                              <span className="text-[12px] text-gray-400 line-through">
                                                {Number(p.gia_niem_yet).toLocaleString('vi-VN')}đ
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onQuickAdd?.(p);
                                            }}
                                            className="w-8 h-8 rounded-full bg-white border border-[#b22830] text-[#b22830] flex items-center justify-center hover:bg-[#b22830] hover:text-white transition-colors"
                                          >
                                            <span className="text-xl font-bold leading-none -mt-1">+</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {hasMore && (
                                <div className="mt-8 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleCategorySelect(section.id)}
                                    className="px-6 py-2 border border-[#b22830] text-[#b22830] text-[13px] font-bold rounded-full hover:bg-[#b22830] hover:text-white transition-colors"
                                  >
                                    Xem tất cả &gt;
                                  </button>
                                </div>
                              )}
                            </section>
                          );
                        })}
                    </div>

                  </div>
                </div>
              </>
            )}
          </div>
      </main>
      </div>

      {/* Scroll to Top Button */}
      {isScrolled && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-8 w-12 h-12 bg-[#b22830] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#911f25] transition-all z-50 animate-bounce cursor-pointer border-none"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg>
        </button>
      )}
    </div>
  );
}
