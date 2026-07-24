import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  MagnifyingGlassIcon, 
  UserCircleIcon, 
  ShoppingCartIcon, 
  PhoneIcon, 
  ClipboardDocumentListIcon, 
  ArrowRightOnRectangleIcon, 
  UserIcon, 
  ListBulletIcon, 
  Squares2X2Icon 
} from '@heroicons/react/24/outline';
import QuickViewModal from '../../components/QuickViewModal';
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

const BANNER_IMAGES = [
  '/hc-assets/slider_1.jpg',
  'https://bizweb.dktcdn.net/100/487/455/themes/917232/assets/slider_2.jpg?1784168867138',
  'https://bizweb.dktcdn.net/100/487/455/themes/917232/assets/slider_3.jpg?1784168867138'
];

function BannerSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BANNER_IMAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full relative group bg-[#42a853] rounded-2xl overflow-hidden shadow-sm flex items-center justify-center aspect-[16/9]">
      {BANNER_IMAGES.map((img, idx) => (
        <img 
          key={idx}
          src={img} 
          alt={`Banner ${idx + 1}`} 
          className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-1000 ${idx === currentIndex ? 'opacity-100' : 'opacity-0'}`} 
        />
      ))}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {BANNER_IMAGES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`w-2.5 h-2.5 rounded-full transition-colors border-none p-0 cursor-pointer ${idx === currentIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/80'}`}
          />
        ))}
      </div>
    </div>
  );
}

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
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'vi';

  const [activeCategory, setActiveCategory] = useState(selectedCatId || 'all');
  
  useEffect(() => {
    if (selectedCatId) {
      setActiveCategory(selectedCatId);
    }
  }, [selectedCatId]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchViewMode, setSearchViewMode] = useState('list'); // 'list' | 'grid'
  const [isSearchBoxOpen, setIsSearchBoxOpen] = useState(false);
  const [copiedVoucherCode, setCopiedVoucherCode] = useState(null);

  const fullText = t('home.searchPlaceholder');
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

  const isPersonalVoucher = (v) => {
    if (!v) return false;
    if (v.loai_phan_phoi === 'PERSONAL') return true;
    if (v.ma_nguoi_dung && String(v.ma_nguoi_dung).trim() !== '') return true;
    if (v.loai_su_kien && v.loai_su_kien !== 'PUBLIC') return true;
    const code = String(v.ma_khuyen_mai || v.ma_voucher || '').toUpperCase();
    if (
      code.startsWith('LW_') ||
      code.startsWith('WHEEL_') ||
      code.startsWith('BD_') ||
      code.startsWith('TIER_') ||
      code.startsWith('UP_') ||
      code.startsWith('USER_') ||
      code.startsWith('KS') ||
      code.startsWith('SURVEY_')
    ) return true;
    return false;
  };

  const personalVouchers = useMemo(() => {
    return (voucherItems || [])
      .filter(isPersonalVoucher)
      .filter((v) => v.co_the_dung !== false && (v.da_dung_boi_ban === undefined || v.da_dung_boi_ban < (v.gioi_han_moi_nguoi || 1)));
  }, [voucherItems]);

  const publicVouchers = useMemo(() => {
    return (voucherItems || [])
      .filter((v) => !isPersonalVoucher(v))
      .filter((v) => v.co_the_dung !== false && (v.da_dung_boi_ban === undefined || v.da_dung_boi_ban < (v.gioi_han_moi_nguoi || 1)));
  }, [voucherItems]);

  const renderVoucherCard = (voucher, isPersonal = false) => {
    const code = String(voucher.ma_khuyen_mai || voucher.ma_voucher || voucher.code || '').toUpperCase();
    const type = String(voucher.loai_khuyen_mai || voucher.loai || '').toUpperCase();
    const isPercent = type.includes('PERCENT');
    const rawVal = Number(voucher.gia_tri || 0);
    let valueText = isPercent ? `${rawVal}%` : (rawVal >= 1000 ? `${Math.round(rawVal / 1000)}K` : `${rawVal || 10}K`);
    
    if (type.includes('FREE_ITEM') || code.includes('TOPPING')) {
      valueText = 'FREE';
    }

    const badgeBg = isPersonal 
      ? 'bg-gradient-to-br from-[#f26b1d] to-[#d4560e]' 
      : 'bg-[#68c582]';
    
    const tagText = isPersonal
      ? (
          voucher.loai_su_kien === 'LUCKY_WHEEL' || code.startsWith('WHEEL_') || code.startsWith('LW_')
            ? '🎲 VÒNG QUAY'
            : voucher.loai_su_kien === 'BIRTHDAY' || code.startsWith('BD_')
            ? '🎂 SINH NHẬT'
            : voucher.loai_su_kien === 'SURVEY' || code.startsWith('KS') || code.startsWith('SURVEY_')
            ? '📋 KHẢO SÁT'
            : voucher.loai_su_kien === 'TIER_UP' || code.startsWith('UP_') || code.startsWith('TIER_')
            ? '🎖️ THĂNG HẠNG'
            : '🎁 CÁ NHÂN'
        )
      : '📢 CHUNG';

    return (
      <div key={code} className="flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm min-w-[290px] max-w-[320px] flex-shrink-0 relative group hover:shadow-md transition-all">
        <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-r border-gray-200 z-10"></div>
        <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-l border-gray-200 z-10"></div>
        
        {/* Left Badge */}
        <div className={`${badgeBg} text-white flex flex-col justify-center items-center w-[95px] p-2 flex-shrink-0 relative`}>
          <span className="text-[9px] font-black tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded text-center mb-1">
            {tagText}
          </span>
          <span className="text-[12px] font-bold">GIẢM</span>
          <span className="text-[24px] font-black leading-none mt-0.5">{valueText}</span>
        </div>
        
        {/* Right Details */}
        <div className="p-3 flex-1 flex flex-col justify-center border-l border-dashed border-gray-200 pl-4 min-w-0">
          <h4 className="text-[12px] font-black text-gray-800 uppercase truncate" title={code}>
            MÃ: <span className={isPersonal ? 'text-[#f26b1d]' : 'text-[#282828]'}>{code}</span>
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 font-medium">
            {voucher.ten_khuyen_mai || voucher.mo_ta || (isPersonal ? 'Đặc quyền dành riêng cho bạn' : `Giảm ${valueText} toàn hệ thống`)}
          </p>
          <div className="mt-2.5 flex items-center justify-between">
            <button 
              onClick={() => handleCopyVoucherCode(code)}
              className={`${isPersonal ? 'bg-[#f26b1d] hover:bg-[#c2410c]' : 'bg-[#b22830] hover:bg-red-800'} text-white text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors uppercase tracking-wider cursor-pointer shadow-xs`}
            >
              Sao chép mã
            </button>
            <span className="text-[10px] text-gray-400 font-semibold">
              {voucher.ngay_ket_thuc ? `HSD: ${new Date(voucher.ngay_ket_thuc).toLocaleDateString('vi-VN')}` : 'HSD: Hạn dài'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleCategorySelect = (id) => {
    // Check if selected category is "Thẻ Quà Tặng" - navigate to gift card page
    const selectedCat = categories.find(c => String(c.ma_danh_muc) === String(id));
    if (selectedCat && (selectedCat.ten_danh_muc?.toLowerCase().includes('thẻ quà') || selectedCat.ten_danh_muc?.toLowerCase().includes('gift'))) {
      if (onNavigate) onNavigate('gift-card');
      setIsDropdownOpen(false);
      setIsMobileMenuOpen(false);
      return;
    }
    setActiveCategory(id);
    if (onSelectedCatIdChange) onSelectedCatIdChange(id);
    if (onNavigate) onNavigate('order');
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
    
    // Smooth scroll directly to the selected category section
    setTimeout(() => {
      const parsedId = String(id).replace('group-', '');
      let targetElem = document.getElementById(`category-${parsedId}`) || document.getElementById(`category-${id}`);
      
      // If parent category selected, try to find section for its first child
      if (!targetElem) {
        const childCat = categories.find(c => String(c.ma_danh_muc_cha) === parsedId);
        if (childCat) {
          targetElem = document.getElementById(`category-${childCat.ma_danh_muc}`);
        }
      }

      if (targetElem) {
        const headerOffset = 110;
        const elementPosition = targetElem.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      } else if (productsContainerRef.current) {
        const headerOffset = 100;
        const elementPosition = productsContainerRef.current.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
      }
    }, 60);
  };

  const toggleParent = (parentId, e) => {
    e.stopPropagation();
    setExpandedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
  };

  const parentCats = categories.filter(c => c.cap_bac === 1);
  const categoryMenuItems = (
    <>
      {parentCats.map((parent, idx) => {
        const iconUrl = MENU_ICONS[idx % MENU_ICONS.length];
        const isActive = activeCategory === parent.ma_danh_muc;
        return (
          <li key={parent.ma_danh_muc} className="flex flex-col border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => handleCategorySelect(parent.ma_danh_muc)}
              className={`w-full flex items-center justify-between px-8 py-4 text-left transition-colors hover:bg-gray-50 bg-white ${
                isActive ? 'text-[#b22830] font-bold' : 'text-[#333333]'
              }`}
            >
              <div className="flex items-center gap-4">
                <img src={iconUrl} alt={parent.ten_danh_muc} className="w-5 h-5 object-contain" />
                <span className="text-[15px] font-bold capitalize">
                  {parent.ten_danh_muc.toLowerCase()}
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
      <header className={`w-full bg-white flex items-center px-4 lg:px-6 sticky top-0 z-[60] shadow-sm gap-4 border-b border-gray-100 relative transition-all duration-300 ${isScrolled ? 'h-[64px]' : 'h-[84px]'}`}>
        
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
                  handleCategorySelect('all');
                  if (onNavigate) {
                    onNavigate('order');
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }} 
              />
            ) : (
              <div 
                ref={isScrolled ? dropdownRef : null}
                className="group flex items-center gap-4 cursor-pointer w-full relative h-full select-none"
              >
                <div className="w-5 flex flex-col gap-[3px]">
                  <span className="w-full h-[2px] bg-[#333333] block"></span>
                  <span className="w-full h-[2px] bg-[#333333] block"></span>
                  <span className="w-full h-[2px] bg-[#333333] block"></span>
                </div>
                <span className="text-[16px] font-bold text-[#333333] whitespace-nowrap">Danh mục sản phẩm</span>

                {/* Dropdown Backdrop */}
                <div className="fixed inset-0 bg-black/40 z-[-1] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none"></div>

                {/* Dropdown List in Top Header */}
                <ul 
                  className="absolute top-full left-0 w-[300px] bg-white shadow-xl border border-gray-100 transition-all duration-300 z-[100] opacity-0 invisible pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-hover:translate-y-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {categoryMenuItems}
                </ul>
              </div>
            )}
          </div>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-0 w-[260px] bg-white border border-gray-200 shadow-lg rounded-b-md z-[100] max-h-[calc(100vh-100px)] overflow-y-auto lg:hidden">
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
            <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-[#e4d5c7] rounded-full text-[#b22830] shadow-sm hover:bg-[#d4c3b0] transition-colors z-10">
              <MagnifyingGlassIcon className="w-4 h-4 font-bold" />
            </button>

            {/* Search Backdrop Overlay */}
            {isSearchBoxOpen && (
              <div 
                className="fixed inset-0 bg-black/40 z-[-1] transition-opacity duration-300"
                onClick={() => setIsSearchBoxOpen(false)}
              ></div>
            )}

            {/* FLOATING SEARCH RESULTS DROPDOWN */}
            {isSearchBoxOpen && searchKeyword && String(searchKeyword).trim() && (
              <div className="absolute top-full left-0 right-0 mt-2.5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
                  <span className="text-[14px] font-bold text-gray-700">
                    {t('home.searchResult')} <span className="text-[#b22830] font-black">{searchKeyword}</span>
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
                  <span className="font-semibold text-gray-700">{t('home.searchBy')}</span>
                  <span className="px-3 py-1 rounded-full bg-gray-400 text-white font-bold text-[12px]">{t('home.product')}</span>
                </div>

                <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                  {matchingSearchProducts.length === 0 ? (
                    <div className="p-8 text-center text-sm font-medium text-gray-500">
                      {t('home.searchEmpty')} "{searchKeyword}".
                    </div>
                  ) : searchViewMode === 'list' ? (
                    <div className="divide-y divide-gray-100">
                      {matchingSearchProducts.map((p) => (
                        <div
                          key={p.ma_san_pham || p.id}
                          onClick={() => {
                            setIsSearchBoxOpen(false);
                            if (onOpenProductPage) {
                              onOpenProductPage(p);
                            } else {
                              onViewDetail?.(p);
                            }
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
                            if (onOpenProductPage) {
                              onOpenProductPage(p);
                            } else {
                              onViewDetail?.(p);
                            }
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
                    {t('home.searchMore')} <span className="text-[#b22830] font-black">{searchKeyword}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-6 ml-auto mr-2 lg:mr-8">
          <div className="hidden md:flex items-center gap-2">
            <button 
              type="button" 
              onClick={() => i18n.changeLanguage('vi')}
              className={`transition-all hover:scale-110 ${i18n.language === 'vi' ? 'ring-2 ring-[#b22830] opacity-100 rounded-[2px]' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/vn.png" alt="VN" className="h-[20px] rounded-[2px] shadow-sm w-auto block" />
            </button>
            <button 
              type="button" 
              onClick={() => i18n.changeLanguage('en')}
              className={`transition-all hover:scale-110 ${i18n.language === 'en' ? 'ring-2 ring-[#b22830] opacity-100 rounded-[2px]' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/gb.png" alt="EN" className="h-[20px] rounded-[2px] shadow-sm w-auto block" />
            </button>
          </div>
          
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-full border border-[#b22830] flex items-center justify-center text-[#b22830]">
              <PhoneIcon className="w-[18px] h-[18px]" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[11px] font-bold text-gray-500 uppercase">Giao tận nơi</span>
              <span className="text-[16px] font-black text-[#b22830] leading-none">1900 1755</span>
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
                <span className="text-[12px] text-gray-700 font-bold leading-tight">{t('header.account')}</span>
                <span className="text-[12px] font-normal text-gray-500 leading-tight line-clamp-1">{userName || t('header.login')}</span>
                {userName && (
                  <span 
                    onClick={(e) => { e.stopPropagation(); onLogout?.(); }}
                    className="text-[11px] text-[#b22830] hover:text-red-800 font-bold mt-0.5 transition-colors"
                  >
                    {t('header.logout')}
                  </span>
                )}
              </div>
            </div>

            {userName && (
              <div className="absolute right-0 top-full pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100]">
                <div className="w-[240px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-[#f9f4ec] flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-[#b22830]" />
                    <span className="text-[14px] font-bold text-[#b22830]">Xin chào, {userName}</span>
                  </div>
                  <button onClick={onOpenProfile} className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-[#fcf8f2] hover:text-[#b22830] transition-colors flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    {t('header.profile')}
                  </button>
                  <button onClick={onOpenOrderHistory} className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-[#fcf8f2] hover:text-[#b22830] transition-colors flex items-center gap-2 border-b border-gray-100">
                    <ClipboardDocumentListIcon className="w-4 h-4" />
                    {t('header.orders')}
                  </button>
                  <button onClick={onLogout} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                    {t('header.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onOpenCart}
            className="flex items-center gap-3 px-4 py-1.5 border border-[#b22830] rounded-md hover:bg-red-50 transition-colors bg-white h-[38px] cursor-pointer"
          >
            <ShoppingCartIcon className="w-5 h-5 text-[#b22830]" />
            <span className="text-[14px] font-bold text-[#333333] mr-1">{t('header.cart')}</span>
            <span className="bg-[#f3f4f6] text-[#b22830] text-[13px] font-bold px-2 py-0.5 rounded-[4px] min-w-[24px] text-center border border-gray-200">
              {cartCount}
            </span>
          </button>
        </div>
      </header>

      {/* FULL WIDTH RED BAR */}
      <div className="w-full h-[50px] bg-[#b22830] relative z-20">
        <div className="mx-auto flex h-full w-full max-w-[1440px] px-4 lg:px-8 items-center gap-8">
          {/* Categories Header in Red Bar (Static) */}
          <div className="hidden lg:flex h-full w-[260px] shrink-0 items-center bg-[#f9f9f9] px-6 select-none relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-[#b22830]"></div>
            <div className="w-5 flex flex-col gap-[3px] mr-3">
              <span className="w-full h-[2px] bg-[#b22830] block"></span>
              <span className="w-full h-[2px] bg-[#b22830] block"></span>
              <span className="w-full h-[2px] bg-[#b22830] block"></span>
            </div>
            <span className="text-[15px] font-normal text-[#b22830] capitalize">Danh mục sản phẩm</span>
          </div>

          <button type="button" onClick={() => onNavigate?.('chinh-sach-dat-hang')} className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer">
            <img src="/hc-assets/icon_chinhsach.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-[13px] font-medium">{t('order.returnPolicy')}</span>
          </button>
          <button type="button" onClick={() => onNavigate?.('lien-he')} className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer">
            <img src="/hc-assets/icon_lienhe.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-[13px] font-medium">{t('order.contact')}</span>
          </button>
          <a href="#" className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
            <img src="/hc-assets/icon_bank.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-[13px] font-medium">Bankrista Thịnh Vượng</span>
          </a>
        </div>
      </div>

      {/* ── MAIN LAYOUT (Full Width) ── */}
      <div className="flex w-full mx-auto max-w-[1440px] px-4 lg:px-8 relative bg-white pb-10 pt-0">
        
        {/* ── MAIN CONTENT (Banner + Products) ── */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          
          {/* Content Area */}
          <div className="w-full bg-white">
            {children ? (
              <div className="w-full pt-6">
                {children}
              </div>
            ) : (
              <>
                {/* Hero Banner & Category Menu Area (Desktop Only) */}
                <div className="w-full mb-10 flex flex-col lg:flex-row items-stretch gap-8">
                  
                  {/* LEFT SIDEBAR (Category Menu Desktop) */}
                  <div className="hidden lg:flex flex-col w-[260px] flex-shrink-0 z-10 bg-white shadow-sm border-l border-r border-b border-gray-100 pb-2">
                    <ul className="w-full flex flex-col flex-1 overflow-y-auto no-scrollbar">
                      {categoryMenuItems}
                    </ul>
                  </div>

                  {/* HERO BANNER */}
                  <div className="flex-1 min-w-0 flex pt-4 lg:pt-0">
                    <BannerSlider />
                  </div>
                </div>

                {/* Categorized Vouchers Section */}
                <div className="mb-10 w-full flex flex-col gap-6">
                  {/* Section 1: Personal Vouchers */}
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🎁</span>
                        <h3 className="text-[16px] font-bold text-gray-900">Voucher Cá Nhân Dành Cho Bạn</h3>
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200">
                          {personalVouchers.length} mã độc quyền
                        </span>
                      </div>
                    </div>

                    {personalVouchers.length > 0 ? (
                      <div className="flex overflow-x-auto gap-4 pb-2 custom-scrollbar">
                        {personalVouchers.map((v) => renderVoucherCard(v, true))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 text-lg font-bold">
                            🎁
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-gray-800">Bạn chưa có voucher cá nhân nào trong kho quà</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">Thử vận may tại Vòng quay may mắn hoặc cập nhật sinh nhật để nhận ngay voucher độc quyền!</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => onNavigate?.('lucky-wheel')}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[12px] font-bold rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer"
                        >
                          🎲 Săn quà ngay
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Public Storewide Promotions */}
                  {publicVouchers.length > 0 && (
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📢</span>
                          <h3 className="text-[16px] font-bold text-gray-900">Chương Trình Khuyến Mãi Chung</h3>
                          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {publicVouchers.length} ưu đãi chung
                          </span>
                        </div>
                      </div>

                      <div className="flex overflow-x-auto gap-4 pb-2 custom-scrollbar">
                        {publicVouchers.map((v) => renderVoucherCard(v, false))}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI TOP 3 RECOMMENDED PRODUCTS UNDER VOUCHER */}
                {aiRecommendedProducts && aiRecommendedProducts.length > 0 && (
                  <div className="mb-10 w-full">
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
            {/* Right Column: Products List & Category Details */}
            <div className="flex-1 min-w-0">

                    {/* Product Grids */}
                    <div className="space-y-12">
                      {menuSections.map((section, idx) => {
                          const allItems = section.subSections.flatMap(sub => sub.items);
                          const sortedItems = [...allItems].sort((a, b) => {
                            if (sortByOrder === 'price-asc') return Number(a.gia_ban || 0) - Number(b.gia_ban || 0);
                            if (sortByOrder === 'price-desc') return Number(b.gia_ban || 0) - Number(a.gia_ban || 0);
                            if (sortByOrder === 'name-asc') return String(a.ten_san_pham || '').localeCompare(String(b.ten_san_pham || ''), 'vi');
                            return 0;
                          });
                          const displayItems = sortedItems;
                          const hasMore = false;
                          const parentCatIndex = parentCats.findIndex(c => String(c.ma_danh_muc) === String(section.id));
                          const sectionIconUrl = parentCatIndex !== -1 ? MENU_ICONS[parentCatIndex % MENU_ICONS.length] : MENU_ICONS[idx % MENU_ICONS.length];

                          return (
                            <section key={section.id} id={`category-${section.id}`} className="scroll-mt-[120px]">
                              <div className="flex items-center mb-6">
                                <div className="flex items-center gap-2">
                                  <img src={sectionIconUrl} className="w-8 h-8 object-contain" alt="" />
                                  <h3 className="text-2xl md:text-[28px] font-black text-[#333333] uppercase font-sans tracking-wide">
                                    {section.label}
                                  </h3>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-10">
                                {displayItems.map((p) => {
                                  // Custom Product Card styling for Order page
                                  return (
                                    <div key={p.ma_san_pham} className="bg-white rounded-none border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group relative flex flex-col hover:-translate-y-1">
                                      <div className="relative aspect-square overflow-hidden bg-white cursor-pointer" onClick={() => (onOpenProductPage ? onOpenProductPage(p) : onViewDetail?.(p))}>
                                        <img src={p.hinh_anh_url} alt={p.ten_san_pham} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        
                                        {/* Magnifying Glass Hover Effect */}
                                        <button 
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setQuickViewProduct(p);
                                          }}
                                          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 hover:bg-gray-50"
                                        >
                                          <MagnifyingGlassIcon className="w-4 h-4 text-gray-800 font-bold" style={{ strokeWidth: 2.5 }} />
                                        </button>

                                        {/* Badges */}
                                        {p.la_hot && (
                                          <div className="absolute bottom-0 left-0 bg-[#f37021] text-white text-[11px] font-black uppercase px-2 py-1.5 z-10 max-w-[80px] text-left leading-tight">
                                            MÓN MỚI<br/>THỬ NGAY!
                                          </div>
                                        )}
                                        {!p.la_hot && p.la_moi && (
                                          <div className="absolute bottom-0 left-0 bg-[#00a651] text-white text-[11px] font-black uppercase px-2 py-1.5 z-10 max-w-[80px] text-left leading-tight">
                                            {t('home.tryNow')}
                                          </div>
                                        )}
                                        {p.dang_giam_gia && (
                                          <div className="absolute top-2 left-2 w-10 h-10 rounded-full bg-[#b22830] text-white flex items-center justify-center text-[12px] font-bold z-10">
                                            -{Math.round((1 - p.gia_ban / p.gia_niem_yet) * 100)}%
                                          </div>
                                        )}
                                      </div>

                                      <div className="p-5 flex flex-col flex-1">
                                        <p className="text-[11px] text-gray-400 uppercase font-black tracking-wider mb-2">Highlands Coffee</p>
                                        <h4 className="text-[16px] font-bold text-[#333333] mb-3 leading-tight cursor-pointer hover:text-[#b22830]" onClick={() => onViewDetail?.(p)}>
                                          {p.ten_san_pham}
                                        </h4>
                                        <div className="mt-auto flex items-end justify-between">
                                          <div className="flex flex-col">
                                            <span className="text-[16px] font-bold text-[#ed1b2f]">
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
                                            className="w-8 h-8 rounded-full bg-[#ed1b2f] text-white flex items-center justify-center hover:bg-[#c41230] hover:scale-110 transition-all shadow-sm"
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
                                    className="px-6 py-2 border border-[#b22830] text-[#b22830] text-[14px] font-medium rounded-full hover:bg-[#b22830] hover:text-white transition-colors bg-white flex items-center gap-1"
                                  >
                                    Xem tất cả <span className="text-[12px] font-bold mt-[2px]">&gt;</span>
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

      {/* Quick View Modal */}
      {quickViewProduct && (
        <QuickViewModal 
          product={quickViewProduct} 
          onClose={() => setQuickViewProduct(null)} 
          onAddToCart={onQuickAdd} 
        />
      )}
    </div>
  );
}
