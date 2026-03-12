import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import { StarIcon } from '@heroicons/react/24/solid';

export default function ReviewForm({ 
  productId, 
  userId, 
  orderId,
  initialReview = null,
  onClose = () => {},
  onSaved = () => {},
  onDeleted = () => {},
  productName = ''
}) {
  const [rating, setRating] = useState(initialReview?.so_sao || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(initialReview?.binh_luan || '');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const saveReviewMutation = useMutation({
    mutationFn: async (payload) => {
      if (initialReview) {
        // Update existing review
        const response = await apiClient.patch(
          `/reviews/${initialReview.id}`,
          { soSao: payload.rating, binhLuan: payload.comment }
        );
        return response.data;
      }

      // Create new review
      const response = await apiClient.post(
        `/products/${productId}/reviews`,
        {
          maNguoiDung: userId,
          soSao: payload.rating,
          binhLuan: payload.comment,
          maDonHang: orderId,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      setError('');
      setRating(0);
      setComment('');
      // Invalidate review queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.productReviews(productId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.userProductReview(productId, userId),
      });
      onSaved(initialReview ? 'Cap nhat danh gia thanh cong.' : 'Gui danh gia thanh cong.');
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Lỗi khi lưu đánh giá');
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/reviews/${initialReview.id}`);
    },
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({
        queryKey: queryKeys.productReviews(productId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.userProductReview(productId, userId),
      });
      onDeleted('Da xoa danh gia thanh cong.');
      onClose();
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Lỗi khi xóa đánh giá');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (rating === 0) {
      setError('Vui lòng chọn số sao');
      return;
    }

    saveReviewMutation.mutate({ rating, comment });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-2xl p-6 max-w-md w-[90vw] shadow-2xl">
        <h3 className="text-lg font-black uppercase text-gray-800 mb-2">
          Đánh giá {productName}
        </h3>
        <p className="text-xs font-semibold text-gray-500 mb-4">
          Chia sẻ ý kiến của bạn để giúp cải thiện sản phẩm
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Star Rating */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">
              Đánh giá
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-all"
                >
                  <StarIcon
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs font-semibold text-gray-500">
              {rating > 0 ? `${rating} sao` : 'Chưa chọn'}
            </p>
          </div>

          {/* Comment */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">
              Bình luận
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange resize-none"
              placeholder="Chia sẻ trải nghiệm của bạn..."
            />
          </div>

          {/* Error */}
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saveReviewMutation.isPending}
              className="flex-1 rounded-xl bg-tch-orange px-3 py-3 text-sm font-black uppercase tracking-wide text-white disabled:bg-gray-300"
            >
              {saveReviewMutation.isPending
                ? 'Đang lưu...'
                : initialReview
                ? 'Cập nhật'
                : 'Gửi đánh giá'}
            </button>
            {initialReview && (
              <button
                type="button"
                onClick={() => deleteReviewMutation.mutate()}
                disabled={deleteReviewMutation.isPending}
                className="rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-black uppercase tracking-wide text-red-600 disabled:opacity-50"
              >
                {deleteReviewMutation.isPending ? 'Xóa...' : 'Xóa'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-black uppercase tracking-wide text-gray-600"
            >
              Đóng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
