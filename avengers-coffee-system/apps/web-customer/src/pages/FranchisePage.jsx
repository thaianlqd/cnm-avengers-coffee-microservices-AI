import { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`;

const buildMapEmbedUrl = (address) => `https://www.google.com/maps?q=${encodeURIComponent(String(address || ''))}&output=embed`;

const COMPANY_EMAIL = 'ankudo1234@gmail.com';

const PACKAGES = [
  {
    id: 'XE_LUU_DONG',
    name: 'Xe Cà Phê Lưu Động',
    emoji: '🛺',
    area: 'Xe đẩy / xe máy',
    invest: 'Từ 20 triệu',
    investDetail: 'Trọn gói: 20.000.000 đ',
    royalty: '4%',
    color: '#d97706',
    gradient: 'linear-gradient(135deg,#fef9c3,#fde68a)',
    border: '#fbbf24',
    tag: 'Vốn thấp nhất',
    desc: 'Phù hợp người mới bắt đầu. Di chuyển linh hoạt đến khu công nghiệp, trường học, chợ sáng, sự kiện ngoài trời.',
    features: [
      { name: 'Xe đẩy / xe máy cải tiến có mái che', price: 12000000 },
      { name: 'Máy pha cà phê phin chuẩn thương hiệu', price: 2000000 },
      { name: 'Dụng cụ pha chế & ly in logo', price: 1500000 },
      { name: 'Training 2 ngày & Hỗ trợ tuyến đường', price: 1000000 },
    ],
    combos: [
      { name: 'Combo Nguyên Liệu Đầu Kỳ', gia: 3500000, ly: 120, ingredients: [
        { name: 'Sữa Tươi (Lẻ) x 200', price: 1000000 },
        { name: 'Sữa Đặc (Lẻ) x 100', price: 500000 },
        { name: 'Trân Châu Hoàng Kim (Lẻ) x 100', price: 1000000 },
        { name: 'Thạch Sương Sáo (Lẻ) x 100', price: 1000000 }
      ] }
    ]
  },
  {
    id: 'KIOSK_CO_DINH',
    name: 'Kiosk Take-Away Cố Định',
    emoji: '☕',
    area: '6 - 15 m²',
    invest: '50 triệu',
    investDetail: 'Trọn gói: 50.000.000 đ',
    royalty: '6%',
    color: '#b22830',
    gradient: 'linear-gradient(135deg,#fff1f2,#fecdd3)',
    border: '#f87171',
    tag: '⭐ Phổ biến nhất',
    desc: 'Quầy kiosk cố định take-away phù hợp mặt tiền nhỏ, tầng trệt chung cư, trong TTTM, bệnh viện, trường học.',
    features: [
      { name: 'Quầy kiosk thiết kế chuẩn thương hiệu', price: 25000000 },
      { name: 'Máy pha espresso bán tự động', price: 15000000 },
      { name: 'Bộ dụng cụ pha chế hoàn chỉnh', price: 3000000 },
      { name: 'Chi phí thi công, setup & training', price: 1500000 },
    ],
    combos: [
      { name: 'Combo Nguyên Liệu Đầu Kỳ', gia: 5500000, ly: 200, ingredients: [
        { name: 'Sữa Tươi (Lẻ) x 300', price: 1500000 },
        { name: 'Sữa Đặc (Lẻ) x 100', price: 500000 },
        { name: 'Sữa Yến Mạch (Lẻ) x 100', price: 500000 },
        { name: 'Đào Miếng (Lẻ) x 100', price: 1000000 },
        { name: 'Trân Châu Trắng (Lẻ) x 200', price: 2000000 }
      ] }
    ]
  },
  {
    id: 'CONTAINER_CAFE',
    name: 'Container Mini Café',
    emoji: '🏠',
    area: '15 - 25 m²',
    invest: '75 triệu',
    investDetail: 'Trọn gói: 75.000.000 đ',
    royalty: '7%',
    color: '#1e3a5f',
    gradient: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
    border: '#93c5fd',
    tag: 'Cao cấp & nổi bật',
    desc: 'Container hoặc không gian nhỏ có chỗ ngồi mini. Phù hợp công viên, khu dân cư, ven đường đẹp, có phong cách riêng.',
    features: [
      { name: 'Container 20ft, Nội thất & Decor', price: 40000000 },
      { name: 'Máy espresso chuyên nghiệp + máy xay', price: 25000000 },
      { name: 'Bộ phần mềm POS & thiết bị', price: 2500000 },
    ],
    combos: [
      { name: 'Combo Nguyên Liệu Đầu Kỳ', gia: 7500000, ly: 280, ingredients: [
        { name: 'Sữa Yến Mạch (Lẻ) x 300', price: 1500000 },
        { name: 'Kem Phô Mai Macchiato (Lẻ) x 150', price: 1500000 },
        { name: 'Trái Vải (Lẻ) x 150', price: 1500000 },
        { name: 'Foam Dừa (Lẻ) x 100', price: 1000000 },
        { name: 'Đài Hoa Hibiscus (Lẻ) x 200', price: 2000000 }
      ] }
    ]
  },
];


const STEPS = [
  { n: 1, icon: '📝', title: 'Nộp hồ sơ đăng ký', desc: 'Điền form thông tin, hệ thống tự xử lý và gửi email xác nhận ngay lập tức.' },
  { n: 2, icon: '☎️', title: 'Tư vấn & Khảo sát', desc: 'Đội ngũ phát triển nhượng quyền liên hệ trong 24h, đặt lịch gặp & khảo sát mặt bằng.' },
  { n: 3, icon: '📃', title: 'Ký hợp đồng & Setup', desc: 'Ký hợp đồng chính thức, bộ phận kỹ thuật bắt đầu triển khai kiosk theo chuẩn thương hiệu.' },
  { n: 4, icon: '🚀', title: 'Khai trương & Vận hành', desc: 'Nhận tài khoản hệ thống, bắt đầu vận hành với đầy đủ công cụ quản lý từ Hội Sở.' },
];

const DEFAULT_FORM = {
  ho_ten: '', email: '', so_dien_thoai: '',
  dia_chi_mat_bang: '', quan_huyen: '', thanh_pho: '',
  dien_tich_m2: '', goi_kiosk: 'KIOSK_CO_DINH', ghi_chu: '',
};

export default function FranchisePage({ onNavigate }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { success, message }
  const [activeStep, setActiveStep] = useState(null);

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
      .then(res => res.json())
      .then(data => setProvinces(data))
      .catch(err => console.error(err));

    apiClient.get(`/franchise/kiosk/public`)
      .then(res => {
        const data = res.data;
        const arr = Array.isArray(data) ? data : (data?.data || data?.items || []);
        setKiosks(arr);
        if (arr.length > 0) setSelectedKiosk(arr[0]);
      })
      .catch(err => {
        console.error(err);
        setErrorMsg(err.message + " | " + JSON.stringify(err.response?.data || {}));
      })
      .finally(() => setIsLoadingKiosks(false));
  }, []);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleChangeProvince = (e) => {
    const val = e.target.value;
    setForm(f => ({ ...f, thanh_pho: val, quan_huyen: '' }));
    const selected = provinces.find(p => p.name === val);
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
      const errorMsg = err.response?.data?.message || err.message || 'Lỗi tra cứu';
      setLookupError(errorMsg);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCancelApplication = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn hủy hồ sơ đăng ký này không? Hành động này không thể hoàn tác!')) return;
    try {
      const res = await fetch(`${API_URL}/franchise/ho-so/${id}/huy`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Hủy thất bại');
      alert(`Thành công!\n\n${data.message}`);
      // Refresh tra cứu
      handleLookup({ preventDefault: () => {} });
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  const getStatusBadge = (stt) => {
    switch (stt) {
      case 'CHO_XEM_XET': return { label: 'Chờ xem xét', color: '#6b7280', bg: '#f3f4f6' };
      case 'CHO_DAT_COC': return { label: 'Chờ đặt cọc', color: '#d97706', bg: '#fef3c7' };
      case 'DA_DUYET': return { label: 'Đã duyệt / Đã cọc', color: '#16a34a', bg: '#f0fdf4' };
      case 'TU_CHOI': return { label: 'Đã từ chối', color: '#dc2626', bg: '#fef2f2' };
      case 'DA_HUY': return { label: 'Đã hủy', color: '#dc2626', bg: '#fef2f2' };
      default: return { label: stt, color: '#374151', bg: '#f3f4f6' };
    }
  };

  return (
    <div style={{ fontFamily: '"Segoe UI",Inter,system-ui,sans-serif', background: '#fffbf5', minHeight: '100vh' }}>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg,#7c1d24 0%,#b22830 50%,#8B2635 100%)',
        padding: '80px 20px 100px', textAlign: 'center', position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -40, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', padding: '6px 18px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: '#fde68a', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
            ☕ Cơ Hội Nhượng Quyền Avengers Coffee
          </div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(32px,5vw,56px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 20px' }}>
            Cùng Avengers Coffee<br />
            <span style={{ color: '#fbbf24' }}>Xây Dựng Tương Lai</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 32px' }}>
            Gia nhập hệ thống nhượng quyền của chúng tôi — thương hiệu cà phê được tin yêu hàng đầu. 
            Chúng tôi cung cấp mô hình kinh doanh đã được kiểm chứng và hỗ trợ toàn diện.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#dang-ky" style={{
              display: 'inline-block', padding: '14px 32px', background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: '#fff', fontWeight: 800, fontSize: 15, borderRadius: 12, textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(245,158,11,0.5)', letterSpacing: '0.02em'
            }}>
              📝 Đăng Ký Ngay
            </a>
            <button onClick={() => setShowLookup(true)} style={{
              display: 'inline-block', padding: '14px 32px', background: 'rgba(255,255,255,0.12)',
              color: '#fff', fontWeight: 800, fontSize: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer'
            }}>
              🔍 Tra Cứu & Hủy Hồ Sơ
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: '0', borderBottom: '1px solid #fde68a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { n: '50+', label: 'Kiosk trên toàn quốc' },
            { n: '95%', label: 'Đối tác hài lòng' },
            { n: '24h', label: 'Phản hồi hồ sơ' },
            { n: '7 ngày', label: 'Hỗ trợ setup' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '28px 20px', textAlign: 'center', borderRight: i < 3 ? '1px solid #fde68a' : 'none' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#b22830' }}>{s.n}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CÁC GÓI NHƯỢNG QUYỀN ─────────────────────────── */}
      <section style={{ padding: '64px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', background: '#fef9c3', color: '#92400e', borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Các gói đầu tư</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1f2937', margin: 0 }}>Chọn Mô Hình Phù Hợp</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
          {PACKAGES.map(pkg => (
            <div key={pkg.id} style={{
              background: '#fff', borderRadius: 20, overflow: 'hidden',
              border: form.goi_kiosk === pkg.id ? `2.5px solid ${pkg.color}` : '1.5px solid #e5e7eb',
              boxShadow: form.goi_kiosk === pkg.id ? `0 8px 32px ${pkg.color}25` : '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'all .25s', cursor: 'pointer', transform: form.goi_kiosk === pkg.id ? 'translateY(-4px)' : 'none'
            }} onClick={() => setForm(f => ({ ...f, goi_kiosk: pkg.id }))}>
              <div style={{ background: pkg.gradient, padding: '24px 24px 20px', borderBottom: `1.5px solid ${pkg.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: pkg.color }}>
                    <span style={{ marginRight: 8 }}>{pkg.emoji}</span>
                    {pkg.name}
                  </div>
                  <span style={{ padding: '3px 10px', background: pkg.color, color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{pkg.tag}</span>
                </div>
                <div style={{ marginTop: 12, fontSize: 26, fontWeight: 900, color: '#1f2937' }}>{pkg.invest}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{pkg.investDetail}</div>
                <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
                  {pkg.desc}
                </p>
                <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  {[{ label: 'Mặt bằng', v: pkg.area }, { label: 'Royalty', v: pkg.royalty + '/tháng' }].map((item, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      <div style={{ color: '#9ca3af' }}>{item.label}</div>
                      <div style={{ fontWeight: 700, color: '#374151' }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chi tiết chi phí:</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pkg.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ color: pkg.color, flexShrink: 0, marginTop: 1 }}>✓</span>
                        <span>{f.name}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: '#4b5563', flexShrink: 0 }}>{f.price.toLocaleString('vi-VN')} đ</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 16, padding: '12px', background: '#f9fafb', borderRadius: 8, border: '1px dashed #d1d5db' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>📦 COMBO NGUYÊN LIỆU ĐẦU KỲ</div>
                  {pkg.combos.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#374151', fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: '#059669', fontWeight: 700 }}>{(c.gia).toLocaleString('vi-VN')} đ</span>
                      </div>
                      {c.ingredients && c.ingredients.map((ing, ingIdx) => (
                         <div key={ingIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, paddingLeft: 12, color: '#6b7280' }}>
                           <span>- {ing.name}</span>
                           <span>{ing.price.toLocaleString('vi-VN')} đ</span>
                         </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>* Ước tính pha chế ~{pkg.combos[0].ly} ly đồ uống</div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>TỔNG CỘNG</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: pkg.color }}>
                    {(pkg.features.reduce((sum, f) => sum + f.price, 0) + (pkg.combos[0]?.gia || 0)).toLocaleString('vi-VN')} đ
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, goi_kiosk: pkg.id })); document.getElementById('dang-ky')?.scrollIntoView({ behavior: 'smooth' }); }}
                  style={{
                    marginTop: 20, width: '100%', padding: '11px', border: `1.5px solid ${pkg.border}`,
                    background: form.goi_kiosk === pkg.id ? pkg.color : 'transparent',
                    color: form.goi_kiosk === pkg.id ? '#fff' : pkg.color,
                    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all .2s'
                  }}>
                  {form.goi_kiosk === pkg.id ? '✓ Đã chọn gói này' : 'Chọn gói này'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── QUY TRÌNH ──────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: '64px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', padding: '4px 14px', background: '#fee2e2', color: '#b22830', borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Quy trình hợp tác</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1f2937', margin: 0 }}>4 Bước Đơn Giản</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 24 }}>
            {STEPS.map((step, i) => (
              <div key={step.n} onClick={() => setActiveStep(activeStep === i ? null : i)}
                style={{
                  padding: 24, borderRadius: 16, cursor: 'pointer', transition: 'all .2s',
                  background: activeStep === i ? '#fff1f2' : '#f9fafb',
                  border: activeStep === i ? '2px solid #f87171' : '1.5px solid #e5e7eb',
                  boxShadow: activeStep === i ? '0 4px 20px rgba(178,40,48,0.1)' : 'none'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: activeStep === i ? '#b22830' : '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0
                  }}>{step.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: activeStep === i ? '#b22830' : '#9ca3af', textTransform: 'uppercase' }}>Bước {step.n}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#1f2937', marginBottom: 8 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BẢN ĐỒ HỆ THỐNG KIOSK ──────────────────────────── */}
      <section style={{ padding: '64px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', background: '#fef9c3', color: '#92400e', borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Hệ thống đối tác</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1f2937', margin: 0 }}>Mạng Lưới Kiosk Avengers</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', height: '100%' }}>
            {/* List */}
            <div style={{ width: 350, overflowY: 'auto', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              {kiosks.map(kiosk => (
                <div key={kiosk.id} onClick={() => setSelectedKiosk(kiosk)} style={{ padding: 20, borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selectedKiosk?.id === kiosk.id ? '#fffbeb' : '#fff', transition: 'all 0.2s' }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e', marginBottom: 4 }}>{kiosk.ten_kiosk}</div>
                  <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>📍 {kiosk.dia_chi}, {kiosk.quan_huyen}, {kiosk.thanh_pho}</div>
                  <div style={{ display: 'inline-block', padding: '2px 8px', background: '#fde68a', color: '#92400e', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{kiosk.loai_kiosk}</div>
                </div>
              ))}
              {isLoadingKiosks && <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Đang tải danh sách Kiosk...</div>}
              {errorMsg && <div style={{ padding: 20, textAlign: 'center', color: 'red' }}>Lỗi: {errorMsg}</div>}
              {!isLoadingKiosks && !errorMsg && kiosks.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Hệ thống đang cập nhật Kiosk.<br/><span style={{fontSize: 12}}>Hãy trở thành đối tác đầu tiên!</span></div>}
            </div>
            {/* Map */}
            <div style={{ flex: 1, background: '#f3f4f6', position: 'relative' }}>
              {selectedKiosk ? (
                <iframe
                  title={`Map ${selectedKiosk.ten_kiosk}`}
                  src={buildMapEmbedUrl(`${selectedKiosk.dia_chi}, ${selectedKiosk.quan_huyen}, ${selectedKiosk.thanh_pho}`)}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>Chọn một Kiosk để xem bản đồ</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FORM ĐĂNG KÝ ───────────────────────────────────── */}
      <section id="dang-ky" style={{ padding: '64px 20px', background: 'linear-gradient(135deg,#fffbf5,#fff7ed)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-block', padding: '4px 14px', background: '#fef9c3', color: '#92400e', borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Bắt đầu hành trình</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#1f2937', margin: '0 0 12px' }}>Đăng Ký Hồ Sơ Nhượng Quyền</h2>
            <p style={{ color: '#6b7280', fontSize: 15 }}>
              Chúng tôi sẽ phản hồi trong vòng <strong>24 giờ làm việc</strong>. Email xác nhận sẽ gửi về <strong style={{ color: '#b22830' }}>{COMPANY_EMAIL}</strong>.
            </p>
          </div>

          {result ? (
            <div style={{
              padding: 32, borderRadius: 20, textAlign: 'center',
              background: result.success ? '#f0fdf4' : '#fef2f2',
              border: `2px solid ${result.success ? '#86efac' : '#fca5a5'}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)'
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{result.success ? '🎉' : '⚠️'}</div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: result.success ? '#16a34a' : '#dc2626', margin: '0 0 12px' }}>
                {result.success ? 'Hồ sơ đã được tiếp nhận!' : 'Gửi hồ sơ thất bại'}
              </h3>
              <p style={{ color: result.success ? '#15803d' : '#b91c1c', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>{result.message}</p>
              {result.success && (
                <div style={{ padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #86efac', marginBottom: 20, textAlign: 'left' }}>
                  <div style={{ fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 8 }}>✅ Bước tiếp theo:</div>
                  <ul style={{ margin: 0, padding: '0 0 0 16px', color: '#374151', fontSize: 14, lineHeight: 2 }}>
                    <li>Email xác nhận đã gửi về hòm thư của bạn</li>
                    <li>Đội ngũ tư vấn sẽ liên hệ trong 24 giờ làm việc</li>
                    <li>Chuẩn bị thông tin mặt bằng và vốn đầu tư để tư vấn chính xác hơn</li>
                  </ul>
                </div>
              )}
              <button onClick={() => setResult(null)}
                style={{ padding: '11px 28px', background: '#b22830', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                {result.success ? '← Về trang nhượng quyền' : '← Thử lại'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 40, borderRadius: 24, boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)', position: 'relative', zIndex: 10 }}>

              {/* Package selector inline */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Gói nhượng quyền quan tâm *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {PACKAGES.map(pkg => (
                    <label key={pkg.id} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px',
                      border: `2px solid ${form.goi_kiosk === pkg.id ? pkg.color : '#e5e7eb'}`,
                      borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                      background: form.goi_kiosk === pkg.id ? `${pkg.color}10` : '#f9fafb', transition: 'all .15s'
                    }}>
                      <input type="radio" name="goi_kiosk" value={pkg.id} checked={form.goi_kiosk === pkg.id} onChange={handleChange} style={{ display: 'none' }} />
                      <div style={{ fontWeight: 800, fontSize: 13, color: form.goi_kiosk === pkg.id ? pkg.color : '#374151' }}>{pkg.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{pkg.invest}</div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {[
                  { name: 'ho_ten', label: 'Họ và tên *', placeholder: 'Nguyễn Văn A', required: true },
                  { name: 'so_dien_thoai', label: 'Số điện thoại *', placeholder: '0912 345 678', required: true },
                ].map(field => (
                  <div key={field.name}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{field.label}</label>
                    <input name={field.name} value={form[field.name]} onChange={handleChange} placeholder={field.placeholder} required={field.required}
                      style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937' }} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email nhận thông tin *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="example@gmail.com" required
                  style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937' }} />
                <div style={{ fontSize: 11, color: '#a16207', marginTop: 5 }}>📧 Email xác nhận và thông tin tài khoản sẽ gửi về địa chỉ này</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Địa chỉ mặt bằng dự kiến *</label>
                <input name="dia_chi_mat_bang" value={form.dia_chi_mat_bang} onChange={handleChange} placeholder="Số 123, Đường ABC" required
                  style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tỉnh/Thành phố *</label>
                  <select name="thanh_pho" value={form.thanh_pho} onChange={handleChangeProvince} required
                    style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937' }}>
                    <option value="" disabled>Chọn Tỉnh/TP</option>
                    {provinces.map(p => (
                      <option key={p.code} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quận/Huyện *</label>
                  <select name="quan_huyen" value={form.quan_huyen} onChange={handleChange} required disabled={!form.thanh_pho}
                    style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: form.thanh_pho ? '#fffbeb' : '#f3f4f6', color: '#1f2937' }}>
                    <option value="" disabled>Chọn Quận/Huyện</option>
                    {districts.map(d => (
                      <option key={d.code} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Diện tích</label>
                  <input name="dien_tich_m2" type="number" value={form.dien_tich_m2} onChange={handleChange} placeholder="m²"
                    style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937' }} />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ghi chú thêm</label>
                <textarea name="ghi_chu" value={form.ghi_chu} onChange={handleChange} rows={3}
                  placeholder="Kinh nghiệm kinh doanh, câu hỏi muốn hỏi trước, v.v..."
                  style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: '#fffbeb', color: '#1f2937', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <button type="submit" disabled={submitting}
                style={{
                  width: '100%', padding: '15px', background: submitting ? '#d1d5db' : 'linear-gradient(135deg,#b22830,#d94040)',
                  color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 4px 20px rgba(178,40,48,0.35)', letterSpacing: '0.02em'
                }}>
                {submitting ? '⏳ Đang gửi hồ sơ...' : '📝 Nộp Hồ Sơ Đăng Ký'}
              </button>

              <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', margin: '16px 0 0' }}>
                Bằng cách gửi form này, bạn đồng ý để chúng tôi liên hệ tư vấn. Thông tin được bảo mật tuyệt đối.
              </p>
            </form>
          )}
        </div>
      </section>


      {/* ── CONTACT INFO ──────────────────────────────────── */}
      <section style={{ background: '#1f2937', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h3 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Muốn tư vấn trực tiếp?</h3>
          <p style={{ color: '#9ca3af', fontSize: 15, margin: '0 0 24px' }}>Liên hệ trực tiếp với bộ phận phát triển nhượng quyền</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`mailto:${COMPANY_EMAIL}`} style={{
              padding: '12px 24px', background: '#b22830', color: '#fff', borderRadius: 10,
              fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8
            }}>✉️ {COMPANY_EMAIL}</a>
            <div style={{ padding: '12px 24px', background: '#374151', color: '#d1d5db', borderRadius: 10, fontWeight: 600, fontSize: 14 }}>
              📞 1800 6936
            </div>
          </div>
        </div>
      </section>

      {/* ── LOOKUP MODAL ────────────────────────────────────────── */}
      {showLookup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1f2937' }}>🔍 Tra Cứu Hồ Sơ Đăng Ký</h3>
              <button onClick={() => { setShowLookup(false); setLookupResult(null); setLookupError(null); setLookupPhone(''); }} style={{ background: 'none', border: 'none', fontSize: 24, color: '#9ca3af', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleLookup} style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              <input type="tel" placeholder="Nhập số điện thoại đã đăng ký..." value={lookupPhone} onChange={e => setLookupPhone(e.target.value)}
                style={{ flex: 1, padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 15, outline: 'none' }} required />
              <button type="submit" disabled={lookupLoading} style={{ padding: '0 24px', background: '#b22830', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: lookupLoading ? 'wait' : 'pointer' }}>
                {lookupLoading ? 'Đang tìm...' : 'Tra cứu'}
              </button>
            </form>

            {lookupError && <div style={{ padding: 12, background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 14, fontWeight: 600, marginBottom: 20 }}>❌ {lookupError}</div>}

            {lookupResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lookupResult.map(hs => {
                  const badge = getStatusBadge(hs.trang_thai);
                  const pkg = PACKAGES.find(p => p.id === hs.goi_kiosk);
                  return (
                    <div key={hs.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#f9fafb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#1f2937', fontSize: 16 }}>Hồ sơ ngày {new Date(hs.ngay_tao).toLocaleDateString('vi-VN')}</div>
                          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Khu vực: {hs.quan_huyen}, {hs.thanh_pho}</div>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>Gói đăng ký: <strong style={{color: '#92400e'}}>{pkg ? pkg.name : hs.goi_kiosk}</strong></div>
                        </div>
                        <div style={{ padding: '6px 12px', background: badge.bg, color: badge.color, borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                          {badge.label}
                        </div>
                      </div>
                      
                      {hs.ghi_chu && <div style={{ fontSize: 13, color: '#4b5563', background: '#fff', padding: 8, borderRadius: 6, border: '1px dashed #d1d5db', marginBottom: 12 }}><i>Ghi chú HT:</i> {hs.ghi_chu}</div>}
                      {hs.ly_do_tu_choi && <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 6, border: '1px dashed #fca5a5', marginBottom: 12 }}><i>Lý do:</i> {hs.ly_do_tu_choi}</div>}

                      {/* Các trạng thái cho phép khách hàng chủ động Hủy */}
                      {(hs.trang_thai === 'CHO_XEM_XET' || hs.trang_thai === 'CHO_DAT_COC') && (
                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleCancelApplication(hs.id)} style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1.5px solid #dc2626', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                            ✖️ Hủy đăng ký (Chưa cọc)
                          </button>
                        </div>
                      )}
                      {hs.trang_thai === 'DA_DUYET' && (
                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, textAlign: 'right' }}>
                          <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
                            ✅ Hồ sơ đã duyệt và cấp tài khoản. Vui lòng đăng nhập Cổng Nhượng Quyền để quản lý / Yêu cầu hoàn cọc.
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
