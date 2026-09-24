import React, { useState } from 'react';
import { EyeIcon, HeartIcon, SparklesIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

export default function CareersPage() {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    console.log("Searching for:", { keyword, department, city });
  };

  return (
    <div className="w-full bg-white pb-20 font-sans">
      {/* 1. HERO BANNER */}
      <section className="w-full">
        <img 
          src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/10/HCO-7587-JOB-CADENA-PORTAL-BANNER-DIGITAL-1-scaled.jpg" 
          alt="Our People Make Us Great" 
          className="w-full h-auto object-cover"
        />
      </section>

      {/* 2. TẦM NHÌN / SỨ MỆNH / GIÁ TRỊ CỐT LÕI */}
      <section className="mx-auto max-w-[1200px] px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Tầm nhìn */}
          <div className="border border-red-200 rounded-3xl p-8 flex flex-col items-start hover:shadow-lg transition-shadow bg-white">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-6 shadow-sm border border-red-100">
              <EyeIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Tầm Nhìn</h3>
            <div className="w-full h-px bg-red-200 mb-6"></div>
            <p className="text-gray-600 leading-relaxed font-medium">
              Trở thành thương hiệu cà phê và trà được yêu thích nhất tại Việt Nam và tự hào chia sẻ với thế giới.
            </p>
          </div>

          {/* Sứ mệnh */}
          <div className="border border-red-200 rounded-3xl p-8 flex flex-col items-start hover:shadow-lg transition-shadow bg-white">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-6 shadow-sm border border-red-100">
              <HeartIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Sứ Mệnh</h3>
            <div className="w-full h-px bg-red-200 mb-6"></div>
            <p className="text-gray-600 leading-relaxed font-medium">
              Sứ mệnh của Highlands Coffee là đạt được ngôi vị quán quân về khẩu vị cà phê Việt Nam và phong cách quán cà phê hiện đại, với giá cả hợp lý, sẵn sàng phục vụ mọi lúc, mọi nơi, mọi khách hàng.
            </p>
          </div>

          {/* Giá trị cốt lõi */}
          <div className="border border-red-200 rounded-3xl p-8 flex flex-col items-start hover:shadow-lg transition-shadow bg-white">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-6 shadow-sm border border-red-100">
              <SparklesIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Giá Trị Cốt Lõi</h3>
            <div className="w-full h-px bg-red-200 mb-6"></div>
            <ul className="text-gray-600 leading-relaxed font-medium space-y-2">
              <li>Quan tâm khách hàng</li>
              <li>Tinh thần đồng đội & hợp tác</li>
              <li>Tôn trọng & liêm chính</li>
              <li>Tự hào Việt & chia sẻ đến cộng đồng</li>
              <li>Đam mê</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. TÌM KIẾM CÔNG VIỆC BAR */}
      <section className="mx-auto max-w-[1200px] px-4 -mt-4 relative z-10">
        <div className="bg-[#b22830] rounded-2xl p-6 md:p-8 shadow-xl">
          <h2 className="text-white text-2xl font-bold mb-6">Tìm kiếm công việc</h2>
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input 
                type="text" 
                placeholder="Công việc..." 
                className="w-full bg-white px-4 py-3.5 rounded-md outline-none text-gray-700"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <select 
                className="w-full bg-white px-4 py-3.5 rounded-md outline-none text-gray-700 border-r-8 border-transparent"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">Departments</option>
                <option value="store">Cửa hàng</option>
                <option value="office">Văn phòng</option>
              </select>
            </div>
            <div className="flex-1">
              <select 
                className="w-full bg-white px-4 py-3.5 rounded-md outline-none text-gray-700 border-r-8 border-transparent"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Cities</option>
                <option value="hcm">Hồ Chí Minh</option>
                <option value="hn">Hà Nội</option>
                <option value="dn">Đà Nẵng</option>
              </select>
            </div>
            <div className="flex-shrink-0 md:w-48">
              <button 
                type="submit" 
                className="w-full bg-[#593922] hover:bg-[#462d1a] transition-colors text-white font-bold py-3.5 px-6 rounded-md uppercase tracking-wider"
              >
                Tìm cơ hội
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* 4. VỀ CHÚNG TÔI (VIDEO) */}
      <section className="w-full bg-[#f4ece3] py-20 mt-12">
        <div className="mx-auto max-w-[1000px] px-4">
          <h2 className="text-center text-4xl font-bold text-gray-800 mb-10">Về Chúng Tôi</h2>
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black">
            <iframe 
              className="absolute top-0 left-0 w-full h-full"
              src="https://www.youtube.com/embed/UtIlpDqqwq0?autoplay=0" 
              title="HIGHLANDS COFFEE® || LÀ CỦA CHÚNG MÌNH" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
            ></iframe>
          </div>
        </div>
      </section>

      {/* 5. HÀNH TRÌNH HẠNH PHÚC */}
      <section className="w-full bg-[#df8048] py-16 text-white text-center mt-16">
        <h2 className="text-3xl md:text-4xl font-bold mb-12">Hành trình hạnh phúc của chúng mình</h2>
        <div className="mx-auto max-w-[1200px] px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="flex flex-col items-center">
            <div className="text-5xl md:text-6xl font-bold mb-4 font-sans tracking-tight">9,000+</div>
            <p className="text-sm md:text-base font-medium px-4">Đồng nghiệp thân yêu</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl md:text-6xl font-bold mb-4 font-sans tracking-tight">7 năm</div>
            <p className="text-sm md:text-base font-medium px-4">Thâm niên trung bình tại Highlands</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl md:text-6xl font-bold mb-4 font-sans tracking-tight">200,000+</div>
            <p className="text-sm md:text-base font-medium px-4">Số ly thức uống phục vụ đến khách hàng mỗi ngày</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl md:text-6xl font-bold mb-4 font-sans tracking-tight">700+</div>
            <p className="text-sm md:text-base font-medium px-4">Số cửa hàng trải dài trên 63 tỉnh thành</p>
          </div>
        </div>
      </section>

      {/* 6. MÔI TRƯỜNG LÀM VIỆC */}
      <section className="mx-auto max-w-[1200px] px-4 py-20">
        <div className="bg-[#f2ead7] rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-10 shadow-sm relative overflow-hidden">
          <div className="flex-1 z-10">
            <h2 className="text-3xl md:text-[38px] font-bold text-gray-900 leading-tight mb-8">
              Môi trường làm việc của sự quan tâm
            </h2>
            <p className="text-gray-800 text-base md:text-[17px] leading-relaxed font-medium mb-4">
              Trong 02 năm vừa qua, Highlands lần đầu tiên đạt chứng nhận toàn cầu <strong>Nơi Làm Việc Tuyệt Vời</strong> và được vinh danh là <strong>Nơi Làm Việc Tốt Nhất Việt Nam.</strong>
            </p>
            <p className="text-gray-800 text-base md:text-[17px] leading-relaxed font-medium">
              Đây là cả một quá trình nỗ lực to lớn của chúng mình trong việc xây dựng một nền văn hóa làm việc hòa nhập, hỗ trợ và văn hóa gắn kết. Tại Highlands, chúng mình được lắng nghe, trao quyền và đối xử như một thành viên trong gia đình. Đây là nơi làm việc lý tưởng mà mình tin bạn đang tìm kiếm.
            </p>
          </div>
          <div className="w-full md:w-[400px] flex-shrink-0 z-10 flex justify-center">
            <img 
              src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/08/VN_2024-National-BW-Badge-Colored.png" 
              alt="Great Place to Work Badge" 
              className="w-[280px] md:w-[320px] object-contain drop-shadow-xl hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>
      </section>

      {/* 7. QUICK LINKS (CUỘC SỐNG / PHÒNG BAN) */}
      <section className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a href="#" className="block group">
            <div className="bg-[#f3d9d9] hover:bg-[#eac4c4] transition-colors rounded-2xl p-10 flex items-center justify-between h-full shadow-sm">
              <div>
                <h3 className="text-[26px] font-bold text-gray-800 mb-2">Cuộc sống tại Highlands</h3>
                <p className="text-gray-700 font-medium">Thú vị, tràn ngập niềm vui & như một gia đình</p>
              </div>
              <div className="w-12 h-12 rounded-full border border-[#b22830] flex items-center justify-center text-[#b22830] group-hover:bg-[#b22830] group-hover:text-white transition-all">
                <ChevronRightIcon className="w-5 h-5" />
              </div>
            </div>
          </a>
          <a href="#" className="block group">
            <div className="bg-[#d7e4db] hover:bg-[#c5d8cb] transition-colors rounded-2xl p-10 flex items-center justify-between h-full shadow-sm">
              <div>
                <h3 className="text-[26px] font-bold text-gray-800 mb-2">Tìm hiểu các phòng ban</h3>
                <p className="text-gray-700 font-medium">Khám phá các vị trí có thể phù hợp với bạn</p>
              </div>
              <div className="w-12 h-12 rounded-full border border-[#b22830] flex items-center justify-center text-[#b22830] group-hover:bg-[#b22830] group-hover:text-white transition-all">
                <ChevronRightIcon className="w-5 h-5" />
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* 8. LATEST NEWS */}
      <section className="mx-auto max-w-[1200px] px-4 py-16">
        <h2 className="text-center text-[28px] md:text-[32px] font-bold text-gray-800 mb-12">
          Những cập nhật mới nhất về Cuộc sống tại Highlands
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow cursor-pointer group bg-white border border-gray-100 flex flex-col h-full">
            <div className="relative aspect-square w-full overflow-hidden bg-black/10">
              <img 
                src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/08/CTY.jpg" 
                alt="Ngày hội việc làm 2025" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white font-bold text-center leading-snug">
                  Nhìn lại hành trình "Ngày hội việc làm" năm 2025
                </h3>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow cursor-pointer group bg-white border border-gray-100 flex flex-col h-full">
            <div className="relative aspect-square w-full overflow-hidden bg-black/10">
              <img 
                src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/08/Tuyen-dung.jpg" 
                alt="Talents Award 2025" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#b22830]/90 to-[#b22830]/10"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white font-bold text-center leading-snug uppercase">
                  Hành trình lan tỏa tinh hoa: Talents Award 2025
                </h3>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow cursor-pointer group bg-white border border-gray-100 flex flex-col h-full">
            <div className="relative aspect-square w-full overflow-hidden bg-[#e6f4e6]">
              <div className="w-full h-full flex items-center justify-center">
                <img 
                  src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/08/leadership-excellence.jpg" 
                  alt="Khám phá món quà" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white font-bold text-center leading-snug uppercase">
                  CÙNG "KHỐI NGHỈ HÈ" HIGHLANDS KHÁM PHÁ MÓN QUÀ HÁO HỨC DỊP QUỐC TẾ THIẾU NHI 2025
                </h3>
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow cursor-pointer group bg-white border border-gray-100 flex flex-col h-full">
            <div className="relative aspect-square w-full overflow-hidden bg-black/10">
              <img 
                src="https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/08/aces-awards.jpg" 
                alt="Havard Business School" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white font-bold text-center leading-snug">
                  Highlands Coffee đón tiếp Đoàn sinh viên từ Havard Business School
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
