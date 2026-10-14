export const SUPPORT_REPLIES = [
  'Chào bạn, cửa hàng có thể hỗ trợ gì cho bạn hôm nay?',
  'Bạn gửi giúp mình mã đơn hàng để cửa hàng kiểm tra nhé.',
  'Cảm ơn bạn đã chờ. Mình đang kiểm tra với đội ngũ cửa hàng.',
]
const id = row => String(row?.ma_hoi_thoai || '')
const human = row => row && row.vai_tro_nguoi_gui !== 'AI'
export function filteredConversations(rows, search, filter) {
  const needle = String(search).toLocaleLowerCase('vi-VN').trim()
  return rows.filter(row => (!needle || [row.ten_khach_hang, row.tin_nhan_cuoi, row.ma_khach_hang].some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(needle)))
    && (filter !== 'unread' || Number(row.so_tin_nhan_chua_doc_nhan_su) > 0)
    && (filter !== 'open' || row.trang_thai === 'OPEN'))
}
export function createStaffInbox({ client, userId, role, name, onChange = () => {} }) {
  let state = { conversations: [], selected: null, messages: [], drafts: {}, loading: false, loadingMessages: false, sending: false, error: '' }
  let epoch = 0, listEpoch = 0, alive = true, sending = false
  const unwrap = value => value?.data || value
  const query = `user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`
  const publish = () => alive && onChange({ ...state, conversations: [...state.conversations], messages: [...state.messages] })
  const update = conversation => {
    if (!conversation?.ma_hoi_thoai) return
    listEpoch++
    state.conversations = [conversation, ...state.conversations.filter(row => id(row) !== id(conversation))]
      .sort((a, b) => Date.parse(b.ngay_cap_nhat || b.ngay_tao || 0) - Date.parse(a.ngay_cap_nhat || a.ngay_tao || 0))
    if (id(state.selected) === id(conversation)) state.selected = conversation
  }
  const merge = rows => {
    const byId = new Map([...state.messages, ...rows].filter(human).map(row => [String(row.id), row]))
    state.messages = [...byId.values()].sort((a, b) => Date.parse(a.ngay_tao) - Date.parse(b.ngay_tao))
  }
  return {
    snapshot: () => state,
    dispose: () => { alive = false; epoch++ },
    setDraft(value) { if (!state.selected) return; state.drafts = { ...state.drafts, [id(state.selected)]: value }; publish() },
    async refresh() {
      const ticket = ++listEpoch
      state.loading = true; state.error = ''; publish()
      try { const data = unwrap(await client.get(`/chat/conversations?${query}`)); if (alive && listEpoch === ticket) state.conversations = data.items || [] }
      catch { if (alive) state.error = 'Chưa tải được danh sách hội thoại. Bạn thử tải lại nhé.' }
      finally { if (alive) { state.loading = false; publish() } }
    },
    async select(conversation) {
      const ticket = ++epoch
      if (id(state.selected) !== id(conversation)) state.messages = []
      state.selected = conversation; state.loadingMessages = !state.messages.length; state.error = ''; publish()
      try {
        const data = unwrap(await client.get(`/chat/conversations/${encodeURIComponent(id(conversation))}/messages?${query}`))
        if (!alive || epoch !== ticket) return
        merge((data.items || []).filter(row => !row.ma_hoi_thoai || id(row) === id(conversation)))
        const read = unwrap(await client.patch(`/chat/conversations/${encodeURIComponent(id(conversation))}/read`, { reader_user_id: userId, reader_role: role }))
        if (alive && epoch === ticket) update(read.conversation || read)
      } catch { if (alive && epoch === ticket) state.error = 'Chưa tải được tin nhắn. Các bản nháp vẫn được giữ lại.' }
      finally { if (alive && epoch === ticket) { state.loadingMessages = false; publish() } }
    },
    receiveMessage(message) { if (human(message) && id(message) === id(state.selected)) { merge([message]); publish() } },
    receiveConversation(conversation) { update(conversation); publish() },
    async send() {
      const conversationId = id(state.selected), content = (state.drafts[conversationId] || '').trim()
      if (!conversationId || !content || sending || state.loadingMessages) return
      sending = true; state.sending = true; state.error = ''; publish()
      try {
        const data = unwrap(await client.post(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
          sender_user_id: userId, sender_name: name, sender_role: role, content,
        }))
        if (!alive) return
        if (!data.message?.id) throw new Error('Missing server message')
        if (id(state.selected) === conversationId) merge([data.message])
        update(data.conversation)
        if (state.drafts[conversationId]?.trim() === content) state.drafts = { ...state.drafts, [conversationId]: '' }
      } catch { if (alive) state.error = 'Chưa gửi được tin nhắn. Nội dung vẫn ở ô nhập để bạn thử lại.' }
      finally { sending = false; if (alive) { state.sending = false; publish() } }
    },
  }
}
