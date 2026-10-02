import React from 'react';

const IMG_CHILL_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%202%408x.png";
const IMG_CHILL_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%203%408x.png";
const IMG_CHILL_3 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/GC%201_1%408x.png";

const IMG_TET = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO-7721-FESTIVE-CARD-2024-02-approved-front.png";

const IMG_FESTIVE_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FESTIVE%20FA_HCO%207721_%20GIFT%20CARD%20THANK%20YOU-01.png";
const IMG_FESTIVE_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FESTIVE%20FA_HCO%207721_%20GIFT%20CARD%20THANK%20YOU-02.png";

const IMG_THANKYOU_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-01.png";
const IMG_THANKYOU_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-02.png";
const IMG_THANKYOU_3 = "https://storage.googleapis.com/public-drupal-storage-bucket/2024-10/HCO%207721%20GIFT%20CARD%20THANK%20YOU%20FA-03.png";

const CollectionSection = ({ title, desc, note, images }) => (
  <div className="mb-16">
    <h3 className="text-[20px] md:text-[22px] font-bold text-[#1a1a1a] mb-2">{title}</h3>
    <p className="text-[14px] text-[#333] mb-1">
      {desc}
    </p>
    {note && (
      <p className="text-[14px] text-[#333] italic mb-6">
        {note}
      </p>
    )}
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {images.map((img, idx) => (
        <div key={idx} className="rounded-[20px] overflow-hidden">
          <img src={img} alt={`${title} ${idx+1}`} className="w-full h-auto object-cover" />
        </div>
      ))}
    </div>
  </div>
);

export const GiftCardCollection = ({ onNavigate }) => {
  return (
    <div className="bg-white min-h-screen font-sans pb-24">
      <div className="max-w-[1024px] mx-auto px-4 pt-12">
        
        {/* 2025 */}
        <h2 className="text-[28px] md:text-[32px] font-bold text-center text-[#b22830] mb-12">
          Bộ Sưu Tập Thẻ 2025
        </h2>

        <CollectionSection 
          title="Chill Hè 2025 Collection"
          desc="Bộ sưu tập Thẻ Chill Hè 2025 với ba màu sắc tươi mát, trẻ trung"
          note="*Thẻ đang phát hành độc quyền trên hệ thống Gift Card trực tuyến*"
          images={[IMG_CHILL_1, IMG_CHILL_2, IMG_CHILL_3]}
        />

        <CollectionSection 
          title="Tết Mã 2025 Collection"
          desc={`Thẻ "Vàng" nhận từ việc tham gia chương trình "TẶNG VẠN THẺ VÀNG, XE BẠC TỶ", đón ngàn lộc may năm mới.`}
          note="*Thẻ đang phát hành giới hạn dịp Tết Ất Tỵ 2025*"
          images={[IMG_TET]}
        />

        {/* 2026 */}
        <h2 className="text-[28px] md:text-[32px] font-bold text-center text-[#b22830] mb-12 mt-20">
          Bộ Sưu Tập Thẻ 2026
        </h2>

        <CollectionSection 
          title="Festive 2026 Collection"
          desc={`Thẻ "Christmas" chuẩn bị phát hành vào mùa đông 2026 với hai màu đỏ và xanh.`}
          note="*Sắp ra mắt trên nền tảng Gift Card trực tuyến*"
          images={[IMG_FESTIVE_1, IMG_FESTIVE_2]}
        />

        <CollectionSection 
          title="Thank You 2026 Collection"
          desc={`Nhân dịp Sinh nhật lần thứ 24, lần đầu tiên Avengers Coffee cho ra mắt Bộ Thẻ Thank You dành tặng đến các Fan thân yêu thay lời "Cảm ơn" vì đã đồng hành cùng Avengers trong suốt thời gian vừa qua.`}
          note="*Sắp ra mắt tri ân khách hàng năm 2026*"
          images={[IMG_THANKYOU_1, IMG_THANKYOU_2, IMG_THANKYOU_3]}
        />

        <div className="text-center mt-16">
          <button 
            onClick={() => onNavigate('home')} 
            className="px-10 py-3 border border-[#b22830] bg-white text-[#b22830] font-bold rounded-full text-[15px] hover:bg-[#fff9f9] transition-colors"
          >
            Mua Thẻ Ngay!
          </button>
        </div>

      </div>
    </div>
  );
};
