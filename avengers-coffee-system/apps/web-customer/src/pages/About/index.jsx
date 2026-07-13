import React from 'react';

export default function About() {
  return (
    <main className="flex-grow w-full bg-white">
      {/* ── 1. NGUỒN GỐC ── */}
      <section className="w-full relative h-[600px] overflow-hidden">
        <img 
          src="/hc-assets/ABOUT-CAREER3.jpg" 
          alt="NGUỒN GỐC" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient overlay on the left for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent w-full md:w-[60%]"></div>
        
        <div className="relative z-10 mx-auto h-full max-w-[1380px] px-4 md:px-6 flex items-center">
          <div className="max-w-[500px]">
            <h2 className="text-[40px] font-bold text-[#4f2c1c] uppercase tracking-wide">
              NGUỒN GỐC
            </h2>
            <p className="mt-2 text-[18px] font-bold text-[#4f2c1c] uppercase">
              CÂU CHUYỆN NÀY LÀ CỦA CHÚNG MÌNH
            </p>
            <p className="mt-4 text-[16px] text-[#4f2c1c] leading-relaxed font-medium">
              Highlands Coffee® được thành lập vào năm 1999, bắt nguồn từ tình yêu dành cho đất Việt cùng với cà phê và cộng đồng nơi đây. Ngay từ những ngày đầu tiên, mục tiêu của chúng mình là có thể phục vụ và góp phần phát triển cộng đồng bằng cách siết chặt thêm sự kết nối và sự gắn bó giữa người với người.
            </p>
            <button className="mt-8 px-10 py-3 border border-[#b22830] text-[#b22830] font-medium tracking-widest uppercase hover:bg-[#b22830] hover:text-white transition-all bg-transparent rounded-[4px]">
              XEM CHI TIẾT
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. DỊCH VỤ ── */}
      <section className="w-full relative h-[600px] overflow-hidden">
        <img 
          src="/hc-assets/HLC___ngang_social_1920_x_1280_px_1_1.png" 
          alt="DỊCH VỤ" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient overlay on the right for text readability */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#a57a44] via-[#a57a44]/90 to-transparent w-full md:w-[60%] left-auto right-0"></div>
        
        <div className="relative z-10 mx-auto h-full max-w-[1380px] px-4 md:px-6 flex items-center justify-end">
          <div className="max-w-[550px] text-right">
            <h2 className="text-[40px] font-bold text-white uppercase tracking-wide">
              DỊCH VỤ
            </h2>
            <p className="mt-2 text-[18px] font-bold text-white uppercase">
              DỊCH VỤ NÀY LÀ CỦA CHÚNG MÌNH
            </p>
            <p className="mt-4 text-[16px] text-white leading-relaxed font-medium">
              Highlands Coffee® là không gian của chúng mình nên mọi thứ ở đây đều vì sự thoải mái của chúng mình. Đừng giữ trong lòng, hãy chia sẻ với chúng mình điều bạn mong muốn để cùng nhau giúp Highlands Coffee® trở nên tuyệt vời hơn.
            </p>
            <button className="mt-8 px-10 py-3 border border-white text-white font-medium tracking-widest uppercase hover:bg-white hover:text-[#a57a44] transition-all bg-transparent rounded-[4px]">
              XEM CHI TIẾT
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. NGHỀ NGHIỆP ── */}
      <section className="w-full relative h-[600px] overflow-hidden">
        <img 
          src="/hc-assets/8W1A6722_1.jpg" 
          alt="NGHỀ NGHIỆP" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient overlay on the left for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#6b4724] via-[#6b4724]/90 to-transparent w-full md:w-[60%]"></div>
        
        <div className="relative z-10 mx-auto h-full max-w-[1380px] px-4 md:px-6 flex items-center">
          <div className="max-w-[550px]">
            <h2 className="text-[40px] font-bold text-white uppercase tracking-wide">
              NGHỀ NGHIỆP
            </h2>
            <p className="mt-2 text-[18px] font-bold text-white uppercase">
              CƠ HỘI NÀY LÀ CỦA CHÚNG MÌNH
            </p>
            <p className="mt-4 text-[16px] text-white/90 leading-relaxed font-medium">
              Là điểm hội tụ của cộng đồng, Highlands Coffee® luôn tìm kiếm những thành viên mới với mong muốn không ngừng hoàn thiện một không gian dành cho tất cả mọi người. Chúng mình luôn chào đón bạn trở thành một phần của Highlands Coffee® để cùng nhau siết chặt thêm những kết nối và sự gắn bó giữa người với người.
            </p>
            <button className="mt-8 px-10 py-3 border border-white text-white font-medium tracking-widest uppercase hover:bg-white hover:text-[#6b4724] transition-all bg-transparent rounded-[4px]">
              XEM CHI TIẾT
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
