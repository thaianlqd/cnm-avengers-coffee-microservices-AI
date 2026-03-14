import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiClient } from '../lib/apiClient';

export default function ChatWidget({ user, socketUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  const userId = user?.ma_nguoi_dung || user?.maNguoiDung || null;
  const userName = user?.ho_ten || user?.hoTen || user?.tenDangNhap || user?.email || 'Khách';

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  useEffect(() => {
    if (!userId) return undefined;

    const socket = io(`${socketUrl}/chat`, {
      transports: ['websocket'],
      auth: { userId, role: 'CUSTOMER' },
    });

    socket.emit('chat:subscribe', { userId, role: 'CUSTOMER' });

    socket.on('chat:message:new', (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.vai_tro_nguoi_gui !== 'CUSTOMER') {
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
    if (!userId) return;
    if (!conversation) {
      setLoading(true);
      try {
        const res = await apiClient.post('/chat/conversations/open', {
          customer_user_id: userId,
          customer_name: userName,
        });
        const conv = res.data.conversation;
        setConversation(conv);
        const msgsRes = await apiClient.get(
          `/chat/conversations/${conv.ma_hoi_thoai}/messages?user_id=${userId}&role=CUSTOMER`,
        );
        setMessages(msgsRes.data.items || []);
        scrollToBottom();
      } catch {
        // ignore errors silently
      } finally {
        setLoading(false);
      }
    } else {
      try {
        await apiClient.patch(`/chat/conversations/${conversation.ma_hoi_thoai}/read`, {
          reader_user_id: userId,
          reader_role: 'CUSTOMER',
        });
      } catch {
        // ignore
      }
      scrollToBottom();
    }
  };

  const closeChat = () => setIsOpen(false);

  const sendMessage = async () => {
    const content = inputText.trim();
    if (!content || !conversation || sending) return;
    setSending(true);
    setInputText('');
    try {
      await apiClient.post(`/chat/conversations/${conversation.ma_hoi_thoai}/messages`, {
        sender_user_id: userId,
        sender_name: userName,
        sender_role: 'CUSTOMER',
        content,
      });
    } catch {
      setInputText(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
              background: 'linear-gradient(120deg, #ea8025, #f5a54a)',
            }}
          >
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: '0.9rem' }}>
                Hỗ trợ Avengers ☕
              </p>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', fontWeight: 600 }}>
                Nhân viên sẽ phản hồi sớm nhất
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

          {!userId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: 0, color: '#888', fontSize: '0.875rem', fontWeight: 600 }}>
                Vui lòng{' '}
                <span style={{ color: '#ea8025', fontWeight: 900 }}>đăng nhập</span> để nhắn tin với nhân viên
              </p>
            </div>
          ) : loading ? (
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
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  minHeight: '60px',
                  height: '100%',
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
                    Nhắn tin để được hỗ trợ nhé! 😊
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
                        maxWidth: '76%',
                        borderRadius: '16px',
                        borderBottomRightRadius: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '4px' : '16px',
                        borderBottomLeftRadius: msg.vai_tro_nguoi_gui !== 'CUSTOMER' ? '4px' : '16px',
                        padding: '8px 12px',
                        fontSize: '0.875rem',
                        background: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '#ea8025' : '#fff5ec',
                        color: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? '#fff' : '#333',
                        border: msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'none' : '1px solid #fde0be',
                      }}
                    >
                      {msg.vai_tro_nguoi_gui !== 'CUSTOMER' && (
                        <p
                          style={{
                            margin: '0 0 2px',
                            fontSize: '0.65rem',
                            fontWeight: 900,
                            color: '#ea8025',
                          }}
                        >
                          {msg.ten_nguoi_gui || 'Nhân viên'}
                        </p>
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
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div
                style={{
                  borderTop: '1px solid #fde0be',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '6px',
                }}
              >
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhắn tin..."
                  rows={1}
                  style={{
                    flex: 1,
                    resize: 'none',
                    borderRadius: '12px',
                    border: '1px solid #fde0be',
                    padding: '8px 10px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    minHeight: '38px',
                    maxHeight: '90px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || sending}
                  style={{
                    all: 'unset',
                    cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer',
                    background: '#ea8025',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontWeight: 900,
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    opacity: !inputText.trim() || sending ? 0.45 : 1,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Gửi
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Bubble */}
      <button
        onClick={isOpen ? closeChat : openChat}
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
      `}</style>
    </div>
  );
}
