import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StarIcon, XMarkIcon, MapPinIcon } from '../common/iconsSolid';
import { apiClient } from '../../lib/apiClient';
import { uiText as ui, useUiLanguage } from '../../lib/uiText';

function Rating({ label, value, onChange, disabled = false }) {
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-sm font-semibold text-stone-700">{label}</legend>
    <div className="flex gap-2">{[1, 2, 3, 4, 5].map(star => <button type="button" key={star}
      aria-label={ui('{{v0}} sao', { v0: star })} aria-pressed={value === star} onClick={() => onChange(star)}
      className="rounded p-1 focus-visible:outline-2 focus-visible:outline-[#b22830] cursor-pointer transition-transform hover:scale-110">
      <StarIcon className={`h-6 w-6 ${star <= value ? 'fill-[#b88a44] text-[#b88a44]' : 'text-stone-300'}`} />
    </button>)}</div>
  </fieldset>;
}

export default function BranchReviewModal({ isOpen, onClose, branchData, orderData, onSuccess }) {
  useUiLanguage();
  const dialog = useRef(null), inFlight = useRef(false);
  const queryClient = useQueryClient();
  const [service, setService] = useState(5), [shipper, setShipper] = useState(5);
  const [products, setProducts] = useState({}), [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const orderId = orderData?.ma_don_hang || orderData?.id;
  const { data: context, isPending, isError } = useQuery({
    queryKey: ['order-review-context', orderId], enabled: !!(isOpen && orderId), retry: false,
    queryFn: async () => (await apiClient.get(`/branch-reviews/order/${orderId}`)).data,
  });

  const branchName = context?.ten_chi_nhanh || orderData?.ten_co_so || branchData?.ten_chi_nhanh || context?.ma_chi_nhanh;
  const isDelivery = context?.loai_don_hang === 'GIAO_TAN_NOI' || context?.hasShipper;

  useEffect(() => {
    if (isOpen) {
      setService(5); setShipper(5); setProducts({}); setComment(''); setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [isOpen, orderId]);
  const close = () => { if (!inFlight.current) onClose(); };
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current || !context || context.reviewed) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await apiClient.post('/branch-reviews', {
        ma_don_hang: orderId,
        ma_chi_nhanh: context.ma_chi_nhanh,
        ten_chi_nhanh: context.ten_chi_nhanh || branchName,
        diem_tong_quan: service, danh_gia_dich_vu: service,
        danh_gia_mon: context.products.map(item => ({ ma_san_pham: item.ma_san_pham, so_sao: products[item.ma_san_pham] || item.so_sao || 5 })),
        ...(context.hasShipper ? { danh_gia_shipper: shipper } : {}), nhan_xet: comment.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branch-reviews-detail', context.ma_chi_nhanh] }),
        queryClient.invalidateQueries({ queryKey: ['branch-reviews-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['order-review-context', orderId] }),
        queryClient.invalidateQueries({ queryKey: ['my-reviewed-orders'] }),
      ]);
      onSuccess?.();
      inFlight.current = false; close();
    } catch (cause) { setError(cause?.response?.data?.message || ui('Không thể gửi đánh giá. Vui lòng thử lại.')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }}
    aria-labelledby="order-review-title" className="fixed inset-0 m-auto max-h-[90vh] w-[min(92vw,540px)] overflow-y-auto rounded-3xl bg-white p-6 md:p-7 text-stone-800 shadow-2xl backdrop:bg-black/50">
    <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
      <div>
        <h2 id="order-review-title" className="text-xl font-bold text-gray-900">{ui('Đánh giá đơn hàng')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{ui('Đánh giá trải nghiệm phục vụ và chất lượng món ăn')}</p>
      </div>
      <button type="button" aria-label={ui('Đóng')} onClick={close} disabled={busy} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"><XMarkIcon className="h-5 w-5" /></button>
    </div>
    {!orderId ? <p className="text-sm text-gray-500">{ui('Vui lòng mở đơn đã hoàn thành trong lịch sử để đánh giá chi nhánh.')}</p>
      : isPending ? <div className="py-10 text-center text-sm text-gray-500">{ui('Đang tải thông tin chi nhánh và món ăn...')}</div>
      : isError ? <p role="alert" className="text-sm text-red-600">{ui('Không thể tải đơn hàng để đánh giá. Vui lòng thử lại.')}</p>
      : context?.reviewed ? <p role="status" className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm font-semibold">{ui('Đơn hàng này đã được gửi đánh giá trước đó.')}</p>
      : <form onSubmit={submit} className="space-y-5">
        {/* Branch Info Card */}
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5 text-[#b22830]">
            <MapPinIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#b22830] uppercase tracking-wider">
              {isDelivery ? ui('Chi nhánh giao hàng của đơn') : ui('Chi nhánh phục vụ đơn')}
            </p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{branchName}</p>
            {context?.dia_chi_chi_nhanh && (
              <p className="text-xs text-gray-500 mt-0.5">{context.dia_chi_chi_nhanh}</p>
            )}
          </div>
        </div>

        <Rating label={isDelivery ? ui('Chất lượng phục vụ của chi nhánh giao hàng') : ui('Dịch vụ tại chi nhánh')} value={service} onChange={setService} disabled={busy} />
        {context?.products?.map(item => <Rating key={item.ma_san_pham} label={item.ten_san_pham}
          value={products[item.ma_san_pham] || item.so_sao || 5} disabled={busy || !!item.so_sao}
          onChange={value => setProducts(previous => ({ ...previous, [item.ma_san_pham]: value }))} />)}
        {context?.hasShipper && <Rating label={ui('Chất lượng giao hàng (Shipper)')} value={shipper} onChange={setShipper} disabled={busy} />}
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{ui('Chia sẻ trải nghiệm của bạn (tùy chọn)')}</label>
          <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={3} disabled={busy}
            placeholder={ui('Nhận xét về hương vị, thái độ phục vụ hoặc tốc độ giao hàng...')}
            className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all bg-white" />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{ui(error)}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#b22830] hover:bg-[#8f1d24] p-3 text-sm font-semibold tracking-wide text-white shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-98">{ui(busy ? 'Đang gửi...' : 'Gửi đánh giá chi nhánh')}</button>
      </form>}
  </dialog>;
}
