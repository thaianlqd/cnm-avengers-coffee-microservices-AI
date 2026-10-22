import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React, { useState } from 'react';

export const GiftCardB2B = ({ onNavigate }) => {
  useUiLanguage();
  const [formData, setFormData] = useState({
    companyName: '',
    taxId: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    quantity: '50',
    denomination: '100000',
    needs: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.companyName || !formData.contactPerson || !formData.phone || !formData.email) {
      alert(ui("Vui lòng điền đầy đủ các thông tin liên hệ bắt buộc"));
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Hero Banner Section with Real High-Res Photography */}
      <section className="relative overflow-hidden bg-stone-900 text-white min-h-[420px] flex items-center">
        <img
          src="/campaigns/highlands-christmas-office.jpg"
          alt="Avengers Corporate Coffee Gifts"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-35 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/80 to-[#7a141a]/60" />

        <div className="relative z-10 max-w-[1140px] mx-auto px-4 sm:px-6 py-16 w-full">
          <span className="inline-block px-3.5 py-1.5 rounded-full bg-white/15 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-4 backdrop-blur-sm">
            {ui("Avengers Coffee B2B")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight leading-tight max-w-[800px]">
            {ui("Giải Pháp Thẻ Quà Tặng Doanh Nghiệp Đẳng Cấp")}
          </h1>
          <p className="text-stone-300 text-sm md:text-base max-w-[680px] leading-relaxed mb-8 font-light">
            {ui("Gắn kết đội ngũ, tri ân đối tác và nâng tầm thương hiệu doanh nghiệp với Thẻ Quà Tặng Avengers Coffee. Chiết khấu hấp dẫn lên đến 15%, xuất hóa đơn VAT đầy đủ và bảo mật tuyệt đối.")}
          </p>

          <div className="flex flex-wrap gap-4 text-xs md:text-sm">
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>{ui("Chiết khấu lũy tiến tới 15%")}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>{ui("Hóa đơn điện tử VAT hợp lệ")}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>{ui("Tùy biến in logo công ty")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 -mt-10 relative z-20 space-y-12">

        {/* 4 Core Corporate Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-[#b22830] flex items-center justify-center font-bold text-xl mb-4">
              💰
            </div>
            <h3 className="font-bold text-stone-900 text-base mb-1.5">{ui("Chiết Khấu Hấp Dẫn")}</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              {ui("Tối ưu hóa ngân sách quà tặng với mức chiết khấu linh hoạt theo quy mô đơn hàng từ 10 thẻ đến hàng chục nghìn thẻ.")}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl mb-4">
              📑
            </div>
            <h3 className="font-bold text-stone-900 text-base mb-1.5">{ui("Đầy Đủ Hóa Đơn VAT")}</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              {ui("Cung cấp hợp đồng mua bán, biên bản bàn giao và hóa đơn tài chính VAT nhanh chóng, đúng quy chuẩn kế toán.")}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl mb-4">
              🎨
            </div>
            <h3 className="font-bold text-stone-900 text-base mb-1.5">{ui("In Logo Riêng")}</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              {ui("Hỗ trợ in ấn logo công ty hoặc tạo thiệp điện tử mang đậm dấu ấn nhận diện thương hiệu doanh nghiệp bạn.")}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl mb-4">
              🚀
            </div>
            <h3 className="font-bold text-stone-900 text-base mb-1.5">{ui("Bàn Giao Thần Tốc")}</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              {ui("Cung cấp mã thẻ điện tử an toàn qua file mã hóa hoặc giao thẻ vật lý cao cấp tận nơi trên toàn quốc.")}
            </p>
          </div>
        </div>

        {/* Corporate Samples Showcase */}
        <div className="bg-white rounded-3xl p-8 md:p-12 border border-stone-200/70 shadow-sm">
          <div className="text-center max-w-[650px] mx-auto mb-10">
            <span className="text-[#b22830] text-xs font-bold uppercase tracking-widest block mb-2">{ui("Mẫu Thẻ Doanh Nghiệp Ưa Chuộng")}</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight">
              {ui("Thiết Kế Tinh Tế, Sang Trọng Từng Đường Nét")}
            </h2>
            <p className="text-stone-500 text-xs md:text-sm mt-2">
              {ui("Dễ dàng lựa chọn giữa các phong cách thanh lịch, phù hợp làm quà tặng sinh nhật nhân viên, khen thưởng quý hoặc tri ân đối tác VIP.")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-[900px] mx-auto">
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 p-4 shadow-sm hover:shadow-md transition-all">
              <img src="/images/cards/thankyou_2.png" alt="Thank You Trắng" className="w-full h-auto object-cover rounded-xl shadow-xs mb-3" />
              <h4 className="font-bold text-sm text-stone-900 text-center">Thank You Trắng Tinh Tế</h4>
              <p className="text-[11px] text-stone-500 text-center mt-1">Phù hợp tri ân đối tác và khách hàng cao cấp</p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 p-4 shadow-sm hover:shadow-md transition-all">
              <img src="/images/cards/festive_1.png" alt="Festive Đỏ" className="w-full h-auto object-cover rounded-xl shadow-xs mb-3" />
              <h4 className="font-bold text-sm text-stone-900 text-center">Festive Đỏ Mùa Lễ Hội</h4>
              <p className="text-[11px] text-stone-500 text-center mt-1">Lý tưởng cho tiệc Year End Party và Tết</p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 p-4 shadow-sm hover:shadow-md transition-all">
              <img src="/images/cards/thankyou_1.png" alt="Thank You Fan" className="w-full h-auto object-cover rounded-xl shadow-xs mb-3" />
              <h4 className="font-bold text-sm text-stone-900 text-center">Thank You Fan Vintage</h4>
              <p className="text-[11px] text-stone-500 text-center mt-1">Món quà ấm áp khen thưởng nội bộ nhân viên</p>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-3xl p-8 md:p-12 border border-stone-200/70 shadow-md">
          {submitted ? (
            <div className="py-12 text-center max-w-[550px] mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-3xl mx-auto mb-4">
                ✓
              </div>
              <h3 className="text-2xl font-black text-stone-900 mb-3">{ui("Đã Gửi Yêu Cầu Thành Công!")}</h3>
              <p className="text-stone-600 text-sm leading-relaxed mb-6">
                {ui("Cảm ơn Quý Doanh Nghiệp đã quan tâm đến giải pháp Thẻ Quà Tặng Avengers Coffee. Chuyên viên tư vấn doanh nghiệp sẽ liên hệ lại với Quý khách qua số điện thoại {{v0}} hoặc email {{v1}} trong vòng 2 giờ làm việc.", {
                  v0: formData.phone,
                  v1: formData.email
                })}
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="px-8 py-3 bg-[#b22830] text-white font-bold rounded-xl text-xs hover:bg-[#911f26] transition-all"
              >
                {ui("Gửi Thêm Yêu Cầu Khác")}
              </button>
            </div>
          ) : (
            <div className="max-w-[780px] mx-auto">
              <div className="text-center mb-8">
                <span className="text-[#b22830] text-xs font-bold uppercase tracking-widest block mb-2">{ui("Tư Vấn & Báo Giá")}</span>
                <h3 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight">
                  {ui("Gửi Yêu Cầu Nhận Báo Giá Chi Tiết")}
                </h3>
                <p className="text-stone-500 text-xs md:text-sm mt-1">
                  {ui("Vui lòng điền thông tin bên dưới, chuyên viên B2B Avengers Coffee sẽ phản hồi nhanh chóng.")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Tên Doanh Nghiệp")} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.companyName}
                      onChange={handleChange('companyName')}
                      placeholder="VD: Công ty Cổ phần Avengers Việt Nam"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Mã Số Thuế (Nếu có)")}
                    </label>
                    <input
                      type="text"
                      value={formData.taxId}
                      onChange={handleChange('taxId')}
                      placeholder="VD: 0312345678"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    {ui("Địa Chỉ Doanh Nghiệp")}
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={handleChange('address')}
                    placeholder="VD: Tòa nhà Bitexco, Số 2 Hải Triều, Quận 1, TP.HCM"
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Người Liên Hệ")} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contactPerson}
                      onChange={handleChange('contactPerson')}
                      placeholder="VD: Nguyễn Văn A"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Số Điện Thoại")} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={handleChange('phone')}
                      placeholder="VD: 0912345678"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Email Công Ty")} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange('email')}
                      placeholder="VD: b2b@avengers-coffee.vn"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Số Lượng Thẻ Dự Kiến")}
                    </label>
                    <select
                      value={formData.quantity}
                      onChange={handleChange('quantity')}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    >
                      <option value="20-50">20 - 50 thẻ (Chiết khấu 5%)</option>
                      <option value="51-200">51 - 200 thẻ (Chiết khấu 8%)</option>
                      <option value="201-500">201 - 500 thẻ (Chiết khấu 10%)</option>
                      <option value="500+">Trên 500 thẻ (Chiết khấu tới 15%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                      {ui("Mệnh Giá Mong Muốn")}
                    </label>
                    <select
                      value={formData.denomination}
                      onChange={handleChange('denomination')}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                    >
                      <option value="50000">50.000 VNĐ / thẻ</option>
                      <option value="100000">100.000 VNĐ / thẻ</option>
                      <option value="200000">200.000 VNĐ / thẻ</option>
                      <option value="500000">500.000 VNĐ / thẻ</option>
                      <option value="custom">Mệnh giá tùy chỉnh khác</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                    {ui("Ghi Chú Hoặc Yêu Cầu Riêng (In logo, thời gian nhận thẻ,...)")}
                  </label>
                  <textarea
                    rows={3}
                    value={formData.needs}
                    onChange={handleChange('needs')}
                    placeholder={ui("VD: Cần in thêm logo công ty ở mặt sau thẻ, dự kiến bàn giao trước ngày 20/12 để tặng tiệc tất niên...")}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] outline-none text-sm transition-all bg-stone-50/50"
                  />
                </div>

                <div className="pt-2 text-center">
                  <button
                    type="submit"
                    className="w-full md:w-auto px-12 py-4 bg-[#b22830] hover:bg-[#8c1f24] text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  >
                    {ui("Gửi Yêu Cầu Báo Giá Doanh Nghiệp")}
                  </button>
                  <p className="text-[11px] text-stone-400 mt-3">
                    {ui("🔒 Thông tin doanh nghiệp của Quý khách được cam kết bảo mật 100%")}
                  </p>
                </div>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
