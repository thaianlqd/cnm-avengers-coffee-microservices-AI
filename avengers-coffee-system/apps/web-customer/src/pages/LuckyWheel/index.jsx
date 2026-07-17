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

      // Mỗi slot chiếm 360 / 8 = 45 độ
      const degreesPerSegment = 360 / prizes.length;
      const targetDegrees = 270 - (index * degreesPerSegment + degreesPerSegment / 2);
      
      // Quay thêm 5 vòng (1800 độ) để tạo cảm giác chuyển động nhanh
      const newRotation = currentRotation + 1800 + (targetDegrees - (currentRotation % 360));
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

  return (
    <div className="bg-[#fcfbf9] min-h-screen pb-16">
      {/* Header */}
      <section className="bg-gradient-to-b from-red-50/40 via-white to-[#fcfbf9] border-b border-gray-100">
        <div className="mx-auto max-w-[1240px] px-4 py-10 md:px-6">
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="w-4 h-4 text-[#c89a58]" />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b22830]">Mini Game & Giải thưởng</p>
          </div>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-[#2b2b2b] md:text-5xl" style={{ fontFamily: "'Playfair Display', serif" }}>
            Vòng quay may mắn
          </h1>
          <p className="mt-3 max-w-[780px] text-sm font-semibold leading-relaxed text-gray-500 md:text-base">
            Dùng {cost} điểm khả dụng của bạn để tham gia quay thưởng. Cơ hội 100% nhận điểm thưởng, voucher giảm giá tiền mặt hoặc đồ uống miễn phí hoàn toàn.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6 mt-4 grid gap-8 lg:grid-cols-12 items-start">
        {/* Left column - The Wheel */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative pt-2 pb-6">
          {/* Arrow / Marker */}
          <div className="absolute top-[2px] z-30 flex flex-col items-center">
            <div className="w-10 h-10 bg-[#b22830] rounded-full shadow-xl flex items-center justify-center border-4 border-[#c89a58] animate-bounce">
              <ChevronDownIcon className="w-5 h-5 text-[#c89a58] stroke-[3]" />
            </div>
            <div className="w-0.5 h-3 bg-[#c89a58] -mt-1 shadow-md"></div>
          </div>

          {/* Wheel container with gold accents and flashing bulbs illusion */}
          <div className="relative w-[340px] h-[340px] md:w-[430px] md:h-[430px] rounded-full border-[14px] border-[#4a3728] bg-[#4a3728] shadow-2xl p-1 flex items-center justify-center">
            {/* Outer gold rim */}
            <div className="absolute inset-0 rounded-full border-[3px] border-[#c89a58] pointer-events-none z-10 m-[-8px]"></div>
            
            {/* Flashing bulbs around the rim */}
            <div className="absolute inset-[-10px] rounded-full pointer-events-none z-15 flex items-center justify-center">
              <div className="w-full h-full rounded-full border border-dashed border-[#c89a58]/40 animate-[spin_80s_linear_infinite]"></div>
            </div>
            
            <div 
              ref={wheelRef}
              className="w-full h-full rounded-full overflow-hidden relative transition-transform duration-[5000ms] cubic-bezier(0.1, 0.8, 0.1, 1) border-2 border-[#4a3728]"
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
                return (
                  <div 
                    key={prize.id}
                    className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white origin-center select-none"
                    style={{ 
                      transform: `rotate(${angle}deg)`,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center -translate-y-[85px] md:-translate-y-[110px] rotate-[270deg] max-w-[85px] text-center">
                      <div className="p-1.5 rounded-full bg-white/10 backdrop-blur-xs shadow-inner flex items-center justify-center">
                        {getPrizeIcon(prize.icon, "w-6 h-6 text-white drop-shadow-md")}
                      </div>
                      <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider mt-1.5 drop-shadow-md leading-tight max-w-[70px]">
                        {prize.ten}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inner Center Pin & SPIN Button */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-white rounded-full shadow-2xl flex items-center justify-center border-4 border-[#c89a58] z-20 hover:scale-105 transition-transform duration-200">
              <button 
                onClick={handleSpin}
                disabled={isSpinning}
                className="w-[76px] h-[76px] bg-gradient-to-br from-[#b22830] to-[#8f1d24] hover:from-[#c41230] hover:to-[#a30f28] text-white rounded-full flex flex-col items-center justify-center font-black uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all disabled:from-gray-300 disabled:to-gray-400 cursor-pointer border-none"
                style={{ boxShadow: 'inset 0 3px 5px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.3)' }}
              >
                {isSpinning ? (
                  <ArrowPathIcon className="h-6 w-6 animate-spin text-[#f4f0eb]" />
                ) : (
                  <span className="text-xs font-black tracking-widest">QUAY</span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-6 text-center bg-white py-3.5 px-8 rounded-2xl border border-gray-200/60 shadow-sm flex items-center gap-6">
            <div>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Điểm khả dụng của bạn</p>
              <p className="text-base font-black text-[#b22830] mt-0.5">{diemKhaDung.toLocaleString('vi-VN')} điểm</p>
            </div>
            <div className="h-8 w-px bg-gray-250"></div>
            <div>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Chi phí / lượt quay</p>
              <p className="text-base font-black text-[#a38043] mt-0.5">{cost} điểm</p>
            </div>
          </div>
        </div>

        {/* Right column - Rules & Prizes list */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-[20px] border border-gray-200/70 p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <TrophySolidIcon className="w-5 h-5 text-[#c89a58]" />
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Cơ cấu giải thưởng</h3>
            </div>
            <div className="grid gap-3">
              {prizes.map((prize) => (
                <div key={prize.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-150 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#b22830] border border-gray-200/60 shadow-inner">
                      {getPrizeIcon(prize.icon, "w-4.5 h-4.5")}
                    </span>
                    <span className="text-xs font-bold text-gray-700">{prize.ten}</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400">Tỷ lệ: {prize.xac_suat}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[20px] border border-gray-200/70 p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-3">
              <InformationCircleIcon className="w-5 h-5 text-[#b22830]" />
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Thể lệ tham gia</h3>
            </div>
            <ul className="text-xs text-gray-500 space-y-2.5 pl-1.5 font-semibold leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Mỗi lượt quay tiêu tốn cố định {cost} điểm khả dụng.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Điểm tích lũy xét hạng thành viên (Gold, Diamond...) sẽ không bị ảnh hưởng khi quay.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Voucher trúng thưởng có giá trị sử dụng trong vòng 14 ngày kể từ khi nhận.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Món nước/topping uống thử: hệ thống tự động gửi voucher FREE_ITEM trực tiếp vào tài khoản của bạn để áp dụng khi tạo đơn hàng.</span>
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
