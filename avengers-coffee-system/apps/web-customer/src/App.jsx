import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Header from './components/Header';
import Footer from './components/Footer';
import OrderFooter from './components/OrderFooter';
import ProductCard from './components/ProductCard';
import LoginPage from './pages/Login';
import ProductDetailModal from './components/ProductDetailModal';
import CartPage from './pages/Cart';
import FavoriteDrawer from './components/FavoriteDrawer';
import OrderHistoryModal from './components/OrderHistoryModal';
import ChatWidget from './components/ChatWidget';
import Home from './pages/Home';
import About from './pages/About';
import Support from './pages/Support';
import StoresPage from './pages/Stores';
import NewsPage from './pages/News';
import NewsDetailPage from './pages/NewsDetailPage';
import OrderPage from './pages/Order';
import ProductDetailPage from './pages/ProductDetail';
import ProfilePageContent from './components/ProfilePageContent';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ChinhSachDatHangPage from './pages/ChinhSachDatHang';
import LienHePage from './pages/LienHe';
import MenuIntroPage from './pages/MenuIntro';
import CareersPage from './pages/Careers';
import MembershipPage from './pages/Membership';
import LuckyWheelPage from './pages/LuckyWheel';
import { CartProvider, useCart } from './context/CartContext'; // File mới bước 2
import { apiClient } from './lib/apiClient';
import { queryKeys } from './lib/queryKeys';
import SurveyPopup from './components/SurveyPopup';
import SurveyPage from './pages/Survey';
import { normalizeNewsArticle } from './lib/news';
import { buildAddressOptionsFromBranches, getAddressSelectionDefaults, normalizeAddressSelection } from './lib/addressOptions';
import { UserCircleIcon, KeyIcon, MapPinIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const FALLBACK_BANNER_URL = '/hc-assets/HCO_7825_AME__SUMMERDI_DC_BANNER_1920x926.jpg';

// Exact same banners from Highlands Coffee HTML file
const HC_BANNER_SLIDES = [
  '/hc-assets/HCO_7825_SUMMERDI_GAME___DC_BANNER_1920x926.jpg',
  '/hc-assets/HCO_7824_1000_STORE_DC_MWB.jpg',
  '/hc-assets/HCO_7825_SUMMERDI_DC_BANNER_1920x926.jpg',
  '/hc-assets/HCO_7825_AME__SUMMERDI_DC_BANNER_1920x926.jpg',
  '/hc-assets/HCO_7801_MISMATCHES_DISCOUNT_FA_MWB_1920x926_1.png',
  '/hc-assets/HCO_7820_MATCHA_LAUNCH_DC_MWB_1920X926.jpg',
];

// Highlands Coffee section images (from local _files folder)
const HC_IMG = {
  appPromo: '/hc-assets/Website_bannerr.png',
  dongHanh1: '/hc-assets/WEB_Banner_2.png',
  dongHanh2: '/hc-assets/505392773_1120548066764868_2724070916068790506_n.jpg',
  dongHanh3: '/hc-assets/WEB_Banner_1.png',
  nuocNgon: '/hc-assets/web_banner_2000x2000.jpg',
  banhNgon: '/hc-assets/2.png',
  cuaHang: '/hc-assets/1_1.jpg',
  ftLogo: '/hc-assets/ftlogo.png',
  logo: '/hc-assets/red_BG_logo800.png',
  social: ['/hc-assets/isoc1.png', '/hc-assets/isoc2.png', '/hc-assets/isoc3.png', '/hc-assets/isoc4.png'],
};

const ICON_MAP = {
  'Cà phê': '☕',
  Trà: '🍃',
  'Đồ ăn': '🍕',
  Bánh: '🍰',
  Khác: '✨',
  default: '🥤',
};

const SUBCATEGORY_ORDER = {
  coffee: ['Espresso', 'Americano', 'Latte', 'Frappe - Frappe', '"Phin" Việt Nam', 'Cold Brew', 'Cà phê khác'],
  tea: ['Matcha Tây Bắc', 'Matcha Kyoto', 'Trà trái cây', 'Trà sữa', 'Chocolate', 'Trà khác'],
  food: ['Bánh ngọt', 'Bánh mặn', 'Pasta', 'Pizza', 'Salad', 'Món ăn khác'],
  other: ['Merchandise', 'Sản phẩm khác'],
};

function formatNewsCategoryLabel(category) {
  const normalized = String(category || '').trim().toUpperCase();
  if (!normalized) return 'Blog';
  if (normalized === 'COFFEEHOLIC') return 'Coffeeholic';
  if (normalized === 'TEAHOLIC') return 'Teaholic';
  if (normalized === 'BLOG') return 'Blog';
  return normalized
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}


const CONTACT_INFO = {
  office: 'Tầng 6, Tòa nhà Avengers, Số 315 Trường Chinh, P. Khương Mai, Q. Thanh Xuân, TP Hà Nội, Việt Nam',
  hotline: '1800 6936',
  email: 'support@avengerscoffee.vn',
  heroImage: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1800&q=80',
  storeImage: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
};

const DEFAULT_ADDRESS_FORM = {
  tenDiaChi: '',
  city: '',
  district: '',
  ward: '',
  street: '',
  ghiChu: '',
};

function taoDiaChiDayDu(addressForm) {
  const parts = [addressForm.street, addressForm.ward, addressForm.district, addressForm.city]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function formatVoucherDate(value) {
  if (!value) return 'Không giới hạn';
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatVoucherValue(voucher) {
  const type = String(voucher?.loai_khuyen_mai || '').toUpperCase();
  const value = Number(voucher?.gia_tri || 0);

  if (type === 'PERCENT') {
    const cap = Number(voucher?.giam_toi_da || 0);
    if (cap > 0) {
      return `Giam ${value}% (toi da ${cap.toLocaleString('vi-VN')}d)`;
    }
    return `Giam ${value}%`;
  }

  if (type === 'FIXED') {
    return `Giam ${value.toLocaleString('vi-VN')}d`;
  }

  if (type === 'FREE_ITEM') {
    return voucher?.ten_san_pham_tang ? `Tang ${voucher.ten_san_pham_tang}` : 'Qua tang mien phi';
  }

  return 'Uu dai dac biet';
}

function getVoucherTypeMeta(type) {
  const normalized = String(type || '').toUpperCase();
  if (normalized === 'PERCENT') {
    return { label: 'Giam %', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (normalized === 'FIXED') {
    return { label: 'Giam tien', className: 'bg-sky-50 text-sky-700 border-sky-200' };
  }
  if (normalized === 'FREE_ITEM') {
    return { label: 'Tang kem', className: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' };
  }
  return { label: 'Uu dai', className: 'bg-gray-100 text-gray-700 border-gray-200' };
}

function tachDiaChiDayDu(rawAddress) {
  const raw = String(rawAddress || '').trim();
  if (!raw) {
    return {
      city: '',
      district: '',
      ward: '',
      street: '',
    };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const city = parts[parts.length - 1] || '';
  const district = parts[parts.length - 2] || '';
  const ward = parts[parts.length - 3] || '';
  const street = parts.slice(0, Math.max(parts.length - 3, 0)).join(', ');

  return { city, district, ward, street: street || raw };
}

function normalizeLocationText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityName(value) {
  const original = String(value || '').trim();
  const normalized = normalizeLocationText(original);

  if (!normalized) return 'Hồ Chí Minh';
  if (normalized.includes('ho chi minh') || normalized.includes('tp hcm') || normalized === 'hcm') return 'Hồ Chí Minh';
  if (normalized.includes('ha noi') || normalized === 'hn') return 'Hà Nội';
  if (normalized.includes('da nang')) return 'Đà Nẵng';
  if (normalized.includes('can tho')) return 'Cần Thơ';
  if (normalized.includes('hai phong')) return 'Hải Phòng';

  return original;
}

function inferCityFromAddress(address) {
  const normalized = normalizeLocationText(address);
  if (!normalized) return '';
  if (normalized.includes('ho chi minh') || normalized.includes('tp hcm') || normalized.includes('tphcm')) return 'Hồ Chí Minh';
  if (normalized.includes('ha noi')) return 'Hà Nội';
  if (normalized.includes('da nang')) return 'Đà Nẵng';
  if (normalized.includes('can tho')) return 'Cần Thơ';
  if (normalized.includes('hai phong')) return 'Hải Phòng';
  return '';
}

function normalizeBranchStore(branch, index) {
  const openTime = String(branch?.gio_mo_cua || '').trim();
  const closeTime = String(branch?.gio_dong_cua || '').trim();
  const fallbackHours = openTime || closeTime ? `${openTime || '--:--'} - ${closeTime || '--:--'}` : '07:00 - 22:00';
  const city = normalizeCityName(branch?.thanh_pho || inferCityFromAddress(branch?.dia_chi));

  return {
    id: String(branch?.ma_chi_nhanh || `branch-${index + 1}`),
    code: String(branch?.ma_chi_nhanh || `branch-${index + 1}`),
    city,
    district: String(branch?.quan_huyen || '').trim() || 'Chưa phân loại',
    name: String(branch?.ten_chi_nhanh || '').trim() || `Chi nhánh ${index + 1}`,
    address: String(branch?.dia_chi || '').trim() || 'Đang cập nhật địa chỉ',
    hours: fallbackHours,
    image: String(branch?.hinh_anh_url || '').trim() || FALLBACK_BANNER_URL,
    mapUrl: String(branch?.map_url || '').trim() || '',
  };
}

function buildMapSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address || ''))}`;
}

function buildMapEmbedUrl(address) {
  return `https://www.google.com/maps?q=${encodeURIComponent(String(address || ''))}&output=embed`;
}

function getCarouselItemsPerPage() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth <= 520) return 1;
  if (window.innerWidth <= 768) return 2;
  return 3;
}

function normalizeMenuText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchSubCategoryByRules(name, rules, fallbackLabel) {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      return rule.label;
    }
  }
  return fallbackLabel;
}

