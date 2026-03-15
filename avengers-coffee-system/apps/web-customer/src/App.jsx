import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import Header from './components/Header';
import Footer from './components/Footer';
import ProductCard from './components/ProductCard';
import AuthModal from './components/AuthModal';
import ProductDetailModal from './components/ProductDetailModal';
import CartDrawer from './components/CartDrawer'; // File mới bước 2
import OrderHistoryModal from './components/OrderHistoryModal';
import ChatWidget from './components/ChatWidget';
import { CartProvider, useCart } from './context/CartContext'; // File mới bước 2
import { apiClient } from './lib/apiClient';
import { queryKeys } from './lib/queryKeys';
import { UserCircleIcon, KeyIcon, MapPinIcon } from '@heroicons/react/24/outline';

const FALLBACK_BANNER_URL = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=80';

const ICON_MAP = {
  'Cà phê': '☕',
  Trà: '🍃',
  'Đồ ăn': '🍕',
  Bánh: '🍰',
  Khác: '✨',
  default: '🥤',
};

const NEWS_CATEGORY_OPTIONS = [
  { id: 'COFFEEHOLIC', label: 'Coffeeholic' },
  { id: 'TEAHOLIC', label: 'Teaholic' },
  { id: 'BLOG', label: 'Blog' },
];

const NEWS_ARTICLES = [
  {
    id: 1,
    category: 'COFFEEHOLIC',
    title: 'Bắt gặp Sài Gòn xưa trong món uống hiện đại của giới trẻ',
    excerpt: 'Dấu ấn Sài Gòn xưa được kể lại qua ly cà phê sữa đá, không gian phố cũ và những thói quen rất riêng của người trẻ hôm nay.',
    date: '01.11.2023',
    image: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
    featured: true,
  },
  {
    id: 2,
    category: 'COFFEEHOLIC',
    title: 'Uống gì khi tới Signature by The Avengers House?',
    excerpt: 'Một danh sách gợi ý những món uống đậm vị, phù hợp để bắt đầu trải nghiệm tại không gian signature mới.',
    date: '09.02.2023',
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 3,
    category: 'COFFEEHOLIC',
    title: 'Cà phê sữa Espresso và cách bật lon bật vị mỗi ngày',
    excerpt: 'Một lựa chọn tiện lợi nhưng vẫn đủ đậm đà cho những ngày bận rộn và cần thêm chút năng lượng tích cực.',
    date: '09.02.2023',
    image: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 4,
    category: 'COFFEEHOLIC',
    title: 'Cách nhận biết hương vị cà phê Robusta nguyên chất dễ dàng nhất',
    excerpt: 'Từ hậu vị, độ đậm đến hương rang, bài viết giúp bạn phân biệt Robusta nguyên chất theo cách dễ hiểu và gần gũi.',
    date: '20.09.2022',
    image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 5,
    category: 'COFFEEHOLIC',
    title: 'Bật mí nhiệt độ lý tưởng để pha cà phê ngon, đậm đà hương vị',
    excerpt: 'Nhiệt độ nước ảnh hưởng trực tiếp đến độ cân bằng của ly cà phê. Đây là các mốc nhiệt bạn nên nhớ.',
    date: '07.03.2022',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 6,
    category: 'TEAHOLIC',
    title: 'Trà trái cây và câu chuyện của những buổi chiều nhẹ tênh',
    excerpt: 'Vị trà thanh, lớp trái cây mọng và chút đá lạnh tạo nên một nhịp nghỉ vừa đủ trong ngày dài bận rộn.',
    date: '14.06.2023',
    image: 'https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=1000&q=80',
    featured: true,
  },
  {
    id: 7,
    category: 'TEAHOLIC',
    title: 'Vì sao trà ô long luôn giữ được hậu vị sạch và thơm?',
    excerpt: 'Từ kỹ thuật sấy đến cách ủ, mỗi công đoạn đều góp phần tạo nên một ly trà có chiều sâu và hậu ngọt rõ rệt.',
    date: '19.04.2023',
    image: 'https://images.unsplash.com/photo-1523920290228-4f321a939b4c?auto=format&fit=crop&w=1000&q=80',
  },
  {
    id: 8,
    category: 'BLOG',
    title: 'Một ngày ở nhà rang xay: hành trình từ hạt tới ly',
    excerpt: 'Khám phá nhịp làm việc phía sau quầy bar, nơi từng mẻ rang và từng công thức được chỉnh sửa kỹ lưỡng mỗi ngày.',
    date: '25.08.2023',
    image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1000&q=80',
    featured: true,
  },
  {
    id: 9,
    category: 'BLOG',
    title: 'Không gian quán và cách một mùi hương có thể giữ chân khách hàng',
    excerpt: 'Ánh sáng, mùi bánh nướng và tiếng máy pha tạo nên cảm xúc đặc biệt khiến một quán cà phê đáng nhớ hơn.',
    date: '11.05.2023',
    image: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1000&q=80',
  },
];

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
    'Quận 1': ['Phường Sài Gòn'],
    'Quận 7': ['Tân Phú'],
  },
};

