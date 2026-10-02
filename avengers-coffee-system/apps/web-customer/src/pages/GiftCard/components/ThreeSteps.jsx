import React from 'react';
import { STEPS } from '../constants';

export const ThreeSteps = () => (
  <section className="py-14 bg-white text-center">
    <h2 className="text-[28px] font-black text-[#b22830] mb-12 uppercase tracking-wide">3 Bước Xúng Xính Rinh Thẻ</h2>
    <div className="max-w-[800px] mx-auto px-4 flex items-start justify-between relative">
      {/* Dashed lines exactly connecting the dots */}
      <div className="absolute top-[45px] left-[18%] w-[64%] flex pointer-events-none">
        <div className="flex-1 border-t-2 border-dashed border-[#ccc]"></div>
        <div className="flex-1 border-t-2 border-dashed border-[#ccc]"></div>
      </div>
      {STEPS.map((step, i) => (
        <div key={i} className="flex flex-col items-center gap-4 z-10 w-[30%]">
          <div className="bg-white p-1 rounded-full shadow-sm">
            <img src={step.img} alt={`Bước ${i + 1}`} className="w-[86px] h-[86px] object-cover rounded-full" />
          </div>
          <p className="text-[14px] text-[#222] font-medium text-center leading-relaxed">{step.desc}</p>
        </div>
      ))}
    </div>
  </section>
);