function inferSubCategoryLabel(categoryLabel, productName) {
  const category = normalizeMenuText(categoryLabel);
  const name = normalizeMenuText(productName);

  if (category.includes('ca phe') || category.includes('coffee')) {
    return matchSubCategoryByRules(name, [
      { label: 'Espresso', patterns: [/espresso/] },
      { label: 'Americano', patterns: [/americano/, /a-me/, /\bame\b/] },
      { label: 'Latte', patterns: [/latte/, /macchiato/, /cappuccino/] },
      { label: 'Frappe - Frappe', patterns: [/frappe/, /freeze/] },
      { label: '"Phin" Việt Nam', patterns: [/bac xiu/, /ca phe sua/, /ca phe den/, /phin/] },
      { label: 'Cold Brew', patterns: [/cold brew/] },
    ], 'Cà phê khác');
  }

  if (category.includes('tra') || category.includes('tea')) {
    return matchSubCategoryByRules(name, [
      { label: 'Matcha Kyoto', patterns: [/matcha kyoto/] },
      { label: 'Matcha Tây Bắc', patterns: [/matcha/, /sen vang/] },
      { label: 'Trà trái cây', patterns: [/tra dao/, /tra vai/, /tra oi/, /tra trai cay/, /hitea/, /tra phuc kien/] },
      { label: 'Trà sữa', patterns: [/tra sua/, /oolong/, /milk tea/, /macchiato/] },
      { label: 'Chocolate', patterns: [/chocolate/, /cacao/] },
    ], 'Trà khác');
  }

  if (category.includes('do an') || category.includes('banh') || category.includes('food')) {
    return matchSubCategoryByRules(name, [
      { label: 'Bánh ngọt', patterns: [/mochi/, /cake/, /banh ngot/] },
      { label: 'Bánh mặn', patterns: [/croissant/, /banh man/] },
      { label: 'Pasta', patterns: [/pasta/, /spaghetti/] },
      { label: 'Pizza', patterns: [/pizza/] },
      { label: 'Salad', patterns: [/salad/] },
    ], 'Món ăn khác');
  }

  if (category.includes('khac') || category.includes('other')) {
    return 'Merchandise';
  }

  return 'Sản phẩm khác';
}

