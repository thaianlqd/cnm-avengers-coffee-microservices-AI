import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentConversation } from '../src/lib/agentConversation.mjs'
import { agentProducts, pendingCheckout, isCheckoutConfirmation } from '../../web-customer/src/components/agentContract.js'

const cold = { product_id: '38', product_name: 'Cà Phê Sữa Đá', price: 39000 }
const hot = { product_id: '39', product_name: 'Cà Phê Sữa Nóng', price: 39000 }
function fixture(owner = 'anon-fixture', storageMap = new Map()) {
  let seq = 0
  const calls = [], mutations = [], navigation = [], steps = []
  const storage = { getItem: async key => storageMap.get(key), setItem: async (key, value) => storageMap.set(key, value) }
  const client = { post: async (...args) => {
    calls.push(args)
    const step = steps.shift()
    if (step instanceof Error) throw step
    return typeof step === 'function' ? step(...args) : step || { reply: 'Dạ.' }
  } }
  const controller = createAgentConversation({ client, storage, owner, createId: () => `${owner}-${++seq}`,
    onMutation: logs => mutations.push(logs), navigate: screen => navigation.push(screen) })
  return { controller, calls, steps, mutations, navigation, storageMap }
}
const summary = { items: [{ product_id: '39', product_name: hot.product_name, quantity: 1, unit_price: 39000, size: 'Vừa' }],
  final_total: 39000, payment_method: 'TIEN_MAT', delivery_type: 'TAI_QUAN', branch_id: 1, branch_name: 'Highlands', action_id: 'checkout-once' }

test('reported milk-coffee conversation keeps exact two cards, item 2 and full optional menu', async () => {
  const f = fixture(); await f.controller.load('Xin chào')
  f.steps.push({ reply: '1. **Cà Phê Sữa Đá**\n2. **Cà Phê Sữa Nóng**', ui_payload: { products: [cold, hot] } })
  await f.controller.send('hello cho tôi mua cà phê sữa đi', null, [{ ma_san_pham: '39', hinh_anh_url: 'hot.png' }, { ma_san_pham: '1', ten_san_pham: 'Cà Phê Muối' }])
  assert.equal(f.calls[0][0], '/ai/agent/chat')
  assert.equal(f.calls[0][1].message, 'hello cho tôi mua cà phê sữa đi')
  assert.equal(f.calls[0][2].headers['x-guest-session-id'], 'anon-fixture')
  const first = f.controller.snapshot().messages.at(-1)
  assert.deepEqual(first.products.map(p => p.product_id), ['38', '39'])
  assert.equal(first.products[1].hinh_anh_url, 'hot.png')
  const reply = 'Chưa vào giỏ. **Cà Phê Sữa Nóng**\n- **Kích thước**: Vừa\n- **Topping**: Hạt Sen, Sữa Đặc\n- **Độ ngọt**: Bình thường\nBạn có thể nói **theo mặc định**.'
  f.steps.push({ reply, ui_payload: { products: [] } })
  await f.controller.send('cho tôi món số 2 đi bạn ơi')
  assert.equal(f.calls[1][1].conversation_id, f.calls[0][1].conversation_id)
  assert(f.calls[1][1].history.some(m => m.content.includes('Cà Phê Sữa Nóng')))
  assert.equal(f.controller.snapshot().messages.at(-1).text, reply)
  assert.equal(f.controller.snapshot().pendingOrder, null)
  assert.equal(f.calls.filter(c => c[0] === '/cart').length, 0)
})

test('timeout then remount and retry uses same durable ID with no legacy fallback', async () => {
  const f = fixture(); await f.controller.load('Hello'); f.steps.push(new Error('timeout'))
  await f.controller.send('món số 2')
  const retryId = f.calls[0][1].client_message_id
  const reopened = fixture('anon-fixture', f.storageMap)
  await reopened.controller.load('Hello'); reopened.steps.push({ reply: 'Đã lấy lại kết quả.' })
  await reopened.controller.send('món số 2')
  assert.equal(reopened.calls[0][1].client_message_id, retryId)
  assert.equal(reopened.controller.snapshot().pendingTurn, null)
  assert(!reopened.calls.some(c => ['/ai/chat', '/ai/chat/order-intent'].includes(c[0])))
})

test('HTTP success with invalid UI response preserves retry ID and cards', async () => {
  const f = fixture(); await f.controller.load('Hello')
  f.steps.push({ reply: 'Chọn món', ui_payload: { products: [cold, hot] } }, { no_reply: true })
  await f.controller.send('cà phê sữa'); await f.controller.send('món 2')
  const snapshot = f.controller.snapshot()
  assert.equal(snapshot.messages.find(m => m.products?.length)?.products[1].product_id, '39')
  assert.equal(snapshot.pendingTurn.id, f.calls[1][1].client_message_id)
  assert.match(snapshot.messages.at(-1).text, /đã nhận kết quả/)
})

test('new message blocked by unresolved prior turn restores the original retry identity', async () => {
  const f = fixture(); await f.controller.load('Hello'); f.steps.push(new Error('timeout'))
  await f.controller.send('món 2')
  const firstId = f.controller.snapshot().pendingTurn.id
  const conflict = Object.assign(new Error('busy'), { response: { status: 409, data: { detail: { code: 'TURN_IN_PROGRESS' } } } })
  f.steps.push(conflict); await f.controller.send('món 1')
  assert.equal(f.controller.snapshot().pendingTurn.id, firstId)
})

