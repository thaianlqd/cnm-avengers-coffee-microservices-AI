export default function Footer() {
  return (
    <footer className="bg-[#191919] text-white pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          
          <div>
            <h3 className="text-white font-black mb-8 uppercase tracking-[2px] text-sm">Giới thiệu</h3>
            <ul className="space-y-4 text-[13px] text-gray-400 font-bold">
              <li><a href="#" className="hover:text-tch-orange transition-colors">Về Chúng Tôi</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Sản phẩm</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Khuyến mãi</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Cửa Hàng</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-black mb-8 uppercase tracking-[2px] text-sm">Điều khoản</h3>
            <ul className="space-y-4 text-[13px] text-gray-400 font-bold">
              <li><a href="#" className="hover:text-tch-orange transition-colors">Điều khoản sử dụng</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Chính sách bảo mật</a></li>
              <li><a href="#" className="hover:text-tch-orange transition-colors">Hướng dẫn xuất hóa đơn</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-black mb-8 uppercase tracking-[2px] text-sm">Liên hệ</h3>
            <div className="space-y-4 text-[13px] text-gray-400 font-bold">
              <p><span className="text-white">Đặt hàng:</span> 1800 6936</p>
              <p><span className="text-white">Email:</span> support.hn@avengers.com.vn</p>
              <p className="leading-relaxed">
                <span className="text-white">VPGG:</span> Tầng 6, Toà nhà Avengers, Số 315 Trường Chinh, Hà Nội
              </p>
            </div>
          </div>

          <div>
             <h3 className="text-white font-black text-xl mb-6 italic tracking-tighter">
                THE <span className="text-tch-orange">AVENGERS</span> HOUSE
             </h3>
             <div className="bg-white p-3 w-28 h-28 rounded-2xl mb-6 shadow-xl shadow-black/20">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=AvengersHouse" alt="QR" />
             </div>
             <div className="flex space-x-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white/10 p-2.5 rounded-full cursor-pointer hover:bg-tch-orange transition-all">
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-10">
          <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
            Công ty cổ phần thương mại dịch vụ Trà Cà Phê Avengers VN<br />
            © 2026 THE AVENGERS HOUSE. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}