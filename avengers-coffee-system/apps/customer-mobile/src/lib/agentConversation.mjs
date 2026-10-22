import { selectAgentTurn, agentTurnFailure } from '../../../web-customer/src/components/chat/agentTurn.js'
import { agentProducts, pendingCheckout, isCheckoutConfirmation } from '../../../web-customer/src/components/chat/agentContract.js'
import { qrPaymentFromCheckout } from '../../../web-customer/src/components/chat/chatWidgetActions.js'
import { walletTopupRequest, createWalletTopup, latestWalletTopupOffer, latestWalletTopup } from '../../../web-customer/src/components/wallet/walletTopup.js'

// No intent inference here: the same Agent owns products/options/cart/checkout as web.
export function createAgentConversation({ client, storage, owner, createId, onChange = () => {}, onMutation = () => {}, navigate = () => {} }) {
  const key = `avengers_mobile_agent_v1:${owner}`
  let state = { conversationId: createId(), messages: [], pendingTurn: null, pendingOrder: null }
  let busy = false, listener = onChange
  const config = () => ({ timeout: 120000, ...(String(owner).startsWith('anon-') ? { headers: { 'x-guest-session-id': owner } } : {}) })
  const publish = () => listener({ ...state, messages: [...state.messages], busy })
  const persist = () => storage.setItem(key, JSON.stringify(state))
  const append = (text, extras = {}, role = 'ai') => {
    state.messages.push({ id: createId(), role, text, time: new Date().toISOString(), ...extras })
    publish()
  }
  const effects = async logs => {
    const confirmed = logs.some(t => t.tool === 'confirm_checkout' && ['success', 'already_processed'].includes(t.result?.status))
    if (confirmed) state.pendingOrder = null
    await onMutation(logs)
    return confirmed
  }
  const checkout = async () => {
    const pending = state.pendingOrder
    if (!pending?.paymentMethod || !pending.deliveryType || !pending.actionId) throw new Error('Thiếu thông tin xác nhận đơn. Hãy yêu cầu tóm tắt đơn mới.')
    const response = await client.post(`/ai/cart/checkout?conversation_id=${encodeURIComponent(state.conversationId)}`, {
      session_id: owner, payment_method: pending.paymentMethod, delivery_type: pending.deliveryType,
      delivery_address: pending.deliveryAddress, action_id: pending.actionId,
    }, config())
    const data = response?.data || response
    if (data.status === 'insufficient_wallet') {
      state.pendingOrder = null
      append(data.message, { paymentOptions: data.payment_options || [], _walletTopupOffer: data.wallet_topup ? { ...data.wallet_topup, userId: owner } : null })
      return
    }
    if (!['success', 'already_processed'].includes(data.status)) throw new Error(data.message || 'Đơn hàng chưa được tạo.')
    await effects([{ tool: 'confirm_checkout', result: data }])
    append(data.message || `Đơn hàng đã được ghi nhận. Mã đơn: **${data.order_id}**. Tổng cộng: **${Number(data.total_price ?? pending.total).toLocaleString('vi-VN')}đ**.`, {
      paymentUrl: data.redirect_url, qrPayment: qrPaymentFromCheckout(data, pending, owner), _walletTopupOffer: null,
    })
  }
  return {
    setListener: next => { listener = next || (() => {}) },
    snapshot: () => ({ ...state, messages: [...state.messages], busy }),
    async price(productName) {
      const response = await client.post('/ai/agent/product/price', {
        session_id: owner, conversation_id: state.conversationId, product_name: productName, quantity: 1, size: null,
      }, config())
      return response?.data || response
    },
    async load(greeting) {
      let saved
      try { saved = JSON.parse(await storage.getItem(key) || 'null') } catch { saved = null }
      if (saved?.conversationId && Array.isArray(saved.messages)) state = { ...state, ...saved }
      if (!state.messages.length) append(greeting)
      publish()
    },
    async send(text, selectedProductId = null, catalog = [], uiAction = null) {
      if (busy || !String(text).trim()) return
      busy = true
      let phase = 'request', turn, previousTurn = state.pendingTurn
      const history = state.messages.filter(m => !m.retryError).slice(-8)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || '' })).filter(m => m.content)
      append(text, {}, 'user')
      try {
        if (!uiAction && state.pendingOrder && isCheckoutConfirmation(text)) {
          await checkout()
        } else if (!text.toLowerCase().includes('thêm') && /(xem giỏ hàng|vào giỏ hàng|trang giỏ hàng|mở giỏ hàng)/i.test(text)) {
          append('🛒 Đang chuyển bạn đến trang giỏ hàng...'); navigate('Cart')
        } else {
          const topup = walletTopupRequest(text, latestWalletTopupOffer(state.messages, owner))
          if (topup) {
            if (topup.error) append(topup.error)
            else if (topup.amount == null) append('Bạn muốn nạp bao nhiêu vào ví?')
            else if (latestWalletTopup(state.messages, owner)) append('Bạn đang có giao dịch nạp ví chờ thanh toán. Hãy hoàn tất hoặc kiểm tra giao dịch đó trước.')
            else {
              const payment = await createWalletTopup(client, owner, topup.amount)
              append('Mở trang thanh toán để nạp ví. Số dư chỉ thay đổi sau khi ngân hàng xác nhận.', { _walletTopup: payment })
            }
          } else {
            turn = selectAgentTurn(previousTurn, { text, selectedProductId, uiAction, sessionId: owner, conversationId: state.conversationId }, createId)
            state.pendingTurn = turn
            // Persist the ID before sending so a lost response/remount cannot duplicate a mutation.
            await persist()
            const response = await client.post('/ai/agent/chat', {
              session_id: owner, conversation_id: state.conversationId, client_message_id: turn.id,
              message: text, selected_product_id: selectedProductId || null, history,
              ...(uiAction ? { ui_action: uiAction } : {}),
            }, config())
            phase = 'response_processing'
            const data = response?.data || response
            if (typeof data?.reply !== 'string' || !data.reply) throw new Error('Invalid agent response')
            if (data.conversation_id) state.conversationId = data.conversation_id
            const logs = data.tool_calls_log || [], payload = data.ui_payload || {}
            if (payload.product_configuration) state.productConfiguration = payload.product_configuration
            if (payload.product_selection_snapshot) state.selectionSnapshot = payload.product_selection_snapshot
            const confirmed = await effects(logs)
            const cart = payload.cart
            if (cart && !cart.checkout_prefs?.summary_fingerprint && !cart.checkout_prefs?.checkout_submission) state.pendingOrder = null
            const pending = pendingCheckout(data.checkout_payload, data.reply)
            if (pending) state.pendingOrder = pending
            const checkoutResult = logs.find(t => t.tool === 'confirm_checkout' && ['success', 'already_processed'].includes(t.result?.status))?.result
            const qrPayment = payload.qr_payment || checkoutResult?.payment_method === 'NGAN_HANG_QR'
              ? qrPaymentFromCheckout(checkoutResult || { payment_details: payload.qr_payment }, { paymentMethod: 'NGAN_HANG_QR', total: checkoutResult?.total_price }, owner) : null
            const blocked = data.error?.startsWith('blocked:')
            append(data.reply, blocked ? {} : {
              products: pending ? [] : agentProducts(payload, catalog), selectionSnapshot: payload.product_selection_snapshot, stores: payload.branches || [],
              vouchers: confirmed ? [] : payload.vouchers || [], orders: payload.orders || data.orders || [],
              paymentOptions: payload.payment_options || [], loginAction: payload.login_action,
              _walletTopupOffer: payload.wallet_topup ? { ...payload.wallet_topup, userId: owner } : null,
              qrPayment, paymentUrl: checkoutResult?.redirect_url,
            })
            state.pendingTurn = null
            state.lastError = data.error || null
          }
        }
        await persist()
      } catch (error) {
        const code = error?.response?.data?.detail?.code
        state.lastError = code || 'request_failed'
        const blocked = ['TURN_IN_PROGRESS', 'TURN_OUTCOME_UNKNOWN'].includes(code)
        if (blocked && previousTurn && previousTurn.id !== turn?.id) state.pendingTurn = previousTurn
        append(blocked ? 'Lượt chat trước chưa hoàn tất. Bạn gửi lại đúng tin nhắn trước để kiểm tra kết quả rồi hãy gửi tin mới.'
          : turn ? agentTurnFailure(phase, error?.response?.status).message : error.message || 'Chưa thể hoàn tất. Bạn hãy thử lại.', { retryError: true })
        // Do not log axios errors: they can contain bearer tokens and request bodies.
        console.warn('[MobileAgentTurn]', { phase, status: error?.response?.status || null, code: code || null })
        await persist().catch(() => {})
      } finally { busy = false; publish() }
    },
    async confirm() { return this.send('Xác nhận đặt hàng') },
    async resolvePayment(extras, text) { append(text, extras); await persist() },
    async reset(greeting) {
      if (busy) return
      busy = true; publish()
      try {
        const next = createId()
        await client.post('/ai/agent/conversation/reset', { session_id: owner, conversation_id: next, previous_conversation_id: state.conversationId }, config())
        // Keep unresolved payment receipts visible across a draft reset, as on web.
        const receipts = state.messages.filter(m => m.qrPayment || m._walletTopup || m._walletTopupResolved || m.qrResolved)
        state = { conversationId: next, messages: [], pendingTurn: null, pendingOrder: null, productConfiguration: null, selectionSnapshot: null }
        append(greeting); state.messages.push(...receipts); await persist()
      } catch { append('Chưa thể bắt đầu hội thoại mới. Bạn hãy thử lại.') }
      finally { busy = false; publish() }
    },
  }
}
