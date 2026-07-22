import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import Swal from 'sweetalert2';
import { GiftIcon } from '@heroicons/react/24/outline';

export default function MyGiftCardsTab() {
  const [giftCardCode, setGiftCardCode] = useState('');
  const queryClient = useQueryClient();
  const activeUserId = localStorage.getItem('avengers_active_user_id') || '00000000-0000-0000-0000-000000000000';

  const { data: myCards = [], isLoading } = useQuery({
    queryKey: ['myGiftCards', activeUserId],
    queryFn: async () => {
      const res = await apiClient.get(`/gift-cards/my-cards/${activeUserId}`);
      return res.data;
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (code) => {
      const res = await apiClient.post('/gift-cards/redeem', {
        code,
        customer_id: activeUserId,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['myGiftCards'] });
      setGiftCardCode('');
      Swal.fire('Thành công!', data.message, 'success');
    },
    onError: (err) => {
      Swal.fire('Lỗi', err.response?.data?.message || 'Không thể lưu thẻ', 'error');
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (gift_card_id) => {
      const res = await apiClient.post('/gift-cards/transfer-balance', {
        gift_card_id,
        customer_id: activeUserId,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['myGiftCards'] });
      queryClient.invalidateQueries({ queryKey: ['customerWallet'] });
      Swal.fire('Thành công!', data.message, 'success');
    },
    onError: (err) => {
      Swal.fire('Lỗi', err.response?.data?.message || 'Không thể nạp tiền', 'error');
    },
  });

  const handleClaimCard = (e) => {
    e.preventDefault();
    if (giftCardCode.trim().length >= 5) {
      redeemMutation.mutate(giftCardCode.trim());
    } else {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập mã thẻ hợp lệ', 'warning');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md shadow-gray-100/50">
      <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2">
          <GiftIcon className="w-5 h-5 text-[#b22830]" />
          <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">Bộ sưu tập Thẻ Quà Tặng</h3>
        </div>
      </div>

      {/* Form Lưu Thẻ Mới */}
      <div className="rounded-xl border border-[#b22830]/20 bg-[#fbf8f1] p-5 mb-8">
        <h4 className="text-sm font-black uppercase tracking-wide text-[#b22830] mb-3">Lưu Thẻ Quà Tặng Mới</h4>
        <form onSubmit={handleClaimCard} className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Nhập mã thẻ (VD: GIFT-...)"
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-[#b22830]/30 pl-4 pr-4 py-3 text-sm font-bold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all bg-white text-[#b22830]"
              disabled={redeemMutation.isPending}
            />
          </div>
          <button
            type="submit"
            disabled={redeemMutation.isPending || !giftCardCode.trim()}
            className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition-all disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {redeemMutation.isPending ? 'Đang lưu...' : 'Lưu thẻ ngay'}
          </button>
        </form>
      </div>

      {/* Lưới Hiển Thị Thẻ */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100"></div>
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100"></div>
        </div>
      ) : myCards.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500 font-medium">Bạn chưa sở hữu thẻ quà tặng nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {myCards.map(card => {
            const hasBalance = Number(card.current_balance) > 0;
            const bgImage = card.theme_detail?.image_url;
            return (
              <div 
                key={card.id} 
                className={`relative rounded-2xl overflow-hidden shadow-lg transition-transform hover:-translate-y-1 ${!hasBalance ? 'opacity-75 grayscale-[30%]' : ''}`}
                style={{
                  border: `2px solid ${card.theme_detail?.color || '#b22830'}`
                }}
              >
                {/* Ảnh thẻ */}
                <div 
                  className="w-full aspect-[1.6/1] bg-cover bg-center"
                  style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'none', backgroundColor: '#f1f1f1' }}
                >
                  {!bgImage && (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">Không có ảnh</div>
                  )}
                </div>

                {/* Thông tin số dư và nút nạp */}
                <div className="p-4 bg-white">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Mệnh giá ban đầu</p>
                      <p className="text-sm font-bold text-gray-800">{Number(card.value).toLocaleString('vi-VN')} đ</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#b22830] font-black">Số dư hiện tại</p>
                      <p className="text-lg font-black text-[#b22830]">{Number(card.current_balance).toLocaleString('vi-VN')} đ</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      Swal.fire({
                        title: 'Nạp tiền vào ví?',
                        text: `Bạn muốn chuyển ${Number(card.current_balance).toLocaleString('vi-VN')}đ vào ví điện tử chính?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Đồng ý',
                        cancelButtonText: 'Hủy',
                        confirmButtonColor: '#b22830',
                      }).then((result) => {
                        if (result.isConfirmed) {
                          transferMutation.mutate(card.id);
                        }
                      });
                    }}
                    disabled={!hasBalance || transferMutation.isPending}
                    className={`w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                      hasBalance
                        ? 'bg-[#b22830] text-white hover:bg-[#8f1d24] shadow-md'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {hasBalance ? 'Nạp số dư vào ví' : 'Thẻ đã dùng hết'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
