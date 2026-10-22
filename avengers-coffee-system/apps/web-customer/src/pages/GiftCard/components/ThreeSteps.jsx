import { uiText as ui } from "../../../lib/uiText";
import React from 'react';
import { STEPS } from '../constants';

const StepIcon = ({ type }) => {
  if (type === 'card') {
    return (
      <svg className="w-8 h-8 text-[#b22830]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    );
  }
  if (type === 'payment') {
    return (
      <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V4a2 2 0 114 0v4m-4 0a2 2 0 10-4 0v4m12 0H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2v-9a2 2 0 00-2-2z" />
    </svg>
  );
};

export const ThreeSteps = () => (
  <section className="py-14 bg-gradient-to-b from-stone-50/50 to-white text-center">
    <div className="max-w-[1024px] mx-auto px-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-[#b22830] text-xs font-semibold tracking-wider uppercase mb-3">
        {ui("Quy trình trao gửi")}
      </div>
      <h2 className="text-[26px] md:text-[30px] font-bold text-[#b22830] mb-3 tracking-tight">
        {ui("3 Bước Đơn Giản Trao Gửi Thẻ Quà Tặng")}
      </h2>
      <p className="text-stone-500 text-sm max-w-[600px] mx-auto mb-12">
        {ui("Chỉ với vài thao tác nhanh gọn, món quà ngọt ngào sẽ được chuyển tới tận tay người thương qua Email & SMS.")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className="group relative flex flex-col items-center bg-white rounded-2xl p-6 border border-stone-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
          >
            {/* Step badge */}
            <div className="absolute top-4 right-4 text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 group-hover:bg-[#b22830] group-hover:text-white transition-colors">
              0{step.step || i + 1}
            </div>

            {/* Icon circle */}
            <div className="w-16 h-16 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:border-[#b22830]/30 transition-all shadow-inner">
              <StepIcon type={step.icon} />
            </div>

            <h3 className="text-base font-bold text-stone-900 mb-2">
              {ui(step.title)}
            </h3>
            <p className="text-[13px] text-stone-600 leading-relaxed text-center">
              {ui(step.desc)}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
