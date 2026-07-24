import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiClient } from '../lib/apiClient';

// ─── Utilities & Formatters ──────────────────────────────────────────────────
const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtTime = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); };
const fmtDateHeader = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const days = ['CN', 'THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7'];
  const dayName = days[d.getDay()];
  const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${dayName}, ${dateStr}`;
};

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

function getInitials(name) {
  if (!name || name === 'Khách') return 'G';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ORDER_STATUS = {
  CHO_XAC_NHAN: { label: 'Chờ xác nhận', color: '#f59e0b' },
  DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#3b82f6' },
  DANG_CHUAN_BI: { label: 'Đang pha chế', color: '#8b5cf6' },
  DANG_GIAO: { label: 'Đang giao', color: '#f97316' },
  HOAN_THANH: { label: 'Hoàn thành', color: '#22c55e' },
  DA_HUY: { label: 'Đã huỷ', color: '#ef4444' },
};

const QUICK_ACTIONS = [
  { id: 'menu', label: 'Xem menu', text: 'Gợi ý cho tôi menu đồ uống nổi bật' },
  { id: 'order', label: 'Đặt hàng', text: 'Tôi muốn đặt đồ uống giao ngay' },
  { id: 'orders', label: 'Đơn hàng', text: 'Kiểm tra trạng thái đơn hàng của tôi' },
  { id: 'stores', label: 'Cửa hàng', text: 'Địa chỉ các chi nhánh gần đây' },
  { id: 'voucher', label: 'Ưu đãi', text: 'Cho tôi xem mã giảm giá và khuyến mãi' },
  { id: 'payment', label: 'Thanh toán', text: 'Các phương thức thanh toán được hỗ trợ' },
];

// ─── SVG Avatars & Icons ──────────────────────────────────────────────────────
function AIAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #F08080 0%, #E55353 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: '0 3px 10px rgba(240,128,128,0.4)',
      border: '2px solid #FFFFFF'
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
        <path d="M12 12L2.1 12" />
        <path d="M12 12l4.3-7.5" />
        <circle cx="12" cy="12" r="3" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

function CustomerAvatar({ user, size = 32 }) {
  const avatarUrl = user?.avatar_url || user?.avatarUrl || user?.hinh_anh || user?.hinh_anh_url;
  const userName = user?.ho_ten || user?.email || '';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={userName}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
          border: '2px solid #F08080',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}
      />
    );
  }

  if (user && userName) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #F08080 0%, #F49797 100%)',
        color: '#FFF', fontWeight: 800, fontSize: size * 0.4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, border: '2px solid #FFFFFF',
        boxShadow: '0 2px 8px rgba(240,128,128,0.3)', letterSpacing: '-0.5px'
      }}>
        {getInitials(userName)}
      </div>
    );
  }

  // Guest Avatar SVG Silhouette
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #FDF0F0 0%, #FFE4E4 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, border: '2px solid #F08080',
      boxShadow: '0 2px 8px rgba(240,128,128,0.2)'
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#F08080" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

function StaffAvatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, border: '2px solid #FFFFFF',
      boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    </div>
  );
}

// ─── Rich Card Components ─────────────────────────────────────────────────────
function ProductCard({ p, onAdd }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        display: 'flex', gap: 10, padding: '10px 12px',
        background: hover ? '#FFF8F8' : '#FFFFFF', borderRadius: 14,
        border: '1px solid #FFE3E3', cursor: 'pointer', transition: 'all 0.15s ease'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {p.hinh_anh_url ? (
        <img src={p.hinh_anh_url} alt={p.ten_san_pham} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid #FFEBEB' }} />
      ) : (
        <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: '#FFF0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F08080" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#2D3748', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ten_san_pham}</p>
        <p style={{ margin: '3px 0 0', fontSize: '0.82rem', fontWeight: 800, color: '#F08080' }}>{fmtVND(p.gia_ban)}</p>
        {p.danh_muc && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#A0AEC0', fontWeight: 600 }}>{p.danh_muc}</p>}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(p); }}
        style={{ all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', background: '#F08080', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center', fontWeight: 900, fontSize: '1.1rem', boxShadow: '0 2px 8px rgba(240,128,128,0.4)', transition: 'transform 0.1s' }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title="Thêm vào giỏ"
      >+</button>
    </div>
  );
}

function OrderCard({ o }) {
  const s = ORDER_STATUS[o.trang_thai_don_hang] || { label: o.trang_thai_don_hang || 'N/A', color: '#718096' };
  const code = String(o.ma_don_hang || '').slice(-8).toUpperCase();
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #FFEBEB', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #FFF0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 800, color: '#2D3748', letterSpacing: '0.3px' }}>#{code}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#A0AEC0' }}>{fmtDateHeader(o.ngay_tao)}</p>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: s.color, background: s.color + '18', padding: '4px 10px', borderRadius: 20 }}>{s.label}</span>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 900, color: '#F08080' }}>{fmtVND(o.tong_tien)}</p>
        <a href="/?tab=orders" style={{ fontSize: '0.68rem', fontWeight: 800, color: '#F08080', textDecoration: 'none', padding: '4px 10px', border: '1px solid #F0808040', borderRadius: 20 }}>Chi tiết →</a>
      </div>
    </div>
  );
}

function StoreCard({ b }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #FFEBEB', padding: '11px 13px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF0F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F08080" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#2D3748' }}>{b.ten_chi_nhanh}</p>
          <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#718096', lineHeight: 1.4 }}>{b.dia_chi}</p>
          {b.gio_mo_cua && <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#F08080', fontWeight: 700 }}>Giờ mở cửa: {b.gio_mo_cua} – {b.gio_dong_cua}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        {b.so_dien_thoai && (
          <a href={`tel:${b.so_dien_thoai}`} style={{ flex: 1, fontSize: '0.7rem', fontWeight: 800, color: '#4A5568', background: '#F7FAFC', border: '1px solid #EDF2F7', borderRadius: 8, padding: '6px 0', textDecoration: 'none', textAlign: 'center', display: 'block' }}>📞 Gọi ngay</a>
        )}
        {b.map_url && (
          <a href={b.map_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: '0.7rem', fontWeight: 800, color: '#FFF', background: '#F08080', borderRadius: 8, padding: '6px 0', textDecoration: 'none', textAlign: 'center', display: 'block' }}>🗺️ Chỉ đường</a>
        )}
      </div>
    </div>
  );
}

function PaymentCard() {
  const methods = [
    { name: 'VNPAY', desc: 'ATM / Internet Banking / QR Code', color: '#1E40AF' },
    { name: 'Ví MoMo / ZaloPay', desc: 'Thanh toán qua ví điện tử', color: '#A21CAF' },
    { name: 'Ví Avengers', desc: 'Nạp ví nhận hoàn xu tới 10%', color: '#F08080' },
    { name: 'Tiền mặt (COD)', desc: 'Thanh toán khi nhận hàng', color: '#16A34A' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {methods.map((m) => (
        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#FFF', borderRadius: 10, border: '1px solid #FFEBEB' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, color: m.color, flexShrink: 0 }}>
            💳
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, color: '#2D3748' }}>{m.name}</p>
            <p style={{ margin: '1px 0 0', fontSize: '0.66rem', color: '#718096' }}>{m.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function VoucherCard({ v }) {
  const code = v.ma_khuyen_mai || v.ma_voucher || v.code || 'AVENGER';
  const name = v.ten_khuyen_mai || v.ten_voucher || v.name || v.title || `Voucher ${code}`;
  const type = String(v.loai_khuyen_mai || v.loai_giam_gia || v.loai || '').toUpperCase();
  const rawVal = Number(v.gia_tri || v.gia_tri_giam || v.discount_value || 0);
  let badgeText = 'HOT';
  if (type.includes('PERCENT') || (rawVal > 0 && rawVal <= 100)) {
    badgeText = `${rawVal || 10}%`;
  } else if (rawVal >= 1000) {
    badgeText = `${Math.round(rawVal / 1000)}K`;
  } else if (rawVal > 0) {
    badgeText = `${rawVal}K`;
  }
  const minSpend = v.gia_tri_don_toi_thieu ? ` • Đơn từ ${fmtVND(v.gia_tri_don_toi_thieu)}` : '';

  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 11px', background: '#FFF', borderRadius: 12, border: '1px solid #FFE3E3', alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#F08080,#E55353)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#FFF', textAlign: 'center', lineHeight: 1.2 }}>{badgeText}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, color: '#2D3748', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.66rem', color: '#F08080', fontWeight: 700, letterSpacing: '0.3px' }}>
          Mã: <span style={{ fontWeight: 900 }}>{code}</span>{minSpend}
        </p>
      </div>
    </div>
  );
}

// ─── Typing Animation ────────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '4px 0', animation: 'fadeIn 0.2s ease' }}>
      <AIAvatar size={28} />
      <div style={{
        position: 'relative',
        background: '#FFFFFF', border: '1px solid #FFE3E3',
        borderRadius: '16px 16px 16px 4px',
        padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center',
        boxShadow: '0 2px 8px rgba(240,128,128,0.1)'
      }}>
        <div style={{ position: 'absolute', bottom: 0, left: -6, width: 0, height: 0, borderRight: '8px solid #FFFFFF', borderTop: '8px solid transparent' }} />
        {[0, 200, 400].map((d) => (
          <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F08080', animation: `typingDot 1.2s ${d}ms infinite ease-in-out` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Chat Widget Component ───────────────────────────────────────────────
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

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const isOpenRef = useRef(false);
  const chatModeRef = useRef('AI');

  // Data cache & prefetch
  const cache = useRef({ products: [], branches: [], orders: [], vouchers: [], loaded: false });

  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const userName = user?.ho_ten || user?.hoTen || user?.email || 'Khách';
  const anonId = useRef(getOrCreateAnonId());
  const effectiveUserId = userId || anonId.current;

  const prefetchData = useCallback(async () => {
    if (cache.current.loaded) return cache.current;
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
    return cache.current;
  }, [userId]);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);

  const scrollBottom = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80), []);

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
    if (mode === 'AI' && !greeted) {
      setGreeted(true);
      const nameStr = user?.ho_ten || user?.hoTen ? ` ${user.ho_ten || user.hoTen}` : '';
      addAIMsg(
        `Xin chào${nameStr}! 👋 Mình là Trợ lý AI của Avengers Coffee.\n\nHôm nay mình có thể hỗ trợ gì cho bạn?`,
        { _quickReplies: QUICK_ACTIONS.slice(0, 4) }
      );
    } else if (mode === 'STAFF') {
      openStaffChat();
    }
  }, [greeted, user, addAIMsg, openStaffChat]);

  // Add item to cart
  const addToCart = useCallback(async (product) => {
    if (!userId) {
      addAIMsg('Bạn cần đăng nhập để thêm vào giỏ hàng nhé! [Đăng nhập ngay](/login)', {
        _quickReplies: [{ id: 'login', label: 'Đăng nhập', text: 'Tôi muốn đăng nhập' }]
      });
      return;
    }
    try {
      await apiClient.post('/cart', {
        ma_nguoi_dung: userId,
        ma_san_pham: product.id || product.ma_san_pham,
        ten_san_pham: product.ten_san_pham,
        gia_ban: product.gia_ban,
        hinh_anh_url: product.hinh_anh_url,
        size: 'Nhỏ',
        so_luong: 1
      });
      addAIMsg(`✅ Đã thêm **${product.ten_san_pham}** vào giỏ hàng! Giá: ${fmtVND(product.gia_ban)}`, {
        _quickReplies: [
          { id: 'more', label: 'Xem thêm menu', text: 'Gợi ý thêm menu' },
          { id: 'cart', label: 'Xem giỏ hàng', text: 'Xem giỏ hàng của tôi' },
        ],
      });
    } catch {
      addAIMsg('😢 Không thể thêm sản phẩm vào giỏ. Vui lòng thử lại!');
    }
    scrollBottom();
  }, [userId, addAIMsg, scrollBottom]);

  // Direct AI API handler (100% dynamic response from backend AI service + UI Cards)
  const processAIMessage = useCallback(async (text) => {
    const textLower = text.toLowerCase();

    // Check direct navigation commands
    if (/(xem giỏ hàng|vào giỏ hàng|trang giỏ hàng)/.test(textLower)) {
      addAIMsg('🛒 Đang chuyển bạn đến trang giỏ hàng...');
      setTimeout(() => { window.location.href = '/cart'; }, 600);
      return;
    }

    // Prefetch data cache if needed
    await prefetchData();

    try {
      // Build conversation history snippet
      const history = messages.slice(-6).map((m) => `${m.vai_tro_nguoi_gui === 'CUSTOMER' ? userName : 'AI'}: ${m.noi_dung}`).join('\n');

      // Check order intent if customer wants to order directly
      if (/(đặt|mua|order|cho tôi|cho mình)\s*(\d+)?/.test(textLower)) {
        try {
          const orderRes = await apiClient.post('/ai/chat/order-intent', { text, user_id: effectiveUserId, history });
          const d = orderRes?.data || orderRes;
          if (d?.can_order && d?.items?.length > 0) {
            setPendingOrder({ items: d.items, total: d.estimated_total, message: d.message, paymentMethod: d.payment_method });
            return;
          }
        } catch { /* proceed to general chat */ }
      }

      // Call primary AI Chat endpoint (`/ai/chat`)
      const chatRes = await apiClient.post('/ai/chat', {
        user_id: effectiveUserId,
        user_name: userName,
        content: text,
        history,
        reply_to: replyTo ? { sender: replyTo.ten_nguoi_gui, content: replyTo.noi_dung } : null,
      });

      const resData = chatRes?.data || chatRes;
      let reply = resData?.reply || resData?.message;

      if (reply) {
        const extras = {};

        // 1. Stores / Chi nhánh
        if ((resData.stores && resData.stores.length > 0) || /(cửa hàng|chi nhánh|địa chỉ|ở đâu|gần đây|tìm cửa)/.test(textLower) || /(cửa hàng|chi nhánh|địa chỉ)/.test(reply.toLowerCase())) {
          extras._stores = (resData.stores && resData.stores.length > 0) ? resData.stores : cache.current.branches.slice(0, 4);
        }

        // 2. Menu / Sản phẩm
        if ((resData.products && resData.products.length > 0) || /(thực đơn|menu|đồ uống|cà phê|phê|trà|sữa|đồ ăn|bánh|matcha|latte|có gì ngon|món|xem menu|đặt)/.test(textLower) || /(sản phẩm|đồ uống|menu|món|matcha|latte)/.test(reply.toLowerCase())) {
          let prods = (resData.products && resData.products.length > 0) ? resData.products : cache.current.products;
          const searchKeys = ['matcha', 'latte', 'americano', 'trà sữa', 'bánh', 'cà phê', 'phin', 'espresso', 'cold brew', 'trà'];
          const matchedKey = searchKeys.find((k) => textLower.includes(k) || reply.toLowerCase().includes(k));
          if (matchedKey && prods.length > 0) {
            const filtered = prods.filter((p) =>
              (p.ten_san_pham || '').toLowerCase().includes(matchedKey) ||
              (p.ten_danh_muc || p.danh_muc || '').toLowerCase().includes(matchedKey)
            );
            if (filtered.length > 0) prods = filtered;
          }
          extras._products = prods.slice(0, 6);
        }

        // 3. Vouchers / Khuyến mãi
        if ((resData.vouchers && resData.vouchers.length > 0) || /(khuyến mãi|voucher|giảm giá|ưu đãi|mã)/.test(textLower) || /(voucher|khuyến mãi|ưu đãi)/.test(reply.toLowerCase())) {
          extras._vouchers = (resData.vouchers && resData.vouchers.length > 0) ? resData.vouchers : cache.current.vouchers.slice(0, 4);
        }

        // 4. Orders / Đơn hàng
        if ((resData.orders && resData.orders.length > 0) || /(đơn hàng|đơn của tôi|trạng thái.*đơn|theo dõi.*đơn|giao chưa)/.test(textLower) || /(đơn hàng)/.test(reply.toLowerCase())) {
          extras._orders = (resData.orders && resData.orders.length > 0) ? resData.orders : cache.current.orders.slice(0, 3);
        }

        // 5. Payment
        if (/(thanh toán|payment|vnpay|ví|momo|atm)/.test(textLower)) {
          extras._type = 'payment';
        }

        // Clean up bullet list text lines if interactive cards are present
        const hasCards = Boolean(extras._products || extras._stores || extras._vouchers || extras._orders);
        if (hasCards) {
          const lines = reply.split('\n');
          const nonBulletLines = lines.filter((l) => {
            const trimmed = l.trim();
            if (/^\s*[-*•\d+.]\s+/.test(l)) return false;
            if (/^\*\*.+\*\*:?$/.test(trimmed)) return false;
            return true;
          });
          const cleanedText = nonBulletLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
          if (cleanedText) reply = cleanedText;
        }

        addAIMsg(reply, { ...extras, _quickReplies: QUICK_ACTIONS.slice(0, 3) });
        return;
      }
    } catch (err) {
      console.error('[ChatWidget] AI API error:', err);
    }

    // Ultimate fallback
    addAIMsg('Xin lỗi, mình gặp gián đoạn kết nối ngắn. Bạn vui lòng thử lại câu hỏi nhé!', {
      _quickReplies: QUICK_ACTIONS.slice(0, 3),
    });
  }, [messages, userName, effectiveUserId, replyTo, prefetchData, addAIMsg]);

  // Send message trigger
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText !== undefined ? String(overrideText) : inputText).trim();
    if (!text || sending) return;
    if (overrideText === undefined) setInputText('');
    setSending(true);

    if (chatMode === 'AI') {
      addUserMsg(text);
      scrollBottom();
      setIsTyping(true);
      try {
        await processAIMessage(text);
      } finally {
        setIsTyping(false);
        setSending(false);
        scrollBottom();
      }
    } else {
      // Staff mode
      if (!conversation) { setSending(false); return; }
      const content = buildContentWithReply(text, replyTo ? { sender: replyTo.ten_nguoi_gui || replyTo.sender, content: replyTo.noi_dung?.slice(0, 200) } : null);
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
  }, [inputText, sending, chatMode, conversation, replyTo, effectiveUserId, userName, addUserMsg, scrollBottom, processAIMessage]);

  // Voice speech-to-text
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Trình duyệt của bạn chưa hỗ trợ nhận diện giọng nói. Vui lòng dùng Google Chrome!'); return; }
    const r = new SR();
    r.lang = 'vi-VN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.onresult = (e) => { const t = e.results[0][0].transcript; setIsListening(false); sendMessage(t); };
    r.start();
  }, [sendMessage]);

  // Confirm pending order
  const confirmOrder = useCallback(async () => {
    if (!pendingOrder) return;
    setOrderConfirming(true);
    try {
      const items = pendingOrder.items.filter((i) => i.matched).map((i) => ({
        ma_san_pham: i.product_id, ten_san_pham: i.product_name, so_luong: i.quantity, gia_ban: i.price, hinh_anh_url: i.image_url,
        ghi_chu: [i.size ? `Size ${i.size}` : '', i.note || ''].filter(Boolean).join(', ')
      }));
      await apiClient.post('/orders', {
        ma_nguoi_dung: effectiveUserId, phuong_thuc_thanh_toan: pendingOrder.paymentMethod || 'THANH_TOAN_KHI_NHAN_HANG', loai_don_hang: 'DELIVERY', chi_tiet_don_hang: items, ghi_chu: 'Chat Order'
      });
      addAIMsg(`🎉 Đặt hàng thành công! Tổng cộng: **${fmtVND(pendingOrder.total)}**\nĐơn hàng của bạn đang được chuẩn bị!`, {
        _quickReplies: [{ id: 'orders', label: 'Xem đơn hàng', text: 'Xem đơn hàng của tôi' }],
      });
      setPendingOrder(null);
      scrollBottom();
    } catch { alert('Không thể đặt hàng. Vui lòng thử lại!'); }
    finally { setOrderConfirming(false); }
  }, [pendingOrder, effectiveUserId, addAIMsg, scrollBottom]);

  const activeMessages = chatMode === 'AI' ? messages : staffMessages;

  // Render text with Markdown formatting support
  const renderText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: 'inherit', fontWeight: 800 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
    );
  };

  return (
    <>
      <style>{`
        @keyframes chatOpen {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typingDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .chat-scroll::-webkit-scrollbar { width: 5px; }
        .chat-scroll::-webkit-scrollbar-thumb { background: #F0808060; borderRadius: 4px; }
      `}</style>

      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => openChat('AI')}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F08080 0%, #E55353 100%)',
            border: '3px solid #FFFFFF',
            boxShadow: '0 8px 24px rgba(240,128,128,0.45)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            outline: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Trợ lý AI Avengers Coffee"
        >
          <AIAvatar size={36} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -3,
              background: '#EF4444', color: '#FFF', fontSize: '0.7rem',
              fontWeight: 900, minWidth: 20, height: 20, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #FFF', padding: '0 4px'
            }}>
              {unread}
            </span>
          )}
        </button>
      )}

      {/* Main Chat Window Panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 'min(94vw, 400px)', height: 'min(84vh, 670px)',
          display: 'flex', flexDirection: 'column',
          background: '#FFFFFF',
          borderRadius: 24,
          boxShadow: '0 20px 50px rgba(0,0,0,0.15), 0 4px 20px rgba(240,128,128,0.2)',
          border: '1px solid #FFE3E3',
          overflow: 'hidden',
          animation: 'chatOpen 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}>
          {/* Reference Image Styled Header */}
          <div style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5F5 100%)',
            borderBottom: '1px solid #FFE3E3',
            padding: '12px 16px 10px',
            flexShrink: 0,
          }}>
            {/* Top window controls row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              {/* Window controls (x - +) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setIsOpen(false)}
                  style={{ border: 'none', background: '#F0808022', color: '#F08080', width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}
                  title="Đóng"
                >×</button>
                <button
                  onClick={() => setIsOpen(false)}
                  style={{ border: 'none', background: '#E2E8F0', color: '#718096', width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}
                  title="Thu nhỏ"
                >−</button>
                <button
                  style={{ border: 'none', background: '#E2E8F0', color: '#718096', width: 18, height: 18, borderRadius: '50%', cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}
                >+</button>
              </div>

              {/* Title / User info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {chatMode === 'AI' ? <AIAvatar size={24} /> : <CustomerAvatar user={user} size={24} />}
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2D3748' }}>
                  {chatMode === 'AI' ? 'Avengers AI Assistant' : 'Hỗ trợ Khách hàng'}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} title="Online" />
              </div>
            </div>

            {/* Mode switch tabs */}
            <div style={{ display: 'flex', background: '#FFEBEB', padding: 3, borderRadius: 12, gap: 2 }}>
              {[{ mode: 'AI', label: 'Trợ lý AI' }, { mode: 'STAFF', label: 'Nhân viên tư vấn' }].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => { setChatMode(mode); if (mode === 'STAFF') openStaffChat(); }}
                  style={{
                    border: 'none', outline: 'none', cursor: 'pointer', flex: 1, padding: '6px 0', borderRadius: 10,
                    fontSize: '0.74rem', fontWeight: 800, textAlign: 'center', transition: 'all 0.2s',
                    background: chatMode === mode ? '#FFFFFF' : 'transparent',
                    color: chatMode === mode ? '#b22830' : '#718096',
                    boxShadow: chatMode === mode ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',

                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div className="chat-scroll" style={{
            flex: 1, overflowY: 'auto', padding: '16px 14px',
            display: 'flex', flexDirection: 'column', gap: 14,
            background: '#FAFAFA',
          }}>
            {/* Header Date Separator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '4px 0 8px' }}>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#A0AEC0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                — {fmtDateHeader(new Date())} —
              </span>
              <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            </div>

            {activeMessages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: '0 20px' }}>
                <AIAvatar size={54} />
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#4A5568', textAlign: 'center', lineHeight: 1.4 }}>
                  {chatMode === 'AI' ? 'Xin chào! Bạn cần hỗ trợ gì về đồ uống hay đơn hàng hôm nay?' : 'Nhân viên tư vấn sẽ phản hồi trong giây lát.'}
                </p>
                {chatMode === 'AI' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {QUICK_ACTIONS.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => sendMessage(a.text)}
                    style={{ 
                      outline: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, 
                      color: '#b22830', background: '#FFFFFF', padding: '7px 14px', 
                      borderRadius: 20, border: '1px solid #b22830', 
                      display: 'flex', alignItems: 'center', gap: 4 
                    }}
                  >
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
                <div key={msg.id} style={{
                  display: 'flex',
                  justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end', gap: 8,
                }}>
                  {/* Left avatar for AI / Staff */}
                  {!isOwn && (isAI ? <AIAvatar size={32} /> : <StaffAvatar name={msg.ten_nguoi_gui} size={32} />)}

                  <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                    {/* Reply to reference banner */}
                    {msg.reply_to && (
                      <div style={{
                        marginBottom: 4, padding: '5px 10px',
                        background: isOwn ? 'rgba(240,128,128,0.15)' : '#EDF2F7',
                        borderRadius: 8, borderLeft: `3px solid ${isOwn ? '#F08080' : '#6366F1'}`
                      }}>
                        <p style={{ margin: 0, fontSize: '0.64rem', fontWeight: 800, color: isOwn ? '#E55353' : '#4F46E5' }}>{msg.reply_to.sender}</p>
                        <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: '#4A5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.reply_to.content}</p>
                      </div>
                    )}

                    {/* Speech Bubble Container with pointer tail */}
                    <div style={{
                      position: 'relative',
                      padding: '10px 14px',
                      borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: isOwn ? 'linear-gradient(135deg, #F08080 0%, #E55353 100%)' : '#FFFFFF',
                      color: isOwn ? '#FFFFFF' : '#2D3748',
                      fontSize: '0.84rem', lineHeight: 1.5,
                      boxShadow: isOwn ? '0 4px 14px rgba(240,128,128,0.3)' : '0 2px 10px rgba(0,0,0,0.06)',
                      border: isOwn ? 'none' : '1px solid #FFE3E3',
                      wordBreak: 'break-word',
                    }}>
                      {/* Tail Triangle */}
                      <div style={{
                        position: 'absolute', bottom: 0,
                        [isOwn ? 'right' : 'left']: -6,
                        width: 0, height: 0,
                        borderTop: '8px solid transparent',
                        borderRight: isOwn ? 'none' : '8px solid #FFFFFF',
                        borderLeft: isOwn ? '8px solid #E55353' : 'none',
                      }} />

                      {!isOwn && (
                        <p style={{ margin: '0 0 4px', fontSize: '0.65rem', fontWeight: 800, color: '#F08080', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {msg.ten_nguoi_gui || (isAI ? 'Trợ lý AI' : 'Nhân viên')}
                        </p>
                      )}
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderText(msg.noi_dung)}</p>

                      {/* Rich Content Cards */}
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

                    {/* Quick Replies below AI messages */}
                    {msg._quickReplies && msg._quickReplies.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {msg._quickReplies.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => sendMessage(r.text)}
                            style={{ all: 'unset', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: '#F08080', background: '#FFFFFF', padding: '5px 12px', borderRadius: 16, border: '1.5px solid #F0808040', boxShadow: '0 1px 4px rgba(240,128,128,0.1)', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#FFF0F0'; e.currentTarget.style.borderColor = '#F08080'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#F0808040'; }}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Time & Reply Trigger */}
                    <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: '0.62rem', color: '#A0AEC0', fontWeight: 600 }}>{fmtTime(msg.ngay_tao)}</span>
                      {!isOwn && (
                        <button onClick={() => setReplyTo(msg)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.62rem', color: '#F08080', fontWeight: 700 }}>Trả lời</button>
                      )}
                    </div>
                  </div>

                  {/* Right avatar for Customer */}
                  {isOwn && <CustomerAvatar user={user} size={32} />}
                </div>
              );
            })}

            {isTyping && <TypingBubble />}
            <div ref={bottomRef} />
          </div>

          {/* Pending Order Confirmation Bar */}
          {pendingOrder && (
            <div style={{ margin: '0 12px 8px', background: '#FFFFFF', borderRadius: 14, border: '1px solid #F0808050', boxShadow: '0 4px 16px rgba(240,128,128,0.15)', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(90deg,#F08080,#E55353)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#FFF', fontWeight: 800, fontSize: '0.76rem' }}>🛒 XÁC NHẬN ĐẶT HÀNG</span>
              </div>
              {pendingOrder.message && <p style={{ margin: '8px 14px 4px', fontSize: '0.8rem', fontWeight: 700, color: '#2D3748' }}>{pendingOrder.message}</p>}
              <div style={{ padding: '4px 14px 8px' }}>
                {pendingOrder.items.filter((i) => i.matched).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #EDF2F7' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>x{item.quantity} {item.product_name}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#F08080' }}>{fmtVND(item.subtotal || 0)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>Tổng cộng</span>
                  <span style={{ fontWeight: 900, color: '#F08080', fontSize: '0.86rem' }}>{fmtVND(pendingOrder.total)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPendingOrder(null)} style={{ all: 'unset', cursor: 'pointer', padding: '6px 16px', borderRadius: 20, background: '#EDF2F7', color: '#4A5568', fontWeight: 700, fontSize: '0.76rem' }}>Huỷ</button>
                <button onClick={confirmOrder} disabled={orderConfirming} style={{ all: 'unset', cursor: orderConfirming ? 'not-allowed' : 'pointer', padding: '6px 18px', borderRadius: 20, background: 'linear-gradient(90deg,#F08080,#E55353)', color: '#FFF', fontWeight: 800, fontSize: '0.76rem', opacity: orderConfirming ? 0.75 : 1 }}>
                  {orderConfirming ? 'Đang đặt...' : '✅ Đặt ngay'}
                </button>
              </div>
            </div>
          )}

          {/* Reply-to Bar */}
          {replyTo && (
            <div style={{ padding: '6px 14px', background: '#FFF0F0', borderTop: '1px solid #FFE3E3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ overflow: 'hidden' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#F08080' }}>Đang trả lời {replyTo.ten_nguoi_gui || 'tin nhắn'}: </span>
                <span style={{ fontSize: '0.7rem', color: '#4A5568' }}>{replyTo.noi_dung}</span>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: '#F08080', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: '10px 12px 14px', background: '#fff', borderTop: '1px solid #e9ecef', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {/* Quick bar */}
            {chatMode === 'AI' && (
              <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 1 }}>
                {QUICK_ACTIONS.map((a) => (
                  <button key={a.id} onClick={() => sendMessage(a.text)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: '#495057', background: '#f8f9fa', padding: '5px 10px', borderRadius: 20, border: '1px solid #e9ecef', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fff3f0'; e.currentTarget.style.color = '#b22830'; e.currentTarget.style.borderColor = '#b2283040'; }}
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
                  onFocus={(e) => { e.currentTarget.parentElement.style.borderColor = '#b22830'; e.currentTarget.parentElement.style.boxShadow = '0 0 0 3px rgba(178,40,48,0.12)'; }}
                  onBlur={(e) => { e.currentTarget.parentElement.style.borderColor = '#e9ecef'; e.currentTarget.parentElement.style.boxShadow = 'none'; }}
                  placeholder={chatMode === 'AI' ? 'Nhắn tin với AI...' : 'Nhắn tin cho nhân viên...'}
                  rows={1}
                  style={{ flex: 1, border: 'none', padding: 0, outline: 'none', background: 'transparent', fontSize: '0.84rem', color: '#212529', resize: 'none', maxHeight: 100, lineHeight: 1.5, fontFamily: 'inherit' }}
                />
              </div>

              {chatMode === 'AI' && (
                <button onClick={startVoice} disabled={isListening} title="Nói để đặt hàng"
                  style={{ padding: 0, outline: 'none', cursor: 'pointer', width: 42, height: 42, borderRadius: '50%', background: isListening ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#f8f9fa', border: '1.5px solid #e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: isListening ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none', animation: isListening ? 'micPulse 1s ease-in-out infinite' : 'none' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={isListening ? '#fff' : '#868e96'} style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}

              <button onClick={() => sendMessage()} disabled={!inputText.trim() || sending}
                style={{ border: 'none', padding: 0, outline: 'none', cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer', width: 42, height: 42, borderRadius: '50%', background: !inputText.trim() || sending ? '#e9ecef' : 'linear-gradient(135deg,#b22830,#911f25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: !inputText.trim() || sending ? 'none' : '0 3px 12px rgba(178,40,48,0.4)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke={!inputText.trim() || sending ? '#adb5bd' : '#fff'} style={{ width: 16, height: 16, transform: 'translateX(1px)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>

          </div>
        </div>
      )}
    </>
  );
}
