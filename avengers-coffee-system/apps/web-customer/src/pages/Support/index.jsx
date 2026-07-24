import React, { useState } from 'react';
import { 
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  UserIcon,
  TicketIcon,
  SparklesIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  QuestionMarkCircleIcon,
  BuildingOffice2Icon
} from '@heroicons/react/24/outline';

const FAQ_ITEMS = [
  {
    question: "Làm thế nào để đổi quà hoặc voucher từ điểm thưởng?",
    answer: "Bạn có thể truy cập mục 'Hội Viên' hoặc 'Vòng Quay May Mắn' trong trang cá nhân. Tại đây bạn dùng điểm khả dụng để tích lũy hoặc quay thưởng nhận voucher giảm giá tự động vào kho quà."
  },
  {
    question: "Thời gian giao hàng trung bình của Highlands Coffee là bao lâu?",
    answer: "Thời gian giao hàng tiêu chuẩn từ 15 - 30 phút tùy thuộc vào khoảng cách từ cửa hàng xử lý gần nhất đến địa chỉ của bạn."
  },
  {
    question: "Tôi có thể áp dụng cùng lúc nhiều Voucher cho 1 đơn hàng không?",
    answer: "Mỗi đơn hàng được áp dụng tối đa 1 mã Voucher giảm giá tiền mặt hoặc phần trăm. Tuy nhiên bạn vẫn được tích điểm thành viên bình thường."
  },
  {
    question: "Tôi muốn theo dõi vị trí tài xế đang giao hàng thì làm sao?",
    answer: "Trong mục 'Lịch Sử Đơn Hàng', chọn đơn đang giao và nhấn nút 'Theo dõi vận chuyển' để xem bản đồ trực tuyến và thông tin tài xế."
  },
  {
    question: "Làm thế nào để phản hồi dịch vụ tại cửa hàng chi nhánh?",
    answer: "Bạn vào mục 'Cửa hàng', chọn chi nhánh bạn vừa trải nghiệm và nhấn 'Viết đánh giá chi nhánh' để gửi ý kiến trực tiếp tới ban quản lý."
  }
];

