import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { 
  StarIcon as StarOutlineIcon, 
  TicketIcon as TicketOutlineIcon, 
  ArrowPathIcon,
  SparklesIcon,
  GiftIcon as GiftOutlineIcon,
  TagIcon,
  TrophyIcon,
  ChevronDownIcon,
  XMarkIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon, TrophyIcon as TrophySolidIcon, GiftIcon as GiftSolidIcon } from '@heroicons/react/24/solid';

export default function LuckyWheelPage({ user, onNavigate }) {
  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const queryClient = useQueryClient();
  const wheelRef = useRef(null);

  const [isSpinning, setIsSpinning] = useState(false);
  const [prizeResult, setPrizeResult] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);

  const { data: wheelData, isLoading: isPrizesLoading } = useQuery({
    queryKey: queryKeys.luckyWheelPrizes,
    queryFn: async () => {
      const response = await apiClient.get('/users/lucky-wheel/prizes');
      return response.data;
    },
  });

  const { data: memData, isLoading: isMemLoading } = useQuery({
    queryKey: queryKeys.membershipByUser(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/membership`);
      return response.data;
    },
    enabled: Boolean(userId),
  });

  const spinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/users/${userId}/lucky-wheel/spin`);
      return response.data;
    },
    onSuccess: (data) => {
      const prizes = wheelData?.giai_thuong || [];
      const winnerId = data?.giai_thuong?.id;
      const index = prizes.findIndex(p => p.id === winnerId);

      if (index === -1) {
        setIsSpinning(false);
        alert('Lỗi xác định giải thưởng.');
        return;
      }

      // Calculate target rotation so winning segment lands precisely under the top pointer (12 o'clock / 0deg)
      const prizesCount = prizes.length || 8;
      const degreesPerSegment = 360 / prizesCount;
      const targetSegmentMid = (index + 0.5) * degreesPerSegment;
      const targetAngleInCircle = (360 - (targetSegmentMid % 360)) % 360;

      const extraRounds = 360 * 5; // 5 full spins
      const currentMod = currentRotation % 360;
      const diff = (targetAngleInCircle - currentMod + 360) % 360;
      const newRotation = currentRotation + extraRounds + (diff === 0 ? 360 : diff);
      
      setCurrentRotation(newRotation);

      setTimeout(() => {
        setIsSpinning(false);
        setPrizeResult(data);
        setShowResultModal(true);
        queryClient.invalidateQueries({ queryKey: queryKeys.membershipByUser(userId) });
      }, 5000); // 5s spin duration
    },
    onError: (err) => {
      setIsSpinning(false);
      alert(err?.response?.data?.message || 'Có lỗi xảy ra khi quay.');
    },
  });

  // Mapper to replace flat emojis with premium vector icons
  const getPrizeIcon = (emoji, className = "w-5 h-5") => {
    if (!emoji) return <GiftOutlineIcon className={className} />;
    
    const emojiStr = String(emoji);
    if (emojiStr.includes('🎫')) return <TicketOutlineIcon className={className} />;
    if (emojiStr.includes('🏷️')) return <TagIcon className={className} />;
    if (emojiStr.includes('🎁')) return <GiftSolidIcon className={className} />;
    if (emojiStr.includes('👑')) return <TrophySolidIcon className={className} />;
    if (emojiStr.includes('🏆')) return <TrophySolidIcon className={className} />;
    if (emojiStr.includes('⭐')) return <StarSolidIcon className={className} />;
    
    return <GiftOutlineIcon className={className} />;
  };

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] bg-[#fafaf9] p-6 text-center">
        <SparklesIcon className="h-16 w-16 text-[#c89a58] mb-4 animate-pulse" />
        <h2 className="text-2xl font-black uppercase text-gray-800 mb-2">Vòng quay may mắn</h2>
        <p className="text-gray-500 mb-6 max-w-md">Vui lòng đăng nhập để tham gia vòng quay và quy đổi điểm thưởng lấy những phần quà cực khủng.</p>
        <button 
          onClick={() => onNavigate('login')}
          className="bg-[#b22830] hover:bg-[#8f1d24] text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg active:scale-95 transform"
        >
          Đăng nhập ngay
        </button>
      </div>
    );
  }

  const prizes = wheelData?.giai_thuong || [];
  const cost = wheelData?.chi_phi_quay || 100;
  const diemKhaDung = memData?.diem_kha_dung || 0;

  const handleSpin = () => {
    if (isSpinning) return;
    if (diemKhaDung < cost) {
      alert(`Bạn không có đủ điểm khả dụng. Cần tối thiểu ${cost} điểm để quay. Bạn có ${diemKhaDung} điểm.`);
      return;
    }
    setIsSpinning(true);
    spinMutation.mutate();
  };

  const formatPrizeName = (prize) => {
    if (!prize) return '';
    const name = String(prize.ten || prize.ten_giai_thuong || '');
    if (prize.loai === 'VOUCHER' || name.startsWith('TPL_') || name.startsWith('WHEEL_') || prize.ma_voucher) {
      if (prize.mo_ta && !String(prize.mo_ta).startsWith('TPL_')) {
        return prize.mo_ta;
      }
      const val = Number(prize.gia_tri || 0);
      if (val > 0) {
        if (val <= 100) return `Giảm ${val}%`;
        if (val >= 1000) return `Voucher ${(val / 1000).toLocaleString('vi-VN')}K`;
      }
      if (name.startsWith('TPL_') || name.startsWith('WHEEL_')) return 'Voucher Giảm Giá';
    }
    return name;
  };

  return (
    <div className="bg-[#fcfbf9] min-h-screen pb-16">
      {/* Header */}
      <section className="bg-gradient-to-b from-red-50/50 via-white to-[#fcfbf9] border-b border-gray-100">
        <div className="mx-auto max-w-[1240px] px-4 py-8 md:px-6">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-4 h-4 text-amber-600" />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b22830]">MINI GAME & ĐẶC QUYỀN MỤC THƯỞNG</p>
          </div>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-gray-900 md:text-4xl font-sans">
            VÒNG QUAY MAY MẮN
          </h1>
          <p className="mt-2 max-w-[780px] text-xs font-semibold leading-relaxed text-gray-500 md:text-sm">
            Dùng <strong className="text-gray-900">{cost} điểm khả dụng</strong> để tham gia quay thưởng (không ảnh hưởng điểm xét hạng thành viên). Cơ hội 100% trúng thưởng điểm, voucher tiền mặt hoặc ưu đãi độc quyền.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6 mt-6 grid gap-8 lg:grid-cols-12 items-start">
        {/* Left column - The Wheel */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative pt-2 pb-6">
          {/* Arrow / Marker */}
          <div className="absolute top-0 z-30 flex flex-col items-center">
            <div className="w-10 h-10 bg-gradient-to-b from-[#c41230] to-[#80071c] rounded-full shadow-lg flex items-center justify-center border-2 border-amber-300">
              <ChevronDownIcon className="w-5 h-5 text-amber-200 stroke-[3]" />
            </div>
            <div className="w-1 h-3 bg-amber-400 -mt-1 shadow-sm rounded-b"></div>
          </div>

          {/* Wheel container with sleek gold & ruby rim */}
          <div className="relative w-[340px] h-[340px] md:w-[420px] md:h-[420px] rounded-full border-[12px] border-amber-600/90 bg-[#b22830] ring-4 ring-amber-400/50 shadow-2xl p-1 flex items-center justify-center">
            {/* Outer gold accent line */}
            <div className="absolute inset-0 rounded-full border-[2px] border-amber-300/80 pointer-events-none z-10 m-[-6px]"></div>
            
            <div 
              ref={wheelRef}
              className="w-full h-full rounded-full overflow-hidden relative transition-transform duration-[5000ms] cubic-bezier(0.1, 0.8, 0.1, 1) border-2 border-amber-700/50"
              style={{ 
                transform: `rotate(${currentRotation}deg)`,
                backgroundImage: prizes.length > 0 
                  ? `conic-gradient(${prizes.map((p, i) => `${p.mau} ${i * 45}deg ${(i + 1) * 45}deg`).join(', ')})`
                  : 'none'
              }}
            >
              {/* Prize texts inside segments */}
              {prizes.map((prize, idx) => {
                const angle = idx * 45 + 22.5; // Center of segment
                const displayName = formatPrizeName(prize);
                return (
                  <div 
                    key={prize.id}
                    className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white origin-center select-none"
                    style={{ 
                      transform: `rotate(${angle}deg)`,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center -translate-y-[82px] md:-translate-y-[105px] rotate-[270deg] max-w-[85px] text-center">
                      <div className="p-1.5 rounded-full bg-white/20 backdrop-blur-xs shadow-xs flex items-center justify-center">
                        {getPrizeIcon(prize.icon, "w-5 h-5 text-white drop-shadow-sm")}
                      </div>
                      <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider mt-1 drop-shadow-md leading-tight max-w-[68px]">
                        {displayName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inner Center Pin & SPIN Button */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-white rounded-full shadow-2xl flex items-center justify-center border-4 border-amber-400 z-20 hover:scale-105 transition-transform duration-200">
              <button 
                onClick={handleSpin}
                disabled={isSpinning}
                className="w-[78px] h-[78px] bg-gradient-to-br from-[#c41230] via-[#b22830] to-[#80071c] hover:from-[#d11535] hover:to-[#910a22] text-white rounded-full flex flex-col items-center justify-center font-black uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all disabled:from-gray-300 disabled:to-gray-400 cursor-pointer border-none"
              >
                {isSpinning ? (
                  <ArrowPathIcon className="h-6 w-6 animate-spin text-amber-200" />
                ) : (
                  <span className="text-xs font-black tracking-widest drop-shadow-xs">QUAY</span>
                )}
              </button>
            </div>
          </div>

          {/* User Points Info Card */}
          <div className="mt-6 text-center bg-white py-3.5 px-8 rounded-2xl border border-gray-200/80 shadow-2xs flex flex-col items-center gap-2">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider">Điểm khả dụng của bạn</p>
                <p className="text-base font-black text-[#b22830] mt-0.5">{diemKhaDung.toLocaleString('vi-VN')} điểm</p>
              </div>
              <div className="h-7 w-px bg-gray-200"></div>
              <div>
                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider">Chi phí / lượt quay</p>
                <p className="text-base font-black text-amber-700 mt-0.5">{cost} điểm</p>
              </div>
            </div>
            <p className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-200/80">
              Sử dụng điểm khả dụng để quay (Không bị trừ điểm tích lũy xét hạng)
            </p>
          </div>
        </div>

        {/* Right column - Rules & Prizes list */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 md:p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 border border-amber-200/50">
                  <TrophySolidIcon className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-xs md:text-sm font-extrabold text-gray-900 uppercase tracking-wide">Cơ cấu giải thưởng</h3>
              </div>
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/70">
                {prizes.length} phần quà
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {prizes.map((prize) => (
                <div 
                  key={prize.id} 
                  className="flex items-center justify-between p-2 px-2.5 rounded-xl bg-gray-50/80 border border-gray-200/60 hover:border-amber-300 hover:bg-amber-50/20 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span 
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: prize.mau || '#b22830' }}
                    >
                      {getPrizeIcon(prize.icon, "w-3.5 h-3.5 text-white drop-shadow-xs")}
                    </span>
                    <span className="text-[11px] font-bold text-gray-800 truncate" title={formatPrizeName(prize)}>
                      {formatPrizeName(prize)}
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded shrink-0 ml-1">
                    {prize.xac_suat}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 md:p-5 shadow-2xs">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[#b22830] border border-red-100">
                <InformationCircleIcon className="w-4 h-4 text-[#b22830]" />
              </div>
              <h3 className="text-xs md:text-sm font-extrabold text-gray-900 uppercase tracking-wide">Thể lệ tham gia</h3>
            </div>
            <ul className="text-[11px] text-gray-600 space-y-2 font-medium leading-snug">
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Mỗi lượt quay tiêu tốn <strong className="text-gray-900">{cost} điểm khả dụng</strong> (không ảnh hưởng điểm xét hạng).</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Voucher nhận được có HSD 14 ngày, tự động thêm vào kho quà cá nhân.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Tỷ lệ trúng thưởng 100%, có thể sử dụng voucher ngay khi tạo đơn hàng.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {showResultModal && prizeResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-[24px] max-w-sm w-full p-8 text-center relative overflow-hidden shadow-2xl border border-red-100 animate-scale-up">
            {/* Sparkles effect */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#b22830] via-[#c89a58] to-[#b22830]"></div>
            
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto my-4 border border-red-100 shadow-inner animate-bounce text-[#b22830]">
              {getPrizeIcon(prizeResult.giai_thuong?.icon, "w-10 h-10")}
            </div>
            
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-wide">Chúc mừng bạn!</h3>
            <p className="text-xs text-gray-500 mt-2 font-medium">Bạn đã may mắn quay trúng phần quà:</p>
            
            <div className="my-5 py-3 px-6 rounded-xl bg-red-50/50 border border-red-100/50 inline-block font-black text-base text-[#b22830] shadow-sm">
              {prizeResult.giai_thuong?.ten}
            </div>

            {prizeResult.voucher_code && (
              <div className="mb-6 bg-[#fcfbf9] border border-gray-200/50 rounded-xl p-3.5 shadow-inner">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Mã voucher của bạn</p>
                <p className="text-sm font-black text-[#b22830] tracking-wider select-all mt-1 bg-white border border-dashed border-red-200 px-3 py-1 rounded inline-block">{prizeResult.voucher_code}</p>
                <p className="text-[10px] text-gray-400 mt-1.5 font-medium leading-normal">Đã được thêm tự động vào danh sách ưu đãi của bạn.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowResultModal(false);
                  handleSpin();
                }}
                className="flex-1 bg-[#b22830] hover:bg-[#8f1d24] text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-none shadow-sm active:scale-95 transform"
              >
                Quay tiếp
              </button>
              <button 
                onClick={() => {
                  setShowResultModal(false);
                  onNavigate('membership');
                }}
                className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer bg-white active:scale-95 transform"
              >
                Xem voucher
              </button>
            </div>

            <button 
              onClick={() => setShowResultModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-base cursor-pointer border-none bg-transparent hover:scale-110 transition-transform"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
