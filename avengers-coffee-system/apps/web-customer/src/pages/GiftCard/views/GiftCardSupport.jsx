import { uiText as ui, useUiLanguage } from "../../../lib/uiText";
import React, { useState } from 'react';

const FAQ_DATA = [
  {
    category: 'purchase',
    categoryName: 'Mua & Gửi Tặng Thẻ',
    items: [
      {
        q: 'Tôi có thể mua thẻ Avengers Coffee để tặng cho người thân/bạn bè được không?',
        a: 'Hoàn toàn được! Bạn chỉ cần chọn mẫu thẻ trong bộ sưu tập, chọn mệnh giá, điền tên và email/số điện thoại người nhận kèm lời chúc riêng. Hệ thống sẽ tự động gửi mã thẻ quà tặng kèm thiệp điện tử đến người nhận ngay sau khi bạn thanh toán thành công.'
      },
      {
        q: 'Tôi có thể mua thẻ cho chính bản thân mình được không?',
        a: 'Được chứ! Bạn chỉ cần tick vào ô "Tôi muốn gửi tặng cho chính mình" trên form đặt thẻ. Hệ thống sẽ tự động điền thông tin của bạn và gửi mã thẻ về email/tài khoản của bạn để bạn nạp vào ví.'
      },
      {
        q: 'Hệ thống hỗ trợ những phương thức thanh toán nào khi mua thẻ?',
        a: 'Bạn có thể thanh toán trực tiếp từ Ví Avengers (nếu đã có số dư), hoặc thanh toán qua cổng VNPAY (hỗ trợ quét mã QR ngân hàng, thẻ ATM nội địa, thẻ quốc tế Visa/MasterCard).'
      },
    ]
  },
  {
    category: 'redeem',
    categoryName: 'Kích Hoạt & Nạp Tiền Vào Ví',
    items: [
      {
        q: 'Người nhận sẽ nhận mã thẻ qua đâu?',
        a: 'Mã thẻ (gồm 16 ký tự phân tách bằng dấu gạch ngang, VD: 5A0D-C226-696D-C820) sẽ được gửi tự động qua Email và tin nhắn SMS của người nhận trong vòng 1-3 phút sau khi giao dịch mua thẻ hoàn tất.'
      },
      {
        q: 'Làm thế nào để nạp thẻ quà tặng vào ví để sử dụng?',
        a: 'Bạn chỉ cần truy cập website hoặc app Avengers Coffee, vào mục Thẻ Quà Tặng hoặc bấm nút "Nạp Thẻ Ngay" ở góc trên, nhập mã thẻ 16 ký tự và bấm Xác nhận. Toàn bộ mệnh giá thẻ sẽ được cộng ngay vào Ví Khách Hàng của bạn.'
      },
      {
        q: 'Thời hạn kích hoạt Thẻ Quà Tặng là bao lâu?',
        a: 'Thẻ quà tặng Avengers Coffee có thời hạn sử dụng lên đến 12 tháng (365 ngày) kể từ ngày mua. Sau khi nạp vào ví, số dư trong ví không bao giờ hết hạn.'
      },
    ]
  },
  {
    category: 'usage',
    categoryName: 'Sử Dụng & Thanh Toán',
    items: [
      {
        q: 'Tôi có thể dùng số dư thẻ để làm gì?',
        a: 'Số dư thẻ sau khi nạp vào ví có thể dùng để đặt món giao tận nơi trên website/app Avengers Coffee, hoặc quét mã QR/đọc số điện thoại để thanh toán tại toàn bộ hơn 50+ chi nhánh Avengers Coffee trên toàn quốc.'
      },
      {
        q: 'Dùng thẻ quà tặng có được tích điểm hội viên và dùng mã giảm giá không?',
        a: 'Có! Khi thanh toán bằng số dư Ví Avengers từ thẻ quà tặng, bạn vẫn được áp dụng mã giảm giá voucher như bình thường và được tích điểm thưởng Avengers Rewards để nâng hạng thành viên.'
      },
      {
        q: 'Tôi có thể đổi thẻ hoặc số dư ví thành tiền mặt được không?',
        a: 'Theo quy định chung của hệ thống, Thẻ Quà Tặng và số dư Ví Avengers không có giá trị quy đổi thành tiền mặt hoặc hoàn lại dưới bất kỳ hình thức nào.'
      },
    ]
  },
  {
    category: 'troubleshoot',
    categoryName: 'Bảo Mật & Xử Lý Sự Cố',
    items: [
      {
        q: 'Tôi phải làm gì nếu người nhận không nhận được mã thẻ sau 5 phút?',
        a: 'Vui lòng kiểm tra kỹ mục Thư rác/Spam trong Email của người nhận. Nếu vẫn chưa thấy, bạn hãy liên hệ ngay hotline 1900 1755 hoặc gửi email đến customerservice@avengers-coffee.vn kèm mã giao dịch để tổng đài viên kiểm tra và gửi lại mã ngay lập tức.'
      },
      {
        q: 'Nếu tôi nhập sai email hoặc số điện thoại người nhận thì có sửa được không?',
        a: 'Nếu mã thẻ chưa được kích hoạt, bạn có thể liên hệ tổng đài CSKH 1900 1755 với thông tin số điện thoại người mua để nhân viên hỗ trợ chuyển hướng mã thẻ sang đúng email/SĐT mới.'
      },
    ]
  }
];

