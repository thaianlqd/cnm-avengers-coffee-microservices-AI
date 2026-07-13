import React, { useState } from 'react';
import { navigateTab } from '../../lib/navigate';

export default function LienHePage() {
  const [formData, setFormData] = useState({ hoTen: '', email: '', soDienThoai: '', noiDung: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.hoTen || !formData.email || !formData.soDienThoai || !formData.noiDung) {
      setError('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    setError('');
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col w-full bg-white">
      {/* Breadcrumb */}
      <div className="bg-[#f5f5f5] py-2 px-4 text-[13px] text-gray-500 w-full">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <a href="/" className="hover:text-[#b22830]">Trang chủ</a>
          <span className="mx-1">/</span>
          <span className="text-gray-900">Liên hệ</span>
        </div>
      </div>

      <div className="flex-1 mx-auto w-full max-w-[1380px] px-4 md:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

          {/* Left: Contact Info */}
          <div>
            <h1 className="text-[22px] font-bold text-[#333] leading-tight mb-6">
              Highlands Coffee® Order thuộc CÔNG TY CỔ PHẦN DỊCH VỤ CÀ PHÊ CAO NGUYÊN
            </h1>

            <div className="space-y-4 text-[14px] text-[#333]">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#b22830] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p>Địa chỉ: 125-127 Nguyễn Cơ Thạch, phường An Lợi Đông, Quận 2, TP Hồ Chí Minh. MSDN: 0309965814 do Sở Kế hoạch - Đầu tư Tp.HCM cấp lần đầu ngày 20/04/2010, sửa đổi lần thứ 30 ngày 30/08/2022.</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#b22830] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>Số điện thoại: <strong>19001755</strong></span>
              </div>

              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#b22830] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Email: <a href="mailto:customerservice@highlandscoffee.com.vn" className="text-[#2F80ED] hover:underline">customerservice@highlandscoffee.com.vn</a></span>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-[13px] font-bold text-[#333] uppercase mb-3 tracking-wide">LIÊN HỆ VỚI CHÚNG TÔI</h3>

              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded p-4 text-green-700 text-[14px]">
                  <strong>Cảm ơn bạn đã liên hệ!</strong> Chúng tôi sẽ phản hồi trong vòng 24 giờ làm việc.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Họ tên*"
                    value={formData.hoTen}
                    onChange={(e) => setFormData({ ...formData, hoTen: e.target.value })}
                    className="w-full border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#b22830] transition-colors"
                  />
                  <input
                    type="email"
                    placeholder="Email*"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#b22830] transition-colors"
                  />
                  <input
                    type="tel"
                    placeholder="Số điện thoại*"
                    value={formData.soDienThoai}
                    onChange={(e) => setFormData({ ...formData, soDienThoai: e.target.value })}
                    className="w-full border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#b22830] transition-colors"
                  />
                  <textarea
                    placeholder="Nhập nội dung*"
                    value={formData.noiDung}
                    onChange={(e) => setFormData({ ...formData, noiDung: e.target.value })}
                    rows={5}
                    className="w-full border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#b22830] transition-colors resize-none"
                  />

                  {error && <p className="text-red-500 text-[13px]">{error}</p>}

                  <button
                    type="submit"
                    className="w-full bg-[#b22830] text-white py-3 text-[14px] font-semibold hover:bg-[#8a1e24] transition-colors uppercase tracking-wide"
                  >
                    Gửi tin nhắn
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right: Google Map embed */}
          <div>
            <div className="w-full h-[420px] border border-gray-200 overflow-hidden">
              <iframe
                title="Highlands Coffee Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.0!2d106.7438!3d10.8041!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x317528b84ea8bea9%3A0x21ca8d0b8bef8d01!2s123%20Nguy%E1%BB%85n%20C%C6%A1%20Th%E1%BA%A1ch%2C%20An%20Kh%C3%A1nh%2C%20Th%E1%BB%A7%20%C4%90%E1%BB%A9c%2C%20TP.HCM!5e0!3m2!1svi!2svn!4v1234567890"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="mt-6 bg-gray-50 border border-gray-200 rounded p-4">
              <h4 className="text-[14px] font-bold text-[#333] mb-3">Giờ làm việc</h4>
              <div className="space-y-1 text-[13px] text-gray-600">
                <div className="flex justify-between">
                  <span>Thứ 2 - Thứ 6:</span>
                  <span className="font-semibold">7:00 - 22:00</span>
                </div>
                <div className="flex justify-between">
                  <span>Thứ 7 - Chủ nhật:</span>
                  <span className="font-semibold">7:00 - 23:00</span>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-gray-50 border border-gray-200 rounded p-4">
              <h4 className="text-[14px] font-bold text-[#333] mb-3">Hotline hỗ trợ</h4>
              <a href="tel:19001755" className="text-[22px] font-bold text-[#b22830] hover:opacity-80">
                1900 1755
              </a>
              <p className="text-[12px] text-gray-500 mt-1">Miễn phí, 7:00 - 22:00 mỗi ngày</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
