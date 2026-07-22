import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiClient } from '../lib/apiClient';

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtTime = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); };
const fmtDate = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN'); };

function getOrCreateAnonId() {
  const k = 'avengers_anon_chat_id';
  let id = sessionStorage.getItem(k);
  if (!id) { id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem(k, id); }
  return id;
}

function buildMsg(overrides) {
  const raw = overrides.noi_dung || '';
  const match = raw.match(/^\[\[reply:([^\]]+)\]\]\n?/);
  let noi_dung = raw, reply_to = overrides.reply_to || null;
  if (match) {
    noi_dung = raw.replace(match[0], '');
    try { const p = JSON.parse(decodeURIComponent(match[1])); reply_to = reply_to || { sender: p.sender, content: p.content }; } catch { /* */ }
  }
  return { id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`, ngay_tao: new Date().toISOString(), ...overrides, noi_dung, reply_to };
}

function encodeReply(reply) {
  if (!reply) return null;
  try { return encodeURIComponent(JSON.stringify({ sender: reply.sender, content: reply.content })); } catch { return null; }
}

function buildContentWithReply(content, reply) {
  const enc = encodeReply(reply);
  return enc ? `[[reply:${enc}]]\n${content}` : content;
}

const ORDER_STATUS = {
  CHO_XAC_NHAN: { label: 'Chờ xác nhận', color: '#f59e0b' },
  DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#3b82f6' },
  DANG_CHUAN_BI: { label: 'Đang pha chế', color: '#8b5cf6' },
  DANG_GIAO: { label: 'Đang giao', color: '#f97316' },
  HOAN_THANH: { label: 'Hoàn thành', color: '#22c55e' },
  DA_HUY: { label: 'Đã huỷ', color: '#ef4444' },
};

// ─── Intent detection ─────────────────────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();
  if (/(giỏ hàng|cart|checkout|thanh toán ngay)/.test(t)) return 'cart';
  if (/(đơn hàng|đơn của tôi|trạng thái.*đơn|theo dõi.*đơn|giao chưa|shipper|kiểm tra đơn)/.test(t)) return 'orders';
  if (/(cửa hàng|chi nhánh|địa chỉ|gần đây|ở đâu|tìm cửa)/.test(t)) return 'stores';
  if (/(khuyến mãi|voucher|giảm giá|ưu đãi|mã giảm|coupon|deal)/.test(t)) return 'voucher';
  if (/(thanh toán|payment|vnpay|tiền mặt|ví|momo|atm|qr code)/.test(t)) return 'payment';
  if (/(thực đơn|menu|đồ uống|cà phê|latte|cappuccino|cold brew|americano|trà|sữa|đồ ăn|bánh|có gì ngon|món gì|xem menu)/.test(t)) return 'menu';
  if (/(cho tôi|cho mình|đặt|mua|lấy|muốn order|cần order)\s*(\d+\s*)?(ly|cái|phần|suất|cốc)?/.test(t)) return 'order_intent';
  if (/(đặt hàng|order ngay|mua ngay|tôi muốn đặt)/.test(t)) return 'order_intent';
  return 'general';
}

const QUICK_ACTIONS = [
  { id: 'menu', icon: '☕', label: 'Menu', text: 'Cho tôi xem menu đồ uống' },
  { id: 'order', icon: '🛒', label: 'Đặt hàng', text: 'Tôi muốn đặt hàng' },
  { id: 'orders', icon: '📦', label: 'Đơn hàng', text: 'Xem đơn hàng của tôi' },
  { id: 'stores', icon: '📍', label: 'Cửa hàng', text: 'Cửa hàng ở đâu?' },
  { id: 'voucher', icon: '🎁', label: 'Ưu đãi', text: 'Có khuyến mãi gì không?' },
  { id: 'payment', icon: '💳', label: 'Thanh toán', text: 'Thanh toán được những phương thức nào?' },
];

// ─── Rich Card Components ─────────────────────────────────────────────────────
function ProductCard({ p, onAdd }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ display: 'flex', gap: 10, padding: '10px 12px', background: hover ? '#f8f9fa' : '#fff', borderRadius: 12, border: '1px solid #e9ecef', cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {p.hinh_anh_url ? (
        <img src={p.hinh_anh_url} alt={p.ten_san_pham} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid #f1f3f5' }} />
      ) : (
        <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg,#fff3e0,#ffe0b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>☕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#212529', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.ten_san_pham}</p>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', fontWeight: 800, color: '#e8572a' }}>{fmtVND(p.gia_ban)}</p>
        {p.danh_muc && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#868e96', fontWeight: 600 }}>{p.danh_muc}</p>}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(p); }}
        style={{ all: 'unset', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: '#e8572a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center', fontWeight: 900, fontSize: '1.2rem', boxShadow: '0 2px 8px rgba(232,87,42,0.35)', transition: 'transform 0.1s, box-shadow 0.1s' }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.88)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title="Thêm vào giỏ"
      >+</button>
    </div>
  );
}

function OrderCard({ o }) {
  const s = ORDER_STATUS[o.trang_thai_don_hang] || { label: o.trang_thai_don_hang || 'N/A', color: '#868e96' };
  const code = String(o.ma_don_hang || '').slice(-8).toUpperCase();
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e9ecef', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 800, color: '#212529', letterSpacing: '0.3px' }}>#{code}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#868e96' }}>{fmtDate(o.ngay_tao)}</p>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: s.color, background: s.color + '18', padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{s.label}</span>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: '#e8572a' }}>{fmtVND(o.tong_tien)}</p>
        <a href="/?tab=orders" style={{ fontSize: '0.68rem', fontWeight: 800, color: '#e8572a', textDecoration: 'none', padding: '4px 10px', border: '1px solid #e8572a40', borderRadius: 20 }}>Chi tiết →</a>
      </div>
    </div>
  );
}

function StoreCard({ b }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e9ecef', padding: '11px 13px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.1rem' }}>🏪</div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#212529' }}>{b.ten_chi_nhanh}</p>
          <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#868e96', lineHeight: 1.45 }}>{b.dia_chi}</p>
          {b.gio_mo_cua && <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#e8572a', fontWeight: 700 }}>🕐 {b.gio_mo_cua} – {b.gio_dong_cua}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        {b.so_dien_thoai && (
          <a href={`tel:${b.so_dien_thoai}`} style={{ flex: 1, fontSize: '0.7rem', fontWeight: 800, color: '#495057', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: 8, padding: '6px 0', textDecoration: 'none', textAlign: 'center', display: 'block' }}>📞 Gọi ngay</a>
        )}
        {b.map_url && (
          <a href={b.map_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: '#e8572a', borderRadius: 8, padding: '6px 0', textDecoration: 'none', textAlign: 'center', display: 'block' }}>🗺️ Chỉ đường</a>
        )}
      </div>
    </div>
  );
}

function PaymentCard() {
  const methods = [
    { icon: '💳', name: 'VNPAY', desc: 'ATM / Internet Banking / QR Code', color: '#1e40af' },
    { icon: '📲', name: 'MoMo / ZaloPay', desc: 'Thanh toán qua ví điện tử', color: '#a21caf' },
    { icon: '👛', name: 'Ví Avengers', desc: 'Nạp ví nhận hoàn xu tới 10%', color: '#e8572a' },
    { icon: '💵', name: 'Tiền mặt (COD)', desc: 'Thanh toán khi nhận hàng', color: '#16a34a' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {methods.map((m) => (
        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fff', borderRadius: 10, border: '1px solid #e9ecef' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{m.icon}</div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, color: '#212529' }}>{m.name}</p>
            <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: '#868e96' }}>{m.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function VoucherCard({ v }) {
  const val = v.loai_khuyen_mai === 'PERCENT' ? `${v.gia_tri}%` : fmtVND(v.gia_tri);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 11px', background: '#fff', borderRadius: 10, border: '1px solid #ffe0b2', alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#e8572a,#ff8c42)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#fff', textAlign: 'center', lineHeight: 1.2 }}>{val}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, color: '#212529', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.ten_khuyen_mai || v.ma_khuyen_mai}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.66rem', color: '#e8572a', fontWeight: 700, letterSpacing: '0.3px' }}>Mã: {v.ma_khuyen_mai}</p>
        {v.dieu_kien_ap_dung && <p style={{ margin: '2px 0 0', fontSize: '0.63rem', color: '#868e96' }}>{v.dieu_kien_ap_dung}</p>}
      </div>
    </div>
  );
}

// ─── Typing animation ─────────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '2px 0' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#e8572a,#ff6b35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0, boxShadow: '0 2px 8px rgba(232,87,42,0.3)' }}>☕</div>
      <div style={{ background: '#f1f3f5', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
        {[0, 200, 400].map((d) => (
          <div key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#adb5bd', animation: `typingDot 1.2s ${d}ms infinite ease-in-out` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Chat Widget ─────────────────────────────────────────────────────────
export default function ChatWidget({ user, socketUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [chatMode, setChatMode] = useState('AI');
  const [messages, setMessages] = useState([]);
  const [staffMessages, setStaffMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conversation, setConversation] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [orderConfirming, setOrderConfirming] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [greeted, setGreeted] = useState(false);

  // Data cache
  const cache = useRef({ products: [], branches: [], orders: [], vouchers: [], loaded: false });

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const isOpenRef = useRef(false);
  const chatModeRef = useRef('AI');

  const userId = user?.ma_nguoi_dung || null;
  const userName = user?.ho_ten || user?.email || 'Khách';
  const anonId = useRef(getOrCreateAnonId());
  const effectiveUserId = userId || anonId.current;

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);

  const scrollBottom = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60), []);

  const addAIMsg = useCallback((noi_dung, extras = {}) => {
    const msg = buildMsg({ vai_tro_nguoi_gui: 'AI', ten_nguoi_gui: 'Trợ lý AI', noi_dung, ...extras });
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const addUserMsg = useCallback((noi_dung) => {
    const msg = buildMsg({ vai_tro_nguoi_gui: 'CUSTOMER', ten_nguoi_gui: userName, noi_dung });
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, [userName]);

  // Prefetch all data eagerly
  const prefetchData = useCallback(async () => {
    if (cache.current.loaded) return;
    cache.current.loaded = true;
    const uid = userId;
    const safe = (r) => {
      if (!r) return [];
      const d = r?.data || r;
      return Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    };
    await Promise.allSettled([
      apiClient.get('/menu/san-pham').then((r) => { cache.current.products = safe(r).slice(0, 40); }).catch(() => {}),
      apiClient.get('/users/branches/public').then((r) => { cache.current.branches = safe(r); }).catch(() => {}),
      uid ? apiClient.get(`/customers/${uid}/orders?limit=8`).then((r) => { cache.current.orders = safe(r); }).catch(() => {}) : Promise.resolve(),
      apiClient.get('/vouchers?trang_thai=ACTIVE&limit=12').then((r) => { cache.current.vouchers = safe(r); }).catch(() => {}),
    ]);
  }, [userId]);

  // Socket for staff chat
  useEffect(() => {
    if (!effectiveUserId || !socketUrl) return;
    const socket = io(`${socketUrl}/chat`, { transports: ['websocket'], auth: { userId: effectiveUserId, role: 'CUSTOMER' } });
    socket.emit('chat:subscribe', { userId: effectiveUserId, role: 'CUSTOMER' });
    socket.on('chat:message:new', (msg) => {
      const m = buildMsg(msg);
      setStaffMessages((prev) => prev.some((x) => String(x.id) === String(m.id)) ? prev : [...prev, m]);
      if (m.vai_tro_nguoi_gui !== 'CUSTOMER' && (!isOpenRef.current || chatModeRef.current !== 'STAFF')) {
        setUnread((n) => n + 1);
      }
      scrollBottom();
    });
    socket.on('chat:conversation:update', (c) => { if (c.ma_khach_hang === effectiveUserId) setConversation(c); });
    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [socketUrl, effectiveUserId, scrollBottom]);

  // Open staff chat
  const openStaffChat = useCallback(async () => {
    if (conversation) { scrollBottom(); return; }
    setLoading(true);
    try {
      const res = await apiClient.post('/chat/conversations/open', { customer_user_id: effectiveUserId, customer_name: userName });
      const conv = res?.data?.conversation || res?.conversation;
      if (conv) {
        setConversation(conv);
        if (socketRef.current) socketRef.current.emit('chat:conversation:join', { conversationId: conv.ma_hoi_thoai });
        const msgsRes = await apiClient.get(`/chat/conversations/${conv.ma_hoi_thoai}/messages?user_id=${effectiveUserId}&role=CUSTOMER`);
        const items = msgsRes?.data?.items || [];
        setStaffMessages(items.map((m) => buildMsg(m)));
        scrollBottom();
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [conversation, effectiveUserId, userName, scrollBottom]);

  // Open chat window
  const openChat = useCallback((mode = 'AI') => {
    setChatMode(mode);
    setIsOpen(true);
    setUnread(0);
    if (mode === 'AI') {
      prefetchData();
      if (!greeted) {
        setGreeted(true);
        const name = user?.ho_ten ? ` ${user.ho_ten.split(' ').slice(-1)[0]}` : '';
        addAIMsg(
          `Xin chào${name}! 👋 Mình là **Avengers AI** — trợ lý thông minh của Avengers Coffee.\n\nMình có thể giúp bạn:`,
          { _quickReplies: QUICK_ACTIONS.slice(0, 5) }
        );
      }
    } else {
      openStaffChat();
    }
  }, [prefetchData, greeted, user, addAIMsg, openStaffChat]);

  // Add to cart
  const addToCart = useCallback(async (product) => {
    if (!userId) {
      addAIMsg('Bạn cần đăng nhập để thêm vào giỏ hàng nhé! [Đăng nhập ngay](/login)', { _quickReplies: [{ id: 'login', icon: '🔑', label: 'Đăng nhập', text: 'Tôi muốn đăng nhập' }] });
      return;
    }
    try {
      await apiClient.post('/cart', { ma_nguoi_dung: userId, ma_san_pham: product.id || product.ma_san_pham, ten_san_pham: product.ten_san_pham, gia_ban: product.gia_ban, hinh_anh_url: product.hinh_anh_url, size: 'Nhỏ', so_luong: 1 });
      addAIMsg(`✅ Đã thêm **${product.ten_san_pham}** vào giỏ! Giá: ${fmtVND(product.gia_ban)}`, {
        _quickReplies: [
          { id: 'more', icon: '➕', label: 'Thêm món', text: 'Cho tôi xem thêm menu' },
          { id: 'cart', icon: '🛒', label: 'Vào giỏ hàng', text: 'Tôi muốn xem giỏ hàng' },
          { id: 'checkout', icon: '💳', label: 'Thanh toán', text: 'Tôi muốn thanh toán ngay' },
        ],
      });
    } catch {
      addAIMsg('😢 Không thể thêm vào giỏ. Vui lòng thử lại!');
    }
    scrollBottom();
  }, [userId, addAIMsg, scrollBottom]);

  // Process AI intent
  const processIntent = useCallback(async (text) => {
    const intent = detectIntent(text);

    if (intent === 'cart') {
      addAIMsg('🛒 Đang chuyển bạn đến giỏ hàng...');
      setTimeout(() => { window.location.href = '/cart'; }, 800);
      return;
    }

    if (intent === 'menu' || intent === 'order_intent') {
      await prefetchData();
      const products = cache.current.products;

      let searchTerm = '';
      if (intent === 'order_intent') {
        searchTerm = text.toLowerCase()
          .replace(/cho tôi|cho mình|tôi muốn|đặt|mua|lấy|muốn|cần|order|ngay|\d+\s*(ly|cái|phần|suất|cốc)/g, '')
          .trim();
      }

      const matched = searchTerm
        ? products.filter((p) => p.ten_san_pham?.toLowerCase().includes(searchTerm) || p.mo_ta?.toLowerCase().includes(searchTerm))
        : [];
      const shown = matched.length > 0 ? matched.slice(0, 5) : products.slice(0, 6);

      if (shown.length > 0) {
        const prefix = matched.length > 0
          ? `Tìm thấy **${matched.length}** sản phẩm phù hợp với "${searchTerm}"! Bấm **+** để thêm vào giỏ:`
          : 'Đây là menu nổi bật của Avengers Coffee ☕ Bấm **+** để thêm vào giỏ hàng:';
        addAIMsg(prefix, {
          _products: shown,
          _quickReplies: [
            { id: 'all-menu', icon: '📋', label: 'Xem tất cả menu', text: 'Cho tôi xem tất cả thực đơn' },
            { id: 'stores', icon: '📍', label: 'Cửa hàng', text: 'Cửa hàng ở đâu?' },
          ],
        });
      } else {
        // Try AI API as fallback
        try {
          const r = await apiClient.post('/ai/chat/order-intent', { text, user_id: effectiveUserId });
          const d = r?.data || r;
          if (d?.can_order && d?.items?.length > 0) {
            setPendingOrder({ items: d.items, total: d.estimated_total, message: d.message, paymentMethod: d.payment_method });
            return;
          }
        } catch { /* */ }
        addAIMsg('Mình chưa tìm thấy sản phẩm phù hợp. Bạn muốn xem toàn bộ menu không?', {
          _quickReplies: [{ id: 'full-menu', icon: '📋', label: 'Xem full menu', text: 'Xem menu đồ uống' }],
        });
      }
      return;
    }

    if (intent === 'orders') {
      await prefetchData();
      let orders = cache.current.orders;
      if (!orders.length && userId) {
        try {
          const r = await apiClient.get(`/customers/${userId}/orders?limit=5`);
          orders = (r?.data?.items || r?.items || []);
          cache.current.orders = orders;
        } catch { orders = []; }
      }
      if (orders.length > 0) {
        addAIMsg(`Bạn có **${orders.length}** đơn hàng gần đây. Đây là danh sách:`, {
          _orders: orders.slice(0, 4),
          _quickReplies: [{ id: 'all-orders', icon: '📦', label: 'Xem tất cả đơn', text: 'Xem toàn bộ lịch sử đơn hàng' }],
        });
      } else if (!userId) {
        addAIMsg('Bạn cần đăng nhập để xem đơn hàng nhé!', { _quickReplies: [{ id: 'login', icon: '🔑', label: 'Đăng nhập', text: 'Đăng nhập ngay' }] });
      } else {
        addAIMsg('Bạn chưa có đơn hàng nào. Hãy đặt ngay thôi! ☕', { _quickReplies: [{ id: 'order', icon: '🛒', label: 'Đặt hàng ngay', text: 'Cho tôi xem menu' }] });
      }
      return;
    }

    if (intent === 'stores') {
      await prefetchData();
      let branches = cache.current.branches;
      if (!branches.length) {
        try {
          const r = await apiClient.get('/users/branches/public');
          branches = (r?.data?.items || r?.items || r?.data || []);
          cache.current.branches = branches;
        } catch { branches = []; }
      }
      if (branches.length > 0) {
        addAIMsg(`Avengers Coffee có **${branches.length}** chi nhánh. Đây là một số cửa hàng:`, {
          _stores: branches.slice(0, 3),
          _quickReplies: branches.length > 3 ? [{ id: 'more-stores', icon: '🗺️', label: 'Xem thêm', text: 'Cho tôi xem tất cả cửa hàng' }] : [],
        });
      } else {
        addAIMsg('Hiện tại không tìm thấy thông tin cửa hàng. Bạn có thể gọi hotline **1900 1755** để được hỗ trợ!');
      }
      return;
    }

    if (intent === 'payment') {
      addAIMsg('Avengers Coffee hỗ trợ **4 phương thức thanh toán** linh hoạt:', { _type: 'payment' });
      return;
    }

    if (intent === 'voucher') {
      await prefetchData();
      let vouchers = cache.current.vouchers;
      if (!vouchers.length) {
        try {
          const r = await apiClient.get('/vouchers?trang_thai=ACTIVE&limit=12');
          vouchers = (r?.data?.items || r?.items || r?.data || []);
          cache.current.vouchers = vouchers;
        } catch { vouchers = []; }
      }
      if (vouchers.length > 0) {
        addAIMsg(`🎉 Đang có **${vouchers.length}** ưu đãi cho bạn! Áp dụng khi thanh toán nhé:`, { _vouchers: vouchers.slice(0, 4) });
      } else {
        addAIMsg('Hiện chưa có khuyến mãi nào đang hoạt động. Theo dõi website để không bỏ lỡ deal hot!');
      }
      return;
    }

    // General → call AI API
    try {
      const history = messages.slice(-6).map((m) => `${m.vai_tro_nguoi_gui === 'CUSTOMER' ? userName : 'AI'}: ${m.noi_dung}`).join('\n');
      // Try order intent first
      const r = await apiClient.post('/ai/chat/order-intent', { text, user_id: effectiveUserId, history });
      const d = r?.data || r;
      if (d?.can_order && d?.items?.length > 0) {
        setPendingOrder({ items: d.items, total: d.estimated_total, message: d.message, paymentMethod: d.payment_method });
        return;
      }
      // Normal AI chat
      const chatRes = await apiClient.post('/ai/chat', { user_id: effectiveUserId, user_name: userName, content: text, history });
      const reply = chatRes?.data?.reply || chatRes?.reply;
      if (reply) {
        addAIMsg(reply, { _quickReplies: QUICK_ACTIONS.slice(0, 3) });
        return;
      }
    } catch { /* fallthrough */ }

    // Ultimate fallback
    addAIMsg('Xin lỗi mình chưa hiểu rõ câu hỏi này. Bạn có thể thử hỏi về menu, đơn hàng hoặc cửa hàng nhé!', {
      _quickReplies: QUICK_ACTIONS.slice(0, 4),
    });
  }, [messages, userName, effectiveUserId, userId, prefetchData, addAIMsg, scrollBottom]);

  // Send message handler
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText !== undefined ? String(overrideText) : inputText).trim();
    if (!text || sending) return;
    if (overrideText === undefined) setInputText('');
    setSending(true);

    if (chatMode === 'AI') {
      addUserMsg(text);
      scrollBottom();
      setIsTyping(true);
      await new Promise((res) => setTimeout(res, 700 + Math.random() * 400));
      try {
        await processIntent(text);
      } finally {
        setIsTyping(false);
        setSending(false);
        scrollBottom();
      }
    } else {
      // Staff mode
      if (!conversation) { setSending(false); return; }
      const content = buildContentWithReply(text, replyTo ? { sender: replyTo.sender, content: replyTo.noi_dung?.slice(0, 200) } : null);
      setReplyTo(null);
      try {
        const res = await apiClient.post(`/chat/conversations/${conversation.ma_hoi_thoai}/messages`, {
          sender_user_id: effectiveUserId, sender_name: userName, sender_role: 'CUSTOMER', content,
        });
        if (res?.data?.conversation) setConversation(res.data.conversation);
        if (res?.data?.message) {
          const m = buildMsg(res.data.message);
          setStaffMessages((prev) => prev.some((x) => String(x.id) === String(m.id)) ? prev : [...prev, m]);
          scrollBottom();
        }
      } catch { setInputText(text); }
      finally { setSending(false); }
    }
  }, [inputText, sending, chatMode, conversation, replyTo, effectiveUserId, userName, addUserMsg, scrollBottom, processIntent]);

  // Voice
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Chrome không hỗ trợ giọng nói. Dùng Chrome mới nhất nhé!'); return; }
    const r = new SR();
    r.lang = 'vi-VN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.onresult = (e) => { const t = e.results[0][0].transcript; setIsListening(false); sendMessage(t); };
    r.start();
  }, [sendMessage]);

  // Confirm voice/AI order
  const confirmOrder = useCallback(async () => {
    if (!pendingOrder) return;
    setOrderConfirming(true);
    try {
      const items = pendingOrder.items.filter((i) => i.matched).map((i) => ({ ma_san_pham: i.product_id, ten_san_pham: i.product_name, so_luong: i.quantity, gia_ban: i.price, hinh_anh_url: i.image_url, ghi_chu: [i.size ? `Size ${i.size}` : '', i.note || ''].filter(Boolean).join(', ') }));
      await apiClient.post('/orders', { ma_nguoi_dung: effectiveUserId, phuong_thuc_thanh_toan: pendingOrder.paymentMethod || 'THANH_TOAN_KHI_NHAN_HANG', loai_don_hang: 'DELIVERY', chi_tiet_don_hang: items, ghi_chu: 'Chat Order' });
      addAIMsg(`🎉 Đặt hàng thành công! Tổng: **${fmtVND(pendingOrder.total)}**\nĐơn hàng của bạn đang được chuẩn bị!`, {
        _quickReplies: [{ id: 'orders', icon: '📦', label: 'Xem đơn hàng', text: 'Xem đơn hàng của tôi' }],
      });
      setPendingOrder(null);
      scrollBottom();
    } catch { alert('Không thể đặt hàng. Thử lại nhé!'); }
    finally { setOrderConfirming(false); }
  }, [pendingOrder, effectiveUserId, addAIMsg, scrollBottom]);

  const activeMessages = chatMode === 'AI' ? messages : staffMessages;

  // ─── Render text with basic markdown ───────────────────────────────────────
  const renderText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
    );
  };

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 90, right: 20, zIndex: 1000,
          width: 'min(94vw, 390px)', height: 'min(82vh, 660px)',
          display: 'flex', flexDirection: 'column',
          background: '#fffaf0',
          borderRadius: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          border: '1px solid #f8d7da',
          overflow: 'hidden',
          animation: 'chatOpen 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #c41230 0%, #8a0b1f 100%)',
            padding: '0 16px',
            flexShrink: 0,
          }}>
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#e8572a,#ff8c42)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', boxShadow: '0 2px 10px rgba(232,87,42,0.4)' }}>☕</div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%', background: '#22c55e', border: '2px solid #1a1a2e' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Avengers Coffee AI</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem' }}>
                  {chatMode === 'AI' ? '🟢 Trả lời ngay lập tức' : '🟢 Nhân viên đang trực'}
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ border: 'none', padding: 0, outline: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 14, height: 14 }}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 4, paddingBottom: 14 }}>
              {[{ mode: 'AI', label: '🤖 Trợ lý AI' }, { mode: 'STAFF', label: '👤 Nhân viên' }].map(({ mode, label }) => (
                <button key={mode} onClick={() => { setChatMode(mode); if (mode === 'STAFF') openStaffChat(); }}
                  style={{
                    border: 'none', padding: 0, outline: 'none', cursor: 'pointer', flex: 1, padding: '7px 0', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', transition: 'all 0.2s',
                    background: chatMode === mode ? '#fff' : 'transparent',
                    color: chatMode === mode ? '#c41230' : 'rgba(255,255,255,0.7)',
                    border: chatMode === mode ? '1px solid transparent' : '1px solid transparent',
                  }}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Messages area */}
          <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'transparent' }}>
            {activeMessages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: '0 20px' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#e8572a,#ff8c42)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', boxShadow: '0 4px 20px rgba(232,87,42,0.3)' }}>☕</div>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#343a40', textAlign: 'center' }}>
                  {chatMode === 'AI' ? 'Xin chào! Mình có thể giúp gì cho bạn?' : 'Nhân viên sẽ phản hồi sớm nhất'}
                </p>
                {chatMode === 'AI' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
                    {QUICK_ACTIONS.slice(0, 4).map((a) => (
                      <button key={a.id} onClick={() => sendMessage(a.text)} style={{ border: 'none', outline: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: '#e8572a', background: '#fff', padding: '7px 13px', borderRadius: 20, border: '1.5px solid #e8572a30', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        {a.icon} {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeMessages.map((msg) => {
              const isOwn = msg.vai_tro_nguoi_gui === 'CUSTOMER';
              const isAI = msg.vai_tro_nguoi_gui === 'AI';
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, maxWidth: '84%' }}>
                    {!isOwn && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: isAI ? 'linear-gradient(135deg,#e8572a,#ff6b35)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                        {isAI ? '☕' : '👤'}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      {/* Reply context */}
                      {msg.reply_to && (
                        <div style={{ marginBottom: 4, padding: '5px 10px', background: isOwn ? 'rgba(255,255,255,0.25)' : '#e9ecef', borderRadius: 8, borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.6)' : '#e8572a'}` }}>
                          <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, color: isOwn ? 'rgba(255,255,255,0.9)' : '#e8572a' }}>{msg.reply_to.sender}</p>
                          <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: isOwn ? 'rgba(255,255,255,0.75)' : '#495057', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.reply_to.content}</p>
                        </div>
                      )}

                      {/* Main bubble */}
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isOwn ? '#fff3e0' : '#fff',
                        color: isOwn ? '#495057' : '#212529',
                        fontSize: '0.84rem', lineHeight: 1.5,
                        boxShadow: isOwn ? '0 3px 12px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.07)',
                        border: '1px solid #ffe0b2',
                        wordBreak: 'break-word',
                      }}>
                        {msg.vai_tro_nguoi_gui !== 'CUSTOMER' && (
                          <p style={{ margin: '0 0 4px', fontSize: '0.65rem', fontWeight: 800, color: '#e8572a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {msg.ten_nguoi_gui || (isAI ? 'Trợ lý AI' : 'Nhân viên')}
                          </p>
                        )}
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderText(msg.noi_dung)}</p>

                        {/* Rich content blocks */}
                        {msg._products && msg._products.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {msg._products.map((p, i) => <ProductCard key={i} p={p} onAdd={addToCart} />)}
                          </div>
                        )}
                        {msg._orders && msg._orders.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {msg._orders.map((o, i) => <OrderCard key={i} o={o} />)}
                          </div>
                        )}
                        {msg._stores && msg._stores.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {msg._stores.map((b, i) => <StoreCard key={i} b={b} />)}
                          </div>
                        )}
                        {msg._type === 'payment' && (
                          <div style={{ marginTop: 10 }}><PaymentCard /></div>
                        )}
                        {msg._vouchers && msg._vouchers.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {msg._vouchers.map((v, i) => <VoucherCard key={i} v={v} />)}
                          </div>
                        )}
                      </div>

                      {/* Quick replies */}
                      {msg._quickReplies && msg._quickReplies.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                          {msg._quickReplies.map((r) => (
                            <button key={r.id} onClick={() => sendMessage(r.text)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: '#e8572a', background: '#fff', padding: '6px 13px', borderRadius: 20, border: '1.5px solid #e8572a30', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#fff3f0'; e.currentTarget.style.borderColor = '#e8572a70'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e8572a30'; }}
                            >
                              {r.icon} {r.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Timestamp + reply */}
                      <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: isOwn ? 0 : 2 }}>
                        <span style={{ fontSize: '0.6rem', color: '#adb5bd' }}>{fmtTime(msg.ngay_tao)}</span>
                        {!isOwn && (
                          <button onClick={() => setReplyTo(msg)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', color: '#adb5bd', fontWeight: 600 }}>↩ Trả lời</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && <TypingBubble />}
            <div ref={bottomRef} />
          </div>

          {/* Pending order confirmation */}
          {pendingOrder && (
            <div style={{ margin: '0 12px 8px', background: '#fff', borderRadius: 14, border: '1px solid #e9ecef', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(90deg,#e8572a,#d94b1e)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.9rem' }}>🛒</span>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.76rem' }}>XÁC NHẬN ĐẶT HÀNG</span>
              </div>
              {pendingOrder.message && <p style={{ margin: '8px 14px 4px', fontSize: '0.8rem', fontWeight: 700, color: '#343a40' }}>{pendingOrder.message}</p>}
              <div style={{ padding: '4px 14px 8px' }}>
                {pendingOrder.items.filter((i) => i.matched).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f3f5' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>x{item.quantity} {item.product_name}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#e8572a' }}>{fmtVND(item.subtotal || 0)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>Tổng</span>
                  <span style={{ fontWeight: 900, color: '#e8572a', fontSize: '0.86rem' }}>{fmtVND(pendingOrder.total)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPendingOrder(null)} style={{ all: 'unset', cursor: 'pointer', padding: '6px 16px', borderRadius: 20, background: '#f1f3f5', color: '#495057', fontWeight: 700, fontSize: '0.76rem' }}>Huỷ</button>
                <button onClick={confirmOrder} disabled={orderConfirming} style={{ all: 'unset', cursor: orderConfirming ? 'not-allowed' : 'pointer', padding: '6px 18px', borderRadius: 20, background: 'linear-gradient(90deg,#e8572a,#d94b1e)', color: '#fff', fontWeight: 800, fontSize: '0.76rem', opacity: orderConfirming ? 0.75 : 1 }}>
                  {orderConfirming ? 'Đang đặt...' : '✅ Đặt ngay'}
                </button>
              </div>
            </div>
          )}

          {/* Reply context bar */}
          {replyTo && (
            <div style={{ margin: '0 12px 4px', padding: '6px 12px', background: '#f8f9fa', borderRadius: 10, border: '1px solid #e9ecef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.66rem', color: '#e8572a', fontWeight: 800 }}>Trả lời: {replyTo.ten_nguoi_gui || 'Tin nhắn'}</p>
                <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: '#495057', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.noi_dung}</p>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ all: 'unset', cursor: 'pointer', color: '#868e96', fontSize: '1rem', lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</button>
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: '10px 12px 14px', background: '#fff', borderTop: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {/* Quick bar */}
            {chatMode === 'AI' && (
              <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 1 }}>
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.id} onClick={() => sendMessage(a.text)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: '#495057', background: '#f8f9fa', padding: '5px 10px', borderRadius: 20, border: '1px solid #e9ecef', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fff3f0'; e.currentTarget.style.color = '#e8572a'; e.currentTarget.style.borderColor = '#e8572a40'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.color = '#495057'; e.currentTarget.style.borderColor = '#e9ecef'; }}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 22, border: '1.5px solid #e9ecef', padding: '9px 14px', transition: 'border-color 0.2s, box-shadow 0.2s', display: 'flex', alignItems: 'center' }}>
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  onFocus={(e) => { e.currentTarget.parentElement.style.borderColor = '#e8572a'; e.currentTarget.parentElement.style.boxShadow = '0 0 0 3px rgba(232,87,42,0.12)'; }}
                  onBlur={(e) => { e.currentTarget.parentElement.style.borderColor = '#e9ecef'; e.currentTarget.parentElement.style.boxShadow = 'none'; }}
                  placeholder={chatMode === 'AI' ? 'Nhắn tin với AI...' : 'Nhắn tin cho nhân viên...'}
                  rows={1}
                  style={{ flex: 1, border: 'none', padding: 0, outline: 'none', background: 'transparent', fontSize: '0.84rem', color: '#212529', resize: 'none', maxHeight: 100, lineHeight: 1.5, fontFamily: 'inherit' }}
                />
              </div>

              {chatMode === 'AI' && (
                <button onClick={startVoice} disabled={isListening} title="Nói để đặt hàng"
                  style={{ border: 'none', padding: 0, outline: 'none', cursor: 'pointer', width: 42, height: 42, borderRadius: '50%', background: isListening ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#f8f9fa', border: '1.5px solid #e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: isListening ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none', animation: isListening ? 'micPulse 1s ease-in-out infinite' : 'none' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={isListening ? '#fff' : '#868e96'} style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}

              <button onClick={() => sendMessage()} disabled={!inputText.trim() || sending}
                style={{ border: 'none', padding: 0, outline: 'none', cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer', width: 42, height: 42, borderRadius: '50%', background: !inputText.trim() || sending ? '#e9ecef' : 'linear-gradient(135deg,#e8572a,#d94b1e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: !inputText.trim() || sending ? 'none' : '0 3px 12px rgba(232,87,42,0.4)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke={!inputText.trim() || sending ? '#adb5bd' : '#fff'} style={{ width: 16, height: 16, transform: 'translateX(1px)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => isOpen ? setIsOpen(false) : openChat('AI')}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 999,
          border: 'none', padding: 0, outline: 'none', cursor: 'pointer',
          width: 60, height: 60, borderRadius: 19,
          background: isOpen ? 'linear-gradient(135deg,#8a0b1f,#6b0918)' : 'linear-gradient(135deg,#c41230,#e0334d)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isOpen ? '0 6px 20px rgba(196,18,48,0.25)' : '0 8px 26px rgba(196,18,48,0.35)',
          transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 20, height: 20 }}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 24, height: 24 }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 6 6 0 001.257-2.909C3.125 15.642 2 13.931 2 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
        )}
        {!isOpen && unread > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <style>{`
        @keyframes chatOpen { from { opacity: 0; transform: scale(0.88) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes typingDot { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-5px); opacity: 1; } }
        @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
        .chat-scroll::-webkit-scrollbar { width: 5px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
        .chat-scroll { scroll-behavior: smooth; }
      `}</style>
    </>
  );
}
