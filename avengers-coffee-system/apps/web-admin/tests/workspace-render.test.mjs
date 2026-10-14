import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let server
let savedSession = null
const storage = { getItem: () => savedSession ? JSON.stringify(savedSession) : null }

before(async () => {
  globalThis.window = {
    location: { hostname: 'localhost', href: 'http://localhost:5174/', search: '' },
    localStorage: storage,
  }
  globalThis.localStorage = storage
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
})
after(async () => {
  await server?.close()
  delete globalThis.window
  delete globalThis.localStorage
})

function render(Component, props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    return renderToString(React.createElement(QueryClientProvider, { client }, React.createElement(Component, props)))
  } finally {
    client.clear()
  }
}

test('signed-in manager and staff render the operational shell without a blank-page exception', async () => {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  for (const vaiTro of ['MANAGER', 'STAFF', 'KIOSK_STAFF']) {
    savedSession = { user: { vaiTro, tenDangNhap: 'fixture', coSoMa: 'MAIN', coSoTen: 'Fixture branch' } }
    const html = render(App)
    assert.match(html, /Trung tâm vận hành cửa hàng/)
    assert.match(html, /console-sidebar/)
    assert.doesNotMatch(html, /console-recovery/)
  }
})

test('each login workspace has an active role tab and matching login title, including direct links', async () => {
  const { LoginScreen } = await server.ssrLoadModule('/src/features/admin-dashboard/components/LoginScreen.jsx')
  const labels = { admin: 'admin', manager: 'quản lý', staff: 'nhân viên', partner: 'đối tác kiosk', accountant: 'kế toán' }
  for (const [role, label] of Object.entries(labels)) {
    window.location.search = '?workspace=' + role
    const html = render(LoginScreen, { loginForm: { identifier: '', password: '' }, loginStatus: {}, setLoginForm() {}, onLogin() {} })
    assert.ok(html.replaceAll('<!-- -->', '').includes('Đăng nhập ' + label))
    assert.match(html, new RegExp('id="login-tab-' + role + '" aria-selected="true"'))
  }
})

test('admin, partner, kiosk staff and accountant shells render loading or empty data safely', async () => {
  const modules = [
    ['/src/features/actor-admin/components/AdminSystemConsole.jsx', 'AdminSystemConsole'],
    ['/src/features/franchise/FranchiseePortal.jsx', 'FranchiseePortal'],
    ['/src/features/franchise/FranchiseStaffPortal.jsx', 'FranchiseStaffPortal'],
    ['/src/features/franchise/AccountantFranchiseShell.jsx', 'AccountantFranchiseShell'],
  ]
  for (const [path, name] of modules) {
    const module = await server.ssrLoadModule(path)
    const html = render(module[name], { session: { user: { tenDangNhap: 'fixture' } }, onLogout() {} })
    assert.match(html, /console-shell/)
    assert.doesNotMatch(html, /console-recovery/)
  }
})

test('customer pagination renders with missing page metadata', async () => {
  const { AdminCustomerManagementPanel } = await server.ssrLoadModule('/src/features/actor-admin/components/AdminCustomerManagementPanel.jsx')
  const html = render(AdminCustomerManagementPanel, { customersPageData: { rows: [] } })
  assert.match(html, /Trang <!-- -->1<!-- --> \/ <!-- -->1/)
})

test('line, bar and donut charts render exact financial values with accessible data tables', async () => {
  const { Chart } = await server.ssrLoadModule('/src/components/console/DashboardCharts.jsx')
  for (const type of ['line', 'bar', 'donut']) {
    const html = render(Chart, { title: 'Fixture chart', type, rows: [{ label: 'A', value: 120 }, { label: 'B', value: 80 }] })
    assert.match(html, /role="img"/)
    assert.match(html, /<table>/)
    assert.match(html, />120</)
    assert.match(html, />80</)
    assert.doesNotMatch(html, /NaN|Infinity|console-chart-empty/)
  }
})
