import React from 'react';

const IMG_ABOUT_1 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2025-01/HCO%207771%20TET%20GIFTCARD%20WEBISTE%20BANNER_About%201.png.webp?itok=1fwmtcsD";
const IMG_ABOUT_2 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2025-01/HCO%207771%20TET%20GIFTCARD%20WEBISTE%20BANNER_About%202.png.webp?itok=aH_TlqAF";
const IMG_ABOUT_3 = "https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2025-01/HCO%207771%20TET%20GIFTCARD%20WEBISTE%20BANNER_About%203.png.webp?itok=606w-i-g";

export const GiftCardAbout = ({ onNavigate }) => (
  <div className="bg-white min-h-screen font-sans">
    <div className="max-w-[1140px] mx-auto px-4 py-16">
      
      {/* Section 1 */}
      <div className="mb-16">
        <h2 className="text-[26px] md:text-[30px] font-bold text-center text-[#1a1a1a] mb-8">
          Thẻ Avengers Coffee Là Gì?
        </h2>
        <div className="w-full">
          <img src={IMG_ABOUT_1} alt="Thẻ Avengers Coffee Là Gì?" className="w-full h-auto object-cover block" />
        </div>
      </div>

      {/* Section 2 */}
      <div className="mb-16">
        <h2 className="text-[26px] md:text-[30px] font-bold text-center text-[#1a1a1a] mb-8">
          Bí Kíp Xài Thẻ Avengers Coffee
        </h2>
        <div className="w-full">
          <img src={IMG_ABOUT_2} alt="Bí Kíp Xài Thẻ Avengers Coffee" className="w-full h-auto object-cover block" />
        </div>
      </div>

      {/* Section 3 */}
      <div className="mb-16">
        <h2 className="text-[26px] md:text-[30px] font-bold text-center text-[#1a1a1a] mb-8">
          Lợi Ích Khi Sử Dụng Thẻ Avengers Coffee
        </h2>
        <div className="w-full">
          <img src={IMG_ABOUT_3} alt="Lợi Ích Khi Sử Dụng Thẻ Avengers Coffee" className="w-full h-auto object-cover block" />
        </div>
      </div>

    </div>
  </div>
);