export const GiftCardSupport = ({ onNavigate }) => {
  useUiLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [openItems, setOpenItems] = useState({});

  const toggleItem = (key) => {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredCategories = FAQ_DATA.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !searchTerm.trim() ||
      item.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.a.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="bg-[#fcfaf7] min-h-screen font-sans text-stone-800 pb-24">
      {/* Hero Header */}
      <section className="bg-gradient-to-r from-[#7a141a] via-[#a31f28] to-[#450a0e] text-white py-16 px-4">
        <div className="max-w-[1140px] mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/15 text-amber-200 text-xs font-semibold tracking-wider uppercase mb-4 backdrop-blur-sm">
            {ui("Trung Tâm Trợ Giúp")}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
            {ui("Hỗ Trợ Thẻ Quà Tặng Avengers Coffee")}
          </h1>
          <p className="text-stone-200 text-sm md:text-base max-w-[650px] mx-auto leading-relaxed mb-8 font-light">
            {ui("Giải đáp mọi thắc mắc của bạn về quy trình mua thẻ, kích hoạt, nạp ví và chính sách sử dụng thẻ quà tặng.")}
          </p>

          {/* Search Box */}
          <div className="max-w-[600px] mx-auto relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={ui("Tìm câu hỏi của bạn (VD: cách nạp thẻ, hạn sử dụng,...)")}
              className="w-full px-6 py-4 rounded-full text-stone-900 bg-white shadow-xl focus:ring-4 focus:ring-red-400/30 outline-none text-sm transition-all pr-12"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            ) : (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-lg">🔍</span>
            )}
          </div>
        </div>
      </section>

      {/* Main Container */}
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 -mt-8 relative z-20 space-y-12">

        {/* Contact Channels Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-[#b22830] flex items-center justify-center font-bold text-xl flex-shrink-0">
              📞
            </div>
            <div>
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">{ui("Hotline Hỗ Trợ")}</p>
              <a href="tel:19001755" className="font-extrabold text-stone-900 text-base hover:text-[#b22830] transition-colors">
                1900 1755
              </a>
              <p className="text-[10px] text-stone-500">{ui("8:00 - 22:00 hàng ngày")}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
              ✉️
            </div>
            <div>
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">{ui("Email Chăm Sóc")}</p>
              <a href="mailto:customerservice@avengers-coffee.vn" className="font-bold text-stone-900 text-xs hover:text-[#b22830] transition-colors break-all">
                customerservice@avengers-coffee.vn
              </a>
              <p className="text-[10px] text-stone-500">{ui("Phản hồi trong 2h")}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
              🏪
            </div>
            <div>
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">{ui("Cửa Hàng Quán")}</p>
              <span className="font-extrabold text-stone-900 text-sm">
                50+ Chi Nhánh
              </span>
              <p className="text-[10px] text-stone-500">{ui("Hỗ trợ thanh toán quầy")}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
              💬
            </div>
            <div>
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">{ui("Trợ Lý AI")}</p>
              <span className="font-extrabold text-stone-900 text-sm">
                Chatbot 24/7
              </span>
              <p className="text-[10px] text-stone-500">{ui("Giải đáp tức thì")}</p>
            </div>
          </div>
        </div>

        {/* FAQs List */}
        <div className="space-y-8">
          {filteredCategories.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-stone-200">
              <span className="text-4xl block mb-3">🔍</span>
              <h3 className="font-bold text-stone-900 text-base mb-1">{ui("Không tìm thấy kết quả phù hợp")}</h3>
              <p className="text-xs text-stone-500 mb-4">{ui("Thử tìm kiếm với từ khóa khác hoặc liên hệ hotline 1900 1755 để được hỗ trợ.")}</p>
              <button
                onClick={() => setSearchTerm('')}
                className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-full"
              >
                {ui("Xóa bộ lọc tìm kiếm")}
              </button>
            </div>
          ) : (
            filteredCategories.map((cat, catIdx) => (
              <div key={cat.category} className="bg-white rounded-3xl p-6 md:p-8 border border-stone-200/70 shadow-sm">
                <h2 className="text-lg md:text-xl font-bold text-stone-900 mb-6 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#b22830]"></span>
                  <span>{ui(cat.categoryName)}</span>
                </h2>

                <div className="space-y-3">
                  {cat.items.map((item, itemIdx) => {
                    const key = `${catIdx}-${itemIdx}`;
                    const isOpen = openItems[key];
                    return (
                      <div
                        key={key}
                        className={`rounded-2xl border transition-all ${
                          isOpen ? 'border-red-200 bg-red-50/20' : 'border-stone-100 hover:border-stone-200 bg-stone-50/30'
                        }`}
                      >
                        <button
                          onClick={() => toggleItem(key)}
                          className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 outline-none"
                        >
                          <span className={`text-sm md:text-base font-semibold leading-relaxed ${isOpen ? 'text-[#b22830]' : 'text-stone-800'}`}>
                            {ui(item.q)}
                          </span>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 transition-transform ${
                            isOpen ? 'bg-[#b22830] text-white rotate-180' : 'bg-stone-200 text-stone-600'
                          }`}>
                            ↓
                          </span>
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-5 text-xs md:text-sm text-stone-600 leading-relaxed border-t border-red-100/60 pt-3">
                            {ui(item.a)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom CTA */}
        <div className="bg-white rounded-3xl p-8 border border-stone-200/80 shadow-sm text-center">
          <h3 className="font-bold text-stone-900 text-base md:text-lg mb-2">
            {ui("Bạn cần nạp mã thẻ quà tặng vừa nhận được?")}
          </h3>
          <p className="text-xs text-stone-500 mb-6 max-w-[500px] mx-auto">
            {ui("Truy cập ngay giao diện nạp thẻ để quy đổi mã quà tặng thành số dư ví và thỏa thích thưởng thức cà phê.")}
          </p>
          <button
            onClick={() => onNavigate && onNavigate('home')}
            className="px-8 py-3 bg-[#b22830] hover:bg-[#8c1f24] text-white font-bold rounded-full text-xs md:text-sm transition-all shadow-md"
          >
            {ui("Nạp Thẻ Vào Ví Ngay")}
          </button>
        </div>

      </div>
    </div>
  );
};
