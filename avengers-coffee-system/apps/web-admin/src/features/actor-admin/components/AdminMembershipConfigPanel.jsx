import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import CurrencyInput from '../../../components/console/CurrencyInput'
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
  UserCheck,
  ArrowLeft,
  Coffee,
  Percent,
  Sliders
} from '../../../components/console/WorkspaceIcons';

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

const DEFAULT_PRIZES = [
  { id: 1, ten: '+50 điểm', loai: 'POINTS', gia_tri: 50, mau: '#ef4444', xac_suat: 25 },
  { id: 2, ten: '+100 điểm', loai: 'POINTS', gia_tri: 100, mau: '#f97316', xac_suat: 20 },
  { id: 3, ten: 'Voucher 10k', loai: 'VOUCHER', gia_tri: 10000, mau: '#f59e0b', xac_suat: 18 },
  { id: 4, ten: '+200 điểm', loai: 'POINTS', gia_tri: 200, mau: '#10b981', xac_suat: 12 },
  { id: 5, ten: 'Voucher 20k', loai: 'VOUCHER', gia_tri: 20000, mau: '#06b6d4', xac_suat: 10 },
  { id: 6, ten: 'Free 1 Topping', loai: 'FREE_TOPPING', gia_tri: 0, mau: '#3b82f6', xac_suat: 8 },
  { id: 7, ten: 'Free Phin Sữa', loai: 'FREE_ITEM', ten_san_pham_tang: 'Phin Sữa Đá', gia_tri: 0, mau: '#8b5cf6', xac_suat: 5 },
  { id: 8, ten: 'Voucher 50k', loai: 'VOUCHER', gia_tri: 50000, mau: '#ec4899', xac_suat: 2 },
];

const PRESET_WHEEL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

