import { useTranslation } from 'react-i18next';

export default function Footer({ onTabChange }) {
  const { t } = useTranslation();
  return (
    <footer className="bg-[#b22830] py-12 text-white w-full">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          
          <div className="flex flex-col gap-4 items-center md:items-start">
            <img src="/hc-assets/logo.png" alt="Highlands Coffee" className="w-[120px] h-auto object-contain brightness-0 invert" />
          </div>
          
          <div className="flex flex-col gap-4">
            <h3 className="text-[16px] font-bold uppercase mb-2">{t('footer.about')}</h3>
            <ul className="space-y-3 text-[14px]">
              <li>
                <button 
                  onClick={() => { onTabChange?.('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-red-200 transition-colors text-left"
                >
                  {t('footer.menu')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { onTabChange?.('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-red-200 transition-colors text-left"
                >
                  {t('footer.promotions')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { onTabChange?.('careers'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-red-200 transition-colors text-left"
                >
                  {t('header.careers')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => { onTabChange?.('contact'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-red-200 transition-colors text-left"
                >
                  {t('header.support')}
                </button>
              </li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-4">
            <h3 className="text-[16px] font-bold uppercase mb-2">{t('footer.stores')}</h3>
            <ul className="space-y-3 text-[14px]">
              <li>
                <button 
                  onClick={() => { onTabChange?.('stores'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-red-200 transition-colors text-left"
                >
                  {t('header.findStore')}
                </button>
              </li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-4">
            <h3 className="text-[16px] font-bold uppercase mb-2">{t('home.news')}</h3>
          </div>
          
          <div className="flex flex-col gap-4">
            <h3 className="text-[16px] font-bold uppercase mb-2">Socials</h3>
            <div className="flex gap-4">
              <a href="#" className="hover:text-red-200 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>
              </a>
              <a href="#" className="hover:text-red-200 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="#" className="hover:text-red-200 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>
          
        </div>
        
        <div className="mt-12 text-center md:text-left text-[13px] text-gray-200">
          <p>{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}