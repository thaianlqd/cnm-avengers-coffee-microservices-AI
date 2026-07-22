import React, { useState } from 'react';

export const GiftCardSupport = () => {
  const [open, setOpen] = useState(0);
  const faqs = [
    { q: 'Tôi có thể đăng ký thẻ Avengers Coffee để tặng người thân được không?', a: 'Bạn có thể tặng bất cứ thẻ Avengers Coffee nào cho người thân khi đăng ký qua website card.avengerscoffee.com.vn. Hãy nhớ gửi một lời chúc thật dễ thương nhé!' },
    { q: 'Làm thế nào để tôi sử dụng được thẻ đã đăng ký?', a: 'Sau khi nhập thông tin và thanh toán, hệ thống sẽ gửi 1 SMS đến số điện thoại của người nhận gồm 1 mã xác nhận 10 số và đường link. Bạn hãy mang Mã xác nhận ra quầy thanh toán tại bất kỳ cửa hàng Avengers Coffee nào trên toàn quốc.' },
    { q: 'Mã xác nhận sẽ được gửi về đâu?', a: 'Mã xác nhận sẽ được gửi qua SMS đến số điện thoại người nhận mà bạn đã cung cấp khi đăng ký mua thẻ.' },
    { q: 'Tôi phải làm gì nếu không nhận được tin nhắn SMS?', a: 'Tin nhắn SMS sẽ được tự động gửi sau 1-3 phút. Trường hợp bạn không nhận được sau 5 phút, xin vui lòng liên hệ hotline 19001755 hoặc email customerservice@avengers-coffee.vn.' },
    { q: 'Tôi có thể đổi Thẻ Avengers Coffee lấy tiền mặt được không?', a: 'Không, chúng tôi sẽ không giải quyết hoàn tiền và/hoặc quy đổi số dư trong Thẻ Avengers Coffee thành tiền mặt trong mọi trường hợp.' },
    
    { q: 'Thời hạn kích hoạt thẻ Avengers Coffee đăng ký qua website là bao lâu?', a: 'Sau khi nhận được Mã xác nhận, bạn sẽ cần kích hoạt Thẻ Avengers Coffee trong vòng tối đa 90 (chín mươi) ngày kể từ ngày nhận được.' },
    { q: 'Khi đến quán nhận thẻ, trong thẻ sẽ có tiền tôi đã nạp sẵn không?', a: 'Có, sau khi kích hoạt thẻ thành công, số tiền bạn đã nạp sẽ có sẵn trong thẻ để bạn có thể sử dụng ngay lập tức.' },
    { q: 'Khi thanh toán thành công rồi có được hoàn lại nếu đổi ý hay không?', a: 'Không, các giao dịch nạp tiền mua thẻ sau khi đã thanh toán thành công sẽ không được hoàn lại dưới bất kỳ hình thức nào.' },
    { q: 'Khuyến mãi nạp của website có được cộng dồn với khuyến mãi nạp tại cửa hàng hay không?', a: 'Không, khuyến mãi của website chỉ áp dụng cho giao dịch trên website và không được cộng dồn với các khuyến mãi tại cửa hàng trừ khi có quy định cụ thể.' },
    { q: 'Tôi có thể nạp tiền vào thẻ Avengers hiện tại của tôi được không?', a: 'Có, bạn hoàn toàn có thể nạp thêm tiền vào thẻ Avengers Coffee hiện tại thông qua website này hoặc nạp trực tiếp tại cửa hàng.' },
  ];
  const left = faqs.slice(0, 5);
  const right = faqs.slice(5);

  return (
    <div className="bg-[#fcfafa] min-h-screen pb-20 font-sans">
      {/* Banner */}
      <div className="w-full bg-[#fce5e5]">
        <img 
          src="https://storage.googleapis.com/public-drupal-storage-bucket/styles/_lb_convert_to_webp/cloud-storage/2024-02/Giftcard_webiste%20banner%2022_home%20banner%202%20copy%206.png.webp?itok=jJJ4DJo4" 
          alt="Bạn Hỏi Avengers Trả Lời" 
          className="w-full h-auto max-w-[1280px] mx-auto object-cover" 
        />
      </div>

      <div className="max-w-[1140px] mx-auto px-6 mt-12 mb-20">
        
        {/* FAQs Container */}
        <div className="bg-white shadow-[0_4px_25px_-5px_rgba(0,0,0,0.06)] border border-gray-100 rounded-xl px-12 py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-4">
            {[left, right].map((col, ci) => (
              <div key={ci} className="flex flex-col">
                {col.map((faq, i) => {
                  const idx = ci === 0 ? i : 5 + i;
                  const isOpen = open === idx;
                  return (
                    <div key={idx} className="border-b border-gray-100 last:border-b-0 py-2">
                      <button 
                        onClick={() => setOpen(isOpen ? null : idx)} 
                        className="w-full flex items-start justify-start py-4 text-left gap-4 outline-none group"
                      >
                        <span className={`flex-shrink-0 font-bold text-[20px] leading-none mt-0 w-4 transition-colors ${isOpen ? 'text-[#1a1a1a]' : 'text-[#555] group-hover:text-[#b22830]'}`}>
                          {isOpen ? '−' : '+'}
                        </span>
                        <span className={`text-[15px] leading-relaxed transition-all ${isOpen ? 'font-bold text-[#1a1a1a]' : 'font-medium text-[#444] group-hover:text-[#b22830]'}`}>
                          {faq.q}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="pb-6 pl-8 -mt-1 pr-4">
                          <p className="text-[14px] text-[#444] leading-[1.8]">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="text-center mt-20">
          <h2 className="text-[22px] font-black text-[#1a1a1a] mb-8">Không thể tìm thấy những gì bạn đang tìm kiếm?</h2>
          <a href="mailto:customerservice@avengerscoffee.com.vn"
            className="inline-block px-12 py-3 rounded-full border-[1.5px] border-[#b22830] text-[#b22830] font-bold text-[15px] hover:bg-[#b22830] hover:text-white transition-all shadow-sm">
            Email Cho Chúng Tôi
          </a>
        </div>

      </div>
    </div>
  );
};

