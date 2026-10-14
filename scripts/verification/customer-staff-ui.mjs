// Real built apps; every API/provider/WebSocket is intercepted. No live accounts/keys.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const roots = { customer_web: process.env.CUSTOMER_WEB_EXPORT, customer_mobile: process.env.CUSTOMER_MOBILE_EXPORT, staff_web: process.env.STAFF_WEB_EXPORT, staff_mobile: process.env.STAFF_MOBILE_EXPORT };
assert(Object.values(roots).every(Boolean), 'Set all four *_EXPORT paths');
const output = process.env.UI_ARTIFACTS || '/tmp/avengers-choice-inbox-ui';
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml' };
const servers = Object.fromEntries(Object.entries(roots).map(([key, root]) => [key, createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(resolve(root) + '/')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
})]));
const products = [
  { ma_san_pham: '38', ten_san_pham: 'Cà Phê Sữa Đá', gia_ban: 39000, trang_thai: true, hinh_anh_url: 'https://fixture.invalid/coffee.png', danhMuc: { ma_danh_muc: 1, ten_danh_muc: 'Cà Phê Phin' } },
  { ma_san_pham: '39', ten_san_pham: 'Cà Phê Sữa Nóng', gia_ban: 39000, trang_thai: true, hinh_anh_url: 'https://fixture.invalid/coffee.png', danhMuc: { ma_danh_muc: 1, ten_danh_muc: 'Cà Phê Phin' } },
];
const groups = [
  { name: 'Kích thước', field: 'size', required: true, values: ['Lớn', 'Vừa'] },
  { name: 'Lượng đá', field: 'ice', required: false, values: ['Ít đá', 'Bình thường'] },
  { name: 'Topping', field: 'toppings', multiple: true, required: false, values: ['Hạt Sen', 'Foam Dừa'] },
];
const conversations = [
  { ma_hoi_thoai: 'conv-a', ten_khach_hang: 'Khách An', ma_khach_hang: 'customer-a', trang_thai: 'OPEN', tin_nhan_cuoi: 'Tôi muốn hỏi về đơn hàng', so_tin_nhan_chua_doc_nhan_su: 2, ngay_cap_nhat: '2026-10-14T07:43:00Z' },
  { ma_hoi_thoai: 'conv-b', ten_khach_hang: 'Khách Bình', ma_khach_hang: 'customer-b', trang_thai: 'OPEN', tin_nhan_cuoi: 'Quán còn cà phê sữa không?', so_tin_nhan_chua_doc_nhan_su: 0, ngay_cap_nhat: '2026-10-14T07:40:00Z' },
];
const message = (conversation, content, role = 'CUSTOMER', id = content) => ({ id, ma_hoi_thoai: conversation, noi_dung: content, vai_tro_nguoi_gui: role, ten_nguoi_gui: role === 'CUSTOMER' ? 'Khách hàng' : 'Linh', ngay_tao: '2026-10-14T07:43:00Z' });
let browser, activePage;
const results = [], errors = [];
try {
  await Promise.all(Object.values(servers).map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
  const origins = Object.fromEntries(Object.entries(servers).map(([key, server]) => [key, `http://127.0.0.1:${server.address().port}`]));
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const coffeePng = await readFile(resolve('avengers-coffee-system/apps/customer-mobile/assets/branding/logo.png'));
  async function pageFor(app, width, role = 'MANAGER') {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const calls = [], allMessages = { 'conv-a': [message('conv-a', 'Tôi muốn hỏi về đơn hàng')], 'conv-b': [message('conv-b', 'Quán còn cà phê sữa không?')] };
    await context.addInitScript(({ app, role }) => {
      if (app.startsWith('staff')) {
        const user = { id: 'staff-fixture', maNguoiDung: 'staff-fixture', tenDangNhap: 'linh', hoTen: 'Linh', ho_ten: 'Linh', vaiTro: role, role, coSoMa: 'D9', coSoTen: 'Highlands Coffee D9' };
        sessionStorage.setItem('adminSession', JSON.stringify({ token: 'fixture-only-token', user }));
        localStorage.setItem('avengers_admin_session', JSON.stringify({ admin: user, timestamp: Date.now() }));
        localStorage.setItem('auth_token', 'fixture-only-token');
      }
    }, { app, role });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (Object.values(origins).includes(url.origin)) return route.continue();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      if (/\.(png|jpg|jpeg)$/.test(url.pathname)) return route.fulfill({ body: coffeePng, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } });
      if (/\.js$/.test(url.pathname)) return route.fulfill({ body: '', contentType: 'text/javascript' });
      let body; try { body = request.postDataJSON(); } catch { body = null; }
      const path = url.pathname.replace(/^\/api(?=\/)/, '');
      calls.push({ path, method: request.method(), body });
      let data = { items: [] };
      if (path === '/menu/san-pham') data = products;
      if (path === '/menu/danh-muc') data = [{ ma_danh_muc: 1, ten_danh_muc: 'Cà Phê Phin', trang_thai: true }];
      if (path === '/menu/categories') data = [{ id: 1, code: '1', name: 'Cà Phê Phin' }];
      if (path === '/menu/items') data = { items: products.map((row, i) => ({ id: row.ma_san_pham, name: row.ten_san_pham, category: 'Cà Phê Phin', category_code: 1, price: row.gia_ban, image: row.hinh_anh_url, description: 'Cà phê phin và sữa đặc, hương vị đậm đà.', dang_ban: true, la_hot: true, la_moi: i === 0 })) };
      if (path === '/chat/conversations') data = { items: conversations };
      if (path.match(/\/chat\/conversations\/[^/]+\/messages$/)) {
        const id = path.split('/').at(-2);
        if (request.method() === 'POST') { const row = message(id, body.content, body.sender_role, `sent-${calls.length}`); allMessages[id].push(row); data = { message: row, conversation: { ...conversations.find(row => row.ma_hoi_thoai === id), tin_nhan_cuoi: body.content, vai_tro_nguoi_gui_cuoi: body.sender_role } }; }
        else data = { items: allMessages[id] || [] };
      }
      if (path.endsWith('/read')) data = { conversation: { ...conversations.find(row => row.ma_hoi_thoai === path.split('/').at(-2)), so_tin_nhan_chua_doc_nhan_su: 0 } };
      if (path === '/ai/agent/chat') {
        if (body.ui_action?.type === 'select_products') data = { reply: 'Các món đang chờ tùy chọn, chưa vào giỏ. Bạn chọn ở bảng bên dưới nhé.', ui_payload: { product_configuration: { snapshot: 'options-fixture', items: body.ui_action.items.map(item => ({ ...item, product_name: products.find(row => row.ma_san_pham === item.product_id).ten_san_pham, groups, selected_options: {} })) }, product_selection_snapshot: 'products-fixture' }, error: null };
        else if (body.ui_action?.type === 'configure_products') data = { reply: 'Đã thêm các món bạn chọn vào giỏ. Bạn tiếp tục chọn hình thức nhận hàng nhé.', ui_payload: { product_configuration: { snapshot: 'empty', items: [] }, cart: { items: body.ui_action.items } }, tool_calls_log: body.ui_action.items.map(item => ({ tool: 'add_to_cart', result: { status: 'ok', product_id: item.product_id } })), error: null };
        else data = { reply: 'Mình gửi bạn hai món cà phê sữa để lựa chọn.', ui_payload: { products: products.map((row, i) => ({ product_id: row.ma_san_pham, product_name: row.ten_san_pham, price: row.gia_ban, hinh_anh_url: row.hinh_anh_url, display_index: i + 1 })), product_selection_snapshot: 'products-fixture', product_configuration: { snapshot: 'empty', items: [] } } };
      }
      return route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
    page.on('pageerror', error => errors.push({ app, message: error.message }));
    return { page, context, calls, origin: origins[app] };
  }
  for (const app of ['customer_web', 'customer_mobile']) {
    const { page, context, calls, origin } = await pageFor(app, 390);
    await page.goto(origin);
    if (app === 'customer_web') await page.getByRole('button', { name: /^Mở trò chuyện/ }).click();
    else { await page.getByLabel('Nhắn tin với nhân viên', { exact: true }).click(); await page.getByRole('tab', { name: 'Trợ lý AI', exact: true }).click(); }
    const input = page.getByPlaceholder(app === 'customer_web' ? 'Nhắn tin với AI...' : 'Hỏi AI về menu, giá, khuyến mãi...');
    await input.fill('Cho tôi xem cà phê sữa');
    if (app === 'customer_web') await input.press('Enter'); else await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await page.getByRole('button', { name: 'Chọn Cà Phê Sữa Đá', exact: true }).click();
    await page.getByRole('button', { name: 'Chọn Cà Phê Sữa Nóng', exact: true }).click();
    assert.equal(calls.filter(call => call.path === '/ai/agent/chat').length, 1, 'Plus must queue locally');
    await page.screenshot({ path: `${output}/${app}-selection.png` });
    await page.getByRole('button', { name: 'Tiếp tục với 2 món →', exact: true }).click();
    const apply = page.getByRole('button', { name: 'Thêm 2 món vào giỏ', exact: true });
    await apply.waitFor(); assert(await apply.isDisabled());
    if (app === 'customer_web') {
      for (const article of await page.locator('.customer-choice-panel article').all()) await article.getByRole('radio', { name: 'Vừa', exact: true }).check();
      await page.locator('.customer-choice-panel article').first().getByRole('checkbox', { name: 'Hạt Sen', exact: true }).check();
    } else {
      await page.getByRole('radio', { name: 'Cà Phê Sữa Đá · Kích thước · Vừa', exact: true }).click();
      await page.getByRole('radio', { name: 'Cà Phê Sữa Nóng · Kích thước · Vừa', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Cà Phê Sữa Đá · Topping · Hạt Sen', exact: true }).click();
    }
    assert(await apply.isEnabled());
    await apply.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400); await page.screenshot({ path: `${output}/${app}-options.png` });
    await apply.click(); await page.getByText('Đã thêm các món bạn chọn vào giỏ.', { exact: false }).first().waitFor();
    const turns = calls.filter(call => call.path === '/ai/agent/chat');
    assert.equal(turns.length, 3); assert.equal(turns[1].body.ui_action.items.length, 2);
    assert.deepEqual(turns[2].body.ui_action.items[0].options, { size: 'Vừa', toppings: ['Hạt Sen'] });
    assert.deepEqual(turns[2].body.ui_action.items[1].options, { size: 'Vừa' });
    assert.equal(await apply.count(), 0);
    assert(!calls.some(call => call.path.includes('checkout')), 'Configuring products must never place an order');
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    results.push({ app, result: 'PASS', mockedTurns: turns.length }); await context.close();
  }
  for (const app of ['staff_web', 'staff_mobile']) {
    const { page, context, calls, origin } = await pageFor(app, 1440);
    await page.goto(`${origin}/?workspace=manager`);
    await page.getByRole('button', { name: 'Mở trang tin nhắn khách hàng', exact: true }).click();
    if (app === 'staff_web') await page.locator('.support-conversation').filter({ hasText: 'Khách An' }).click();
    else await page.getByRole('button', { name: 'Hội thoại Khách An', exact: true }).click();
    const input = page.getByLabel('Tin nhắn trả lời khách', { exact: true });
    await input.fill('Chào bạn, mình đã nhận được yêu cầu. Bạn gửi giúp mình mã đơn để cửa hàng kiểm tra nhé.');
    await input.press('Enter');
    await page.getByText('Chào bạn, mình đã nhận được yêu cầu.', { exact: false }).last().waitFor();
    assert(calls.some(call => call.method === 'POST' && call.path === '/chat/conversations/conv-a/messages'));
    await page.waitForTimeout(600);
    if (app === 'staff_web') console.log('Inbox name layout', await page.locator('.support-conversation b').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, box: node.getBoundingClientRect().toJSON(), display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility, color: getComputedStyle(node).color, parent: node.parentElement.getBoundingClientRect().toJSON() }))));
    await page.screenshot({ path: `${output}/${app}-inbox-1440.png` });
    if (app === 'staff_web') await page.locator('.support-conversation').filter({ hasText: 'Khách Bình' }).click();
    else await page.getByRole('button', { name: 'Hội thoại Khách Bình', exact: true }).click();
    await page.getByText('Quán còn cà phê sữa không?', { exact: true }).last().waitFor();
    assert.equal(app === 'staff_web' ? await page.locator('.support-message').filter({ hasText: 'Tôi muốn hỏi về đơn hàng' }).count() : await page.getByText('Tôi muốn hỏi về đơn hàng', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/${app}-inbox-390.png` });
    results.push({ app, result: 'PASS', mockedReply: true }); await context.close();
  }
  const { page, context, origin } = await pageFor('staff_web', 1440, 'ADMIN');
  await page.goto(`${origin}/?workspace=admin`); await page.getByRole('button', { name: 'Thực đơn', exact: true }).click();
  await page.locator('table.menu-table tbody tr').first().waitFor();
  const positions = await page.locator('table.menu-table').evaluate(table => ({ display: getComputedStyle(table).display, head: [...table.querySelectorAll('thead th')].map(node => node.getBoundingClientRect().x), cells: [...table.querySelector('tbody tr').children].map(node => node.getBoundingClientRect().x) }));
  assert.equal(positions.display, 'table'); assert.equal(positions.head.length, 6); positions.head.forEach((x, i) => assert(Math.abs(x - positions.cells[i]) < 1));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${output}/admin-menu-aligned.png` });
  await page.setViewportSize({ width: 390, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  results.push({ app: 'admin_menu', result: 'PASS', alignedColumns: 6 }); await context.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, realApiRequestsSent: 0, artifacts: output }));
} catch (error) {
  console.error('UI verification failed:', error.message, errors);
  if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {}); console.error((await activePage.locator('body').innerText().catch(() => '')).slice(-3500)); }
  throw error;
} finally { await browser?.close(); await Promise.all(Object.values(servers).map(server => new Promise(resolve => server.close(resolve)))); }
