import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React from 'react';

export const GiftCardPolicy = () => {
  useUiLanguage();

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Hero Header */}
      <section className="bg-gradient-to-r from-[#7a141a] via-[#9e1c24] to-[#450a0e] text-white py-16 px-4">
        <div className="max-w-[1140px] mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/15 text-amber-200 text-xs font-semibold tracking-wider uppercase mb-4 backdrop-blur-sm">
            {ui("Điều Khoản & Pháp Lý")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
            {ui("Chính Sách & Hướng Dẫn Sử Dụng Thẻ")}
          </h1>
          <p className="text-stone-200 text-sm md:text-base max-w-[680px] mx-auto leading-relaxed font-light">
            {ui("Quy định chi tiết về việc đăng ký, nạp tiền, kích hoạt, sử dụng Thẻ Quà Tặng Avengers Coffee và các cam kết bảo mật thông tin khách hàng.")}
          </p>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 pt-10">

        {/* Key Takeaways Callout Box */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-stone-200/80 shadow-sm mb-12">
          <h3 className="font-bold text-stone-900 text-base mb-4 flex items-center gap-2">
            <span className="text-[#b22830] text-lg">📌</span>
            <span>{ui("Những Điểm Cốt Lõi Cần Lưu Ý")}</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs md:text-sm">
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100">
              <span className="font-bold text-amber-900 block mb-1">⏱️ {ui("Thời Hạn Mã Kích Hoạt")}</span>
              <p className="text-stone-600 leading-relaxed">{ui("Mã xác nhận mua thẻ có hiệu lực tối đa 90 ngày kể từ ngày thanh toán thành công.")}</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <span className="font-bold text-emerald-900 block mb-1">💳 {ui("Số Dư Ví Khách Hàng")}</span>
              <p className="text-stone-600 leading-relaxed">{ui("Sau khi nạp mã vào Ví Avengers, số dư ví không bao giờ hết hạn sử dụng.")}</p>
            </div>
            <div className="p-4 rounded-xl bg-red-50/60 border border-red-100">
              <span className="font-bold text-red-900 block mb-1">🚫 {ui("Không Hoàn Tiền Mặt")}</span>
              <p className="text-stone-600 leading-relaxed">{ui("Thẻ quà tặng và số dư ví không được quy đổi thành tiền mặt trong mọi trường hợp.")}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
              <span className="font-bold text-blue-900 block mb-1">🔒 {ui("Bảo Mật Tiêu Chuẩn")}</span>
              <p className="text-stone-600 leading-relaxed">{ui("Cam kết bảo vệ dữ liệu cá nhân theo Luật An toàn thông tin mạng hiện hành.")}</p>
            </div>
          </div>
        </div>

        {/* Content Layout with Table of Contents */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Sticky Sidebar: Table of Contents */}
          <aside className="lg:col-span-1 hidden lg:block">
            <div className="sticky top-24 bg-white rounded-2xl p-6 border border-stone-200/80 shadow-sm space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">{ui("Mục Lục")}</h4>
              <nav className="space-y-1.5 text-xs font-medium text-stone-600">
                <button onClick={() => scrollTo('sec-1')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  1. Đăng ký & Nạp tiền online
                </button>
                <button onClick={() => scrollTo('sec-2')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  2. Gửi tặng Thẻ cho người khác
                </button>
                <button onClick={() => scrollTo('sec-3')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  3. Quy định Mã xác nhận
                </button>
                <button onClick={() => scrollTo('sec-4')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  4. Thời hạn kích hoạt thẻ
                </button>
                <button onClick={() => scrollTo('sec-5')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  5. Địa điểm áp dụng
                </button>
                <button onClick={() => scrollTo('sec-6')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1">
                  6. Liên kết & Quản lý Thẻ
                </button>
                <button onClick={() => scrollTo('sec-privacy')} className="block text-left w-full hover:text-[#b22830] transition-colors py-1 text-[#b22830] font-bold pt-2 border-t border-stone-100">
                  7. Chính Sách Bảo Mật
                </button>
              </nav>
            </div>
          </aside>

          {/* Main Legal Text Document */}
          <main className="lg:col-span-3 bg-white rounded-3xl p-8 md:p-12 border border-stone-200/80 shadow-sm space-y-10 leading-relaxed text-sm md:text-[15px] text-stone-700">

            <div className="border-b border-stone-100 pb-6">
              <span className="text-xs text-stone-400">{ui("Cập nhật lần cuối: 22/10/2026")}</span>
              <p className="mt-2 text-stone-600">
                {ui("Bạn vui lòng xem kỹ Hướng Dẫn này để hiểu rõ cách thức đăng ký và nạp tiền vào Thẻ Avengers Coffee, gửi tặng thẻ cho người thân, bạn bè cũng như các quy định về việc nhận mã xác nhận, thời hạn kích hoạt và điều khoản bảo mật.")}
              </p>
            </div>

            {/* Section 1 */}
            <section id="sec-1" className="space-y-3 pt-2">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">1.</span>
                <span>{ui("Đăng Ký Và Nạp Tiền Qua Website")}</span>
              </h2>
              <p className="text-stone-600">{ui("Bạn có thể đăng ký và nạp tiền vào Thẻ Avengers Coffee bằng cách thực hiện các bước sau:")}</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-stone-600">
                <li>{ui("Truy cập trang Thẻ Quà Tặng trên website Avengers Coffee.")}</li>
                <li>{ui("Chọn mẫu thiết kế thẻ mong muốn trong các bộ sưu tập.")}</li>
                <li>{ui("Chọn giá trị tiền nạp vào thẻ (từ 50.000đ đến 5.000.000đ).")}</li>
                <li>{ui("Nhập tên, số điện thoại và email của bạn.")}</li>
                <li>{ui("Tick chọn ô “Tôi muốn gửi tặng cho chính mình”.")}</li>
                <li>{ui("Kiểm tra lại thông tin và xác nhận thanh toán.")}</li>
                <li>{ui("Hoàn tất thanh toán, hệ thống sẽ gửi mã thẻ quà tặng qua Email/SMS tức thì.")}</li>
              </ol>
            </section>

            {/* Section 2 */}
            <section id="sec-2" className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">2.</span>
                <span>{ui("Gửi Tặng Thẻ Avengers Coffee Cho Người Khác")}</span>
              </h2>
              <p className="text-stone-600">{ui("Khi gửi tặng cho người thân hoặc bạn bè:")}</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-stone-600">
                <li>{ui("Chọn mẫu thẻ và mệnh giá phù hợp với dịp tặng.")}</li>
                <li>{ui("Nhập đầy đủ thông tin người gửi (Họ tên, SĐT, Email).")}</li>
                <li>{ui("Nhập thông tin người nhận (Họ tên, SĐT, Email nhận thiệp).")}</li>
                <li>{ui("Viết lời chúc riêng tư hoặc chọn các lời chúc có sẵn.")}</li>
                <li>{ui("Xác nhận thanh toán an toàn.")}</li>
                <li>{ui("Người nhận sẽ nhận được thiệp chúc mừng kèm mã thẻ 16 ký tự để nạp vào ví cá nhân.")}</li>
              </ol>
            </section>

            {/* Section 3 */}
            <section id="sec-3" className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">3.</span>
                <span>{ui("Quy Định Về Mã Xác Nhận")}</span>
              </h2>
              <p className="text-stone-600">
                {ui("Mã xác nhận (Gift Card Code) sẽ được gửi đến người nhận qua Email và SMS trong vòng 1-5 phút sau khi giao dịch thành công. Mỗi mã thẻ chỉ được nạp một (01) lần duy nhất. Sau khi nạp, mã thẻ sẽ chuyển sang trạng thái đã sử dụng (REDEEMED) và không thể tái kích hoạt.")}
              </p>
            </section>

            {/* Section 4 */}
            <section id="sec-4" className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">4.</span>
                <span>{ui("Thời Hạn Kích Hoạt")}</span>
              </h2>
              <p className="text-stone-600">
                {ui("Mã thẻ quà tặng có thời hạn kích hoạt tối đa là 12 tháng kể từ ngày phát hành. Người dùng vui lòng nạp mã thẻ vào ví trước thời điểm hết hạn. Sau khi đã nạp vào Ví Khách Hàng, số dư ví không bao giờ hết hạn.")}
              </p>
            </section>

            {/* Section 5 */}
            <section id="sec-5" className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">5.</span>
                <span>{ui("Địa Điểm Áp Dụng")}</span>
              </h2>
              <p className="text-stone-600">
                {ui("Thẻ Quà Tặng Avengers Coffee và số dư ví được chấp nhận thanh toán tại hơn 50+ chi nhánh thuộc hệ thống Avengers Coffee trên toàn quốc, cũng như cho mọi đơn hàng đặt giao tận nơi trên website và app di động.")}
              </p>
            </section>

            {/* Section 6 */}
            <section id="sec-6" className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-lg md:text-xl font-bold text-stone-900 flex items-center gap-2">
                <span className="text-[#b22830]">6.</span>
                <span>{ui("Liên Kết Và Quản Lý Thẻ")}</span>
              </h2>
              <p className="text-stone-600">
                {ui("Khách hàng có thể dễ dàng quản lý toàn bộ các thẻ đã nhận hoặc số dư ví trong mục Tài Khoản > Thẻ Quà Tặng. Mọi lịch sử cộng tiền, trừ tiền thanh toán đơn hàng đều được lưu vết minh bạch.")}
              </p>
            </section>

            {/* Privacy Policy */}
            <section id="sec-privacy" className="space-y-4 pt-6 border-t-2 border-stone-200">
              <div className="inline-block px-3 py-1 rounded-full bg-red-50 text-[#b22830] text-xs font-bold uppercase tracking-wider">
                {ui("Chính Sách Bảo Mật")}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-stone-900">
                {ui("Cam Kết Bảo Mật Thông Tin Khách Hàng")}
              </h2>
              <p className="text-stone-600">
                {ui("Avengers Coffee cam kết bảo mật tuyệt đối thông tin cá nhân của bạn theo Luật An ninh mạng và các quy định pháp luật liên quan. Dữ liệu thẻ và thông tin thanh toán được mã hóa theo chuẩn bảo mật TLS 1.3 và không bao giờ được chia sẻ cho bên thứ ba vì mục đích thương mại trái phép.")}
              </p>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 text-xs text-stone-500">
                {ui("Nếu bạn phát hiện bất kỳ dấu hiệu bất thường nào liên quan đến mã thẻ hoặc ví cá nhân, xin vui lòng thông báo ngay cho Ban quản trị qua hotline 1900 1755 để được hỗ trợ khóa thẻ kịp thời.")}
              </div>
            </section>

          </main>
        </div>

      </div>
    </div>
  );
};
