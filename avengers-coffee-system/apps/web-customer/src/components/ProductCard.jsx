import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { useTranslation } from 'react-i18next';

export default function ProductCard({ product, onView, onQuickAdd, onToggleFavorite, isFavorite = false }) {
  const { t } = useTranslation();
  const { ten_san_pham, gia_ban, gia_niem_yet, hinh_anh_url, trang_thai, danhMuc, la_hot, la_moi } = product;
  const hasDiscount = Number(gia_niem_yet || 0) > Number(gia_ban || 0);

  return (
    <div className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-3 transition-all duration-300 hover:shadow-lg hover:shadow-green-100/50">
      {/* Container Ảnh */}
      <div 
        className="relative mb-3 aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-[#f8f8f6]"
        onClick={onView}
      >
        <img 
          src={hinh_anh_url || 'https://via.placeholder.com/300'} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          alt={ten_san_pham} 
        />
        {!trang_thai && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white/90 text-gray-800 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">Tạm hết</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {hasDiscount ? <span className="rounded-full bg-[#c41230] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">Giảm giá</span> : null}
          {la_hot ? <span className="rounded-full bg-[#e67a00] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">{t('home.bestSeller')}</span> : null}
          {la_moi ? <span className="rounded-full bg-[#1a8b46] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">{t('home.tryNow')}</span> : null}
        </div>
        {onToggleFavorite ? (
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-white/95 p-2 shadow-sm transition-transform hover:scale-110"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
          >
            {isFavorite ? (
              <HeartSolidIcon className="h-5 w-5 text-[#c41230]" />
            ) : (
              <HeartOutlineIcon className="h-5 w-5 text-gray-400" />
            )}
          </button>
        ) : null}
      </div>

      {/* Nội dung */}
      <div className="flex flex-grow flex-col px-1">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1a8b46]">
          {danhMuc?.ten_danh_muc || t('home.product')}
        </p>
        
        <h3 
          className="mb-2 min-h-[2.8rem] cursor-pointer line-clamp-2 text-[16px] font-extrabold leading-tight text-[#1a1a1a] transition-colors hover:text-[#1a8b46]"
          onClick={onView}
        >
          {ten_san_pham}
        </h3>
        
        <div className="mt-auto">
          <div className="mb-3">
            {hasDiscount ? (
              <p className="text-xs font-bold text-gray-400 line-through">
                {Number(gia_niem_yet).toLocaleString('vi-VN')} đ
              </p>
            ) : null}
            <p className="text-[20px] font-black text-[#1a1a1a]">
              {Number(gia_ban).toLocaleString('vi-VN')} <span className="text-[14px] font-bold text-gray-500">đ</span>
            </p>
          </div>
          
          <button
            className="w-full rounded-lg bg-[#1a8b46] py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white shadow-sm transition-all hover:bg-[#158a3e] disabled:bg-gray-300 disabled:shadow-none"
            type="button"
            onClick={onQuickAdd}
            disabled={!trang_thai}
          >
            {trang_thai ? 'Thêm vào giỏ' : 'Hết hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}