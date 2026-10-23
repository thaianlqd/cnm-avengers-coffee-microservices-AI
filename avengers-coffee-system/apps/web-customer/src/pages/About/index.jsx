import { uiText as ui, useUiLanguage } from "../../lib/uiText";
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function About({ setActiveTab }) {
  useUiLanguage();
  const { i18n } = useTranslation();
  const currentLng = i18n.resolvedLanguage || 'vi';
  const isEn = currentLng === 'en';

  return (
    <main className="flex-grow w-full bg-white font-sans">
      {/* ── 1. NGUỒN GỐC ── */}
      <section className="w-full relative min-h-[520px] lg:h-[620px] overflow-hidden bg-white flex items-center">
        {/* Background Image on Right */}
        <div className="absolute right-0 top-0 w-full md:w-[65%] lg:w-[60%] h-full">
          <img
            src="/hc-assets/ABOUT-CAREER3.jpg"
            alt={isEn ? 'Origin' : 'Nguồn gốc'}
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
          />
          {/* Gradient overlay to smoothly blend with white text area */}
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent md:w-[60%]"></div>
        </div>

        {/* Content on Left */}
        <div className="relative z-10 mx-auto w-full max-w-[1380px] px-6 sm:px-10 lg:px-16 py-16">
          <div className="max-w-[560px]">
            <h1 className="text-[36px] sm:text-[44px] lg:text-[48px] font-black uppercase text-[#222222] tracking-tight">
              {isEn ? 'ORIGIN' : 'NGUỒN GỐC'}
            </h1>
            <p className="mt-2 text-[15px] sm:text-[17px] font-extrabold uppercase text-[#222222] tracking-wider">
              {isEn ? 'THIS STORY BELONGS TO US' : 'CÂU CHUYỆN NÀY LÀ CỦA CHÚNG MÌNH'}
            </p>
            <p className="mt-4 text-[15px] sm:text-[16px] text-[#444444] leading-relaxed font-normal">
              {isEn
                ? 'Avengers Coffee® was established in 1999, originating from a deep passion for Vietnamese coffee culture and community. From our earliest days, our goal has always been to serve and uplift people, strengthening authentic bonds between individuals.'
                : 'Avengers Coffee® được thành lập vào năm 1999, bắt nguồn từ tình yêu dành cho đất Việt cùng với cà phê và cộng đồng nơi đây. Ngay từ những ngày đầu tiên, mục tiêu của chúng mình là có thể phục vụ và góp phần phát triển cộng đồng bằng cách siết chặt thêm sự kết nối và sự gắn bó giữa người với người.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab?.('order');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-8 px-9 py-3 border-2 border-[#b22830] text-[#b22830] font-bold text-[12px] sm:text-[13px] tracking-widest uppercase hover:bg-[#b22830] hover:text-white transition-all duration-300 rounded-[2px] cursor-pointer shadow-sm active:scale-95"
            >
              {isEn ? 'EXPLORE MORE' : 'XEM CHI TIẾT'}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. DỊCH VỤ ── */}
      <section className="w-full relative min-h-[520px] lg:h-[620px] overflow-hidden bg-[#a87943] flex items-center">
        {/* Background Image on Left */}
        <div className="absolute left-0 top-0 w-full md:w-[65%] lg:w-[60%] h-full">
          <img
            src="/hc-assets/HLC___ngang_social_1920_x_1280_px_1_1.png"
            alt={isEn ? 'Services' : 'Dịch vụ'}
            className="w-full h-full object-cover object-center"
            loading="lazy"
            decoding="async"
          />
          {/* Gradient overlay to smoothly blend with tan/caramel background */}
          <div className="absolute inset-0 bg-gradient-to-l from-[#a87943] via-[#a87943]/85 to-transparent left-auto right-0 md:w-[60%]"></div>
        </div>

        {/* Content on Right */}
        <div className="relative z-10 mx-auto w-full max-w-[1380px] px-6 sm:px-10 lg:px-16 py-16 flex justify-end">
          <div className="max-w-[560px] text-left md:text-right">
            <h2 className="text-[36px] sm:text-[44px] lg:text-[48px] font-black uppercase text-white tracking-tight">
              {isEn ? 'SERVICES' : 'DỊCH VỤ'}
            </h2>
            <p className="mt-2 text-[15px] sm:text-[17px] font-extrabold uppercase text-white tracking-wider">
              {isEn ? 'THIS SERVICE BELONGS TO US' : 'DỊCH VỤ NÀY LÀ CỦA CHÚNG MÌNH'}
            </p>
            <p className="mt-4 text-[15px] sm:text-[16px] text-white/95 leading-relaxed font-normal">
              {isEn
                ? 'Avengers Coffee® is our shared space, designed with your utmost comfort in mind. Please never hesitate to share your wishes with us, so together we can continually make Avengers Coffee® even more wonderful.'
                : 'Avengers Coffee® là không gian của chúng mình nên mọi thứ ở đây đều vì sự thoải mái của chúng mình. Đừng giữ trong lòng, hãy chia sẻ với chúng mình điều bạn mong muốn để cùng nhau giúp Avengers Coffee® trở nên tuyệt vời hơn.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab?.('order');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-8 px-9 py-3 border-2 border-white text-white font-bold text-[12px] sm:text-[13px] tracking-widest uppercase hover:bg-white hover:text-[#a87943] transition-all duration-300 rounded-[2px] cursor-pointer shadow-sm active:scale-95"
            >
              {isEn ? 'EXPLORE MORE' : 'XEM CHI TIẾT'}
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. NGHỀ NGHIỆP ── */}
      <section className="w-full relative min-h-[520px] lg:h-[620px] overflow-hidden bg-[#714a27] flex items-center">
        {/* Background Image on Right */}
        <div className="absolute right-0 top-0 w-full md:w-[65%] lg:w-[60%] h-full">
          <img
            src="/hc-assets/8W1A6722_1.jpg"
            alt={isEn ? 'Careers' : 'Nghề nghiệp'}
            className="w-full h-full object-cover object-center"
            loading="lazy"
            decoding="async"
          />
          {/* Gradient overlay to blend with deep coffee brown background */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#714a27] via-[#714a27]/85 to-transparent md:w-[60%]"></div>
        </div>

        {/* Content on Left */}
        <div className="relative z-10 mx-auto w-full max-w-[1380px] px-6 sm:px-10 lg:px-16 py-16">
          <div className="max-w-[560px]">
            <h2 className="text-[36px] sm:text-[44px] lg:text-[48px] font-black uppercase text-white tracking-tight">
              {isEn ? 'CAREERS' : 'NGHỀ NGHIỆP'}
            </h2>
            <p className="mt-2 text-[15px] sm:text-[17px] font-extrabold uppercase text-white tracking-wider">
              {isEn ? 'THIS OPPORTUNITY BELONGS TO US' : 'CƠ HỘI NÀY LÀ CỦA CHÚNG MÌNH'}
            </p>
            <p className="mt-4 text-[15px] sm:text-[16px] text-white/95 leading-relaxed font-normal">
              {isEn
                ? 'As a community gathering spot, Avengers Coffee® is constantly seeking passionate new members to continually enrich our warm space for everyone. We welcome you to join our family, fostering stronger connections and bonds.'
                : 'Là điểm hội tụ của cộng đồng, Avengers Coffee® luôn tìm kiếm những thành viên mới với mong muốn không ngừng hoàn thiện một không gian dành cho tất cả mọi người. Chúng mình luôn chào đón bạn trở thành một phần của Avengers Coffee® để cùng nhau siết chặt thêm những kết nối và sự gắn bó giữa người với người.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab?.('careers');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-8 px-9 py-3 border-2 border-white text-white font-bold text-[12px] sm:text-[13px] tracking-widest uppercase hover:bg-white hover:text-[#714a27] transition-all duration-300 rounded-[2px] cursor-pointer shadow-sm active:scale-95"
            >
              {isEn ? 'JOIN US NOW' : 'XEM CHI TIẾT'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
