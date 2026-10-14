import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon, ChevronDownIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const FAQ = [
  { id: 'points', category: 'member', vi: ['Làm thế nào để đổi quà hoặc voucher từ điểm thưởng?', 'Mở mục Hội viên hoặc Vòng quay may mắn trong trang cá nhân để xem điểm khả dụng và các phần quà. Voucher đã nhận được lưu trong kho ưu đãi của bạn.'], en: ['How can I redeem points for rewards or vouchers?', 'Open Membership or Lucky Wheel from your account to see available points and rewards. Your received vouchers are saved in your offers.'] },
  { id: 'delivery', category: 'order', vi: ['Khi nào đơn hàng của tôi được giao?', 'Mở Tra cứu đơn hàng để xem trạng thái hiện tại và thời gian dự kiến được cung cấp cho đơn của bạn. Thời gian thực tế phụ thuộc cửa hàng và địa chỉ giao hàng.'], en: ['When will my order arrive?', 'Open order tracking to see your current status and the estimate provided for your order. Delivery time depends on the store and delivery address.'] },
  { id: 'voucher', category: 'member', vi: ['Tôi có thể dùng nhiều voucher cho một đơn hàng không?', 'Mỗi đơn hàng áp dụng tối đa một voucher giảm giá. Bạn vẫn được tích điểm thành viên theo điều kiện của chương trình.'], en: ['Can I use multiple vouchers on one order?', 'Each order can apply one discount voucher. Membership points are awarded according to programme conditions.'] },
  { id: 'tracking', category: 'order', vi: ['Làm sao theo dõi tài xế đang giao hàng?', 'Trong Lịch sử đơn hàng, chọn đơn đang giao và mở Theo dõi vận chuyển để xem bản đồ cùng thông tin tài xế khi có dữ liệu.'], en: ['How can I track my delivery driver?', 'In Order history, select your delivery and open tracking to see the map and driver details when available.'] },
  { id: 'feedback', category: 'store', vi: ['Tôi muốn phản hồi về trải nghiệm tại cửa hàng.', 'Mở Cửa hàng, chọn chi nhánh bạn đã ghé và gửi đánh giá. Bạn cũng có thể trò chuyện với nhân viên hỗ trợ.'], en: ['How can I share feedback about a store?', 'Open Stores, select the location you visited and submit a review. You can also chat with our support team.'] },
];
export default function Support({ onNavigate }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'en' ? 'en' : 'vi';
  const copy = (vi, en) => lang === 'en' ? en : vi;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [openId, setOpenId] = useState(null);
  const filtered = FAQ.filter(item => (category === 'all' || item.category === category) && item[lang].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const topics = [['all', copy('Tất cả', 'All questions')], ['order', copy('Đơn hàng & giao hàng', 'Orders & delivery')], ['member', copy('Hội viên & ưu đãi', 'Membership & offers')], ['store', copy('Cửa hàng', 'Stores')]];
  return <div className="support-page">
    <section className="support-hero">
      <div className="support-hero-copy">
        <p className="editorial-eyebrow">AVENGERS COFFEE / {copy('HỖ TRỢ', 'SUPPORT')}</p>
        <h1>{copy('Bạn cần hỗ trợ gì?', 'How can we help?')}</h1>
        <p>{copy('Tìm câu trả lời hoặc trò chuyện với đội ngũ của chúng tôi.', 'Find an answer or talk to our team.')}</p>
        <label className="support-search"><MagnifyingGlassIcon />
          <input type="search" value={search} onChange={e => { setSearch(e.target.value); setOpenId(null); }} placeholder={copy('Tìm về đơn hàng, điểm thưởng, voucher…', 'Search orders, points, vouchers…')} aria-label={copy('Tìm câu hỏi', 'Search questions')} />
        </label>
      </div>
      <img src="/hc-assets/1_1.jpg" alt={copy('Cửa hàng cà phê', 'Coffee shop exterior')} decoding="async" />
    </section>
    <section className="support-body">
      <aside className="support-sidebar">
        <p className="editorial-eyebrow">{copy('CHỦ ĐỀ', 'TOPICS')}</p>
        <nav aria-label={copy('Chủ đề hỗ trợ', 'Support topics')}>{topics.map(([id, label]) => <button key={id} aria-pressed={id === category} onClick={() => { setCategory(id); setOpenId(null); }}>{label}<ArrowRightIcon /></button>)}</nav>
        <div className="support-shortcuts"><h2>{copy('Cần xem đơn của bạn?', 'Looking for your order?')}</h2><p>{copy('Xem trạng thái và hành trình giao hàng tại đây.', 'View order status and delivery progress here.')}</p><button onClick={() => onNavigate?.('tra-cuu-don')}>{copy('Tra cứu đơn hàng', 'Track your order')} →</button></div>
      </aside>
      <div className="support-faq"><h2>{copy('Câu hỏi thường gặp', 'Frequently asked questions')}</h2>
        {filtered.length === 0 && <p className="editorial-empty">{copy('Chưa tìm thấy câu trả lời. Thử từ khóa khác hoặc nhắn cho chúng tôi.', 'No answer found. Try another keyword or chat with us.')}</p>}
        {filtered.map(faq => <div key={faq.id} className="support-question">
          <h3><button aria-expanded={openId === faq.id} aria-controls={`answer-${faq.id}`} onClick={() => setOpenId(openId === faq.id ? null : faq.id)}>{faq[lang][0]}<ChevronDownIcon className={openId === faq.id ? 'expanded' : ''} /></button></h3>
          {openId === faq.id && <p id={`answer-${faq.id}`}>{faq[lang][1]}</p>}
        </div>)}
      </div>
    </section>
    <section className="support-contact"><div><p className="editorial-eyebrow">{copy('CHÚNG TÔI LUÔN LẮNG NGHE', 'WE ARE HERE TO LISTEN')}</p><h2>{copy('Cùng giải đáp chuyện của bạn.', 'Let’s talk it through.')}</h2><p>{copy('Gửi câu hỏi cho trợ lý hoặc nhân viên hỗ trợ ngay trong khung chat.', 'Ask the assistant or our support team in the chat window.')}</p></div><button onClick={() => window.dispatchEvent(new CustomEvent('avengers:open-chat', { detail: { mode: 'STAFF' } }))}>{copy('Trò chuyện với chúng tôi', 'Chat with us')} <ArrowRightIcon /></button></section>
  </div>;
}
