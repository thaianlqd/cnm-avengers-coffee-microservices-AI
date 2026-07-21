import React from 'react';

const IMG_BANNER_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-11/HC_GIFCARD%20WEBSITE%20BANNER-WOMENMONTH-_HOME%202.png.webp?itok=wGL5MGTE";
const IMG_CARD_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-11/HC_GIFCARD%20WEBSITE%20BANNER-WOMENMONTH-_HOME%202.png.webp?itok=wGL5MGTE";
const IMG_CARD_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-10/Th%C3%AAm%20ti%C3%AAu%20%C4%91%E1%BB%81.png.webp?itok=3e32-lxz";
const IMG_BANNER_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-11/HC_GIFCARD%20WEBSITE%20BANNER-WOMENMONTH-_HOME%201.png.webp?itok=UxQAXdTq";
const IMG_CARD_3 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-10/HC_LOYALTY%20CX_MOMO%20CRM_OCTOBER15K_270X151.jpg.webp?itok=_cgUKfdo";

const PromoCard = ({ title, image, desc, buttonText }) => (
  <div className="flex flex-col h-full">
    <h3 className="text-[18px] md:text-[20px] font-bold text-[#1a1a1a] mb-4 text-center px-2 min-h-[56px] flex items-center justify-center">
      {title}
    </h3>
    <div className="border border-gray-100 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] rounded-xl overflow-hidden flex flex-col flex-1 bg-white hover:shadow-md transition-shadow">
      <img src={image} alt={title} className="w-full h-auto object-cover" />
      <div className="p-6 flex flex-col flex-1">
        <p className="text-[14px] text-[#444] leading-relaxed mb-6 flex-1 whitespace-pre-line">
          {desc}
        </p>
        <button className="w-full py-3 bg-[#2b2b2b] text-white font-bold rounded-lg text-[14px] hover:bg-black transition-colors shadow-sm">
          {buttonText}
        </button>
      </div>
    </div>
  </div>
);

export const GiftCardPromos = () => {
  return (
    <div className="bg-white min-h-screen font-sans pb-24">
      <div className="max-w-[1140px] mx-auto px-4 pt-12">
        
        {/* Section 1: Nạp thẻ */}
        <div className="mb-20">
          <h2 className="text-[28px] md:text-[32px] font-bold text-center text-[#b22830] mb-8">
            Khuyến Mãi Nạp Thẻ Avengers
          </h2>
          
          {/* Large Banner */}
          <div className="w-full overflow-hidden mb-12 shadow-sm border border-gray-50">
            <img src={IMG_BANNER_1} alt="Khuyến Mãi Nạp Thẻ" className="w-full h-auto object-cover block" />
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 px-4 md:px-0">
            <PromoCard 
              title="Tặng 5% Khi Nạp Thẻ Avengers Từ 200K"
              image={IMG_CARD_1}
              desc="Avengers bật mí với bạn: Top những món quà ý nghĩa cho người thân yêu, thay lời yêu thương, gắn kết tinh thần.&#10;🎁 Tặng ngay 5% khi nạp thẻ từ 500K"
              buttonText="Xem Thông Tin Khuyến Mãi"
            />
            <PromoCard 
              title="Hướng Dẫn Liên Kết Và Quản Lý Thẻ Avengers"
              image={IMG_CARD_2}
              desc="☕ Quản lý Thẻ và kiểm tra số dư Thẻ Avengers của bạn trên ứng dụng, chỉ với vài thao tác đơn giản. Sử dụng tiện lợi nhanh chóng. Tìm hiểu ngay!"
              buttonText="Xem Thông Tin Chi Tiết"
            />
          </div>
        </div>

        {/* Section 2: App */}
        <div className="mb-10">
          <h2 className="text-[28px] md:text-[32px] font-bold text-center text-[#b22830] mb-8">
            Khuyến Mãi Trên Avengers Coffee App
          </h2>
          
          {/* Large Banner */}
          <div className="w-full overflow-hidden mb-12 shadow-sm border border-gray-50">
            <img src={IMG_BANNER_2} alt="Khuyến Mãi App" className="w-full h-auto object-cover block" />
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 px-4 md:px-0">
            <PromoCard 
              title="Trà Chiều - Avengers App Mua 1 Tặng 1"
              image={IMG_CARD_3}
              desc="🎉 Mua 1 mà được 2, rủ rê ngay bạn thân lên App lên kèo trà chiều, đặt liền tay có nước liền mà không cần xếp hàng order nè!"
              buttonText="Xem Thông Tin Khuyến Mãi"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
