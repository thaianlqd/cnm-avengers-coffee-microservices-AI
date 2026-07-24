import React from 'react';

export default function DeliveryModeSelector({ selectedMode, onChange }) {
  const modes = [
    {
      id: 'GIAO_TAN_NOI',
      label: 'Giao tận nơi',
      desc: 'Shipper giao đồ uống tận tay trong 15-30 phút'
    },
    {
      id: 'LAY_TAI_QUAN',
      label: 'Lấy tại quán',
      desc: 'Đặt trước, ghé quầy nhận đồ nhanh chóng'
    },
    {
      id: 'DUNG_TAI_CHO',
      label: 'Dùng tại chỗ',
      desc: 'Thưởng thức trực tiếp tại không gian quán'
    }
  ];

  return (
    <div className="bg-white rounded-[20px] shadow-xs border border-[#e8e2da] p-2 overflow-hidden">
      <div className="flex bg-[#faf7f4] rounded-[16px] p-1.5 relative border border-gray-100">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={`flex-1 py-3 px-2 rounded-[12px] text-xs sm:text-sm font-extrabold tracking-wide transition-all duration-300 relative z-10 text-center ${
                isSelected ? 'text-[#c41230]' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="truncate">{mode.label}</span>
            </button>
          );
        })}
        {/* Animated background pill */}
        <div 
          className="absolute top-1.5 bottom-1.5 bg-white rounded-[12px] shadow-sm border border-[#c41230]/20 transition-all duration-300 ease-out z-0"
          style={{
            width: `calc(33.333% - 6px)`,
            left: `calc(${modes.findIndex(m => m.id === selectedMode) * 33.333}% + 3px)`
          }}
        />
      </div>
      
      <div className="mt-2.5 px-3 pb-0.5 text-center text-xs font-semibold text-gray-500 min-h-[20px] transition-all flex items-center justify-center">
        <span>{modes.find(m => m.id === selectedMode)?.desc}</span>
      </div>
    </div>
  );
}