export default function Support() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  const filteredFaqs = FAQ_ITEMS.filter(item => 
    !searchQuery || 
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="flex-grow w-full bg-[#fcfbf9] font-sans min-h-screen pb-20">
      {/* ── 1. HERO SECTION ── */}
      <section className="relative w-full bg-gradient-to-b from-[#80071c] via-[#b22830] to-[#600312] py-20 px-4 flex flex-col items-center justify-center text-center overflow-hidden">
        {/* Subtle background glow circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-200 border border-white/20 text-xs font-bold uppercase tracking-widest backdrop-blur-xs mb-4">
            <QuestionMarkCircleIcon className="w-4 h-4 text-amber-300" /> Trung Tâm Trợ Giúp Khách Hàng
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight font-sans">
            Chúng tôi có thể giúp gì cho bạn?
          </h1>
          <p className="mt-3 text-sm md:text-base text-red-100 font-medium max-w-xl mx-auto">
            Tìm kiếm câu trả lời nhanh chóng cho các thắc mắc về đơn hàng, tài khoản, thực đơn và chương trình ưu đãi.
          </p>
          
          {/* Search Bar */}
          <div className="mt-8 relative w-full max-w-2xl mx-auto">
            <div className="relative flex items-center bg-white rounded-2xl shadow-2xl p-1.5 border border-white/30 focus-within:ring-4 focus-within:ring-amber-400/30 transition-all">
              <MagnifyingGlassIcon className="h-6 w-6 text-gray-400 ml-4 shrink-0" />
              <input
                type="text"
                className="w-full pl-3 pr-4 py-3 bg-transparent outline-none text-gray-800 text-sm font-semibold placeholder:text-gray-400"
                placeholder="Nhập từ khóa tìm kiếm (Ví dụ: Voucher, Đổi điểm, Giao hàng...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl mr-1 cursor-pointer"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. CATEGORIES BLOCKS ── */}
      <section className="w-full max-w-[1240px] mx-auto px-4 md:px-6 -mt-10 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-start justify-between group">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-[#b22830] flex items-center justify-center border border-red-100 mb-4 group-hover:bg-[#b22830] group-hover:text-white transition-colors">
              <ShoppingBagIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">Đặt Hàng & Giao Hàng</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">Hướng dẫn tạo đơn, theo dõi shipper & phí vận chuyển.</p>
            </div>
            <span className="mt-4 text-xs font-bold text-[#b22830] flex items-center gap-1 group-hover:underline">
              Tìm hiểu ngay &rarr;
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-start justify-between group">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/80 mb-4 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <SparklesIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">Thực Đơn & Dinh Dưỡng</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">Thông tin chi tiết về món ăn, topping & lượng đường đá.</p>
            </div>
            <span className="mt-4 text-xs font-bold text-amber-700 flex items-center gap-1 group-hover:underline">
              Tìm hiểu ngay &rarr;
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-start justify-between group">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/80 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">Tài Khoản & Hội Viên</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">Quản lý tài khoản, mật khẩu & quyền lợi xét hạng.</p>
            </div>
            <span className="mt-4 text-xs font-bold text-blue-700 flex items-center gap-1 group-hover:underline">
              Tìm hiểu ngay &rarr;
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col items-start justify-between group">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/80 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <TicketIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wide">Voucher & Khuyến Mãi</h3>
              <p className="text-xs text-gray-500 font-medium mt-1">Cách áp dụng mã giảm giá & quy đổi điểm thưởng.</p>
            </div>
            <span className="mt-4 text-xs font-bold text-emerald-700 flex items-center gap-1 group-hover:underline">
              Tìm hiểu ngay &rarr;
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. FAQ ACCORDION SECTION ── */}
      <section className="w-full max-w-[1240px] mx-auto px-4 md:px-6 mt-14">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase text-gray-900 tracking-tight font-sans">
              Câu hỏi thường gặp (FAQ)
            </h2>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">Các câu hỏi phổ biến được giải đáp chi tiết</p>
          </div>
          <span className="text-xs font-bold text-[#b22830] bg-red-50 px-3 py-1 rounded-full border border-red-100">
            {filteredFaqs.length} câu hỏi
          </span>
        </div>

        <div className="space-y-3">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div 
                key={idx} 
                className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-2xs transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full px-6 py-4.5 text-left flex items-center justify-between gap-4 font-bold text-sm text-gray-900 hover:bg-gray-50/80 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-red-50 text-[#b22830] text-xs font-black flex items-center justify-center shrink-0 border border-red-100">
                      ?
                    </span>
                    {faq.question}
                  </span>
                  <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-[#b22830]' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 pt-1 text-xs md:text-sm font-medium text-gray-600 border-t border-gray-100 bg-gray-50/50 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. CONTACT CHANNELS CARD ── */}
      <section className="w-full max-w-[1240px] mx-auto px-4 md:px-6 mt-14">
        <div className="rounded-3xl border border-gray-200/80 bg-white p-8 shadow-2xs grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#b22830] bg-red-50 px-2.5 py-1 rounded-md border border-red-100">
              Kênh liên hệ trực tiếp
            </span>
            <h3 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-wide font-sans">
              Bạn vẫn cần thêm sự trợ giúp?
            </h3>
            <p className="text-xs md:text-sm text-gray-500 font-medium leading-relaxed">
              Đội ngũ Chăm Sóc Khách Hàng của Highlands Coffee luôn sẵn sàng lắng nghe và hỗ trợ bạn giải quyết mọi thắc mắc 24/7.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-[#b22830] flex items-center justify-center shrink-0 border border-red-100">
                  <PhoneIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-extrabold uppercase">Hotline tổng đài</p>
                  <p className="text-sm font-black text-gray-900">1900 1755</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/80">
                  <EnvelopeIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-extrabold uppercase">Email chăm sóc</p>
                  <p className="text-xs font-black text-gray-900 truncate">customerservice@highlands.vn</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-center items-center text-center p-6 bg-gradient-to-br from-red-50/60 via-white to-amber-50/40 rounded-2xl border border-red-100/60 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#b22830] text-white flex items-center justify-center shadow-md">
              <ChatBubbleLeftRightIcon className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-black uppercase text-gray-900">Trò chuyện trực tuyến</h4>
              <p className="text-xs text-gray-500 font-medium mt-1">Trò chuyện ngay với Trợ lý AI hoặc Nhân viên tư vấn</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const btn = document.querySelector('[data-chat-toggle-button]');
                if (btn) btn.click();
              }}
              className="w-full rounded-xl bg-[#b22830] hover:bg-[#8f1d24] text-white py-3 px-6 text-xs font-bold uppercase tracking-wider shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
            >
              Mở Khung Chat Trực Tuyến
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
