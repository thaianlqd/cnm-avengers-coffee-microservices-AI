import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../constants';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';

export function AdminChatWidget({ session }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  const userId = session?.user?.maNguoiDung || session?.user?.ma_nguoi_dung || session?.user?.id || session?.user?.tenDangNhap || '';
  const userName = session?.user?.tenDangNhap || session?.user?.email || 'staff';
  const userRole = session?.user?.vaiTro || session?.user?.vai_tro || 'STAFF';

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  const calcTotalUnread = useCallback((convList) => {
    return convList.reduce((sum, c) => sum + Number(c.so_tin_nhan_chua_doc_nhan_su || 0), 0);
  }, []);

  useEffect(() => {
    if (!userId) return undefined;

    const socket = io(`${SOCKET_URL}/chat`, {
      transports: ['websocket'],
      auth: { userId, role: userRole },
    });

    socket.emit('chat:subscribe', { userId, role: userRole });

    socket.on('chat:message:new', (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      scrollToBottom();
    });

    socket.on('chat:conversation:update', (conv) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.ma_hoi_thoai === conv.ma_hoi_thoai);
        let next;
        if (idx >= 0) {
          next = prev.map((c, i) => (i === idx ? conv : c));
        } else {
          next = [conv, ...prev];
        }
        setTotalUnread(calcTotalUnread(next));
        return next;
      });
      setSelectedConv((prev) => (prev?.ma_hoi_thoai === conv.ma_hoi_thoai ? conv : prev));
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, userRole, calcTotalUnread]);

  useEffect(() => {
    if (selectedConv?.ma_hoi_thoai && socketRef.current) {
      socketRef.current.emit('chat:conversation:join', { conversationId: selectedConv.ma_hoi_thoai });
    }
  }, [selectedConv?.ma_hoi_thoai]);

  const fetchConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/conversations?user_id=${encodeURIComponent(userId)}&role=${userRole}`);
      const data = await res.json().catch(() => ({}));
      const items = data.items || [];
      setConversations(items);
      setTotalUnread(calcTotalUnread(items));
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [userId, userRole, calcTotalUnread]);

  const openWidget = () => {
    setIsOpen(true);
    setView('list');
    fetchConversations();
  };

  const openConversation = async (conv) => {
    setSelectedConv(conv);
    setView('detail');
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await fetch(
        `${API_BASE_URL}/chat/conversations/${conv.ma_hoi_thoai}/messages?user_id=${encodeURIComponent(userId)}&role=${userRole}`,
      );
      const data = await res.json().catch(() => ({}));
      setMessages(data.items || []);
      scrollToBottom();
      // mark as read
      await fetch(`${API_BASE_URL}/chat/conversations/${conv.ma_hoi_thoai}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reader_user_id: userId, reader_role: userRole }),
      });
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    const content = inputText.trim();
    if (!content || !selectedConv || sending) return;
    setSending(true);
    setInputText('');
    try {
      await fetch(`${API_BASE_URL}/chat/conversations/${selectedConv.ma_hoi_thoai}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_user_id: userId,
          sender_name: userName,
          sender_role: userRole,
          content,
        }),
      });
    } catch {
      setInputText(content);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (!session) return null;

  return (
    <div className="admin-chat-widget-root">
      {isOpen && (
        <div className="admin-chat-panel">
          {/* Panel header */}
          <div className="admin-chat-panel-header">
            <div>
              <p className="admin-chat-panel-title">Tin nhắn khách hàng 💬</p>
              <p className="admin-chat-panel-sub">{view === 'list' ? `${conversations.length} hội thoại` : selectedConv?.ten_khach_hang || 'Khách'}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {view === 'detail' && (
                <button className="admin-chat-back-btn" onClick={() => setView('list')}>← Quay lại</button>
              )}
              <button className="admin-chat-close-btn" onClick={() => setIsOpen(false)}>✕</button>
            </div>
          </div>

          {/* List view */}
          {view === 'list' && (
            <div className="admin-chat-list">
              {loadingList ? (
                <div className="admin-chat-loading"><div className="admin-chat-spinner" /></div>
              ) : conversations.length === 0 ? (
                <p className="admin-chat-empty">Chưa có hội thoại nào</p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.ma_hoi_thoai}
                    className={`admin-chat-conv-item ${conv.so_tin_nhan_chua_doc_nhan_su > 0 ? 'unread' : ''}`}
                    onClick={() => openConversation(conv)}
                    type="button"
                  >
                    <div className="admin-chat-conv-avatar">
                      {(conv.ten_khach_hang || 'K').charAt(0).toUpperCase()}
                    </div>
                    <div className="admin-chat-conv-info">
                      <div className="admin-chat-conv-name-row">
                        <span className="admin-chat-conv-name">{conv.ten_khach_hang || 'Khách'}</span>
                        {conv.so_tin_nhan_chua_doc_nhan_su > 0 && (
                          <span className="admin-chat-unread-badge">{conv.so_tin_nhan_chua_doc_nhan_su}</span>
                        )}
                      </div>
                      <p className="admin-chat-conv-preview">
                        {conv.vai_tro_nguoi_gui_cuoi && conv.vai_tro_nguoi_gui_cuoi !== 'CUSTOMER' ? 'Bạn: ' : ''}
                        {conv.tin_nhan_cuoi || 'Hội thoại mới'}
                      </p>
                    </div>
                    <span className={`admin-chat-status-dot ${conv.trang_thai === 'OPEN' ? 'open' : 'closed'}`} />
                  </button>
                ))
              )}
            </div>
          )}

          {/* Detail view */}
          {view === 'detail' && (
            <>
              <div className="admin-chat-messages">
                {loadingMessages ? (
                  <div className="admin-chat-loading"><div className="admin-chat-spinner" /></div>
                ) : messages.length === 0 ? (
                  <p className="admin-chat-empty">Chưa có tin nhắn</p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`admin-chat-msg-row ${msg.vai_tro_nguoi_gui === 'CUSTOMER' ? 'from-customer' : 'from-staff'}`}
                    >
                      <div className="admin-chat-bubble">
                        {msg.vai_tro_nguoi_gui === 'CUSTOMER' && (
                          <span className="admin-chat-bubble-sender">{msg.ten_nguoi_gui || 'Khách'}</span>
                        )}
                        <span className="admin-chat-bubble-text">{msg.noi_dung}</span>
                        <span className="admin-chat-bubble-time">{formatTime(msg.ngay_tao)}</span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
              <div className="admin-chat-input-row">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Nhắn tin cho khách..."
                  rows={1}
                  className="admin-chat-textarea"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!inputText.trim() || sending}
                  className="admin-chat-send-btn"
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
        type="button"
        className="admin-chat-bubble-btn"
        onClick={isOpen ? () => setIsOpen(false) : openWidget}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && totalUnread > 0 && (
          <span className="admin-chat-bubble-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>
        )}
      </button>
    </div>
  );
}
