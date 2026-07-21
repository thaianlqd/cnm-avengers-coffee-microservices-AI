import React, { useState, useEffect } from 'react';
import { BANNER_SLIDES } from '../constants';

export const BannerSlideshow = () => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent(p => (p + 1) % BANNER_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative w-full overflow-hidden bg-[#fbf8f1]">
      {BANNER_SLIDES.map((src, i) => (
        <div key={i} className={`transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}>
          <img src={src} alt={`Banner ${i + 1}`} className="w-full h-auto max-h-[600px] object-cover object-center block" />
        </div>
      ))}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2.5 z-10">
        {BANNER_SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === current ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'}`} />
        ))}
      </div>
    </div>
  );
};
