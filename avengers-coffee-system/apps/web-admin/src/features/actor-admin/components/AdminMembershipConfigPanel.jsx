import React, { useState, useEffect } from 'react';

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

  const handleTierChange = (index, field, value) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };

  const handleActivePrizeChange = (field, value) => {
    if (activePrizeIndex === -1) return;
    const updated = [...prizes];
    const current = { ...updated[activePrizeIndex], [field]: value };

    // Tự động điền tên hiển thị nếu chọn voucher hoặc free item
    if (field === 'ma_voucher' && value) {
      const foundVoucher = (promotionsState?.items || []).find(v => v.ma_khuyen_mai === value);
      if (foundVoucher) {
        current.ten = foundVoucher.ten_khuyen_mai || foundVoucher.ma_khuyen_mai;
        current.gia_tri = Number(foundVoucher.gia_tri || 0);
      }
    } else if (field === 'ten_san_pham_tang' && value) {
      current.ten = `Free ${value}`;
    }

    updated[activePrizeIndex] = current;
    setPrizes(updated);
  };

  const totalProbability = prizes.reduce((sum, p) => sum + Number(p.xac_suat || 0), 0);
  const isWheelProbabilityValid = Math.abs(totalProbability - 100) < 0.01;

  // Lọc voucher hoạt động theo từng phân loại ngữ cảnh template
  const hasContext = (v, ctxCode) => {
    if (v.loai_phan_phoi === 'TEMPLATE') {
      const rawCtx = v.ngu_canh_su_dung || ''
      const list = typeof rawCtx === 'string'
        ? rawCtx.split(',').map((s) => s.trim().toUpperCase())
        : (Array.isArray(rawCtx) ? rawCtx : [])
      return list.includes(ctxCode)
    }
    return v.loai_su_kien === ctxCode
  }

  const activeVouchers = (promotionsState?.items || []).filter((p) => p.trang_thai === 'ACTIVE')
  const tierUpVouchers = activeVouchers.filter((p) => hasContext(p, 'TIER_UP'))
  const birthdayVouchers = activeVouchers.filter((p) => hasContext(p, 'BIRTHDAY'))
  const freeshipVouchers = activeVouchers.filter((p) => hasContext(p, 'FREESHIP'))
  const luckyWheelVouchers = activeVouchers.filter((p) => hasContext(p, 'LUCKY_WHEEL'))

  const formatVoucherOptionText = (v) => {
    const code = v.ma_khuyen_mai || v.ma_voucher || ''
    const name = v.ten_khuyen_mai || v.ten_voucher || ''
    const type = v.loai_khuyen_mai || v.loai || ''
    const val = Number(v.gia_tri || 0)

    let valStr = ''
    if (type === 'PERCENT') {
      const maxStr = v.giam_toi_da ? ` (Tối đa ${Number(v.giam_toi_da).toLocaleString('vi-VN')}đ)` : ''
      valStr = `Giảm ${val}%${maxStr}`
    } else if (type === 'FIXED') {
      valStr = `Giảm ${val.toLocaleString('vi-VN')}đ`
    } else if (type === 'FREE_ITEM') {
      valStr = `Tặng ${v.ten_san_pham_tang || 'món'}`
    } else {
      valStr = `Giảm ${val}`
    }

    const minOrder = Number(v.gia_tri_don_toi_thieu || v.don_hang_toi_thieu || 0)
    const minOrderStr = minOrder > 0 ? ` | Đơn từ ${minOrder.toLocaleString('vi-VN')}đ` : ' | Đơn từ 0đ'
    const daysStr = v.so_ngay_hieu_luc ? ` | Hạn ${v.so_ngay_hieu_luc} ngày` : ' | Hạn 30 ngày'

    return `[${code}] ${name} — ${valStr}${minOrderStr}${daysStr}`
  }

  const renderVoucherDetailBadge = (code) => {
    if (!code) return null
    const found = (promotionsState?.items || []).find((v) => (v.ma_khuyen_mai || v.ma_voucher) === code)
    if (!found) return null

    const type = found.loai_khuyen_mai || found.loai || 'PERCENT'
    const val = Number(found.gia_tri || 0)
    let valStr = ''
    if (type === 'PERCENT') {
      valStr = `Giảm ${val}%`
    } else if (type === 'FIXED') {
      valStr = `Giảm ${val.toLocaleString('vi-VN')}đ`
    } else if (type === 'FREE_ITEM') {
      valStr = `Tặng ${found.ten_san_pham_tang || 'sản phẩm'}`
    } else {
      valStr = `Giảm ${val}`
    }

    const minOrder = Number(found.gia_tri_don_toi_thieu || found.don_hang_toi_thieu || 0)
    const maxDiscount = found.giam_toi_da ? Number(found.giam_toi_da).toLocaleString('vi-VN') + 'đ' : 'Không giới hạn'
    const days = found.so_ngay_hieu_luc || 30

    return (
      <div style={{ marginTop: '0.35rem', padding: '0.45rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e8e2da', fontSize: '0.76rem', color: '#4b5563', lineHeight: 1.4 }}>
        <div style={{ fontWeight: '700', color: '#1a1a1a' }}>{found.ten_khuyen_mai || found.ten_voucher} ({found.ma_khuyen_mai || found.ma_voucher})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          <span>• <strong>Mức giảm:</strong> <span style={{ color: '#c41230', fontWeight: '800' }}>{valStr}</span></span>
          <span>• <strong>Giảm tối đa:</strong> {maxDiscount}</span>
          <span>• <strong>Đơn tối thiểu:</strong> {minOrder > 0 ? `${minOrder.toLocaleString('vi-VN')}đ` : '0đ (Không giới hạn)'}</span>
          <span>• <strong>Hạn dùng cấp:</strong> {days} ngày</span>
        </div>
      </div>
    )
  }

  // Danh sách sản phẩm menu
  const menuProducts = (menuState?.items || []).map(item => item.name || item.ten_san_pham).filter(Boolean);

  const saveTiersConfig = () => {
    for (let i = 1; i < tiers.length; i++) {
      if (Number(tiers[i].diem_toi_thieu) <= Number(tiers[i - 1].diem_toi_thieu)) {
        window.alert(`Lỗi cấu hình: Điểm tối thiểu của hạng "${tiers[i].ten_hang}" phải lớn hơn hạng "${tiers[i - 1].ten_hang}"!`);
        return;
      }
    }
    
    const payload = tiers.map(t => ({
      ...t,
      diem_toi_thieu: Number(t.diem_toi_thieu || 0),
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
    return <div className="p-6 text-center text-[#8c6b56]">Đang tải cấu hình membership...</div>;
  }

  return (
    <section className="panel system-admin-panel">
      <div className="panel-head system-admin-panel-head" style={{ marginBottom: '1.25rem' }}>
        <h2>Thiết lập Membership &amp; Vòng Quay</h2>
        <span>Cấu hình mốc xét hạng, hệ số tích điểm, quà tặng thăng hạng và cơ cấu Vòng quay may mắn</span>
      </div>

      {/* Sub tabs navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e8e2da', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('ranks')}
          style={{
            background: activeSubTab === 'ranks' ? '#c41230' : '#f4f0eb',
            color: activeSubTab === 'ranks' ? '#ffffff' : '#4a3728',
            border: 'none',
            padding: '0.55rem 1.25rem',
            borderRadius: '10px',
            fontWeight: '700',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'all 0.15s ease-in-out'
          }}
        >
          Cấu hình Hạng &amp; Quà Tặng
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('wheel')}
          style={{
            background: activeSubTab === 'wheel' ? '#c41230' : '#f4f0eb',
            color: activeSubTab === 'wheel' ? '#ffffff' : '#4a3728',
            border: 'none',
            padding: '0.55rem 1.25rem',
            borderRadius: '10px',
            fontWeight: '700',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'all 0.15s ease-in-out'
          }}
        >
          Vòng Quay May Mắn (8 Ô)
        </button>
      </div>

      {membershipConfigsState.error ? (
        <div className="error-text" style={{ marginBottom: '1rem', color: '#c41230', fontWeight: '600' }}>{membershipConfigsState.error}</div>
      ) : null}

      {/* TAB 1: RANKS CONFIG */}
      {activeSubTab === 'ranks' && (
        <div className="space-y-6">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {tiers.map((tier, idx) => (
              <div
                key={tier.ma_hang}
                style={{
                  border: '1px solid #e8e2da',
                  borderTop: `4px solid ${tier.mau_sac || '#c41230'}`,
                  borderRadius: '14px',
                  padding: '1.25rem',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f4f0eb', paddingBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#1a1a1a', fontWeight: '800', fontSize: '1.1rem' }}>
                      Hạng {tier.ten_hang}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Mã định danh: {tier.ma_hang}</span>
                  </div>
                  <span style={{ background: tier.mau_sac || '#c41230', color: '#ffffff', fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                    {tier.ma_hang}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Mốc điểm xét hạng</span>
                    <input
                      type="number"
                      value={tier.diem_toi_thieu}
                      onChange={(e) => handleTierChange(idx, 'diem_toi_thieu', Number(e.target.value))}
                      disabled={tier.ma_hang === 'MEMBER'}
                      min="0"
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontWeight: '700', backgroundColor: tier.ma_hang === 'MEMBER' ? '#f9fafb' : '#ffffff' }}
                    />
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Hệ số tích điểm</span>
                      <input
                        type="number"
                        step="0.1"
                        value={tier.he_so_diem}
                        onChange={(e) => handleTierChange(idx, 'he_so_diem', Number(e.target.value))}
                        min="1"
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                      />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Lượt quay / Tháng</span>
                      <input
                        type="number"
                        value={tier.luot_quay_thang || 1}
                        onChange={(e) => handleTierChange(idx, 'luot_quay_thang', Number(e.target.value))}
                        min="1"
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                      />
                    </label>
                  </div>

                  {/* VOUCHER SELECTION */}
                  <div style={{ background: '#faf7f4', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e8e2da', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#c41230' }}>Quà Thăng Hạng</span>
                      <select
                        value={tier.ma_voucher_thang_hang || ''}
                        onChange={(e) => handleTierChange(idx, 'ma_voucher_thang_hang', e.target.value)}
                        style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.82rem' }}
                      >
                        <option value="">-- Mặc định (Tự động tạo Voucher) --</option>
                        {(tierUpVouchers.length > 0 ? tierUpVouchers : activeVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </select>
                      {renderVoucherDetailBadge(tier.ma_voucher_thang_hang)}
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#7c3aed' }}>Quà Sinh Nhật</span>
                      <select
                        value={tier.ma_voucher_sinh_nhat || ''}
                        onChange={(e) => handleTierChange(idx, 'ma_voucher_sinh_nhat', e.target.value)}
                        style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.82rem' }}
                      >
                        <option value="">-- Mặc định (Tự động tạo Voucher) --</option>
                        {(birthdayVouchers.length > 0 ? birthdayVouchers : activeVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </select>
                      {renderVoucherDetailBadge(tier.ma_voucher_sinh_nhat)}
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingTop: '0.45rem', borderTop: '1px dashed #e8e2da' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#059669' }}>Ưu đãi giao hàng</span>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Mức giảm phí ship (đ)</span>
                        <input
                          type="number"
                          min="0"
                          value={tier.freeship_value ?? 0}
                          onChange={(e) => handleTierChange(idx, 'freeship_value', Number(e.target.value))}
                          placeholder="0 = Không hỗ trợ"
                          style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.82rem', fontWeight: '600' }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Đơn tối thiểu áp dụng (đ)</span>
                        <input
                          type="number"
                          min="0"
                          value={tier.freeship_min_order ?? 0}
                          onChange={(e) => handleTierChange(idx, 'freeship_min_order', Number(e.target.value))}
                          placeholder="0 = Mọi đơn hàng"
                          style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.82rem', fontWeight: '600' }}
                        />
                      </label>
                      <span style={{ fontSize: '0.74rem', color: '#4b5563', fontStyle: 'italic', marginTop: '0.1rem' }}>
                        {Number(tier.freeship_value || 0) > 0
                          ? `Hiển thị: Giảm ${Number(tier.freeship_value).toLocaleString('vi-VN')}đ phí ship${Number(tier.freeship_min_order || 0) > 0 ? ` đơn từ ${Number(tier.freeship_min_order).toLocaleString('vi-VN')}đ` : ''}`
                          : 'Hiển thị: Không hỗ trợ phí ship'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={saveTiersConfig}
              disabled={savingMembershipConfig}
              style={{
                backgroundColor: '#c41230',
                color: '#ffffff',
                border: 'none',
                padding: '0.65rem 2rem',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '0.92rem',
                cursor: 'pointer',
                opacity: savingMembershipConfig ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(196, 18, 48, 0.2)'
              }}
            >
              {savingMembershipConfig ? 'Đang lưu...' : 'Lưu Cấu Hình Hạng'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: LUCKY WHEEL CONFIG */}
      {activeSubTab === 'wheel' && (
        <div className="space-y-6">
          <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#ffffff', border: '1px solid #e8e2da', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1a1a1a' }}>Chi phí mỗi lượt quay (Điểm khả dụng):</span>
              <input
                type="number"
                value={wheelCost}
                onChange={(e) => setWheelCost(Number(e.target.value))}
                min="1"
                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #e8e2da', width: '120px', fontWeight: '700', fontSize: '1rem', color: '#c41230' }}
              />
            </label>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Điểm khả dụng bị trừ của mỗi lượt quay</span>
          </div>

          {/* MASTER-DETAIL LAYOUT (2 COLUMNS) */}
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.25rem', marginTop: '1rem' }}>
            
            {/* COLUMN 1: MASTER LIST (8 CARDS) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.88rem', fontWeight: '600', color: '#374151' }}>
                Danh sách 8 Ô Thưởng:
              </h3>
              {prizes.map((prize) => {
                const isSelected = prize.id === selectedPrizeId;
                return (
                  <div
                    key={prize.id}
                    onClick={() => setSelectedPrizeId(prize.id)}
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #c41230' : '1px solid #e8e2da',
                      backgroundColor: isSelected ? '#fff7ed' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: prize.mau || '#c41230',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: '700'
                        }}
                      >
                        #{prize.id}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1a1a1a' }}>
                          {prize.ten}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {prize.loai === 'POINTS' ? `+${prize.gia_tri} điểm` : prize.loai === 'VOUCHER' ? 'Voucher' : `${prize.ten_san_pham_tang || 'Món'}`}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontWeight: '700', fontSize: '0.85rem', color: isSelected ? '#c41230' : '#4b5563' }}>
                      {prize.xac_suat}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* COLUMN 2: DETAIL FORM FOR SELECTED PRIZE */}
            {activePrize && activePrize.id ? (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e8e2da',
                  borderRadius: '14px',
                  padding: '1.25rem',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f4f0eb', paddingBottom: '0.65rem' }}>
                  <h3 style={{ margin: 0, color: '#c41230', fontWeight: '700', fontSize: '0.98rem' }}>
                    Chỉnh sửa Ô Thưởng #{activePrize.id}
                  </h3>
                  <span style={{ background: '#f4f0eb', color: '#4a3728', padding: '0.15rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {activePrize.loai}
                  </span>
                </div>

                {/* FORM FIELDS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Loại Thưởng</span>
                    <select
                      value={activePrize.loai}
                      onChange={(e) => handleActivePrizeChange('loai', e.target.value)}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontWeight: '600', color: '#c41230' }}
                    >
                      <option value="POINTS">Cộng điểm khả dụng</option>
                      <option value="VOUCHER">Tặng Voucher giảm giá</option>
                      <option value="FREE_ITEM">Tặng sản phẩm menu</option>
                    </select>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Tên hiển thị</span>
                    <input
                      type="text"
                      value={activePrize.ten}
                      onChange={(e) => handleActivePrizeChange('ten', e.target.value)}
                      placeholder="VD: +50 Điểm hoặc Free Phin Sữa"
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                    />
                  </label>
                </div>

                {/* DYNAMIC FIELD BASED ON LOAI */}
                <div style={{ background: '#faf7f4', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e8e2da' }}>
                  {activePrize.loai === 'POINTS' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Số điểm cộng</span>
                      <input
                        type="number"
                        value={activePrize.gia_tri}
                        onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                        min="1"
                        style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontWeight: '700' }}
                      />
                    </label>
                  )}

                  {activePrize.loai === 'VOUCHER' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Chọn Mẫu Voucher Vòng Quay</span>
                      <select
                        value={activePrize.ma_voucher || ''}
                        onChange={(e) => handleActivePrizeChange('ma_voucher', e.target.value)}
                        style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                      >
                        <option value="">-- Chọn Mẫu Voucher Vòng Quay --</option>
                        {(luckyWheelVouchers.length > 0 ? luckyWheelVouchers : activeVouchers).map((v) => (
                          <option key={v.ma_khuyen_mai} value={v.ma_khuyen_mai}>
                            {formatVoucherOptionText(v)}
                          </option>
                        ))}
                      </select>
                      {renderVoucherDetailBadge(activePrize.ma_voucher)}
                      {!activePrize.ma_voucher && (
                        <div style={{ marginTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Số tiền giảm thủ công (nếu không dùng voucher mẫu):</span>
                          <input
                            type="number"
                            value={activePrize.gia_tri}
                            onChange={(e) => handleActivePrizeChange('gia_tri', Number(e.target.value))}
                            placeholder="Số tiền giảm (đ)"
                            style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', marginTop: '0.2rem', width: '100%' }}
                          />
                        </div>
                      )}
                    </label>
                  )}

                  {activePrize.loai === 'FREE_ITEM' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Sản phẩm Menu tặng kèm</span>
                      {menuProducts.length > 0 ? (
                        <select
                          value={activePrize.ten_san_pham_tang || ''}
                          onChange={(e) => handleActivePrizeChange('ten_san_pham_tang', e.target.value)}
                          style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                        >
                          <option value="">-- Chọn Sản phẩm --</option>
                          {menuProducts.map((pName) => (
                            <option key={pName} value={pName}>{pName}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={activePrize.ten_san_pham_tang || ''}
                          onChange={(e) => handleActivePrizeChange('ten_san_pham_tang', e.target.value)}
                          placeholder="VD: Phin Sữa Đá"
                          style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da' }}
                        />
                      )}
                    </label>
                  )}
                </div>

                {/* UI PROPS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Màu sắc Ô Quay</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="color"
                        value={activePrize.mau || '#c41230'}
                        onChange={(e) => handleActivePrizeChange('mau', e.target.value)}
                        style={{ width: '38px', height: '34px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                      />
                      <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{activePrize.mau}</span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Xác suất (%)</span>
                    <input
                      type="number"
                      value={activePrize.xac_suat}
                      onChange={(e) => handleActivePrizeChange('xac_suat', Number(e.target.value))}
                      min="0"
                      max="100"
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #e8e2da', fontWeight: '700', color: '#c41230' }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {/* VALIDATION FOOTER */}
          <div
            style={{
              marginTop: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: isWheelProbabilityValid ? '#ecfdf5' : '#fef2f2',
              padding: '0.85rem 1.25rem',
              borderRadius: '12px',
              border: `1px solid ${isWheelProbabilityValid ? '#a7f3d0' : '#fecaca'}`
            }}
          >
            <div>
              <span style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>Tổng xác suất 8 ô quà: </span>
              <strong style={{ fontSize: '1.05rem', color: isWheelProbabilityValid ? '#059669' : '#dc2626', marginLeft: '0.35rem' }}>
                {totalProbability}%
              </strong>
              {!isWheelProbabilityValid && (
                <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: '#dc2626', fontWeight: '600' }}>
                  Tổng xác suất 8 ô phải bằng đúng 100%.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={saveWheelConfig}
              disabled={savingMembershipConfig || !isWheelProbabilityValid}
              style={{
                backgroundColor: isWheelProbabilityValid ? '#c41230' : '#9ca3af',
                color: '#ffffff',
                border: 'none',
                padding: '0.65rem 2rem',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '0.9rem',
                cursor: isWheelProbabilityValid ? 'pointer' : 'not-allowed',
                opacity: savingMembershipConfig ? 0.7 : 1,
                boxShadow: isWheelProbabilityValid ? '0 2px 8px rgba(196, 18, 48, 0.2)' : 'none'
              }}
            >
              {savingMembershipConfig ? 'Đang lưu...' : 'Lưu Cấu Hình Vòng Quay'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
