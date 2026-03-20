import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiClient } from '../lib/apiClient';

function getOrCreateGuestChatId() {
  const storageKey = 'avengers_guest_chat_id';
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const created = `guest-chat-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  sessionStorage.setItem(storageKey, created);
  return created;
}

export default function ChatWidget({ user, socketUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chatMode, setChatMode] = useState('STAFF'); // 'STAFF' | 'AI'
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const isOpenRef = useRef(false);
  const textareaRef = useRef(null);

  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const userName = user?.ho_ten || user?.hoTen || user?.tenDangNhap || user?.email || 'Khách';
  const guestChatIdRef = useRef(null);

  if (!guestChatIdRef.current) {
    guestChatIdRef.current = getOrCreateGuestChatId();
  }

  const aiUserId = userId || guestChatIdRef.current;
  const staffChatUserId = userId || guestChatIdRef.current;

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
    growTextarea();
  }, [inputText]);

  useEffect(() => {
    if (!userId) return undefined;

    const socket = io(`${socketUrl}/chat`, {
      transports: ['websocket'],
      auth: { userId, role: 'CUSTOMER' },
    });

    socket.emit('chat:subscribe', { userId, role: 'CUSTOMER' });

    socket.on('chat:message:new', (msg) => {
      const normalized = normalizeMessage(msg);
      setMessages((prev) => (prev.some((m) => String(m.id) === String(normalized.id)) ? prev : [...prev, normalized]));
      if (normalized.vai_tro_nguoi_gui !== 'CUSTOMER' && !isOpenRef.current) {
        setUnread((n) => n + 1);
      }
      scrollToBottom();
    });

    socket.on('chat:conversation:update', (conv) => {
      if (conv.ma_khach_hang === userId) {
        setConversation(conv);
      }
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, socketUrl]);

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
        setMessages((msgsRes.data.items || []).map((item) => normalizeMessage(item)));
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
      setMessages((prev) => [...prev, customerMessage]);
      scrollToBottom();
      try {
        const res = await apiClient.post('/ai/chat', {
          user_id: aiUserId,
          user_name: userName,
          content,
          reply_to: replyPayload,
        });
        const aiMsg = normalizeMessage({
          id: `ai-${Date.now()}`,
          vai_tro_nguoi_gui: 'AI',
          ten_nguoi_gui: 'AI',
          noi_dung: res.data.reply || 'Xin lỗi, tôi chưa hiểu.',
          ngay_tao: new Date().toISOString(),
        });
        setMessages((prev) => [...prev, aiMsg]);
        scrollToBottom();
      } catch {
        setInputText(content);
        setMessages((prev) => prev.filter((item) => item.id !== customerMessage.id));
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
          setMessages((prev) => (prev.some((m) => String(m.id) === String(normalized.id)) ? prev : [...prev, normalized]));
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
        bottom: '24px',
        right: '24px',
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
            width: 'min(92vw, 360px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '24px',
            background: '#fff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            border: '1px solid #fde0be',
            overflow: 'hidden',
            height: 'min(76vh, 680px)',
            minHeight: '540px',
          }}
        >
          {/* Header */}
          <div
             style={{
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'space-between',
               padding: '12px 16px',
               background: chatMode === 'AI' 
                 ? 'linear-gradient(120deg, #6366f1, #8b5cf6)' 
                 : 'linear-gradient(120deg, #ea8025, #f5a54a)',
             }}
          >
            <div>
               <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: '0.9rem' }}>
                 {chatMode === 'AI' ? '🤖 Trợ lý ảo AI' : '👤 Tư vấn viên'}
               </p>
               <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', fontWeight: 600 }}>
                 {chatMode === 'AI' 
                   ? 'Hỏi về menu, giá, khuyến mãi' 
                   : 'Nhân viên sẽ phản hồi sớm nhất'}
               </p>
            </div>
            <button
              onClick={closeChat}
              style={{
                all: 'unset',
                cursor: 'pointer',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

           {loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  border: '3px solid #ea8025',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'chat-spin 0.7s linear infinite',
                }}
              />
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                style={{
                  flex: '1 1 0',
                  overflowY: 'auto',
                  padding: '14px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  minHeight: '60px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #fff9f2 0%, #fff 40%)',
                }}
              >
                {messages.length === 0 && (
                  <p
                    style={{
                      textAlign: 'center',
                      color: '#aaa',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '20px 0',
                      margin: 0,
                    }}
                  >
                    Nhắn tin để được hỗ trợ nhé!
                  </p>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        borderRadius: '18px',
                        borderBottomRightRadius: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '6px' : '18px',
                        borderBottomLeftRadius: msg.vai_tro_nguoi_gui !== 'CUSTOMER' ? '6px' : '18px',
                        padding: '10px 12px 8px',
                        fontSize: '0.875rem',
                         background: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                           ? (chatMode === 'AI' ? '#6366f1' : '#ea8025')
                           : (chatMode === 'AI' ? '#f0f4ff' : '#fff5ec'),
                         color: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '#fff' : '#333',
                         border: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                           ? 'none'
                           : (chatMode === 'AI' ? '1px solid #e0e7ff' : '1px solid #fde0be'),
                         boxShadow: msg.vai_tro_nguoi_gui === 'CUSTOMER'
                           ? (chatMode === 'AI'
                             ? '0 6px 16px rgba(99,102,241,0.26)'
                             : '0 6px 16px rgba(234,128,37,0.26)')
                           : '0 3px 12px rgba(0,0,0,0.06)',
                      }}
                    >
                      {msg.vai_tro_nguoi_gui !== 'CUSTOMER' && (
                        <p
                           style={{
                             margin: '0 0 2px',
                             fontSize: '0.65rem',
                             fontWeight: 900,
                             color: chatMode === 'AI' ? '#6366f1' : '#ea8025',
                           }}
                        >
                          {msg.ten_nguoi_gui || (msg.vai_tro_nguoi_gui === 'AI' ? 'Trợ lý AI' : 'Nhân viên')}
                        </p>
                      )}
                      {msg.reply_to && (
                        <div
                          style={{
                            borderLeft: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '3px solid rgba(255,255,255,0.82)' : '3px solid #f0b16f',
                            background: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'rgba(255,255,255,0.17)' : '#fff0df',
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
                          style={{
                            all: 'unset',
                            fontSize: '0.67rem',
                            cursor: 'pointer',
                            opacity: 0.9,
                            fontWeight: 700,
                          }}
                        >
                          Reply
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
                  borderTop: '1px solid #fde0be',
                  padding: '8px 8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {replyTarget && (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: 10,
                      border: '1px solid #f6c78f',
                      background: '#fff7ec',
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: '#a8550a', fontWeight: 800 }}>
                        Đang reply: {replyTarget.sender || 'Tin nhắn'}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: '0.72rem',
                          color: '#7c2d12',
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
                        color: '#b45309',
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
                    style={{
                      flex: 1,
                      resize: 'none',
                      borderRadius: '14px',
                      border: '1px solid #fde0be',
                      padding: '9px 12px',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      minHeight: '40px',
                      maxHeight: '110px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || sending}
                    style={{
                      all: 'unset',
                      cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer',
                       background: chatMode === 'AI' ? '#6366f1' : '#ea8025',
                      color: '#fff',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      fontWeight: 900,
                      fontFamily: 'inherit',
                      fontSize: '0.84rem',
                      opacity: !inputText.trim() || sending ? 0.45 : 1,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Gửi
                  </button>
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
            bottom: '80px',
            right: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          {[
            { name: 'Trợ lý ảo AI', icon: '🤖', key: 'AI', color: '#6366f1' },
            { name: 'Tư vấn viên', icon: '👤', key: 'STAFF', color: '#8b5cf6' },
            { name: 'Chat Zalo', icon: '💬', key: 'ZALO', color: '#0084ff' },
            { name: 'Gọi điện', icon: '☎️', key: 'CALL', color: '#ef4444' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => handleMenuChoice(item.key)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '16px',
                background: item.color,
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: '700',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={handleBubbleClick}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ea8025, #f5a54a)',
          color: '#fff',
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(234,128,37,0.4)',
          transition: 'transform 0.2s',
          position: 'relative',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 20,
              height: 20,
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 900,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