const DEFAULT_ADDRESS_FORM = {
  tenDiaChi: '',
  city: 'Thành phố Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Sài Gòn',
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
  if (!value) return 'Khong gioi han';
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
      ward: 'Phường Sài Gòn',
      street: '',
    };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const city = parts[parts.length - 1] || 'Thành phố Hồ Chí Minh';
  const district = parts[parts.length - 2] || 'Quận 1';
  const ward = parts[parts.length - 3] || 'Phường Sài Gòn';
  const street = parts.slice(0, Math.max(parts.length - 3, 0)).join(', ');

  return { city, district, ward, street: street || raw };
}

const STORE_LOCATIONS = [
  {
    id: 1,
    city: 'Hồ Chí Minh',
    district: 'Phường Sài Gòn',
    name: 'HCM Mạc Đĩnh Chi',
    address: '28 Ter B Mạc Đĩnh Chi, Phường Sài Gòn, Thành phố Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 2,
    city: 'Hồ Chí Minh',
    district: 'Tân Phú',
    name: 'HCM The Grace Tower',
    address: '71 Hoàng Văn Thái, Tân Phú, Quận 7, Thành phố Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 3,
    city: 'Hồ Chí Minh',
    district: 'Tân Phú',
    name: 'HCM Signature by The Avengers House',
    address: 'TTTM Crescent Mall, 101 Tôn Dật Tiên, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 4,
    city: 'Hồ Chí Minh',
    district: 'Tân Bình',
    name: 'HCM Hoàng Việt',
    address: '17 Út Tịch, Quận Tân Bình, Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 5,
    city: 'Hồ Chí Minh',
    district: 'Quận 11',
    name: 'HCM Lữ Gia',
    address: '64A Lữ Gia, Phường 15, Quận 11, Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 6,
    city: 'Hồ Chí Minh',
    district: 'Tân Bình',
    name: 'HCM Ấp Bắc',
    address: '4 - 6 Ấp Bắc, Quận Tân Bình, Hồ Chí Minh',
    hours: '07:00 - 21:30',
    image: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 7,
    city: 'Hồ Chí Minh',
    district: 'Quận 6',
    name: 'HCM Bình Phú',
    address: '111-113-115 Bình Phú, Quận 6, Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 8,
    city: 'Hồ Chí Minh',
    district: 'Bình Thạnh',
    name: 'HCM Phan Văn Trị 3',
    address: '190 Phan Văn Trị, Phường 11, Bình Thạnh, Thành phố Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 9,
    city: 'Hồ Chí Minh',
    district: 'Quận 2',
    name: 'HCM Homyland Q2',
    address: 'SH2, Tầng 1 Dự Án Chung cư cao cấp Homyland Riverside, Quận 2, Hồ Chí Minh',
    hours: '07:00 - 22:00',
    image: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=1200&q=80',
  },
];

