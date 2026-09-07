import { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';

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
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
    border: '#fbbf24',
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
  quan_huyen: '',
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
  const [districts, setDistricts] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [selectedKiosk, setSelectedKiosk] = useState(null);
  const [isLoadingKiosks, setIsLoadingKiosks] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    fetch('https://provinces.open-api.vn/api/?depth=2')
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
    setForm((f) => ({ ...f, thanh_pho: val, quan_huyen: '' }));
    const selected = provinces.find((p) => p.name === val);
    setDistricts(selected ? selected.districts : []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const response = await apiClient.post(`/franchise/dang-ky`, form);
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
          background: 'linear-gradient(135deg, #6b1419 0%, #8f1b23 50%, #75171d 100%)',
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
              color: '#fef08a',
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
            <span style={{ color: '#fbbf24' }}>Xây Dựng Tương Lai</span>
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
                background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
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
              background: '#fef3c7',
              color: '#92400e',
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
                          <span style={{ color: '#15803d', fontWeight: 800 }}>{c.gia.toLocaleString('vi-VN')} đ</span>
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
                      background: isSelected ? '#16a34a' : '#ffffff',
                      color: isSelected ? '#ffffff' : pkg.color,
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 14px rgba(22, 163, 74, 0.3)' : 'none',
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
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: '#fef3c7',
              color: '#92400e',
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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 520,
            background: '#ffffff',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Danh sách cửa hàng */}
            <div style={{ width: 360, overflowY: 'auto', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              {kiosks.map((kiosk) => {
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
                    <div style={{ fontWeight: 800, fontSize: 15, color: isSelected ? '#8f1b23' : '#0f172a', marginBottom: 4 }}>{kiosk.ten_kiosk}</div>
                    <div style={{ fontSize: 13, color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
                      {kiosk.dia_chi}, {kiosk.quan_huyen}, {kiosk.thanh_pho}
                    </div>
                    <div style={{ display: 'inline-block', padding: '3px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {formatKioskType(kiosk.loai_kiosk)}
                    </div>
                  </div>
                );
              })}

              {isLoadingKiosks && <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Đang tải danh sách cửa hàng...</div>}

              {errorMsg && <div style={{ padding: 24, textAlign: 'center', color: '#dc2626', fontSize: 14 }}>{errorMsg}</div>}

              {!isLoadingKiosks && !errorMsg && kiosks.length === 0 && (
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
                  src={buildMapEmbedUrl(`${selectedKiosk.dia_chi}, ${selectedKiosk.quan_huyen}, ${selectedKiosk.thanh_pho}`)}
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
      </section>

      {/* ── BIỂU MẪU ĐĂNG KÝ ───────────────────────────────── */}
      <section id="dang-ky" style={{ padding: '72px 24px', background: '#f8fafc' }}>
        <div style={{ maxWidth: 740, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                background: '#fef3c7',
                color: '#92400e',
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

              {/* Tỉnh thành, Quận huyện, Diện tích */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.2fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Tỉnh, Thành phố *</label>
                  <select
                    name="thanh_pho"
                    value={form.thanh_pho}
                    onChange={handleChangeProvince}
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
                  >
                    <option value="" disabled>
                      Chọn Tỉnh hoặc Thành phố
                    </option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Quận, Huyện *</label>
                  <select
                    name="quan_huyen"
                    value={form.quan_huyen}
                    onChange={handleChange}
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
                  >
                    <option value="" disabled>
                      Chọn Quận hoặc Huyện
                    </option>
                    {districts.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
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
                  background: submitting ? '#94a3b8' : '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 6px 20px rgba(22, 163, 74, 0.35)',
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
                            Khu vực: {hs.quan_huyen}, {hs.thanh_pho}
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
    </div>
  );
}
