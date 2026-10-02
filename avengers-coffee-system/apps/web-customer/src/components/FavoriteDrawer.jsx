import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { ShoppingCartIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function FavoriteDrawer({
  isOpen,
  onClose,
  items = [],
  onAddToCart,
  onAddAllToCart,
  onRemoveFavorite,
  isWorking = false,
}) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/35" onClick={onClose} />

      <aside className="fixed right-0 top-0 z-[120] h-full w-full max-w-[420px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-rose-500">Danh sách yêu thích</p>
            <h2 className="text-lg font-black text-gray-800">{items.length} món đang lưu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="h-[calc(100%-150px)] overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="mt-16 text-center">
              <HeartSolidIcon className="mx-auto h-10 w-10 text-rose-300" />
              <p className="mt-3 text-sm font-bold text-gray-500">Bạn chưa có món nào trong danh sách yêu thích.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={`fav-${item.ma_san_pham}`} className="rounded-2xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex gap-3">
                    <img
                      src={item.hinh_anh_url || 'https://via.placeholder.com/120'}
                      alt={item.ten_san_pham}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-gray-800">{item.ten_san_pham}</p>
                      <p className="mt-1 text-sm font-black text-tch-orange">
                        {Number(item.gia_ban || 0).toLocaleString('vi-VN')} đ
                      </p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {item?.danhMuc?.ten_danh_muc || item.danh_muc || 'Sản phẩm'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAddToCart?.(item)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-tch-orange px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-md shadow-orange-200 disabled:bg-gray-300"
                      disabled={isWorking}
                    >
                      <ShoppingCartIcon className="h-4 w-4" />
                      Thêm vào giỏ
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveFavorite?.(item)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-gray-500 transition-colors hover:border-rose-200 hover:text-rose-500 disabled:opacity-50"
                      disabled={isWorking}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={onAddAllToCart}
            disabled={!items.length || isWorking}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-black uppercase tracking-wider text-white disabled:bg-gray-300"
          >
            {isWorking ? 'Đang xử lý...' : 'Thêm tất cả vào giỏ'}
          </button>
        </div>
      </aside>
    </>
  );
}
