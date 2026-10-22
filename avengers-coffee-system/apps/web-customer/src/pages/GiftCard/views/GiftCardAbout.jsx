import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React from 'react';

export const GiftCardAbout = ({ onNavigate }) => {
  useUiLanguage();

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Hero Banner Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7a141a] via-[#9e1c24] to-[#450a0e] text-white py-20 px-4">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="max-w-[1140px] mx-auto text-center relative z-10">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/15 text-amber-200 text-xs font-semibold tracking-wider uppercase mb-5 backdrop-blur-sm">
            {ui("Avengers E-Gift Card")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-6 tracking-tight leading-tight">
            {ui("Về Thẻ Quà Tặng Avengers Coffee")}
          </h1>
          <p className="text-stone-200 text-base md:text-lg max-w-[760px] mx-auto leading-relaxed mb-8 font-light">
            {ui("Trao gửi hương vị cà phê đậm đà cùng vạn lời yêu thương chân thành. Thẻ quà tặng điện tử Avengers Coffee mang đến trải nghiệm hiện đại, tức thì và trọn vẹn cảm xúc.")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onNavigate('home')}
              className="px-8 py-3.5 bg-white text-[#9e1c24] font-bold rounded-full text-sm hover:bg-stone-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              {ui("Mua Thẻ Tặng Ngay")}
            </button>
            <button
              onClick={() => onNavigate('bo-suu-tap')}
              className="px-8 py-3.5 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-full text-sm backdrop-blur-sm transition-all"
            >
              {ui("Xem Các Mẫu Thẻ")}
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 -mt-10 relative z-20 space-y-20">

        {/* Section 1: Thẻ Avengers Coffee Là Gì? */}
        <section className="bg-white rounded-3xl p-8 md:p-12 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.06)] border border-stone-200/60">
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <span className="text-[#b22830] text-xs font-bold uppercase tracking-widest block mb-2">{ui("Giới thiệu")}</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight mb-4">
              {ui("Thẻ Avengers Coffee Là Gì?")}
            </h2>
            <p className="text-stone-600 text-sm md:text-base leading-relaxed">
              {ui("Thẻ quà tặng Avengers Coffee (E-Gift Card) là phương thức thanh toán điện tử thông minh. Thay vì phải gửi tặng món quà vật lý cồng kềnh, bạn có thể gửi tặng ngay một số dư thưởng thức đồ uống tại Avengers Coffee đến bất kỳ ai chỉ trong chớp mắt.")}
            </p>
          </div>

          {/* 3 Core Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl bg-amber-50/60 border border-amber-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold text-xl mb-4">
                ⚡
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("100% Kỹ Thuật Số Tức Thì")}</h3>
              <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                {ui("Mã thẻ và thiệp mừng cá nhân hóa được chuyển thẳng tới Email và số điện thoại người nhận ngay sau khi hoàn tất thanh toán.")}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-red-50/60 border border-red-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 text-[#b22830] flex items-center justify-center font-bold text-xl mb-4">
                ☕
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Đa Dạng Mệnh Giá & Thiết Kế")}</h3>
              <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                {ui("Linh hoạt lựa chọn mệnh giá từ 50.000đ đến 5.000.000đ cùng 9+ mẫu thẻ nghệ thuật theo các mùa trong năm.")}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-emerald-50/60 border border-emerald-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold text-xl mb-4">
                💳
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Nạp Vào Ví Khách Hàng")}</h3>
              <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                {ui("Người nhận có thể nạp thẳng giá trị thẻ vào Ví Avengers để đặt hàng giao tận nơi hoặc thanh toán không tiền mặt tại quầy.")}
              </p>
            </div>
          </div>

          {/* Visual Showcase - 3 Real Distinct Cards */}
          <div className="pt-6 border-t border-stone-100 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-6">{ui("Hình ảnh một số mẫu thẻ tiêu biểu")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-[900px] mx-auto">
              <div className="group rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-stone-100">
                <img src="/images/cards/chill_1.png" alt="Chill Hè Vàng" className="w-full h-auto object-cover" />
                <div className="p-3 bg-white text-xs font-bold text-stone-700">Chill Hè 2025 - Sắc Vàng Trẻ Trung</div>
              </div>
              <div className="group rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-stone-100">
                <img src="/images/cards/festive_1.png" alt="Festive Đỏ" className="w-full h-auto object-cover" />
                <div className="p-3 bg-white text-xs font-bold text-stone-700">Festive 2026 - Đỏ Mùa Lễ Hội</div>
              </div>
              <div className="group rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-stone-100">
                <img src="/images/cards/thankyou_2.png" alt="Thank You Trắng" className="w-full h-auto object-cover border-t border-stone-100" />
                <div className="p-3 bg-white text-xs font-bold text-stone-700">Thank You 2026 - Tinh Tế Tri Ân</div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Bí Kíp Xài Thẻ Avengers Coffee */}
        <section className="bg-white rounded-3xl p-8 md:p-12 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.06)] border border-stone-200/60">
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <span className="text-[#b22830] text-xs font-bold uppercase tracking-widest block mb-2">{ui("Hướng Dẫn")}</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight mb-4">
              {ui("Bí Kíp Xài Thẻ Avengers Coffee Chuẩn 4 Bước")}
            </h2>
            <p className="text-stone-600 text-sm md:text-base leading-relaxed">
              {ui("Từ lúc nhận mã thẻ cho đến khi thưởng thức ly cà phê thơm ngon, tất cả diễn ra vô cùng đơn giản và nhanh gọn:")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="relative p-6 rounded-2xl bg-stone-50 border border-stone-200/70 hover:bg-white hover:shadow-lg transition-all duration-300">
              <span className="text-3xl font-black text-[#b22830]/20 absolute top-4 right-4">01</span>
              <div className="w-10 h-10 rounded-xl bg-red-100 text-[#b22830] flex items-center justify-center font-bold mb-4">
                📩
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Nhận Mã Thẻ")}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {ui("Kiểm tra hộp thư Email hoặc tin nhắn SMS để nhận mã quà tặng (dạng XXXX-XXXX-XXXX-XXXX) cùng lời chúc từ người tặng.")}
              </p>
            </div>

            <div className="relative p-6 rounded-2xl bg-stone-50 border border-stone-200/70 hover:bg-white hover:shadow-lg transition-all duration-300">
              <span className="text-3xl font-black text-[#b22830]/20 absolute top-4 right-4">02</span>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold mb-4">
                🔑
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Kích Hoạt Vào Ví")}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {ui("Vào mục Thẻ Quà Tặng trên website/app, bấm \"Nạp Thẻ Ngay\", dán mã thẻ và số dư sẽ lập tức được cộng vào ví tài khoản.")}
              </p>
            </div>

            <div className="relative p-6 rounded-2xl bg-stone-50 border border-stone-200/70 hover:bg-white hover:shadow-lg transition-all duration-300">
              <span className="text-3xl font-black text-[#b22830]/20 absolute top-4 right-4">03</span>
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold mb-4">
                ☕
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Gọi Món Linh Hoạt")}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {ui("Sử dụng số dư ví để đặt món online giao tận nhà hoặc quét mã QR/đọc số điện thoại thanh toán trực tiếp tại quầy.")}
              </p>
            </div>

            <div className="relative p-6 rounded-2xl bg-stone-50 border border-stone-200/70 hover:bg-white hover:shadow-lg transition-all duration-300">
              <span className="text-3xl font-black text-[#b22830]/20 absolute top-4 right-4">04</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold mb-4">
                ⭐
              </div>
              <h3 className="font-bold text-stone-900 text-base mb-2">{ui("Tích Điểm Thưởng")}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {ui("Mọi hóa đơn chi tiêu bằng ví Thẻ đều được tích điểm thưởng Avengers Rewards để thăng hạng và đổi voucher giảm giá.")}
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Lợi Ích Khi Sử Dụng Thẻ */}
        <section className="bg-white rounded-3xl p-8 md:p-12 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.06)] border border-stone-200/60">
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <span className="text-[#b22830] text-xs font-bold uppercase tracking-widest block mb-2">{ui("Ưu Điểm")}</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight mb-4">
              {ui("Lợi Ích Vượt Trội Khi Sử Dụng Thẻ")}
            </h2>
            <p className="text-stone-600 text-sm md:text-base leading-relaxed">
              {ui("Thẻ Avengers Coffee không chỉ là một món quà, mà là sự đồng hành chu đáo trong từng ly cà phê mỗi ngày:")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex gap-4 p-5 rounded-2xl bg-stone-50 border border-stone-100">
              <div className="w-12 h-12 rounded-xl bg-red-100 text-[#b22830] flex items-center justify-center flex-shrink-0 text-xl font-bold">
                🗓️
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-base mb-1">{ui("Hạn Sử Dụng Linh Hoạt Đến 12 Tháng")}</h3>
                <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                  {ui("Không áp lực thời gian, người nhận thoải mái thưởng thức những ly cà phê yêu thích vào bất kỳ dịp nào trong suốt 1 năm.")}
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-2xl bg-stone-50 border border-stone-100">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 text-xl font-bold">
                💌
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-base mb-1">{ui("Cá Nhân Hóa Lời Chúc Riêng")}</h3>
                <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                  {ui("Tự do gửi gắm thông điệp tâm tình, chọn thiệp chúc theo chủ đề: sinh nhật, chúc mừng công việc mới, tỏ tình hay cảm ơn đối tác.")}
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-2xl bg-stone-50 border border-stone-100">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 text-xl font-bold">
                🎁
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-base mb-1">{ui("Ưu Đãi Kép & Khuyến Mãi Nạp Thẻ")}</h3>
                <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                  {ui("Nhận thêm tiền thưởng hoặc voucher tặng kèm khi mua thẻ trong các chương trình tri ân hoặc các dịp lễ hội lớn.")}
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-2xl bg-stone-50 border border-stone-100">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0 text-xl font-bold">
                🔒
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-base mb-1">{ui("An Toàn & Bảo Mật Tuyệt Đối")}</h3>
                <p className="text-xs md:text-sm text-stone-600 leading-relaxed">
                  {ui("Mã hóa theo tiêu chuẩn ngân hàng, chống sao chép và quản lý lịch sử giao dịch minh bạch trên ứng dụng khách hàng.")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <section className="bg-gradient-to-r from-stone-900 via-stone-800 to-[#5a1418] rounded-3xl p-8 md:p-12 text-center text-white shadow-xl">
          <h2 className="text-2xl md:text-3xl font-black mb-4 tracking-tight">
            {ui("Sẵn Sàng Gửi Trao Hương Vị Cà Phê?")}
          </h2>
          <p className="text-stone-300 text-sm md:text-base max-w-[600px] mx-auto mb-8 font-light">
            {ui("Chỉ mất chưa đầy 1 phút để chọn thẻ và chuyển trọn vẹn tình cảm đến người thương của bạn.")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onNavigate('home')}
              className="px-8 py-3.5 bg-[#b22830] hover:bg-[#8c1f24] text-white font-bold rounded-full text-sm transition-all shadow-md hover:shadow-lg"
            >
              {ui("Tạo Thẻ Quà Tặng Ngay")}
            </button>
            <button
              onClick={() => onNavigate('chinh-sach')}
              className="px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-full text-sm backdrop-blur-sm transition-all"
            >
              {ui("Xem Chính Sách Thẻ")}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};
