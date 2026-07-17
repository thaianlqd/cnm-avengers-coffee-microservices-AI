import React from 'react';

export default function DeliveryModeSelector({ selectedMode, onChange }) {
  const modes = [
    {
      id: 'GIAO_TAN_NOI',
      label: 'Giao tận nơi',
      icon: '🛵',
      desc: 'Giao hàng đến tận cửa'
    },
    {
      id: 'LAY_TAI_QUAN',
      label: 'Lấy tại quán',
      icon: '🏪',
      desc: 'Tự đến nhận đồ uống'
    },
    {
      id: 'DUNG_TAI_CHO',
      label: 'Dùng tại chỗ',
      icon: '🍽️',
      desc: 'Thưởng thức tại không gian quán'
    }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 overflow-hidden">
      <div className="flex bg-gray-50 rounded-xl p-1 relative">
        {modes.map((mode, index) => {
          const isSelected = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-lg text-sm font-bold transition-all duration-300 relative z-10 ${
                isSelected ? 'text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-xl mb-1">{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          );
        })}
        {/* Animated background pill */}
        <div 
          className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300 ease-out z-0"
          style={{
            width: `calc(33.333% - 4px)`,
            left: `calc(${modes.findIndex(m => m.id === selectedMode) * 33.333}% + 2px)`
          }}
        />
      </div>
      
      <div className="mt-3 px-3 pb-1 text-center text-xs font-medium text-gray-500 min-h-[20px] transition-all">
        {modes.find(m => m.id === selectedMode)?.desc}
      </div>
    </div>
  );
}
