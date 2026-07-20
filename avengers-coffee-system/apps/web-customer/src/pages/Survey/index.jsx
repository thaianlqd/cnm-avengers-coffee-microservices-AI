import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { StarIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';

export default function SurveyPage({ onBackToHome }) {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId') || '';

  const [answers, setAnswers] = useState({});
  const [guestInfo, setGuestInfo] = useState({ ten_nguoi_dung: '', so_dien_thoai: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherExpiry, setVoucherExpiry] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [hoverRating, setHoverRating] = useState({});

  // Check login state
  const currentUserRaw = localStorage.getItem('user');
  const user = currentUserRaw ? JSON.parse(currentUserRaw) : null;
  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const isLoggedIn = !!userId;

  // Fetch active survey form
  const { data: activeForm, isLoading, isError } = useQuery({
    queryKey: ['active-survey-form'],
    queryFn: async () => {
      const response = await apiClient.get('/surveys/forms/active');
      return response.data;
    },
    retry: 0,
  });

  const handleRatingChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleTextChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleChoiceChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxChange = (questionId, optValue) => {
    setAnswers((prev) => {
      const currentVal = prev[questionId];
      let newVal;
      if (Array.isArray(currentVal)) {
        if (currentVal.includes(optValue)) {
          newVal = currentVal.filter((v) => v !== optValue);
        } else {
          newVal = [...currentVal, optValue];
        }
      } else {
        newVal = [optValue];
      }
      return { ...prev, [questionId]: newVal };
    });
  };

  const validateForm = () => {
    if (!activeForm?.cau_hoi) return false;
    for (const q of activeForm.cau_hoi) {
      if (q.bat_buoc) {
        const ans = answers[q.id];
        if (q.loai === 'checkbox') {
          if (!Array.isArray(ans) || ans.length === 0) {
            alert(`Vui lòng trả lời câu hỏi bắt buộc: ${q.tieu_de}`);
            return false;
          }
        } else {
          if (!ans || (typeof ans === 'string' && ans.trim() === '')) {
            alert(`Vui lòng trả lời câu hỏi bắt buộc: ${q.tieu_de}`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setSubmitError('');

    // Transform answers object to backend format [{ cau_hoi_id, cau_hoi_tieu_de, cau_tra_loi }]
    const tra_loi = activeForm.cau_hoi.map((q) => ({
      cau_hoi_id: q.id,
      cau_hoi_tieu_de: q.tieu_de,
      cau_tra_loi: answers[q.id] !== undefined ? answers[q.id] : '',
    }));

    const payload = {
      ma_bieu_mau: activeForm.id,
      ma_nguoi_dung: userId || undefined,
      ten_nguoi_dung: isLoggedIn ? (user.ho_ten || user.hoTen || user.email) : guestInfo.ten_nguoi_dung || undefined,
      so_dien_thoai: isLoggedIn ? user.so_dien_thoai : guestInfo.so_dien_thoai || undefined,
      ma_don_hang: orderId || undefined,
      tra_loi,
    };

    try {
      const res = await apiClient.post('/surveys/responses', payload);
      setSubmitted(true);
      if (res.data?.voucher_code) {
        setVoucherCode(res.data.voucher_code);
        setVoucherExpiry(res.data.voucher_expiry);
      }
    } catch (err) {
      let rawMsg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi nộp phản hồi.';
      if (Array.isArray(rawMsg)) {
        rawMsg = rawMsg.join(', ');
      }
      if (typeof rawMsg === 'string') {
        rawMsg = rawMsg
          .replace(/^(BadRequestException|NotFoundException|ForbiddenException|InternalServerErrorException|Error):\s*/i, '')
          .trim();
      }
      setSubmitError(rawMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!voucherCode) return;
    navigator.clipboard.writeText(voucherCode);
    alert(`Đã sao chép mã voucher: ${voucherCode}`);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-[700px] mx-auto py-16 px-4 text-center">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded-full w-2/3 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded-full w-1/2 mx-auto"></div>
          <div className="space-y-4 pt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !activeForm) {
    return (
      <div className="w-full max-w-[700px] mx-auto py-20 px-4 text-center space-y-4">
        <h2 className="text-2xl font-black uppercase text-[#c41230] font-serif">
          Không có khảo sát nào
        </h2>
        <p className="text-gray-500 font-semibold">
          Hiện tại không có chương trình khảo sát trải nghiệm nào đang kích hoạt. Cám ơn sự đồng hành của bạn!
        </p>
        <button
          onClick={onBackToHome}
          className="mt-4 px-6 py-3 bg-[#c41230] hover:bg-[#a30f28] text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors"
        >
          Quay lại trang chủ
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="w-full max-w-[600px] mx-auto py-16 px-4 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircleIcon className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black text-gray-800 uppercase font-serif tracking-tight leading-tight">
          Cảm ơn bạn rất nhiều!
        </h2>
        <p className="text-gray-500 font-semibold leading-relaxed max-w-md mx-auto">
          Những chia sẻ quý báu của bạn giúp chúng tôi không ngừng cải tiến dịch vụ để mang đến trải nghiệm tuyệt vời nhất tại Avengers House.
        </p>

        {voucherCode ? (
          <div className="bg-gradient-to-b from-[#fdfcf7] via-[#fff] to-[#f9f5e8] border border-dashed border-amber-300 rounded-[28px] p-6 shadow-md max-w-md mx-auto space-y-4 relative overflow-hidden">
            <div className="absolute left-[-10px] top-1/2 -translate-y-1/2 w-5 h-5 bg-[#faf7f4] rounded-full border-r border-amber-200"></div>
            <div className="absolute right-[-10px] top-1/2 -translate-y-1/2 w-5 h-5 bg-[#faf7f4] rounded-full border-l border-amber-200"></div>

            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-700">
              Quà tặng hoàn thành khảo sát
            </p>
            <h3 className="text-2xl font-black text-[#c41230] font-serif uppercase tracking-tight">
              GIẢM NGAY 20%
            </h3>
            <p className="text-xs text-gray-500 font-semibold">
              Áp dụng cho đơn hàng kế tiếp từ 100.000đ. Hiệu lực 3 ngày.
            </p>

            <div className="flex items-center justify-between bg-white border border-dashed border-amber-300 rounded-2xl p-3.5 mt-4">
              <span className="font-mono text-lg font-black text-amber-800 tracking-wider">
                {voucherCode}
              </span>
              <button
                onClick={copyToClipboard}
                className="bg-black hover:bg-gray-800 text-white text-[11px] font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all"
              >
                Sao chép
              </button>
            </div>
            
            <p className="text-[10px] text-gray-400 font-bold">
              * Mã đã được lưu vào Kho Voucher của tài khoản: {user?.email || 'bạn'}
            </p>
          </div>
        ) : (
          !isLoggedIn && (
            <div className="bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl p-4 text-xs font-semibold max-w-md mx-auto">
              💡 Hãy đăng nhập tài khoản khách hàng trong các đơn hàng tới để tự động nhận mã giảm giá 20% khi tham gia khảo sát nhé!
            </div>
          )
        )}

        <div className="pt-6">
          <button
            onClick={onBackToHome}
            className="px-8 py-3.5 bg-black hover:bg-gray-800 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors shadow-md"
          >
            Quay lại đặt hàng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[700px] mx-auto py-12 px-4 space-y-8">
      
      {/* Title block */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-[40px] font-extrabold uppercase text-gray-900 tracking-tight font-serif leading-none">
          {activeForm.tieu_de}
        </h1>
        {activeForm.mo_ta && (
          <p className="text-gray-500 font-semibold text-sm max-w-lg mx-auto">
            {activeForm.mo_ta}
          </p>
        )}
        
        {isLoggedIn ? (
          <div className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-full py-1.5 px-4 text-xs font-bold mt-2">
            🎁 Hoàn thành khảo sát để nhận ngay <span className="text-[#c41230] font-black">Voucher 20%</span>
          </div>
        ) : (
          <div className="inline-block bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl py-2 px-4 text-xs font-semibold mt-2">
            💡 Lưu ý: Cần đăng nhập để hệ thống tự động phát hành Voucher 20% vào tài khoản.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-[32px] p-6 sm:p-10 border border-[#e8e2da] shadow-sm space-y-8">
        
        {/* Guest Input Info (only if guest) */}
        {!isLoggedIn && (
          <div className="border-b border-gray-100 pb-6 space-y-4">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest">
              Thông tin liên hệ (Không bắt buộc)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500">Họ và tên</label>
                <input
                  type="text"
                  value={guestInfo.ten_nguoi_dung}
                  onChange={(e) => setGuestInfo((prev) => ({ ...prev, ten_nguoi_dung: e.target.value }))}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500">Số điện thoại</label>
                <input
                  type="tel"
                  value={guestInfo.so_dien_thoai}
                  onChange={(e) => setGuestInfo((prev) => ({ ...prev, so_dien_thoai: e.target.value }))}
                  placeholder="Ví dụ: 0912345678"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                />
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Questions List */}
        <div className="space-y-8">
          {activeForm.cau_hoi.map((q, index) => {
            const answer = answers[q.id];

            return (
              <div key={q.id} className="space-y-3">
                <label className="block text-base font-extrabold text-gray-800 leading-snug">
                  {index + 1}. {q.tieu_de}{' '}
                  {q.bat_buoc && <span className="text-[#c41230]">*</span>}
                </label>

                {/* text: Văn bản ngắn */}
                {q.loai === 'text' && (
                  <input
                    type="text"
                    value={answer || ''}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    placeholder="Nhập câu trả lời ngắn..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                  />
                )}

                {/* paragraph: Đoạn văn dài */}
                {q.loai === 'paragraph' && (
                  <textarea
                    rows={4}
                    value={answer || ''}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    placeholder="Hãy viết câu trả lời chi tiết của bạn ở đây..."
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors resize-none"
                  />
                )}

                {/* rating: Đánh giá sao */}
                {q.loai === 'rating' && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (hoverRating[q.id] || answer || 0) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleRatingChange(q.id, star)}
                          onMouseEnter={() => setHoverRating((prev) => ({ ...prev, [q.id]: star }))}
                          onMouseLeave={() => setHoverRating((prev) => ({ ...prev, [q.id]: 0 }))}
                          className="focus:outline-none transition-transform active:scale-95"
                        >
                          {isFilled ? (
                            <StarIcon className="w-8 h-8 text-amber-400" />
                          ) : (
                            <StarOutline className="w-8 h-8 text-gray-300" />
                          )}
                        </button>
                      );
                    })}
                    {answer && (
                      <span className="text-xs font-black text-amber-600 bg-amber-50 rounded-full px-2.5 py-0.5 ml-2">
                        {answer}/5 sao
                      </span>
                    )}
                  </div>
                )}

                {/* choice: Trắc nghiệm (Chọn 1) */}
                {q.loai === 'choice' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {(q.lua_chon || []).map((opt) => {
                      const isSelected = answer === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleChoiceChange(q.id, opt)}
                          className={`text-left rounded-xl p-3.5 text-xs font-bold transition-all border ${
                            isSelected
                              ? 'border-black bg-black text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          🔘 {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* checkbox: Hộp kiểm (Chọn nhiều) */}
                {q.loai === 'checkbox' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {(q.lua_chon || []).map((opt) => {
                      const isSelected = Array.isArray(answer) && answer.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleCheckboxChange(q.id, opt)}
                          className={`text-left rounded-xl p-3.5 text-xs font-bold transition-all border ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {isSelected ? '☑️ ' : '⬜ '} {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* dropdown: Menu thả xuống */}
                {q.loai === 'dropdown' && (
                  <select
                    value={answer || ''}
                    onChange={(e) => handleChoiceChange(q.id, e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                  >
                    <option value="">-- Chọn câu trả lời --</option>
                    {(q.lua_chon || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {/* date: Chọn Ngày */}
                {q.loai === 'date' && (
                  <input
                    type="date"
                    value={answer || ''}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                  />
                )}

                {/* time: Chọn Giờ */}
                {q.loai === 'time' && (
                  <input
                    type="time"
                    value={answer || ''}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] transition-colors"
                  />
                )}

              </div>
            );
          })}
        </div>

        {submitError && (
          <div className="p-3.5 bg-red-50 border border-red-100 text-xs font-bold text-red-600 rounded-2xl text-center">
            {submitError}
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-4 flex gap-4">
          <button
            type="button"
            onClick={onBackToHome}
            className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full font-bold text-sm transition-all"
          >
            Quay lại
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-4 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full font-black text-sm tracking-wider uppercase shadow-md shadow-red-100 transition-all disabled:opacity-60"
          >
            {submitting ? 'Đang gửi...' : 'Gửi khảo sát'}
          </button>
        </div>

      </form>
    </div>
  );
}
