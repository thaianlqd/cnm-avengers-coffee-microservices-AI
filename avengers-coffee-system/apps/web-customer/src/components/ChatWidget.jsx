import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiClient } from '../lib/apiClient';

function getOrCreateAnonymousChatId() {
  const storageKey = 'avengers_anon_chat_id';
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const created = `anon-chat-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  sessionStorage.setItem(storageKey, created);
  return created;
}

export default function ChatWidget({ user, socketUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messagesByMode, setMessagesByMode] = useState({ STAFF: [], AI: [] });
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatMode, setChatMode] = useState('STAFF'); // 'STAFF' | 'AI'

  // Voice + Order state
  const [isListening, setIsListening] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null); // { items, total, message, transcript }
  const [orderLoading, setOrderLoading] = useState(false);
  const recognitionRef = useRef(null);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const isOpenRef = useRef(false);
  const chatModeRef = useRef('STAFF');
  const textareaRef = useRef(null);

  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const userName = user?.ho_ten || user?.hoTen || user?.tenDangNhap || user?.email || 'Khách';
  const anonymousChatIdRef = useRef(null);

  if (!anonymousChatIdRef.current) {
    anonymousChatIdRef.current = getOrCreateAnonymousChatId();
  }

  const aiUserId = userId || anonymousChatIdRef.current;
  const staffChatUserId = userId || anonymousChatIdRef.current;
  const messages = messagesByMode[chatMode] || [];
  const isAiMode = chatMode === 'AI';

  const setMessagesForMode = (mode, updater) => {
    setMessagesByMode((prev) => {
      const current = prev[mode] || [];
      const nextModeMessages = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prev,
        [mode]: nextModeMessages,
      };
    });
  };

  const encodeReplyMeta = (reply) => {
    if (!reply) return null;
    try {
      return encodeURIComponent(JSON.stringify({ sender: reply.sender, content: reply.content }));
    } catch {
      return null;
    }
  };

  const buildContentWithReplyMeta = (content, reply) => {
    const encoded = encodeReplyMeta(reply);
    if (!encoded) return content;
    return `[[reply:${encoded}]]\n${content}`;
  };

  const parseContentAndReply = (rawContent) => {
    const text = String(rawContent || '');
    const match = text.match(/^\[\[reply:([^\]]+)\]\]\n?/);
    if (!match) {
      return { content: text, reply: null };
    }
    try {
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      return {
        content: text.replace(match[0], ''),
        reply: {
          sender: parsed?.sender || 'Tin nhắn được phản hồi',
          content: parsed?.content || '',
        },
      };
    } catch {
      return { content: text, reply: null };
    }
  };

  const toReplyPayload = (msg) => {
    if (!msg) return null;
    return {
      id: msg.id,
      sender: msg.ten_nguoi_gui || (msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'Bạn' : 'Hỗ trợ viên'),
      content: String(msg.noi_dung || '').slice(0, 240),
    };
  };

  const normalizeMessage = (msg) => {
    const parsed = parseContentAndReply(msg.noi_dung);
    return {
      ...msg,
      id: msg.id ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ngay_tao: msg.ngay_tao || new Date().toISOString(),
      noi_dung: parsed.content,
      reply_to: msg.reply_to || msg.replyTo || parsed.reply || null,
    };
  };

  const formatTime = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const growTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
  };

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    chatModeRef.current = chatMode;
  }, [chatMode]);

  useEffect(() => {
    growTextarea();
  }, [inputText]);

  useEffect(() => {
    if (!staffChatUserId) return undefined;

    const socket = io(`${socketUrl}/chat`, {
      transports: ['websocket'],
      auth: { userId: staffChatUserId, role: 'CUSTOMER' },
    });

    socket.emit('chat:subscribe', { userId: staffChatUserId, role: 'CUSTOMER' });

    socket.on('chat:message:new', (msg) => {
      const normalized = normalizeMessage(msg);
      setMessagesForMode('STAFF', (prev) => (prev.some((m) => String(m.id) === String(normalized.id)) ? prev : [...prev, normalized]));
      if (normalized.vai_tro_nguoi_gui !== 'CUSTOMER' && (!isOpenRef.current || chatModeRef.current !== 'STAFF')) {
        setUnread((n) => n + 1);
      }
      scrollToBottom();
    });

    socket.on('chat:conversation:update', (conv) => {
      if (conv.ma_khach_hang === staffChatUserId) {
        setConversation(conv);
      }
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl, staffChatUserId]);

  useEffect(() => {
    setConversation(null);
    setUnread(0);
    setMessagesByMode((prev) => ({
      ...prev,
      STAFF: [],
    }));
  }, [staffChatUserId]);

  useEffect(() => {
    setMessagesByMode((prev) => ({
      ...prev,
      AI: [],
    }));
  }, [aiUserId]);

  useEffect(() => {
    if (conversation?.ma_hoi_thoai && socketRef.current) {
      socketRef.current.emit('chat:conversation:join', { conversationId: conversation.ma_hoi_thoai });
    }
  }, [conversation?.ma_hoi_thoai]);

  const openChat = async () => {
    setIsOpen(true);
    setUnread(0);
    if (!staffChatUserId) return;
    if (!conversation) {
      setLoading(true);
      try {
        const res = await apiClient.post('/chat/conversations/open', {
          customer_user_id: staffChatUserId,
          customer_name: userName,
        });
        const conv = res.data.conversation;
        setConversation(conv);
        const msgsRes = await apiClient.get(
          `/chat/conversations/${conv.ma_hoi_thoai}/messages?user_id=${staffChatUserId}&role=CUSTOMER`,
        );
        setMessagesForMode('STAFF', (msgsRes.data.items || []).map((item) => normalizeMessage(item)));
        scrollToBottom();
      } catch {
        // ignore errors silently
      } finally {
        setLoading(false);
      }
    } else {
      try {
        await apiClient.patch(`/chat/conversations/${conversation.ma_hoi_thoai}/read`, {
          reader_user_id: staffChatUserId,
          reader_role: 'CUSTOMER',
        });
      } catch {
        // ignore
      }
      scrollToBottom();
    }
  };

  const closeChat = () => {
    setIsOpen(false);
    setReplyTarget(null);
  };

  const ORDER_KEYWORDS = ['cho tôi', 'đặt', 'order', 'mua', 'lấy', 'muốn', 'cần', 'cho mình'];

  const checkOrderIntent = async (text, historyText = '') => {
    try {
      const res = await apiClient.post('/ai/chat/order-intent', {
        text,
        user_id: aiUserId,
        history: historyText,
      });
      const data = res.data;
      if (data?.can_order && data?.items?.length > 0) {
        setPendingOrder({
          items: data.items,
          total: data.estimated_total,
          message: data.message,
          paymentMethod: data.payment_method,
        });
        return true;
      }
    } catch {
      // ignore — fall through to normal AI chat
    }
    return false;
  };

  const sendMessage = async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    const replyPayload = toReplyPayload(replyTarget);
    setSending(true);
    setInputText('');
    setReplyTarget(null);
    if (chatMode === 'AI') {
      const customerMessage = normalizeMessage({
        id: `user-${Date.now()}`,
        vai_tro_nguoi_gui: 'CUSTOMER',
        ten_nguoi_gui: userName,
        noi_dung: content,
        reply_to: replyPayload,
        ngay_tao: new Date().toISOString(),
      });
      setMessagesForMode('AI', (prev) => [...prev, customerMessage]);
      scrollToBottom();
      try {
        const recentHistory = messagesByMode['AI']
          .slice(-6)
          .map((m) => `${m.vai_tro_nguoi_gui === 'CUSTOMER' ? userName : 'AI'}: ${m.noi_dung}`)
          .join('\n');

        // Check order intent first
        const wasOrder = await checkOrderIntent(content, recentHistory);
        if (wasOrder) {
          setSending(false);
          return;
        }



        const res = await apiClient.post('/ai/chat', {
          user_id: aiUserId,
          user_name: userName,
          content,
          history: recentHistory,
          reply_to: replyPayload,
        });
        const aiMsg = normalizeMessage({
          id: `ai-${Date.now()}`,
          vai_tro_nguoi_gui: 'AI',
          ten_nguoi_gui: 'AI',
          noi_dung: res.data.reply || 'Xin lỗi, tôi chưa hiểu.',
          ngay_tao: new Date().toISOString(),
        });
        setMessagesForMode('AI', (prev) => [...prev, aiMsg]);
        scrollToBottom();
      } catch {
        setInputText(content);
        setMessagesForMode('AI', (prev) => prev.filter((item) => item.id !== customerMessage.id));
      } finally {
        setSending(false);
      }
    } else {
      if (!conversation) return setSending(false);
      try {
        const contentToSend = buildContentWithReplyMeta(content, replyPayload);
        const res = await apiClient.post(`/chat/conversations/${conversation.ma_hoi_thoai}/messages`, {
          sender_user_id: staffChatUserId,
          sender_name: userName,
          sender_role: 'CUSTOMER',
          content: contentToSend,
          reply_to: replyPayload,
        });

        if (res?.data?.conversation) {
          setConversation(res.data.conversation);
        }

        if (res?.data?.message) {
          const normalized = normalizeMessage(res.data.message);
          setMessagesForMode('STAFF', (prev) => (prev.some((m) => String(m.id) === String(normalized.id)) ? prev : [...prev, normalized]));
          scrollToBottom();
        }
      } catch {
        setInputText(content);
        setReplyTarget(replyPayload);
      } finally {
        setSending(false);
      }
    }
  };

  const startVoice = () => {
    if (!isAiMode) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Trình duyệt không hỗ trợ voice. Dùng Chrome nhé!');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      // Show transcript in chat
      const customerMessage = normalizeMessage({
        id: `user-voice-${Date.now()}`,
        vai_tro_nguoi_gui: 'CUSTOMER',
        ten_nguoi_gui: userName,
        noi_dung: `🎙️ "${transcript}"`,
        ngay_tao: new Date().toISOString(),
      });
      setMessagesForMode('AI', (prev) => [...prev, customerMessage]);
      scrollToBottom();
      // Try parse as order intent
      try {
        const recentHistoryVoice = messagesByMode['AI']
          .slice(-6)
          .map((m) => `${m.vai_tro_nguoi_gui === 'CUSTOMER' ? userName : 'AI'}: ${m.noi_dung}`)
          .join('\n');
          
        const res = await apiClient.post('/ai/chat/order-intent', {
          text: transcript,
          user_id: aiUserId,
          history: recentHistoryVoice,
        });
        if (res.data?.can_order && res.data?.items?.length > 0) {
          setPendingOrder({
            transcript,
            items: res.data.items,
            total: res.data.estimated_total,
            message: res.data.message,
            paymentMethod: res.data.payment_method,
          });
          return;
        }
      } catch { /* fall through */ }
      // Not an order — send to normal AI chat
      try {
        const res = await apiClient.post('/ai/chat', { user_id: aiUserId, user_name: userName, content: transcript });
        const aiMsg = normalizeMessage({
          id: `ai-${Date.now()}`,
          vai_tro_nguoi_gui: 'AI',
          ten_nguoi_gui: 'AI',
          noi_dung: res.data.reply || 'Xin lỗi, tôi chưa hiểu.',
          ngay_tao: new Date().toISOString(),
        });
        setMessagesForMode('AI', (prev) => [...prev, aiMsg]);
        scrollToBottom();
      } catch { /* ignore */ }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleConfirmOrder = async () => {
    if (!pendingOrder) return;
    setOrderLoading(true);
    try {
      const items = pendingOrder.items
        .filter((i) => i.matched)
        .map((i) => ({
          ma_san_pham: i.product_id,
          ten_san_pham: i.product_name,
          so_luong: i.quantity,
          gia_ban: i.price,
          hinh_anh_url: i.image_url,
          ghi_chu: [i.size ? `Size ${i.size}` : '', i.note || ''].filter(Boolean).join(', '),
        }));
      await apiClient.post('/orders', {
        ma_nguoi_dung: aiUserId,
        phuong_thuc_thanh_toan: pendingOrder.paymentMethod || 'THANH_TOAN_KHI_NHAN_HANG',
        loai_don_hang: 'DELIVERY',
        chi_tiet_don_hang: items,
        ghi_chu: pendingOrder.transcript ? `Voice Order: ${pendingOrder.transcript}` : 'Chat Order',
      });
      const total = Number(pendingOrder.total || 0).toLocaleString('vi-VN');
      const successMsg = normalizeMessage({
        id: `ai-order-ok-${Date.now()}`,
        vai_tro_nguoi_gui: 'AI',
        ten_nguoi_gui: 'AI',
        noi_dung: `✅ Đặt hàng thành công! Tổng: ${total}đ. Đơn hàng đang được xử lý nhé! ☕`,
        ngay_tao: new Date().toISOString(),
      });
      setMessagesForMode('AI', (prev) => [...prev, successMsg]);
      setPendingOrder(null);
      scrollToBottom();
    } catch {
      alert('Không thể tạo đơn. Thử lại nhé!');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const pickReply = (msg) => {
    if (!msg) return;
    setReplyTarget(toReplyPayload(msg));
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!isOpen || chatMode !== 'STAFF') return;
    if (unread > 0) {
      setUnread(0);
    }
    scrollToBottom();
  }, [isOpen, chatMode, unread, messages.length]);

  const handleBubbleClick = () => {
    if (isOpen) {
      closeChat();
      setShowMenu(false);
      return;
    }
    setShowMenu(!showMenu);
  };

  const handleMenuChoice = (choice) => {
    setShowMenu(false);
    if (choice === 'AI') {
      setChatMode('AI');
      setIsOpen(true);
      setUnread(0);
    } else if (choice === 'STAFF') {
      setChatMode('STAFF');
      openChat();
    } else if (choice === 'ZALO') {
      window.open('https://zalo.me/0789019902', '_blank');
    } else if (choice === 'CALL') {
      window.location.href = 'tel:0773670599';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '12px',
      }}
    >
      {isOpen && (
        <div
          style={{
            width: 'min(94vw, 400px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '28px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            boxShadow: '0 32px 64px -16px rgba(74, 55, 40, 0.28), 0 16px 32px -8px rgba(196, 18, 48, 0.08), 0 0 0 1px rgba(74, 55, 40, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            overflow: 'hidden',
            height: 'min(80vh, 700px)',
            minHeight: '540px',
            animation: 'chatBoxOpen 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: isAiMode
                ? 'linear-gradient(135deg, #8a0b1f 0%, #b3102a 40%, #d92b45 100%)'
                : 'linear-gradient(135deg, #7a0a1b 0%, #c41230 45%, #e0334d 100%)',
              borderBottom: '2px solid rgba(230, 69, 96, 0.35)',
              boxShadow: '0 4px 20px rgba(196, 18, 48, 0.2), inset 0 -1px 0 rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative shimmer */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '200%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
              animation: 'headerShimmer 4s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
              {/* Avatar icon */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1.5px solid rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0,
              }}>
                {chatMode === 'AI' ? '☕' : '👋'}
              </div>
              <div>
                <p style={{ margin: 0, color: '#ffffff', fontWeight: 800, fontSize: '0.92rem', letterSpacing: '0.3px' }}>
                  {chatMode === 'AI' ? 'Trợ lý Avengers Coffee' : 'Tư vấn viên'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span className="status-dot" />
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: '0.7rem', fontWeight: 600 }}>
                    {chatMode === 'AI' ? 'Luôn sẵn sàng hỗ trợ bạn' : 'Đang trực tuyến'}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={closeChat}
              className="chat-close-btn"
              style={{
                all: 'unset',
                cursor: 'pointer',
                color: '#fff',
                width: 32,
                height: 32,
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.12)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)';
                e.currentTarget.style.transform = 'rotate(90deg) scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'rotate(0deg) scale(1)';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                gap: '12px',
                background: '#faf7f3',
              }}
            >
              <div style={{ position: 'relative', width: 40, height: 40 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: '3px solid #f4f0eb',
                    borderTopColor: '#c41230',
                    borderRadius: '50%',
                    animation: 'chat-spin 0.8s cubic-bezier(0.5, 0, 0.5, 1) infinite',
                  }}
                />
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#9a8c7e', fontWeight: 700 }}>Đang kết nối...</p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                className="chat-messages-scroll"
                style={{
                  flex: '1 1 0',
                  overflowY: 'auto',
                  padding: '16px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  minHeight: '60px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #faf7f3 0%, #f5f0e8 100%)',
                }}
              >
                {messages.length === 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '48px 20px',
                    gap: '12px',
                    animation: 'fadeInUp 0.5s ease-out',
                  }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: isAiMode
                        ? 'linear-gradient(135deg, rgba(200, 154, 88, 0.12), rgba(200, 154, 88, 0.06))'
                        : 'linear-gradient(135deg, rgba(196, 18, 48, 0.1), rgba(196, 18, 48, 0.04))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                    }}>
                      {isAiMode ? '☕' : '💬'}
                    </div>
                    <p style={{
                      margin: 0,
                      color: '#9a8c7e',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}>
                      {isAiMode ? 'Hỏi mình bất cứ điều gì về menu nhé!' : 'Nhắn tin để được hỗ trợ nhé!'}
                    </p>
                    <p style={{
                      margin: 0,
                      color: '#b8aa9c',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}>
                      {isAiMode ? 'Giá cả • Khuyến mãi • Đặt hàng' : 'Nhân viên sẽ phản hồi sớm nhất'}
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-end',
                      gap: '8px',
                    }}
                  >
                    {msg.vai_tro_nguoi_gui !== 'CUSTOMER' && (
                      <div
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '10px',
                          background: msg.vai_tro_nguoi_gui === 'AI'
                            ? 'linear-gradient(135deg, #c89a58, #b08543)'
                            : 'linear-gradient(135deg, #c41230, #a30f28)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          boxShadow: msg.vai_tro_nguoi_gui === 'AI'
                            ? '0 3px 10px rgba(200, 154, 88, 0.25)'
                            : '0 3px 10px rgba(196, 18, 48, 0.2)',
                          flexShrink: 0,
                          marginBottom: '4px',
                        }}
                      >
                        {msg.vai_tro_nguoi_gui === 'AI' ? '☕' : '👤'}
                      </div>
                    )}
                    <div
                      style={{
                        maxWidth: '78%',
                        borderRadius: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                          ? '18px 18px 4px 18px'
                          : '18px 18px 18px 4px',
                        padding: '10px 14px 8px',
                        fontSize: '0.85rem',
                        background: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                          ? (isAiMode ? 'linear-gradient(135deg, #c89a58 0%, #b08543 100%)' : 'linear-gradient(135deg, #c41230 0%, #a30f28 100%)')
                          : '#ffffff',
                        color: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '#fff' : '#2d2118',
                        border: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                          ? 'none'
                          : '1px solid rgba(74, 55, 40, 0.08)',
                        boxShadow: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                          ? (isAiMode
                            ? '0 4px 16px rgba(200, 154, 88, 0.2)'
                            : '0 4px 16px rgba(196, 18, 48, 0.18)')
                          : '0 2px 8px rgba(74, 55, 40, 0.04), 0 0 0 1px rgba(74, 55, 40, 0.02)',
                        animation: 'msgSlideIn 0.25s ease-out',
                      }}
                    >
                      {msg.vai_tro_nguoi_gui !== 'CUSTOMER' && (
                        <p
                          style={{
                            margin: '0 0 4px',
                            fontSize: '0.68rem',
                            fontWeight: 900,
                            color: msg.vai_tro_nguoi_gui === 'AI' ? '#c89a58' : '#c41230',
                            letterSpacing: '0.3px',
                          }}
                        >
                          {msg.ten_nguoi_gui || (msg.vai_tro_nguoi_gui === 'AI' ? 'Trợ lý AI' : 'Nhân viên')}
                        </p>
                      )}
                      {msg.reply_to && (
                        <div
                          style={{
                            borderLeft: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '3px solid rgba(255,255,255,0.85)' : (isAiMode ? '3px solid #c89a58' : '3px solid #c41230'),
                            background: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'rgba(255,255,255,0.18)' : '#fdfaf5',
                            borderRadius: 8,
                            padding: '6px 8px',
                            marginBottom: 6,
                          }}
                        >
                          <p style={{ margin: 0, fontSize: '0.67rem', fontWeight: 800, opacity: 0.92 }}>
                            {msg.reply_to.sender || 'Tin nhắn được phản hồi'}
                          </p>
                          <p
                            style={{
                              margin: '2px 0 0',
                              fontSize: '0.72rem',
                              lineHeight: 1.3,
                              opacity: 0.92,
                              maxHeight: 34,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {msg.reply_to.content}
                          </p>
                        </div>
                      )}
                      <p
                        style={{
                          margin: 0,
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.noi_dung}
                      </p>
                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <span style={{ fontSize: '0.65rem', opacity: 0.82 }}>
                          {formatTime(msg.ngay_tao)}
                        </span>
                        <button
                          type="button"
                          onClick={() => pickReply(msg)}
                          className="reply-btn-hover"
                          style={{
                            all: 'unset',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'rgba(255,255,255,0.85)' : (isAiMode ? '#c89a58' : '#c41230'),
                            padding: '2px 6px',
                            borderRadius: '6px',
                            transition: 'all 0.2s',
                          }}
                        >
                          ↩ Trả lời
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div
                style={{
                  borderTop: '1px solid rgba(74, 55, 40, 0.06)',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  padding: '10px 10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {replyTarget && (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: 10,
                      border: '1px solid #f2e6d6',
                      background: '#faf6f0',
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: '#c41230', fontWeight: 800 }}>
                        Đang reply: {replyTarget.sender || 'Tin nhắn'}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: '0.72rem',
                          color: '#4a3728',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {replyTarget.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        color: '#c41230',
                        fontWeight: 900,
                        fontSize: '0.78rem',
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%' }}>
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={chatMode === 'AI' ? 'Hỏi AI về menu, giá, khuyến mãi...' : 'Nhắn tin cho nhân viên...'}
                    rows={1}
                    className="chat-input-textarea"
                    style={{
                      flex: 1,
                      resize: 'none',
                      borderRadius: '22px',
                      border: '1.5px solid rgba(74, 55, 40, 0.1)',
                      background: '#f8f5f0',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      minHeight: '42px',
                      maxHeight: '110px',
                      outline: 'none',
                      color: '#2d2118',
                      '--focus-color': isAiMode ? '#c89a58' : '#c41230',
                      '--focus-glow': isAiMode ? 'rgba(200, 154, 88, 0.18)' : 'rgba(196, 18, 48, 0.18)',
                      transition: 'all 0.2s ease',
                    }}
                  />

                  {/* Voice button — AI mode only, uses Web Speech API */}
                  {isAiMode && (
                    <button
                      onClick={startVoice}
                      disabled={isListening || sending}
                      title="Đặt hàng bằng giọng nói (Chrome)"
                      style={{
                        all: 'unset',
                        cursor: isListening ? 'not-allowed' : 'pointer',
                        width: 42,
                        height: 42,
                        borderRadius: '14px',
                        background: isListening
                          ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                          : 'linear-gradient(135deg,#c89a58,#b08543)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: isListening
                          ? '0 0 0 4px rgba(239,68,68,0.25), 0 4px 12px rgba(239,68,68,0.2)'
                          : '0 4px 14px rgba(200,154,88,0.3)',
                        animation: isListening ? 'micPulse 1s ease-in-out infinite' : 'none',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      {isListening ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                      )}
                    </button>
                  )}

                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || sending}
                    style={{
                      all: 'unset',
                      cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer',
                      background: isAiMode
                        ? 'linear-gradient(135deg, #c89a58, #b08543)'
                        : 'linear-gradient(135deg, #c41230, #a30f28)',
                      color: '#fff',
                      borderRadius: '14px',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: !inputText.trim() || sending ? 0.4 : 1,
                      flexShrink: 0,
                      boxShadow: !inputText.trim() || sending
                        ? 'none'
                        : (isAiMode ? '0 4px 14px rgba(200,154,88,0.3)' : '0 4px 14px rgba(196,18,48,0.25)'),
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: sending ? 'scale(0.92)' : 'scale(1)',
                    }}
                    className="chat-send-btn"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>

                  {/* Order Confirmation Card */}
                  {pendingOrder && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      margin: '0 8px 8px',
                      background: '#fff',
                      borderRadius: 16,
                      border: '1.5px solid #c89a5840',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      overflow: 'hidden',
                      zIndex: 10,
                    }}>
                      <div style={{ background: 'linear-gradient(90deg,#c89a58,#b28547)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🎙️</span>
                        <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đặt hàng bằng giọng nói</span>
                      </div>
                      {pendingOrder.transcript && (
                        <div style={{ padding: '6px 14px', background: '#faf6f0', fontSize: '0.75rem', color: '#888', fontStyle: 'italic' }}>
                          🗣 "{pendingOrder.transcript}"
                        </div>
                      )}
                      {pendingOrder.message && (
                        <div style={{ padding: '6px 14px 2px', fontSize: '0.82rem', fontWeight: 700, color: '#333' }}>{pendingOrder.message}</div>
                      )}
                      <div style={{ padding: '6px 14px 8px' }}>
                        {pendingOrder.items.filter(i => i.matched).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #f4f0eb' }}>
                            <div>
                              <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>x{item.quantity} {item.product_name}</span>
                              {item.note && <span style={{ fontSize: '0.72rem', color: '#888', marginLeft: 4 }}>({item.note})</span>}
                            </div>
                            <span style={{ fontWeight: 900, color: '#c41230', fontSize: '0.82rem' }}>{Number(item.subtotal || 0).toLocaleString('vi-VN')}đ</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '2px solid #f4f0eb' }}>
                          <span style={{ fontWeight: 900, fontSize: '0.85rem' }}>Tổng cộng</span>
                          <span style={{ fontWeight: 900, color: '#c41230', fontSize: '0.9rem' }}>{Number(pendingOrder.total || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setPendingOrder(null)} style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', borderRadius: 999, background: '#f4f0eb', color: '#555', fontWeight: 700, fontSize: '0.78rem' }}>Bỏ qua</button>
                        <button
                          onClick={handleConfirmOrder}
                          disabled={orderLoading}
                          style={{ all: 'unset', cursor: orderLoading ? 'not-allowed' : 'pointer', padding: '6px 16px', borderRadius: 999, background: 'linear-gradient(90deg,#c41230,#a30f28)', color: '#fff', fontWeight: 900, fontSize: '0.78rem', opacity: orderLoading ? 0.7 : 1 }}
                        >
                          {orderLoading ? 'Đang đặt...' : '🛒 Đặt ngay'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Menu */}
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '78px',
            right: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {[
            { name: 'Trợ lý ảo AI', icon: '☕', key: 'AI', color: '#c89a58', desc: 'Hỏi đáp thông minh' },
            { name: 'Tư vấn viên', icon: '👋', key: 'STAFF', color: '#c41230', desc: 'Chat với nhân viên' },
            { name: 'Chat Zalo', icon: '💬', key: 'ZALO', color: '#0ea5e9', desc: 'Nhắn qua Zalo' },
            { name: 'Gọi điện', icon: '📞', key: 'CALL', color: '#4a3728', desc: 'Hotline hỗ trợ' },
          ].map((item, idx) => (
            <button
              key={item.key}
              onClick={() => handleMenuChoice(item.key)}
              className="chat-menu-item"
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#2d2118',
                fontSize: '0.85rem',
                fontWeight: 800,
                border: '1px solid rgba(74, 55, 40, 0.06)',
                boxShadow: '0 4px 16px rgba(74, 55, 40, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
                animation: `menuItemIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.06}s both`,
                fontFamily: "'Nunito', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateX(-4px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(74, 55, 40, 0.14), 0 2px 6px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateX(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(74, 55, 40, 0.08), 0 1px 3px rgba(0,0,0,0.04)';
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  background: `linear-gradient(135deg, ${item.color}, ${item.color}dd)`,
                  color: '#fff',
                  boxShadow: `0 3px 8px ${item.color}30`,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <div>
                <span style={{ display: 'block', lineHeight: 1.2 }}>{item.name}</span>
                <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: '#9a8c7e', marginTop: 1 }}>{item.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={handleBubbleClick}
        className={`chat-bubble-fab ${isOpen ? 'open-state' : ''}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '62px',
          height: '62px',
          borderRadius: '20px',
          background: isOpen
            ? 'linear-gradient(135deg, #8a0b1f, #6b0918)'
            : 'linear-gradient(135deg, #c41230 0%, #e0334d 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isOpen
            ? '0 8px 24px rgba(196, 18, 48, 0.25)'
            : '0 8px 28px rgba(196, 18, 48, 0.35), 0 2px 8px rgba(196, 18, 48, 0.15)',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
        }}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '22px', height: '22px', transition: 'transform 0.3s' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '26px', height: '26px', transition: 'transform 0.3s' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 6 6 0 001.257-2.909C3.125 15.642 2 13.931 2 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        )}
        {!isOpen && unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              padding: '0 5px',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 900,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.45)',
              border: '2px solid #fff',
              animation: 'unreadBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <style>{`
        @keyframes chat-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatBoxOpen {
          from { opacity: 0; transform: translateY(20px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes msgSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes menuItemIn {
          from { opacity: 0; transform: translateX(16px) scale(0.92); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes headerShimmer {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(50%); }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.35); }
          50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        }
        @keyframes pulseStatus {
          0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
          70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
          100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @keyframes bubblePulse {
          0% { box-shadow: 0 8px 28px rgba(196, 18, 48, 0.35), 0 0 0 0 rgba(196, 18, 48, 0.25); }
          70% { box-shadow: 0 8px 28px rgba(196, 18, 48, 0.35), 0 0 0 10px rgba(196, 18, 48, 0); }
          100% { box-shadow: 0 8px 28px rgba(196, 18, 48, 0.35), 0 0 0 0 rgba(196, 18, 48, 0); }
        }
        @keyframes unreadBounce {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          display: inline-block;
          animation: pulseStatus 2s infinite ease-in-out;
        }
        .chat-bubble-fab {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chat-bubble-fab:hover {
          transform: scale(1.06) rotate(3deg);
        }
        .chat-bubble-fab:active {
          transform: scale(0.94);
        }
        .chat-bubble-fab:not(.open-state) {
          animation: bubblePulse 3s infinite;
        }
        .chat-input-textarea {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chat-input-textarea::placeholder {
          color: #b8aa9c;
          font-weight: 600;
        }
        .chat-input-textarea:focus {
          background: #ffffff !important;
          box-shadow: 0 0 0 3px var(--focus-glow) !important;
          border-color: var(--focus-color) !important;
        }
        .chat-send-btn {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chat-send-btn:hover:not(:disabled) {
          transform: scale(1.06);
        }
        .chat-send-btn:active:not(:disabled) {
          transform: scale(0.93);
        }
        .reply-btn-hover:hover {
          background: rgba(0, 0, 0, 0.04);
        }
        .chat-messages-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .chat-messages-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-messages-scroll::-webkit-scrollbar-thumb {
          background: rgba(74, 55, 40, 0.15);
          border-radius: 4px;
        }
        .chat-messages-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(74, 55, 40, 0.25);
        }
      `}</style>
    </div>
  );
}