test('product plus sends canonical ID; prose alone never produces invented cards or orders', async () => {
  const f = fixture(); await f.controller.load('Hello')
  f.steps.push({ reply: 'Đang chọn tùy chọn', ui_payload: {} })
  await f.controller.send('Thêm Cà Phê Sữa Nóng vào giỏ', '39', [cold, hot])
  assert.equal(f.calls[0][1].selected_product_id, '39')
  assert.deepEqual(f.controller.snapshot().messages.at(-1).products, [])
  assert.equal(f.controller.snapshot().pendingOrder, null)
})

test('checkout requires server summary; typed confirmation uses same scoped action and duplicate tap is ignored', async () => {
  const f = fixture('customer'); await f.controller.load('Hello')
  f.steps.push({ reply: 'Xác nhận nhé?', checkout_payload: { order_summary: summary } })
  await f.controller.send('tóm tắt đơn')
  let release
  f.steps.push(() => new Promise(resolve => { release = resolve }))
  const checkout = f.controller.confirm()
  await f.controller.confirm()
  assert.equal(f.calls.length, 2)
  assert.match(f.calls[1][0], /^\/ai\/cart\/checkout\?conversation_id=/)
  assert.equal(f.calls[1][1].action_id, 'checkout-once')
  release({ status: 'success', order_id: 'order-1', total_price: 39000 })
  await checkout
  assert.equal(f.controller.snapshot().pendingOrder, null)
  assert(f.mutations.flat().some(t => t.tool === 'confirm_checkout'))
})

test('failed checkout retains summary for safe replay, and insufficient wallet exposes canonical options', async () => {
  const f = fixture('customer'); await f.controller.load('Hello')
  f.steps.push({ reply: 'Tóm tắt', checkout_payload: summary }); await f.controller.send('tóm tắt')
  f.steps.push(new Error('timeout')); await f.controller.confirm()
  assert.equal(f.controller.snapshot().pendingOrder.actionId, 'checkout-once')
  f.steps.push({ status: 'insufficient_wallet', message: 'Ví không đủ', payment_options: [{ code: 'TIEN_MAT', label: 'Tiền mặt', enabled: true }], wallet_topup: { required_total: 39000, balance: 10000, shortfall: 29000 } })
  await f.controller.confirm()
  assert.equal(f.controller.snapshot().pendingOrder, null)
  assert.equal(f.controller.snapshot().messages.at(-1)._walletTopupOffer.userId, 'customer')
})

test('QR/VNPAY, vouchers, branches, login action and disabled wallet are passed from server', async () => {
  const f = fixture('customer'); await f.controller.load('Hello')
  f.steps.push({ reply: 'Bạn xem nhé', ui_payload: { branches: [{ branch_id: 8, branch_name: 'Highlands' }], vouchers: [{ code: 'HELLO' }],
    payment_options: [{ label: 'Ví Avengers', enabled: false, reason: 'Thiếu tiền' }], login_action: { label: 'Đăng nhập' },
    qr_payment: { ma_don_hang: 'order-qr', so_tien: 39000, qr_img_url: 'https://fixture/qr.png', ma_tham_chieu: 'Q1' } } })
  await f.controller.send('thanh toán')
  const msg = f.controller.snapshot().messages.at(-1)
  assert.equal(msg.stores[0].branch_id, 8); assert.equal(msg.vouchers[0].code, 'HELLO')
  assert.equal(msg.paymentOptions[0].enabled, false); assert.equal(msg.loginAction.label, 'Đăng nhập')
  assert.equal(msg.qrPayment.reference, 'Q1')
})

test('wallet topup uses existing authenticated endpoint and no extra AI interpretation', async () => {
  const f = fixture('customer'); await f.controller.load('Hello')
  f.steps.push({ reply: 'Ví thiếu tiền', ui_payload: { wallet_topup: { balance: 0, required_total: 39000, suggested_amounts: [50000] } } })
  await f.controller.send('chọn ví')
  f.steps.push({ success: true, amount: 50000, transaction_id: 'topup-1', redirect_url: 'https://fixture/topup' })
  await f.controller.send('Nạp 50k')
  assert.equal(f.calls[1][0], '/customers/customer/wallet/topup')
  assert.equal(f.controller.snapshot().messages.at(-1)._walletTopup.transactionId, 'topup-1')
})

test('accounts isolate saved state; reset calls scoped endpoint and preserves pending payment receipts', async () => {
  const f = fixture('customer'); await f.controller.load('Hello')
  await f.controller.resolvePayment({ qrPayment: { orderId: 'order-qr', userId: 'customer' } }, 'Đang chờ thanh toán')
  const other = fixture('other', f.storageMap); await other.controller.load('Other')
  assert.equal(other.controller.snapshot().messages.length, 1)
  const previous = f.controller.snapshot().conversationId
  await f.controller.reset('New')
  assert.equal(f.calls[0][0], '/ai/agent/conversation/reset')
  assert.equal(f.calls[0][1].previous_conversation_id, previous)
  assert.notEqual(f.controller.snapshot().conversationId, previous)
  assert(f.controller.snapshot().messages.some(m => m.qrPayment))
})

test('shared web/mobile confirmation contract rejects edits, negation and questions', () => {
  for (const text of ['ok', 'xác nhận', 'đồng ý đặt hàng']) assert.equal(isCheckoutConfirmation(text), true)
  for (const text of ['ok nhưng thêm món', 'không đặt', 'xác nhận?', 'cho tôi món số 2']) assert.equal(isCheckoutConfirmation(text), false)
  assert.deepEqual(agentProducts({ products: [hot, cold] }).map(p => p.product_id), ['39', '38'])
  assert.equal(pendingCheckout(summary, 'Tóm tắt').items[0].size, 'Vừa')
})
