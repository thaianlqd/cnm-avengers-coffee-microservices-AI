import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

export default function ProductCard({ product, onView, onQuickAdd, onToggleFavorite, isFavorite = false }) {
  const { ten_san_pham, gia_ban, gia_niem_yet, hinh_anh_url, trang_thai, danhMuc, la_hot, la_moi } = product;
  const hasDiscount = Number(gia_niem_yet || 0) > Number(gia_ban || 0);

  return (
    <div className="group flex h-full flex-col border-0 bg-transparent p-0 transition-all duration-300 hover:-translate-y-0.5">
      {/* Container Ảnh */}
      <div 
        className="relative mb-4 aspect-square w-full cursor-pointer overflow-hidden rounded-[20px] bg-[#f6f6f4]"
        onClick={onView}
      >
        <img 
          src={hinh_anh_url || 'https://via.placeholder.com/300'} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
          alt={ten_san_pham} 
        />
        {!trang_thai && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white/90 text-gray-800 px-4 py-1 rounded-full text-xs font-bold uppercase">Tạm hết</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {hasDiscount ? <span className="rounded-full bg-[#b42318] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Giảm giá</span> : null}
          {la_hot ? <span className="rounded-full bg-[#b35a1f] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Nổi bật</span> : null}
          {la_moi ? <span className="rounded-full bg-[#0f766e] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Mới</span> : null}
        </div>
        {onToggleFavorite ? (
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-white/95 p-2 shadow-sm"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
          >
            {isFavorite ? (
              <HeartSolidIcon className="h-5 w-5 text-rose-500" />
            ) : (
              <HeartOutlineIcon className="h-5 w-5 text-gray-500" />
            )}
          </button>
        ) : null}
      </div>

      {/* Nội dung */}
      <div className="flex flex-grow flex-col px-1">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f5e4d]">
          {danhMuc?.ten_danh_muc || 'Sản phẩm'}
        </p>
        
        <h3 className="mb-2 min-h-[3rem] cursor-pointer line-clamp-2 text-[24px] font-black leading-tight text-[#191410] transition-colors hover:text-tch-orange">
          {ten_san_pham}
        </h3>
        
        <div className="mt-auto">
          <div className="mb-4">
            {hasDiscount ? (
              <p className="text-sm font-bold text-[#8a7764] line-through">
                {Number(gia_niem_yet).toLocaleString('vi-VN')} đ
              </p>
            ) : null}
            <p className="text-[30px] font-black text-[#16110d]">
              {Number(gia_ban).toLocaleString('vi-VN')} đ
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl border border-[#cb6f36] py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#cb6f36] transition-colors hover:bg-orange-50"
              type="button"
              onClick={onView}
            >
              Chi tiết
            </button>
            <button
              className="flex-1 rounded-xl bg-tch-orange py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm shadow-orange-200 transition-all hover:bg-orange-700 disabled:bg-gray-300 disabled:shadow-none"
              type="button"
              onClick={onQuickAdd}
              disabled={!trang_thai}
            >
              Thêm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}