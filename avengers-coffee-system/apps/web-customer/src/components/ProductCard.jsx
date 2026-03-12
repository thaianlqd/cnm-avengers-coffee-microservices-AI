export default function ProductCard({ product, onView, onQuickAdd }) {
  const { ten_san_pham, gia_ban, hinh_anh_url, trang_thai, danhMuc } = product;

  return (
    <div className="group bg-white rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 p-3 border border-gray-100 flex flex-col h-full">
      {/* Container Ảnh */}
      <div 
        className="relative w-full aspect-square overflow-hidden rounded-2xl mb-4 bg-tch-gray cursor-pointer"
        onClick={onView}
      >
        <img 
          src={hinh_anh_url || 'https://via.placeholder.com/300'} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
          alt={ten_san_pham} 
        />
        {!trang_thai && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white/90 text-gray-800 px-4 py-1 rounded-full text-xs font-bold uppercase">Hết món</span>
          </div>
        )}
      </div>

      {/* Nội dung */}
      <div className="flex flex-col flex-grow px-2">
        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-1">
          {danhMuc?.ten_danh_muc || 'Sản phẩm'}
        </p>
        
        <h3 className="font-black text-gray-800 text-lg mb-2 leading-tight line-clamp-2 h-12 cursor-pointer hover:text-tch-orange transition-colors">
          {ten_san_pham}
        </h3>
        
        <div className="mt-auto">
          <p className="text-gray-900 font-black text-xl mb-4">
            {Number(gia_ban).toLocaleString('vi-VN')} đ
          </p>
          
          <div className="flex gap-2">
            <button
              className="flex-1 py-2.5 border-2 border-tch-orange text-tch-orange text-[11px] font-black rounded-xl hover:bg-orange-50 uppercase transition-colors"
              type="button"
              onClick={onView}
            >
              Chi tiết
            </button>
            <button
              className="flex-1 py-2.5 bg-tch-orange text-white text-[11px] font-black rounded-xl hover:bg-orange-600 shadow-md shadow-orange-100 uppercase transition-all disabled:bg-gray-300 disabled:shadow-none"
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