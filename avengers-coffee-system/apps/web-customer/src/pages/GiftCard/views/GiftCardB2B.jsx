import React, { useState } from 'react';
import { SupportButtons } from '../components/SupportButtons';
import { B2B_BANNER, CARD_IMAGE } from '../constants';

export const GiftCardB2B = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    quantity: '',
    needs: ''
  });

  const handleChange = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const InputField = ({ label, id, placeholder, required = true, type = "text" }) => (
    <div className="mb-6">
      <label htmlFor={id} className="block text-[14px] font-bold text-[#333] mb-2">
        {label} {required && <span className="text-[#b22830]">*</span>}
      </label>
      <input
        type={type}
        id={id}
        value={formData[id]}
        onChange={handleChange(id)}
        placeholder={placeholder}
        className="w-full px-5 py-3 rounded-full border border-gray-300 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-[14px] transition-all bg-white"
      />
    </div>
  );

  return (
    <div className="bg-white min-h-screen font-sans pb-10">
      
      {/* Banner Section - Limited Width */}
      <div className="max-w-[1280px] mx-auto px-4 mt-6">
        <img 
          src={B2B_BANNER} 
          alt="Mua nhiều giảm đậm" 
          className="w-full h-auto object-cover block" 
        />
      </div>

      {/* Content Section - Same Limited Width */}
      <div className="max-w-[1280px] mx-auto px-4 mt-6">
        <div className="w-full bg-[#fdf9f4] rounded-2xl pt-12 pb-20">
          <div className="max-w-[1024px] mx-auto px-4 text-center">
            {/* Intro */}
            <h2 className="text-[28px] md:text-[32px] font-bold text-[#b22830] mb-3">Thiết kế Thẻ hiện đại, đẹp mắt, sang trọng</h2>
            <p className="text-[13px] md:text-[14px] font-bold text-[#1a1a1a] mb-10 max-w-[800px] mx-auto">
              Avengers Coffee Card với thiết kế tinh tế, sử dụng dễ dàng - là món quà nhỏ bé để bạn trao tay người thương thay vạn lời muốn nói.
            </p>
            
            {/* Card Image */}
            <div className="flex justify-center mb-10">
              <img src={CARD_IMAGE} alt="Avengers Coffee Card" className="w-full max-w-[460px] h-auto object-cover rounded-[16px] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.1)] border-[4px] border-white" />
            </div>

            {/* Form Container */}
            <div className="bg-white rounded-[24px] shadow-[0_4px_25px_-5px_rgba(0,0,0,0.06)] border border-gray-100 p-8 md:p-12 text-left max-w-[840px] mx-auto">
              <h3 className="text-[16px] font-bold text-[#b22830] mb-8">Gửi đến chúng tôi yêu cầu của Quý Doanh Nghiệp</h3>
            
              <form onSubmit={e => e.preventDefault()}>
                <InputField label="Tên Doanh Nghiệp" id="companyName" placeholder="ex: Avengers Coffee" />
                <InputField label="Địa Chỉ" id="address" placeholder="ex: 135/37/50 Nguyễn Hữu Cảnh, Quận Bình Thạnh, TP.HCM" />
                <InputField label="Người Liên Hệ" id="contactPerson" placeholder="ex: Nguyễn Văn A" />
                <InputField label="Số Điện Thoại" id="phone" placeholder="ex: 0912345678" />
                <InputField label="Email" id="email" type="email" placeholder="ex: customerservice@avengers-coffee.vn" />
                <InputField label="Số lượng cần mua" id="quantity" type="number" placeholder="" />
                
                <div className="mb-8">
                  <label htmlFor="needs" className="block text-[14px] font-bold text-[#333] mb-2">
                    Nhu Cầu Doanh Nghiệp <span className="text-[#b22830]">*</span>
                  </label>
                  <textarea
                    id="needs"
                    value={formData.needs}
                    onChange={handleChange('needs')}
                    placeholder="Tôi cần ..."
                    rows="6"
                    className="w-full px-5 py-4 rounded-[20px] border border-gray-300 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-[14px] transition-all bg-white resize-none"
                  ></textarea>
                </div>

                <div className="text-center mt-2">
                  <button type="submit" className="px-12 py-3 bg-[#b22830] text-white font-bold rounded-full text-[15px] hover:bg-[#8c1f24] transition-colors shadow-sm">
                    Gửi yêu cầu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      
      <SupportButtons onNavigate={onNavigate} />
    </div>
  );
};
