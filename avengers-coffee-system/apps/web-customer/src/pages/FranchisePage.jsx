import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import BranchReviewModal from '../components/BranchReviewModal';
import { MagnifyingGlassIcon, XMarkIcon, MapPinIcon, StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`;

const buildMapEmbedUrl = (address) => `https://www.google.com/maps?q=${encodeURIComponent(String(address || ''))}&output=embed`;

const COMPANY_EMAIL = 'ankudo1234@gmail.com';

const PACKAGES = [
  {
    id: 'XE_LUU_DONG',
    name: 'Xe Cà Phê Lưu Động',
    area: 'Xe đẩy hoặc xe máy',
    invest: 'Từ 20 triệu',
    investDetail: 'Trọn gói: 20.000.000 đ',
    royalty: '4% mỗi tháng',
    color: '#b22830',
    gradient: 'linear-gradient(135deg, #fff1f2, #fecdd3)',
    border: '#f87171',
    tag: 'Vốn thấp nhất',
    desc: 'Phù hợp người mới bắt đầu. Di chuyển linh hoạt đến khu công nghiệp, trường học, chợ sáng, sự kiện ngoài trời.',
    features: [
      { name: 'Xe đẩy hoặc xe máy cải tiến có mái che', price: 12000000 },
      { name: 'Máy pha cà phê phin chuẩn thương hiệu', price: 2000000 },
      { name: 'Dụng cụ pha chế và ly in biểu trưng', price: 1500000 },
      { name: 'Đào tạo 2 ngày và Hỗ trợ tuyến đường', price: 1000000 },
    ],
    combos: [
      {
        name: 'Combo Nguyên Liệu Đầu Kỳ',
        gia: 3500000,
        ly: 120,
        ingredients: [
          { name: 'Sữa Tươi 200 hộp', price: 1000000 },
          { name: 'Sữa Đặc 100 hộp', price: 500000 },
          { name: 'Trân Châu Hoàng Kim 100 gói', price: 1000000 },
          { name: 'Thạch Sương Sáo 100 gói', price: 1000000 },
        ],
      },
    ],
  },
  {
    id: 'KIOSK_CO_DINH',
    name: 'Kiosk Cố Định',
    area: 'Từ 6 đến 15 mét vuông',
    invest: '50 triệu',
    investDetail: 'Trọn gói: 50.000.000 đ',
    royalty: '6% mỗi tháng',
    color: '#b22830',
    gradient: 'linear-gradient(135deg, #fff1f2, #fecdd3)',
    border: '#f87171',
    tag: 'Phổ biến nhất',
    desc: 'Quầy kiosk cố định mang đi phù hợp mặt tiền nhỏ, tầng trệt chung cư, trong trung tâm thương mại, bệnh viện, trường học.',
    features: [
      { name: 'Quầy kiosk thiết kế chuẩn thương hiệu', price: 25000000 },
      { name: 'Máy pha espresso bán tự động', price: 15000000 },
      { name: 'Bộ dụng cụ pha chế hoàn chỉnh', price: 3000000 },
      { name: 'Chi phí thi công, lắp đặt và đào tạo', price: 1500000 },
    ],
    combos: [
      {
        name: 'Combo Nguyên Liệu Đầu Kỳ',
        gia: 5500000,
        ly: 200,
        ingredients: [
          { name: 'Sữa Tươi 300 hộp', price: 1500000 },
          { name: 'Sữa Đặc 100 hộp', price: 500000 },
          { name: 'Sữa Yến Mạch 100 hộp', price: 500000 },
          { name: 'Đào Miếng 100 hộp', price: 1000000 },
          { name: 'Trân Châu Trắng 200 gói', price: 2000000 },
        ],
      },
    ],
  },
  {
    id: 'CONTAINER_CAFE',
    name: 'Container Mini Quán',
    area: 'Từ 15 đến 25 mét vuông',
    invest: '75 triệu',
    investDetail: 'Trọn gói: 75.000.000 đ',
    royalty: '7% mỗi tháng',
    color: '#1e3a5f',
    gradient: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
    border: '#93c5fd',
    tag: 'Cao cấp và nổi bật',
    desc: 'Container hoặc không gian nhỏ có chỗ ngồi mini. Phù hợp công viên, khu dân cư, ven đường đẹp, có phong cách riêng.',
    features: [
      { name: 'Container 20ft, Nội thất và Trang trí', price: 40000000 },
      { name: 'Máy espresso chuyên nghiệp kèm máy xay', price: 25000000 },
      { name: 'Bộ phần mềm thu ngân và thiết bị', price: 2500000 },
    ],
    combos: [
      {
        name: 'Combo Nguyên Liệu Đầu Kỳ',
        gia: 7500000,
        ly: 280,
        ingredients: [
          { name: 'Sữa Yến Mạch 300 hộp', price: 1500000 },
          { name: 'Kem Phô Mai Macchiato 150 hộp', price: 1500000 },
          { name: 'Trái Vải 150 hộp', price: 1500000 },
          { name: 'Kem Bọt Dừa 100 hộp', price: 1000000 },
          { name: 'Đài Hoa Atiso Đỏ 200 gói', price: 2000000 },
        ],
      },
    ],
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Nộp hồ sơ đăng ký',
    desc: 'Điền biểu mẫu thông tin, hệ thống tự động xử lý và gửi thư xác nhận ngay lập tức.',
  },
  {
    n: '02',
    title: 'Tư vấn và Khảo sát',
    desc: 'Đội ngũ phát triển nhượng quyền liên hệ trong 24 giờ, đặt lịch gặp và khảo sát mặt bằng thực tế.',
  },
  {
    n: '03',
    title: 'Ký hợp đồng và Setup',
    desc: 'Ký kết hợp đồng chính thức, bộ phận kỹ thuật bắt đầu triển khai kiosk theo chuẩn thương hiệu.',
  },
  {
    n: '04',
    title: 'Khai trương và Vận hành',
    desc: 'Nhận tài khoản hệ thống, bắt đầu vận hành với đầy đủ công cụ quản lý chuyên nghiệp từ Hội Sở.',
  },
];

const DEFAULT_FORM = {
  ho_ten: '',
  email: '',
  so_dien_thoai: '',
  dia_chi_mat_bang: '',
  phuong_xa: '',
  thanh_pho: '',
  dien_tich_m2: '',
  goi_kiosk: 'KIOSK_CO_DINH',
  ghi_chu: '',
};

const getPackageName = (id) => {
  const pkg = PACKAGES.find((p) => p.id === id);
  if (pkg) return pkg.name;
  if (id === 'XE_LUU_DONG') return 'Xe Cà Phê Lưu Động';
  if (id === 'KIOSK_CO_DINH') return 'Kiosk Cố Định';
  if (id === 'CONTAINER_CAFE') return 'Container Mini Quán';
  return id ? id.replace(/_/g, ' ') : '';
};

const formatKioskType = (type) => {
  if (!type) return '';
  const map = {
    XE_LUU_DONG: 'Xe Cà Phê Lưu Động',
    KIOSK_CO_DINH: 'Kiosk Cố Định',
    CONTAINER_CAFE: 'Container Mini Quán',
  };
  return map[type] || type.replace(/_/g, ' ');
};

const getStatusBadge = (stt) => {
  switch (stt) {
    case 'CHO_XEM_XET':
      return { label: 'Chờ xem xét', color: '#4b5563', bg: '#f3f4f6', border: '#d1d5db' };
    case 'CHO_DAT_COC':
      return { label: 'Chờ đặt cọc', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
    case 'DA_DUYET':
      return { label: 'Đã duyệt và Đã cọc', color: '#15803d', bg: '#f0fdf4', border: '#86efac' };
    case 'TU_CHOI':
      return { label: 'Đã từ chối', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' };
    case 'DA_HUY':
      return { label: 'Đã hủy', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' };
    default:
      return { label: stt ? stt.replace(/_/g, ' ') : '', color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' };
  }
};

export default function FranchisePage({ onNavigate }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [activeStep, setActiveStep] = useState(0);

  // States cho tính năng Tra Cứu Hồ Sơ
  const [showLookup, setShowLookup] = useState(false);
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [selectedKiosk, setSelectedKiosk] = useState(null);
  const [isLoadingKiosks, setIsLoadingKiosks] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // State cho Tìm kiếm và Đánh giá Kiosk
  const [searchKiosk, setSearchKiosk] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isViewReviewModalOpen, setIsViewReviewModalOpen] = useState(false);
  const [viewKiosk, setViewKiosk] = useState(null);
  const [viewReviewsData, setViewReviewsData] = useState([]);
  const [isLoadingViewReviews, setIsLoadingViewReviews] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);

  // Lấy dữ liệu rating từ API chung với Stores
  const { data: branchStatsPayload } = useQuery({
    queryKey: ['branch-reviews-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/branch-reviews/stats');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const branchStats = useMemo(() => {
    return Array.isArray(branchStatsPayload) ? branchStatsPayload : (branchStatsPayload?.data || []);
  }, [branchStatsPayload]);

  // Gắn rating vào kiosks
  const kiosksWithRating = useMemo(() => {
    return kiosks.map(k => {
      const stats = branchStats.find(s => s.ma_chi_nhanh === k.ma_kiosk) 
                 || branchStats.find(s => s.ma_chi_nhanh === k.id) 
                 || branchStats.find(s => s.ma_chi_nhanh === k.ma_chi_nhanh);
      return {
        ...k,
        rating: stats?.diem_trung_binh || 5.0,
        reviewCount: stats?.tong_luot_danh_gia || 0,
        color: "bg-blue-500",
      };
    });
  }, [kiosks, branchStats]);

  const filteredKiosks = useMemo(() => {
    return kiosksWithRating.filter(k => {
      if (selectedCity && selectedCity !== '') {
        const kioskCity = (k.thanh_pho || '').replace(/^Thành phố\s+/i, '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const filterCity = selectedCity.replace(/^Thành phố\s+/i, '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (kioskCity !== filterCity) return false;
      }
      if (!searchKiosk) return true;
      const query = searchKiosk.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const name = (k.ten_kiosk || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const address = (k.dia_chi || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(query) || address.includes(query);
    });
  }, [kiosksWithRating, searchKiosk, selectedCity]);

  // Các thành phố duy nhất từ danh sách kiosks để làm bộ lọc (bỏ chữ Thành phố)
  const availableCities = useMemo(() => {
    const cities = new Set(
      kiosks
        .map(k => k.thanh_pho ? k.thanh_pho.replace(/^Thành phố\s+/i, '').trim() : '')
        .filter(Boolean)
    );
    return Array.from(cities).sort();
  }, [kiosks]);

  useEffect(() => {
    fetch('/provinces.json')
      .then((res) => res.json())
      .then((data) => setProvinces(data))
      .catch((err) => console.error(err));

    apiClient
      .get(`/franchise/kiosk/public`)
      .then((res) => {
        const data = res.data;
        const arr = Array.isArray(data) ? data : data?.data || data?.items || [];
        setKiosks(arr);
        if (arr.length > 0) setSelectedKiosk(arr[0]);
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg('Không thể tải danh sách cửa hàng vào lúc này.');
      })
      .finally(() => setIsLoadingKiosks(false));
  }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleChangeProvince = (e) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, thanh_pho: val, phuong_xa: '' }));
    const selected = provinces.find((p) => p.name === val);
    setWards(selected ? selected.wards : []);
  };

  const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      // Geocode địa chỉ sang tọa độ bằng VietMap
      let vi_do = null;
      let kinh_do = null;
      const apiKey = import.meta.env.VITE_VIETMAP_API_KEY;
      
      if (apiKey) {
        try {
          const fullAddress = `${form.dia_chi_mat_bang}, ${form.phuong_xa}, ${form.thanh_pho}`;
          const geocodeRes = await fetch(`https://maps.vietmap.vn/api/search/v3?api-version=1.1&apikey=${apiKey}&text=${encodeURIComponent(fullAddress)}`);
          const geocodeData = await geocodeRes.json();
          if (geocodeData && geocodeData.length > 0) {
            vi_do = parseFloat(geocodeData[0].lat);
            kinh_do = parseFloat(geocodeData[0].lng); // Vietmap dùng lng thay vì lon
          }
        } catch (geocodeErr) {
          console.warn('Geocoding VietMap failed:', geocodeErr);
        }
      }

      if (!vi_do || !kinh_do) {
        console.warn('Geocoding thất bại, không tìm thấy tọa độ.');
      } else {
        // Validation 500m: Kiểm tra xem có kiosk nào gần trong vòng 500m không
        const isTooClose = kiosks.some(k => {
          if (k.vi_do && k.kinh_do) {
            const dist = getDistanceFromLatLonInKm(vi_do, kinh_do, parseFloat(k.vi_do), parseFloat(k.kinh_do));
            return dist < 0.5; // 0.5 km = 500m
          }
          return false;
        });

        if (isTooClose) {
          throw new Error('Địa điểm này cách một chi nhánh hoặc Kiosk hiện tại dưới 500m. Vui lòng chọn vị trí khác để đảm bảo đặc quyền khu vực!');
        }
      }

      const submitData = { ...form, vi_do, kinh_do };
      const response = await apiClient.post(`/franchise/dang-ky`, submitData);
      const data = response.data;
      setResult({ success: true, message: data.message });
      setForm(DEFAULT_FORM);
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Gửi hồ sơ thất bại';
      setResult({ success: false, message: errorMsg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!lookupPhone) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await apiClient.get(`/franchise/ho-so/tra-cuu`, { params: { so_dien_thoai: lookupPhone } });
      setLookupResult(res.data.data);
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Lỗi tra cứu hồ sơ';
      setLookupError(errorMsg);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCancelApplication = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn hủy hồ sơ đăng ký này không? Hành động này không thể hoàn tác!')) return;
    try {
      const res = await apiClient.patch(`/franchise/ho-so/${id}/huy`);
      alert(`Thành công!\n\n${res.data?.message || 'Đã hủy hồ sơ thành công'}`);
      handleLookup({ preventDefault: () => {} });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Hủy hồ sơ thất bại';
      alert(`Lỗi: ${msg}`);
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif', background: '#fdfbf7', minHeight: '100vh', color: '#1f2937' }}>
      {/* ── HERO BANNER ──────────────────────────────────────────── */}
      <section
        style={{
          background: '#5e0b0f',
          padding: '88px 24px 104px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -60,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.04)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -90,
            right: -40,
            width: 420,
            height: 420,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.03)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 20px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            Cơ Hội Nhượng Quyền Avengers Coffee
          </div>

          <h1
            style={{
              color: '#ffffff',
              fontSize: 'clamp(32px, 5.2vw, 56px)',
              fontWeight: 900,
              lineHeight: 1.18,
              margin: '0 0 20px',
              letterSpacing: '-0.02em',
            }}
          >
            Cùng Avengers Coffee
            <br />
            <span style={{ color: '#ffffff' }}>Xây Dựng Tương Lai</span>
          </h1>

          <p
            style={{
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 18,
              lineHeight: 1.7,
              maxWidth: 620,
              margin: '0 auto 36px',
              fontWeight: 400,
            }}
          >
            Gia nhập hệ thống nhượng quyền của chúng tôi — thương hiệu cà phê được tin yêu hàng đầu. Chúng tôi cung cấp mô hình kinh doanh đã được kiểm chứng và đồng hành hỗ trợ toàn diện.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="#dang-ky"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 34px',
                background: 'linear-gradient(135deg, #b22830 0%, #8f1b23 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 15,
                borderRadius: 12,
                textDecoration: 'none',
                boxShadow: '0 6px 20px rgba(180, 83, 9, 0.45)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              Đăng Ký Ngay
            </a>

            <button
              onClick={() => setShowLookup(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px 30px',
                background: 'rgba(255, 255, 255, 0.14)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 15,
                borderRadius: 12,
                border: '1.5px solid rgba(255, 255, 255, 0.35)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
            >
              Tra Cứu và Hủy Hồ Sơ
            </button>
          </div>
        </div>
      </section>

      {/* ── THÔNG SỐ NỔI BẬT ───────────────────────────────── */}
      <section style={{ background: '#ffffff', borderBottom: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[
            { n: '50+', label: 'Kiosk trên toàn quốc' },
            { n: '95%', label: 'Đối tác hài lòng' },
            { n: '24 giờ', label: 'Phản hồi hồ sơ nhanh chóng' },
            { n: '7 ngày', label: 'Hỗ trợ thiết lập hoàn thiện' },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: '30px 20px',
                textAlign: 'center',
                borderRight: i < 3 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 900, color: '#8f1b23', letterSpacing: '-0.02em' }}>{s.n}</div>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CÁC GÓI ĐẦU TƯ ─────────────────────────────────── */}
      <section style={{ padding: '72px 24px', maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: '#fce7e8',
              color: '#b22830',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            Các gói đầu tư
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Chọn Mô Hình Phù Hợp</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28 }}>
          {PACKAGES.map((pkg) => {
            const isSelected = form.goi_kiosk === pkg.id;
            return (
              <div
                key={pkg.id}
                onClick={() => setForm((f) => ({ ...f, goi_kiosk: pkg.id }))}
                style={{
                  background: '#ffffff',
                  borderRadius: 20,
                  overflow: 'hidden',
                  border: isSelected ? `2.5px solid ${pkg.color}` : '1.5px solid #e2e8f0',
                  boxShadow: isSelected ? `0 16px 36px -8px ${pkg.color}35` : '0 4px 16px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.25s ease',
                  cursor: 'pointer',
                  transform: isSelected ? 'translateY(-4px)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header card */}
                <div style={{ background: pkg.gradient, padding: '26px 26px 22px', borderBottom: `1px solid ${pkg.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 21, fontWeight: 900, color: pkg.color }}>{pkg.name}</div>
                      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{pkg.invest}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginTop: 2, fontWeight: 500 }}>{pkg.investDetail}</div>
                    </div>
                    <div
                      style={{
                        padding: '5px 12px',
                        background: pkg.color,
                        color: '#ffffff',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pkg.tag}
                    </div>
                  </div>

                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginTop: 14, marginBottom: 0 }}>{pkg.desc}</p>

                  <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
                    {[
                      { label: 'Không gian', v: pkg.area },
                      { label: 'Phí duy trì', v: pkg.royalty },
                    ].map((item, i) => (
                      <div key={i} style={{ fontSize: 13 }}>
                        <div style={{ color: '#64748b', fontSize: 12 }}>{item.label}</div>
                        <div style={{ fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Body card */}
                <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Chi tiết hạng mục đầu tư
                  </div>

                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {pkg.features.map((f, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: pkg.color, flexShrink: 0 }} />
                          <span>{f.name}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#1e293b', flexShrink: 0 }}>{f.price.toLocaleString('vi-VN')} đ</span>
                      </li>
                    ))}
                  </ul>

                  {/* Combo nguyên liệu */}
                  <div style={{ marginTop: 20, padding: '14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Combo Nguyên Liệu Đầu Kỳ
                    </div>
                    {pkg.combos.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#1e293b', fontWeight: 700 }}>{c.name}</span>
                          <span style={{ color: '#8f1b23', fontWeight: 800 }}>{c.gia.toLocaleString('vi-VN')} đ</span>
                        </div>
                        {c.ingredients &&
                          c.ingredients.map((ing, ingIdx) => (
                            <div key={ingIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, paddingLeft: 8, color: '#64748b' }}>
                              <span>• {ing.name}</span>
                              <span>{ing.price.toLocaleString('vi-VN')} đ</span>
                            </div>
                          ))}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>* Ước tính pha chế khoảng {pkg.combos[0].ly} ly đồ uống</div>
                  </div>

                  {/* Tổng cộng */}
                  <div
                    style={{
                      marginTop: 20,
                      paddingTop: 16,
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>TỔNG CỘNG DỰ KIẾN</div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: pkg.color }}>
                      {(pkg.features.reduce((sum, f) => sum + f.price, 0) + (pkg.combos[0]?.gia || 0)).toLocaleString('vi-VN')} đ
                    </div>
                  </div>

                  {/* Nút hành động */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm((f) => ({ ...f, goi_kiosk: pkg.id }));
                      document.getElementById('dang-ky')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                      marginTop: 22,
                      width: '100%',
                      padding: '13px',
                      border: isSelected ? 'none' : `1.5px solid ${pkg.border}`,
                      background: isSelected ? '#8f1b23' : '#ffffff',
                      color: isSelected ? '#ffffff' : pkg.color,
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 14px rgba(143, 27, 35, 0.3)' : 'none',
                    }}
                  >
                    {isSelected ? 'Đã chọn gói này' : 'Chọn gói này'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── QUY TRÌNH HỢP TÁC ──────────────────────────────── */}
      <section style={{ background: '#ffffff', padding: '72px 24px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                background: '#fee2e2',
                color: '#8f1b23',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 12,
              }}
            >
              Quy trình hợp tác
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>4 Bước Đơn Giản</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {STEPS.map((step, i) => {
              const isActive = activeStep === i;
              return (
                <div
                  key={step.n}
                  onClick={() => setActiveStep(i)}
                  style={{
                    padding: '26px 22px',
                    borderRadius: 18,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isActive ? '#fff1f2' : '#f8fafc',
                    border: isActive ? '2px solid #f87171' : '1.5px solid #e2e8f0',
                    boxShadow: isActive ? '0 8px 24px rgba(143, 27, 35, 0.08)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: isActive ? '#8f1b23' : '#e2e8f0',
                        color: isActive ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {step.n}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: isActive ? '#8f1b23' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Bước {step.n}
                    </div>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 8 }}>{step.title}</div>
                  <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── BẢN ĐỒ HỆ THỐNG CỬA HÀNG ───────────────────────── */}
      <section style={{ padding: '72px 24px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: '#fce7e8',
              color: '#b22830',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            Hệ thống đối tác
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Mạng Lưới Kiosk Avengers</h2>
        </div>

        {/* Thanh Filter (Top Bar) giống Stores */}
        <div style={{ 
          background: '#ffffff', 
          padding: '16px 24px', 
          borderRadius: 16, 
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
          marginBottom: 24,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {/* Lọc Thành phố */}
          <div style={{ flex: '1 1 200px', position: 'relative' }}>
            <select
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setSearchKiosk('');
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: '1.5px solid #cbd5e1',
                outline: 'none',
                fontSize: 14,
                color: '#334155',
                appearance: 'none',
                background: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E") no-repeat right 16px center',
                backgroundSize: '10px'
              }}
            >
              <option value="">Tất cả Thành phố</option>
              {availableCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Ô Tìm kiếm với Autocomplete */}
          <div style={{ flex: '3 1 400px', position: 'relative' }} ref={searchInputRef}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              border: '1.5px solid #cbd5e1',
              borderRadius: 12,
              padding: '10px 16px',
              background: '#ffffff'
            }}>
              <MagnifyingGlassIcon style={{ width: 20, height: 20, color: '#64748b', marginRight: 10 }} />
              <input 
                type="text"
                placeholder="Tìm kiếm Kiosk (Tên đường, phường, cửa hàng)..."
                value={searchKiosk}
                onChange={(e) => {
                  setSearchKiosk(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14 }}
              />
              {searchKiosk && (
                <XMarkIcon 
                  style={{ width: 18, height: 18, color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => {
                    setSearchKiosk('');
                    setShowSuggestions(false);
                  }}
                />
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && searchKiosk && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 8,
                background: '#ffffff',
                borderRadius: 12,
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0',
                zIndex: 50,
                maxHeight: 320,
                overflowY: 'auto'
              }}>
                {filteredKiosks.length > 0 ? (
                  filteredKiosks.map(k => (
                    <div 
                      key={k.id}
                      onClick={() => {
                        setSelectedKiosk(k);
                        setShowSuggestions(false);
                      }}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <MapPinIcon style={{ width: 18, height: 18, color: '#8f1b23', marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{k.ten_kiosk}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{k.dia_chi}, {k.phuong_xa}, {k.thanh_pho}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                    Không tìm thấy Kiosk nào phù hợp
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 560,
            background: '#ffffff',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Danh sách cửa hàng */}
            <div style={{ width: 360, overflowY: 'auto', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#f8fafc' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#ffffff', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
                  Tìm được <span style={{ color: '#8f1b23' }}>{filteredKiosks.length}</span> Kiosk
                </span>
              </div>

              {filteredKiosks.map((kiosk) => {
                const isSelected = selectedKiosk?.id === kiosk.id;
                return (
                  <div
                    key={kiosk.id}
                    onClick={() => setSelectedKiosk(kiosk)}
                    style={{
                      padding: '20px 22px',
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: isSelected ? '4px solid #8f1b23' : '4px solid transparent',
                      cursor: 'pointer',
                      background: isSelected ? '#fff5f5' : '#ffffff',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: isSelected ? '#8f1b23' : '#0f172a', lineHeight: 1.4 }}>{kiosk.ten_kiosk}</div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 4, 
                        background: '#fffbeb', 
                        padding: '4px 8px', 
                        borderRadius: 8,
                        border: '1px solid #fef3c7',
                        flexShrink: 0
                      }}>
                        <StarSolid style={{ width: 14, height: 14, color: '#fbbf24' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#92400e' }}>
                          {kiosk.reviewCount > 0 
                            ? <>{Number(kiosk.rating).toFixed(1)} <span style={{ fontWeight: 600, color: '#d97706' }}>({kiosk.reviewCount})</span></> 
                            : <span style={{ fontWeight: 600, color: '#d97706' }}>Chưa có đánh giá</span>}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{kiosk.ma_kiosk}</span> • {kiosk.dia_chi}, {kiosk.phuong_xa}, {kiosk.thanh_pho}
                    </div>
                    <div style={{ display: 'inline-block', padding: '3px 10px', background: '#fce7e8', color: '#b22830', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {formatKioskType(kiosk.loai_kiosk)}
                    </div>
                    {isSelected && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(188, 40, 48, 0.2)', display: 'flex', gap: 10 }}>
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            setViewKiosk(kiosk);
                            setIsViewReviewModalOpen(true);
                            setIsLoadingViewReviews(true);
                            try {
                              const res = await apiClient.get(`/branch-reviews/branch/${kiosk.ma_kiosk}`);
                              setViewReviewsData(res.data?.items || []);
                            } catch(err) {
                              setViewReviewsData([]);
                            } finally {
                              setIsLoadingViewReviews(false);
                            }
                          }}
                          style={{ flex: 1, padding: '10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12, cursor: 'pointer', transition: 'background 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#d97706'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#f59e0b'}
                        >
                          XEM ĐÁNH GIÁ
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsReviewModalOpen(true);
                          }}
                          style={{ flex: 1, padding: '10px', background: '#8f1b23', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12, cursor: 'pointer', transition: 'background 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#73141a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#8f1b23'}
                        >
                          ĐÁNH GIÁ CHI NHÁNH NÀY
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoadingKiosks && <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Đang tải danh sách cửa hàng...</div>}

              {errorMsg && <div style={{ padding: 24, textAlign: 'center', color: '#dc2626', fontSize: 14 }}>{errorMsg}</div>}

              {!isLoadingKiosks && !errorMsg && filteredKiosks.length === 0 && (
                <div style={{ padding: 36, textAlign: 'center', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                  Hệ thống đang cập nhật danh sách cửa hàng.
                  <br />
                  <span style={{ fontSize: 13, color: '#8f1b23', fontWeight: 700 }}>Hãy trở thành đối tác đầu tiên của chúng tôi!</span>
                </div>
              )}
            </div>

            {/* Khung bản đồ */}
            <div style={{ flex: 1, background: '#f8fafc', position: 'relative' }}>
              {selectedKiosk ? (
                <iframe
                  title={`Bản đồ ${selectedKiosk.ten_kiosk}`}
                  src={buildMapEmbedUrl(`${selectedKiosk.dia_chi}, ${selectedKiosk.phuong_xa}, ${selectedKiosk.thanh_pho}`)}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 15 }}>
                  Chọn một cửa hàng trong danh sách để xem vị trí bản đồ
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phần đánh giá Kiosk & Sản phẩm (Đã di chuyển nút đánh giá lên thẻ Kiosk) */}
        {selectedKiosk && (
          <div style={{ marginTop: 32, padding: 24, background: '#ffffff', borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>
                Kiosk: {selectedKiosk.ten_kiosk}
              </h3>
              <p style={{ color: '#64748b', fontSize: 14, margin: 0, maxWidth: 600, lineHeight: 1.6 }}>
                Tại Kiosk, chúng tôi cam kết mang đến đồ uống chất lượng với không gian vệ sinh sạch sẽ, đáp ứng nhu cầu thưởng thức cà phê tiện lợi của bạn mỗi ngày. Hãy nhấp vào <strong>ĐÁNH GIÁ CHI NHÁNH NÀY</strong> ở danh sách bên trên nếu bạn muốn để lại phản hồi cho chúng tôi!
              </p>
            </div>
          </div>
        )}
      </section>
      {/* ── BIỂU MẪU ĐĂNG KÝ ───────────────────────────────── */}
      <section id="dang-ky" style={{ padding: '72px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 740, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                background: '#fce7e8',
                color: '#b22830',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 12,
              }}
            >
              Bắt đầu hành trình
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', margin: '0 0 14px', letterSpacing: '-0.02em' }}>Đăng Ký Hồ Sơ Nhượng Quyền</h2>
            <p style={{ color: '#64748b', fontSize: 15, margin: 0, lineHeight: 1.6 }}>
              Chúng tôi sẽ phản hồi trong vòng <strong>24 giờ làm việc</strong>. Thư xác nhận sẽ được gửi về hộp thư tiếp nhận <strong style={{ color: '#8f1b23' }}>{COMPANY_EMAIL}</strong>.
            </p>
          </div>

          {result ? (
            <div
              style={{
                padding: '36px 30px',
                borderRadius: 20,
                textAlign: 'center',
                background: result.success ? '#f0fdf4' : '#fef2f2',
                border: `2px solid ${result.success ? '#86efac' : '#fca5a5'}`,
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  padding: '6px 18px',
                  borderRadius: 999,
                  background: result.success ? '#dcfce7' : '#fee2e2',
                  color: result.success ? '#15803d' : '#b91c1c',
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {result.success ? 'Tiếp nhận thành công' : 'Gửi hồ sơ chưa thành công'}
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 900, color: result.success ? '#15803d' : '#b91c1c', margin: '0 0 12px' }}>
                {result.success ? 'Hồ sơ đã được tiếp nhận thành công' : 'Đã xảy ra lỗi khi gửi hồ sơ'}
              </h3>

              <p style={{ color: result.success ? '#166534' : '#991b1b', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>{result.message}</p>

              {result.success && (
                <div style={{ padding: '20px 24px', background: '#ffffff', borderRadius: 14, border: '1px solid #bbf7d0', marginBottom: 24, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, color: '#15803d', fontWeight: 800, marginBottom: 10 }}>Các bước tiếp theo:</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#334155', fontSize: 14, lineHeight: 2 }}>
                    <li>Thư xác nhận đã được gửi đến hộp thư của quý khách</li>
                    <li>Đội ngũ tư vấn sẽ liên hệ trực tiếp trong vòng 24 giờ làm việc</li>
                    <li>Quý khách vui lòng chuẩn bị thông tin mặt bằng và nguồn vốn dự kiến để được tư vấn chính xác nhất</li>
                  </ul>
                </div>
              )}

              <button
                onClick={() => setResult(null)}
                style={{
                  padding: '12px 30px',
                  background: result.success ? '#15803d' : '#b91c1c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 14,
                  boxShadow: result.success ? '0 4px 14px rgba(21, 128, 61, 0.3)' : '0 4px 14px rgba(185, 28, 28, 0.3)',
                }}
              >
                {result.success ? 'Trở về trang nhượng quyền' : 'Thử lại'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: '#ffffff', padding: '40px 36px', borderRadius: 24, boxShadow: '0 16px 40px -12px rgba(0, 0, 0, 0.08)', border: '1px solid #e2e8f0' }}>
              {/* Chọn mô hình gói đầu tư */}
              <div style={{ marginBottom: 26 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#475569', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Mô hình nhượng quyền quan tâm *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  {PACKAGES.map((pkg) => {
                    const isSelected = form.goi_kiosk === pkg.id;
                    return (
                      <label
                        key={pkg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '16px 12px',
                          border: isSelected ? `2px solid ${pkg.color}` : '1.5px solid #e2e8f0',
                          borderRadius: 14,
                          cursor: 'pointer',
                          textAlign: 'center',
                          background: isSelected ? `${pkg.color}10` : '#ffffff',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? `0 4px 14px ${pkg.color}20` : 'none',
                        }}
                      >
                        <input type="radio" name="goi_kiosk" value={pkg.id} checked={isSelected} onChange={handleChange} style={{ display: 'none' }} />
                        <div style={{ fontWeight: 800, fontSize: 14, color: isSelected ? pkg.color : '#1e293b' }}>{pkg.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>{pkg.invest}</div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Họ tên và Số điện thoại */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 18 }}>
                {[
                  { name: 'ho_ten', label: 'Họ và tên *', placeholder: 'Ví dụ: Nguyễn Văn A', required: true },
                  { name: 'so_dien_thoai', label: 'Số điện thoại liên hệ *', placeholder: 'Ví dụ: 0912345678', required: true },
                ].map((field) => (
                  <div key={field.name}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{field.label}</label>
                    <input
                      name={field.name}
                      value={form[field.name]}
                      onChange={handleChange}
                      placeholder={field.placeholder}
                      required={field.required}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 10,
                        fontSize: 14,
                        boxSizing: 'border-box',
                        background: '#ffffff',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Email */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Hộp thư điện tử nhận thông tin *</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="name@example.com"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 10,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Thư xác nhận và thông tin tài khoản quản trị sẽ gửi về địa chỉ thư này</div>
              </div>

              {/* Địa chỉ mặt bằng */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Địa chỉ mặt bằng dự kiến *</label>
                <input
                  name="dia_chi_mat_bang"
                  value={form.dia_chi_mat_bang}
                  onChange={handleChange}
                  placeholder="Số nhà, Tên đường"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 10,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Tỉnh thành, Phường xã, Diện tích */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Tỉnh, Thành phố *</label>
                  <input
                    list="provinces-list"
                    name="thanh_pho"
                    value={form.thanh_pho}
                    onChange={handleChangeProvince}
                    placeholder="Chọn hoặc nhập Tỉnh/Thành phố..."
                    required
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 10,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      background: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                  <datalist id="provinces-list">
                    {provinces.map((p) => (
                      <option key={p.code} value={p.name} />
                    ))}
                  </datalist>
                </div>



                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Phường, Xã *</label>
                  <input
                    list="wards-list"
                    name="phuong_xa"
                    value={form.phuong_xa}
                    onChange={handleChange}
                    placeholder="Chọn hoặc nhập Phường/Xã..."
                    required
                    disabled={!form.thanh_pho}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 10,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      background: form.thanh_pho ? '#ffffff' : '#f1f5f9',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                  <datalist id="wards-list">
                    {wards.map((w, idx) => (
                      <option key={idx} value={w.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Diện tích (m²)</label>
                  <input
                    name="dien_tich_m2"
                    type="number"
                    value={form.dien_tich_m2}
                    onChange={handleChange}
                    placeholder="m²"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 10,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      background: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Ghi chú */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Ghi chú thêm</label>
                <textarea
                  name="ghi_chu"
                  value={form.ghi_chu}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Kinh nghiệm kinh doanh, câu hỏi hoặc yêu cầu cần tư vấn chi tiết..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 10,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Nút gửi - Màu xanh lá cho hành động xác nhận gửi theo chuẩn UX */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: submitting ? '#94a3b8' : '#8f1b23',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 6px 20px rgba(143, 27, 35, 0.35)',
                  transition: 'background 0.2s ease, transform 0.15s ease',
                }}
              >
                {submitting ? 'Đang gửi hồ sơ...' : 'Nộp Hồ Sơ Đăng Ký'}
              </button>

              <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', margin: '16px 0 0', lineHeight: 1.6 }}>
                Bằng cách gửi biểu mẫu này, quý khách đồng ý để chúng tôi liên hệ tư vấn. Mọi thông tin được cam kết bảo mật theo chính sách thương hiệu.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── THÔNG TIN LIÊN HỆ TRỰC TIẾP ─────────────────────── */}
      <section style={{ background: '#0f172a', padding: '54px 24px', textAlign: 'center', color: '#ffffff' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 10px', color: '#ffffff' }}>Muốn tư vấn trực tiếp?</h3>
          <p style={{ color: '#94a3b8', fontSize: 15, margin: '0 0 28px', lineHeight: 1.6 }}>
            Liên hệ trực tiếp với bộ phận phát triển nhượng quyền Avengers Coffee
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              style={{
                padding: '13px 28px',
                background: '#8f1b23',
                color: '#ffffff',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(143, 27, 35, 0.4)',
              }}
            >
              {COMPANY_EMAIL}
            </a>

            <div
              style={{
                padding: '13px 28px',
                background: '#1e293b',
                color: '#e2e8f0',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                border: '1px solid #334155',
              }}
            >
              Hotline: 1800 6936
            </div>
          </div>
        </div>
      </section>

      {/* ── MODAL TRA CỨU HỒ SƠ ───────────────────────────────── */}
      {showLookup && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 22,
              width: '100%',
              maxWidth: 620,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px 30px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Tra Cứu Hồ Sơ Đăng Ký</h3>
              <button
                onClick={() => {
                  setShowLookup(false);
                  setLookupResult(null);
                  setLookupError(null);
                  setLookupPhone('');
                }}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleLookup} style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <input
                type="tel"
                placeholder="Nhập số điện thoại đã đăng ký..."
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 12,
                  fontSize: 14,
                  outline: 'none',
                  color: '#0f172a',
                }}
                required
              />
              <button
                type="submit"
                disabled={lookupLoading}
                style={{
                  padding: '0 24px',
                  background: '#8f1b23',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: lookupLoading ? 'wait' : 'pointer',
                  boxShadow: '0 4px 12px rgba(143, 27, 35, 0.3)',
                }}
              >
                {lookupLoading ? 'Đang tìm...' : 'Tra cứu'}
              </button>
            </form>

            {lookupError && (
              <div
                style={{
                  padding: '14px 16px',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  borderRadius: 12,
                  border: '1px solid #fca5a5',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                {lookupError}
              </div>
            )}

            {lookupResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lookupResult.map((hs) => {
                  const badge = getStatusBadge(hs.trang_thai);
                  const pkgName = getPackageName(hs.goi_kiosk);
                  const canCancel = hs.trang_thai === 'CHO_XEM_XET' || hs.trang_thai === 'CHO_DAT_COC';

                  return (
                    <div
                      key={hs.id}
                      style={{
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 16,
                        padding: '18px 20px',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>
                            Hồ sơ ngày {new Date(hs.ngay_tao).toLocaleDateString('vi-VN')}
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                            Khu vực: {hs.phuong_xa}, {hs.thanh_pho}
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                            Mô hình đăng ký: <strong style={{ color: '#8f1b23' }}>{pkgName}</strong>
                          </div>
                        </div>

                        <div
                          style={{
                            padding: '5px 12px',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </div>
                      </div>

                      {hs.ghi_chu && (
                        <div
                          style={{
                            fontSize: 13,
                            color: '#334155',
                            background: '#ffffff',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px dashed #cbd5e1',
                            marginBottom: 12,
                          }}
                        >
                          <i>Ghi chú từ hệ thống:</i> {hs.ghi_chu}
                        </div>
                      )}

                      {hs.ly_do_tu_choi && (
                        <div
                          style={{
                            fontSize: 13,
                            color: '#b91c1c',
                            background: '#fef2f2',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px dashed #fca5a5',
                            marginBottom: 12,
                          }}
                        >
                          <i>Lý do từ chối:</i> {hs.ly_do_tu_choi}
                        </div>
                      )}

                      {/* Nút hủy hồ sơ - Hành động nguy hiểm dùng màu đỏ chuẩn UX */}
                      {canCancel && (
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleCancelApplication(hs.id)}
                            style={{
                              padding: '9px 18px',
                              background: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 10,
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            Hủy đăng ký hồ sơ
                          </button>
                        </div>
                      )}

                      {hs.trang_thai === 'DA_DUYET' && (
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, textAlign: 'right' }}>
                          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>
                            Hồ sơ đã được duyệt và cấp tài khoản. Quý khách vui lòng đăng nhập Cổng Nhượng Quyền để quản lý hoặc gửi yêu cầu hoàn cọc.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedKiosk && (
        <BranchReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          branchData={{
            ...selectedKiosk,
            id: selectedKiosk.id,
            code: selectedKiosk.ma_kiosk,
            name: `${selectedKiosk.ten_kiosk} (${selectedKiosk.ma_kiosk})`,
            address: `${selectedKiosk.dia_chi}, ${selectedKiosk.phuong_xa}, ${selectedKiosk.thanh_pho}`,
          }}
          onSuccess={() => {
            alert('Cảm ơn bạn đã đánh giá cửa hàng!');
            setIsReviewModalOpen(false);
            queryClient.invalidateQueries(['branch-reviews-stats']);
          }}
        />
      )}

      {/* Modal Xem Đánh Giá */}
      {isViewReviewModalOpen && viewKiosk && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <StarSolid style={{ width: 18, height: 18, color: '#eab308' }} /> Đánh Giá Khách Hàng - {viewKiosk.ten_kiosk} ({viewKiosk.ma_kiosk})
              </h3>
              <button type="button" onClick={() => setIsViewReviewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <XMarkIcon style={{ width: 24, height: 24 }} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {isLoadingViewReviews ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>Đang tải danh sách đánh giá...</div>
              ) : viewReviewsData.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>Kiosk này chưa có đánh giá nào.</div>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', color: '#92400e' }}>Đánh giá trung bình:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#b45309' }}>{Number(viewKiosk.rating).toFixed(1)} / 5.0</strong>
                      <span style={{ fontSize: '0.85rem', color: '#d97706' }}>({viewKiosk.reviewCount} đánh giá)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {viewReviewsData.map((rv, idx) => (
                    <div key={idx} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{rv.ten_nguoi_dung || 'Khách hàng ẩn danh'}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(rv.ngay_tao).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          i < (rv.diem_tong_quan || 5)
                            ? <StarSolid key={i} style={{ width: 14, height: 14, color: '#facc15' }} />
                            : <StarOutline key={i} style={{ width: 14, height: 14, color: '#cbd5e1' }} />
                        ))}
                      </div>
                      {rv.nhan_xet && <div style={{ fontSize: '0.85rem', color: '#334155', fontStyle: 'italic' }}>"{rv.nhan_xet}"</div>}
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
