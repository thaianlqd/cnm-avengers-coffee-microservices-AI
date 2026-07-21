import React, { useState } from 'react';
import { CARD_IMAGE } from '../constants';

export const GiftCardForm = () => {
  const [selectedAmount, setSelectedAmount] = useState('100000');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [giveMyself, setGiveMyself] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');

  const amounts = [
    { value: '100000', label: '100.000 VNĐ', hasIcon: true },
    { value: '300000', label: '300,000VNĐ' },
    { value: '200000', label: '200,000 VNĐ' },
    { value: '500000', label: '500,000 VNĐ' },
    { value: '1000000', label: '1,000,000 VNĐ' },
  ];

  const ULine = ({ id, label, value, onChange, type = 'text', required, hint }) => (
    <div className="mb-6">
      <div className="flex items-center gap-1 mb-2">
        <label htmlFor={id} className="block text-[14px] text-[#444] font-medium">{label}</label>
        {required && <span className="text-[#b22830] font-black text-[16px]">*</span>}
      </div>
      <input
        id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border-0 border-b border-gray-200 focus:border-[#b22830] outline-none py-2 text-[15px] bg-transparent transition-colors text-[#222]"
      />
      {hint && <p className="text-[11px] text-[#888] mt-2 leading-relaxed">{hint}</p>}
    </div>
  );

  return (
    <section className="bg-transparent py-10 px-6 font-sans">
      <div className="max-w-[1024px] mx-auto bg-[#fbf8f1] rounded-[32px] pt-14 pb-12 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.08)] border border-gray-100">
        
        {/* === Chọn mẫu thẻ - Text === */}
        <div className="px-8 max-w-[840px] mx-auto text-center mb-8">
          <h2 className="text-[28px] font-black text-[#b22830] mb-4">Chọn mẫu thẻ</h2>
          <p className="text-[15px] text-[#333] mb-8 max-w-[600px] mx-auto leading-relaxed">
            <strong>Avengers Coffee Card</strong> với thiết kế tinh tế, sử dụng dễ dàng - là món quà nhỏ bé để bạn trao tay người thương thay vạn lời muốn nói.
          </p>
          
          {/* Card image container */}
          <div className="flex justify-center mb-2">
            <div className="bg-white p-2.5 rounded-[24px] shadow-sm max-w-[800px] w-full mx-auto">
              <img src={CARD_IMAGE} alt="Avengers Coffee Card" className="w-full h-auto object-cover rounded-[18px]" />
            </div>
          </div>
        </div>

        {/* === White card form === */}
        <div className="max-w-[840px] mx-auto bg-white rounded-[24px] shadow-sm overflow-hidden mb-4 border border-gray-50">
          
          {/* Giá trị thẻ */}
          <div className="p-10 border-b border-gray-100">
            <h3 className="text-[18px] font-bold text-[#1a1a1a] mb-2">Giá trị Thẻ Avengers Coffee</h3>
            <p className="text-[14px] text-[#666] mb-6">Vui lòng chọn giá trị Thẻ Avengers Coffee</p>
            <div className="flex flex-wrap gap-4">
              {amounts.map(a => (
                <label key={a.value} className={`flex items-center justify-center gap-1.5 px-6 py-2.5 border rounded-full cursor-pointer text-[14px] transition-all select-none ${
                  selectedAmount === a.value ? 'border-[#1a1a1a] text-[#1a1a1a] shadow-sm font-bold' : 'border-gray-300 text-[#444] hover:border-gray-400 font-medium'
                }`}>
                  <input type="radio" name="amount" value={a.value} checked={selectedAmount === a.value} onChange={() => setSelectedAmount(a.value)} className="hidden" />
                  {a.hasIcon && <span className="text-[#b22830] text-[16px]">🎁</span>}
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          {/* Thông tin người gửi */}
          <div className="px-10 pt-10 pb-4">
            <h3 className="text-[18px] font-bold text-[#1a1a1a] mb-8">Thông tin người gửi</h3>
            <ULine id="sname" label="Tên người gửi" value={senderName} onChange={setSenderName} required />
            <ULine id="semail" label="Email người gửi" value={senderEmail} onChange={setSenderEmail} type="email" required />
            <ULine id="sphone" label="Số điện thoại người gửi" value={senderPhone} onChange={setSenderPhone} type="tel" required
              hint="(*) Vui lòng điền số điện thoại bao gồm 10-11 kí tự chữ số 0-9, bắt đầu bằng kí tự 0, không chứa khoảng cách, chữ cái hoặc kí tự đặc biệt" />
          </div>

          {/* Thông tin người nhận */}
          <div className="px-10 pt-6 pb-4">
            <div className="flex items-center gap-8 mb-10">
              <h3 className="text-[18px] font-bold text-[#1a1a1a]">Thông tin người nhận</h3>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setGiveMyself(!giveMyself)}
                  className={`w-[24px] h-[24px] rounded-[6px] border-2 flex items-center justify-center transition-colors ${giveMyself ? 'bg-[#b22830] border-[#b22830]' : 'border-gray-300 bg-white'}`}>
                  {giveMyself && <svg viewBox="0 0 12 9" fill="none" className="w-3.5 h-3.5"><path d="M1 4l3.5 3.5L11 1" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-[15px] text-[#444] font-medium">Tôi muốn tặng chính mình</span>
              </label>
            </div>
            <ULine id="rname" label="Tên người nhận" value={recipientName} onChange={setRecipientName} required />
            <ULine id="remail" label="Email người nhận" value={recipientEmail} onChange={setRecipientEmail} type="email" />
            <ULine id="rphone" label="Số điện thoại người nhận" value={recipientPhone} onChange={setRecipientPhone} type="tel" required
              hint="(*) Vui lòng điền số điện thoại bao gồm 10-11 kí tự chữ số 0-9, bắt đầu bằng kí tự 0, không chứa khoảng cách, chữ cái hoặc kí tự đặc biệt" />
          </div>

          {/* Lời nhắn */}
          <div className="px-10 pt-4 pb-12">
            <h3 className="text-[16px] font-bold text-[#b22830] mb-4">Lời bạn muốn nhắn nhủ đến người nhận</h3>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, 255))}
              placeholder="Điền nội dung tại đây"
              className="w-full border-0 border-b border-gray-200 focus:border-[#b22830] outline-none py-2 text-[15px] bg-transparent transition-colors text-[#222]"
              maxLength={255}
            />
            <p className="text-[13px] text-[#555] mt-3 font-medium">{255 - message.length} ký tự còn lại</p>
          </div>

          {/* Actions */}
          <div className="px-10 pb-12 flex items-center justify-between">
            <button className="text-[15px] text-[#b22830]/50 font-bold hover:text-[#b22830] transition-colors">Đặt Lại</button>
            <button className="px-14 py-4 bg-[#b22830] text-white font-bold rounded-full text-[16px] hover:bg-[#8c1f24] transition-colors shadow-md">
              Xác Nhận
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
