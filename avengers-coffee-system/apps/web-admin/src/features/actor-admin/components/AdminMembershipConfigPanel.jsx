import React, { useState, useEffect } from 'react';
import {
  Award,
  Crown,
  Plus,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  Save,
  Coins,
  Gift,
  Zap,
  ShieldCheck,
  Layers,
  Tag,
  Palette,
  Sparkles,
  RefreshCw,
  UserPlus,
  Check,
  UserCheck
} from 'lucide-react';

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function AdminMembershipConfigPanel({
  membershipConfigsState,
  savingMembershipConfig,
  saveMembershipConfig,
  promotionsState,
  menuState,
}) {
  const [activeSubTab, setActiveSubTab] = useState('ranks');
  
  // Local state for tier config
  const [tiers, setTiers] = useState([]);
  // Local state for lucky wheel config
  const [wheelCost, setWheelCost] = useState(100);
  const [prizes, setPrizes] = useState([]);
  const [selectedPrizeId, setSelectedPrizeId] = useState(1);

  // Single Shared Tier Form State (for both Create & Edit)
  const formRef = React.useRef(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTierCode, setEditingTierCode] = useState(null); // null = create new, string = edit existing
  const [tierForm, setTierForm] = useState({
    ma_hang: '',
    ten_hang: '',
    mau_sac: '#2563eb',
    diem_toi_thieu: 0,
    chi_tieu_toi_thieu_thang: 0,
    he_so_diem: 1,
    luot_quay_thang: 1,
    ma_voucher_thang_hang: '',
    ma_voucher_sinh_nhat: '',
    freeship_value: 0,
    freeship_min_order: 0
  });

  const scrollToForm = () => {
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  // Load data from state into local state
  useEffect(() => {
    if (membershipConfigsState.tier_config) {
      setTiers(JSON.parse(JSON.stringify(membershipConfigsState.tier_config)));
    }
    if (membershipConfigsState.lucky_wheel_config) {
      setWheelCost(membershipConfigsState.lucky_wheel_config.chi_phi_quay || 100);
      if (membershipConfigsState.lucky_wheel_config.giai_thuong) {
        const loadedPrizes = JSON.parse(JSON.stringify(membershipConfigsState.lucky_wheel_config.giai_thuong));
        setPrizes(loadedPrizes);
        if (loadedPrizes.length > 0 && !loadedPrizes.find(p => p.id === selectedPrizeId)) {
          setSelectedPrizeId(loadedPrizes[0].id);
        }
      }
    }
  }, [membershipConfigsState]);

  const activePrize = prizes.find(p => p.id === selectedPrizeId) || prizes[0] || {};
  const activePrizeIndex = prizes.findIndex(p => p.id === selectedPrizeId);

  const openCreateTierForm = () => {
    const nextMinScore = tiers.length > 0 ? Number(tiers[tiers.length - 1].diem_toi_thieu || 0) + 1000 : 1000;
    setEditingTierCode(null);
    setTierForm({
      ma_hang: '',
      ten_hang: '',
      mau_sac: '#0284c7',
      diem_toi_thieu: nextMinScore,
      chi_tieu_toi_thieu_thang: 0,
      he_so_diem: 1.2,
      luot_quay_thang: 1,
      ma_voucher_thang_hang: '',
      ma_voucher_sinh_nhat: '',
      freeship_value: 0,
      freeship_min_order: 0
    });
    setShowTierForm(true);
    scrollToForm();
  };

  const openEditTierForm = (tier) => {
    setEditingTierCode(tier.ma_hang);
    setTierForm({
      ma_hang: tier.ma_hang || '',
      ten_hang: tier.ten_hang || '',
      mau_sac: tier.mau_sac || '#2563eb',
      diem_toi_thieu: Number(tier.diem_toi_thieu || 0),
      chi_tieu_toi_thieu_thang: Number(tier.chi_tieu_toi_thieu_thang || 0),
      he_so_diem: Number(tier.he_so_diem || 1),
      luot_quay_thang: Number(tier.luot_quay_thang || 1),
      ma_voucher_thang_hang: tier.ma_voucher_thang_hang || '',
      ma_voucher_sinh_nhat: tier.ma_voucher_sinh_nhat || '',
      freeship_value: Number(tier.freeship_value || 0),
      freeship_min_order: Number(tier.freeship_min_order || 0)
    });
    setShowTierForm(true);
    scrollToForm();
  };

  const handleSaveTierForm = () => {
    if (!tierForm.ma_hang.trim() || !tierForm.ten_hang.trim()) {
      window.alert('Vui lòng nhập đầy đủ Mã định danh và Tên hiển thị của hạng!');
      return;
    }

    let updatedTiers = [...tiers];
    if (editingTierCode) {
      const idx = updatedTiers.findIndex((t) => t.ma_hang === editingTierCode);
      if (idx !== -1) {
        updatedTiers[idx] = { ...tierForm };
      }
    } else {
      const codeUpper = tierForm.ma_hang.trim().toUpperCase();
      if (updatedTiers.some((t) => t.ma_hang.toUpperCase() === codeUpper)) {
        window.alert(`Mã hạng "${codeUpper}" đã tồn tại! Vui lòng đặt mã khác.`);
        return;
      }
      updatedTiers.push({ ...tierForm, ma_hang: codeUpper });
    }

    // Sort tiers by diem_toi_thieu ascending
    updatedTiers.sort((a, b) => Number(a.diem_toi_thieu || 0) - Number(b.diem_toi_thieu || 0));

    setTiers(updatedTiers);
    setShowTierForm(false);
    saveTiersConfig(updatedTiers);
  };

  const handleDeleteTier = (maHang) => {
    if (maHang === 'MEMBER') {
      window.alert('Hạng mặc định MEMBER là mốc khởi tạo cơ sở, không thể xóa!');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hạng "${maHang}" khỏi hệ thống?`)) return;

    const updatedTiers = tiers.filter((t) => t.ma_hang !== maHang);
    setTiers(updatedTiers);
    saveTiersConfig(updatedTiers);
  };

  const handleActivePrizeChange = (field, value) => {
    if (activePrizeIndex === -1) return;
    const updated = [...prizes];
    const current = { ...updated[activePrizeIndex], [field]: value };

    if (field === 'ma_voucher' && value) {
      const foundVoucher = (promotionsState?.items || []).find(v => v.ma_khuyen_mai === value);
      if (foundVoucher) {
        const val = Number(foundVoucher.gia_tri || 0);
        const type = foundVoucher.loai_khuyen_mai || foundVoucher.loai;
        let autoTitle = foundVoucher.ten_khuyen_mai;
        if (!autoTitle || String(autoTitle).startsWith('TPL_')) {
          if (type === 'PERCENT') autoTitle = `Giảm ${val}%`;
          else if (type === 'FIXED') autoTitle = `Voucher ${val >= 1000 ? (val/1000) + 'K' : val + 'đ'}`;
          else autoTitle = `Voucher Giảm Giá`;
        }
        current.ten = autoTitle;
        current.gia_tri = val;
      }
    } else if (field === 'ten_san_pham_tang' && value) {
      current.ten = `Free ${value}`;
    } else if (field === 'loai' && value === 'FREE_TOPPING') {
      current.ten = 'Free 1 Topping';
      current.ten_san_pham_tang = '1 Topping';
    }

    updated[activePrizeIndex] = current;
    setPrizes(updated);
  };

  const totalProbability = prizes.reduce((sum, p) => sum + Number(p.xac_suat || 0), 0);
  const isWheelProbabilityValid = Math.abs(totalProbability - 100) < 0.01;

  const activeTemplateVouchers = (promotionsState?.items || []).filter(
    (p) => p.trang_thai === 'ACTIVE' && p.loai_phan_phoi === 'TEMPLATE'
  );

  const hasContext = (v, ctxCode) => {
    if (v.loai_phan_phoi !== 'TEMPLATE') return false;
    const rawCtx = v.ngu_canh_su_dung || '';
    const list = typeof rawCtx === 'string'
      ? rawCtx.split(',').map((s) => s.trim().toUpperCase())
      : (Array.isArray(rawCtx) ? rawCtx : []);
    return list.includes(ctxCode);
  };

  const tierUpVouchers = activeTemplateVouchers.filter((p) => hasContext(p, 'TIER_UP'));
  const birthdayVouchers = activeTemplateVouchers.filter((p) => hasContext(p, 'BIRTHDAY'));
  const luckyWheelVouchers = activeTemplateVouchers.filter((p) => hasContext(p, 'LUCKY_WHEEL'));
  const menuProducts = (menuState?.items || []).map((p) => p.ten_san_pham || p.ten_mon || p.name).filter(Boolean);

  const formatVoucherOptionText = (v) => {
    const code = v.ma_khuyen_mai || v.ma_voucher || '';
    const name = v.ten_khuyen_mai || v.ten_voucher || '';
    const type = v.loai_khuyen_mai || v.loai || '';
    const val = Number(v.gia_tri || 0);

    let valStr = '';
    if (type === 'PERCENT') {
      const maxStr = v.giam_toi_da ? ` (Tối đa ${Number(v.giam_toi_da).toLocaleString('vi-VN')}đ)` : '';
      valStr = `Giảm ${val}%${maxStr}`;
    } else if (type === 'FIXED') {
      valStr = `Giảm ${val.toLocaleString('vi-VN')}đ`;
    } else if (type === 'FREE_ITEM') {
      valStr = `Tặng ${v.ten_san_pham_tang || 'món'}`;
    } else {
      valStr = `Giảm ${val}`;
    }

    const minOrder = Number(v.gia_tri_don_toi_thieu || v.don_hang_toi_thieu || 0);
    const minOrderStr = minOrder > 0 ? ` | Đơn từ ${minOrder.toLocaleString('vi-VN')}đ` : ' | Đơn từ 0đ';
    const daysStr = v.so_ngay_hieu_luc ? ` | Hạn ${v.so_ngay_hieu_luc} ngày` : ' | Hạn 30 ngày';

    return `[${code}] ${name} — ${valStr}${minOrderStr}${daysStr}`;
  };

  const renderVoucherDetailBadge = (code) => {
    if (!code) return null;
    const found = (promotionsState?.items || []).find((v) => (v.ma_khuyen_mai || v.ma_voucher) === code);
    if (!found) return null;

    const type = found.loai_khuyen_mai || found.loai || 'PERCENT';
    const val = Number(found.gia_tri || 0);
    let valStr = '';
    if (type === 'PERCENT') {
      valStr = `Giảm ${val}%`;
    } else if (type === 'FIXED') {
      valStr = `Giảm ${val.toLocaleString('vi-VN')}đ`;
    } else if (type === 'FREE_ITEM') {
      valStr = `Tặng ${found.ten_san_pham_tang || 'sản phẩm'}`;
    } else {
      valStr = `Giảm ${val}`;
    }

    const minOrder = Number(found.gia_tri_don_toi_thieu || found.don_hang_toi_thieu || 0);
    const maxDiscount = found.giam_toi_da ? Number(found.giam_toi_da).toLocaleString('vi-VN') + 'đ' : 'Không giới hạn';
    const days = found.so_ngay_hieu_luc || 30;

    return (
      <div style={{ marginTop: '0.35rem', padding: '0.45rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.76rem', color: '#4b5563', lineHeight: 1.4 }}>
        <div style={{ fontWeight: '700', color: '#1a1a1a' }}>{found.ten_khuyen_mai || found.ten_voucher} ({found.ma_khuyen_mai || found.ma_voucher})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          <span>• <strong>Mức giảm:</strong> <span style={{ color: '#2563eb', fontWeight: '800' }}>{valStr}</span></span>
          <span>• <strong>Giảm tối đa:</strong> {maxDiscount}</span>
          <span>• <strong>Đơn tối thiểu:</strong> {minOrder > 0 ? `${minOrder.toLocaleString('vi-VN')}đ` : '0đ (Không giới hạn)'}</span>
          <span>• <strong>Hạn dùng cấp:</strong> {days} ngày</span>
        </div>
      </div>
    );
  };

  const saveTiersConfig = (updatedTiers = tiers) => {
    for (let i = 1; i < updatedTiers.length; i++) {
      if (Number(updatedTiers[i].diem_toi_thieu) <= Number(updatedTiers[i - 1].diem_toi_thieu)) {
        window.alert(`Lỗi cấu hình: Điểm tối thiểu của hạng "${updatedTiers[i].ten_hang}" phải lớn hơn hạng "${updatedTiers[i - 1].ten_hang}"!`);
        return;
      }
    }
    
    const payload = updatedTiers.map(t => ({
      ...t,
      diem_toi_thieu: Number(t.diem_toi_thieu || 0),
      chi_tieu_toi_thieu_thang: Number(t.chi_tieu_toi_thieu_thang || 0),
      he_so_diem: Number(t.he_so_diem || 1),
      luot_quay_thang: Number(t.luot_quay_thang || 1),
      ma_voucher_thang_hang: t.ma_voucher_thang_hang || null,
      ma_voucher_sinh_nhat: t.ma_voucher_sinh_nhat || null,
      ma_voucher_freeship: t.ma_voucher_freeship || null,
    }));

    saveMembershipConfig('TIER_CONFIG', payload);
  };

  const saveWheelConfig = () => {
    if (!isWheelProbabilityValid) {
      window.alert(`Lỗi cấu hình: Tổng xác suất của 8 giải thưởng phải bằng 100%! Hiện tại đang là ${totalProbability}%.`);
      return;
    }

    const payload = {
      chi_phi_quay: Number(wheelCost || 100),
      giai_thuong: prizes.map(p => ({
        ...p,
        id: Number(p.id),
        gia_tri: Number(p.gia_tri || 0),
        xac_suat: Number(p.xac_suat || 0),
        ma_voucher: p.loai === 'VOUCHER' ? (p.ma_voucher || null) : null,
        ten_san_pham_tang: p.loai === 'FREE_ITEM' ? (p.ten_san_pham_tang || '') : null,
      })),
    };

    saveMembershipConfig('LUCKY_WHEEL_CONFIG', payload);
  };

  if (membershipConfigsState.loading && !tiers.length) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Đang tải cấu hình membership...</div>;
  }

  return (
    <section className="panel system-admin-panel" style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={22} color="#4f46e5" /> Thiết lập Membership &amp; Vòng Quay
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Cấu hình mốc xét hạng, hệ số tích điểm, quà tặng thăng hạng và cơ cấu Vòng quay may mắn
          </p>
        </div>

        {activeSubTab === 'ranks' && (
          <button
            type="button"
            className={showTierForm ? 'btn-cancel' : 'btn-save'}
            onClick={() => {
              if (showTierForm) {
                setShowTierForm(false);
              } else {
                openCreateTierForm();
              }
            }}
            style={{ height: '38px', padding: '0 1.1rem' }}
          >
            {showTierForm ? (
              <>
                <X size={16} /> Đóng biểu mẫu
              </>
            ) : (
              <>
                <UserPlus size={16} /> Tạo hạng thành viên mới
              </>
            )}
          </button>
        )}
      </div>

      {/* High-Impact Selected Sub Tabs Navigation Bar */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '0.25rem 0 0.5rem 0' }}>
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: '#f1f5f9',
            padding: '0.35rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            gap: '0.35rem',
            boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.05)'
          }}
        >
          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'ranks' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('ranks')}
          >
            <Award size={17} color={activeSubTab === 'ranks' ? '#ffffff' : '#475569'} />
            <span>Cấu hình Hạng &amp; Quà Tặng ({tiers.length})</span>
          </button>

          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'wheel' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('wheel')}
          >
            <Gift size={17} color={activeSubTab === 'wheel' ? '#ffffff' : '#475569'} />
            <span>Vòng Quay May Mắn (8 Ô)</span>
          </button>
        </div>
      </div>

      {membershipConfigsState.error ? (
        <div className="error-text" style={{ margin: 0, color: '#dc2626', fontWeight: '600' }}>{membershipConfigsState.error}</div>
      ) : null}

      {/* TAB 1: RANKS CONFIG */}
      {activeSubTab === 'ranks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SINGLE SHARED CREATE / EDIT FORM CARD */}
          {showTierForm && (
            <div
              ref={formRef}
              className="system-admin-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                boxShadow: '0 12px 30px -5px rgba(15, 23, 42, 0.08)',
                overflow: 'hidden'
              }}
            >
              {/* Form Header */}
              <div
                style={{
                  padding: '1.1rem 1.5rem',
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: editingTierCode ? '#eff6ff' : '#ecfdf5',
                      color: editingTierCode ? '#2563eb' : '#059669',
                      border: editingTierCode ? '1px solid #bfdbfe' : '1px solid #a7f3d0',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      flexShrink: 0
                    }}
                  >
                    {editingTierCode ? <Edit3 size={20} /> : <Plus size={20} />}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                      {editingTierCode ? `Cấu hình Hạng thành viên #${editingTierCode}` : 'Tạo hạng thành viên mới'}
                    </h2>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>
                      Điền thông tin mốc xét hạng, hệ số tích điểm và quà tặng tương ứng
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setShowTierForm(false)}
                  style={{
                    cursor: 'pointer',
                    padding: '0.4rem',
                    color: '#64748b',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    flexShrink: 0
                  }}
                  title="Đóng form"
                >
                  <X size={18} color="#64748b" />
                </div>
              </div>

              {/* Form Body - Balanced 2-Column Grid */}
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  {/* Mã Hạng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Mã định danh hạng <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: editingTierCode === 'MEMBER' ? '#f1f5f9' : '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Tag size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.ma_hang || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ma_hang: e.target.value.toUpperCase() }))}
                        placeholder="VD: PLATINUM, DIAMOND..."
                        disabled={Boolean(editingTierCode)}
                      />
                    </div>
                  </div>

                  {/* Tên Hạng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Tên hiển thị hạng <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Award size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.ten_hang || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ten_hang: e.target.value }))}
                        placeholder="VD: Hạng Bạch Kim, Hạng Kim Cương"
                      />
                    </div>
                  </div>

                  {/* Màu Nhận Diện */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Màu sắc đại diện
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Palette size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="color"
                        style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
                        value={tierForm.mau_sac || '#2563eb'}
                        onChange={(e) => setTierForm((p) => ({ ...p, mau_sac: e.target.value }))}
                      />
                      <input
                        type="text"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.mau_sac || '#2563eb'}
                        onChange={(e) => setTierForm((p) => ({ ...p, mau_sac: e.target.value }))}
                        placeholder="#2563eb"
                      />
                    </div>
                  </div>

                  {/* Mốc Điểm Xét Hạng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Mốc điểm tích lũy xét hạng (pt)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: tierForm.ma_hang === 'MEMBER' ? '#f1f5f9' : '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Coins size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="number"
                        min="0"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.diem_toi_thieu || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, diem_toi_thieu: Number(e.target.value) }))}
                        disabled={tierForm.ma_hang === 'MEMBER'}
                      />
                    </div>
                  </div>

                  {/* Chi tiêu duy trì tháng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Chi tiêu duy trì / Tháng (đ)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: tierForm.ma_hang === 'MEMBER' ? '#f1f5f9' : '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Zap size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.chi_tieu_toi_thieu_thang || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, chi_tieu_toi_thieu_thang: Number(e.target.value) }))}
                        placeholder="VD: 100000"
                        disabled={tierForm.ma_hang === 'MEMBER'}
                      />
                    </div>
                  </div>

                  {/* Hệ Số Điểm */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Hệ số tích điểm (VD: 1.2x)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Sparkles size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.he_so_diem || 1}
                        onChange={(e) => setTierForm((p) => ({ ...p, he_so_diem: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {/* Lượt quay tháng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Lượt quay may mắn / Tháng
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="number"
                        min="1"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.luot_quay_thang || 1}
                        onChange={(e) => setTierForm((p) => ({ ...p, luot_quay_thang: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {/* Ưu đãi phí ship */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Mức giảm phí ship (đ)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <ShieldCheck size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                        value={tierForm.freeship_value || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, freeship_value: Number(e.target.value) }))}
                        placeholder="0 = Không hỗ trợ"
                      />
                    </div>
                  </div>

                  {/* Quà thăng hạng */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', gridColumn: 'span 1' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Quà Thăng Hạng (Voucher Template)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <select
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.82rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                        value={tierForm.ma_voucher_thang_hang || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ma_voucher_thang_hang: e.target.value }))}
                      >
                        <option value="">-- Mặc định (Tự động cấp Voucher) --</option>
                        {(tierUpVouchers.length > 0 ? tierUpVouchers : activeTemplateVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {renderVoucherDetailBadge(tierForm.ma_voucher_thang_hang)}
                  </div>

                  {/* Quà sinh nhật */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', gridColumn: 'span 1' }}>
                    <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                      Quà Sinh Nhật (Voucher Template)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                      <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                      <select
                        style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.82rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                        value={tierForm.ma_voucher_sinh_nhat || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ma_voucher_sinh_nhat: e.target.value }))}
                      >
                        <option value="">-- Mặc định (Tự động cấp Voucher) --</option>
                        {(birthdayVouchers.length > 0 ? birthdayVouchers : activeTemplateVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {renderVoucherDetailBadge(tierForm.ma_voucher_sinh_nhat)}
                  </div>
                </div>
              </div>

              {/* Form Action Footer */}
              <div
                style={{
                  padding: '1rem 1.5rem',
                  backgroundColor: '#f8fafc',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem'
                }}
              >
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowTierForm(false)}
                  style={{
                    backgroundColor: '#fef2f2',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    height: '40px',
                    padding: '0 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <X size={17} color="#dc2626" />
                  <span style={{ color: '#dc2626' }}>Hủy bỏ</span>
                </button>

                <button
                  type="button"
                  className="btn-save"
                  onClick={handleSaveTierForm}
                  disabled={savingMembershipConfig}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    height: '40px',
                    padding: '0 1.5rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  <UserCheck size={17} color="#ffffff" />
                  <span>{savingMembershipConfig ? 'Đang lưu...' : 'Lưu hạng thành viên'}</span>
                </button>
              </div>
            </div>
          )}

          {/* OVERVIEW GRID OF TIERS SUMMARY CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {tiers.map((tier) => (
              <div
                key={tier.ma_hang}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderTop: `4px solid ${tier.mau_sac || '#2563eb'}`,
                  borderRadius: '14px',
                  padding: '1.25rem',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: `${tier.mau_sac || '#2563eb'}15`, color: tier.mau_sac || '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Award size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: '#0f172a', fontWeight: '700', fontSize: '1rem' }}>
                        Hạng {tier.ten_hang}
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mã: {tier.ma_hang}</span>
                    </div>
                  </div>

                  <span style={{ background: tier.mau_sac || '#2563eb', color: '#ffffff', fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                    {tier.ma_hang}
                  </span>
                </div>

                {/* Key parameters pill grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Mốc điểm</span>
                    <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{fmtNumber(tier.diem_toi_thieu)} pt</strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Chi tiêu/Tháng</span>
                    <strong style={{ fontSize: '0.875rem', color: '#2563eb' }}>{tier.chi_tieu_toi_thieu_thang ? `${fmtNumber(tier.chi_tieu_toi_thieu_thang)}đ` : 'Không bắt buộc'}</strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Hệ số điểm</span>
                    <strong style={{ fontSize: '0.875rem', color: '#059669' }}>{tier.he_so_diem}x</strong>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.65rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Lượt quay</span>
                    <strong style={{ fontSize: '0.875rem', color: '#7c3aed' }}>{tier.luot_quay_thang || 1} lượt/tháng</strong>
                  </div>
                </div>

                {/* Vouchers overview */}
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78125rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Quà thăng hạng: </span>
                    <span style={{ fontWeight: '600', color: '#2563eb' }}>{tier.ma_voucher_thang_hang ? `Voucher ${tier.ma_voucher_thang_hang}` : 'Tự động tạo'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Quà sinh nhật: </span>
                    <span style={{ fontWeight: '600', color: '#7c3aed' }}>{tier.ma_voucher_sinh_nhat ? `Voucher ${tier.ma_voucher_sinh_nhat}` : 'Tự động tạo'}</span>
                  </div>
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', justifyContent: 'flex-end' }}>
                  {tier.ma_hang !== 'MEMBER' && (
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => handleDeleteTier(tier.ma_hang)}
                      style={{
                        backgroundColor: '#fef2f2',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.78125rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Trash2 size={14} color="#dc2626" />
                      <span style={{ color: '#dc2626' }}>Xóa</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditTierForm(tier)}
                    style={{
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.78125rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Edit3 size={14} color="#2563eb" />
                    Chỉnh sửa
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: LUCKY WHEEL CONFIG */}
      {activeSubTab === 'wheel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* HERO KPI HEADER CARD */}
          <div
            style={{
              padding: '1.1rem 1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  minWidth: '42px',
                  minHeight: '42px',
                  borderRadius: '12px',
                  backgroundColor: '#fef3c7',
                  color: '#d97706',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  lineHeight: '42px',
                  flexShrink: 0,
                  margin: 0,
                  padding: 0
                }}
              >
                <Coins size={22} color="#d97706" style={{ margin: 'auto' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                  Chi phí mỗi lượt quay may mắn
                </h3>
                <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                  Số điểm khả dụng bị trừ của khách hàng cho 1 lần quay
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem', width: '160px' }}>
                <Coins size={16} color="#d97706" style={{ flexShrink: 0 }} />
                <input
                  type="number"
                  min="1"
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', boxShadow: 'none' }}
                  value={wheelCost}
                  onChange={(e) => setWheelCost(Number(e.target.value))}
                />
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>pt</span>
              </div>

              {/* Total Probability Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9999px',
                  backgroundColor: isWheelProbabilityValid ? '#ecfdf5' : '#fef2f2',
                  border: isWheelProbabilityValid ? '1px solid #a7f3d0' : '1px solid #fecaca',
                  fontSize: '0.8125rem',
                  fontWeight: '700',
                  color: isWheelProbabilityValid ? '#059669' : '#dc2626'
                }}
              >
                <Sparkles size={16} color={isWheelProbabilityValid ? '#059669' : '#dc2626'} />
                <span>Tổng xác suất: {totalProbability}% {isWheelProbabilityValid ? '(Hợp lệ)' : '(Phải = 100%)'}</span>
              </div>
            </div>
          </div>

          {/* MASTER-DETAIL LAYOUT (2 COLUMNS) */}
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem' }}>
            
            {/* COLUMN 1: MASTER LIST (8 PRIZE CARDS) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={16} color="#475569" /> Danh sách 8 Ô Thưởng
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Nhấp để sửa</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {prizes.map((prize) => {
                  const isSelected = prize.id === selectedPrizeId;
                  return (
                    <div
                      key={prize.id}
                      onClick={() => setSelectedPrizeId(prize.id)}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #6366f1' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: isSelected ? '0 6px 16px -2px rgba(99, 102, 241, 0.18)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            minWidth: '32px',
                            minHeight: '32px',
                            borderRadius: '50%',
                            backgroundColor: prize.mau || '#4f46e5',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            lineHeight: '32px',
                            fontSize: '0.8125rem',
                            fontWeight: '800',
                            flexShrink: 0,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
                            margin: 0,
                            padding: 0
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', lineHeight: 1, margin: 0, padding: 0 }}>
                            #{prize.id}
                          </span>
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.84rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {prize.ten}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                            {prize.loai === 'POINTS' ? `+${fmtNumber(prize.gia_tri)} pt` : prize.loai === 'VOUCHER' ? 'Voucher giảm giá' : prize.loai === 'FREE_TOPPING' ? 'Free 1 Topping' : `Free ${prize.ten_san_pham_tang || 'món'}`}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                        <span
                          style={{
                            fontWeight: '700',
                            fontSize: '0.8125rem',
                            color: isSelected ? '#4f46e5' : '#334155',
                            backgroundColor: isSelected ? '#e0e7ff' : '#f1f5f9',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px'
                          }}
                        >
                          {prize.xac_suat}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COLUMN 2: DETAIL CONFIG FORM FOR SELECTED PRIZE */}
            {activePrize && activePrize.id ? (
              <div
                className="system-admin-card"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Card Header */}
                <div
                  style={{
                    padding: '1.1rem 1.5rem',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        minWidth: '38px',
                        minHeight: '38px',
                        borderRadius: '10px',
                        backgroundColor: activePrize.mau ? `${activePrize.mau}20` : '#eef2ff',
                        color: activePrize.mau || '#4f46e5',
                        border: `1px solid ${activePrize.mau || '#c7d2fe'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        lineHeight: '38px',
                        fontWeight: '800',
                        fontSize: '0.9rem',
                        flexShrink: 0
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', lineHeight: 1, margin: 0, padding: 0 }}>
                        #{activePrize.id}
                      </span>
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                        Cấu hình Ô Thưởng #{activePrize.id}: {activePrize.ten}
                      </h3>
                      <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                        Tùy chỉnh thông số phần thưởng và xác suất trúng cho vị trí ô #{activePrize.id}
                      </span>
                    </div>
                  </div>

                  <span style={{ background: '#e2e8f0', color: '#334155', padding: '0.35rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', lineHeight: 1 }}>
                    Loại: {activePrize.loai}
                  </span>
                </div>

                {/* Card Body Form */}
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    
                    {/* Loại phần thưởng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Loại phần thưởng <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                        <Tag size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <select
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer', fontWeight: '600' }}
                          value={activePrize.loai}
                          onChange={(e) => handleActivePrizeChange('loai', e.target.value)}
                        >
                          <option value="POINTS">Cộng điểm khả dụng</option>
                          <option value="VOUCHER">Tặng Voucher giảm giá</option>
                          <option value="FREE_ITEM">Tặng sản phẩm menu</option>
                          <option value="FREE_TOPPING">Tặng Voucher Free Topping</option>
                        </select>
                      </div>
                    </div>

                    {/* Tên hiển thị */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Tên hiển thị trên vòng quay <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                        <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          type="text"
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                          value={activePrize.ten}
                          onChange={(e) => handleActivePrizeChange('ten', e.target.value)}
                          placeholder="VD: +50 Điểm hoặc Free Phin Sữa"
                        />
                      </div>
                    </div>

                    {/* Màu sắc ô quay */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Màu sắc ô quay
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                        <Palette size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          type="color"
                          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
                          value={activePrize.mau || '#4f46e5'}
                          onChange={(e) => handleActivePrizeChange('mau', e.target.value)}
                        />
                        <input
                          type="text"
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                          value={activePrize.mau || '#4f46e5'}
                          onChange={(e) => handleActivePrizeChange('mau', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Xác suất (%) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Tỉ lệ xác suất trúng (%) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                        <Sparkles size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', fontWeight: '700', color: '#0f172a', boxShadow: 'none' }}
                          value={activePrize.xac_suat}
                          onChange={(e) => handleActivePrizeChange('xac_suat', Number(e.target.value))}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>%</span>
                      </div>
                    </div>
                  </div>

                  {/* DYNAMIC FIELD BASED ON LOAI */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    {activePrize.loai === 'POINTS' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                          Số điểm cộng cho khách hàng
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0 0.85rem', gap: '0.65rem' }}>
                          <Coins size={16} color="#d97706" style={{ flexShrink: 0 }} />
                          <input
                            type="number"
                            min="1"
                            style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', boxShadow: 'none' }}
                            value={activePrize.gia_tri}
                            onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                          />
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>pt</span>
                        </div>
                      </div>
                    )}

                    {activePrize.loai === 'VOUCHER' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                          Chọn Mẫu Voucher Vòng Quay
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0 0.85rem', gap: '0.65rem' }}>
                          <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                          <select
                            style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.82rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                            value={activePrize.ma_voucher || ''}
                            onChange={(e) => handleActivePrizeChange('ma_voucher', e.target.value)}
                          >
                            <option value="">-- Chọn Mẫu Voucher Vòng Quay --</option>
                            {(luckyWheelVouchers.length > 0 ? luckyWheelVouchers : activeTemplateVouchers).map((v) => (
                              <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                                {formatVoucherOptionText(v)}
                              </option>
                            ))}
                          </select>
                        </div>
                        {renderVoucherDetailBadge(activePrize.ma_voucher)}
                        {!activePrize.ma_voucher && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.35rem' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Số tiền giảm thủ công (nếu không chọn voucher mẫu):</span>
                            <div style={{ display: 'flex', alignItems: 'center', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0 0.85rem' }}>
                              <input
                                type="number"
                                style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                                value={activePrize.gia_tri}
                                onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                                placeholder="Số tiền giảm (đ)"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activePrize.loai === 'FREE_ITEM' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                          Sản phẩm Menu tặng kèm
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0 0.85rem', gap: '0.65rem' }}>
                          <Gift size={16} color="#64748b" style={{ flexShrink: 0 }} />
                          {menuProducts.length > 0 ? (
                            <select
                              style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.82rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                              value={activePrize.ten_san_pham_tang || ''}
                              onChange={(e) => handleActivePrizeChange('ten_san_pham_tang', e.target.value)}
                            >
                              <option value="">-- Chọn Sản phẩm Menu --</option>
                              {menuProducts.map((pName) => (
                                <option key={pName} value={pName}>{pName}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                              value={activePrize.ten_san_pham_tang || ''}
                              onChange={(e) => handleActivePrizeChange('ten_san_pham_tang', e.target.value)}
                              placeholder="VD: Phin Sữa Đá"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {activePrize.loai === 'FREE_TOPPING' && (
                      <div style={{ backgroundColor: '#ecfdf5', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #a7f3d0', fontSize: '0.8125rem', color: '#047857', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Sparkles size={20} color="#059669" style={{ flexShrink: 0 }} />
                        <div>
                          <strong>Voucher Free Topping:</strong> Khi khách quay trúng ô này, hệ thống tự động cấp 1 voucher miễn phí 1 topping bất kỳ cho đơn hàng kế tiếp.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* VALIDATION & SAVE FOOTER */}
          <div
            style={{
              padding: '1rem 1.5rem',
              backgroundColor: isWheelProbabilityValid ? '#ecfdf5' : '#fef2f2',
              borderRadius: '16px',
              border: `1px solid ${isWheelProbabilityValid ? '#a7f3d0' : '#fecaca'}`,
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              <span style={{ fontWeight: '600', color: '#334155', fontSize: '0.875rem' }}>Trạng thái cấu hình Vòng quay: </span>
              <strong style={{ fontSize: '0.95rem', color: isWheelProbabilityValid ? '#059669' : '#dc2626', marginLeft: '0.35rem' }}>
                Tổng xác suất = {totalProbability}%
              </strong>
              {!isWheelProbabilityValid && (
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78125rem', color: '#dc2626', fontWeight: '600' }}>
                  Lưu ý: Tổng xác suất của 8 ô phần thưởng phải bằng đúng 100% để lưu!
                </p>
              )}
            </div>

            <button
              type="button"
              className="btn-save-green"
              onClick={saveWheelConfig}
              disabled={savingMembershipConfig || !isWheelProbabilityValid}
            >
              <CheckCircle2 size={18} color="#ffffff" />
              <span>{savingMembershipConfig ? 'Đang lưu...' : 'Lưu Cấu Hình Vòng Quay'}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
