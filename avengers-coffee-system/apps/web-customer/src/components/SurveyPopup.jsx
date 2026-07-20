import React from 'react';
import { ClipboardDocumentCheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function SurveyPopup({ isOpen, onClose, onAgree, isLoggedIn }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-[28px] max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header Image/Background */}
        <div className="bg-gradient-to-r from-[#b22830] to-[#c41230] p-8 text-center text-white relative">
          <button 
            type="button" 
            onClick={onClose} 
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/20">
            <ClipboardDocumentCheckIcon className="w-9 h-9 text-white animate-bounce" />
          </div>
          
          <h3 className="text-2xl font-black uppercase tracking-wide font-serif">
            Avengers Feedback
          </h3>
          <p className="text-white/80 text-xs font-semibold mt-1 uppercase tracking-wider">
            Khảo Sát Trải Nghiệm
          </p>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <h4 className="text-lg font-bold text-gray-800 leading-tight">
            Bạn vừa hoàn thành đặt hàng thành công! ☕
          </h4>
          <p className="text-sm font-medium text-gray-500 leading-relaxed">
            Hãy dành 1-2 phút chia sẻ trải nghiệm của bạn tại Avengers Coffee House để giúp chúng tôi cải thiện chất lượng phục vụ tốt hơn mỗi ngày.
          </p>
          
          {isLoggedIn ? (
            <div className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-2xl py-2.5 px-4 text-xs font-bold w-full">
              🎁 Hoàn thành khảo sát để nhận ngay <span className="text-[#c41230] font-black">Voucher 20%</span> giảm giá cho đơn từ 100k!
            </div>
          ) : (
            <div className="inline-block bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl py-2.5 px-4 text-xs font-semibold w-full">
              💡 Lưu ý: Hãy đăng nhập trước khi khảo sát để có cơ hội nhận voucher giảm giá 20%.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded-full font-bold text-sm transition-all"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={onAgree}
            className="flex-1 py-3 px-4 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full font-black text-sm tracking-wide shadow-md shadow-red-100 hover:shadow-lg transition-all"
          >
            Đồng ý
          </button>
        </div>

      </div>
    </div>
  );
}
