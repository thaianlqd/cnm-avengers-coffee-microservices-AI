export default function OrderFooter({ onNavigate }) {
  return (
    <footer className="w-full text-[14px]">
      <div className="flex flex-col md:flex-row min-h-[400px]">

        {/* Left Side: Thông tin công ty (White Background) */}
        <div className="w-full md:w-[38%] bg-[#f9f9f9] py-12 px-6 md:pl-[calc((100vw-1240px)/2+1rem)] md:pr-10 flex justify-end">
          <div className="w-full max-w-[400px] flex flex-col gap-4">
            <h3 className="text-[16px] font-bold text-[#333333] mb-2">Thông tin công ty</h3>
            <img src="/hc-assets/logo.png" alt="Highlands Coffee" className="w-[100px] h-auto object-contain" />

            <p className="text-[13px] leading-relaxed mt-2 text-[#333333] text-justify">
              Highlands Coffee® Order thuộc CÔNG TY CỔ PHẦN DỊCH VỤ CÀ PHÊ CAO NGUYÊN tự hào là nhà phân phối hợp lệ cho tất cả các sản phẩm mang thương hiệu Highlands Coffee®. Trụ sở văn phòng:
            </p>

            <ul className="text-[13px] leading-relaxed space-y-3 mt-2 text-[#333333]">
              <li className="flex gap-3 items-start">
                <span className="font-bold shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg></span>
                <span className="text-justify">Địa chỉ: 125-127 Nguyễn Cơ Thạch, phường An Lợi Đông, Quận 2, TP. Hồ Chí Minh. MSDN: 0309965814 do Sở Kế hoạch - Đầu tư Tp.HCM cấp lần đầu ngày 20/04/2010, sửa đổi lần thứ 30 ngày 30/08/2022.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="font-bold shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg></span>
                <span>Số điện thoại: 19001755</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="font-bold shrink-0 mt-0.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg></span>
                <span>Email: customerservice@highlandscoffee.com.vn</span>
              </li>
            </ul>

            <div className="flex gap-3 mt-4">
              <a href="#" className="w-[30px] h-[30px] bg-[#3b5998] text-white flex items-center justify-center rounded-[4px] hover:opacity-80 transition-opacity">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
              </a>
              <a href="#" className="w-[30px] h-[30px] bg-[#008fe5] text-white flex items-center justify-center rounded-[4px] hover:opacity-80 transition-opacity font-bold text-[10px]">
                Zalo
              </a>
              <a href="#" className="w-[30px] h-[30px] bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white flex items-center justify-center rounded-[4px] hover:opacity-80 transition-opacity">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
              </a>
            </div>

            <p className="text-[12px] text-gray-500 mt-6">
              © 2023 Highlands Coffee. All rights reserved | Cung cấp bởi Sapo
            </p>
          </div>
        </div>

        {/* Right Side: Chính sách, Hỗ trợ, Đăng ký (Gray Background) */}
        <div className="w-full md:w-[62%] bg-[#efefef] py-12 px-6 md:pl-16 md:pr-[calc((100vw-1240px)/2+1rem)] flex justify-start">
          <div className="w-full max-w-[800px] grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Column 2: Chính sách */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[16px] font-bold text-[#333333] mb-2">Chính sách</h3>
              <ul className="space-y-4 text-[13px] font-normal text-[#333333]">
                <li><button type="button" onClick={() => onNavigate?.('chinh-sach-dat-hang')} className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Chính sách đặt hàng</button></li>
                <li><button type="button" className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Chính sách bảo mật</button></li>
                <li><button type="button" className="hover:text-[#b22830] transition-colors leading-relaxed block cursor-pointer bg-transparent border-none p-0 text-[13px] text-left">Chính sách thanh toán VNPAY online</button></li>
              </ul>
            </div>

            {/* Column 3: Hỗ trợ */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[16px] font-bold text-[#333333] mb-2">Hỗ trợ</h3>
              <ul className="space-y-4 text-[13px] font-normal text-[#333333]">
                <li><button type="button" className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Tìm kiếm</button></li>
                <li><button type="button" onClick={() => onNavigate?.('login')} className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Đăng nhập</button></li>
                <li><button type="button" className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Đăng ký</button></li>
                <li><button type="button" onClick={() => onNavigate?.('cart')} className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Giỏ hàng</button></li>
                <li><button type="button" onClick={() => onNavigate?.('lien-he')} className="hover:text-[#b22830] transition-colors cursor-pointer bg-transparent border-none p-0 text-[13px]">Liên hệ</button></li>
              </ul>
            </div>

            {/* Column 4: Đăng ký nhận tin */}
            <div className="flex flex-col gap-4">
              <h3 className="text-[16px] font-bold text-[#333333] mb-2">Đăng ký nhận tin</h3>
              <form className="flex w-full mt-1">
                <input
                  type="email"
                  placeholder="Nhập địa chỉ email"
                  className="flex-1 h-[42px] px-4 text-[13px] border border-transparent rounded-l-[4px] outline-none focus:border-gray-400 w-full min-w-0"
                />
                <button
                  type="button"
                  className="h-[42px] px-5 bg-[#e4d5c7] text-[#a63032] text-[13px] rounded-r-[4px] hover:bg-[#d4c3b0] transition-colors whitespace-nowrap"
                >
                  Đăng ký
                </button>
              </form>

              <div className="mt-4">
                <img src="/hc-assets/logo_bct.png" alt="Bộ Công Thương" className="h-[45px] w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            </div>

          </div>
        </div>

      </div>
    </footer>
  );
}
