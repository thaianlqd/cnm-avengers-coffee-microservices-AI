import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Home({ setActiveTab, HC_IMG, HomeBannerSlider, categories, setSelectedCatId }) {
  const { t } = useTranslation();
  
  return (
    <>
      {/* ── 1. HERO BANNER SLIDER (exact HC banners) ── */}
      <section className="w-full overflow-hidden bg-white">
        <HomeBannerSlider />
      </section>

      {/* Khoảng trắng giữa slider và promo */}
      <div className="w-full h-[50px] bg-white"></div>

      {/* ── 2. APP PROMO — Website_bannerr.png (exact HC layout 50/50) ── */}
      <section className="w-full bg-[#f4f0eb]">
        <div className="flex flex-col md:flex-row w-full">
          {/* Left: App promo image (Website_bannerr.png từ HC) */}
          <div className="flex-1">
            <img
              src={HC_IMG.appPromo}
              alt={t('home.appMember')}
              className="h-full w-full object-cover"
              onError={(e) => { e.currentTarget.style.display='none'; }}
            />
          </div>
          {/* Right: text in cream background */}
          <div className="flex flex-1 flex-col items-center justify-center bg-[#f4f0eb] px-10 py-16 md:py-24 text-center">
            <h2 className="text-[38px] font-bold leading-tight text-[#333333] md:text-[42px] whitespace-pre-line">
              {t('home.appMember')}
            </h2>
            <p className="mt-4 text-base font-medium text-gray-700">
              {t('home.appDesc')}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('order')}
              className="mt-8 rounded-full border border-gray-400 bg-transparent px-10 py-3 text-[14px] font-medium tracking-wide text-[#333333] transition-all hover:bg-gray-100"
            >
              {t('home.downloadApp')}
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. ĐỒNG HÀNH — 3 ảnh thật từ HC (text bên dưới ảnh) ── */}
      <section className="w-full bg-white py-16">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <h2 className="mb-12 text-center text-3xl font-bold font-sans text-[#333333] md:text-[38px]">
            {t('home.companion')}
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { img: HC_IMG.dongHanh1, label: t('home.orderNow'), action: 'order' },
              { img: HC_IMG.dongHanh2, label: t('home.careers'), action: 'stores' },
              { img: HC_IMG.dongHanh3, label: t('home.news'), action: 'news' },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center cursor-pointer group" onClick={() => setActiveTab(item.action)}>
                <div className="overflow-hidden rounded-2xl w-full">
                  <img
                    src={item.img}
                    alt={item.label}
                    className="h-[360px] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80'; }}
                  />
                </div>
                <p className="mt-6 text-center text-[15px] font-black uppercase tracking-wide text-[#333333] group-hover:text-[#c41230] transition-colors">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. NƯỚC NGON / BÁNH NGON — 2 ảnh to với khối nền kem bên dưới ── */}
      <section className="w-full bg-white pb-16">
        <div className="mx-auto w-full max-w-[1600px] px-4 md:px-8 xl:px-12">
          <div className="grid grid-cols-1 gap-6 lg:gap-10 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                const cat = categories?.find(c => c.ten_danh_muc && c.ten_danh_muc.toLowerCase().includes('cà phê'));
                if (cat && setSelectedCatId) setSelectedCatId(cat.ma_danh_muc);
                setActiveTab('order');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group flex flex-col overflow-hidden shadow-sm"
            >
              <div className="overflow-hidden rounded-t-[20px] w-full">
                <img
                  src={HC_IMG.nuocNgon}
                  className="h-[460px] md:h-[550px] lg:h-[650px] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt={t('home.tastyDrinks')}
                  onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80'; }}
                />
              </div>
              <div className="bg-[#b22830] group-hover:bg-[#911f25] transition-colors duration-300 rounded-b-[20px] py-10 w-full flex items-center justify-center">
                 <p className="text-center text-xl font-bold uppercase tracking-wide text-white transition-colors duration-300">{t('home.tastyDrinks')}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                const cat = categories?.find(c => c.ten_danh_muc && c.ten_danh_muc.toLowerCase().includes('trà'));
                if (cat && setSelectedCatId) setSelectedCatId(cat.ma_danh_muc);
                setActiveTab('order');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group flex flex-col overflow-hidden shadow-sm"
            >
              <div className="overflow-hidden rounded-t-[20px] w-full">
                <img
                  src={HC_IMG.banhNgon}
                  className="h-[460px] md:h-[550px] lg:h-[650px] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt={t('home.tastyCakes')}
                  onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?auto=format&fit=crop&w=800&q=80'; }}
                />
              </div>
              <div className="bg-[#b22830] group-hover:bg-[#911f25] transition-colors duration-300 rounded-b-[20px] py-10 w-full flex items-center justify-center">
                 <p className="text-center text-xl font-bold uppercase tracking-wide text-white transition-colors duration-300">{t('home.tastyCakes')}</p>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* ── 6. CỬA HÀNG GẦN BẠN — 50/50 full width layout ── */}
      <section className="w-full bg-white mt-10">
        <div className="flex flex-col md:flex-row w-full">
          {/* Text side */}
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-16 md:py-24 text-center bg-[#f9f4ec]">
            <h2 className="text-[38px] font-bold leading-tight text-[#333333] md:text-[42px] whitespace-pre-line">
              {t('home.storesNearYou')}
            </h2>
            <p className="mt-4 text-[15px] font-medium text-[#555555]">
              {t('home.storesSlogan')}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('stores')}
              className="mt-8 rounded-full border border-gray-400 bg-transparent px-10 py-3 text-[14px] font-medium tracking-wide text-[#333333] transition-all hover:bg-white"
            >
              {t('home.exploreNow')}
            </button>
          </div>
          {/* Image side */}
          <div className="flex-1 overflow-hidden">
            <img
              src={HC_IMG.cuaHang}
              alt="Cửa Hàng Avengers Gần Bạn"
              className="h-[400px] w-full object-cover md:h-full md:min-h-[500px]"
              onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80'; }}
            />
          </div>
        </div>
      </section>
      
      {/* Khoảng trắng trước footer */}
      <div className="w-full h-[50px] bg-white"></div>
    </>
  );
}
