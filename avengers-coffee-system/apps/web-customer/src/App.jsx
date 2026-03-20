import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Header from './components/Header';
import Footer from './components/Footer';
import ProductCard from './components/ProductCard';
import AuthModal from './components/AuthModal';
import ProductDetailModal from './components/ProductDetailModal';
import CartDrawer from './components/CartDrawer'; // File mới bước 2
import FavoriteDrawer from './components/FavoriteDrawer';
import OrderHistoryModal from './components/OrderHistoryModal';
import ChatWidget from './components/ChatWidget';
import NewsDetailPage from './pages/NewsDetailPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import { CartProvider, useCart } from './context/CartContext'; // File mới bước 2
import { apiClient } from './lib/apiClient';
import { queryKeys } from './lib/queryKeys';
import { normalizeNewsArticle } from './lib/news';
import { UserCircleIcon, KeyIcon, MapPinIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const FALLBACK_BANNER_URL = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=80';

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
  office: 'Tầng 6, Tòa nhà Toyota, Số 315 Trường Chinh, P. Khương Mai, Q. Thanh Xuân, TP Hà Nội, Việt Nam',
  hotline: '1800 6936',
  email: 'support.hn@ggg.com.vn',
  heroImage: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1800&q=80',
  storeImage: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
};

const BRANCH_NAME_MAP = {
  MAC_DINH_CHI: 'Mạc Đĩnh Chi',
  THE_GRACE_TOWER: 'The Grace Tower',
};

const ADDRESS_OPTIONS = {
  'Thành phố Hồ Chí Minh': {
    'Quận 1': ['Phường Bến Nghé', 'Phường Bến Thành'],
    'Quận 3': ['Phường Võ Thị Sáu', 'Phường 9'],
    'Quận 7': ['Phường Tân Phú', 'Phường Tân Hưng'],
    'Thành phố Thủ Đức': ['Phường An Phú', 'Phường Hiệp Bình Chánh'],
  },
  'Thành phố Hà Nội': {
    'Quận Ba Đình': ['Phường Kim Mã', 'Phường Ngọc Hà'],
    'Quận Cầu Giấy': ['Phường Dịch Vọng', 'Phường Nghĩa Đô'],
    'Quận Đống Đa': ['Phường Láng Thượng', 'Phường Cát Linh'],
  },
  'Thành phố Đà Nẵng': {
    'Quận Hải Châu': ['Phường Hải Châu I', 'Phường Hòa Cường Bắc'],
    'Quận Thanh Khê': ['Phường Tam Thuận', 'Phường Thanh Khê Đông'],
    'Quận Sơn Trà': ['Phường An Hải Bắc', 'Phường Phước Mỹ'],
  },
  'Thành phố Cần Thơ': {
    'Quận Ninh Kiều': ['Phường An Khánh', 'Phường Xuân Khánh'],
    'Quận Cái Răng': ['Phường Hưng Phú', 'Phường Lê Bình'],
    'Quận Bình Thủy': ['Phường An Thới', 'Phường Long Hòa'],
  },
  'Thành phố Hải Phòng': {
    'Quận Lê Chân': ['Phường An Biên', 'Phường Dư Hàng Kênh'],
    'Quận Ngô Quyền': ['Phường Máy Chai', 'Phường Lạc Viên'],
    'Quận Hải An': ['Phường Đằng Lâm', 'Phường Đằng Hải'],
  },
  'Tỉnh Bình Dương': {
    'Thành phố Thủ Dầu Một': ['Phường Phú Cường', 'Phường Hiệp Thành'],
    'Thành phố Dĩ An': ['Phường Dĩ An', 'Phường Tân Đông Hiệp'],
    'Thành phố Thuận An': ['Phường Lái Thiêu', 'Phường An Phú'],
  },
  'Tỉnh Đồng Nai': {
    'Thành phố Biên Hòa': ['Phường Trảng Dài', 'Phường Tân Hiệp'],
    'Thành phố Long Khánh': ['Phường Xuân An', 'Phường Xuân Bình'],
    'Huyện Nhơn Trạch': ['Xã Phú Hội', 'Xã Phú Đông'],
  },
  'Tỉnh Khánh Hòa': {
    'Thành phố Nha Trang': ['Phường Vĩnh Hải', 'Phường Phước Hải'],
    'Thành phố Cam Ranh': ['Phường Cam Lộc', 'Phường Cam Linh'],
    'Thị xã Ninh Hòa': ['Phường Ninh Hiệp', 'Phường Ninh Thủy'],
  },
  'Tỉnh Quảng Ninh': {
    'Thành phố Hạ Long': ['Phường Hồng Gai', 'Phường Bãi Cháy'],
    'Thành phố Cẩm Phả': ['Phường Cẩm Đông', 'Phường Cẩm Tây'],
    'Thành phố Uông Bí': ['Phường Quang Trung', 'Phường Trưng Vương'],
  },
};

const DEFAULT_ADDRESS_FORM = {
  tenDiaChi: '',
  city: 'Thành phố Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
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
      city: 'Thành phố Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      street: '',
    };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const city = parts[parts.length - 1] || 'Thành phố Hồ Chí Minh';
  const district = parts[parts.length - 2] || 'Quận 1';
  const ward = parts[parts.length - 3] || 'Phường Bến Nghé';
  const street = parts.slice(0, Math.max(parts.length - 3, 0)).join(', ');

  return { city, district, ward, street: street || raw };
}

