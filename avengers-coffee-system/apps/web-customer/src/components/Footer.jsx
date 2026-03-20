export default function Footer() {
  return (
    <footer className="mt-8 bg-[#1f1813] pt-20 pb-10 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          
          <div>
            <h3 className="mb-8 text-sm font-semibold uppercase tracking-[0.22em] text-[#e3d5c6]">Giới thiệu</h3>
            <ul className="space-y-4 text-[13px] font-medium text-[#b8aca0]">
              <li><a href="#" className="hover:text-tch-orange transition-colors">Về Chúng Tôi</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Sản phẩm</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Khuyến mãi</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Cửa Hàng</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-8 text-sm font-semibold uppercase tracking-[0.22em] text-[#e3d5c6]">Điều khoản</h3>
            <ul className="space-y-4 text-[13px] font-medium text-[#b8aca0]">
              <li><a href="#" className="hover:text-tch-orange transition-colors">Điều khoản sử dụng</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Chính sách bảo mật</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Hướng dẫn xuất hóa đơn</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-8 text-sm font-semibold uppercase tracking-[0.22em] text-[#e3d5c6]">Liên hệ</h3>
            <div className="space-y-4 text-[13px] font-medium text-[#b8aca0]">
              <p><span className="text-white">Đặt hàng:</span> 1800 6936</p>
              <p><span className="text-white">Email:</span> support.hn@avengers.com.vn</p>
              <p className="leading-relaxed">
                <span className="text-white">VPGG:</span> Tầng 6, Toà nhà Avengers, Số 315 Trường Chinh, Hà Nội
              </p>
            </div>
          </div>

          <div>
             <h3 className="brand-serif mb-6 text-xl font-semibold tracking-tight text-white">
                THE <span className="text-tch-orange">AVENGERS</span> HOUSE
             </h3>
             <div className="mb-6 h-28 w-28 rounded-2xl bg-white p-3 shadow-xl shadow-black/20">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=AvengersHouse" alt="QR" />
             </div>
             <div className="flex flex-wrap gap-2 text-[12px] font-semibold text-[#d8c7b6]">
                <span className="rounded-full border border-[#3d3128] px-3 py-1">Facebook</span>
                <span className="rounded-full border border-[#3d3128] px-3 py-1">Instagram</span>
                <span className="rounded-full border border-[#3d3128] px-3 py-1">TikTok</span>
             </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-10">
          <p className="text-[11px] font-medium leading-relaxed text-[#9a8f84]">
            Công ty cổ phần thương mại dịch vụ Trà Cà Phê Avengers VN<br />
            © 2026 THE AVENGERS HOUSE. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}