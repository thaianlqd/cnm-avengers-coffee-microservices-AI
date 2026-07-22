import React, { useState } from 'react';

export const FAQsSection = () => {
  const [openFaq, setOpenFaq] = useState(0);
  const faqs = [
    { q: 'Tôi có thể đăng ký thẻ Avengers Coffee để tặng người thân được không?', a: 'Bạn có thể tặng bất cứ thẻ Avengers Coffee nào cho người thân khi đăng ký qua website avengers-coffee.vn. Hãy nhớ gửi một lời chúc thật dễ thương nhé!' },
    { q: 'Làm thế nào để tôi sử dụng được thẻ đã đăng ký?', a: 'Sau khi nhập thông tin và thanh toán, hệ thống sẽ gửi 1 SMS đến số điện thoại của người nhận gồm 1 mã xác nhận 10 số và đường link. Bạn hãy mang Mã xác nhận ra quầy thanh toán tại bất kỳ cửa hàng Avengers Coffee nào trên toàn quốc.' },
    { q: 'Tôi phải làm gì nếu không nhận được tin nhắn SMS?', a: 'Tin nhắn SMS sẽ được tự động gửi đến số điện thoại của người nhận sau 1-3 phút kể từ thời điểm thanh toán thành công. Trường hợp bạn không nhận được Mã xác nhận sau 5 phút, xin vui lòng liên hệ hotline 19001755 hoặc email customerservice@avengers-coffee.vn.' },
    { q: 'Tôi có thể đổi Thẻ Avengers Coffee lấy tiền mặt được không?', a: 'Không, chúng tôi sẽ không giải quyết hoàn tiền và/hoặc quy đổi số dư trong Thẻ Avengers Coffee thành tiền mặt trong mọi trường hợp.' },
    { q: 'Thời hạn kích hoạt thẻ Avengers Coffee đăng ký qua website là bao lâu?', a: 'Sau khi nhận được Mã xác nhận, bạn sẽ cần kích hoạt Thẻ Avengers Coffee trong vòng tối đa 90 (chín mươi) ngày kể từ ngày nhận được Mã xác nhận.' },
  ];
  const col1 = faqs.slice(0, 3);
  const col2 = faqs.slice(3);

  return (
    <section className="bg-white px-6 py-10">
      <div className="max-w-[1024px] mx-auto border border-gray-100 bg-white shadow-[0_4px_25px_-5px_rgba(0,0,0,0.08)] rounded-2xl px-10 py-12 font-sans">
        <h2 className="text-[32px] font-black text-center text-[#b22830] uppercase mb-10">FAQS</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          {/* Col 1 */}
          <div className="flex flex-col gap-3">
            {col1.map((faq, i) => (
              <div key={i} className={`transition-all duration-300 ${openFaq === i ? 'border border-gray-200 rounded-xl shadow-sm bg-white' : 'border border-transparent'}`}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-start justify-start p-5 text-left gap-4 outline-none group"
                >
                  <span className={`flex-shrink-0 font-bold text-[20px] leading-none mt-0 w-4 transition-colors ${openFaq === i ? 'text-[#1a1a1a]' : 'text-[#1a1a1a] group-hover:text-[#b22830]'}`}>{openFaq === i ? '−' : '+'}</span>
                  <span className={`text-[15px] leading-relaxed transition-all ${openFaq === i ? 'font-bold text-[#1a1a1a]' : 'font-medium text-[#333] group-hover:text-[#b22830]'}`}>
                    {faq.q}
                  </span>
                </button>
                {openFaq === i && (
                  <div className="pb-5 px-5 pl-14 -mt-2">
                    <p className="text-[14px] text-[#555] leading-loose">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Col 2 */}
          <div className="flex flex-col gap-3">
            {col2.map((faq, i) => {
              const idx = 3 + i;
              return (
                <div key={idx} className={`transition-all duration-300 ${openFaq === idx ? 'border border-gray-200 rounded-xl shadow-sm bg-white' : 'border border-transparent'}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-start justify-start p-5 text-left gap-4 outline-none group"
                  >
                    <span className={`flex-shrink-0 font-bold text-[20px] leading-none mt-0 w-4 transition-colors ${openFaq === idx ? 'text-[#1a1a1a]' : 'text-[#1a1a1a] group-hover:text-[#b22830]'}`}>{openFaq === idx ? '−' : '+'}</span>
                    <span className={`text-[15px] leading-relaxed transition-all ${openFaq === idx ? 'font-bold text-[#1a1a1a]' : 'font-medium text-[#333] group-hover:text-[#b22830]'}`}>
                      {faq.q}
                    </span>
                  </button>
                  {openFaq === idx && (
                    <div className="pb-5 px-5 pl-14 -mt-2">
                      <p className="text-[14px] text-[#555] leading-loose">{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