export default function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [newsCategory, setNewsCategory] = useState('COFFEEHOLIC');
  const [storeCity, setStoreCity] = useState('Hồ Chí Minh');
  const [storeDistrict, setStoreDistrict] = useState('ALL');
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '' });

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState(null);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false); // Quản lý đóng mở Giỏ hàng
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [priceFilter, setPriceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DEFAULT');
  const [notificationToast, setNotificationToast] = useState(null);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('ALL');
  const [copiedVoucherCode, setCopiedVoucherCode] = useState('');
  const queryClient = useQueryClient();
  const { addToCart, cartCount, syncCartWithUser } = useCart();
  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';

  // ── AI Recommendations ──────────────────────────────────────────────────────
  const {
    data: aiRecsData,
    isLoading: isAiRecsLoading,
  } = useQuery({
    queryKey: ['ai', 'recommend', userId],
    queryFn: async () => {
      const res = await apiClient.get(`/ai/recommend/${encodeURIComponent(userId)}?limit=6`);
      return res.data;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    retry: 0,
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
      return response.data || [];
    },
    staleTime: 60 * 1000,
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
  });

  const voucherItems = voucherPayload?.items || [];
  const filteredVoucherItems = useMemo(() => {
    if (voucherTypeFilter === 'ALL') return voucherItems;
    return voucherItems.filter((item) => String(item.loai_khuyen_mai || '').toUpperCase() === voucherTypeFilter);
  }, [voucherItems, voucherTypeFilter]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    const params = new URLSearchParams(window.location.search);
    const paymentProvider = params.get('payment_provider');
    const paymentStatus = params.get('payment_status');
    if (paymentProvider === 'VNPAY' && paymentStatus) {
      if (paymentStatus === 'success') {
        alert('Thanh toan VNPAY thanh cong. Don hang da duoc cap nhat!');
      } else {
        alert('Thanh toan VNPAY that bai hoac bi huy.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLoginSuccess = async (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    await syncCartWithUser(userData);
  };

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    await syncCartWithUser(null);
    alert('Hẹn gặp lại bác tại Avengers House nhé! ☕');
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
        return tenSanPham.includes(keyword) || tenDanhMuc.includes(keyword) || moTaSanPham.includes(keyword);
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
  }, [products, selectedCatId, searchKeyword, availabilityFilter, priceFilter, sortBy]);

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
    });
  }, [aiRecsData, products]);

  const xoaBoLocTimKiem = () => {
    setSearchKeyword('');
    setAvailabilityFilter('ALL');
    setPriceFilter('ALL');
    setSortBy('DEFAULT');
    setSelectedCatId('all');
  };

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
      alert('Khong the sao chep ma, vui long thu lai.');
    }
  };

  const filteredNewsArticles = useMemo(
    () => NEWS_ARTICLES.filter((article) => article.category === newsCategory),
    [newsCategory],
  );

  const featuredNewsArticle = filteredNewsArticles.find((article) => article.featured) || filteredNewsArticles[0] || null;
  const secondaryNewsArticles = featuredNewsArticle
    ? filteredNewsArticles.filter((article) => article.id !== featuredNewsArticle.id)
    : filteredNewsArticles;

  const storeCities = useMemo(() => [...new Set(STORE_LOCATIONS.map((store) => store.city))], []);
  const storeDistricts = useMemo(() => {
    const list = STORE_LOCATIONS.filter((store) => store.city === storeCity).map((store) => store.district);
    return [...new Set(list)];
  }, [storeCity]);
  const filteredStores = useMemo(
    () => STORE_LOCATIONS.filter((store) => store.city === storeCity && (storeDistrict === 'ALL' || store.district === storeDistrict)),
    [storeCity, storeDistrict],
  );

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
        : (ADDRESS_OPTIONS[normalizedCity]?.[normalizedDistrict] || [])[0] || 'Phường Sài Gòn';

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

  const featuredProducts = useMemo(() => products.slice(0, 4), [products]);
  return (
    <div className="min-h-screen flex flex-col bg-[#fffcf5]">
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
        sortBy={sortBy}
        onSortByChange={setSortBy}
        filteredCount={filteredProducts.length}
        onResetSearchFilters={xoaBoLocTimKiem}
        onOpenAccount={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)} // BƯỚC 3: Mở Drawer Giỏ hàng
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
                <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4">
                  {featuredProducts.map((p) => (
                    <button
                      key={p.ma_san_pham}
                      onClick={() => {
                        setActiveTab('order');
                        handleViewDetail(p);
                      }}
                      className="text-left"
                    >
                      <div className="rounded-[26px] bg-white p-4 shadow-sm">
                        <img src={p.hinh_anh_url} alt={p.ten_san_pham} className="h-44 w-full rounded-2xl object-cover" />
                        <p className="mt-4 text-lg font-black text-gray-900">{p.ten_san_pham}</p>
                        <p className="mt-2 text-xl font-black text-[#df6f37]">{Number(p.gia_ban).toLocaleString('vi-VN')} đ</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="mx-auto mt-16 grid w-full max-w-[1240px] grid-cols-1 overflow-hidden rounded-[32px] bg-[#88a56a] md:grid-cols-2">
              <img
                src="https://images.unsplash.com/photo-1594631661960-7e4f8b4d2d14?auto=format&fit=crop&w=1200&q=80"
                className="h-[440px] w-full object-cover"
                alt="Nguon nguyen lieu"
              />
              <div className="p-10 text-white md:p-14">
                <h3 className="text-6xl font-black uppercase leading-tight">Chất lượng khởi nguồn từ vùng nguyên liệu tuyển chọn</h3>
                <p className="mt-6 text-lg font-semibold leading-relaxed text-white/95">
                  Từng búp trà, từng hạt cà phê được chọn lọc kỹ lưỡng để giữ lại hương vị nguyên bản và trải nghiệm trọn vẹn cho mỗi ly đồ uống.
                </p>
                <button className="mt-8 text-xl font-black uppercase underline underline-offset-4">Xem thêm</button>
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
                      src="https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1000&q=80"
                      className="h-80 w-full rounded-2xl object-cover"
                      alt="News"
                    />
                    <p className="mt-4 text-sm font-black uppercase text-[#df6f37]">Coffeeholic</p>
                    <p className="mt-2 text-2xl font-black text-gray-900">Bắt gặp Sài Gòn xưa trong món uống hiện đại của giới trẻ</p>
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : activeTab === 'news' ? (
          <>
            <section className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f3e8bb] to-[#fbf7ea]">
              <div className="mx-auto max-w-[1240px] px-4 py-16 text-center md:px-6 md:py-20">
                <p className="text-[12px] font-black uppercase tracking-[0.4em] text-[#d67b3c]">Editorial</p>
                <h1 className="mt-5 text-[52px] font-black tracking-tight text-[#161616] md:text-[78px]" style={{ fontFamily: 'Georgia, serif' }}>
                  Coffeeholic
                </h1>
                <p className="mx-auto mt-6 max-w-[760px] text-lg font-semibold leading-relaxed text-[#3d362f] md:text-[21px]">
                  Nơi những câu chuyện xoay quanh hạt cà phê, ly trà và nhịp sống thường ngày được kể lại theo cách gần gũi, giàu cảm xúc và rất The Avengers House.
                </p>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                  {NEWS_CATEGORY_OPTIONS.map((option) => {
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
              {featuredNewsArticle ? (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <article className="overflow-hidden rounded-[30px] bg-[#f7f0df] shadow-sm shadow-orange-100">
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
                  </article>

                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
                    {secondaryNewsArticles.slice(0, 2).map((article) => (
                      <article key={article.id} className="overflow-hidden rounded-[28px] bg-[#f7f0df] shadow-sm shadow-orange-100">
                        <img src={article.image} alt={article.title} className="h-[220px] w-full object-cover" />
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#d67b3c]">
                            <span>{article.category}</span>
                            <span className="text-[#9d968f]">{article.date}</span>
                          </div>
                          <h3 className="mt-4 text-2xl font-black uppercase leading-tight text-[#171717]">{article.title}</h3>
                          <p className="mt-3 text-base font-semibold leading-relaxed text-[#433d38]">{article.excerpt}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {secondaryNewsArticles.slice(2).map((article) => (
                  <article key={article.id} className="overflow-hidden rounded-[28px] bg-[#f7f0df] shadow-sm shadow-orange-100 transition-transform hover:-translate-y-1">
                    <img src={article.image} alt={article.title} className="h-[250px] w-full object-cover" />
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#d67b3c]">
                        <span>{article.category}</span>
                        <span className="text-[#9d968f]">{article.date}</span>
                      </div>
                      <h3 className="mt-4 text-[28px] font-black uppercase leading-tight text-[#171717]">{article.title}</h3>
                      <p className="mt-3 text-base font-semibold leading-relaxed text-[#433d38]">{article.excerpt}</p>
                    </div>
                  </article>
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
                <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
                  {filteredStores.map((store) => (
                    <article key={store.id} className="group">
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
                  Khuyen mai danh cho ban
                </h1>
                <p className="mt-4 max-w-[780px] text-base font-semibold leading-relaxed text-[#4d433c] md:text-lg">
                  Cap nhat danh sach ma uu dai dang hoat dong. Nhan vao ma de sao chep nhanh va ap dung khi dat hang.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {[
                    { code: 'ALL', label: 'Tat ca' },
                    { code: 'PERCENT', label: 'Giam %' },
                    { code: 'FIXED', label: 'Giam tien' },
                    { code: 'FREE_ITEM', label: 'Tang kem' },
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
                  {voucherError?.response?.data?.message || 'Khong the tai danh sach voucher luc nay.'}
                </div>
              ) : filteredVoucherItems.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-[#efc9a8] bg-[#fff7ef] px-6 py-12 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#d67b3c]">Chua co voucher phu hop</p>
                  <p className="mt-2 text-sm font-semibold text-[#6e6259]">Thu doi bo loc hoac quay lai sau de cap nhat uu dai moi nhat.</p>
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
                              title="Sao chep ma"
                            >
                              {voucher.ma_khuyen_mai}
                            </button>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                          </div>
                          {copiedVoucherCode === voucher.ma_khuyen_mai ? (
                            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Da sao chep ma</p>
                          ) : null}
                        </div>

                        <div className="p-5">
                          <h3 className="text-xl font-black uppercase leading-tight text-[#1f1f1f]">{voucher.ten_khuyen_mai || 'Voucher uu dai'}</h3>
                          <p className="mt-2 text-base font-black text-[#d0672a]">{formatVoucherValue(voucher)}</p>
                          <p className="mt-2 min-h-[44px] text-sm font-semibold leading-relaxed text-[#5b524b]">
                            {voucher.mo_ta || 'Ap dung cho don hang hop le theo dieu kien cua chuong trinh.'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-[#5d544d]">
                            <div className="rounded-xl bg-[#fff5eb] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c98754]">Don toi thieu</p>
                              <p className="mt-1 text-sm font-black text-[#3f3731]">{Number(voucher.gia_tri_don_toi_thieu || 0).toLocaleString('vi-VN')}d</p>
                            </div>
                            <div className="rounded-xl bg-[#fff5eb] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c98754]">Con lai</p>
                              <p className="mt-1 text-sm font-black text-[#3f3731]">{hasLimit ? `${Number(remaining || 0).toLocaleString('vi-VN')} luot` : 'Vo han'}</p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-1.5 text-[12px] font-semibold text-[#5f5650]">
                            <p>Bat dau: {formatVoucherDate(voucher.ngay_bat_dau)}</p>
                            <p>Ket thuc: {formatVoucherDate(voucher.ngay_ket_thuc)}</p>
                            {userId ? <p>Da dung: {Number(voucher.da_dung_boi_ban || 0)} lan</p> : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isOut ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {isOut ? 'Het luot' : 'Con hieu luc'}
                            </span>
                            {userId ? (
                              <span
                                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  canUse ? 'bg-[#eef7ff] text-[#1f6fb2]' : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {canUse ? 'Ban co the dung' : 'Ban da dat gioi han'}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#eef7ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#1f6fb2]">
                                Dang nhap de theo doi luot dung
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
        ) : (
          <>
            {/* Banner */}
            <div className="mx-auto mt-6 w-full max-w-[1240px] px-4 md:px-6">
              <div className="rounded-[40px] overflow-hidden shadow-2xl shadow-orange-100 border-4 border-white">
                <img
                  src="https://minio.thecoffeehouse.com/content/pwa/static/img/home-banner.png"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_BANNER_URL;
                  }}
                  className="w-full h-[400px] object-cover"
                  alt="Banner"
                />
              </div>
            </div>

            {/* Categories */}
            <div className="mx-auto mt-12 w-full max-w-[1240px] px-4 md:px-6">
              <div className="flex justify-center space-x-8 overflow-x-auto pb-4 no-scrollbar">
                <button
                  onClick={() => setSelectedCatId('all')}
                  className="group flex flex-col items-center min-w-[90px]"
                >
                  <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center text-2xl mb-3 transition-all ${
                    selectedCatId === 'all' ? 'bg-tch-orange shadow-lg shadow-orange-200' : 'bg-white border border-gray-100'
                  }`}>
                    ✨
                  </div>
                  <span className={`text-[11px] font-black uppercase tracking-widest ${selectedCatId === 'all' ? 'text-tch-orange' : 'text-gray-400'}`}>
                    Tất cả
                  </span>
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.ma_danh_muc}
                    onClick={() => setSelectedCatId(String(cat.ma_danh_muc))}
                    className="group flex flex-col items-center min-w-[90px] transition-all"
                  >
                    <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center text-2xl mb-3 transition-all ${
                      selectedCatId === String(cat.ma_danh_muc) ? 'bg-tch-orange shadow-lg border-none' : 'bg-white border border-gray-100 shadow-sm'
                    }`}>
                      {ICON_MAP[cat.ten_danh_muc] || ICON_MAP.default}
                    </div>
                    <span className={`text-[11px] font-black uppercase tracking-widest ${selectedCatId === String(cat.ma_danh_muc) ? 'text-tch-orange' : 'text-gray-400'}`}>
                      {cat.ten_danh_muc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layout chính */}
            <div className="mx-auto mt-16 flex w-full max-w-[1240px] flex-col gap-12 px-4 pb-20 md:flex-row md:px-6">
              <aside className="w-full md:w-64 flex-shrink-0">
                <div className="sticky top-28">
                  <h2 className="text-tch-orange font-black text-2xl uppercase italic mb-8 border-l-8 border-tch-orange pl-4">Thực đơn</h2>
                  <ul className="space-y-5">
                    <li>
                      <button onClick={() => setSelectedCatId('all')} className={`text-[14px] font-black uppercase transition-colors ${selectedCatId === 'all' ? 'text-tch-orange' : 'text-gray-500'}`}>
                        Tất cả sản phẩm
                      </button>
                    </li>
                    {categories.map((cat) => (
                      <li key={cat.ma_danh_muc}>
                        <button onClick={() => setSelectedCatId(String(cat.ma_danh_muc))} className={`text-[14px] font-black uppercase text-left transition-colors ${selectedCatId === String(cat.ma_danh_muc) ? 'text-tch-orange' : 'text-gray-500'}`}>
                          {cat.ten_danh_muc}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

              <div className="flex-1">
                {Boolean(userId) && (
                  <section className="mb-12 rounded-3xl border border-orange-100 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">Smart recommendation</p>
                        <h3 className="text-xl font-black uppercase tracking-tight text-gray-800">Gợi ý dành cho bạn</h3>
                        <p className="text-xs text-gray-600">
                          {aiRecsData?.is_personalized ? 'Ca nhan hoa theo lich su mua hang va danh gia.' : 'Chua du lich su, hien thi cac mon pho bien.'}
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
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-gray-500">Chua co de xuat AI luc nay.</p>
                    )}
                  </section>
                )}

                <h2 className="text-3xl font-black text-gray-800 uppercase mb-10 tracking-tighter">
                  {selectedCatId === 'all' ? 'Tất cả sản phẩm' : categories.find((c) => String(c.ma_danh_muc) === selectedCatId)?.ten_danh_muc}
                </h2>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="bg-gray-200 h-80 rounded-3xl animate-pulse"></div>)}
                  </div>
                ) : hasMenuError ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-600">
                    Khong the tai menu luc nay. Vui long thu lai sau.
                  </div>
                ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                  {filteredProducts.map((p) => (
                    <ProductCard
                      key={p.ma_san_pham}
                      product={p}
                      onView={() => handleViewDetail(p)}
                      onQuickAdd={() => handleQuickAdd(p)}
                    />
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
          <p className="text-[11px] font-black uppercase tracking-widest text-tch-orange">Thong bao moi</p>
          <p className="mt-1 text-sm font-black text-gray-800">{notificationToast.title}</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">{notificationToast.message}</p>
          {notificationToast.branchName ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">Co so xu ly: {notificationToast.branchName}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}