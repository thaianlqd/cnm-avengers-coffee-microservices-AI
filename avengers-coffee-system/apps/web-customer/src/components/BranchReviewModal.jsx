import React, { useState } from 'react';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { StarIcon as StarOutline, XMarkIcon, BuildingStorefrontIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';

export default function BranchReviewModal({ isOpen, onClose, branchData, orderData, onSuccess }) {
  const [diemTongQuan, setDiemTongQuan] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [phucVu, setPhucVu] = useState(5);
  const [veSinh, setVeSinh] = useState(5);
  const [tocDo, setTocDo] = useState(5);
  const [chatLuong, setChatLuong] = useState(5);
  const [nhanXet, setNhanXet] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const branchCode =
    branchData?.ma_chi_nhanh ||
    branchData?.code ||
    branchData?.id ||
    orderData?.co_so_ma ||
    orderData?.ma_chi_nhanh ||
    orderData?.branch_code ||
    'CN_HA_NOI_01';

  const branchName =
    branchData?.ten_chi_nhanh ||
    branchData?.name ||
    orderData?.ten_co_so ||
    orderData?.ten_chi_nhanh ||
    'Chi nhánh Avengers Coffee';

  let savedUser = null;
  try {
    const savedStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (savedStr) savedUser = JSON.parse(savedStr);
  } catch {}

  const loggedInName =
    savedUser?.ho_ten ||
    savedUser?.hoTen ||
    savedUser?.ten_dang_nhap ||
    savedUser?.tenDangNhap ||
    savedUser?.name ||
    orderData?.ten_nguoi_nhan ||
    orderData?.ten_nguoi_dung ||
    orderData?.ho_ten;

  const guestCode = Math.floor(1000 + Math.random() * 9000);
  const userName = (loggedInName && String(loggedInName).trim() !== '' && loggedInName !== 'Khách hàng')
    ? String(loggedInName).trim()
    : `Khách vãng lai #${guestCode}`;

  const userPhone = orderData?.so_dien_thoai || savedUser?.so_dien_thoai || undefined;
  const userId = savedUser?.ma_nguoi_dung || savedUser?.id || orderData?.ma_nguoi_dung || undefined;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        ma_chi_nhanh: branchCode,
        ten_chi_nhanh: branchName,
        ma_nguoi_dung: userId,
        ten_nguoi_dung: userName,
        so_dien_thoai: userPhone,
        ma_don_hang: orderData?.ma_don_hang || orderData?.id || undefined,
        diem_tong_quan: diemTongQuan,
        tieu_chi: {
          phuc_vu: phucVu,
          ve_sinh: veSinh,
          toc_do: tocDo,
          chat_luong_mon: chatLuong,
        },
        nhan_xet: nhanXet.trim() || undefined,
      };

      await apiClient.post('/branch-reviews', payload);
      setIsSubmitting(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error submitting branch review:', err);
      setIsSubmitting(false);
      const serverMsg = err?.response?.data?.message;
      if (serverMsg && serverMsg.includes('đã được đánh giá')) {
        setErrorMsg('Bạn đã gửi đánh giá chi nhánh cho đơn hàng này rồi!');
      } else {
        setErrorMsg(serverMsg || 'Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại!');
      }
    }
  };

  const renderStarsSelector = (val, setVal, label) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setVal(star)}
            className="p-1 hover:scale-110 transition-transform focus:outline-none"
          >
            {star <= val ? (
              <StarSolid className="w-5 h-5 text-amber-400" />
            ) : (
              <StarOutline className="w-5 h-5 text-gray-300" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#b22830] to-[#800f14] p-6 text-white relative flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors bg-white/10 p-1.5 rounded-full"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-3 backdrop-blur-md border border-white/20">
            <BuildingStorefrontIcon className="w-7 h-7 text-white" />
          </div>

          <h3 className="text-xl font-black uppercase tracking-wide">Đánh Giá Chi Nhánh</h3>
          <p className="text-white/80 text-xs font-medium mt-1 truncate">
            {branchName} {orderData?.ma_don_hang ? `• Đơn hàng #${orderData.ma_don_hang}` : ''}
          </p>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="bg-red-50 text-red-700 text-xs font-semibold p-3 rounded-xl border border-red-200">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Overall Rating */}
          <div className="text-center bg-amber-50/60 p-4 rounded-2xl border border-amber-100">
            <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
              Trải nghiệm tổng quan của bạn
            </label>
            <div className="flex justify-center gap-2 my-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= (hoverRating || diemTongQuan);
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setDiemTongQuan(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 hover:scale-125 transition-transform"
                  >
                    {active ? (
                      <StarSolid className="w-8 h-8 text-amber-400 drop-shadow-sm" />
                    ) : (
                      <StarOutline className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-bold text-amber-800 mt-1">
              {diemTongQuan === 5 && '😍 Rất tuyệt vời!'}
              {diemTongQuan === 4 && '😊 Hài lòng!'}
              {diemTongQuan === 3 && '😐 Bình thường'}
              {diemTongQuan === 2 && '🙁 Chưa hài lòng'}
              {diemTongQuan === 1 && '😡 Rất tệ'}
            </p>
          </div>

          {/* Detailed Criteria */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Đánh giá chi tiết tiêu chí
            </h4>
            {renderStarsSelector(phucVu, setPhucVu, 'Thái độ phục vụ')}
            {renderStarsSelector(veSinh, setVeSinh, 'Không gian & Vệ sinh')}
            {renderStarsSelector(tocDo, setTocDo, 'Tốc độ lên món')}
            {renderStarsSelector(chatLuong, setChatLuong, 'Chất lượng đồ uống')}
          </div>

          {/* Comment box */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Nhận xét / Góp ý cho chi nhánh (Không bắt buộc)
            </label>
            <textarea
              value={nhanXet}
              onChange={(e) => setNhanXet(e.target.value)}
              placeholder="Chia sẻ chi tiết trải nghiệm của bạn tại quán để chi nhánh phục vụ tốt hơn..."
              rows={3}
              className="w-full text-xs p-3 rounded-2xl border border-gray-200 outline-none focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] transition-all resize-none"
            />
          </div>

          {/* Submit Action */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs rounded-full transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-[#b22830] hover:bg-[#800f14] text-white font-bold text-xs rounded-full shadow-lg shadow-red-200 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Đang gửi...' : 'Gửi Đánh Giá'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