function normalizeBranchStore(branch, index) {
  const openTime = String(branch?.gio_mo_cua || '').trim();
  const closeTime = String(branch?.gio_dong_cua || '').trim();
  const fallbackHours = openTime || closeTime ? `${openTime || '--:--'} - ${closeTime || '--:--'}` : '07:00 - 22:00';

  return {
    id: String(branch?.ma_chi_nhanh || `branch-${index + 1}`),
    code: String(branch?.ma_chi_nhanh || `branch-${index + 1}`),
    city: String(branch?.thanh_pho || '').trim() || 'Hồ Chí Minh',
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

export default function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
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
                  <p className={`font-black text-[#df6f37] ${compact ? 'mt-1 text-xs' : 'mt-2 text-xl'}`}>
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
            className={`h-2.5 w-2.5 rounded-full ${idx === pageIndex ? 'bg-[#d67b3c]' : 'bg-[#e7d6c2]'}`}
            aria-label={`Trang ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [activeMainSectionId, setActiveMainSectionId] = useState('must-try');
  const [activeSubSectionId, setActiveSubSectionId] = useState('');
  const [newsCategory, setNewsCategory] = useState('ALL');
  const [selectedNewsArticleId, setSelectedNewsArticleId] = useState(null);
  const [storeCity, setStoreCity] = useState('Hồ Chí Minh');
  const [storeDistrict, setStoreDistrict] = useState('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '' });

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false); // Quản lý đóng mở Giỏ hàng
  const [isFavoriteOpen, setIsFavoriteOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [priceFilter, setPriceFilter] = useState('ALL');
  const [criteriaFilter, setCriteriaFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DEFAULT');
  const [notificationToast, setNotificationToast] = useState(null);
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
  const aiTargetUserId = userId || 'guest-popular';
  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';

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
    refetchInterval: 120 * 1000,
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
    return BRANCH_NAME_MAP[String(branchCode).toUpperCase()] || String(branchCode);
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
    queryKey: [...queryKeys.voucherList, userId || 'guest'],
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
  const newsCategoryOptions = useMemo(() => {
    const categorySet = new Set(
      newsArticles
        .map((article) => String(article?.category || '').trim().toUpperCase())
        .filter(Boolean),
    );

    const dynamicOptions = Array.from(categorySet)
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map((id) => ({ id, label: formatNewsCategoryLabel(id) }));

    return [{ id: 'ALL', label: 'Tat ca' }, ...dynamicOptions];
  }, [newsArticles]);
  const selectedNewsCategoryLabel =
    newsCategoryOptions.find((option) => option.id === newsCategory)?.label ||
    formatNewsCategoryLabel(newsCategory);
  const filteredVoucherItems = useMemo(() => {
    if (voucherTypeFilter === 'ALL') return voucherItems;
    return voucherItems.filter((item) => String(item.loai_khuyen_mai || '').toUpperCase() === voucherTypeFilter);
  }, [voucherItems, voucherTypeFilter]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }

    const params = new URLSearchParams(window.location.search);
    const paymentProvider = params.get('payment_provider');
    const paymentStatus = params.get('payment_status');
    if (paymentProvider === 'VNPAY' && paymentStatus) {
      if (paymentStatus === 'success') {
        alert('Thanh toán VNPAY thành công. Đơn hàng đã được cập nhật!');
      } else {
        alert('Thanh toán VNPAY thất bại hoặc bị hủy.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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
    await syncCartWithUser(nextUser);
  };

  const handleLogout = async () => {
    if (userId) {
      queryClient.removeQueries({ queryKey: queryKeys.userProfile(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.userAddresses(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.loyaltyByUser(userId) });
      queryClient.removeQueries({ queryKey: queryKeys.notificationsByUser(userId) });
      queryClient.removeQueries({ queryKey: ['customer-favorites', userId] });
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    await syncCartWithUser(null);
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
        queryClient.invalidateQueries({ queryKey: [...queryKeys.voucherList, userId || 'guest'] });
      }

      if (notificationType === 'SYSTEM') {
        queryClient.invalidateQueries({ queryKey: queryKeys.menuProducts });
        queryClient.invalidateQueries({ queryKey: queryKeys.menuCategories });
        queryClient.invalidateQueries({ queryKey: ['news', 'all'] });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.voucherList, userId || 'guest'] });
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
      list = list.filter((p) => String(p.danhMuc?.ma_danh_muc) === selectedCatId);
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
  }, [products, selectedCatId, searchKeyword, availabilityFilter, priceFilter, criteriaFilter, sortBy]);

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
      setIsCartOpen(true);
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
      setIsCartOpen(true);
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
    return () => window.removeEventListener('resize', onResize);
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

  const filteredNewsArticles = useMemo(() => {
    if (!newsArticles.length) return [];
    if (newsCategory === 'ALL') return newsArticles;
    return newsArticles.filter((article) => String(article.category || '').toUpperCase() === newsCategory);
  }, [newsArticles, newsCategory]);

  const featuredNewsArticle = filteredNewsArticles.find((article) => article.featured) || filteredNewsArticles[0] || null;
  const secondaryNewsArticles = featuredNewsArticle
    ? filteredNewsArticles.filter((article) => article.id !== featuredNewsArticle.id)
    : filteredNewsArticles;
  const homeNewsPreview = newsArticles[0] || null;

  useEffect(() => {
    const hasCurrentOption = newsCategoryOptions.some((option) => option.id === newsCategory);
    if (!hasCurrentOption) {
      setNewsCategory(newsCategoryOptions[0]?.id || 'ALL');
    }
  }, [newsCategory, newsCategoryOptions]);

  const storeCities = useMemo(() => [...new Set(storeLocations.map((store) => store.city))], [storeLocations]);

  useEffect(() => {
    if (!storeCities.length) return;
    if (!storeCities.includes(storeCity)) {
      setStoreCity(storeCities[0]);
      setStoreDistrict('ALL');
    }
  }, [storeCities, storeCity]);

  const storeDistricts = useMemo(() => {
    const list = storeLocations.filter((store) => store.city === storeCity).map((store) => store.district);
    return [...new Set(list)];
  }, [storeCity, storeLocations]);

  const filteredStores = useMemo(
    () => storeLocations.filter((store) => store.city === storeCity && (storeDistrict === 'ALL' || store.district === storeDistrict)),
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

  function ProfilePageContent({ user: profileUser, onUserUpdated: onProfileUpdated }) {
    const [activeTab, setActiveTab] = useState('profile');
    const [profileForm, setProfileForm] = useState({ hoTen: '', soDienThoai: '', avatarUrl: '' });
    const [passwordForm, setPasswordForm] = useState({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    const [addressForm, setAddressForm] = useState(DEFAULT_ADDRESS_FORM);
    const [profileError, setProfileError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [addressError, setAddressError] = useState('');
    const [editingAddressId, setEditingAddressId] = useState(null);

    const userId = profileUser?.ma_nguoi_dung || profileUser?.maNguoiDung || null;

    const {
      data: profile,
      isLoading,
      isError: profileIsError,
      error: profileError2,
    } = useQuery({
      queryKey: queryKeys.userProfile(userId),
      queryFn: async () => {
        const response = await apiClient.get(`/users/${userId}/profile`);
        return response.data;
      },
      enabled: Boolean(userId),
      staleTime: 30 * 1000,
    });

    const {
      data: addressPayload,
      isLoading: isAddressLoading,
      isError: isAddressError,
      error: addressQueryError,
    } = useQuery({
      queryKey: queryKeys.userAddresses(userId),
      queryFn: async () => {
        const response = await apiClient.get(`/users/${userId}/addresses`);
        return response.data;
      },
      enabled: Boolean(userId),
      staleTime: 30 * 1000,
    });

    const {
      data: reviewHistoryPayload,
      isLoading: isReviewsLoading,
      isError: isReviewsError,
      error: reviewsError,
    } = useQuery({
      queryKey: queryKeys.userReviews(userId),
      queryFn: async () => {
        const response = await apiClient.get(`/customers/${userId}/reviews`);
        return response.data;
      },
      enabled: Boolean(userId) && activeTab === 'reviews',
      staleTime: 30 * 1000,
    });

    const { data: loyaltyData } = useQuery({
      queryKey: queryKeys.loyaltyByUser(userId),
      queryFn: async () => {
        const response = await apiClient.get(`/users/${userId}/loyalty`);
        return response.data;
      },
      enabled: Boolean(userId),
      staleTime: 60 * 1000,
    });

    const savedAddresses = addressPayload?.items || [];
    const myReviews = reviewHistoryPayload?.items || [];
    const diemLoyalty = loyaltyData?.diem || 0;
    const districtOptions = useMemo(() => Object.keys(ADDRESS_OPTIONS[addressForm.city] || {}), [addressForm.city]);
    const wardOptions = useMemo(
      () => (ADDRESS_OPTIONS[addressForm.city]?.[addressForm.district] || []),
      [addressForm.city, addressForm.district],
    );
    const diaChiDayDu = useMemo(() => taoDiaChiDayDu(addressForm), [addressForm]);

    useEffect(() => {
      setProfileForm({ hoTen: '', soDienThoai: '', avatarUrl: '' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAddressForm(DEFAULT_ADDRESS_FORM);
      setProfileError('');
      setPasswordError('');
      setAddressError('');
      setEditingAddressId(null);
    }, [userId]);

    useEffect(() => {
      if (profile) {
        setProfileForm({
          hoTen: profile.ho_ten || '',
          soDienThoai: profile.so_dien_thoai || '',
          avatarUrl: profile.avatar_url || '',
        });
      }
    }, [profile]);

    useEffect(() => {
      if (!districtOptions.length) {
        return;
      }

      if (!districtOptions.includes(addressForm.district)) {
        setAddressForm((prev) => ({
          ...prev,
          district: districtOptions[0],
          ward: (ADDRESS_OPTIONS[prev.city]?.[districtOptions[0]] || [])[0] || '',
        }));
      }
    }, [addressForm.city, addressForm.district, districtOptions]);

    useEffect(() => {
      if (!wardOptions.length) {
        return;
      }

      if (!wardOptions.includes(addressForm.ward)) {
        setAddressForm((prev) => ({ ...prev, ward: wardOptions[0] }));
      }
    }, [addressForm.ward, wardOptions]);

    const updateProfileMutation = useMutation({
      mutationFn: async (payload) => {
        const response = await apiClient.patch(`/users/${userId}/profile`, payload);
        return response.data;
      },
      onSuccess: (data) => {
        setProfileError('');
        const updatedUser = {
          ...profileUser,
          ho_ten: data?.user?.ho_ten,
          hoTen: data?.user?.ho_ten,
          email: data?.user?.email,
          avatar_url: data?.user?.avatar_url || null,
          avatarUrl: data?.user?.avatar_url || null,
        };
        onProfileUpdated(updatedUser);
        queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(userId) });
        alert('Cập nhật thông tin thành công!');
      },
      onError: (err) => {
        setProfileError(err?.response?.data?.message || 'Không thể cập nhật thông tin.');
      },
    });

    const changePasswordMutation = useMutation({
      mutationFn: async (payload) => {
        const response = await apiClient.post(`/users/${userId}/change-password`, payload);
        return response.data;
      },
      onSuccess: () => {
        setPasswordError('');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        alert('Đổi mật khẩu thành công!');
      },
      onError: (err) => {
        setPasswordError(err?.response?.data?.message || 'Không thể đổi mật khẩu.');
      },
    });

    const saveAddressMutation = useMutation({
      mutationFn: async (payload) => {
        if (editingAddressId) {
          const response = await apiClient.patch(`/users/${userId}/addresses/${editingAddressId}`, payload);
          return response.data;
        }

        const response = await apiClient.post(`/users/${userId}/addresses`, payload);
        return response.data;
      },
      onSuccess: () => {
        setAddressError('');
        setEditingAddressId(null);
        setAddressForm(DEFAULT_ADDRESS_FORM);
        queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
      },
      onError: (err) => {
        setAddressError(err?.response?.data?.message || 'Không thể lưu địa chỉ.');
      },
    });

    const deleteAddressMutation = useMutation({
      mutationFn: async (addressId) => {
        await apiClient.delete(`/users/${userId}/addresses/${addressId}`);
      },
      onSuccess: () => {
        setAddressError('');
        if (editingAddressId) {
          setEditingAddressId(null);
          setAddressForm(DEFAULT_ADDRESS_FORM);
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
      },
      onError: (err) => {
        setAddressError(err?.response?.data?.message || 'Không thể xóa địa chỉ.');
      },
    });

    const setDefaultAddressMutation = useMutation({
      mutationFn: async (addressId) => {
        await apiClient.patch(`/users/${userId}/addresses/${addressId}/default`);
      },
      onSuccess: () => {
        setAddressError('');
        queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
      },
      onError: (err) => {
        setAddressError(err?.response?.data?.message || 'Không thể đặt địa chỉ mặc định.');
      },
    });

    const handleUpdateProfile = (e) => {
      e.preventDefault();
      setProfileError('');
      updateProfileMutation.mutate({
        hoTen: profileForm.hoTen,
        soDienThoai: profileForm.soDienThoai,
        avatarUrl: profileForm.avatarUrl,
      });
    };

    const handleChangePassword = (e) => {
      e.preventDefault();
      setPasswordError('');

      if (passwordForm.newPassword.length < 6) {
        setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
        return;
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError('Xác nhận mật khẩu không khớp.');
        return;
      }

      changePasswordMutation.mutate({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
    };

    const handleSaveAddress = (e) => {
      e.preventDefault();
      setAddressError('');

      if (!addressForm.street.trim()) {
        setAddressError('Vui lòng nhập số nhà, tên đường cho địa chỉ giao hàng.');
        return;
      }

      saveAddressMutation.mutate({
        tenDiaChi: addressForm.tenDiaChi,
        diaChiDayDu: diaChiDayDu,
        ghiChu: addressForm.ghiChu,
      });
    };

    const handleEditAddress = (address) => {
      setAddressError('');
      setEditingAddressId(address.id);
      const parsed = tachDiaChiDayDu(address.dia_chi_day_du);
      const normalizedCity = ADDRESS_OPTIONS[parsed.city] ? parsed.city : 'Thành phố Hồ Chí Minh';
      const normalizedDistrict = ADDRESS_OPTIONS[normalizedCity]?.[parsed.district]
        ? parsed.district
        : Object.keys(ADDRESS_OPTIONS[normalizedCity] || {})[0] || 'Quận 1';
      const normalizedWard = (ADDRESS_OPTIONS[normalizedCity]?.[normalizedDistrict] || []).includes(parsed.ward)
        ? parsed.ward
        : (ADDRESS_OPTIONS[normalizedCity]?.[normalizedDistrict] || [])[0] || 'Phường Bến Nghé';

      setAddressForm({
        tenDiaChi: address.ten_dia_chi || '',
        city: normalizedCity,
        district: normalizedDistrict,
        ward: normalizedWard,
        street: parsed.street,
        ghiChu: address.ghi_chu || '',
      });
      setActiveTab('addresses');
    };

    const resetAddressEditor = () => {
      setEditingAddressId(null);
      setAddressError('');
      setAddressForm(DEFAULT_ADDRESS_FORM);
    };

    return (
      <div className="rounded-[28px] bg-white border border-orange-100 overflow-hidden shadow-lg">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-5 border-b border-orange-50">
          <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">Trang Cá Nhân</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500">Quản lý thông tin và bảo mật tài khoản của bạn</p>
        </div>

        <div className="p-6">
          <div className="mb-6 flex gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                activeTab === 'profile' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5" />
                Hồ sơ
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('password')}
              className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                activeTab === 'password' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <KeyIcon className="h-5 w-5" />
                Đổi mật khẩu
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addresses')}
              className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                activeTab === 'addresses' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <MapPinIcon className="h-5 w-5" />
                Địa chỉ giao hàng
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                activeTab === 'reviews' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                ⭐
                Đánh giá của tôi
              </span>
            </button>
          </div>

          {activeTab === 'profile' ? (
            <div className="rounded-2xl border border-orange-100 bg-white p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                  <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                  <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                </div>
              ) : profileIsError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {profileError2?.response?.data?.message || 'Không thể tải thông tin cá nhân.'}
                </div>
              ) : (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  {/* Loyalty Points Card */}
                  {(() => {
                    const hang = loyaltyData?.hang_thanh_vien;
                    const maHang = hang?.ma_hang || 'MEMBER';
                    const batDau = hang?.diem_bat_dau_hang ?? 0;
                    const canLen = hang?.diem_can_len_hang ?? null;
                    const phanTram = canLen != null
                      ? Math.min(100, Math.round(((diemLoyalty - batDau) / (canLen - batDau)) * 100))
                      : 100;
                    const HANG_STYLE = {
                      MEMBER:  { bg: 'from-gray-50 to-gray-100',   border: 'border-gray-200',   text: 'text-gray-600',   bar: 'bg-gray-400',   icon: '🎖️' },
                      SILVER:  { bg: 'from-slate-50 to-slate-100', border: 'border-slate-300',  text: 'text-slate-600',  bar: 'bg-slate-400',  icon: '🥈' },
                      GOLD:    { bg: 'from-yellow-50 to-amber-100',border: 'border-yellow-300', text: 'text-yellow-700', bar: 'bg-yellow-400', icon: '🥇' },
                      DIAMOND: { bg: 'from-cyan-50 to-blue-100',   border: 'border-cyan-300',   text: 'text-cyan-700',   bar: 'bg-cyan-400',   icon: '💎' },
                    };
                    const s = HANG_STYLE[maHang] || HANG_STYLE.MEMBER;
                    return (
                      <div className={`rounded-xl border ${s.border} bg-gradient-to-r ${s.bg} px-4 py-3 space-y-2`}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{s.icon}</span>
                          <div className="flex-1">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Điểm tích lũy</p>
                            <div className="flex items-baseline gap-2">
                              <p className={`text-xl font-black ${s.text}`}>{diemLoyalty.toLocaleString('vi-VN')} điểm</p>
                              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${s.text} border ${s.border}`}>{hang?.hang || 'Thành viên'}</span>
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-500 shrink-0">
                            <p>1 điểm</p>
                            <p className="font-bold text-gray-600">= 1.000đ</p>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] font-semibold text-gray-500">
                            {canLen != null ? (
                              <>
                                <span>{diemLoyalty.toLocaleString('vi-VN')} / {canLen.toLocaleString('vi-VN')} điểm</span>
                                <span>còn {(canLen - diemLoyalty).toLocaleString('vi-VN')} điểm lên hạng tiếp</span>
                              </>
                            ) : (
                              <span className={`font-black ${s.text}`}>Hạng cao nhất ✨</span>
                            )}
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/60">
                            <div className={`h-2 rounded-full ${s.bar} transition-all duration-500`} style={{ width: `${phanTram}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Họ tên</p>
                    <input
                      type="text"
                      required
                      value={profileForm.hoTen}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Email</p>
                    <input
                      type="text"
                      disabled
                      value={profile?.email || ''}
                      className="w-full rounded-xl border border-gray-100 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Số điện thoại</p>
                    <input
                      type="text"
                      value={profileForm.soDienThoai}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      placeholder="Nhập số điện thoại"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Avatar URL</p>
                    <input
                      type="text"
                      value={profileForm.avatarUrl}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      placeholder="https://..."
                    />
                  </div>

                  {profileError ? <p className="text-sm font-semibold text-red-600">{profileError}</p> : null}

                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="rounded-xl bg-tch-orange px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 disabled:bg-gray-300"
                  >
                    {updateProfileMutation.isPending ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                  </button>
                </form>
              )}
            </div>
          ) : activeTab === 'addresses' ? (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-orange-100 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black uppercase text-gray-800">Sổ địa chỉ giao hàng</h3>
                    <p className="mt-1 text-sm font-semibold text-gray-500">Thêm, sửa, xóa và đặt địa chỉ mặc định cho đơn giao hàng.</p>
                  </div>
                </div>

                {isAddressLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((item) => (
                      <div key={item} className="h-24 animate-pulse rounded-2xl bg-orange-100/70"></div>
                    ))}
                  </div>
                ) : isAddressError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {addressQueryError?.response?.data?.message || 'Không thể tải danh sách địa chỉ.'}
                  </div>
                ) : savedAddresses.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                    <p className="text-sm font-black uppercase tracking-wide text-gray-600">Chưa có địa chỉ nào được lưu</p>
                    <p className="mt-2 text-sm font-semibold text-gray-400">Thêm địa chỉ đầu tiên để dùng nhanh khi đặt hàng.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedAddresses.map((address) => (
                      <div key={address.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-gray-800">{address.ten_dia_chi}</p>
                              {address.mac_dinh ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                  Mặc định
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-600">{address.dia_chi_day_du}</p>
                            {address.ghi_chu ? <p className="mt-2 text-xs font-semibold text-gray-500">Ghi chú: {address.ghi_chu}</p> : null}
                          </div>
                          <div className="flex flex-col gap-2">
                            {!address.mac_dinh ? (
                              <button
                                type="button"
                                onClick={() => setDefaultAddressMutation.mutate(address.id)}
                                disabled={setDefaultAddressMutation.isPending}
                                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-700"
                              >
                                Đặt mặc định
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleEditAddress(address)}
                              className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-tch-orange"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAddressMutation.mutate(address.id)}
                              disabled={deleteAddressMutation.isPending}
                              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-orange-100 bg-white p-5">
                <h3 className="text-lg font-black uppercase text-gray-800">
                  {editingAddressId ? 'Cập nhật địa chỉ' : 'Thêm địa chỉ mới'}
                </h3>
                <p className="mt-1 text-sm font-semibold text-gray-500">Lưu địa chỉ để chọn nhanh khi đặt đơn giao hàng.</p>

                <form onSubmit={handleSaveAddress} className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tên địa chỉ</p>
                    <input
                      type="text"
                      required
                      value={addressForm.tenDiaChi}
                      onChange={(e) => setAddressForm((prev) => ({ ...prev, tenDiaChi: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      placeholder="Ví dụ: Nhà riêng, KTX, Công ty"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Thành phố</p>
                    <select
                      value={addressForm.city}
                      onChange={(e) => {
                        const nextCity = e.target.value;
                        const nextDistrict = Object.keys(ADDRESS_OPTIONS[nextCity] || {})[0] || '';
                        const nextWard = (ADDRESS_OPTIONS[nextCity]?.[nextDistrict] || [])[0] || '';
                        setAddressForm((prev) => ({ ...prev, city: nextCity, district: nextDistrict, ward: nextWard }));
                      }}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    >
                      {Object.keys(ADDRESS_OPTIONS).map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Quận</p>
                    <select
                      value={addressForm.district}
                      onChange={(e) => {
                        const nextDistrict = e.target.value;
                        const nextWard = (ADDRESS_OPTIONS[addressForm.city]?.[nextDistrict] || [])[0] || '';
                        setAddressForm((prev) => ({ ...prev, district: nextDistrict, ward: nextWard }));
                      }}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    >
                      {districtOptions.map((district) => (
                        <option key={district} value={district}>{district}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Phường</p>
                    <select
                      value={addressForm.ward}
                      onChange={(e) => setAddressForm((prev) => ({ ...prev, ward: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    >
                      {wardOptions.map((ward) => (
                        <option key={ward} value={ward}>{ward}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Số nhà, tên đường</p>
                    <input
                      required
                      value={addressForm.street}
                      onChange={(e) => setAddressForm((prev) => ({ ...prev, street: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      placeholder="Ví dụ: 28 Ter B Mạc Đĩnh Chi"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-500">Địa chỉ đầy đủ: {diaChiDayDu || '---'}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Ghi chú</p>
                    <input
                      type="text"
                      value={addressForm.ghiChu}
                      onChange={(e) => setAddressForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi giao"
                    />
                  </div>

                  {addressError ? <p className="text-sm font-semibold text-red-600">{addressError}</p> : null}

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={saveAddressMutation.isPending}
                      className="rounded-xl bg-tch-orange px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 disabled:bg-gray-300"
                    >
                      {saveAddressMutation.isPending ? 'Đang lưu...' : editingAddressId ? 'Lưu cập nhật' : 'Thêm địa chỉ'}
                    </button>
                    {editingAddressId ? (
                      <button
                        type="button"
                        onClick={resetAddressEditor}
                        className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black uppercase tracking-wide text-gray-600"
                      >
                        Hủy sửa
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>
          ) : activeTab === 'reviews' ? (
            <div className="rounded-2xl border border-orange-100 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black uppercase text-gray-800">Lịch sử đánh giá</h3>
                  <p className="mt-1 text-sm font-semibold text-gray-500">Xem lại các đánh giá bạn đã gửi cho sản phẩm.</p>
                </div>
                <div className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-tch-orange">
                  {myReviews.length} đánh giá
                </div>
              </div>

              {isReviewsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-20 animate-pulse rounded-xl bg-orange-100/70"></div>
                  ))}
                </div>
              ) : isReviewsError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {reviewsError?.response?.data?.message || 'Không thể tải lịch sử đánh giá.'}
                </div>
              ) : myReviews.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                  <p className="text-sm font-black uppercase tracking-wide text-gray-600">Bạn chưa có đánh giá nào</p>
                  <p className="mt-2 text-sm font-semibold text-gray-400">Hãy đánh giá sản phẩm từ lịch sử đơn hàng để theo dõi tại đây.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myReviews.map((review) => (
                    <div key={review.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-gray-800">Sản phẩm #{review.ma_san_pham}</p>
                        <p className="text-xs font-semibold text-gray-500">
                          {new Date(review.ngay_cap_nhat || review.ngay_tao).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <p className="mt-2 text-sm font-black text-amber-500">{'★'.repeat(Number(review.so_sao || 0))}{'☆'.repeat(5 - Number(review.so_sao || 0))}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-600">{review.binh_luan || 'Không có bình luận.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-orange-100 bg-white p-5">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu hiện tại</p>
                  <input
                    type="password"
                    required
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu mới</p>
                  <input
                    type="password"
                    required
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Xác nhận mật khẩu mới</p>
                  <input
                    type="password"
                    required
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                  />
                </div>

                {passwordError ? <p className="text-sm font-semibold text-red-600">{passwordError}</p> : null}

                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="rounded-xl bg-tch-orange px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 disabled:bg-gray-300"
                >
                  {changePasswordMutation.isPending ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const featuredCarouselItems = useMemo(() => products.slice(0, 12), [products]);
  const orderCarouselItems = useMemo(() => filteredProducts.slice(0, 18), [filteredProducts]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
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
        onOpenAccount={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        cartCount={cartCount}
        onOpenCart={() => {
          setIsFavoriteOpen(false);
          setIsCartOpen(true);
        }} // BƯỚC 3: Mở Drawer Giỏ hàng
        onOpenFavorites={handleOpenFavorites}
        favoriteCount={favoriteItems.length}
        onOpenOrderHistory={() => {
          if (!user) {
            setIsAuthOpen(true);
            return;
          }
          setIsOrderHistoryOpen(true);
        }}
        onOpenProfile={() => {
          if (!user) {
            setIsAuthOpen(true);
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

      <main className="flex-grow">
        {activeTab === 'profile' ? (
          <div className="mx-auto mt-6 w-full max-w-[1240px] px-4 md:px-6 pb-20">
            <button
              onClick={() => setActiveTab('home')}
              className="mb-6 text-sm font-black uppercase text-tch-orange hover:underline"
            >
              ← Quay lại
            </button>
            <ProfilePageContent user={user} onUserUpdated={handleUserUpdated} />
          </div>
        ) : activeTab === 'home' ? (
          <>
            <section className="w-full bg-[#7a0909]">
              <div className="mx-auto w-full max-w-[1360px] px-0">
                <img
                  src="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1800&q=80"
                  className="h-[480px] w-full object-cover"
                  alt="Hero"
                />
              </div>
            </section>

            <section className="mx-auto mt-14 w-full max-w-[1200px] px-4 text-center md:px-6">
              <h2 className="text-5xl font-black uppercase tracking-tight text-gray-900">Chuyện Nhà</h2>
              <p className="mx-auto mt-6 max-w-[900px] text-2xl font-semibold leading-relaxed text-gray-800">
                The Avengers House tin rằng nụ cười là hương vị ngọt ngào nhất trong ngày mới. Từ ly cà phê đậm đà đến từng lời chào thân quen, mỗi vị khách đều mang theo một niềm vui nhỏ.
              </p>
              <button className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-black uppercase tracking-wider text-white">Tìm hiểu</button>
            </section>

            <section className="mx-auto mt-16 w-full max-w-[1240px] px-4 md:px-6">
              <div className="rounded-[32px] bg-[#f3f0e5] px-6 py-10 md:px-10">
                <h3 className="text-center text-5xl font-black uppercase tracking-tight text-[#df6f37]">Sản phẩm nổi bật</h3>
                <div className="mt-10 rounded-3xl bg-[#ede8db] p-4">
                  <HorizontalProductCarousel
                    items={featuredCarouselItems}
                    onSelect={(p) => {
                      setActiveTab('order');
                      handleViewDetail(p);
                    }}
                    cardClassName="tch-carousel-card text-left"
                    imageClassName="h-44 w-full rounded-2xl object-cover"
                  />
                </div>
              </div>
            </section>

            <section className="mt-16 w-full overflow-hidden bg-[#88a56a]">
              <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 md:grid-cols-2">
                <img
                  src="https://cdn.hstatic.net/files/1000075078/file/rectangle_45.jpg"
                  className="h-[520px] w-full object-cover"
                  alt="Nguon nguyen lieu"
                />
                <div className="flex items-center p-8 text-white md:p-14 lg:p-16">
                  <div>
                    <h3 className="text-3xl font-black uppercase leading-tight md:text-4xl">Chất lượng khởi nguồn từ vùng nguyên liệu tuyển chọn</h3>
                    <p className="mt-6 max-w-[620px] text-lg font-semibold leading-relaxed text-white/95 md:text-xl">
                      Từng búp trà, từng hạt cà phê được chọn lọc kỹ lưỡng để giữ lại hương vị nguyên bản và trải nghiệm trọn vẹn cho mỗi ly đồ uống.
                    </p>
                    <button className="mt-8 text-lg font-black uppercase underline underline-offset-4">Xem thêm</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="mx-auto mt-16 w-full max-w-[1240px] rounded-[32px] bg-[#f3f0e5] px-6 py-12 text-center md:px-10">
              <h3 className="text-6xl font-black tracking-tight">Tìm Nhà gần bạn</h3>
              <p className="mx-auto mt-5 max-w-[700px] text-xl font-semibold text-gray-700">
                Dù bạn ở đâu, Avengers House luôn ở gần. Chọn khu vực để xem cửa hàng thuận tiện nhất.
              </p>
              <div className="mx-auto mt-8 grid max-w-[700px] grid-cols-1 gap-3 md:grid-cols-2">
                <select className="rounded-full border-2 border-[#ef7d40] bg-transparent px-5 py-3 text-base font-bold text-[#ef7d40]">
                  <option>Chọn Thành phố</option>
                </select>
                <select className="rounded-full border-2 border-[#ef7d40] bg-transparent px-5 py-3 text-base font-bold text-[#ef7d40]">
                  <option>Chọn Phường/Xã</option>
                </select>
              </div>
            </section>

            <section className="mx-auto mt-16 mb-12 w-full max-w-[1240px] px-4 md:px-6">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-5xl font-black uppercase text-[#df6f37]">Instagram</h4>
                    <button className="text-lg font-black uppercase underline">Follow ngay</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=500&q=80',
                      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=500&q=80',
                      'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=500&q=80',
                      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80',
                      'https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=500&q=80',
                      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=500&q=80',
                    ].map((img, idx) => (
                      <img key={idx} src={img} alt="social" className="h-40 w-full rounded-2xl object-cover" />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-5xl font-black uppercase text-[#df6f37]">News</h4>
                    <button
                      type="button"
                      onClick={() => setActiveTab('news')}
                      className="text-lg font-black uppercase underline"
                    >
                      Xem thêm
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('news')}
                    className="block w-full rounded-[28px] bg-white p-4 text-left shadow-sm"
                  >
                    <img
                      src={homeNewsPreview?.image || 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1000&q=80'}
                      className="h-80 w-full rounded-2xl object-cover"
                      alt="News"
                    />
                    <p className="mt-4 text-sm font-black uppercase text-[#df6f37]">
                      {homeNewsPreview?.category || 'Coffeeholic'}
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">
                      {homeNewsPreview?.title || 'Khám phá các bài viết mới nhất từ The Avengers House'}
                    </p>
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : activeTab === 'news' ? selectedNewsArticleId ? (
          <NewsDetailPage
            selectedArticleId={selectedNewsArticleId}
            onBack={() => {
              setSelectedNewsArticleId(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <>
            <section className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f3e8bb] to-[#fbf7ea]">
              <div className="mx-auto max-w-[1240px] px-4 py-16 text-center md:px-6 md:py-20">
                <p className="text-[12px] font-black uppercase tracking-[0.4em] text-[#d67b3c]">Editorial</p>
                <h1 className="mt-5 text-[52px] font-black tracking-tight text-[#161616] md:text-[78px]" style={{ fontFamily: 'Georgia, serif' }}>
                  {selectedNewsCategoryLabel}
                </h1>
                <p className="mx-auto mt-6 max-w-[760px] text-lg font-semibold leading-relaxed text-[#3d362f] md:text-[21px]">
                  Nơi những câu chuyện xoay quanh hạt cà phê, ly trà và nhịp sống thường ngày được kể lại theo cách gần gũi, giàu cảm xúc và rất The Avengers House.
                </p>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                  {newsCategoryOptions.map((option) => {
                    const active = newsCategory === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setNewsCategory(option.id)}
                        className={`rounded-full border px-7 py-3 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                          active
                            ? 'border-[#e67a3a] bg-[#e67a3a] text-white shadow-lg shadow-orange-200'
                            : 'border-[#e7b48d] bg-white/70 text-[#d67b3c] hover:border-[#d67b3c]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-[1240px] px-4 py-10 md:px-6 md:py-14">
              {isNewsLoading ? (
                <div className="rounded-[28px] border border-[#ecd4bc] bg-white p-8 text-center text-lg font-semibold text-[#6f6258]">
                  Đang tải danh sách tin tức...
                </div>
              ) : featuredNewsArticle ? (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNewsArticleId(featuredNewsArticle.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="overflow-hidden rounded-[30px] bg-[#f7f0df] text-left shadow-sm shadow-orange-100"
                  >
                    <img
                      src={featuredNewsArticle.image}
                      alt={featuredNewsArticle.title}
                      className="h-[340px] w-full object-cover md:h-[470px]"
                    />
                    <div className="p-6 md:p-8">
                      <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#d67b3c]">
                        <span>{featuredNewsArticle.category}</span>
                        <span className="text-[#9d968f]">{featuredNewsArticle.date}</span>
                      </div>
                      <h2 className="mt-5 max-w-[18ch] text-3xl font-black uppercase leading-tight text-[#171717] md:text-5xl">
                        {featuredNewsArticle.title}
                      </h2>
                      <p className="mt-5 max-w-[52ch] text-lg font-semibold leading-relaxed text-[#433d38]">
                        {featuredNewsArticle.excerpt}
                      </p>
                    </div>
                  </button>

                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
                    {secondaryNewsArticles.slice(0, 2).map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => {
                          setSelectedNewsArticleId(article.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="overflow-hidden rounded-[28px] bg-[#f7f0df] text-left shadow-sm shadow-orange-100"
                      >
                        <img src={article.image} alt={article.title} className="h-[220px] w-full object-cover" />
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#d67b3c]">
                            <span>{article.category}</span>
                            <span className="text-[#9d968f]">{article.date}</span>
                          </div>
                          <h3 className="mt-4 text-2xl font-black uppercase leading-tight text-[#171717]">{article.title}</h3>
                          <p className="mt-3 text-base font-semibold leading-relaxed text-[#433d38]">{article.excerpt}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[28px] border border-[#ecd4bc] bg-white p-8 text-center text-lg font-semibold text-[#6f6258]">
                  Chưa có bài viết nào trong danh mục này.
                </div>
              )}

              <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {secondaryNewsArticles.slice(2).map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => {
                      setSelectedNewsArticleId(article.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="overflow-hidden rounded-[28px] bg-[#f7f0df] text-left shadow-sm shadow-orange-100 transition-transform hover:-translate-y-1"
                  >
                    <img src={article.image} alt={article.title} className="h-[250px] w-full object-cover" />
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#d67b3c]">
                        <span>{article.category}</span>
                        <span className="text-[#9d968f]">{article.date}</span>
                      </div>
                      <h3 className="mt-4 text-[28px] font-black uppercase leading-tight text-[#171717]">{article.title}</h3>
                      <p className="mt-3 text-base font-semibold leading-relaxed text-[#433d38]">{article.excerpt}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : activeTab === 'stores' ? (
          <>
            <section className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f3e8bb] to-[#fbf7ea]">
              <div className="mx-auto max-w-[1240px] px-4 py-14 text-center md:px-6 md:py-16">
                <h1 className="mx-auto max-w-[18ch] text-4xl font-black uppercase leading-tight text-[#161616] md:text-6xl">
                  Khám phá {filteredStores.length} cửa hàng của chúng tôi ở {storeCity}
                </h1>
                {isStoresLoading ? <p className="mt-5 text-base font-semibold text-[#6f6258]">Đang tải danh sách chi nhánh...</p> : null}
                {isStoresError ? <p className="mt-5 text-base font-semibold text-[#b45309]">{storesError?.response?.data?.message || storesError?.message || 'Không tải được danh sách chi nhánh.'}</p> : null}

                <div className="mx-auto mt-10 grid max-w-[760px] gap-4 md:grid-cols-2">
                  <select
                    value={storeCity}
                    onChange={(e) => {
                      setStoreCity(e.target.value);
                      setStoreDistrict('ALL');
                    }}
                    className="h-[56px] rounded-full border border-[#ef8e55] bg-white/70 px-6 text-lg font-semibold text-[#e67a3a] outline-none focus:border-[#d96c28]"
                  >
                    {storeCities.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>

                  <select
                    value={storeDistrict}
                    onChange={(e) => setStoreDistrict(e.target.value)}
                    className="h-[56px] rounded-full border border-[#ef8e55] bg-white/70 px-6 text-lg font-semibold text-[#e67a3a] outline-none focus:border-[#d96c28]"
                  >
                    <option value="ALL">Chọn Phường/Xã (Sau sáp nhập)</option>
                    {storeDistricts.map((district) => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="bg-[#f5f5f3] py-10 md:py-14">
              <div className="mx-auto max-w-[1240px] px-4 md:px-6">
                {selectedStore ? (
                  <section className="mb-10 grid gap-6 rounded-[28px] border border-[#e9d2bd] bg-white p-5 md:grid-cols-2 md:p-6">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d67b3c]">Chi nhánh đang chọn</p>
                      <h3 className="mt-3 text-3xl font-black tracking-tight text-black">{selectedStore.name}</h3>
                      <p className="mt-4 text-base font-semibold leading-relaxed text-[#2f2f2f]">{selectedStore.address}</p>
                      <p className="mt-2 text-sm font-black uppercase tracking-wide text-[#e67a3a]">Giờ mở cửa: {selectedStore.hours}</p>
                      <a
                        href={selectedStore.mapUrl || buildMapSearchUrl(selectedStore.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-6 inline-flex rounded-full bg-[#e67a3a] px-6 py-3 text-sm font-black uppercase tracking-wide text-white"
                      >
                        Mở trên Google Maps
                      </a>
                    </div>
                    <iframe
                      title={`Bản đồ ${selectedStore.name}`}
                      src={buildMapEmbedUrl(selectedStore.address)}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="h-[320px] w-full rounded-2xl border border-[#eed8c3]"
                    />
                  </section>
                ) : null}

                <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
                  {filteredStores.map((store) => (
                    <article
                      key={store.id}
                      className={`group rounded-[24px] p-3 transition-colors ${selectedStore?.id === store.id ? 'bg-[#fff2e8]' : 'bg-transparent'}`}
                    >
                      <img
                        src={store.image}
                        alt={store.name}
                        className="h-[260px] w-full rounded-[24px] object-cover shadow-sm transition-transform duration-300 group-hover:-translate-y-1"
                      />
                      <h3 className="mt-6 text-[26px] font-black tracking-tight text-black">{store.name}</h3>
                      <div className="mt-4 flex items-start gap-3 text-[15px] font-semibold leading-relaxed text-[#232323]">
                        <span className="mt-1 text-[#ef7d40]">📍</span>
                        <span>{store.address}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-[15px] font-semibold text-[#232323]">
                        <span className="text-[#ef7d40]">🕒</span>
                        <span>{store.hours}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStoreId(store.id);
                          window.open(store.mapUrl || buildMapSearchUrl(store.address), '_blank', 'noopener,noreferrer');
                        }}
                        className="mt-6 rounded-full bg-black px-7 py-3 text-lg font-black text-white transition-transform hover:scale-[1.02]"
                      >
                        Xem bản đồ
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : activeTab === 'contact' ? (
          <>
            <section className="relative overflow-hidden border-b border-[#ece3cc] bg-[#efe0a5]">
              <img
                src={CONTACT_INFO.heroImage}
                alt="Liên hệ"
                className="h-[260px] w-full object-cover opacity-45 md:h-[340px]"
              />
              <div className="absolute inset-0 bg-[#efe0a5]/65" />
              <div className="absolute inset-x-0 top-1/2 mx-auto w-full max-w-[1240px] -translate-y-1/2 px-4 md:px-6">
                <h1 className="text-5xl font-black uppercase tracking-tight text-black md:text-6xl">Liên hệ</h1>
              </div>
            </section>

            <section className="bg-[#f5f5f3] py-12 md:py-16">
              <div className="mx-auto grid max-w-[1240px] gap-8 px-4 md:px-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tight text-black md:text-5xl">The Avengers House</h2>
                  <div className="mt-10 space-y-8 text-lg font-semibold leading-relaxed text-[#262626]">
                    <p>
                      <span className="font-black text-[#e67a3a]">VPGD:</span> {CONTACT_INFO.office}
                    </p>
                    <p>
                      <span className="font-black text-[#e67a3a]">Đặt hàng:</span> {CONTACT_INFO.hotline}
                      <br />
                      <span className="font-black text-[#e67a3a]">Email:</span> {CONTACT_INFO.email}
                    </p>
                  </div>

                  <div className="mt-8 flex items-center justify-center lg:justify-start">
                    <div className="rounded-full bg-[#d77457] px-5 py-4 text-center text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-orange-200">
                      Avengers House
                    </div>
                  </div>

                  <img
                    src={CONTACT_INFO.storeImage}
                    alt="Storefront"
                    className="mt-8 h-[420px] w-full rounded-[28px] object-cover shadow-sm shadow-gray-300"
                  />
                </div>

                <form onSubmit={handleSubmitContact} className="space-y-4 lg:pt-6">
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Tên của bạn"
                    className="h-[64px] w-full rounded-full border border-[#bfbfbf] bg-transparent px-8 text-lg font-semibold text-[#404040] outline-none transition-colors placeholder:text-[#777] focus:border-[#e67a3a]"
                  />
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Email của bạn"
                    className="h-[64px] w-full rounded-full border border-[#bfbfbf] bg-transparent px-8 text-lg font-semibold text-[#404040] outline-none transition-colors placeholder:text-[#777] focus:border-[#e67a3a]"
                  />
                  <input
                    type="text"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Số điện thoại của bạn"
                    className="h-[64px] w-full rounded-full border border-[#bfbfbf] bg-transparent px-8 text-lg font-semibold text-[#404040] outline-none transition-colors placeholder:text-[#777] focus:border-[#e67a3a]"
                  />
                  <textarea
                    required
                    rows={8}
                    value={contactForm.message}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Nội dung"
                    className="w-full rounded-[32px] border border-[#bfbfbf] bg-transparent px-8 py-6 text-lg font-semibold text-[#404040] outline-none transition-colors placeholder:text-[#777] focus:border-[#e67a3a]"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#e67a3a] px-10 py-4 text-2xl font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 transition-transform hover:scale-[1.02]"
                  >
                    Gửi
                  </button>
                </form>
              </div>
            </section>
          </>
        ) : activeTab === 'vouchers' ? (
          <>
            <section className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f7e4cf] via-[#fff8ee] to-[#fffcf5]">
              <div className="mx-auto max-w-[1240px] px-4 py-14 md:px-6 md:py-16">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d67b3c]">Voucher Center</p>
                <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-[#1f1f1f] md:text-6xl">
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
                        className={`rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${
                          active
                            ? 'border-[#e67a3a] bg-[#e67a3a] text-white shadow-md shadow-orange-200'
                            : 'border-[#efc8a9] bg-white text-[#d67b3c] hover:border-[#d67b3c]'
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
                    <div key={item} className="h-56 animate-pulse rounded-[28px] bg-orange-100/70"></div>
                  ))}
                </div>
              ) : isVoucherError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {voucherError?.response?.data?.message || 'Không thể tải danh sách voucher lúc này.'}
                </div>
              ) : filteredVoucherItems.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-[#efc9a8] bg-[#fff7ef] px-6 py-12 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#d67b3c]">Chưa có voucher phù hợp</p>
                  <p className="mt-2 text-sm font-semibold text-[#6e6259]">Thử đổi bộ lọc hoặc quay lại sau để cập nhật ưu đãi mới nhất.</p>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredVoucherItems.map((voucher) => {
                    const typeMeta = getVoucherTypeMeta(voucher.loai_khuyen_mai);
                    const hasLimit = voucher.con_lai !== null && voucher.con_lai !== undefined;
                    const remaining = hasLimit ? Number(voucher.con_lai || 0) : null;
                    const isOut = hasLimit && remaining <= 0;
                    const canUse = voucher.co_the_dung !== false;
                    return (
                      <article key={voucher.ma_khuyen_mai} className="overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-sm shadow-orange-100/70">
                        <div className="bg-gradient-to-r from-[#f6dcc7] via-[#fff2e5] to-[#f6dcc7] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => handleCopyVoucherCode(voucher.ma_khuyen_mai)}
                              className="rounded-xl border border-[#e79a67] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#cd6a2a]"
                              title="Sao chép mã"
                            >
                              {voucher.ma_khuyen_mai}
                            </button>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                          </div>
                          {copiedVoucherCode === voucher.ma_khuyen_mai ? (
                            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Đã sao chép mã</p>
                          ) : null}
                        </div>

                        <div className="p-5">
                          <h3 className="text-xl font-black uppercase leading-tight text-[#1f1f1f]">{voucher.ten_khuyen_mai || 'Voucher ưu đãi'}</h3>
                          <p className="mt-2 text-base font-black text-[#d0672a]">{formatVoucherValue(voucher)}</p>
                          <p className="mt-2 min-h-[44px] text-sm font-semibold leading-relaxed text-[#5b524b]">
                            {voucher.mo_ta || 'Áp dụng cho đơn hàng hợp lệ theo điều kiện của chương trình.'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-[#5d544d]">
                            <div className="rounded-xl bg-[#fff5eb] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c98754]">Đơn tối thiểu</p>
                              <p className="mt-1 text-sm font-black text-[#3f3731]">{Number(voucher.gia_tri_don_toi_thieu || 0).toLocaleString('vi-VN')}d</p>
                            </div>
                            <div className="rounded-xl bg-[#fff5eb] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c98754]">Còn lại</p>
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
                                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  canUse ? 'bg-[#eef7ff] text-[#1f6fb2]' : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {canUse ? 'Bạn có thể dùng' : 'Bạn đã đạt giới hạn'}
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
        ) : (
          <>
            {/* Banner */}
            <div className="mx-auto mt-6 w-full max-w-[1280px] px-4 md:px-6">
              <div className="overflow-hidden rounded-[30px] border border-[#efe9e0] shadow-sm">
                <img
                  src="https://minio.thecoffeehouse.com/content/pwa/static/img/home-banner.png"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_BANNER_URL;
                  }}
                  className="h-[420px] w-full object-cover"
                  alt="Banner"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="mx-auto mt-12 w-full max-w-[1240px] px-4 md:px-6">
              <div ref={topTabsScrollRef} className="relative overflow-x-auto no-scrollbar pb-5">
                <div ref={topTabsTrackRef} className="relative mx-auto flex w-max min-w-full justify-center gap-8 px-2">
                  {menuSections.map((section) => (
                    <button
                      key={section.id}
                      ref={(element) => {
                        if (element) {
                          topTabRefs.current[section.id] = element;
                        }
                      }}
                      type="button"
                      onClick={() => {
                        if (section.id === 'must-try') {
                          setSelectedCatId('all');
                        } else {
                          setSelectedCatId(section.id);
                        }
                        setActiveMainSectionId(section.id);
                        if (section.subSections[0]) {
                          setActiveSubSectionId(section.subSections[0].id);
                        }
                        scrollToSection(section.id);
                      }}
                      className="group relative flex min-w-[96px] flex-col items-center pb-2 transition-all"
                    >
                      <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-[24px] text-2xl transition-all ${
                        activeMainSectionId === section.id ? 'bg-tch-orange shadow-lg border-none' : 'bg-white border border-gray-200 shadow-sm'
                      }`}>
                        {section.icon || ICON_MAP.default}
                      </div>
                      <span className={`text-[13px] font-extrabold uppercase tracking-[0.08em] ${activeMainSectionId === section.id ? 'text-[#111111]' : 'text-gray-500'}`}>
                        {section.label}
                      </span>
                    </button>
                  ))}

                  <span
                    className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-tch-orange transition-all duration-300"
                    style={{
                      width: `${activeTabUnderlineStyle.width}px`,
                      transform: `translateX(${activeTabUnderlineStyle.left}px)`,
                      opacity: activeTabUnderlineStyle.opacity,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Layout chính */}
            <div className="mx-auto mt-16 flex w-full max-w-[1280px] flex-col gap-12 px-4 pb-20 md:flex-row md:px-6">
              <aside className="w-full md:w-64 flex-shrink-0">
                <div className="sticky top-28">
                  <h2 className="text-tch-orange font-black text-2xl uppercase italic mb-8 border-l-8 border-tch-orange pl-4">
                    {activeMainSection?.label || 'Thực đơn'}
                  </h2>
                  <ul className="space-y-5">
                    {(activeMainSection?.subSections || []).map((subSection) => (
                      <li key={subSection.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubSectionId(subSection.id);
                            scrollToSubSection(subSection.id);
                          }}
                          className={`w-full text-left text-[16px] font-extrabold uppercase transition-colors ${
                            activeSubSectionId === subSection.id ? 'text-tch-orange' : 'text-gray-700'
                          }`}
                        >
                          {subSection.label}
                          <span className="ml-2 text-[11px] font-black text-gray-400">{subSection.items.length}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

              <div className="flex-1">
                {orderCarouselItems.length > 0 ? (
                  <section className="mb-10 border-b border-[#eee7df] pb-8">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d67b3c]">House selection</p>
                      <span className="rounded-full border border-[#eddcc8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#cb6b2f]">Thanh kéo trái/phải</span>
                    </div>
                    <HorizontalProductCarousel
                      items={orderCarouselItems}
                      onSelect={(p) => handleViewDetail(p)}
                      cardClassName="tch-carousel-mini-card"
                      imageClassName="h-20 w-20 rounded-xl object-cover"
                      compact
                    />
                  </section>
                ) : null}

                <section className="mb-12 border-y border-[#efe8df] bg-white py-7">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">Smart recommendation</p>
                        <h3 className="text-xl font-black uppercase tracking-tight text-gray-800">
                          {userId ? 'Top 3 món hợp gu của bạn' : 'Top 3 món phổ biến'}
                        </h3>
                        <p className="text-xs text-gray-600">
                          {aiRecsData?.is_personalized
                            ? 'Cá nhân hóa theo lịch sử mua hàng, đánh giá, yêu thích và xu hướng dùng ưu đãi.'
                            : userId
                              ? 'Chưa đủ lịch sử, hiển thị các món phổ biến.'
                              : 'Đang xem gợi ý cho khách vãng lai, dựa trên độ phổ biến toàn hệ thống.'}
                        </p>
                      </div>
                      <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wider text-orange-600">
                        {aiRecsData?.is_personalized ? 'AI Personal' : 'AI Popular'}
                      </span>
                    </div>

                    {isAiRecsLoading ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((k) => <div key={k} className="h-72 animate-pulse rounded-3xl bg-white/70" />)}
                      </div>
                    ) : aiRecommendedProducts.length > 0 ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
                        {aiRecommendedProducts.map((p) => (
                          <ProductCard
                            key={`ai-${p.ma_san_pham}`}
                            product={p}
                            onView={() => handleViewDetail(p)}
                            onQuickAdd={() => handleQuickAdd(p)}
                            isFavorite={isFavoriteProduct(p)}
                            onToggleFavorite={() => handleToggleFavorite(p)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-gray-500">Chưa có đề xuất AI lúc này.</p>
                    )}
                  </section>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="bg-gray-200 h-80 rounded-3xl animate-pulse"></div>)}
                  </div>
                ) : hasMenuError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-600">
                    Không thể tải menu lúc này. Vui lòng thử lại sau.
                  </div>
                ) : (
                  <div className="space-y-14">
                    {menuSections.map((section) => (
                      <section
                        key={section.id}
                        ref={(element) => {
                          if (element) {
                            categorySectionRefs.current[section.id] = element;
                          }
                        }}
                        className="scroll-mt-32"
                      >
                        <h2 className="mb-7 text-[36px] font-black uppercase tracking-tight text-[#111111]">
                          {section.label}
                        </h2>

                        <div className="space-y-12">
                          {section.subSections.map((subSection) => (
                            <div
                              key={subSection.id}
                              ref={(element) => {
                                if (element) {
                                  subSectionRefs.current[subSection.id] = element;
                                }
                              }}
                              className="scroll-mt-32"
                            >
                              <h3 className="mb-6 text-[28px] font-black uppercase tracking-tight text-[#111111]">
                                {subSection.label}
                              </h3>

                              <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-3">
                                {subSection.items.map((p) => (
                                  <ProductCard
                                    key={`${subSection.id}-${p.ma_san_pham}`}
                                    product={p}
                                    onView={() => handleViewDetail(p)}
                                    onQuickAdd={() => handleQuickAdd(p)}
                                    isFavorite={isFavoriteProduct(p)}
                                    onToggleFavorite={() => handleToggleFavorite(p)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        user={user}
      />

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
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
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={handleLoginSuccess} />
      <Footer />
  <ChatWidget user={user} socketUrl={socketUrl} />

      {notificationToast ? (
        <div className="fixed bottom-6 right-6 z-[150] w-[92vw] max-w-sm rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-2xl shadow-orange-100 backdrop-blur">
          <p className="text-[11px] font-black uppercase tracking-widest text-tch-orange">Thông báo mới</p>
          <p className="mt-1 text-sm font-black text-gray-800">{notificationToast.title}</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">{notificationToast.message}</p>
          {notificationToast.branchName ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">Cơ sở xử lý: {notificationToast.branchName}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}