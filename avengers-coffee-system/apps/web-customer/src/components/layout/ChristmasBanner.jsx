import { useEffect, useState } from 'react';
import { uiText as ui, useUiLanguage } from '../../lib/uiText';
import './ChristmasBanner.css';
const HOME_BANNERS = [
  ['/campaigns/highlands-christmas-office.jpg',"Noel tại Avengers Coffee"],
  ['/hc-assets/HCO_7824_1000_STORE_DC_MWB.jpg',"Avengers Coffee — Một ngàn lời cảm ơn"],
  ['/hc-assets/HCO_7820_MATCHA_LAUNCH_DC_MWB_1920X926.jpg',"Avengers Coffee Matcha Latte và Dừa Mây"],
  ['/hc-assets/1_1.jpg',"Không gian cửa hàng Avengers Coffee"],
];
const ORDER_BANNERS = [
  ['/hc-assets/HCO_7825_SUMMERDI_DC_BANNER_1920x926.jpg',"Avengers Coffee PhinDi Matcha Dâu"],
  ['/hc-assets/HCO_7825_AME__SUMMERDI_DC_BANNER_1920x926.jpg',"Avengers Coffee Americano"],
  ['/campaigns/highlands-christmas-party.jpg',"Mùa Noel tại Avengers Coffee"],
  ['/hc-assets/HLC___ngang_social_1920_x_1280_px_1_1.png',"Cùng chia sẻ Avengers Coffee"],
];
export default function ChristmasBanner({ compact = false, onOrder }) {
  useUiLanguage();
  const slides = compact ? ORDER_BANNERS : HOME_BANNERS;
  const [index, setIndex] = useState(0), [failed,setFailed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setIndex(i => (i + 1) % slides.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [slides.length]);
  useEffect(() => setFailed(false),[index]);
  const [src,alt] = slides[index];
  const picture = <img src={failed ? '/campaigns/highlands-christmas-office.jpg' : src} alt={ui(alt)} style={compact && index===3 ? {objectPosition:'center top'} : undefined} decoding="async" fetchPriority={compact ? 'auto' : 'high'} onError={() => setFailed(true)} />;
  return <section className={'christmas-banner image-only'+(compact ? ' compact' : '')} aria-label={ui(compact ? "Banner thực đơn Avengers Coffee" : "Banner trang chủ Avengers Coffee")}>
    {onOrder ? <button type="button" className="campaign-image-button" aria-label={ui('Khám phá thực đơn')} onClick={onOrder}>{picture}</button> : picture}

  </section>;
}
