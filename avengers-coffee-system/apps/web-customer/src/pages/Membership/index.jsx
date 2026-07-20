import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { GiftIcon, StarIcon, CheckBadgeIcon, CalendarIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

export default function MembershipPage({ user, onNavigate }) {
  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const queryClient = useQueryClient();
  const [birthDaySelect, setBirthDaySelect] = useState('01');
  const [birthMonthSelect, setBirthMonthSelect] = useState('01');
  const [birthYearSelect, setBirthYearSelect] = useState('2000');
  const [isEditingBirthday, setIsEditingBirthday] = useState(false);

  const daysInMonth = new Date(Number(birthYearSelect), Number(birthMonthSelect), 0).getDate();
  useEffect(() => {
    if (Number(birthDaySelect) > daysInMonth) {
      setBirthDaySelect(String(daysInMonth).padStart(2, '0'));
    }
  }, [birthMonthSelect, birthYearSelect, birthDaySelect, daysInMonth]);

  const { data: memData, isLoading, isError } = useQuery({
    queryKey: queryKeys.membershipByUser(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/membership`);
      return response.data;
    },
    enabled: Boolean(userId),
  });

  const updateBirthdayMutation = useMutation({
    mutationFn: async (ngaySinh) => {
      const response = await apiClient.patch(`/users/${userId}/birthday`, { ngay_sinh: ngaySinh });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.membershipByUser(userId) });
      setIsEditingBirthday(false);
      if (data?.nhanVoucherSinhNhat) {
        const event = new CustomEvent('birthday-voucher-received', { detail: { data } });
        window.dispatchEvent(event);
      } else {
        alert('Cập nhật ngày sinh thành công! 🎉');
      }
    },
    onError: (err) => {
      alert(err?.response?.data?.message || 'Không thể cập nhật ngày sinh.');
    },
  });

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] bg-[#fafaf9] p-6 text-center">
        <StarIcon className="h-16 w-16 text-gray-400 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black uppercase text-gray-800 mb-2">Hạng thành viên</h2>
        <p className="text-gray-500 mb-6 max-w-md">Vui lòng đăng nhập để xem thông tin hạng thành viên và các quyền lợi đặc biệt dành riêng cho bạn.</p>
        <button 
          onClick={() => onNavigate('login')}
          className="bg-[#1a8b46] hover:bg-[#156e37] text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg"
        >
          Đăng nhập ngay
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[1240px] mx-auto px-4 py-16 text-center space-y-6">
        <div className="h-32 w-full animate-pulse rounded-3xl bg-gray-100"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-56 animate-pulse rounded-3xl bg-gray-100"></div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-[1240px] mx-auto px-4 py-16 text-center text-red-600 font-semibold">
        Đã có lỗi xảy ra khi tải thông tin thành viên. Vui lòng thử lại sau.
      </div>
    );
  }

  const {
    diem_loyalty = 0,
    diem_kha_dung = 0,
    tong_chi_tieu = 0,
    hang_hien_tai = {},
    quyen_loi_hien_tai = {},
    tat_ca_hang = [],
    voucher_ca_nhan = [],
    ngay_sinh = null,
  } = memData || {};

  const tatCaHang = tat_ca_hang;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let birthMonth = null;
  let birthDay = null;
  let isTodayBirthday = false;
  let isBirthMonth = false;

  if (ngay_sinh) {
    const bDate = new Date(ngay_sinh);
    birthMonth = bDate.getMonth() + 1;
    birthDay = bDate.getDate();
    isTodayBirthday = (birthMonth === currentMonth && birthDay === currentDay);
    isBirthMonth = (birthMonth === currentMonth);
  }

  const hasBirthdayVoucher = Array.isArray(voucher_ca_nhan) && voucher_ca_nhan.some(v => 
    v.ma_khuyen_mai?.startsWith('BD_') || v.loai_su_kien === 'BIRTHDAY'
  );

  const handleUpdateBirthday = (e) => {
    e.preventDefault();
    const formattedDate = `${birthYearSelect}-${birthMonthSelect}-${birthDaySelect}`;
    updateBirthdayMutation.mutate(formattedDate);
  };

  const getTierGradient = (maHang) => {
    switch (maHang) {
      case 'SILVER': return 'from-[#4b5563] via-[#374151] to-[#1f2937]';
      case 'GOLD': return 'from-[#b5893d] via-[#a37c35] to-[#78591f]';
      case 'DIAMOND': return 'from-[#0284c7] via-[#0369a1] to-[#075985]';
      default: return 'from-[#8e8d8a] via-[#757472] to-[#595856]';
    }
  };

  const renderTierIcon = (maHang, sizeClass = "w-16 h-16") => {
    switch (maHang) {
      case 'SILVER':
        return (
          <div className={`rounded-full bg-slate-100/10 flex items-center justify-center border border-slate-400/40 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-slate-200" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3zm0 18c-3.75-1-6.5-5.22-6.5-9V6.3l6.5-2.17 6.5 2.17V11c0 3.78-2.75 8-6.5 9z"/>
            </svg>
          </div>
        );
      case 'GOLD':
        return (
          <div className={`rounded-full bg-amber-100/10 flex items-center justify-center border border-amber-400/40 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-amber-200" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v3c0 2.44 1.72 4.48 4 4.9C7.8 17.9 10.22 19 12 19c1.78 0 4.2-1.1 4.9-4.1 2.28-.42 4-2.46 4-4.9V7c0-1.1-.9-2-2-2zM5 10V7h2v3c0 .8-.17 1.53-.47 2.18C5.55 11.66 5 10.9 5 10zm14 0c0 .9-.55 1.66-1.53 2.18-.3-.65-.47-1.38-.47-2.18V7h2v3z"/>
            </svg>
          </div>
        );
      case 'DIAMOND':
        return (
          <div className={`rounded-full bg-cyan-100/10 flex items-center justify-center border border-cyan-400/40 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-cyan-200" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.14 2.16L3 9.16l9 12.68 9-12.68-8.86-7zM12 4.44l5.9 4.56H6.1L12 4.44zM5.38 11h3.37l-3.37 4.74V11zm4.84 0h3.56l-1.78 6.77L10.22 11zm5.03 0h3.37v4.74l-3.37-4.74z"/>
            </svg>
          </div>
        );
      default:
        return (
          <div className={`rounded-full bg-white/10 flex items-center justify-center border border-gray-400/40 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-gray-200" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296a3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043a3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296a3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043a3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
        );
    }
  };

  const nextTier = tatCaHang.find(h => h.diem > diem_loyalty);
  const phanTramLenHang = hang_hien_tai?.diem_can_len_hang 
    ? Math.min(100, Math.round(((diem_loyalty - hang_hien_tai.diem_bat_dau_hang) / (hang_hien_tai.diem_can_len_hang - hang_hien_tai.diem_bat_dau_hang)) * 100))
    : 100;

  return (
    <div className="bg-[#fcfbf9] min-h-screen pb-16">
      {/* Hero Banner */}
      <section className="bg-gradient-to-b from-red-50/40 via-white to-[#fcfbf9] border-b border-gray-100">
        <div className="mx-auto max-w-[1240px] px-4 py-12 md:px-6 md:py-14">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b22830]">Highlands Coffee Loyalty Club</p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-[#2b2b2b] md:text-5xl" style={{ fontFamily: "'Playfair Display', serif" }}>
            Đặc quyền thành viên
          </h1>
          <p className="mt-3 max-w-[780px] text-sm font-semibold leading-relaxed text-gray-500 md:text-base">
            Chi tiêu tích lũy, nâng hạng ngay hôm nay để mở khóa các đặc quyền, voucher sinh nhật, quà tặng lên hạng và nhiều ưu đãi độc quyền.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6 mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left Column - Card & Progress */}
        <div className="lg:col-span-8 space-y-6">
          {/* Member Premium Card */}
          <div className={`relative overflow-hidden rounded-[24px] bg-gradient-to-br ${getTierGradient(hang_hien_tai?.ma_hang)} p-8 text-white shadow-xl shadow-gray-200/50`}>
            {/* Pattern overlays */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-black/10 rounded-full blur-3xl -ml-20 -mb-20"></div>

            <div className="flex flex-col h-full justify-between relative z-10 min-h-[180px]">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">Thẻ hội viên chính thức</p>
                  <h2 className="text-2xl font-black uppercase tracking-wider mt-1">{hang_hien_tai?.hang || 'Thành viên'}</h2>
                </div>
                <div className="drop-shadow-md">
                  {renderTierIcon(hang_hien_tai?.ma_hang, "w-16 h-16")}
                </div>
              </div>

              <div className="mt-8 flex justify-between items-end border-t border-white/20 pt-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Chủ sở hữu</p>
                  <p className="text-base font-black mt-0.5">{user?.ho_ten || user?.hoTen || 'Quý khách'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest opacity-70">Điểm tích lũy</p>
                  <p className="text-xl font-black mt-0.5">{diem_loyalty.toLocaleString('vi-VN')} <span className="text-xs font-semibold">điểm</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress to Next Tier */}
          <div className="bg-white rounded-[20px] border border-gray-200/70 p-6 shadow-sm">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4">Tiến trình nâng hạng tiếp theo</h3>
            
            <div className="mb-2 flex justify-between text-xs font-bold text-gray-500">
              <span>{diem_loyalty.toLocaleString('vi-VN')} điểm</span>
              {nextTier ? (
                <span>Cần thêm {(nextTier.diem - diem_loyalty).toLocaleString('vi-VN')} điểm để đạt hạng {nextTier.ten}</span>
              ) : (
                <span className="text-[#b22830] font-black">Hạng cao nhất đạt được!</span>
              )}
            </div>

            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden relative shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-red-400 to-[#b22830] rounded-full transition-all duration-700" 
                style={{ width: `${phanTramLenHang}%` }}
              />
            </div>

            <div className="mt-3 flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <span>{hang_hien_tai?.hang}</span>
              {nextTier && <span>{nextTier.ten} ({nextTier.diem.toLocaleString('vi-VN')}đ)</span>}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100 text-center">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Điểm khả dụng</p>
                <p className="text-lg font-black text-[#b22830] mt-0.5">{diem_kha_dung.toLocaleString('vi-VN')}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tổng chi tiêu</p>
                <p className="text-lg font-black text-gray-800 mt-0.5">{tong_chi_tieu.toLocaleString('vi-VN')} đ</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Hệ số tích điểm</p>
                <p className="text-lg font-black text-gray-800 mt-0.5">x{quyen_loi_hien_tai?.he_so_diem || 1}</p>
              </div>
            </div>
          </div>

          {/* Interactive Wheel Banner */}
          <div className="bg-gradient-to-r from-[#b22830] via-red-700 to-[#a38043] rounded-[20px] p-6 text-white relative overflow-hidden shadow-lg shadow-red-950/15 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-md z-10">
              <span className="bg-white/20 text-[9px] px-2.5 py-0.5 rounded-full font-bold tracking-wider uppercase">Tính năng giải trí</span>
              <h3 className="text-xl font-black uppercase leading-tight tracking-wide">Vòng quay may mắn</h3>
              <p className="text-xs text-white/90 font-medium">Dùng 100 điểm khả dụng của bạn để thử vận may nhận voucher 50K hoặc các món nước miễn phí!</p>
            </div>
            <button 
              onClick={() => onNavigate('lucky-wheel')}
              className="bg-white text-[#b22830] hover:bg-gray-50 font-black px-5 py-3 rounded-full text-xs shadow-md transition-all self-start md:self-auto flex items-center gap-1.5 whitespace-nowrap z-10 cursor-pointer border-none"
            >
              Quy đổi & Quay ngay 
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
            {/* Background design elements */}
            <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full border-8 border-white/10 opacity-20"></div>
          </div>
        </div>

        {/* Right Column - Birthday & Personal Vouchers */}
        <div className="lg:col-span-4 space-y-6">
          {/* Birthday Config */}
          <div className="bg-white rounded-[20px] border border-gray-200/70 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <CalendarIcon className="h-5 w-5 text-[#b22830]" />
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Voucher Sinh Nhật</h3>
            </div>

            {ngay_sinh ? (
              <div className="space-y-3">
                {isTodayBirthday ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[#8c252a] text-xs">
                    <p className="font-black text-sm flex items-center gap-1.5 animate-bounce">
                      🎂 Happy Birthday! 🎉
                    </p>
                    <p className="mt-1.5 text-gray-700 font-bold leading-relaxed">
                      Avengers House chúc bạn tuổi mới ngập tràn niềm vui, hạnh phúc và thành công! 🥳
                    </p>
                    {hasBirthdayVoucher ? (
                      <p className="mt-2 text-emerald-700 font-extrabold flex items-center gap-1">
                        🎁 Đã nhận voucher ưu đãi sinh nhật trong kho!
                      </p>
                    ) : (
                      <p className="mt-2 text-gray-500 font-semibold leading-relaxed">
                        Hệ thống đã chuẩn bị voucher đặc biệt cho bạn.
                      </p>
                    )}
                  </div>
                ) : isBirthMonth ? (
                  <div className="bg-red-50/40 border border-red-100/50 rounded-xl p-4 text-[#b22830] text-xs">
                    <p className="font-black text-sm">Tháng sinh nhật của bạn! 🎈</p>
                    <p className="mt-1.5 text-gray-600 font-bold leading-relaxed">
                      Ngày sinh: {new Date(ngay_sinh).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                    {hasBirthdayVoucher ? (
                      <div className="mt-2.5 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 font-bold flex items-center gap-1.5">
                        <span className="text-base">✓</span>
                        <span>Đã nhận voucher ưu đãi sinh nhật!</span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-gray-500 font-semibold leading-relaxed">
                        Hệ thống đang chuẩn bị voucher ưu đãi gửi tặng bạn.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50/30 border border-red-100/50 rounded-xl p-4 text-[#b22830] text-xs">
                    <p className="font-black text-sm">Ngày sinh: {new Date(ngay_sinh).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    <p className="mt-1.5 text-gray-500 font-semibold leading-relaxed">Hệ thống sẽ tự động gửi voucher giảm giá lên đến {quyen_loi_hien_tai?.voucher_sinh_nhat || '40%'} vào tháng sinh nhật của bạn.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-semibold leading-relaxed">Thiết lập ngày sinh nhật để nhận voucher ưu đãi bất ngờ từ Highlands Coffee Loyalty Program.</p>
                {isEditingBirthday ? (
                  <form onSubmit={handleUpdateBirthday} className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-gray-400 uppercase">Ngày</p>
                        <select
                          value={birthDaySelect}
                          onChange={(e) => setBirthDaySelect(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 bg-white cursor-pointer"
                        >
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const d = String(i + 1).padStart(2, '0');
                            return <option key={d} value={d}>{d}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-gray-400 uppercase">Tháng</p>
                        <select
                          value={birthMonthSelect}
                          onChange={(e) => setBirthMonthSelect(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 bg-white cursor-pointer"
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const m = String(i + 1).padStart(2, '0');
                            return <option key={m} value={m}>{m}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-gray-400 uppercase">Năm</p>
                        <select
                          value={birthYearSelect}
                          onChange={(e) => setBirthYearSelect(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 bg-white cursor-pointer"
                        >
                          {Array.from({ length: 100 }, (_, i) => {
                            const y = String(new Date().getFullYear() - i);
                            return <option key={y} value={y}>{y}</option>;
                          })}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button 
                        type="submit"
                        disabled={updateBirthdayMutation.isPending}
                        className="flex-1 bg-[#b22830] hover:bg-[#8f1d24] text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:bg-gray-300 cursor-pointer border-none"
                      >
                        Lưu ngày sinh
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsEditingBirthday(false)}
                        className="px-4 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition-all cursor-pointer bg-white"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                ) : (
                  <button 
                    onClick={() => setIsEditingBirthday(true)}
                    className="w-full border border-[#b22830] text-[#b22830] hover:bg-red-50/20 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer bg-white"
                  >
                    Thiết lập ngày sinh
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Personal Vouchers list */}
          <div className="bg-white rounded-[20px] border border-gray-200/70 p-6 shadow-sm">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide mb-4">Voucher cá nhân ({voucher_ca_nhan.length})</h3>
            {voucher_ca_nhan.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs font-semibold leading-relaxed">
                Bạn chưa có voucher cá nhân nào.<br/>Hãy nâng hạng hoặc quy đổi lượt quay để tích lũy voucher nhé!
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {voucher_ca_nhan.map((v) => (
                  <div key={v.ma_khuyen_mai} className="border border-dashed border-gray-200 rounded-xl p-4 bg-[#fcfbf9] hover:bg-gray-50/50 transition-colors shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-xs font-black text-gray-800 uppercase leading-snug">{v.ten_khuyen_mai}</h4>
                      <span className="bg-[#b22830] text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider whitespace-nowrap">
                        {v.loai_khuyen_mai === 'FREE_ITEM' ? 'Tặng kèm' : 'Giảm giá'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold leading-relaxed">{v.mo_ta}</p>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100/50">
                      <span className="text-[11px] font-black text-[#b22830] select-all cursor-pointer bg-red-50/50 border border-red-100/50 px-2 py-0.5 rounded">{v.ma_khuyen_mai}</span>
                      <span className="text-[9px] text-gray-400 font-bold">HSD: {new Date(v.ngay_ket_thuc).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compare Tiers benefits Table */}
      <section className="mx-auto max-w-[1240px] px-4 md:px-6 mt-10">
        <div className="bg-white rounded-[24px] border border-gray-200 p-6 md:p-8 shadow-sm overflow-hidden">
          <h3 className="text-base font-black text-gray-800 uppercase tracking-wider mb-6 text-center">Bảng đối chiếu đặc quyền các hạng</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-150">
                  <th className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Hạng thành viên</th>
                  <th className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Chi tiêu tối thiểu</th>
                  <th className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tích điểm (Loyalty)</th>
                  <th className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Voucher Sinh Nhật</th>
                  <th className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Miễn Phí Giao Hàng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tatCaHang.map((hang) => {
                  const isCurrent = hang.ma === hang_hien_tai?.ma_hang;
                  return (
                    <tr key={hang.ma} className={`transition-colors ${isCurrent ? 'bg-red-50/20 font-bold' : ''}`}>
                      <td className="py-4 flex items-center gap-3">
                        {renderTierIcon(hang.ma, "w-10 h-10")}
                        <div>
                          <span className="text-sm font-black text-gray-800">{hang.ten}</span>
                          {isCurrent && <span className="ml-2 text-[8px] bg-[#b22830] text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow-sm">Hiện tại</span>}
                        </div>
                      </td>
                      <td className="py-4 text-center text-xs font-bold text-gray-600">{(hang.diem * 1000).toLocaleString('vi-VN')} đ</td>
                      <td className="py-4 text-center text-xs font-bold text-gray-600">x{hang.he_so_diem}</td>
                      <td className="py-4 text-xs text-gray-600 font-semibold">{hang.voucher_sinh_nhat}</td>
                      <td className="py-4 text-xs text-gray-600 font-semibold">{hang.freeship || 'Không hỗ trợ'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
