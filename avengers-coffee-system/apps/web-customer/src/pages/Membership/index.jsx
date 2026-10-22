import MembershipCard from '../../components/wallet/MembershipCard';
import { membershipProgress, tierPalette } from '../../lib/membershipPresentation';
import { useTranslation } from 'react-i18next';
import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import {
  GiftIcon,
  StarIcon,
  CheckBadgeIcon,
  CalendarIcon,
  ArrowRightIcon,
  TruckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon
} from '../../components/common/icons';

export default function MembershipPage({ user, onNavigate }) {
  useUiLanguage();
  const { t } = useTranslation();
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
        alert(ui("Cập nhật ngày sinh thành công! 🎉"));
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
        <h2 className="text-2xl font-medium  text-gray-800 mb-2">{ui("Hạng thành viên")}</h2>
        <p className="text-gray-500 mb-6 max-w-md">{ui("Vui lòng đăng nhập để xem thông tin hạng thành viên và các quyền lợi đặc biệt dành riêng cho bạn.")}</p>
        <button
          onClick={() => onNavigate('login')}
          className="bg-[#1a8b46] hover:bg-[#156e37] text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg"
        >{ui("Đăng nhập ngay")}</button>
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
      <div className="max-w-[1240px] mx-auto px-4 py-16 text-center text-red-600 font-semibold">{ui("Đã có lỗi xảy ra khi tải thông tin thành viên. Vui lòng thử lại sau.")}</div>
    );
  }

  const {
    diem_loyalty = 0,
    diem_kha_dung = 0,
    tong_chi_tieu = 0,
    chi_tieu_thang_nay = 0,
    chi_tieu_toi_thieu_thang = 0,
    con_thieu_thang_nay = 0,
    dat_dieu_kien_dac_quyen = true,
    hang_hien_tai = {},
    quyen_loi_hien_tai = {},
    tat_ca_hang = [],
    voucher_ca_nhan = [],
    ngay_sinh = null,
  } = memData || {};

  const progress = membershipProgress(tat_ca_hang, diem_loyalty);
  const tatCaHang = progress.tiers;

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

  const renderTierIcon = (maHang, sizeClass = "w-14 h-14") => {
    switch (maHang) {
      case 'PLATINUM':
        return (
          <div className={`rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center border border-sky-400/50 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-sky-300 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l2.4 4.88 5.38.78-3.89 3.8 0.92 5.36L12 16.3l-4.81 2.52 0.92-5.36-3.89-3.8 5.38-.78L12 2z"/>
            </svg>
          </div>
        );
      case 'SILVER':
        return (
          <div className={`rounded-2xl bg-[#2B2D42] flex items-center justify-center border border-white/30 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-white drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3zm0 18c-3.75-1-6.5-5.22-6.5-9V6.3l6.5-2.17 6.5 2.17V11c0 3.78-2.75 8-6.5 9z"/>
            </svg>
          </div>
        );
      case 'GOLD':
        return (
          <div className={`rounded-2xl bg-[#1A1A1A] flex items-center justify-center border border-white/30 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-white drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v3c0 2.44 1.72 4.48 4 4.9C7.8 17.9 10.22 19 12 19c1.78 0 4.2-1.1 4.9-4.1 2.28-.42 4-2.46 4-4.9V7c0-1.1-.9-2-2-2zM5 10V7h2v3c0 .8-.17 1.53-.47 2.18C5.55 11.66 5 10.9 5 10zm14 0c0 .9-.55 1.66-1.53 2.18-.3-.65-.47-1.38-.47-2.18V7h2v3z"/>
            </svg>
          </div>
        );
      case 'DIAMOND':
        return (
          <div className={`rounded-2xl bg-[#0B0C10] flex items-center justify-center border border-white/40 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.14 2.16L3 9.16l9 12.68 9-12.68-8.86-7zM12 4.44l5.9 4.56H6.1L12 4.44zM5.38 11h3.37l-3.37 4.74V11zm4.84 0h3.56l-1.78 6.77L10.22 11zm5.03 0h3.37v4.74l-3.37-4.74z"/>
            </svg>
          </div>
        );
      default:
        return (
          <div className={`rounded-2xl bg-[#3E2723] flex items-center justify-center border border-white/30 shadow-lg ${sizeClass}`}>
            <svg className="w-2/3 h-2/3 text-white drop-shadow-sm" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296a3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043a3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296a3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043a3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
        );
    }
  };

  const getTierLabel = (tierObj) => {
    if (!tierObj) return '';
    const code = (tierObj.ma || tierObj.ma_hang || '').toUpperCase();
    if (code === 'MEMBER' || code === 'BRONZE') return t('membership.bronze');
    if (code === 'SILVER') return t('membership.silver');
    if (code === 'GOLD') return t('membership.gold');
    if (code === 'DIAMOND') return t('membership.diamond');
    if (code === 'PLATINUM') return tierObj.ten || tierObj.ten_hang || t('membership.platinum');
    return tierObj.ten || tierObj.ten_hang || (tierPalette(code).label ? t(`membership.${tierPalette(code).label}`) : code);
  };

  const nextTier = progress.next;
  const phanTramLenHang = progress.percent;

  return (
    <div className="customer-membership bg-[#fcfbf9] min-h-screen pb-16">
      {/* Hero Banner */}
      <section className="bg-[#fcfbf9] border-b border-gray-100">
        <div className="mx-auto max-w-[1240px] px-4 py-12 md:px-6 md:py-14">
          <p className="text-[10px] font-medium  tracking-[0.25em] text-[#b22830]">{ui("Câu lạc bộ thành viên Avengers Coffee")}</p>
          <h1 className="mt-3 text-3xl font-medium  tracking-tight text-[#2b2b2b] md:text-5xl font-sans">{ui("Đặc quyền thành viên")}</h1>

        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6 mt-8 grid gap-8 lg:grid-cols-12">
        {/* Left Column - Card & Progress */}
        <div className="lg:col-span-8 space-y-6">
          <MembershipCard user={user} tier={hang_hien_tai?.ma_hang} tierName={getTierLabel(hang_hien_tai)} points={diem_loyalty} />

          {/* Progress to Next Tier */}
          <div className="bg-white rounded-3xl border border-gray-200/80 p-6 md:p-7 shadow-sm space-y-5">
            {/* Temporary Downgrade / Maintenance Warning Banner */}
            {hang_hien_tai?.bi_ha_hang_do_thieu_chi_tieu && (
              <div className="bg-stone-50 border-2 border-amber-300 rounded-2xl p-4 text-amber-950 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">⚠️</span>
                  <div className="space-y-1">
                    <h4 className="font-medium text-xs md:text-sm text-amber-950  tracking-wide">{ui("Thông báo tạm điều chỉnh Hạng do chưa đủ chi tiêu duy trì tháng")}</h4>
                    <p className="text-xs text-amber-900 leading-relaxed font-semibold">{ui("Bạn đã tích lũy đủ ")}<strong>{diem_loyalty.toLocaleString(uiLocale())}{ui(" điểm")}</strong>{ui(" xét hạng (Đạt mốc ")}<strong>{ui("Hạng ")}{ui(hang_hien_tai?.hang_xet_the_diem)}</strong>{ui("). Tuy nhiên, hạng ")}{ui(hang_hien_tai?.hang_xet_the_diem)}{ui(" yêu cầu chi tiêu tối thiểu ")}<strong>{hang_hien_tai?.chi_tieu_can_de_giu_hang?.toLocaleString(uiLocale())}{ui("đ/tháng")}</strong>{ui(" để giữ hạng & đặc quyền.")}</p>
                    <p className="text-xs text-amber-950 font-semibold bg-amber-100/80 p-2 rounded-xl border border-stone-200 inline-block mt-1">{ui("💡 Đã chi tiêu tháng này: ")}{chi_tieu_thang_nay.toLocaleString(uiLocale())}{ui("đ (Còn thiếu ")}{con_thieu_thang_nay.toLocaleString(uiLocale())}{ui("đ). Hạng của bạn tạm thời chuyển về ")}<strong>{ui("Hạng ")}{ui(hang_hien_tai?.hang)}</strong>{ui(" cho đến khi đạt đủ mức chi tiêu duy trì.")}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-medium text-gray-900  tracking-wider flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-[#b22830]" />{ui("Tiến trình nâng hạng thành viên")}</h3>
              {nextTier ? (
                <span className="text-[11px] font-medium text-amber-800 bg-stone-50 px-3 py-1 rounded-full border border-stone-200 shadow-2xs">{ui("Cần thêm ")}<strong className="text-amber-900 font-medium">{progress.remaining.toLocaleString(uiLocale())}{ui(" điểm")}</strong> ➔ {getTierLabel(nextTier)}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-rose-700 bg-stone-50 px-3 py-1 rounded-full border border-stone-200 shadow-2xs">{ui("👑 Hạng cao nhất đạt được!")}</span>
              )}
            </div>

            {/* Visual Tier Stepper Milestones */}
            <div
              className="grid gap-2 pt-2 text-center"
              style={{ gridTemplateColumns: `repeat(${tatCaHang.length || 4}, minmax(0, 1fr))` }}
            >
              {tatCaHang.map(h => ({ code: h.ma, name: getTierLabel(h), minPts: Number(h.diem) })).map((tStep) => {
                const isPassed = diem_loyalty >= tStep.minPts;
                const isCurrent = hang_hien_tai?.ma_hang === tStep.code;

                return (
                  <div key={tStep.code} className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all border-2 ${
                        isCurrent
                          ? 'bg-[#b22830] text-white border-[#b22830] ring-4 ring-red-100 scale-110 shadow'
                          : isPassed
                          ? 'bg-stone-500 text-white border-emerald-500'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}
                    >
                      {isPassed ? '✓' : ''}
                    </div>
                    <span className={`text-[10px] font-medium  mt-1.5 ${isCurrent ? 'text-[#b22830]' : isPassed ? 'text-gray-800' : 'text-gray-400'}`}>
                      {tStep.name}
                    </span>
                    <span className="text-[9px] font-semibold text-gray-400">
                      {tStep.minPts.toLocaleString(uiLocale())} PTS
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="h-3.5 w-full rounded-full bg-gray-100 p-0.5 overflow-hidden border border-gray-200/80 shadow-inner relative">
              <div
                className="h-full bg-[#b22830] rounded-full transition-all duration-1000 shadow-sm"
                style={{ width: `${phanTramLenHang}%` }}
              />
            </div>

            <div className="mt-2 flex justify-between text-[11px] font-bold text-gray-500  tracking-wider">
              <span>{ui(hang_hien_tai?.hang)} ({diem_loyalty.toLocaleString(uiLocale())}{ui(" điểm xét hạng)")}</span>
              {nextTier && <span>{getTierLabel(nextTier)} ({nextTier.diem.toLocaleString(uiLocale())}{ui(" điểm)")}</span>}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-gray-100 text-center">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-[10px] text-amber-800 font-bold  tracking-wider">{ui("Điểm xét hạng")}</p>
                <p className="text-lg font-medium text-amber-900 mt-0.5">{diem_loyalty.toLocaleString(uiLocale())}</p>
                <p className="text-[9px] text-amber-700/70 font-medium mt-0.5">{ui("Dùng để giữ & lên hạng")}</p>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-[10px] text-rose-800 font-bold  tracking-wider">{ui("Điểm khả dụng")}</p>
                <p className="text-lg font-medium text-[#c41230] mt-0.5">{diem_kha_dung.toLocaleString(uiLocale())}</p>
                <p className="text-[9px] text-rose-700/70 font-medium mt-0.5">{ui("Quay thưởng & đổi quà")}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                <p className="text-[10px] text-gray-500 font-bold  tracking-wider">{ui("Chi tiêu lũy kế")}</p>
                <p className="text-base font-medium text-gray-800 mt-0.5">{tong_chi_tieu.toLocaleString(uiLocale())}{ui(" đ")}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">{ui("Tất cả đơn thành công")}</p>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-[10px] text-emerald-800 font-bold  tracking-wider">{ui("Hệ số tích điểm")}</p>
                <p className="text-lg font-medium text-emerald-900 mt-0.5">x{quyen_loi_hien_tai?.he_so_diem || 1}</p>
                <p className="text-[9px] text-emerald-700/70 font-medium mt-0.5">{dat_dieu_kien_dac_quyen ? ui("Đang kích hoạt") : ui("Hệ số gốc (x1.0)")}</p>
              </div>
            </div>

            {/* Monthly Spending & Tier Privilege Condition Card */}
            {hang_hien_tai?.ma_hang !== 'MEMBER' && chi_tieu_toi_thieu_thang > 0 && (
              <div className={`mt-3.5 p-3.5 rounded-xl border transition-all ${dat_dieu_kien_dac_quyen ? 'bg-stone-50 border-stone-200' : 'bg-stone-50 border-stone-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {dat_dieu_kien_dac_quyen ? (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-gray-900">{ui("Chi tiêu duy trì tháng")}</span>
                    <span className="text-[10px] text-gray-500 font-medium">({chi_tieu_toi_thieu_thang.toLocaleString(uiLocale())}{ui("đ)")}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full ${dat_dieu_kien_dac_quyen ? 'bg-emerald-600 text-white' : 'bg-stone-500 text-white'}`}>
                    {dat_dieu_kien_dac_quyen ? ui("Đã đạt") : ui("Còn thiếu {{v0}}đ", {v0:con_thieu_thang_nay.toLocaleString(uiLocale())})}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 text-[10px] font-medium text-gray-500 flex justify-between mb-1">
                  <span>{ui("Đã đạt ")}{chi_tieu_thang_nay.toLocaleString(uiLocale())}{ui("đ")}</span>
                  <span>{ui("Mục tiêu ")}{chi_tieu_toi_thieu_thang.toLocaleString(uiLocale())}{ui("đ")}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${dat_dieu_kien_dac_quyen ? 'bg-stone-500' : 'bg-stone-500'}`}
                    style={{ width: `${Math.min(100, Math.round((chi_tieu_thang_nay / chi_tieu_toi_thieu_thang) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Automatic Freeship Privilege Badge */}
            <div className="mt-2.5 flex items-center justify-between text-xs bg-stone-50 p-2.5 rounded-xl border border-stone-200">
              <div className="flex items-center gap-2">
                <TruckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold text-gray-800 text-xs">{ui("Freeship hạng ")}{ui(hang_hien_tai?.hang)}</span>
              </div>
              <span className="font-medium text-emerald-700 text-xs">
                {quyen_loi_hien_tai?.freeship || ui("Không hỗ trợ")}
              </span>
            </div>
          </div>

          {/* Interactive Wheel Banner */}
          <div className="bg-[#302721] rounded-2xl p-5 md:p-6 text-white relative overflow-hidden shadow-lg shadow-red-950/10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1 max-w-md z-10">
              <span className="bg-white/20 text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wider ">{ui("Tính năng giải trí")}</span>
              <h3 className="text-lg md:text-xl font-medium  leading-tight tracking-wide">{ui("Vòng quay may mắn")}</h3>
              <p className="text-xs text-white/90 font-medium">{ui("Dùng 100 điểm khả dụng của bạn để thử vận may nhận voucher 50K hoặc các món nước miễn phí!")}</p>
            </div>
            <button
              onClick={() => onNavigate('lucky-wheel')}
              className="bg-white text-[#b22830] hover:bg-gray-50 font-medium px-4 py-2.5 rounded-full text-xs shadow-md transition-all self-start md:self-auto flex items-center gap-1.5 whitespace-nowrap z-10 cursor-pointer border-none active:scale-95"
            >{ui("Quy đổi & Quay ngay")}<ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
            <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full border-8 border-white/10 opacity-20"></div>
          </div>
        </div>

        {/* Right Column - Birthday & Personal Vouchers */}
        <div className="lg:col-span-4 space-y-6">
          {/* Birthday Config */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 md:p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 mb-4">
              <CalendarIcon className="h-5 w-5 text-[#b22830]" />
              <h3 className="text-sm font-medium text-gray-800  tracking-wide">{ui("Voucher Sinh Nhật")}</h3>
            </div>

            {ngay_sinh ? (
              <div className="space-y-3">
                {isTodayBirthday ? (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-[#8c252a] text-xs">
                    <p className="font-medium text-sm flex items-center gap-1.5 animate-bounce">
                      🎂 Happy Birthday! 🎉
                    </p>
                    <p className="mt-1.5 text-gray-700 font-bold leading-relaxed">{ui("Avengers Coffee chúc bạn tuổi mới ngập tràn niềm vui, hạnh phúc và thành công! 🥳")}</p>
                    {hasBirthdayVoucher ? (
                      <p className="mt-2 text-emerald-700 font-semibold flex items-center gap-1">{ui("🎁 Đã nhận voucher ưu đãi sinh nhật trong kho!")}</p>
                    ) : (
                      <p className="mt-2 text-gray-500 font-semibold leading-relaxed">{ui("Hệ thống đã chuẩn bị voucher đặc biệt cho bạn.")}</p>
                    )}
                  </div>
                ) : isBirthMonth ? (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-[#b22830] text-xs">
                    <p className="font-medium text-sm">{ui("Tháng sinh nhật của bạn! 🎈")}</p>
                    <p className="mt-1.5 text-gray-600 font-bold leading-relaxed">{ui("Ngày sinh: ")}{new Date(ngay_sinh).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                    {hasBirthdayVoucher ? (
                      <div className="mt-2.5 p-2 bg-stone-50 border border-stone-200 rounded-lg text-emerald-800 font-bold flex items-center gap-1.5">
                        <span className="text-base">✓</span>
                        <span>{ui("Đã nhận voucher ưu đãi sinh nhật!")}</span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-gray-500 font-semibold leading-relaxed">{ui("Hệ thống đang chuẩn bị voucher ưu đãi gửi tặng bạn.")}</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-[#b22830] text-xs">
                    <p className="font-medium text-sm">{ui("Ngày sinh: ")}{new Date(ngay_sinh).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                    <p className="mt-1.5 text-gray-500 font-semibold leading-relaxed">{ui("Hệ thống sẽ tự động gửi voucher giảm giá lên đến ")}{quyen_loi_hien_tai?.voucher_sinh_nhat || '40%'}{ui(" vào tháng sinh nhật của bạn.")}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-semibold leading-relaxed">{ui("Thiết lập ngày sinh nhật để nhận voucher ưu đãi bất ngờ từ Avengers Coffee Loyalty Program.")}</p>
                {isEditingBirthday ? (
                  <form onSubmit={handleUpdateBirthday} className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-gray-400 ">{ui("Ngày")}</p>
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
                        <p className="mb-1 text-[10px] font-bold text-gray-400 ">{ui("Tháng")}</p>
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
                        <p className="mb-1 text-[10px] font-bold text-gray-400 ">{ui("Năm")}</p>
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
                        className="flex-1 bg-[#b22830] hover:bg-[#8f1d24] text-white py-2.5 rounded-xl text-xs font-medium  tracking-wider transition-all disabled:bg-gray-300 cursor-pointer border-none"
                      >{ui("Lưu ngày sinh")}</button>
                      <button
                        type="button"
                        onClick={() => setIsEditingBirthday(false)}
                        className="px-4 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-bold transition-all cursor-pointer bg-white"
                      >{ui("Hủy")}</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setIsEditingBirthday(true)}
                    className="w-full border border-[#b22830] text-[#b22830] hover:bg-stone-50 py-3 rounded-xl text-xs font-medium  tracking-wider transition-all cursor-pointer bg-white"
                  >{ui("Thiết lập ngày sinh")}</button>
                )}
              </div>
            )}
          </div>

          {/* Personal Vouchers list */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 md:p-6 shadow-2xs">
            <h3 className="text-sm font-medium text-gray-800  tracking-wide mb-4">{ui("Voucher cá nhân")}</h3>
            {voucher_ca_nhan.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs font-semibold leading-relaxed">{ui("Bạn chưa có voucher cá nhân nào.")}<br/>{ui("Hãy nâng hạng hoặc quy đổi lượt quay để tích lũy voucher nhé!")}</div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {voucher_ca_nhan.map((v) => (
                  <div key={v.ma_khuyen_mai} className="border border-dashed border-gray-200 rounded-xl p-3.5 bg-[#fcfbf9] hover:bg-gray-50/50 transition-colors shadow-2xs">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-xs font-medium text-gray-800  leading-snug">{v.ten_khuyen_mai}</h4>
                      <span className="bg-[#c41230] text-white text-[8px] px-2 py-0.5 rounded-full font-medium  tracking-wider whitespace-nowrap">
                        {v.loai_khuyen_mai === 'FREE_ITEM' ? ui("Tặng kèm") : ui("Giảm giá")}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold leading-relaxed">{v.mo_ta}</p>
                    <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-gray-100/80">
                      <span className="text-[11px] font-mono font-medium text-[#c41230] select-all cursor-pointer bg-stone-50 px-2 py-0.5 rounded border border-stone-200">{v.ma_khuyen_mai}</span>
                      <span className="text-[9px] text-gray-400 font-bold">HSD: {new Date(v.ngay_ket_thuc).toLocaleDateString(uiLocale())}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compare Tiers benefits Table */}
      <section className="mx-auto max-w-[1240px] px-4 md:px-6 mt-8">
        <div className="bg-white rounded-3xl border border-gray-200/80 p-6 md:p-8 shadow-sm overflow-hidden space-y-6">
          <div className="border-b border-gray-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900  tracking-tight flex items-center gap-2">
                <CheckBadgeIcon className="w-5 h-5 text-[#b22830]" />{ui("Bảng đối chiếu đặc quyền các hạng thành viên")}</h3>

            </div>
            <span className="text-[10px] font-medium  text-gray-400 bg-gray-100 px-3 py-1 rounded-full self-start md:self-auto">{ui("Cập nhật mới nhất 2026")}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider">{ui("Hạng thành viên")}</th>
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider text-center">{ui("Mốc điểm lên hạng")}</th>
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider text-center">{ui("Duy trì / Tháng")}</th>
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider text-center">{ui("Hệ số tích điểm")}</th>
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider">{ui("Voucher Sinh Nhật")}</th>
                  <th className="py-3.5 px-4 text-[10px] font-medium text-gray-600  tracking-wider">{ui("Miễn Phí Giao Hàng")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tatCaHang.map((hang) => {
                  const isCurrent = hang.ma === hang_hien_tai?.ma_hang;
                  const minSpendMonthly = Number(hang.chi_tieu_toi_thieu_thang || 0);

                  return (
                    <tr key={hang.ma} className={`transition-colors ${isCurrent ? 'bg-stone-50 border-l-4 border-l-[#b22830]' : 'hover:bg-gray-50/60'}`}>
                      <td className="py-4 px-4 flex items-center gap-3">
                        {renderTierIcon(hang.ma, "w-9 h-9 shrink-0")}
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-xs md:text-sm font-medium text-gray-900 tracking-wide">{getTierLabel(hang)}</span>
                          {isCurrent && (
                            <span className="text-[9px] bg-[#b22830] text-white px-2.5 py-0.5 rounded-full font-medium  tracking-wider shadow-xs whitespace-nowrap inline-flex items-center shrink-0">{ui("Hạng hiện tại")}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center text-xs font-medium text-gray-800">
                        {Number(hang.diem || 0).toLocaleString(uiLocale())} <span className="text-[10px] font-semibold text-gray-400">PTS</span>
                      </td>
                      <td className="py-4 px-4 text-center text-xs font-bold text-gray-600">
                        {minSpendMonthly > 0 ? (
                          <span className="bg-stone-50 text-amber-800 border border-stone-200 px-2.5 py-1 rounded-lg text-[11px]">
                            {minSpendMonthly.toLocaleString(uiLocale())}{ui("đ/tháng")}</span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">{ui("Không yêu cầu")}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-block bg-red-100/70 text-[#b22830] font-medium text-xs px-2.5 py-1 rounded-lg border border-stone-200">
                          x{hang.he_so_diem || 1}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-700 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <GiftIcon className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>{hang.voucher_sinh_nhat || ui("Giảm 10% (tối đa 20.000đ)")}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-700 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <TruckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{hang.freeship || ui("Không hỗ trợ")}</span>
                        </div>
                      </td>
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