function HorizontalProductCarousel({
  items,
  onSelect,
  cardClassName,
  imageClassName,
  compact = false,
}) {
  const [itemsPerPage, setItemsPerPage] = useState(getCarouselItemsPerPage());
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    const onResize = () => setItemsPerPage(getCarouselItemsPerPage());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const visibleItems = useMemo(() => {
    const start = pageIndex * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, itemsPerPage, pageIndex]);

  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
        className="tch-hscroll-arrow left-2"
        aria-label="Xem sản phẩm trước"
        disabled={!canGoPrev}
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <div className="rounded-2xl bg-white/70 p-3">
        <div
          className="tch-hscroll-track"
          style={{ '--carousel-columns': itemsPerPage }}
        >
          {visibleItems.map((p) => (
            <div key={`carousel-${pageIndex}-${p.ma_san_pham}`} className="tch-hscroll-item">
              <button
                type="button"
                onClick={() => onSelect(p)}
                className={`${cardClassName} w-full`}
              >
                <img src={p.hinh_anh_url} alt={p.ten_san_pham} className={imageClassName} />
                <div className="min-w-0 text-left">
                  <p className={`truncate font-black text-gray-900 ${compact ? 'text-sm' : 'mt-4 text-lg'}`}>{p.ten_san_pham}</p>
                  <p className={`font-black text-[#1a8b46] ${compact ? 'mt-1 text-xs' : 'mt-2 text-xl'}`}>
                    {Number(p.gia_ban).toLocaleString('vi-VN')} đ
                  </p>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
        className="tch-hscroll-arrow right-2"
        aria-label="Xem sản phẩm tiếp theo"
        disabled={!canGoNext}
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
      <div className="mt-3 flex justify-center gap-2">
        {Array.from({ length: totalPages }).map((_, idx) => (
          <button
            key={`dot-${idx}`}
            type="button"
            onClick={() => setPageIndex(idx)}
            className={`h-2.5 w-2.5 rounded-full ${idx === pageIndex ? 'bg-[#1a8b46]' : 'bg-gray-300'}`}
            aria-label={`Trang ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function HomeBannerSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = HC_BANNER_SLIDES;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [slides.length]);

  return (
    <div className="hc-banner-slider relative">
      <img
        src={slides[currentSlide]}
        alt={`Banner ${currentSlide + 1}`}
        className="h-[520px] w-full object-cover hc-fade-in md:h-[650px] lg:h-[800px]"
        onError={(e) => {
          e.currentTarget.src = FALLBACK_BANNER_URL;
        }}
      />
      <div className="hc-banner-dots">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setCurrentSlide(idx)}
            className={`hc-banner-dot ${idx === currentSlide ? 'active' : ''}`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)}
        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2.5 text-gray-800 shadow-md transition-all hover:bg-white"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2.5 text-gray-800 shadow-md transition-all hover:bg-white"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'home';
  });
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [activeMainSectionId, setActiveMainSectionId] = useState('must-try');
  const [activeSubSectionId, setActiveSubSectionId] = useState('');
  const [newsCategory, setNewsCategory] = useState('ALL');
  const [selectedNewsArticleId, setSelectedNewsArticleId] = useState(null);
  const [storeCity, setStoreCity] = useState('ALL');
  const [storeDistrict, setStoreDistrict] = useState('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '' });


  const [user, setUser] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProductForPage, setSelectedProductForPage] = useState(null);
  const handleOpenProductPage = (product) => {
    setSelectedProductForPage(product);
    setActiveTab('product-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false); // Quản lý đóng mở Giỏ hàng
  const [isFavoriteOpen, setIsFavoriteOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [surveyOrderId, setSurveyOrderId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [priceFilter, setPriceFilter] = useState('ALL');
  const [criteriaFilter, setCriteriaFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DEFAULT');
  const [notificationToast, setNotificationToast] = useState(null);
  const [showBirthdayVoucherModal, setShowBirthdayVoucherModal] = useState(false);
  const [showLinkOrderPrompt, setShowLinkOrderPrompt] = useState(false);
  const [linkOrderCount, setLinkOrderCount] = useState(0);
  const [linkOrderPayload, setLinkOrderPayload] = useState(null);
  const [isLinkingOrders, setIsLinkingOrders] = useState(false);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('ALL');
  const [copiedVoucherCode, setCopiedVoucherCode] = useState('');
  const categorySectionRefs = useRef({});
  const subSectionRefs = useRef({});
  const topTabsScrollRef = useRef(null);
  const topTabsTrackRef = useRef(null);
  const topTabRefs = useRef({});
  const [activeTabUnderlineStyle, setActiveTabUnderlineStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const queryClient = useQueryClient();
  const { addToCart, cartCount, syncCartWithUser } = useCart();
  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const isLoggedIn = !!userId;
  const aiTargetUserId = userId || 'anon-popular';
  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';

  // ── Navigate from sub-pages via custom event ────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tab = e?.detail?.tab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('navigate-tab', handler);
    return () => window.removeEventListener('navigate-tab', handler);
  }, []);



  // ── AI Recommendations ──────────────────────────────────────────────────────
  const {
    data: aiRecsData,
    isLoading: isAiRecsLoading,
  } = useQuery({
    queryKey: ['ai', 'recommend', aiTargetUserId],
    queryFn: async () => {
      const res = await apiClient.get(`/ai/recommend/${encodeURIComponent(aiTargetUserId)}?limit=3`);
      return res.data;
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  const { data: behaviorInsightsData } = useQuery({
    queryKey: ['ai', 'behavior-insights', 'customer-sync', 30],
    queryFn: async () => {
      const res = await apiClient.get('/ai/behavior/insights?branch_code=ALL&limit=5&days=30');
      return res.data;
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 45 * 1000,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  const {
    data: favoritePayload,
  } = useQuery({
    queryKey: ['customer-favorites', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/favorites`);
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 20 * 1000,
    refetchInterval: 120 * 1000,
  });

  const favoriteItems = favoritePayload?.items || [];
  const favoriteProductSet = useMemo(
    () => new Set(favoriteItems.map((item) => String(item.ma_san_pham))),
    [favoriteItems],
  );

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (product) => {
      if (!userId) {
        throw new Error('NOT_AUTHENTICATED');
      }
      const payload = {
        ma_san_pham: product.ma_san_pham,
        ten_san_pham: product.ten_san_pham,
        gia_ban: product.gia_ban,
        hinh_anh_url: product.hinh_anh_url,
        danh_muc: product?.danhMuc?.ten_danh_muc || 'Khac',
      };
      const response = await apiClient.post(`/customers/${userId}/favorites/toggle`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-favorites', userId] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'recommend', aiTargetUserId] });
      apiClient.post('/ai/recommend/train').catch(() => undefined);
    },
  });

  const mapBranchName = (branchCode) => {
    if (!branchCode) return '';
    const normalizedCode = String(branchCode).toUpperCase();
    const matched = (publicBranchPayload?.items || []).find(
      (branch) => String(branch?.ma_chi_nhanh || '').toUpperCase() === normalizedCode,
    );
    return matched?.ten_chi_nhanh || String(branchCode);
  };

  const resolveBranchNameFromNotification = async (notification) => {
    const payload = notification?.du_lieu || {};
    const branchFromPayload = payload.co_so_ma || payload.branch_code || payload.coSoMa;
    if (branchFromPayload) {
      return mapBranchName(branchFromPayload);
    }

    const orderId = payload.ma_don_hang;
    if (!orderId || !userId) {
      return '';
    }

    try {
      const response = await apiClient.get(`/customers/${userId}/orders?q=${encodeURIComponent(orderId)}`);
      const orders = response?.data?.orders || [];
      const matchedOrder = orders.find((order) => order?.ma_don_hang === orderId) || orders[0];
      return mapBranchName(matchedOrder?.co_so_ma);
    } catch {
      return '';
    }
  };

  const {
    data: products = [],
    isLoading: isProductsLoading,
    isError: isProductsError,
  } = useQuery({
    queryKey: queryKeys.menuProducts,
    queryFn: async () => {
      const response = await apiClient.get('/menu/san-pham');
      const rows = response.data || [];
      return rows.map((item) => {
        const basePrice = Number(item?.gia_ban || 0);
        const listedPrice = Number(item?.gia_niem_yet || 0);
        const hasDiscount = listedPrice > basePrice;
        return {
          ...item,
          gia_ban: basePrice,
          gia_niem_yet: hasDiscount ? listedPrice : null,
          dang_giam_gia: hasDiscount,
          la_hot: Boolean(item?.la_hot),
          la_moi: Boolean(item?.la_moi),
        };
      });
    },
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
  });

  // ── Sync activeTab and selectedProductForPage to URL Query Params ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentTab = params.get('tab') || 'home';
    const currentProdId = params.get('productId') || '';

    const targetProdId = activeTab === 'product-detail' && selectedProductForPage
      ? String(selectedProductForPage.ma_san_pham || selectedProductForPage.id || selectedProductForPage.maSanPham)
      : '';

    if (currentTab !== activeTab || currentProdId !== targetProdId) {
      params.set('tab', activeTab);
      if (targetProdId) {
        params.set('productId', targetProdId);
      } else {
        params.delete('productId');
      }
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({ tab: activeTab, productId: targetProdId }, '', newUrl);
    }
  }, [activeTab, selectedProductForPage]);

  // ── Sync browser Back/Forward (popstate) to React State ──
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'home';
      setActiveTab(tab);
      const prodId = params.get('productId');
      if (prodId && products && products.length > 0) {
        const prod = products.find(p => String(p.ma_san_pham || p.id || p.maSanPham) === prodId);
        if (prod) setSelectedProductForPage(prod);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [products]);

  // ── Resolve product details on reload if page starts at product-detail tab ──
  useEffect(() => {
    if (activeTab === 'product-detail' && !selectedProductForPage && products.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const prodId = params.get('productId');
      if (prodId) {
        const prod = products.find(p => String(p.ma_san_pham || p.id || p.maSanPham) === prodId);
        if (prod) {
          setSelectedProductForPage(prod);
        } else {
          setActiveTab('order');
        }
      } else {
        setActiveTab('order');
      }
    }
  }, [products, activeTab, selectedProductForPage]);

  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
  } = useQuery({
    queryKey: queryKeys.menuCategories,
    queryFn: async () => {
      const response = await apiClient.get('/menu/danh-muc');
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const loading = isProductsLoading || isCategoriesLoading;
  const hasMenuError = isProductsError || isCategoriesError;

  const {
    data: notificationPayload,
  } = useQuery({
    queryKey: queryKeys.notificationsByUser(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/notifications?limit=15`);
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const notifications = notificationPayload?.items || [];
  const unreadNotificationCount = Number(notificationPayload?.unreadCount || 0);

  const {
    data: voucherPayload,
    isLoading: isVoucherLoading,
    isError: isVoucherError,
    error: voucherError,
  } = useQuery({
    queryKey: [...queryKeys.voucherList, userId || 'anonymous'],
    queryFn: async () => {
      const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
      const response = await apiClient.get(`/promotions/vouchers${query}`);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const voucherItems = voucherPayload?.items || [];

  const {
    data: publicBranchPayload,
    isLoading: isStoresLoading,
    isError: isStoresError,
    error: storesError,
  } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const storeLocations = useMemo(
    () => (publicBranchPayload?.items || []).map((branch, index) => normalizeBranchStore(branch, index)),
    [publicBranchPayload],
  );

  const addressOptions = useMemo(
    () => buildAddressOptionsFromBranches(publicBranchPayload?.items || []),
    [publicBranchPayload],
  );
  const defaultAddressSelection = useMemo(
    () => getAddressSelectionDefaults(addressOptions),
    [addressOptions],
  );

  const { data: newsPayload, isLoading: isNewsLoading } = useQuery({
    queryKey: ['news', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/news?limit=100');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
  });

  const newsArticles = useMemo(
    () => (newsPayload?.items || []).map((item) => normalizeNewsArticle(item)).filter(Boolean),
    [newsPayload],
  );
  const filteredVoucherItems = useMemo(() => {
    if (voucherTypeFilter === 'ALL') return voucherItems;
    return voucherItems.filter((item) => String(item.loai_khuyen_mai || '').toUpperCase() === voucherTypeFilter);
  }, [voucherItems, voucherTypeFilter]);
  // Clear user-specific React Query cache when logged out or session expires
  useEffect(() => {
    if (!user) {
      queryClient.removeQueries({ queryKey: ['users'] });
      queryClient.removeQueries({ queryKey: ['customer-favorites'] });
      queryClient.removeQueries({ queryKey: ['notifications'] });
      queryClient.removeQueries({ queryKey: ['orders'] });
      queryClient.removeQueries({ queryKey: ['vouchers'] });
      queryClient.removeQueries({ queryKey: ['cart'] });
      queryClient.removeQueries({ queryKey: ['reviews'] });
    }
  }, [user, queryClient]);

  const triggerSurveyCheck = async (orderId) => {
    try {
      if (userId) {
        const response = await apiClient.get(`/surveys/check-status?userId=${userId}`);
        if (response.data && !response.data.completed) {
          setSurveyOrderId(orderId);
          setIsSurveyOpen(true);
        }
      } else {
        setSurveyOrderId(orderId);
        setIsSurveyOpen(true);
      }
    } catch (err) {
      console.error('Error checking survey status:', err);
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }

    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener('auth:expired', handleAuthExpired);

    const handleCheckoutSuccess = (e) => {
      const orderId = e?.detail?.orderId || '';
      triggerSurveyCheck(orderId);
    };
    window.addEventListener('checkout-success', handleCheckoutSuccess);

    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const callbackOrderId = params.get('ma_don_hang') || '';
    if (paymentStatus === 'success') {
      alert('Thanh toán đơn hàng thành công. Cảm ơn bạn!');
      triggerSurveyCheck(callbackOrderId);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'failed') {
      alert('Thanh toán đơn hàng thất bại hoặc bị hủy.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
      window.removeEventListener('checkout-success', handleCheckoutSuccess);
    };
  }, [userId]);


  const showCartSuccessToast = (message) => {
    setNotificationToast({
      title: 'Giỏ hàng',
      message,
      branchName: '',
    });
  };

  const handleLoginSuccess = async (userData) => {
    const nextUser = {
      ...userData,
      avatar_url: userData?.avatar_url || null,
      avatarUrl: userData?.avatarUrl || userData?.avatar_url || null,
    };

    const previousUserId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
    const nextUserId = nextUser?.ma_nguoi_dung || nextUser?.maNguoiDung || null;

    if (previousUserId && previousUserId !== nextUserId) {
      queryClient.removeQueries({ queryKey: queryKeys.userProfile(previousUserId) });
      queryClient.removeQueries({ queryKey: queryKeys.userAddresses(previousUserId) });
      queryClient.removeQueries({ queryKey: queryKeys.loyaltyByUser(previousUserId) });
      queryClient.removeQueries({ queryKey: queryKeys.notificationsByUser(previousUserId) });
      queryClient.removeQueries({ queryKey: ['customer-favorites', previousUserId] });
    }

    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
    // token đã được lưu trong AuthModal — chỉ cần đảm bảo user object được lưu song song
    await syncCartWithUser(nextUser);

    if (userData?.nhanVoucherSinhNhat) {
      setShowBirthdayVoucherModal(true);
    }

    // Tự động / Chủ động liên kết đơn hàng khách vãng lai
    const gsid = localStorage.getItem('avengers_guest_session_id') || '';
    const userEmail = nextUser?.email || nextUser?.emailAddress || '';
    const userPhone = nextUser?.so_dien_thoai || nextUser?.phone || '';
    if (nextUserId && (gsid || userEmail || userPhone)) {
      apiClient.post(`/customers/${nextUserId}/orders/link-guest-orders`, {
        guest_session_id: gsid,
        email: userEmail,
        phone: userPhone,
      }).then((res) => {
        if (res.data?.autoLinked) {
          alert(`Đã tự động đồng bộ ${res.data.count} đơn hàng vãng lai gần đây của bạn vào tài khoản!`);
          localStorage.removeItem('avengers_guest_session_id');
          queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
        } else if (res.data?.promptLink) {
          setLinkOrderCount(res.data.count);
          setLinkOrderPayload({
            userId: nextUserId,
            email: userEmail,
            phone: userPhone,
            guest_session_id: gsid,
          });
          setShowLinkOrderPrompt(true);
        }
      }).catch((err) => {
        console.error('Lỗi khi liên kết đơn hàng guest:', err);
      });
    }
  };

  const handleLogout = async () => {
    if (userId) {
      queryClient.removeQueries({ queryKey: queryKeys.userProfile(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.userAddresses(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.loyaltyByUser(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.notificationsByUser(userId) });
      queryClient.removeQueries({ queryKey: ['customer-favorites', userId] });
      queryClient.removeQueries({ queryKey: queryKeys.membershipByUser(userId) });
    }
    // Xóa toàn bộ cache voucher (cả cá nhân lẫn anonymous) để buộc re-fetch
    queryClient.removeQueries({ queryKey: queryKeys.voucherList });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    await syncCartWithUser(null);
    // Sau khi user = null, query voucher sẽ re-fetch với anonymous (không có user_id)
    queryClient.invalidateQueries({ queryKey: queryKeys.voucherList });
    alert('Hẹn gặp lại bạn tại Avengers House! ☕');
  };

  const handleUserUpdated = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await apiClient.patch(`/customers/${userId}/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(userId) });
    },
  });

  useEffect(() => {
    const handleBirthdayVoucher = () => {
      setShowBirthdayVoucherModal(true);
    };
    window.addEventListener('birthday-voucher-received', handleBirthdayVoucher);
    return () => window.removeEventListener('birthday-voucher-received', handleBirthdayVoucher);
  }, []);

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch(`/customers/${userId}/notifications/read-all`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(userId) });
    },
  });

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const socket = io(`${socketUrl}/notifications`, {
      transports: ['websocket'],
      auth: { userId },
    });

    socket.emit('notifications:subscribe', { userId });

    socket.on('notification:new', async (notification) => {
      if (!notification?.id) {
        return;
      }

      const orderId = notification?.du_lieu?.ma_don_hang;
      const notificationType = String(notification?.loai || '').toUpperCase();

      if (notificationType === 'ORDER' || notificationType === 'PAYMENT' || orderId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
        if (orderId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.orderStatus(userId, orderId) });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(userId) });
      }

      if (notificationType === 'PAYMENT') {
        queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyByUser(userId) });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.voucherList, userId || 'anonymous'] });
      }

      if (notificationType === 'SYSTEM') {
        queryClient.invalidateQueries({ queryKey: queryKeys.menuProducts });
        queryClient.invalidateQueries({ queryKey: queryKeys.menuCategories });
        queryClient.invalidateQueries({ queryKey: ['news', 'all'] });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.voucherList, userId || 'anonymous'] });
      }

      queryClient.setQueryData(queryKeys.notificationsByUser(userId), (current) => {
        const currentItems = current?.items || [];
        if (currentItems.some((item) => item.id === notification.id)) {
          return current;
        }

        return {
          items: [notification, ...currentItems].slice(0, 15),
          unreadCount: Number(current?.unreadCount || 0) + (notification.da_doc ? 0 : 1),
        };
      });

      const branchName = await resolveBranchNameFromNotification(notification);
      setNotificationToast({
        title: notification.tieu_de,
        message: notification.noi_dung,
        branchName,
      });
    });

    socket.on('connect', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(userId) });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, socketUrl, userId]);

  useEffect(() => {
    if (!notificationToast) return;
    const timeout = setTimeout(() => setNotificationToast(null), 4500);
    return () => clearTimeout(timeout);
  }, [notificationToast]);

  useEffect(() => {
    if (!copiedVoucherCode) return;
    const timeout = setTimeout(() => setCopiedVoucherCode(''), 1600);
    return () => clearTimeout(timeout);
  }, [copiedVoucherCode]);

  const handleViewDetail = (product) => {
    setSelectedProduct(product);
    setIsDetailOpen(true);
  };

  const handleQuickAdd = (product) => {
    addToCart(user, product, 1, 'Nhỏ');
  };

  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCatId !== 'all') {
      const parsedCatId = String(selectedCatId).replace('group-', '');
      list = list.filter((p) => {
        const catId = String(p.danhMuc?.ma_danh_muc || '');
        if (catId === parsedCatId) return true;
        const cat = categories.find(c => String(c.ma_danh_muc) === catId);
        if (cat && String(cat.ma_danh_muc_cha) === parsedCatId) return true;
        return false;
      });
    }

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      list = list.filter((p) => {
        const tenSanPham = String(p.ten_san_pham || '').toLowerCase();
        const tenDanhMuc = String(p.danhMuc?.ten_danh_muc || '').toLowerCase();
        const moTaSanPham = String(p.mo_ta || '').toLowerCase();
        const isPromo = Number(p.gia_niem_yet || 0) > Number(p.gia_ban || 0);
        const promoHit = isPromo && /khuyen mai|khuyến mãi|giam gia|giảm giá|sale/.test(keyword);
        const hotHit = Boolean(p.la_hot) && /hot|ban chay|bán chạy/.test(keyword);
        const newHit = Boolean(p.la_moi) && /moi|mới|new/.test(keyword);
        return tenSanPham.includes(keyword) || tenDanhMuc.includes(keyword) || moTaSanPham.includes(keyword) || promoHit || hotHit || newHit;
      });
    }

    if (availabilityFilter === 'AVAILABLE') {
      list = list.filter((p) => Boolean(p.trang_thai));
    } else if (availabilityFilter === 'OUT_OF_STOCK') {
      list = list.filter((p) => !p.trang_thai);
    }

    if (priceFilter === 'DUOI_30000') {
      list = list.filter((p) => Number(p.gia_ban || 0) < 30000);
    } else if (priceFilter === 'TU_30000_DEN_50000') {
      list = list.filter((p) => Number(p.gia_ban || 0) >= 30000 && Number(p.gia_ban || 0) <= 50000);
    } else if (priceFilter === 'TREN_50000') {
      list = list.filter((p) => Number(p.gia_ban || 0) > 50000);
    }

    if (criteriaFilter === 'PROMO') {
      list = list.filter((p) => Number(p.gia_niem_yet || 0) > Number(p.gia_ban || 0));
    } else if (criteriaFilter === 'HOT') {
      list = list.filter((p) => Boolean(p.la_hot));
    } else if (criteriaFilter === 'NEW') {
      list = list.filter((p) => Boolean(p.la_moi));
    }

    if (sortBy === 'NAME_ASC') {
      list.sort((a, b) => String(a.ten_san_pham || '').localeCompare(String(b.ten_san_pham || ''), 'vi'));
    } else if (sortBy === 'NAME_DESC') {
      list.sort((a, b) => String(b.ten_san_pham || '').localeCompare(String(a.ten_san_pham || ''), 'vi'));
    } else if (sortBy === 'PRICE_ASC') {
      list.sort((a, b) => Number(a.gia_ban || 0) - Number(b.gia_ban || 0));
    } else if (sortBy === 'PRICE_DESC') {
      list.sort((a, b) => Number(b.gia_ban || 0) - Number(a.gia_ban || 0));
    }

    return list;
  }, [products, categories, selectedCatId, searchKeyword, availabilityFilter, priceFilter, criteriaFilter, sortBy]);

  const menuSections = useMemo(() => {
    const hasAdvancedFilters =
      availabilityFilter !== 'ALL' ||
      priceFilter !== 'ALL' ||
      criteriaFilter !== 'ALL' ||
      Boolean(searchKeyword.trim());

    const mustTryProducts = filteredProducts
      .filter((p) => Boolean(p.la_hot) || Boolean(p.la_moi) || Number(p.gia_niem_yet || 0) > Number(p.gia_ban || 0))
      .slice(0, 8);

    const sections = [];
    if (!hasAdvancedFilters && mustTryProducts.length > 0) {
      sections.push({
        id: 'must-try',
        label: 'Must Try',
        icon: '🔥',
        subSections: [
          {
            id: 'must-try__today-special',
            label: 'Today Special',
            items: mustTryProducts,
          },
        ],
      });
    }

    const groupedByCategory = categories
      .map((cat) => {
        const categoryProducts = filteredProducts.filter(
          (p) => String(p.danhMuc?.ma_danh_muc || '') === String(cat.ma_danh_muc),
        );

        if (!categoryProducts.length) {
          return null;
        }

        const subMap = new Map();
        categoryProducts.forEach((item) => {
          const label = inferSubCategoryLabel(cat.ten_danh_muc, item.ten_san_pham);
          if (!subMap.has(label)) {
            subMap.set(label, []);
          }
          subMap.get(label).push(item);
        });

        const subSections = Array.from(subMap.entries()).map(([label, items]) => ({
          id: `${cat.ma_danh_muc}__${normalizeMenuText(label).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section'}`,
          label,
          items,
        }));

        const categoryKey = normalizeMenuText(cat.ten_danh_muc).includes('tra')
          ? 'tea'
          : normalizeMenuText(cat.ten_danh_muc).includes('ca phe')
            ? 'coffee'
            : normalizeMenuText(cat.ten_danh_muc).includes('do an') || normalizeMenuText(cat.ten_danh_muc).includes('banh')
              ? 'food'
              : 'other';

        const orderedLabels = SUBCATEGORY_ORDER[categoryKey] || [];
        const orderedSubSections = [...subSections].sort((a, b) => {
          const aIdx = orderedLabels.indexOf(a.label);
          const bIdx = orderedLabels.indexOf(b.label);
          if (aIdx === -1 && bIdx === -1) {
            return a.label.localeCompare(b.label, 'vi');
          }
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });

        return {
          id: String(cat.ma_danh_muc),
          label: cat.ten_danh_muc,
          icon: ICON_MAP[cat.ten_danh_muc] || ICON_MAP.default,
          subSections: orderedSubSections,
        };
      })
      .filter(Boolean);

    return [...sections, ...groupedByCategory];
  }, [
    availabilityFilter,
    categories,
    criteriaFilter,
    filteredProducts,
    priceFilter,
    searchKeyword,
  ]);

  const activeMainSection = useMemo(() => {
    return menuSections.find((section) => section.id === activeMainSectionId) || menuSections[0] || null;
  }, [activeMainSectionId, menuSections]);

  const aiRecommendedProducts = useMemo(() => {
    const items = aiRecsData?.items || [];
    if (!items.length) return [];

    return items.map((item) => {
      const fromMenu = products.find((p) => String(p.ma_san_pham) === String(item.id));
      if (fromMenu) return fromMenu;

      return {
        ma_san_pham: item.id,
        ten_san_pham: item.name,
        gia_ban: Number(item.price || 0),
        hinh_anh_url: item.image || '',
        trang_thai: true,
        danhMuc: { ten_danh_muc: item.category || 'Goi y AI' },
        mo_ta: item.reason || '',
      };
    }).slice(0, 3);
  }, [aiRecsData, products]);

  const syncedBehaviorTop3Products = useMemo(() => {
    const behaviorTopSource = behaviorInsightsData?.customer_sync_top_products?.length
      ? behaviorInsightsData.customer_sync_top_products
      : behaviorInsightsData?.top_products || [];
    const behaviorTop = behaviorTopSource.slice(0, 3);
    if (!behaviorTop.length) return [];

    return behaviorTop.map((item) => {
      const productId = String(item?.product_id || '');
      const fromMenu = products.find((p) => String(p.ma_san_pham) === productId);
      if (fromMenu) return fromMenu;

      return {
        ma_san_pham: productId || String(item?.product_name || 'behavior-item'),
        ten_san_pham: String(item?.product_name || 'San pham goi y'),
        gia_ban: 0,
        hinh_anh_url: '',
        trang_thai: true,
        danhMuc: { ten_danh_muc: 'Dong bo hanh vi' },
        mo_ta: 'Dong bo tu diem hanh vi tong hop (mua, danh gia, yeu thich, voucher) 30 ngay gan nhat.',
      };
    });
  }, [behaviorInsightsData, products]);

  const displayTop3Products = useMemo(
    () => (syncedBehaviorTop3Products.length ? syncedBehaviorTop3Products : aiRecommendedProducts),
    [syncedBehaviorTop3Products, aiRecommendedProducts],
  );

  const isFavoriteProduct = (product) => favoriteProductSet.has(String(product?.ma_san_pham || ''));

  const handleToggleFavorite = (product) => {
    if (!userId) {
      setIsAuthOpen(true);
      return;
    }
    toggleFavoriteMutation.mutate(product);
  };

  const handleOpenFavorites = () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    setIsFavoriteOpen(true);
  };

  const handleAddFavoriteToCart = async (item) => {
    try {
      await addToCart(user, item, 1, 'Nhỏ');
      setIsFavoriteOpen(false);
      setActiveTab('cart');
      showCartSuccessToast(`Đã thêm ${item?.ten_san_pham || 'sản phẩm'} vào giỏ hàng.`);
    } catch {
      showCartSuccessToast('Không thể thêm sản phẩm vào giỏ hàng. Vui lòng thử lại.');
    }
  };

  const handleAddAllFavoritesToCart = async () => {
    if (!favoriteItems.length) return;
    try {
      await Promise.all(favoriteItems.map((item) => addToCart(user, item, 1, 'Nhỏ')));
      setIsFavoriteOpen(false);
      setActiveTab('cart');
      showCartSuccessToast(`Đã thêm ${favoriteItems.length} sản phẩm yêu thích vào giỏ hàng.`);
    } catch {
      showCartSuccessToast('Đã có lỗi khi thêm tất cả sản phẩm vào giỏ hàng.');
    }
  };

  const xoaBoLocTimKiem = () => {
    setSearchKeyword('');
    setAvailabilityFilter('ALL');
    setPriceFilter('ALL');
    setCriteriaFilter('ALL');
    setSortBy('DEFAULT');
    setSelectedCatId('all');
  };

  const scrollToSection = (sectionId) => {
    const target = categorySectionRefs.current[sectionId];
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const scrollToSubSection = (subSectionId) => {
    const target = subSectionRefs.current[subSectionId];
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  useEffect(() => {
    if (!menuSections.length) return;

    const hasActiveMain = menuSections.some((section) => section.id === activeMainSectionId);
    const fallbackMain = selectedCatId !== 'all' ? String(selectedCatId) : menuSections[0].id;
    const resolvedMain = hasActiveMain ? activeMainSectionId : fallbackMain;

    if (!hasActiveMain) {
      setActiveMainSectionId(resolvedMain);
    }

    const currentMain = menuSections.find((section) => section.id === resolvedMain) || menuSections[0];
    if (!currentMain) return;

    const hasActiveSub = currentMain.subSections.some((sub) => sub.id === activeSubSectionId);
    if (!hasActiveSub && currentMain.subSections[0]) {
      setActiveSubSectionId(currentMain.subSections[0].id);
    }
  }, [activeMainSectionId, activeSubSectionId, menuSections, selectedCatId]);

  useEffect(() => {
    if (activeTab !== 'order' || !menuSections.length) return;

    const updateScrollSpy = () => {
      const anchorLine = 180;
      let currentMainId = menuSections[0].id;

      menuSections.forEach((section) => {
        const element = categorySectionRefs.current[section.id];
        if (!element) return;
        const top = element.getBoundingClientRect().top;
        if (top - anchorLine <= 0) {
          currentMainId = section.id;
        }
      });

      const currentMain = menuSections.find((section) => section.id === currentMainId) || menuSections[0];
      let currentSubId = currentMain?.subSections?.[0]?.id || '';

      (currentMain?.subSections || []).forEach((subSection) => {
        const subElement = subSectionRefs.current[subSection.id];
        if (!subElement) return;
        const top = subElement.getBoundingClientRect().top;
        if (top - anchorLine <= 0) {
          currentSubId = subSection.id;
        }
      });

      if (currentMainId !== activeMainSectionId) {
        setActiveMainSectionId(currentMainId);
      }

      if (currentSubId && currentSubId !== activeSubSectionId) {
        setActiveSubSectionId(currentSubId);
      }
    };

    updateScrollSpy();
    window.addEventListener('scroll', updateScrollSpy, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateScrollSpy);
    };
  }, [activeMainSectionId, activeSubSectionId, activeTab, menuSections]);

  useEffect(() => {
    const trackElement = topTabsTrackRef.current;
    const activeTabElement = topTabRefs.current[activeMainSectionId];
    if (!trackElement || !activeTabElement) {
      setActiveTabUnderlineStyle((prev) => ({ ...prev, opacity: 0 }));
      return;
    }

    const left = activeTabElement.offsetLeft;
    const width = activeTabElement.offsetWidth;
    setActiveTabUnderlineStyle({ left, width, opacity: 1 });

    const scrollContainer = topTabsScrollRef.current;
    if (scrollContainer) {
      const targetScrollLeft = left + width / 2 - scrollContainer.clientWidth / 2;
      scrollContainer.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth',
      });
    }
  }, [activeMainSectionId, menuSections]);

  useEffect(() => {
    const onResize = () => {
      const trackElement = topTabsTrackRef.current;
      const activeTabElement = topTabRefs.current[activeMainSectionId];
      if (!trackElement || !activeTabElement) return;
      setActiveTabUnderlineStyle({
        left: activeTabElement.offsetLeft,
        width: activeTabElement.offsetWidth,
        opacity: 1,
      });
    };

    window.addEventListener('resize', onResize);
  }, [activeMainSectionId]);

  const handleSubmitContact = (e) => {
    e.preventDefault();
    alert('Da ghi nhan thong tin lien he cua ban. Chung toi se phan hoi som nhat co the.');
    setContactForm({ name: '', email: '', phone: '', message: '' });
  };

  const handleCopyVoucherCode = async (code) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(String(code));
      setCopiedVoucherCode(String(code));
    } catch {
      setCopiedVoucherCode('');
      alert('Không thể sao chép mã, vui lòng thử lại.');
    }
  };

  const storeCities = useMemo(() => ['ALL', ...new Set(storeLocations.map((store) => store.city))], [storeLocations]);


  useEffect(() => {
    if (!storeCities.length) return;
    if (!storeCities.includes(storeCity)) {
      setStoreCity(storeCities[0]);
      setStoreDistrict('ALL');
    }
  }, [storeCities, storeCity]);

  const storeDistricts = useMemo(() => {
    const list = storeLocations
      .filter((store) => storeCity === 'ALL' || store.city === storeCity)
      .map((store) => store.district);
    return [...new Set(list)];
  }, [storeCity, storeLocations]);

  const filteredStores = useMemo(
    () =>
      storeLocations.filter(
        (store) =>
          (storeCity === 'ALL' || store.city === storeCity) &&
          (storeDistrict === 'ALL' || store.district === storeDistrict),
      ),
    [storeCity, storeDistrict, storeLocations],
  );
  const selectedStore = filteredStores.find((store) => store.id === selectedStoreId) || filteredStores[0] || null;

  useEffect(() => {
    if (!filteredStores.length) {
      if (selectedStoreId !== null) {
        setSelectedStoreId(null);
      }
      return;
    }

    const stillVisible = filteredStores.some((store) => store.id === selectedStoreId);
    if (!stillVisible) {
      setSelectedStoreId(filteredStores[0].id);
    }
  }, [filteredStores, selectedStoreId]);
  // ProfilePageContent has been moved to a separate file ./components/ProfilePageContent.jsx

  const featuredCarouselItems = useMemo(() => products.slice(0, 12), [products]);
  const orderCarouselItems = useMemo(() => filteredProducts.slice(0, 18), [filteredProducts]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {!['order', 'login', 'chinh-sach-dat-hang', 'lien-he', 'profile', 'cart', 'product-detail'].includes(activeTab) && (
        <Header
          userName={user ? user.ho_ten || user.hoTen || 'Đăng nhập' : 'Đăng nhập'}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchKeyword={searchKeyword}
          onSearchKeywordChange={setSearchKeyword}
          selectedCatId={selectedCatId}
          onSelectedCatIdChange={setSelectedCatId}
          categories={categories}
          availabilityFilter={availabilityFilter}
          onAvailabilityFilterChange={setAvailabilityFilter}
          priceFilter={priceFilter}
          onPriceFilterChange={setPriceFilter}
          criteriaFilter={criteriaFilter}
          onCriteriaFilterChange={setCriteriaFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filteredProducts.length}
          onResetSearchFilters={xoaBoLocTimKiem}
          onOpenAccount={() => setActiveTab('login')}
          onLogout={handleLogout}
          cartCount={cartCount}
          onOpenCart={() => {
            setIsFavoriteOpen(false);
            setActiveTab('cart');
          }} // BƯỚC 3: Mở Trang Giỏ hàng
          onOpenFavorites={handleOpenFavorites}
          favoriteCount={favoriteItems.length}
          onOpenOrderHistory={() => {
            if (!user) {
              setActiveTab('login');
              return;
            }
            setIsOrderHistoryOpen(true);
          }}
          onOpenProfile={() => {
            if (!user) {
              setActiveTab('login');
              return;
            }
            setActiveTab('profile');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          onReadNotification={(notificationId) => {
            if (!notificationId) return;
            markNotificationReadMutation.mutate(notificationId);
          }}
          onReadAllNotifications={() => {
            markAllNotificationsReadMutation.mutate();
          }}
        />
      )}

      <main className="flex-grow">
        {activeTab === 'home' ? (
          <Home
            setActiveTab={setActiveTab}
            HC_IMG={HC_IMG}
            HomeBannerSlider={HomeBannerSlider}
            categories={categories}
            setSelectedCatId={setSelectedCatId}
          />
        ) : activeTab === 'about' ? (
          <About setActiveTab={setActiveTab} />
        ) : activeTab === 'careers' ? (
          <CareersPage />
        ) : activeTab === 'contact' ? (
          <Support />
        ) : activeTab === 'news' ? selectedNewsArticleId ? (
          <NewsDetailPage
            selectedArticleId={selectedNewsArticleId}
            onBack={() => {
              setSelectedNewsArticleId(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <NewsPage onSelectArticle={setSelectedNewsArticleId} />
        ) : activeTab === 'stores' ? (
          <StoresPage />
        ) : activeTab === 'survey' ? (
          <SurveyPage onBackToHome={() => { setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        ) : activeTab === 'vouchers' ? (
          <>
            <section className="border-b border-gray-100 bg-gradient-to-b from-[#e8f5ee] via-white to-[#f0faf4]">
              <div className="mx-auto max-w-[1240px] px-4 py-14 md:px-6 md:py-16">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#1a8b46]">Voucher Center</p>
                <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-[#1f1f1f] md:text-6xl" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Khuyến mãi dành cho bạn
                </h1>
                <p className="mt-4 max-w-[780px] text-base font-semibold leading-relaxed text-[#4d433c] md:text-lg">
                  Cập nhật danh sách mã ưu đãi đang hoạt động. Nhấn vào mã để sao chép nhanh và áp dụng khi đặt hàng.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {[
                    { code: 'ALL', label: 'Tất cả' },
                    { code: 'PERCENT', label: 'Giảm %' },
                    { code: 'FIXED', label: 'Giảm tiền' },
                    { code: 'FREE_ITEM', label: 'Tặng kèm' },
                  ].map((item) => {
                    const active = voucherTypeFilter === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setVoucherTypeFilter(item.code)}
                        className={`rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${active
                          ? 'border-[#1a8b46] bg-[#1a8b46] text-white shadow-md shadow-green-200'
                          : 'border-gray-200 bg-white text-[#1a8b46] hover:border-[#1a8b46]'
                          }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-6 md:py-12">
              {isVoucherLoading ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-56 animate-pulse rounded-[28px] bg-green-50"></div>
                  ))}
                </div>
              ) : isVoucherError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {voucherError?.response?.data?.message || 'Không thể tải danh sách voucher lúc này.'}
                </div>
              ) : filteredVoucherItems.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#1a8b46]">Chưa có voucher phù hợp</p>
                  <p className="mt-2 text-sm font-semibold text-gray-500">Thử đổi bộ lọc hoặc quay lại sau để cập nhật ưu đãi mới nhất.</p>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredVoucherItems.map((voucher) => {
                    const typeMeta = getVoucherTypeMeta(voucher.loai_khuyen_mai);
                    const hasLimit = voucher.con_lai !== null && voucher.con_lai !== undefined;
                    const remaining = hasLimit ? Number(voucher.con_lai || 0) : null;
                    const isOut = hasLimit && remaining <= 0;
                    const isLocked = voucher.chua_dat_hang === true;
                    const canUse = voucher.co_the_dung !== false && !isLocked;

                    const getTierBadgeStyle = (tier) => {
                      switch (tier) {
                        case 'SILVER': return 'bg-slate-100 text-slate-700 border-slate-300';
                        case 'GOLD': return 'bg-amber-100 text-amber-800 border-amber-300';
                        case 'DIAMOND': return 'bg-cyan-100 text-cyan-800 border-cyan-300';
                        default: return 'bg-gray-100 text-gray-700 border-gray-300';
                      }
                    };

                    return (
                      <article key={voucher.ma_khuyen_mai} className={`overflow-hidden rounded-[28px] border bg-white shadow-sm hover:shadow-md transition-all ${isLocked ? 'border-gray-200 opacity-80' : 'border-gray-100 shadow-green-100'}`}>
                        <div className={`p-4 bg-gradient-to-r ${isLocked ? 'from-gray-200 via-gray-100 to-gray-200' : 'from-[#d4eddc] via-[#e8f5ee] to-[#d4eddc]'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleCopyVoucherCode(voucher.ma_khuyen_mai)}
                              className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.2em] ${isLocked ? 'border-gray-400 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-[#1a8b46] bg-white text-[#1a8b46]'}`}
                              title={isLocked ? 'Không thể dùng do chưa đủ hạng' : 'Sao chép mã'}
                            >
                              {isLocked ? '🔒 Khóa' : voucher.ma_khuyen_mai}
                            </button>
                            <div className="flex gap-1.5 items-center">
                              {voucher.hang_toi_thieu && (
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${getTierBadgeStyle(voucher.hang_toi_thieu)}`}>
                                  Hạng {voucher.hang_toi_thieu}
                                </span>
                              )}
                              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${typeMeta.className}`}>
                                {typeMeta.label}
                              </span>
                            </div>
                          </div>
                          {!isLocked && copiedVoucherCode === voucher.ma_khuyen_mai ? (
                            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Đã sao chép mã</p>
                          ) : null}
                        </div>

                        <div className="p-5">
                          <h3 className="text-xl font-black uppercase leading-tight text-[#1f1f1f]">{voucher.ten_khuyen_mai || 'Voucher ưu đãi'}</h3>
                          <p className="mt-2 text-base font-black text-[#c41230]">{formatVoucherValue(voucher)}</p>
                          <p className="mt-2 min-h-[44px] text-sm font-semibold leading-relaxed text-[#5b524b]">
                            {voucher.mo_ta || 'Áp dụng cho đơn hàng hợp lệ theo điều kiện của chương trình.'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-[#5d544d]">
                            <div className="rounded-xl bg-[#f0faf4] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1a8b46]">Đơn tối thiểu</p>
                              <p className="mt-1 text-sm font-black text-[#3f3731]">{Number(voucher.gia_tri_don_toi_thieu || 0).toLocaleString('vi-VN')}d</p>
                            </div>
                            <div className="rounded-xl bg-[#f0faf4] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1a8b46]">Còn lại</p>
                              <p className="mt-1 text-sm font-black text-[#3f3731]">{hasLimit ? `${Number(remaining || 0).toLocaleString('vi-VN')} lượt` : 'Vô hạn'}</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5 text-[12px] font-semibold text-[#5f5650]">
                            <p>Bắt đầu: {formatVoucherDate(voucher.ngay_bat_dau)}</p>
                            <p>Kết thúc: {formatVoucherDate(voucher.ngay_ket_thuc)}</p>
                            {userId ? <p>Đã dùng: {Number(voucher.da_dung_boi_ban || 0)} lần</p> : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isOut ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {isOut ? 'Hết lượt' : 'Còn hiệu lực'}
                            </span>
                            {userId ? (
                              <span
                                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isLocked 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 border' 
                                  : canUse 
                                    ? 'bg-[#eef7ff] text-[#1f6fb2]' 
                                    : 'bg-amber-50 text-amber-700'
                                  }`}
                              >
                                {isLocked 
                                  ? `Yêu cầu hạng ${voucher.hang_toi_thieu} trở lên` 
                                  : canUse 
                                    ? 'Bạn có thể dùng' 
                                    : 'Bạn đã đạt giới hạn'}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#eef7ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1f6fb2]">
                                Đăng nhập để theo dõi lượt dùng
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'privacy' ? (
          <PrivacyPolicyPage
            onBack={() => {
              setActiveTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : activeTab === 'menu-intro' ? (
          <MenuIntroPage
            categories={categories}
            products={products}
            activeCategoryId={selectedCatId}
            onCategoryChange={(catId) => {
              setSelectedCatId(catId);
            }}
            onOrderProduct={(product) => {
              handleOpenProductPage(product);
            }}
          />
        ) : ['order', 'login', 'chinh-sach-dat-hang', 'lien-he', 'profile', 'cart', 'product-detail'].includes(activeTab) ? (
          <OrderPage
            menuSections={menuSections}
            products={products}
            categories={categories}
            selectedCatId={selectedCatId}
            onSelectedCatIdChange={setSelectedCatId}
            cartCount={cartCount}
            onOpenCart={() => {
              setIsFavoriteOpen(false);
              setActiveTab('cart');
            }}
            userName={user?.ho_ten || user?.hoTen || user?.full_name || user?.username || user?.ten_dang_nhap || user?.email}
            onOpenAccount={() => setActiveTab('login')}
            onViewDetail={handleViewDetail}
            onQuickAdd={handleQuickAdd}
            isFavoriteProduct={isFavoriteProduct}
            onToggleFavorite={handleToggleFavorite}
            searchKeyword={searchKeyword}
            onSearchKeywordChange={setSearchKeyword}
            voucherItems={voucherItems}
            onLogout={handleLogout}
            onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
            onOpenProfile={() => setActiveTab('profile')}
            onNavigate={setActiveTab}
            aiRecommendedProducts={displayTop3Products}
            onOpenProductPage={handleOpenProductPage}
          >
            {activeTab === 'login' ? (
              <LoginPage
                onLoginSuccess={(user) => {
                  handleLoginSuccess(user);
                  const redirectTab = sessionStorage.getItem('post_login_redirect');
                  if (redirectTab === 'survey') {
                    const orderId = sessionStorage.getItem('post_login_order_id') || '';
                    sessionStorage.removeItem('post_login_redirect');
                    sessionStorage.removeItem('post_login_order_id');
                    
                    const uId = user.ma_nguoi_dung || user.maNguoiDung || user.id;
                    if (orderId && uId) {
                      apiClient.patch(`/customers/${uId}/orders/${orderId}/link`)
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
                        })
                        .catch((err) => console.error('Error linking order:', err));
                    }

                    setActiveTab('survey');
                    const params = new URLSearchParams();
                    params.set('tab', 'survey');
                    if (orderId) params.set('orderId', orderId);
                    window.history.pushState({ tab: 'survey', orderId }, '', `${window.location.pathname}?${params.toString()}`);
                  } else {
                    setActiveTab('profile');
                  }
                }}
              />
            ) : activeTab === 'chinh-sach-dat-hang' ? (
              <ChinhSachDatHangPage />
            ) : activeTab === 'lien-he' ? (
              <LienHePage />
            ) : activeTab === 'profile' ? (
              <ProfilePageContent
                user={user}
                onUserUpdated={handleUserUpdated}
                addressOptions={addressOptions}
                defaultAddressSelection={defaultAddressSelection}
                isOrderHistoryOpen={isOrderHistoryOpen}
                setIsOrderHistoryOpen={setIsOrderHistoryOpen}
                onNavigate={setActiveTab}
              />
            ) : activeTab === 'cart' ? (
              <CartPage products={products} onBackToHome={() => setActiveTab('order')} />
            ) : activeTab === 'product-detail' ? (
              <ProductDetailPage
                product={selectedProductForPage}
                products={products}
                onAddToCart={(prod, qty, size) => addToCart(user, prod, qty || 1, size || 'M')}
                onBack={() => setActiveTab('order')}
                onNavigate={setActiveTab}
              />
            ) : null}
          </OrderPage>
        ) : null}
      </main>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        user={user}
      />

      <FavoriteDrawer
        isOpen={isFavoriteOpen}
        onClose={() => setIsFavoriteOpen(false)}
        items={favoriteItems}
        onAddToCart={handleAddFavoriteToCart}
        onAddAllToCart={handleAddAllFavoritesToCart}
        onRemoveFavorite={handleToggleFavorite}
        isWorking={toggleFavoriteMutation.isPending}
      />
      <OrderHistoryModal
        isOpen={isOrderHistoryOpen}
        onClose={() => setIsOrderHistoryOpen(false)}
        user={user}
      />

      <SurveyPopup
        isOpen={isSurveyOpen}
        onClose={() => setIsSurveyOpen(false)}
        isLoggedIn={isLoggedIn}
        onAgree={() => {
          setIsSurveyOpen(false);
          if (isLoggedIn) {
            setActiveTab('survey');
            const params = new URLSearchParams();
            params.set('tab', 'survey');
            if (surveyOrderId) {
              params.set('orderId', surveyOrderId);
            }
            window.history.pushState({ tab: 'survey', orderId: surveyOrderId }, '', `${window.location.pathname}?${params.toString()}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            const wantsLogin = window.confirm(
              'Để nhận được Voucher giảm giá 20%, bạn cần đăng nhập tài khoản trước khi thực hiện khảo sát.\n\nBạn có muốn đăng nhập ngay bây giờ không?\n(Nếu chọn không, bạn vẫn có thể thực hiện khảo sát với tư cách Khách vãng lai nhưng sẽ không nhận được voucher)'
            );
            if (wantsLogin) {
              sessionStorage.setItem('post_login_redirect', 'survey');
              sessionStorage.setItem('post_login_order_id', surveyOrderId);
              setActiveTab('login');
              const params = new URLSearchParams();
              params.set('tab', 'login');
              window.history.pushState({ tab: 'login' }, '', `${window.location.pathname}?${params.toString()}`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setActiveTab('survey');
              const params = new URLSearchParams();
              params.set('tab', 'survey');
              if (surveyOrderId) {
                params.set('orderId', surveyOrderId);
              }
              window.history.pushState({ tab: 'survey', orderId: surveyOrderId }, '', `${window.location.pathname}?${params.toString()}`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        }}
      />

      {['order', 'login', 'chinh-sach-dat-hang', 'lien-he', 'profile', 'cart', 'product-detail'].includes(activeTab) ? <OrderFooter onNavigate={setActiveTab} /> : <Footer onTabChange={setActiveTab} />}
      <ChatWidget user={user} socketUrl={socketUrl} />

      {notificationToast ? (
        <div className="fixed bottom-6 right-6 z-[150] w-[92vw] max-w-sm rounded-2xl border border-green-100 bg-white/95 p-4 shadow-2xl shadow-green-100 backdrop-blur">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#1a8b46]">Thông báo mới</p>
          <p className="mt-1 text-sm font-black text-gray-800">{notificationToast.title}</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">{notificationToast.message}</p>
          {notificationToast.branchName ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">Cơ sở xử lý: {notificationToast.branchName}</p>
          ) : null}
        </div>
      ) : null}

      {showBirthdayVoucherModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleUp {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-fade-in {
              animation: fadeIn 0.25s ease-out forwards;
            }
            .animate-scale-up {
              animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
          `}</style>
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white text-center shadow-2xl animate-scale-up border border-amber-100 flex flex-col items-center p-8">
            <div className="text-6xl mb-4 animate-bounce">
              🎂🎈🎉
            </div>
            
            <h3 className="text-2xl font-black uppercase text-[#8c252a] tracking-tight mb-2 font-sans">
              Chúc Mừng Sinh Nhật!
            </h3>
            
            <p className="text-[#c89a58] font-black text-sm uppercase tracking-widest mb-6">
              Avengers House Special Gift
            </p>
            
            <div className="bg-amber-50/70 border border-amber-100/50 rounded-2xl p-5 mb-6 w-full shadow-inner">
              <p className="text-sm font-semibold text-gray-700 leading-relaxed">
                Nhân dịp tháng sinh nhật của bạn, Avengers House xin gửi tặng bạn một món quà đặc biệt. Một **Voucher mừng sinh nhật** đã được gửi vào kho voucher cá nhân của bạn!
              </p>
              <div className="mt-4 py-2 px-4 bg-[#8c252a] text-white font-black text-sm rounded-xl tracking-wider uppercase inline-block shadow-md">
                QUÀ TẶNG THÀNH VIÊN
              </div>
            </div>
            
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowBirthdayVoucherModal(false);
                  setActiveTab('profile');
                  setIsOrderHistoryOpen(false);
                }}
                className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-98 transform cursor-pointer border-none"
              >
                Xem quà tặng của tôi
              </button>
              <button
                type="button"
                onClick={() => setShowBirthdayVoucherModal(false)}
                className="w-full py-3 hover:bg-gray-100 text-gray-500 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer border-none bg-transparent"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal liên kết đơn hàng khách vãng lai */}
      {showLinkOrderPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300 p-4 font-sans">
          <div className="relative max-w-md w-full bg-white border border-[#e8e2da] shadow-2xl rounded-[32px] p-8 flex flex-col items-center text-center transform scale-100 transition-all duration-300 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6 text-[#c41230] animate-bounce">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            
            <h3 className="text-2xl font-black text-[#1a1a1a] uppercase tracking-wide mb-3 font-serif">
              Đồng bộ đơn hàng
            </h3>
            
            <p className="text-[#c89a58] font-black text-sm uppercase tracking-widest mb-6">
              Avengers Coffee Member Sync
            </p>
            
            <div className="bg-[#faf7f4] border border-[#e8e2da] rounded-2xl p-5 mb-6 w-full text-left">
              <p className="text-sm font-semibold text-gray-700 leading-relaxed">
                Chào mừng bạn gia nhập! Chúng tôi tìm thấy <strong>{linkOrderCount} đơn hàng</strong> chưa gán tài khoản khớp với Email hoặc Số điện thoại của bạn.
              </p>
              <p className="text-xs text-gray-500 mt-2 font-medium">
                Bạn có muốn liên kết các đơn hàng này vào tài khoản để theo dõi lịch sử đơn và tích lũy điểm thành viên không?
              </p>
            </div>
            
            <div className="flex flex-col gap-3 w-full font-sans">
              <button
                type="button"
                disabled={isLinkingOrders}
                onClick={() => {
                  setIsLinkingOrders(true);
                  apiClient.post(`/customers/${linkOrderPayload.userId}/orders/link-guest-orders`, {
                    ...linkOrderPayload,
                    confirmLink: true
                  }).then(() => {
                    alert('Liên kết đơn hàng thành công!');
                    localStorage.removeItem('avengers_guest_session_id');
                    queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
                    setShowLinkOrderPrompt(false);
                  }).catch((err) => {
                    console.error('Lỗi khi xác nhận liên kết đơn hàng:', err);
                    alert('Có lỗi xảy ra khi liên kết đơn hàng.');
                  }).finally(() => {
                    setIsLinkingOrders(false);
                  });
                }}
                className="w-full py-3.5 bg-[#8c252a] hover:bg-[#731c20] disabled:bg-gray-400 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-98 transform cursor-pointer border-none"
              >
                {isLinkingOrders ? 'Đang liên kết...' : 'Liên kết ngay'}
              </button>
              <button
                type="button"
                disabled={isLinkingOrders}
                onClick={() => setShowLinkOrderPrompt(false)}
                className="w-full py-3 hover:bg-gray-100 text-gray-500 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer border-none bg-transparent"
              >
                Để sau / Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("App Render Error:", error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', background: '#fff0f0', minHeight: '100vh', color: '#c00' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>⚠️ Lỗi hiển thị React (Runtime Error)</h1>
          <p style={{ marginTop: '16px', fontSize: '18px', fontWeight: 'bold' }}>{String(this.state.error)}</p>
          <pre style={{ marginTop: '16px', background: '#fff', padding: '16px', borderRadius: '8px', overflow: 'auto', border: '1px solid #fcc', fontSize: '13px', color: '#333' }}>
            {this.state.error?.stack || this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#c00', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <CartProvider>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </CartProvider>
  );
}

