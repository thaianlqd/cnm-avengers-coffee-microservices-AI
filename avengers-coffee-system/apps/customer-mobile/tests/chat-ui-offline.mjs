// Use exported apps with a mocked API and block every other network request.
// CUSTOMER_EXPORT=/tmp/... SHIPPER_EXPORT=/tmp/... PLAYWRIGHT_MODULE=... node tests/chat-ui-offline.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const roots = [process.env.CUSTOMER_EXPORT, process.env.SHIPPER_EXPORT]
assert(roots.every(Boolean), 'Set CUSTOMER_EXPORT and SHIPPER_EXPORT')
const output = process.env.UI_ARTIFACTS || '/tmp/avengers-chat-ui-offline'
await mkdir(output, { recursive: true })
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html', '.ttf': 'font/ttf' }
const servers = roots.map(root => createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
  if (!file.startsWith(resolve(root) + '/')) { res.writeHead(403).end(); return }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)) }
  catch { res.writeHead(404).end() }
}))
let browser, page
const errors = []
try {
  await Promise.all(servers.map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))))
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
  const apiCalls = []
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    window.__speechCalls = []
    window.SpeechRecognition = class {
      start() { window.__speechCalls.push('start') }
      stop() { window.__speechCalls.push('stop'); this.onresult?.({ results: [[{ transcript: 'cho tôi món số 2 đi bạn ơi' }]] }); this.onend?.() }
      abort() { this.onend?.() }
    }
  })
  const origins = servers.map(server => `http://127.0.0.1:${server.address().port}`)
  const products = [
    { ma_san_pham: '38', ten_san_pham: 'Cà Phê Sữa Đá', gia_ban: 39000, trang_thai: true },
    { ma_san_pham: '39', ten_san_pham: 'Cà Phê Sữa Nóng', gia_ban: 39000, trang_thai: true },
  ]
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (origins.includes(url.origin)) return route.continue()
    // All non-static requests terminate here, even public keys in Expo's build.
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    apiCalls.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() })
    let data = []
    if (url.pathname === '/menu/san-pham') data = products
    if (url.pathname === '/menu/danh-muc') data = []
    if (url.pathname.startsWith('/cart')) data = { items: [] }
    if (url.pathname.startsWith('/ai/recommend')) data = { products: [] }
    if (url.pathname === '/ai/agent/chat') {
      const body = request.postDataJSON()
      data = body.selected_product_id || /món số 2/.test(body.message)
        ? { reply: 'Món đang chọn 1 ×1:\nDạ, bạn chọn các tùy chọn cho **Cà Phê Sữa Nóng** nhé:\n- **Kích thước** (mặc định): Vừa\n- **Topping** (tùy chọn): Hạt Sen, Sữa Đặc\n- **Độ ngọt** (tùy chọn): Bình thường\nBạn có thể nói **theo mặc định**.\n\n**Chưa vào giỏ** vì còn chờ tùy chọn.', ui_payload: {} }
        : { reply: 'Dạ, mình gửi các món phù hợp:\n1. **Cà Phê Sữa Đá** — **39.000đ**\n2. **Cà Phê Sữa Nóng** — **39.000đ**', ui_payload: { products: products.map((p, i) => ({ product_id: p.ma_san_pham, product_name: p.ten_san_pham, price: p.gia_ban, display_index: i + 1 })) } }
    }
    return route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(15000)
  console.log('Browser ready')
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/_expo/static/js/web/**', route => route.abort())
  await page.goto(origins[0])
  assert.equal(await page.locator('.startup').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(178, 40, 48)')
  await page.screenshot({ path: `${output}/customer-splash.png` })
  await page.unroute('**/_expo/static/js/web/**')
  await page.reload()
  console.log('Customer loaded')
  await page.getByLabel('Nhắn tin với nhân viên', { exact: true }).click()
  await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).click()
  const input = page.getByPlaceholder('Hỏi AI về menu, giá, khuyến mãi...')
  await input.fill('hello cho tôi mua cà phê sữa đi'); await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
  await page.getByText('2. Cà Phê Sữa Nóng', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/customer-two-products.png` })
  await input.fill('cho tôi món số 2 đi bạn ơi'); await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
  await page.getByText('Hạt Sen, Sữa Đặc', { exact: false }).waitFor()
  assert.equal(await page.getByText('Mình đã hiểu đơn của bạn!', { exact: false }).count(), 0)
  assert.equal(await page.getByText('Xác nhận đơn hàng', { exact: true }).count(), 0)
  assert(await page.locator('body').innerText().then(text => text.includes('Chưa vào giỏ')))
  await page.waitForTimeout(700)
  const lastAnswer = await page.getByText('Chưa vào giỏ', { exact: true }).last().boundingBox()
  const inputBox = await input.boundingBox()
  assert(lastAnswer.y + lastAnswer.height < inputBox.y, 'Latest option answer must scroll above the input')
  await page.screenshot({ path: `${output}/customer-options.png` })
  await page.getByRole('tab', { name: 'Nhân viên', exact: true }).click()
  await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).click()
  assert(await page.locator('body').innerText().then(text => text.includes('Cà Phê Sữa Nóng')))
  await page.getByRole('button', { name: 'Thêm Cà Phê Sữa Nóng', exact: true }).click()
  await page.waitForTimeout(100)
  await page.waitForTimeout(600)
  const mic = page.getByRole('button', { name: 'Ghi âm tin nhắn', exact: true })
  await mic.hover(); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up()
  await page.waitForTimeout(700)
  console.log('Voice fixture events', await page.evaluate(() => window.__speechCalls))
  const turns = apiCalls.filter(c => c.path === '/ai/agent/chat')
  assert.equal(turns.length, 4)
  assert.equal(turns[2].body.selected_product_id, '39')
  assert.equal(new Set(turns.map(c => c.body.conversation_id)).size, 1)
  assert.equal(new Set(turns.map(c => c.body.client_message_id)).size, 4)
  assert(!apiCalls.some(c => ['/ai/chat', '/ai/chat/order-intent'].includes(c.path)))
  await page.reload()
  await page.getByLabel('Nhắn tin với nhân viên', { exact: true }).click()
  await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).click()
  await page.getByText('Chưa vào giỏ', { exact: false }).first().waitFor()
  for (const width of [320, 390, 480, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${output}/customer-chat-${width}.png` })
    await page.goto(origins[1])
    await page.getByLabel('Tài khoản', { exact: true }).waitFor()
    assert.equal(await page.getByText('Đội ngũ giao hàng của cửa hàng', { exact: true }).count(), 1)
    await page.waitForTimeout(450)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${output}/shipper-login-${width}.png` })
    await page.goto(origins[0])
    await page.getByLabel('Nhắn tin với nhân viên', { exact: true }).click()
    await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'PASS', mockedAgentTurns: turns.length, externalRequestsSent: 0, viewportWidths: [320, 390, 480, 1440], artifacts: output }))
} catch (error) {
  console.error('UI failure', error.message, errors)
  if (page) { await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); console.error((await page.locator('body').innerText().catch(() => '')).slice(-3000)) }
  throw error
} finally {
  await browser?.close()
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
}