function LuckyWheelSvgPreview({ prizes = [], selectedPrizeId, onSelectPrize }) {
  const cx = 150;
  const cy = 150;
  const r = 125;
  const count = 8;
  const sliceDeg = 360 / count;
  const deg2rad = Math.PI / 180;
  const defaultColors = PRESET_WHEEL_COLORS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem', background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ position: 'relative', width: '240px', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="240" height="240" viewBox="0 0 300 300" style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 14px rgba(0, 0, 0, 0.08))' }}>
          {/* Outer Rim */}
          <circle cx={cx} cy={cy} r={r + 5} fill="#18181b" stroke="#ffffff" strokeWidth="2" />

          {/* 8 Slices */}
          {Array.from({ length: count }).map((_, i) => {
            const prize = prizes[i] || { id: i + 1, ten: `Ô #${i + 1}`, xac_suat: 12.5 };
            const isSelected = String(prize.id) === String(selectedPrizeId);
            const sliceColor = prize.mau || defaultColors[i % defaultColors.length];

            const startAngle = (i * sliceDeg - 112.5) * deg2rad;
            const endAngle = ((i + 1) * sliceDeg - 112.5) * deg2rad;
            const midAngle = (i * sliceDeg - 90) * deg2rad;

            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);

            const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

            const textRadius = r * 0.64;
            const tx = cx + textRadius * Math.cos(midAngle);
            const ty = cy + textRadius * Math.sin(midAngle);
            const rot = i * sliceDeg;

            return (
              <g
                key={prize.id || i}
                onClick={() => onSelectPrize(prize.id)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={pathD}
                  fill={sliceColor}
                  stroke={isSelected ? '#18181b' : '#ffffff'}
                  strokeWidth={isSelected ? 3.5 : 1.5}
                  opacity={isSelected ? 1 : 0.88}
                  style={{ transition: 'all 0.15s ease' }}
                />
                <g transform={`translate(${tx}, ${ty}) rotate(${rot})`}>
                  <text
                    x="0"
                    y="-4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="700"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)', pointerEvents: 'none', userSelect: 'none' }}
                  >
                    #{prize.id}
                  </text>
                  <text
                    x="0"
                    y="10"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="600"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)', pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {String(prize.ten || '').slice(0, 11)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Center Hub */}
          <circle cx={cx} cy={cy} r="30" fill="#ffffff" stroke="#e2e8f0" strokeWidth="3" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))" />
          <circle cx={cx} cy={cy} r="22" fill="#18181b" />
          <text x={cx} y={cy + 4} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" style={{ pointerEvents: 'none' }}>
            8 Ô
          </text>

          {/* Top Indicator Needle */}
          <polygon
            points={`${cx},28 ${cx - 9},6 ${cx + 9},6`}
            fill="#dc2626"
            stroke="#ffffff"
            strokeWidth="2"
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
          />
        </svg>
      </div>
      <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Nhấp trực tiếp vào ô trên vòng quay hoặc danh sách để chỉnh sửa
      </span>
    </div>
  );
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
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES);
  const [selectedPrizeId, setSelectedPrizeId] = useState(1);

  // Single Shared Tier Form State (for both Create & Edit)
  const formRef = React.useRef(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTierCode, setEditingTierCode] = useState(null); // null = create new, string = edit existing
  const [tierForm, setTierForm] = useState({
    ma_hang: '',
    ten_hang: '',
    mau_sac: '#536270',
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

  const activePrize = prizes.find(p => String(p.id) === String(selectedPrizeId)) || prizes[0] || {};
  const activePrizeIndex = prizes.findIndex(p => String(p.id) === String(selectedPrizeId));

  const openCreateTierForm = () => {
    const nextMinScore = tiers.length > 0 ? Number(tiers[tiers.length - 1].diem_toi_thieu || 0) + 1000 : 1000;
    setEditingTierCode(null);
    setTierForm({
      ma_hang: '',
      ten_hang: '',
      mau_sac: '#2563eb',
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
      mau_sac: tier.mau_sac || '#536270',
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

    if (field === 'loai') {
      if (value === 'POINTS') {
        current.loai = 'POINTS';
        current.gia_tri = current.gia_tri > 0 ? current.gia_tri : 50;
        current.ten = `+${current.gia_tri} điểm`;
        current.ma_voucher = null;
        current.ten_san_pham_tang = null;
      } else if (value === 'VOUCHER') {
        current.loai = 'VOUCHER';
        const defaultV = (luckyWheelVouchers.length > 0 ? luckyWheelVouchers[0] : activeTemplateVouchers[0])?.ma_khuyen_mai || '';
        current.ma_voucher = current.ma_voucher || defaultV;
        current.ten = current.ten?.includes('Voucher') ? current.ten : 'Voucher giảm giá';
        current.gia_tri = current.gia_tri > 0 ? current.gia_tri : 10000;
        current.ten_san_pham_tang = null;
      } else if (value === 'FREE_ITEM') {
        current.loai = 'FREE_ITEM';
        const defaultProd = menuProducts[0] || 'Phin Sữa Đá';
        current.ten_san_pham_tang = current.ten_san_pham_tang || defaultProd;
        current.ten = `Free ${current.ten_san_pham_tang}`;
        current.gia_tri = 0;
        current.ma_voucher = null;
      } else if (value === 'FREE_TOPPING') {
        current.loai = 'FREE_TOPPING';
        current.ten = 'Free 1 Topping';
        current.ten_san_pham_tang = '1 Topping';
        current.gia_tri = 0;
        current.ma_voucher = null;
      }
    } else if (field === 'ma_voucher' && value) {
      const foundVoucher = (promotionsState?.items || []).find(v => (v.ma_khuyen_mai || v.ma_voucher) === value);
      if (foundVoucher) {
        const val = Number(foundVoucher.gia_tri || 0);
        const type = foundVoucher.loai_khuyen_mai || foundVoucher.loai;
        let autoTitle = foundVoucher.ten_khuyen_mai || foundVoucher.ten_voucher;
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
    } else if (field === 'gia_tri' && current.loai === 'POINTS') {
      current.ten = `+${value} điểm`;
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
      <div className="admin-surface" style={{ marginTop: '0.35rem', padding: '0.45rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.76rem', color: '#4b5563', lineHeight: 1.4 }}>
        <div style={{ fontWeight: '700', color: '#1a1a1a' }}>{found.ten_khuyen_mai || found.ten_voucher} ({found.ma_khuyen_mai || found.ma_voucher})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          <span>• <strong>Mức giảm:</strong> <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{valStr}</span></span>
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
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải cấu hình membership...</div>;
  }

  return (
    <section className="panel system-admin-panel workspace-membership" style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* High-Impact Selected Sub Tabs Navigation Bar with Action Button */}
      <div className="admin-page-tools">
        <div className="admin-subtabs">
          <button
            aria-pressed={activeSubTab === 'ranks'}
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'ranks' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('ranks')}
          >
            <Award size={18} />
            <span>Cấu hình Hạng &amp; Quà Tặng ({tiers.length})</span>
          </button>

          <button
            aria-pressed={activeSubTab === 'wheel'}
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'wheel' ? 'is-active' : ''}`}
            onClick={() => setActiveSubTab('wheel')}
          >
            <Gift size={18} />
            <span>Vòng Quay May Mắn (8 Ô)</span>
          </button>
        </div>

        {activeSubTab === 'ranks' && (
          <button
            type="button"
            className={showTierForm ? 'workspace-back-button' : 'btn-save'}
            onClick={() => {
              if (showTierForm) {
                setShowTierForm(false);
                setEditingTierCode(null);
              } else {
                openCreateTierForm();
              }
            }}
            style={{
              height: '38px',
              padding: '0 1.1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '13px',
              fontWeight: '500',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {showTierForm ? (
              <>
                <ArrowLeft size={16} /> <span>Quay lại danh sách</span>
              </>
            ) : (
              <>
                <UserPlus size={16} /> <span>Tạo hạng thành viên mới</span>
              </>
            )}
          </button>
        )}
      </div>

      {membershipConfigsState.error ? (
        <div className="error-text" style={{ margin: 0, color: '#dc2626', fontWeight: '600' }}>{membershipConfigsState.error}</div>
      ) : null}

      {/* TAB 1: RANKS CONFIG */}
      {activeSubTab === 'ranks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* DETAIL & EDIT TIER VIEW */}
          {showTierForm && (
            <div
              ref={formRef}
              className="system-admin-card workspace-edit-form admin-surface membership-editor"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                overflow: 'hidden'
              }}
            >
              {/* Card Header */}
              <div
                className="workspace-form-heading admin-card-header"
                style={{
                  padding: '1.1rem 1.5rem',
                  backgroundColor: '#ffffff',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '8px',
                      backgroundColor: `${tierForm.mau_sac || '#2563eb'}18`,
                      color: tierForm.mau_sac || '#2563eb',
                      border: `1px solid ${tierForm.mau_sac || '#2563eb'}35`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Award size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '600', color: 'var(--text-main)' }}>
                      {editingTierCode ? `Chi tiết Hạng ${tierForm.ten_hang || editingTierCode}` : 'Tạo hạng thành viên mới'}
                    </h2>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Mã định danh #{tierForm.ma_hang || 'NEW'} — Thiết lập mốc xét hạng, quyền lợi và voucher
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {editingTierCode && editingTierCode !== 'MEMBER' && (
                    <button
                      type="button"
                      className="membership-editor-delete"
                      onClick={() => handleDeleteTier(editingTierCode)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        height: '34px',
                        padding: '0 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #fee2e2',
                        backgroundColor: '#fff1f2',
                        color: '#e11d48',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Xóa hạng</span>
                    </button>
                  )}
                </div>
              </div>

              <aside className="membership-editor-preview" style={{ '--tier-color': tierForm.mau_sac || '#2563eb' }}>
                <span className="membership-preview-label">XEM TRƯỚC QUYỀN LỢI</span>
                <div className="membership-preview-symbol"><Award size={34} /></div>
                <h3>{tierForm.ten_hang || 'Tên hạng thành viên'}</h3>
                <span className="membership-preview-code">#{tierForm.ma_hang || 'NEW'}</span>
                <div className="membership-preview-points"><strong>{fmtNumber(tierForm.diem_toi_thieu)}</strong><span>điểm xét hạng</span></div>
                <dl><div><dt>Hệ số tích điểm</dt><dd>{tierForm.he_so_diem || 1}×</dd></div><div><dt>Lượt quay / tháng</dt><dd>{tierForm.luot_quay_thang || 1}</dd></div><div><dt>Giảm phí ship</dt><dd>{fmtNumber(tierForm.freeship_value)}đ</dd></div></dl>
                <p>Cập nhật thông tin bên cạnh, sau đó chọn “Lưu hạng thành viên” để áp dụng.</p>
              </aside>
              {/* Form Body - Clean Grouped Sections */}
              <div className="membership-editor-fields" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* SECTION 1: THÔNG TIN ĐỊNH DANH & MÀU SẮC */}
                <div>
                  <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Thông tin hạng
                  </h4>
                  <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {/* Mã Hạng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-18716" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Mã định danh hạng <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="membershipconfigpanel-18716"
                        type="text"
                        className="shadcn-input ui-input"
                        value={tierForm.ma_hang || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ma_hang: e.target.value.toUpperCase() }))}
                        placeholder="VD: PLATINUM, DIAMOND..."
                        disabled={Boolean(editingTierCode)}
                      />
                    </div>

                    {/* Tên Hạng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-19494" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Tên hiển thị hạng <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="membershipconfigpanel-19494"
                        type="text"
                        className="shadcn-input ui-input"
                        value={tierForm.ten_hang || ''}
                        onChange={(e) => setTierForm((p) => ({ ...p, ten_hang: e.target.value }))}
                        placeholder="VD: Hạng Bạch Kim, Hạng Kim Cương"
                      />
                    </div>

                    {/* Màu Nhận Diện */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-color-hex" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Màu sắc đại diện
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="color"
                          className="tier-color-picker ui-input"
                          value={tierForm.mau_sac || '#536270'}
                          onChange={(e) => setTierForm((p) => ({ ...p, mau_sac: e.target.value }))}
                          title="Bấm để chọn màu sắc đại diện"
                        />
                        <input
                          id="membershipconfigpanel-color-hex"
                          type="text"
                          className="shadcn-input ui-input"
                          value={tierForm.mau_sac || '#536270'}
                          onChange={(e) => setTierForm((p) => ({ ...p, mau_sac: e.target.value }))}
                          placeholder="#536270"
                          maxLength={7}
                          style={{
                            flex: 1,
                            fontFamily: 'monospace',
                            fontWeight: '600',
                            textTransform: 'uppercase'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: TIÊU CHUẨN XÉT HẠNG & QUYỀN LỢI */}
                <div style={{ paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
                  <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Điều kiện & quyền lợi
                  </h4>
                  <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                    {/* Mốc Điểm Xét Hạng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-21859" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Mốc điểm tích lũy xét hạng (pt)
                      </label>
                      <input
                        id="membershipconfigpanel-21859"
                        type="number"
                        min="0"
                        className="shadcn-input ui-input"
                        value={tierForm.diem_toi_thieu || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, diem_toi_thieu: Number(e.target.value) }))}
                        disabled={tierForm.ma_hang === 'MEMBER'}
                      />
                    </div>

                    {/* Chi tiêu duy trì tháng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-22601" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Chi tiêu duy trì / Tháng (đ)
                      </label>
                      <CurrencyInput
                        id="membershipconfigpanel-22601"
                        className="shadcn-input"
                        value={tierForm.chi_tieu_toi_thieu_thang || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, chi_tieu_toi_thieu_thang: Number(e.target.value) }))}
                        placeholder="VD: 100.000"
                        disabled={tierForm.ma_hang === 'MEMBER'}
                      />
                    </div>

                    {/* Hệ Số Điểm */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-23431" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Hệ số tích điểm (VD: 1.2x)
                      </label>
                      <input
                        id="membershipconfigpanel-23431"
                        type="number"
                        step="0.1"
                        min="1"
                        className="shadcn-input ui-input"
                        value={tierForm.he_so_diem || 1}
                        onChange={(e) => setTierForm((p) => ({ ...p, he_so_diem: Number(e.target.value) }))}
                      />
                    </div>

                    {/* Lượt quay tháng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-24125" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Lượt quay may mắn / Tháng
                      </label>
                      <input
                        id="membershipconfigpanel-24125"
                        type="number"
                        min="1"
                        className="shadcn-input ui-input"
                        value={tierForm.luot_quay_thang || 1}
                        onChange={(e) => setTierForm((p) => ({ ...p, luot_quay_thang: Number(e.target.value) }))}
                      />
                    </div>

                    {/* Ưu đãi phí ship */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="membershipconfigpanel-24792" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Mức giảm phí ship (đ)
                      </label>
                      <CurrencyInput
                        id="membershipconfigpanel-24792"
                        className="shadcn-input"
                        value={tierForm.freeship_value || 0}
                        onChange={(e) => setTierForm((p) => ({ ...p, freeship_value: Number(e.target.value) }))}
                        placeholder="0 = Không hỗ trợ"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: QUÀ TẶNG VOUCHER TỰ ĐỘNG (THĂNG HẠNG & SINH NHẬT - 2 CỘT CÂN ĐỐI) */}
                <div style={{ paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <Gift size={16} color="var(--primary)" />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
                        Quà tặng tự động
                      </h4>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Hệ thống tự động cấp voucher tương ứng khi khách đạt mốc thăng hạng hoặc tới tháng sinh nhật
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                    {/* Quà thăng hạng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <label htmlFor="tier-voucher-thang-hang-select" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Quà Thăng Hạng (Voucher Template)
                      </label>
                      <SearchableSelect
                        id="tier-voucher-thang-hang-select"
                        value={tierForm.ma_voucher_thang_hang || ''}
                        onChange={(val) => {
                          const code = val?.target?.value ?? val;
                          setTierForm((p) => ({ ...p, ma_voucher_thang_hang: code }));
                        }}
                        placeholder="-- Mặc định (Tự động cấp Voucher) --"
                      >
                        <option value="">-- Mặc định (Tự động cấp Voucher) --</option>
                        {(tierUpVouchers.length > 0 ? tierUpVouchers : activeTemplateVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </SearchableSelect>
                      {renderVoucherDetailBadge(tierForm.ma_voucher_thang_hang)}
                    </div>

                    {/* Quà sinh nhật */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <label htmlFor="tier-voucher-sinh-nhat-select" style={{ color: '#344563', fontWeight: '500', fontSize: '13px' }}>
                        Quà Sinh Nhật (Voucher Template)
                      </label>
                      <SearchableSelect
                        id="tier-voucher-sinh-nhat-select"
                        value={tierForm.ma_voucher_sinh_nhat || ''}
                        onChange={(val) => {
                          const code = val?.target?.value ?? val;
                          setTierForm((p) => ({ ...p, ma_voucher_sinh_nhat: code }));
                        }}
                        placeholder="-- Mặc định (Tự động cấp Voucher) --"
                      >
                        <option value="">-- Mặc định (Tự động cấp Voucher) --</option>
                        {(birthdayVouchers.length > 0 ? birthdayVouchers : activeTemplateVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </SearchableSelect>
                      {renderVoucherDetailBadge(tierForm.ma_voucher_sinh_nhat)}
                    </div>
                  </div>
                </div>

              </div>

              {/* Form Action Footer */}
              <div className="membership-editor-footer"
                style={{
                  padding: '1rem 1.5rem',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem'
                }}
              >
                <button
                  type="button"
                  className="btn-save"
                  onClick={handleSaveTierForm}
                  disabled={savingMembershipConfig}
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    border: '1px solid var(--primary)',
                    height: '38px',
                    padding: '0 1.5rem',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  <UserCheck size={16} color="#ffffff" />
                  <span>{savingMembershipConfig ? 'Đang lưu...' : 'Lưu hạng thành viên'}</span>
                </button>
              </div>
            </div>
          )}

          {!showTierForm && <>
            <div className="membership-intro"><div><span>QUYỀN LỢI THÀNH VIÊN</span><h2>Thiết kế trải nghiệm cho từng hạng</h2><p>So sánh điều kiện, điểm thưởng và quà tặng. Chọn “Chi tiết” để cập nhật từng hạng.</p></div><div className="membership-total"><Award size={24} /><strong>{tiers.length}</strong><span>hạng thành viên</span></div></div>
            <div className="membership-tier-grid">
              {tiers.map(tier => <article key={tier.ma_hang} className="membership-tier" style={{ '--tier-color': tier.mau_sac || '#2563eb' }}>
                <header><div className="membership-tier-emblem"><Award size={26} /></div><div><small>#{tier.ma_hang}</small><h3>Hạng {tier.ten_hang}</h3></div>{tier.ma_hang === 'MEMBER' && <span className="membership-default">Mặc định</span>}</header>
                <div className="membership-threshold"><span>Mốc điểm xét hạng</span><div><strong>{fmtNumber(tier.diem_toi_thieu)}</strong><span>điểm</span></div></div>
                <div className="membership-benefits">
                  <div><Coins size={20} /><strong>{tier.he_so_diem}×</strong><span>Hệ số điểm</span></div>
                  <div><Gift size={20} /><strong>{tier.luot_quay_thang || 1}</strong><span>Lượt quay / tháng</span></div>
                </div>
                <dl className="membership-conditions"><div><dt>Chi tiêu / tháng</dt><dd>{tier.chi_tieu_toi_thieu_thang ? `${fmtNumber(tier.chi_tieu_toi_thieu_thang)}đ` : 'Không bắt buộc'}</dd></div><div><dt>Giảm phí ship</dt><dd>{tier.freeship_value ? `${fmtNumber(tier.freeship_value)}đ` : 'Không áp dụng'}</dd></div></dl>
                <div className="membership-gifts"><div><Tag size={17} /><span>Quà thăng hạng<strong>{tier.ma_voucher_thang_hang ? `Voucher ${tier.ma_voucher_thang_hang}` : 'Tự động tạo'}</strong></span></div><div><Gift size={17} /><span>Quà sinh nhật<strong>{tier.ma_voucher_sinh_nhat ? `Voucher ${tier.ma_voucher_sinh_nhat}` : 'Tự động tạo'}</strong></span></div></div>
                <footer>{tier.ma_hang !== 'MEMBER' && <button type="button" className="membership-delete" onClick={() => handleDeleteTier(tier.ma_hang)} aria-label={`Xóa hạng ${tier.ten_hang}`}><Trash2 size={16} />Xóa hạng</button>}<button type="button" className="membership-edit" onClick={() => openEditTierForm(tier)}><Edit3 size={16} />Chi tiết</button></footer>
              </article>)}
            </div>
          </>}
        </div>
      )}

      {/* TAB 2: LUCKY WHEEL CONFIG */}
      {activeSubTab === 'wheel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* TOP KPI & PROBABILITY HEADER: 2 BALANCED CARDS */}
          <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) 1fr', gap: '1.25rem', alignItems: 'stretch' }}>

            {/* Card 1: Spin Cost (Chi phí quay) */}
            <div
              className="admin-surface"
              style={{
                padding: '1.15rem 1.35rem',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Coins size={18} color="#2563eb" />
                </div>
                <div>
                  <label htmlFor="wheel-cost-input" style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', display: 'block' }}>
                    Chi phí mỗi lượt quay
                  </label>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Điểm khả dụng trừ của khách cho 1 lần quay
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '130px' }}>
                  <CurrencyInput
                    id="wheel-cost-input"
                    className="shadcn-input"
                    value={wheelCost}
                    onChange={(e) => setWheelCost(Number(e.target.value))}
                    placeholder="100"
                  />
                </div>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: '600' }}>pt / lượt</span>
              </div>
            </div>

            {/* Card 2: Probability Allocation (Phân bổ xác suất 8 ô) */}
            <div
              className="admin-surface"
              style={{
                padding: '1.15rem 1.35rem',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', display: 'block' }}>
                    Phân bổ xác suất 8 ô trên vòng quay
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Tổng tỷ lệ các múi thưởng phải đạt chính xác 100%
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: isWheelProbabilityValid ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${isWheelProbabilityValid ? '#a7f3d0' : '#fecaca'}`,
                      fontSize: '12px',
                      fontWeight: '600',
                      color: isWheelProbabilityValid ? '#059669' : '#dc2626'
                    }}
                  >
                    <Sparkles size={14} color={isWheelProbabilityValid ? '#059669' : '#dc2626'} />
                    <span>
                      {isWheelProbabilityValid ? `Tổng xác suất: 100% (Hợp lệ)` : `Tổng: ${totalProbability}% (${totalProbability < 100 ? `Thiếu ${(100 - totalProbability).toFixed(1)}%` : `Dư ${(totalProbability - 100).toFixed(1)}%`})`}
                    </span>
                  </div>

                  {!isWheelProbabilityValid && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrizes(prizes.map((p) => ({ ...p, xac_suat: 12.5 })));
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        height: '32px',
                        padding: '0 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: '#ffffff',
                        color: 'var(--primary)',
                        fontSize: '11.5px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                      title="Đặt lại tỉ lệ 12.5% đều cho cả 8 ô"
                    >
                      <RefreshCw size={12} />
                      <span>Cân bằng 12.5%</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Segmented multi-color progress bar */}
              <div>
                <div style={{ width: '100%', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', backgroundColor: '#e2e8f0' }}>
                  {prizes.map((p, i) => (
                    <div
                      key={p.id || i}
                      title={`Ô #${p.id} (${p.ten}): ${p.xac_suat}%`}
                      style={{
                        width: `${Math.max(0, p.xac_suat)}%`,
                        height: '100%',
                        backgroundColor: p.mau || PRESET_WHEEL_COLORS[i % PRESET_WHEEL_COLORS.length],
                        transition: 'width 0.2s ease'
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                  {prizes.map((p, i) => (
                    <span key={p.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.mau || PRESET_WHEEL_COLORS[i % PRESET_WHEEL_COLORS.length] }} />
                      #{p.id}: <strong style={{ color: '#1e293b' }}>{p.xac_suat}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* MASTER-DETAIL LAYOUT: WHEEL PREVIEW & 8-SLOT LIST (LEFT) + DETAIL EDITOR (RIGHT) */}
          <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) 1fr', gap: '1.25rem', alignItems: 'start' }}>

            {/* COLUMN 1: LIVE SVG WHEEL PREVIEW + 8 PRIZE SELECTOR CARDS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Interactive SVG Wheel */}
              <LuckyWheelSvgPreview
                prizes={prizes}
                selectedPrizeId={selectedPrizeId}
                onSelectPrize={(id) => setSelectedPrizeId(id)}
              />

              {/* List of 8 slots - strictly left-aligned */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem 0.4rem 0.25rem', borderBottom: '1px solid var(--border-light)' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={15} color="var(--primary)" /> Danh sách 8 Ô Thưởng
                  </h3>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Bấm để chỉnh sửa</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                  {prizes.map((prize, idx) => {
                    const isSelected = String(prize.id) === String(selectedPrizeId);
                    const sliceColor = prize.mau || PRESET_WHEEL_COLORS[idx % PRESET_WHEEL_COLORS.length];
                    return (
                      <div
                        className="membership-prize-choice"
                        aria-pressed={isSelected}
                        role="button"
                        tabIndex={0}
                        key={prize.id}
                        onClick={() => setSelectedPrizeId(prize.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPrizeId(prize.id) } }}
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: isSelected ? '0 1px 4px rgba(37,99,235,0.1)' : 'none',
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', textAlign: 'left' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: sliceColor,
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: '700',
                              flexShrink: 0,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
                            }}
                          >
                            #{prize.id}
                          </div>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                            <div style={{ fontWeight: isSelected ? '700' : '600', fontSize: '12.5px', color: isSelected ? '#1e40af' : 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                              {prize.ten}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textAlign: 'left' }}>
                              {prize.loai === 'POINTS' ? `+${fmtNumber(prize.gia_tri)} điểm khả dụng` : prize.loai === 'VOUCHER' ? 'Voucher giảm giá' : prize.loai === 'FREE_TOPPING' ? 'Free 1 Topping' : `Free ${prize.ten_san_pham_tang || 'món'}`}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                          <span
                            style={{
                              fontWeight: '700',
                              fontSize: '11.5px',
                              color: isSelected ? '#2563eb' : 'var(--text-muted)',
                              backgroundColor: isSelected ? '#ffffff' : '#f1f5fb',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '5px',
                              border: isSelected ? '1px solid #bfdbfe' : 'none'
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
            </div>

            {/* COLUMN 2: DETAIL CONFIG FORM FOR SELECTED PRIZE */}
            {activePrize && activePrize.id ? (
              <div
                className="system-admin-card admin-surface membership-prize-editor"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Card Header */}
                <div
                  className="admin-card-header"
                  style={{
                    padding: '1.1rem 1.5rem',
                    backgroundColor: '#ffffff',
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: activePrize.mau || 'var(--primary)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '13px',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                      }}
                    >
                      #{activePrize.id}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>
                        Cấu hình Ô Thưởng #{activePrize.id}: {activePrize.ten}
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Tùy chỉnh thông số phần thưởng, màu sắc và xác suất trúng cho vị trí ô #{activePrize.id}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Card Body Form */}
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* ROW 1: PRIZE TYPE & STRICTLY MATCHED SPECIFIC INPUT */}
                  <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 250px) 1fr', gap: '1.25rem' }}>
                    {/* Loại phần thưởng */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="prize-type-select" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                        Loại phần thưởng <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <SearchableSelect
                        id="prize-type-select"
                        value={activePrize.loai}
                        onChange={(val) => {
                          const v = val?.target?.value ?? val;
                          handleActivePrizeChange('loai', v);
                        }}
                      >
                        <option value="POINTS">Cộng điểm khả dụng</option>
                        <option value="VOUCHER">Tặng Voucher giảm giá</option>
                        <option value="FREE_ITEM">Tặng sản phẩm menu</option>
                        <option value="FREE_TOPPING">Tặng Voucher Free Topping</option>
                      </SearchableSelect>
                    </div>

                    {/* MATCHED REWARD SPECIFIC FIELD */}
                    {activePrize.loai === 'POINTS' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label htmlFor="prize-points-input" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                          Số điểm thưởng cộng cho khách <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ flex: 1, maxWidth: '240px' }}>
                            <CurrencyInput
                              id="prize-points-input"
                              className="shadcn-input"
                              value={activePrize.gia_tri || 0}
                              onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                              placeholder="VD: 50"
                            />
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>pt</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[50, 100, 200, 500].map((pt) => (
                              <button
                                key={pt}
                                type="button"
                                onClick={() => handleActivePrizeChange('gia_tri', pt)}
                                style={{
                                  padding: '3px 7px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  border: activePrize.gia_tri === pt ? '1px solid #2563eb' : '1px solid var(--border-light)',
                                  backgroundColor: activePrize.gia_tri === pt ? '#eff6ff' : '#ffffff',
                                  color: activePrize.gia_tri === pt ? '#2563eb' : '#64748b',
                                  cursor: 'pointer'
                                }}
                              >
                                +{pt}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activePrize.loai === 'VOUCHER' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label htmlFor="prize-voucher-select" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                          Chọn Mẫu Voucher vòng quay <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <SearchableSelect
                          id="prize-voucher-select"
                          value={activePrize.ma_voucher || ''}
                          onChange={(val) => {
                            const code = val?.target?.value ?? val;
                            handleActivePrizeChange('ma_voucher', code);
                          }}
                          placeholder="-- Chọn Mẫu Voucher Vòng Quay --"
                        >
                          <option value="">-- Chọn Mẫu Voucher Vòng Quay --</option>
                          {(luckyWheelVouchers.length > 0 ? luckyWheelVouchers : activeTemplateVouchers).map((v) => (
                            <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                              {formatVoucherOptionText(v)}
                            </option>
                          ))}
                        </SearchableSelect>
                      </div>
                    )}

                    {activePrize.loai === 'FREE_ITEM' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label htmlFor="prize-product-select" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                          Sản phẩm Menu tặng kèm <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        {menuProducts.length > 0 ? (
                          <SearchableSelect
                            id="prize-product-select"
                            value={activePrize.ten_san_pham_tang || ''}
                            onChange={(val) => {
                              const name = val?.target?.value ?? val;
                              handleActivePrizeChange('ten_san_pham_tang', name);
                            }}
                            placeholder="-- Chọn Sản phẩm Menu --"
                          >
                            <option value="">-- Chọn Sản phẩm Menu --</option>
                            {menuProducts.map((pName) => (
                              <option key={pName} value={pName}>{pName}</option>
                            ))}
                          </SearchableSelect>
                        ) : (
                          <input
                            id="prize-product-select"
                            type="text"
                            className="shadcn-input ui-input"
                            value={activePrize.ten_san_pham_tang || ''}
                            onChange={(e) => handleActivePrizeChange('ten_san_pham_tang', e.target.value)}
                            placeholder="VD: Phin Sữa Đá"
                          />
                        )}
                      </div>
                    )}

                    {activePrize.loai === 'FREE_TOPPING' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                          Quy cách phần thưởng
                        </label>
                        <div style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 0.85rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12.5px', color: '#1d4ed8', fontWeight: '500' }}>
                          ✨ Tặng 1 phần Topping miễn phí cho đơn hàng tiếp theo
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ROW 2: TÊN HIỂN THỊ TRÊN VÒNG QUAY */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="prize-name-input" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                        Tên hiển thị trên vòng quay <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tên ngắn hiển thị trên múi của vòng quay</span>
                    </div>
                    <input
                      id="prize-name-input"
                      type="text"
                      className="shadcn-input ui-input"
                      value={activePrize.ten || ''}
                      onChange={(e) => handleActivePrizeChange('ten', e.target.value)}
                      placeholder="VD: +50 Điểm hoặc Free Phin Sữa"
                    />
                  </div>

                  {/* ROW 3: COLOR SWATCHES & PROBABILITY INPUTS */}
                  <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>

                    {/* Màu sắc ô quay */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                        Màu sắc múi quay
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* 8 Preset Swatches */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {PRESET_WHEEL_COLORS.map((colorHex) => {
                            const isPicked = (activePrize.mau || '').toLowerCase() === colorHex.toLowerCase();
                            return (
                              <span
                                key={colorHex}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleActivePrizeChange('mau', colorHex)}
                                onKeyDown={(e) => e.key === 'Enter' && handleActivePrizeChange('mau', colorHex)}
                                className={`wheel-color-swatch ${isPicked ? 'is-selected' : ''}`}
                                style={{ '--swatch-color': colorHex }}
                                title={colorHex}
                              />
                            );
                          })}
                        </div>

                        {/* Custom Color: Native picker circle + Standard input (no wrapper box) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="color"
                            className="wheel-native-color ui-input"
                            value={activePrize.mau || '#ef4444'}
                            onChange={(e) => handleActivePrizeChange('mau', e.target.value)}
                            title="Bấm để chọn màu tùy biến"
                          />
                          <div style={{ width: '100px' }}>
                            <input
                              type="text"
                              className="shadcn-input ui-input"
                              value={activePrize.mau || '#ef4444'}
                              onChange={(e) => handleActivePrizeChange('mau', e.target.value)}
                              placeholder="#ef4444"
                              maxLength={7}
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: '600',
                                textTransform: 'uppercase'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Xác suất (%) với slider + standard input (no wrapper box) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="prize-prob-input" style={{ color: '#344563', fontWeight: '600', fontSize: '13px' }}>
                        Tỉ lệ xác suất trúng (%) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <input className="ui-input"
                          type="range"
                          min="0"
                          max="100"
                          step="0.5"
                          value={activePrize.xac_suat || 0}
                          onChange={(e) => handleActivePrizeChange('xac_suat', Number(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <div style={{ width: '85px' }}>
                          <input
                            id="prize-prob-input"
                            type="number"
                            className="shadcn-input ui-input"
                            min="0"
                            max="100"
                            step="0.5"
                            value={activePrize.xac_suat ?? 0}
                            onChange={(e) => handleActivePrizeChange('xac_suat', Number(e.target.value))}
                            style={{ textAlign: 'center', fontWeight: '600' }}
                          />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </div>

                  {/* ROW 4: OPTIONAL DETAILS & VOUCHER PREVIEW */}
                  {activePrize.loai === 'VOUCHER' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.25rem' }}>
                      {renderVoucherDetailBadge(activePrize.ma_voucher)}

                      {!activePrize.ma_voucher && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hoặc nhập số tiền giảm trực tiếp (khi không chọn Voucher mẫu):</span>
                          <div style={{ maxWidth: '240px' }}>
                            <CurrencyInput
                              className="shadcn-input"
                              value={activePrize.gia_tri || 0}
                              onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                              placeholder="Số tiền giảm (đ)"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activePrize.loai === 'FREE_TOPPING' && (
                    <div style={{ backgroundColor: "#f1f5fb", padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12.5px', color: '#1e40af', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Sparkles size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>Quy tắc tự động:</strong> Khi khách quay trúng ô này, hệ thống sẽ tự sinh 1 voucher miễn phí 1 topping bất kỳ vào ví voucher của khách hàng.
                      </div>
                    </div>
                  )}

                </div>

                {/* Form Save Action Footer */}
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    backgroundColor: '#ffffff',
                    borderTop: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    {isWheelProbabilityValid ? (
                      <span style={{ color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CheckCircle2 size={15} /> Tổng xác suất hợp lệ (100%)
                      </span>
                    ) : (
                      <span style={{ color: '#dc2626', fontWeight: '600' }}>
                        ⚠️ Tổng xác suất hiện là {totalProbability}%, cần đúng 100% để lưu
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-save"
                    onClick={saveWheelConfig}
                    disabled={savingMembershipConfig || !isWheelProbabilityValid}
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: '#ffffff',
                      border: '1px solid var(--primary)',
                      height: '38px',
                      padding: '0 1.5rem',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: !isWheelProbabilityValid ? 'not-allowed' : 'pointer',
                      opacity: !isWheelProbabilityValid ? 0.6 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                  >
                    <CheckCircle2 size={16} color="#ffffff" />
                    <span>{savingMembershipConfig ? 'Đang lưu...' : 'Lưu Cấu Hình Vòng Quay'}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
