import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { useCart } from '../context/CartContext'; // BƯỚC 4: Import Hook
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';

export default function ProductDetailModal({ product, isOpen, onClose, user }) {
  const { addToCart } = useCart(); // BƯỚC 4: Lấy hàm thêm vào giỏ
  const [selectedSize, setSelectedSize] = useState('');

  const productId = String(product?.ma_san_pham || '');
  const currentUserId = user?.ma_nguoi_dung || user?.maNguoiDung || null;

  const { data: reviewPayload, isLoading: isReviewsLoading } = useQuery({
    queryKey: queryKeys.productReviews(productId),
    queryFn: async () => {
      const response = await apiClient.get(`/products/${productId}/reviews`);
      return response.data;
    },
    enabled: Boolean(isOpen && productId),
    staleTime: 30 * 1000,
  });

  const reviews = reviewPayload?.items || [];
  const diemTrungBinh = Number(reviewPayload?.diemTrungBinh || 0);
  const tongReview = Number(reviewPayload?.tongReview || 0);

  const hienThiReviews = useMemo(() => reviews, [reviews]);

  if (!isOpen || !product) return null;

  const basePrice = Number(product.gia_ban || 0);
  const finalPrice = selectedSize === 'Vừa' ? basePrice + 6000 : basePrice;

  const handlePurchase = () => {
    if (!selectedSize) {
      alert('Vui lòng chọn size trước khi mua.');
      return;
    }

    // BƯỚC 4: Gọi logic thêm vào giỏ hàng
    addToCart(user, product, 1, selectedSize);
    alert(`Đã thêm ${product.ten_san_pham} size ${selectedSize} vào giỏ hàng! 🥤`);
    setSelectedSize('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#fffcf5] w-full max-w-4xl rounded-[40px] overflow-hidden shadow-2xl relative flex flex-col md:flex-row animate-in zoom-in duration-300">
        
        {/* Nút đóng */}
        <button onClick={onClose} className="absolute top-6 right-6 z-10 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-all">
          <XMarkIcon className="h-6 w-6 text-gray-500" />
        </button>

        {/* Trái: Ảnh */}
        <div className="md:w-1/2 bg-[#f5f0e8] p-12 flex items-center justify-center relative">
          <img 
            src={product.hinh_anh_url} 
            alt={product.ten_san_pham} 
            className="w-full h-auto object-contain drop-shadow-2xl scale-110"
          />
          <span className="absolute top-20 right-10 text-2xl">☕</span>
        </div>

        {/* Phải: Info */}
        <div className="md:w-1/2 p-10 md:p-14 flex flex-col justify-center">
          <h2 className="text-4xl font-black text-gray-800 mb-2">{product.ten_san_pham}</h2>
          <p className="text-2xl font-black text-tch-orange mb-6">{finalPrice.toLocaleString('vi-VN')} đ</p>
          
          <p className="text-gray-500 text-sm leading-relaxed mb-8 font-medium italic">
            {product.mo_ta || "Hương vị đậm đà, khó quên từ những hạt cà phê tuyển chọn của Avengers House."}
          </p>

          <div className="mb-8">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-4">Chọn size (bắt buộc):</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedSize('Nhỏ')}
                className={`w-full py-4 px-6 border-2 rounded-2xl flex items-center justify-between transition-all ${
                  selectedSize === 'Nhỏ' ? 'border-tch-orange bg-orange-50' : 'border-gray-100 bg-white hover:border-orange-200'
                }`}
              >
                <span className="text-sm font-bold text-gray-700">🥤 Nhỏ + 0 đ</span>
                <div className={`w-5 h-5 rounded-full ${selectedSize === 'Nhỏ' ? 'border-4 border-tch-orange' : 'border-2 border-gray-200'}`}></div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSize('Vừa')}
                className={`w-full py-4 px-6 border-2 rounded-2xl flex items-center justify-between transition-all ${
                  selectedSize === 'Vừa' ? 'border-tch-orange bg-orange-50' : 'border-gray-100 bg-white hover:border-orange-200'
                }`}
              >
                <span className="text-sm font-bold text-gray-500">🥤 Vừa + 6.000 đ</span>
                <div className={`w-5 h-5 rounded-full ${selectedSize === 'Vừa' ? 'border-4 border-tch-orange' : 'border-2 border-gray-200'}`}></div>
              </button>
            </div>
          </div>

          <button
            onClick={handlePurchase} // Gọi hàm xử lý mua hàng
            className="w-full py-5 bg-tch-orange text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-orange-200 hover:bg-orange-600 transition-all active:scale-95 disabled:bg-gray-300 disabled:shadow-none"
            disabled={!selectedSize}
          >
            {selectedSize ? `Mua ngay - ${selectedSize}` : 'Chọn size để mua'}
          </button>

          <div className="mt-8 rounded-2xl border border-orange-100 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Đánh giá người dùng</p>
              <p className="text-xs font-semibold text-gray-500">{tongReview} review</p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon
                    key={star}
                    className={`h-4 w-4 ${star <= Math.round(diemTrungBinh) ? 'text-yellow-400' : 'text-gray-200'}`}
                  />
                ))}
              </div>
              <span className="text-sm font-black text-gray-700">{diemTrungBinh.toFixed(1)}</span>
            </div>

            {isReviewsLoading ? (
              <p className="mt-3 text-xs font-semibold text-gray-400">Đang tải đánh giá...</p>
            ) : hienThiReviews.length === 0 ? (
              <p className="mt-3 text-xs font-semibold text-gray-400">Chưa có đánh giá nào cho sản phẩm này.</p>
            ) : (
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {hienThiReviews.map((review) => {
                  const reviewerId = String(review.ma_nguoi_dung || '');
                  const reviewer = reviewerId === currentUserId
                    ? 'Bạn'
                    : review.ten_nguoi_dung || `Khách ${reviewerId.slice(0, 8)}`;

                  return (
                    <div key={review.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black uppercase tracking-wide text-gray-600">{reviewer}</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon
                              key={`${review.id}-${star}`}
                              className={`h-3.5 w-3.5 ${star <= Number(review.so_sao || 0) ? 'text-yellow-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-gray-600">{review.binh_luan || 'Không có bình luận.'}</p>
                      {review.phan_hoi_quan_ly ? (
                        <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-2 py-1">
                          <p className="text-[11px] font-black uppercase tracking-wide text-orange-600">
                            Phản hồi từ quản lý{review.nguoi_phan_hoi ? ` (${review.nguoi_phan_hoi})` : ''}
                          </p>
                          <p className="text-xs font-semibold text-orange-700">{review.phan_hoi_quan_ly}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}