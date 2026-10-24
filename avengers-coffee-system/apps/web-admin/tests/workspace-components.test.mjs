import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5174' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = clearTimeout
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
dom.window.ResizeObserver = globalThis.ResizeObserver
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
dom.window.HTMLElement.prototype.scrollIntoView = function () {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { default: React } = await import('react')
const { render, renderHook, act, fireEvent, cleanup, waitFor } = await import('@testing-library/react')
const bundle = resolve(app, '.impeccable/review/component-test-bundle.mjs')
mkdirSync(dirname(bundle), { recursive: true })
buildSync({ stdin: { contents: `export { default as ComboOrderDetail } from './src/features/franchise/ComboOrderDetail.jsx'; export { default as WorkspaceLoading } from './src/components/console/WorkspaceLoading.jsx'; export { franchiseApi } from './src/features/franchise/franchiseApi.js'; export { AccountantFranchiseShell } from './src/features/franchise/AccountantFranchiseShell.jsx'; export { default as KioskOrdersPanel } from './src/features/franchise/KioskOrdersPanel.jsx'; export { FranchiseActionProvider, FranchiseFeedback } from './src/features/franchise/FranchiseWorkspaceUI.jsx'; export { DonMuaComboTab, CongNoTab, RoyaltyTab, DoiSoatTab, AuditLogTab } from './src/features/franchise/FranchisePanel.jsx'; export { KioskStaffHeader, KioskStaffSchedulePanel, KioskStaffShiftManagement } from './src/features/franchise/KioskStaffWorkspace.jsx'; export { default as KioskPosTerminal } from './src/features/franchise/KioskPosTerminal.jsx'; export { kioskCheckoutResult, kioskSaleStatus } from './src/features/franchise/kioskPosModel.js'; export { default as KioskShiftPanel } from './src/features/franchise/KioskShiftPanel.jsx'; export { default as KioskDebtPanel } from './src/features/franchise/KioskDebtPanel.jsx'; export { useKioskAvailability } from './src/features/franchise/useKioskAvailability.js'; export { FranchiseePortal } from './src/features/franchise/FranchiseePortal.jsx'; export { FranchiseStaffPortal } from './src/features/franchise/FranchiseStaffPortal.jsx'; export { LoginScreen } from './src/features/admin-dashboard/components/LoginScreen.jsx'; export { KioskPosPicker, KioskScheduleGrid } from './src/features/franchise/KioskWorkspaceComponents.jsx'; export { StaffWorkShiftsPanel } from './src/features/staff-dashboard/components/StaffWorkShiftsPanel.jsx'; export { default as StaffDeliveryPanel } from './src/features/staff-dashboard/components/StaffDeliveryPanel.jsx'; export { AdminFlashSalePanel, AdminProductRankingPanel } from './src/features/actor-admin/components/AdminCommercePanel.jsx'; export { default as ArticleEditor } from './src/features/shared/components/ArticleEditor.jsx'; export { normalizeViText } from './src/features/admin-dashboard/utils.js'; export { WorkforceCalendar } from './src/features/staff-dashboard/components/WorkforceCalendar.jsx'; export { default as Select } from './src/components/console/SearchableSelect.jsx'; export { default as SmartSelect } from './src/components/console/SmartSelect.jsx'; export { default as Dialog } from './src/components/console/WorkspaceDialog.jsx'; export { default as DateTimePicker } from './src/components/console/DateTimePicker.jsx'; export { ProductDetailView } from './src/features/actor-admin/components/ProductDetailView.jsx'; export { default as OrderDetailView } from './src/features/admin-dashboard/components/OrderDetailView.jsx'; export { Chart } from './src/components/console/DashboardCharts.jsx'; export { default as BranchAddressPicker } from './src/components/console/BranchAddressPicker.jsx'; export { AdminSystemConsole } from './src/features/actor-admin/components/AdminSystemConsole.jsx'; export { AdminKioskManagementPanel } from './src/features/actor-admin/components/AdminKioskManagementPanel.jsx'; export { ManagerSurveyPanel } from './src/features/manager-dashboard/components/ManagerSurveyPanel.jsx'; export { default as StatusBadge } from './src/components/console/StatusBadge.jsx'; export { default as OperationalPageFrame, WorkspacePanelIntro } from './src/components/console/OperationalPageFrame.jsx'; export { default as OrderStatusControl } from './src/components/console/OrderStatusControl.jsx'; export { OverviewPanel } from './src/features/admin-dashboard/components/OverviewPanel.jsx'; export { OrdersPanel } from './src/features/admin-dashboard/components/OrdersPanel.jsx'; export { MenuPanel } from './src/features/admin-dashboard/components/MenuPanel.jsx'; export { PosOrderPanel } from './src/features/admin-dashboard/components/PosOrderPanel.jsx'; export { ShiftPanel } from './src/features/admin-dashboard/components/ShiftPanel.jsx'; export { ManagerEmployeePanel } from './src/features/manager-dashboard/components/ManagerEmployeePanel.jsx'; export { ManagerWorkforcePanel } from './src/features/manager-dashboard/components/ManagerWorkforcePanel.jsx';`, resolveDir: app, loader: 'jsx' }, bundle: true, outfile: bundle, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const { ComboOrderDetail, WorkspaceLoading, franchiseApi, AccountantFranchiseShell, KioskOrdersPanel, FranchiseActionProvider, FranchiseFeedback, DonMuaComboTab, CongNoTab, RoyaltyTab, DoiSoatTab, AuditLogTab, KioskStaffHeader, KioskStaffSchedulePanel, KioskStaffShiftManagement, KioskPosTerminal, kioskCheckoutResult, kioskSaleStatus, KioskShiftPanel, KioskDebtPanel, useKioskAvailability, FranchiseePortal, FranchiseStaffPortal, LoginScreen, KioskPosPicker, KioskScheduleGrid, StaffWorkShiftsPanel, StaffDeliveryPanel, AdminFlashSalePanel, AdminProductRankingPanel, ArticleEditor, normalizeViText, WorkforceCalendar, Select, SmartSelect, Dialog, DateTimePicker, ProductDetailView, OrderDetailView, Chart, BranchAddressPicker, AdminSystemConsole, AdminKioskManagementPanel, ManagerSurveyPanel, StatusBadge, OperationalPageFrame, WorkspacePanelIntro, OrderStatusControl, OverviewPanel, OrdersPanel, MenuPanel, PosOrderPanel, ShiftPanel, ManagerEmployeePanel, ManagerWorkforcePanel } = await import(bundle)
const h = React.createElement
const options = [{ value: '', label: 'Tất cả' }, { value: 'locked', label: 'Bị khóa', disabled: true }, { value: 'HN', label: 'Hà Nội' }, { value: 'HCM', label: 'Hồ Chí Minh', keywords: 'saigon' }]
afterEach(() => cleanup())

test('combobox retains event values and name, filters Vietnamese without accents and supports keyboard selection', async () => {
  let event
  const view = render(h(Select, { options, value: '', name: 'city', 'aria-label': 'Thành phố', onChange: e => { event = e } }))
  const input = view.getByRole('combobox')
  fireEvent.click(input)
  fireEvent.change(input, { target: { value: 'ha noi' } })
  await waitFor(() => assert.equal(view.getAllByRole('option').length, 1))
  fireEvent.keyDown(input, { key: 'Enter' })
  assert.equal(event.target.value, 'HN'); assert.equal(event.target.name, 'city')
  assert.equal(view.queryByRole('listbox'), null)
})
test('SmartSelect preserves its value-only callback and searches keywords', async () => {
  let result
  const view = render(h(SmartSelect, { options, value: '', label: 'Chọn chi nhánh', onChange: value => { result = value } }))
  fireEvent.change(view.getByRole('combobox'), { target: { value: 'saigon' } })
  await waitFor(() => assert.equal(view.getAllByRole('option').length, 1))
  fireEvent.click(view.getByRole('option'))
  assert.equal(result, 'HCM')
})
test('clear and caret are distinct controls and a numeric zero option remains selected', () => {
  let value
  const view = render(h(Select, { options: [{ value: 0, label: 'Mức 0' }], value: 0, clearable: true, onChange: e => { value = e.target.value } }))
  assert.equal(view.getByRole('combobox').value, 'Mức 0')
  assert.ok(view.getByRole('button', { name: 'Mở lựa chọn' }))
  fireEvent.click(view.getByRole('button', { name: 'Xóa lựa chọn' }))
  assert.equal(value, '')
})
test('required and disabled custom selections retain form validation and permissions', () => {
  const view = render(h(Select, { options, value: '', required: true }))
  assert.equal(view.getByRole('combobox').checkValidity(), false)
  view.rerender(h(Select, { options, value: 'HN', required: true, disabled: true }))
  assert.equal(view.getByRole('combobox').disabled, true)
  fireEvent.click(view.getByRole('button', { name: 'Mở lựa chọn' }))
  assert.equal(view.queryByRole('listbox'), null)
})
test('Radix modal protects a busy save and closes an inner dropdown before dismissing the form', async () => {
  let closed = 0
  const container = document.createElement('div'); container.className = 'console-shell'; document.body.append(container)
  const content = busy => h(Dialog, { title: 'Chỉnh sửa khách hàng', busy, onClose: () => { closed++ } }, h(Select, { options, value: 'HN', 'aria-label': 'Địa chỉ' }))
  const view = render(content(false), { container, baseElement: document.body })
  assert.ok(view.getByRole('dialog', { name: 'Chỉnh sửa khách hàng' }))
  fireEvent.click(view.getByRole('combobox'))
  assert.ok(view.getByRole('listbox'))
  fireEvent.keyDown(view.getByRole('combobox'), { key: 'Escape' })
  await waitFor(() => assert.equal(view.queryByRole('listbox'), null))
  assert.equal(closed, 0)
  view.rerender(content(true))
  fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' })
  assert.equal(closed, 0)
  view.rerender(content(false))
  fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' })
  assert.equal(closed, 1)
  container.remove()
})
test('calendar and time field preserve promotion datetime-local values', async () => {
  let value
  const view = render(h(DateTimePicker, { value: '2026-10-23T09:30', onChange: e => { value = e.target.value } }))
  fireEvent.change(view.getByLabelText('Giờ áp dụng'), { target: { value: '10:45' } })
  assert.equal(value, '2026-10-23T10:45')
  fireEvent.click(view.getByRole('button', { name: /23\/10\/2026/ }))
  await waitFor(() => assert.ok(view.getByRole('grid')))
  assert.ok(view.getAllByRole('gridcell').length >= 28)
})
test('record detail cards render real values and preserve edit/back actions', () => {
  let back = 0, edit = 0
  const view = render(h(ProductDetailView, { product: { id: 7, name: 'Phin sữa đá', price: 39000, dang_ban: true }, onBack: () => back++, onEdit: () => edit++, onDelete() {} }))
  assert.ok(view.getByText('Thông tin sản phẩm')); assert.ok(view.getByText('39.000 đ'))
  fireEvent.click(view.getByRole('button', { name: 'Chỉnh sửa' })); fireEvent.click(view.getByRole('button', { name: 'Quay lại danh sách' }))
  assert.equal(back, 1); assert.equal(edit, 1)
})
test('order detail preserves the existing permission gate and displays loaded line items', () => {
  const view = render(h(OrderDetailView, { order: { ma_don_hang: 'ORDER-1', trang_thai_don_hang: 'HOAN_THANH', tong_tien: 78000, chi_tiet: [{ ten_san_pham: 'Phin sữa', so_luong: 2, gia_ban: 39000 }] }, onBack() {}, onEdit() {}, canEdit: false, editReason: 'Đã hoàn thành' }))
  assert.equal(view.getByRole('button', { name: 'Chỉnh sửa đơn' }).disabled, true)
  assert.ok(view.getByText('Phin sữa')); assert.ok(view.getByRole('table'))
})
test('chart always exposes exact values without relying on overlapping chart labels', () => {
  const view = render(h(Chart, { title: 'Doanh thu', rows: [{ label: 'Chi nhánh tên rất dài', value: 12345 }], type: 'bar' }))
  assert.ok(view.getByText('Xem số liệu')); assert.ok(view.getByText('Chi nhánh tên rất dài')); assert.ok(view.getByText('12.345'))
})

test('branch address selection is gated by city and ward and invalidates old coordinates after editing', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0, latest
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ items: [{ id: 'map-test', title: '45 Nguyễn Huệ', address: '45 Nguyễn Huệ, Phường Sài Gòn, Hồ Chí Minh', vi_do: 10.772849541, kinh_do: 106.704628387 }] }) } }
  function Fixture() {
    const [form, setForm] = React.useState({ thanh_pho: 'Hồ Chí Minh', phuong_xa: 'Phường Sài Gòn', dia_chi_chi_tiet: '', vi_do: null, kinh_do: null })
    latest = form
    return h(BranchAddressPicker, { form, setForm })
  }
  try {
    const view = render(h(Fixture))
    fireEvent.change(view.getByRole('combobox'), { target: { value: '45 Nguyen Hue' } })
    await waitFor(() => assert.ok(view.getByRole('option')), { timeout: 1500 })
    assert.equal(calls, 1)
    fireEvent.click(view.getByRole('option'))
    assert.equal(latest.vi_do, 10.772849541); assert.equal(latest.kinh_do, 106.704628387)
    assert.equal(view.queryByRole('listbox'), null)
    fireEvent.change(view.getByRole('combobox'), { target: { value: '12' } })
    assert.equal(latest.vi_do, null); assert.equal(latest.kinh_do, null); assert.equal(latest.map_url, '')
    cleanup()
    const gated = render(h(BranchAddressPicker, { form: { thanh_pho: 'Hồ Chí Minh', phuong_xa: '', dia_chi_chi_tiet: '' }, setForm() {} }))
    assert.equal(gated.getByRole('combobox').disabled, true)
  } finally { globalThis.fetch = originalFetch }
})

test('System Admin navigation uses one page heading and opens the shared product detail without API mutations', async () => {
  const originalFetch = globalThis.fetch
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const methods = []
  globalThis.fetch = async (input, init = {}) => {
    methods.push(init.method || 'GET')
    const path = new URL(String(input), 'http://localhost:3000').pathname
    let data = { items: [] }
    if (path.endsWith('/users/admin/stats')) data = { total_users: 1, by_role: { ADMIN: 1 }, by_branch: {} }
    if (path.endsWith('/menu/items')) data = { items: [{ id: 7, name: 'Phin sữa đá', price: 39000, dang_ban: true, description: 'Cà phê Việt Nam' }] }
    if (path.endsWith('/smtp/config')) data = { host: 'smtp.example.test', port: 587, is_active: true }
    return { ok: true, json: async () => data }
  }
  try {
    const view = render(h(QueryClientProvider, { client }, h(AdminSystemConsole, { session: { user: { ho_ten: 'Demo', vai_tro: 'ADMIN' } }, onLogout() {}, surveysState: { items: [], loading: false }, surveyResponsesState: { items: [], loading: false } })))
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Dashboard hệ thống', level: 1 })))
    fireEvent.click(view.getByRole('button', { name: 'Danh mục sản phẩm', exact: true }))
    await waitFor(() => assert.ok(view.getByRole('button', { name: 'Phin sữa đá' })), { timeout: 2000 })
    assert.equal(view.getAllByRole('heading', { level: 1 }).length, 1)
    assert.equal(view.queryByRole('heading', { name: 'Danh sách sản phẩm' }), null)
    fireEvent.click(view.getByRole('button', { name: 'Phin sữa đá' }))
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Phin sữa đá', level: 1 })))
    assert.ok(view.getByText('Thông tin sản phẩm'))
    fireEvent.click(view.getByRole('button', { name: 'Quay lại danh sách' }))
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Danh mục sản phẩm', level: 1 })))
    fireEvent.click(view.getByRole('button', { name: 'Email & SMTP', exact: true }))
    await waitFor(() => assert.ok(view.getByRole('button', { name: 'Test kết nối' })), { timeout: 2000 })
    assert.equal(view.getAllByRole('heading', { level: 1 }).length, 1)
    assert.equal(view.queryByRole('heading', { name: 'Máy chủ gửi email' }), null)
    assert.ok(methods.every(method => method === 'GET'))
  } finally { cleanup(); client.clear(); globalThis.fetch = originalFetch }
})


test('status badges keep existing labels and distinguish active, paused, pending and rejected states', () => {
  const view = render(h('div', null,
    h(StatusBadge, { status: 'ACTIVE' }, 'Hoạt động'),
    h(StatusBadge, { status: 'INACTIVE' }, 'Tạm ngưng'),
    h(StatusBadge, { status: 'CHO_KY_HOP_DONG' }, 'Chờ ký hợp đồng'),
    h(StatusBadge, { status: 'DA_HUY' }, 'Đã hủy')))
  for (const [label, variant] of [['Hoạt động', 'success'], ['Tạm ngưng', 'secondary'], ['Chờ ký hợp đồng', 'warning'], ['Đã hủy', 'destructive']]) {
    const badge = view.getByText(label).closest('[data-ui="badge"]')
    assert.equal(badge.dataset.variant, variant)
    assert.equal(badge.querySelectorAll('svg').length, 1)
  }
})

test('branch address dropdown stays inside the edit flow and Escape does not dismiss its dialog', async () => {
  const originalFetch = globalThis.fetch
  let closed = 0, latest
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [
    { id: 'one', title: '37 Nguyễn Gia Trí', address: '37 Nguyễn Gia Trí, Phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh', vi_do: 10.8, kinh_do: 106.7 },
    { id: 'two', title: 'Trường Tin học Lạc Việt', address: '37 Nguyễn Gia Trí, Phường Thạnh Mỹ Tây, Thành phố Hồ Chí Minh', vi_do: 10.81, kinh_do: 106.71 }
  ] }) })
  function Fixture() {
    const [form, setForm] = React.useState({ thanh_pho: 'Hồ Chí Minh', phuong_xa: 'Phường Thạnh Mỹ Tây', dia_chi_chi_tiet: '' })
    latest = form
    return h(Dialog, { title: 'Chi nhánh', onClose: () => closed++ }, h(BranchAddressPicker, { form, setForm }))
  }
  try {
    const view = render(h(Fixture))
    const input = view.getByRole('combobox')
    fireEvent.change(input, { target: { value: '37 Nguyen Gia Tri' } })
    await waitFor(() => assert.equal(view.getAllByRole('option').length, 2))
    fireEvent.keyDown(input, { key: 'Escape' })
    assert.equal(view.queryByRole('listbox'), null)
    assert.equal(closed, 0)
    fireEvent.focus(input)
    await waitFor(() => assert.ok(view.getByRole('listbox')))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    assert.equal(latest.vi_do, 10.81)
    assert.equal(latest.kinh_do, 106.71)
    assert.equal(closed, 0)
  } finally { cleanup(); globalThis.fetch = originalFetch }
})

test('survey editor retains title, description and all questions when saving through its modal footer', async () => {
  let payload
  const view = render(h(ManagerSurveyPanel, { onTaoForm: async value => { payload = value; return { ok: true } } }))
  fireEvent.click(view.getAllByRole('button', { name: 'Thiết kế biểu mẫu mới' })[0])
  const title = view.getByLabelText(/Tiêu đề biểu mẫu khảo sát/)
  const description = view.getByLabelText('Mô tả ngắn & Quà tặng trải nghiệm')
  fireEvent.change(title, { target: { value: 'Khảo sát chất lượng chi nhánh' } })
  fireEvent.change(description, { target: { value: 'Phản hồi của khách hàng' } })
  fireEvent.click(view.getByRole('button', { name: 'Lưu Biểu Mẫu Khảo Sát' }))
  await waitFor(() => assert.ok(!view.queryByRole('dialog')))
  assert.equal(payload.tieu_de, 'Khảo sát chất lượng chi nhánh')
  assert.equal(payload.mo_ta, 'Phản hồi của khách hàng')
  assert.equal(payload.cau_hoi.length, 20)
})

test('kiosk contract approval uses the original confirmation and submits only after acceptance', async () => {
  const originalFetch = globalThis.fetch, originalConfirm = window.confirm, originalAlert = globalThis.alert
  const posts = []
  let accepted = false
  const kiosk = { id: 'kiosk-test', ma_kiosk: 'KSK-TEST', ten_kiosk: 'Kiosk kiểm thử', trang_thai: 'CHO_KY_HOP_DONG', loai_kiosk: 'XE_LUU_DONG' }
  globalThis.fetch = async (input, init = {}) => {
    if (init.method === 'POST') posts.push({ url: String(input), body: JSON.parse(init.body) })
    return { ok: true, json: async () => init.method === 'POST' ? {} : [{ ...kiosk, trang_thai: posts.length ? 'DANG_THIET_LAP' : kiosk.trang_thai }] }
  }
  window.confirm = () => accepted
  globalThis.alert = () => {}
  try {
    const view = render(h(AdminKioskManagementPanel, { session: { token: 'test-token' } }))
    await waitFor(() => assert.ok(view.getByText('Kiosk kiểm thử')))
    fireEvent.click(view.getByText('Kiosk kiểm thử'))
    fireEvent.click(view.getByRole('button', { name: 'Duyệt hợp đồng' }))
    assert.equal(posts.length, 0)
    assert.ok(!view.queryByRole('dialog'))
    assert.equal(view.queryByText(/Xem & Ký duyệt/), null)
    accepted = true
    fireEvent.click(view.getByRole('button', { name: 'Duyệt hợp đồng' }))
    await waitFor(() => assert.equal(posts.length, 1))
    assert.ok(posts[0].url.endsWith('/franchise/kiosk/kiosk-test/hop-dong'))
    assert.equal(posts[0].body.ty_le_royalty_phan_tram, 7)
    await waitFor(() => assert.equal(view.queryByRole('button', { name: 'Duyệt hợp đồng' }), null))
  } finally { cleanup(); globalThis.fetch = originalFetch; window.confirm = originalConfirm; globalThis.alert = originalAlert }
})

test('valid Vietnamese labels are preserved while common mojibake is repaired', () => {
  for (const value of ['Bạc xỉu', 'Matcha sữa', 'Nguyễn Minh Anh', 'Trà đào cam sả']) assert.equal(normalizeViText(value), value)
  assert.equal(normalizeViText('CÃ  PhÃª'), 'Cà Phê')
})
test('operational shell owns one page title and breadcrumb while standalone panels keep their introduction', () => {
  const intro = h(WorkspacePanelIntro, null, h('h1', null, 'Tiêu đề panel'))
  const props = {groups:[{label:'Vận hành',items:[{id:'orders',label:'Đơn hàng'}]}],activeTab:'orders',onSelect(){},branchName:'Cửa hàng A',session:{user:{}}}
  const view = render(h(OperationalPageFrame,props,intro))
  assert.equal(view.getAllByRole('heading',{level:1}).length,1)
  assert.equal(view.getByRole('navigation',{name:'Đường dẫn'}).textContent,'Cửa hàng AVận hành')
  view.unmount()
  const standalone=render(intro); assert.ok(standalone.getByRole('heading',{name:'Tiêu đề panel'}))
})
test('overview has four charts and exposes actual data rather than filling missing series', () => {
  const view=render(h(OverviewPanel,{totals:{},overviewRange:'7d',setOverviewRange(){},overviewData:{filteredCount:5,summary:{completionRate:80},chartData:{revenueByDay:[{label:'23/10',amount:120000}],statusRows:[{status:'HOAN_THANH',count:4}],paymentRows:[{code:'VNPAY',count:4}],topItems:[{ten_san_pham:'Phin sữa',so_luong:8,doanh_thu:120000}]}}}))
  assert.equal(view.container.querySelectorAll('.console-charts > *').length,4)
  assert.ok(view.getAllByText('Phin sữa').length>=1)
})
test('order transition control advances one step and shows a progress indicator without a status dropdown', async()=>{
  let status
  const view=render(h(OrderStatusControl,{current:'MOI_TAO',options:['MOI_TAO','DA_XAC_NHAN','DA_HUY','DANG_GIAO'],onChange:v=>{status=v}}))
  fireEvent.click(view.getByRole('button',{name:'Xác nhận đơn'}));assert.equal(status,'DA_XAC_NHAN')
  assert.ok(view.getByRole('list',{name:/Tiến trình đơn hàng/}))
  assert.equal(view.queryByRole('button',{name:'Chọn trạng thái đơn'}),null)
  view.rerender(h(OrderStatusControl,{current:'DA_XAC_NHAN',options:['DA_XAC_NHAN','DANG_CHUAN_BI','HOAN_THANH','DA_HUY'],onChange:v=>{status=v}}))
  fireEvent.click(view.getByRole('button',{name:'Chuẩn bị món'}));assert.equal(status,'DANG_CHUAN_BI')
  view.rerender(h(OrderStatusControl,{current:'HOAN_THANH',options:['HOAN_THANH'],isDelivery:true,onChange(){}}))
  assert.equal(view.getByRole('list',{name:/Tiến trình đơn hàng/}).querySelectorAll('li').length,5)
  assert.ok(view.getByText('Đã kết thúc'));assert.equal(view.queryAllByRole('button').length,0)
})
test('menu switch preserves product id and next selling state; numeric product search works',()=>{
  let result
  const props={inventoryState:{items:[{ma_san_pham:122,name:'Matcha sữa',category:'Trà',price:45000,dang_ban:true}]},onToggleSelling:(...args)=>{result=args}}
  const view=render(h(MenuPanel,props));fireEvent.click(view.getByRole('switch'));assert.deepEqual(result,[122,false])
  fireEvent.change(view.getByRole('textbox'),{target:{value:'122'}});assert.ok(view.getByText('Matcha sữa'))
  view.rerender(h(MenuPanel,{...props,savingMenuStatusId:122}));assert.equal(view.getByRole('switch').disabled,true)
})
test('POS service and payment dropdowns write the same business fields and cash guard stays enforced', async()=>{
  let value={loai_don_hang:'TAI_CHO',phuong_thuc_thanh_toan:'THANH_TOAN_KHI_NHAN_HANG',ten_khach_hang:'',ma_ban:'',ghi_chu:''}
  const props={posForm:value,setPosForm:fn=>{value=fn(value)},posItems:[],inventoryState:{items:[]},posSubtotal:0,posVat:0,posTotal:0,isCashMethod:true,posCashInput:0,setPosCashInput(){},posCashInsufficient:true,posChange:0,taoDonTaiQuay(){},statusTone(){},setActiveTab(){}}
  const view=render(h(PosOrderPanel,props));fireEvent.click(view.getByLabelText('Phương thức thanh toán'));fireEvent.click(await view.findByRole('option',{name:'VNPAY'}));assert.equal(value.phuong_thuc_thanh_toan,'VNPAY')
  fireEvent.click(view.getByLabelText('Hình thức phục vụ'));fireEvent.click(await view.findByRole('option',{name:'Mang đi'}));assert.equal(value.loai_don_hang,'MANG_DI')
  assert.equal(view.getByRole('button',{name:/Xác Nhận Tạo Đơn/i}).disabled,true)
})
test('employee creation uses the store staff callback and employee list is a table',async()=>{
  let created
  const view=render(h(ManagerEmployeePanel,{workforceUsersState:{items:[{ma_nguoi_dung:'U1',ho_ten:'Lê Anh',ten_dang_nhap:'leanh',vai_tro:'STAFF'}]},workShiftState:{items:[]},session:{user:{coSoMa:'A'}},taoNhanVienCuaHang:async value=>{created=value;return{ok:true}}}))
  assert.ok(view.getByRole('table'));fireEvent.click(view.getByRole('button',{name:'Thêm nhân viên',exact:true}))
  fireEvent.change(view.getByLabelText('Họ và tên'),{target:{value:'Nhân viên thử'}})
  fireEvent.change(view.getByLabelText('Tên đăng nhập'),{target:{value:'staff_test'}})
  fireEvent.change(view.getByLabelText('Mật khẩu'),{target:{value:'TestPassword123'}})
  assert.equal(view.getByRole('button',{name:'Tạo tài khoản'}).disabled,false)
  fireEvent.click(view.getByRole('button',{name:'Tạo tài khoản'}))
  await waitFor(()=>assert.ok(created));assert.equal(created.ten_dang_nhap,'staff_test');assert.equal(created.ho_ten,'Nhân viên thử')
  assert.equal(created.vai_tro,undefined)
})
test('shift closing guards existing records and approval preserves its original callback payload',async()=>{
  let approved
  const history=[{ma_ca:'C1',staff_name:'Nhân viên A',created_at:new Date().toISOString(),cash_open:100000,cash_close:200000,cash_revenue:100000,difference:0,approval_status:'PENDING'}]
  const props={isManager:true,shiftDate:'2026-10-23',setShiftDate(){},shiftInput:{cashOpen:100000,cashClose:200000,note:''},setShiftInput(){},shiftPreview:{existing_shift:{ma_ca:'C1'}},shiftHistory:history,chotCaTienMat(){},pheDuyetCaLamViec:async(...args)=>{approved=args}}
  const view=render(h(ShiftPanel,props));assert.equal(view.getByRole('button',{name:'Xác nhận chốt ca làm việc'}).disabled,true)
  view.rerender(h(ShiftPanel,{...props,mode:'approval'}));fireEvent.click(view.getByRole('button',{name:'Kiểm tra'}));fireEvent.click(await view.findByRole('button',{name:'Duyệt ca'}))
  await waitFor(()=>assert.ok(approved));assert.deepEqual(approved,['C1',{status:'APPROVED',approval_note:''}])
})
test('weekly calendar displays assigned shifts, selects the same record and navigates weeks',()=>{
  let selected,delta
  const shift={ma_ca_lam_viec:'S1',ngay_lam_viec:'2026-10-23',ma_khung_ca:'SANG',staff_name:'Lê Anh',staff_username:'leanh',gio_bat_dau:'07:00',gio_ket_thuc:'12:00'}
  const view=render(h(WorkforceCalendar,{items:[shift],weekStart:new Date(2026,9,19),mode:'manager',onSelectItem:value=>{selected=value},onChangeWeek:value=>{delta=value},onResetWeek(){}}))
  fireEvent.click(view.getByRole('button',{name:/Lê Anh/}));assert.equal(selected,shift)
  fireEvent.click(view.getByRole('button',{name:'Tuần sau'}));assert.equal(delta,1)
})


test('article page formats selected copy, previews it and submits the current document', async () => {
  let current, saved;
  function Fixture() {
    const [form,setForm]=React.useState({title:'Câu chuyện cà phê',description:'Mô tả',content:'Cà phê ngon',category:'BLOG',author_name:'An',is_published:false});
    current=form;
    return h(ArticleEditor,{form,setForm,onSubmit:e=>{e.preventDefault();saved=form},onBack(){},onImageChange(){},editing:true});
  }
  const view=render(h(Fixture));
  const editor=view.getByLabelText('Nội dung bài viết');
  editor.setSelectionRange(0,6);fireEvent.click(view.getByRole('button',{name:'In đậm'}));
  await waitFor(()=>assert.equal(current.content,'**Cà phê** ngon'));
  fireEvent.click(view.getByRole('button',{name:'Xem trước'}));
  assert.equal(view.getByText('Cà phê').tagName,'STRONG');
  fireEvent.click(view.getByRole('button',{name:'Cập nhật bài viết'}));
  assert.equal(saved.content,'**Cà phê** ngon');
  assert.equal(view.queryByRole('dialog'),null);
});
test('delivery details hide historical cashier data while POS details identify the creator',()=>{
  const order={ma_don_hang:'ORDER-2',loai_don_hang:'GIAO_TAN_NOI',ten_thu_ngan:'Thu ngân cũ',tong_tien:45000};
  const view=render(h(OrderDetailView,{order,onBack(){},onEdit(){}}));
  assert.equal(view.queryByText('Thu ngân cũ'),null);
  view.rerender(h(OrderDetailView,{order:{...order,loai_don_hang:'TAI_CHO'},onBack(){},onEdit(){}}));
  assert.ok(view.getByText('Nhân viên tạo đơn'));assert.ok(view.getByText('Thu ngân cũ'));
});


test('manager POS renders closed and opened sessions and preserves opening errors',async()=>{
  let opened;
  const props={isManager:true,posForm:{loai_don_hang:'TAI_CHO'},setPosForm(){},posItems:[],inventoryState:{items:[]},setPosCashInput(){},isCashMethod:true,posCashInsufficient:true,moCaKiosk:async value=>{opened=value;return{ok:false,error:'Ca đã thay đổi, tải lại'}}};
  const view=render(h(PosOrderPanel,props));
  fireEvent.change(view.getByLabelText('Tiền mặt đầu ca'),{target:{value:'100000'}});
  fireEvent.click(view.getByRole('button',{name:'Mở ca bán hàng'}));
  await waitFor(()=>assert.equal(opened.cash_open,100000));assert.ok(await view.findByRole('alert'));
  view.rerender(h(PosOrderPanel,{...props,activeKioskShift:{thoi_gian_mo_ca:new Date().toISOString(),tien_dau_ca:100000}}));
  assert.ok(view.getByText('Ca bán hàng đang mở'));
});
test('flash sale creates a multi-product program inline and edits per-product prices',async()=>{
  const originalFetch=globalThis.fetch;let saved;
  const menu=[{ma_san_pham:1,ten_san_pham:'Phin sữa',gia_ban:45000,hinh_anh_url:'/phin.png'},{ma_san_pham:2,ten_san_pham:'Trà sen',gia_ban:50000}];
  globalThis.fetch=async(url,options)=>{if(options?.method==='POST'){saved=JSON.parse(options.body);return{ok:true,json:async()=>({item:{id:1}})}}return{ok:true,json:async()=>String(url).includes('/menu/')?menu:{items:[]}}};
  try{
    const view=render(h(AdminFlashSalePanel));await waitFor(()=>assert.ok(view.getByText('Chưa có chương trình flash sale')));
    assert.equal(view.getByRole('button',{name:'Tạo flash sale'}).dataset.variant,'default');
    fireEvent.click(view.getByRole('button',{name:'Tạo flash sale'}));assert.equal(view.queryByRole('dialog'),null);
    fireEvent.change(view.getByLabelText('Tên chương trình'),{target:{value:'Giờ vàng'}});
    assert.equal(view.queryByLabelText('Giá flash sale cho Phin sữa (VNĐ)'),null);
    const search=view.getByRole('textbox',{name:'Tìm sản phẩm flash sale'});
    fireEvent.change(search,{target:{value:'phin'}});fireEvent.click(view.getByRole('button',{name:'Thêm Phin sữa'}));
    fireEvent.change(search,{target:{value:'tra'}});fireEvent.click(view.getByRole('button',{name:'Thêm Trà sen'}));
    const prices=view.getAllByLabelText(/Giá flash sale cho/);fireEvent.change(prices[0],{target:{value:'30000'}});fireEvent.change(prices[1],{target:{value:'35000'}});
    fireEvent.click(view.getByRole('button',{name:'Lưu chương trình'}));
    await waitFor(()=>assert.ok(saved));assert.deepEqual(saved.products,[{product_id:1,sale_price:30000},{product_id:2,sale_price:35000}]);
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('product ranking shows six criterion charts and the persisted final top five',async()=>{
  const originalFetch=globalThis.fetch;
  const product={ma_san_pham:1,ten_san_pham:'Món thật',score:25,total_qty:10,order_count:4,avg_rating:4.5,total_reviews:2,favorite_count:1,voucher_qty:3};
  globalThis.fetch=async()=>({ok:true,json:async()=>({items:[product],top:[product],weights:{purchases:1,orders:1,rating:1,reviews:1,favorites:1,vouchers:1}})});
  try{const view=render(h(AdminProductRankingPanel));await waitFor(()=>assert.ok(view.getByText('Top 5 món gợi ý trên web')));assert.equal(view.container.querySelectorAll('[data-chart-type="bar"]').length,6);assert.equal(view.getByRole('list').children.length,1);assert.ok(view.getByText('25'))}finally{cleanup();globalThis.fetch=originalFetch}
});
test('handover waits for actual driver acceptance and pending assignment remains editable',async()=>{
  const originalFetch=globalThis.fetch;let accepted=false;
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/staff/orders')?{orders:[{ma_don_hang:'ORDER1',loai_don_hang:'GIAO_TAN_NOI',trang_thai_don_hang:'DANG_GIAO',tong_tien:45000}]}:String(url).includes('/tracking/')?accepted?{assignment_status:'CONFIRMED',shipper:{id:'S1',full_name:'Tài xế A'}}:{assignment_status:'PENDING',assigned_shipper_id:'S1'}:[]});
  try{const view=render(h(StaffDeliveryPanel,{session:{user:{role:'MANAGER',coSoMa:'D9'}}}));await waitFor(()=>assert.ok(view.getByText('Chờ tài xế nhận')));fireEvent.click(view.getByRole('button',{name:/Đổi tài xế/}));assert.ok(await view.findByRole('button',{name:'Chỉ định tài xế'}));assert.equal(view.queryByText(/Đơn đã có tài xế/),null)}finally{cleanup();globalThis.fetch=originalFetch}
});


test('cancelled order keeps its badge and actual reason without progress or terminal duplicate',()=>{
  const order={ma_don_hang:'cancelled1',trang_thai_don_hang:'DA_HUY',loai_don_hang:'GIAO_TAN_NOI',tong_tien:45000,ngay_tao:'2026-10-24T08:00:00Z',ghi_chu:'Ít đá',lich_su_trang_thai:[{loai:'ORDER',trang_thai:'DA_HUY',ghi_chu:'Khách đổi địa chỉ ngoài vùng giao'}]};
  const view=render(h(OrdersPanel,{ordersState:{items:[order]},inventoryState:{items:[]}}));
  assert.ok(view.getByText('Đã hủy'));
  const reason=view.getByText('Khách đổi địa chỉ ngoài vùng giao');assert.ok(reason.closest('details'));assert.equal(reason.closest('details').open,false);assert.equal(view.container.querySelector('.order-cancellation-reason'),null);
  assert.equal(view.queryByRole('list',{name:/Tiến trình đơn hàng/}),null);assert.equal(view.queryByText('Đơn đã hủy'),null);
  assert.ok(view.getByRole('button',{name:'Thao tác đơn cancelled1'}));
  view.rerender(h(OrdersPanel,{ordersState:{items:[{...order,lich_su_trang_thai:[]}]},inventoryState:{items:[]}}));
  assert.equal(view.queryByText('Lý do hủy'),null);
  view.rerender(h(OrdersPanel,{ordersState:{items:[{...order,lich_su_trang_thai:[{loai:'ORDER',trang_thai:'DA_HUY',ghi_chu:'Du lieu cu duoc dong bo tu trang thai hien tai'}]}]},inventoryState:{items:[]}}));
  assert.equal(view.queryByText('Lý do hủy'),null);
});
test('flash sale suggests only matching unselected products and keeps selected prices while searching',async()=>{
  const originalFetch=globalThis.fetch;const menu=[{ma_san_pham:7,ten_san_pham:'Cà Phê Sữa',gia_ban:45000,danhMuc:{ten_danh_muc:'Cà phê'}},{ma_san_pham:8,ten_san_pham:'Đen đá',gia_ban:50000}];
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/menu/')?{data:menu}:{items:[]}});
  try{const view=render(h(AdminFlashSalePanel));await waitFor(()=>assert.ok(view.getByText('Chưa có chương trình flash sale')));fireEvent.click(view.getByRole('button',{name:'Tạo flash sale'}));
    const search=view.getByRole('textbox',{name:'Tìm sản phẩm flash sale'});
    assert.equal(view.queryByText('Cà Phê Sữa'),null);assert.equal(view.queryByText('Đen đá'),null);
    fireEvent.change(search,{target:{value:'  ca   phe  '}});
    assert.ok(view.getByRole('button',{name:'Thêm Cà Phê Sữa'}));assert.equal(view.queryByRole('button',{name:'Thêm Đen đá'}),null);
    fireEvent.click(view.getByRole('button',{name:'Thêm Cà Phê Sữa'}));assert.equal(search.value,'');const price=view.getByLabelText('Giá flash sale cho Cà Phê Sữa (VNĐ)');fireEvent.change(price,{target:{value:'30000'}});
    fireEvent.change(search,{target:{value:'ca phe'}});assert.equal(view.queryByRole('button',{name:'Thêm Cà Phê Sữa'}),null);assert.equal(price.value,'30.000');assert.ok(view.getByText('Giảm 33%'));
    fireEvent.change(search,{target:{value:'den da'}});assert.ok(view.getByRole('button',{name:'Thêm Đen đá'}));assert.equal(price.value,'30.000');
    fireEvent.click(view.getByRole('button',{name:'Bỏ Cà Phê Sữa'}));assert.equal(view.queryByLabelText('Giá flash sale cho Cà Phê Sữa (VNĐ)'),null);
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('campaign edit is a labelled full-width action that opens the existing inline form',async()=>{
  const originalFetch=globalThis.fetch;const product={product_id:1,ten_san_pham:'Phin sữa',sale_price:30000,original_price:45000};const campaign={id:9,title:'Giờ vàng',starts_at:'2026-10-24T00:00:00Z',ends_at:'2026-10-25T00:00:00Z',enabled:true,products:[product]};
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/menu/')?[{ma_san_pham:1,ten_san_pham:'Phin sữa',gia_ban:45000}]:{items:[campaign]}});
  try{const view=render(h(AdminFlashSalePanel));const edit=await view.findByRole('button',{name:'Chỉnh sửa'});assert.ok(edit.parentElement.classList.contains('campaign-program-actions'));assert.equal(edit.parentElement.classList.contains('operation-row-actions'),false);fireEvent.click(edit);assert.equal(view.getByLabelText('Tên chương trình').value,'Giờ vàng');assert.equal(view.getByLabelText('Giá flash sale cho Phin sữa (VNĐ)').value,'30.000');assert.equal(view.queryByRole('dialog'),null)}finally{cleanup();globalThis.fetch=originalFetch}
});


test('schedule request history uses shared status badges, filters and only cancels pending requests',async()=>{
  let removed;const prior=globalThis.confirm;globalThis.confirm=()=>true;
  const items=[{ma_ca_lam_viec:'P1',trang_thai_yeu_cau:'PENDING',ten_ca:'Ca chiều',ngay_lam_viec:'2026-10-26',gio_bat_dau:'12:00:00',gio_ket_thuc:'17:00:00',note:'Làm quầy'}, {ma_ca_lam_viec:'A1',trang_thai_yeu_cau:'APPROVED',ten_ca:'Ca sáng',ngay_lam_viec:'2026-10-25',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',ghi_chu_duyet:'Đã xếp lịch'}, {ma_ca_lam_viec:'R1',trang_thai_yeu_cau:'REJECTED',ten_ca:'Ca tối',ngay_lam_viec:'2026-10-24',gio_bat_dau:'17:00',gio_ket_thuc:'22:00',ghi_chu_duyet:'Đủ nhân sự'}];
  try{const view=render(h(StaffWorkShiftsPanel,{shiftRequestState:{items},onDeleteShiftRequest:id=>{removed=id}}));fireEvent.click(view.getByRole('button',{name:/Lịch sử đăng ký/}));
    assert.ok(view.getByRole('table'));assert.equal(view.container.querySelectorAll('.shift-request-table .workspace-status-badge').length,3);assert.ok(view.getByText('26/10/2026'));assert.ok(view.getByText('12:00 – 17:00'));assert.ok(view.getByText('Đủ nhân sự'));
    assert.equal(view.getAllByRole('button',{name:'Hủy yêu cầu'}).length,1);fireEvent.click(view.getByRole('button',{name:'Hủy yêu cầu'}));assert.equal(removed,'P1');
    fireEvent.click(view.getByRole('button',{name:/Từ chối1/}));assert.equal(view.container.querySelectorAll('tbody tr').length,1);assert.equal(view.queryByRole('button',{name:'Hủy yêu cầu'}),null);
  }finally{cleanup();globalThis.confirm=prior}
});
test('generic status update history is not presented as a cancellation reason',()=>{
  const order={ma_don_hang:'OLD1',trang_thai_don_hang:'DA_HUY',lich_su_trang_thai:[{loai:'ORDER',trang_thai:'DA_HUY',ghi_chu:'Nhan vien cua hang cap nhat trang thai'}]};
  const view=render(h(OrderDetailView,{order,onBack(){},onEdit(){}}));assert.equal(view.queryByText('Lý do hủy'),null);
  view.rerender(h(OrderDetailView,{order:{...order,ly_do_huy:'Không còn nhu cầu'},onBack(){},onEdit(){}}));const reason=view.getByText('Không còn nhu cầu');assert.ok(reason.closest('dl'));assert.equal(view.container.querySelector('.order-cancellation-reason'),null);
});


test('kiosk POS picker identifies every owned kiosk and only enters an operating kiosk',()=>{
  let selected;const view=render(h(KioskPosPicker,{kiosks:[{id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG',dia_chi:'12 Nguyễn Huệ'},{id:'k2',ten_kiosk:'Kiosk Quận 7',ma_kiosk:'KSK-007',trang_thai:'CHO_BAN_GIAO'}],onSelect:id=>selected=id}));
  assert.ok(view.getByText('Kiosk Quận 1'));assert.ok(view.getByText('Kiosk Quận 7'));assert.ok(view.getByText('12 Nguyễn Huệ'));
  assert.equal(view.getByRole('button',{name:'Chưa thể bán hàng'}).disabled,true);fireEvent.click(view.getByRole('button',{name:'Vào bán hàng'}));assert.equal(selected,'k1');assert.equal(view.queryByRole('combobox'),null);
});
test('kiosk calendar preserves slot assignment, approval and attendance callbacks; staff cannot manage colleagues',async()=>{
  let assignment,approved,attendance;const day={dateKey:'2026-10-26',date:new Date(2026,9,26),label:'Thứ 2'};
  const templates=[{id:'SANG',name:'Ca sáng',start:'06:00',end:'12:00',icon:()=>null}];
  const items=[{ma_ca_lam_viec:'r1',ngay_lam_viec:day.dateKey,ma_khung_ca:'SANG',staff_name:'An',staff_username:'an',trang_thai_yeu_cau:'PENDING'},{ma_ca_lam_viec:'a1',ngay_lam_viec:day.dateKey,ma_khung_ca:'SANG',staff_name:'Bình',staff_username:'binh',trang_thai_yeu_cau:'APPROVED',trang_thai_cham_cong:'ASSIGNED'}];
  const props={days:[day],templates,items,onAssign:(date,slot)=>assignment=[date,slot],onApprove:id=>approved=id,onDelete:()=>{},onReject:()=>{},onAttendance:(id,value)=>attendance=[id,value]};
  const view=render(h(KioskScheduleGrid,props));fireEvent.click(view.getByRole('button',{name:'Phân Ca sáng 2026-10-26'}));assert.deepEqual(assignment,['2026-10-26','SANG']);assert.equal(view.queryByRole('combobox'),null);fireEvent.click(view.getByRole('button',{name:'Xem ca An'}));fireEvent.click(view.getByRole('button',{name:'Duyệt'}));assert.equal(approved,'r1');
  fireEvent.click(view.getByRole('button',{name:'Xem ca Bình'}));fireEvent.click(view.getByRole('combobox',{name:'Chấm công Bình'}));fireEvent.click(await view.findByRole('option',{name:'Có mặt'}));assert.deepEqual(attendance,['a1','PRESENT']);
  view.rerender(h(KioskScheduleGrid,{...props,readOnly:true,canAssign:()=>false,currentUsername:'an'}));assert.ok(view.getByText('An (Tôi)'));assert.equal(view.queryByRole('combobox'),null);assert.equal(view.queryByRole('button'),null);
});

test('kiosk owner enters POS through kiosk cards and receives the shared workspace header',async()=>{
  const originalFetch=globalThis.fetch;
  const kiosks=[{id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG',loai_kiosk:'KIOSK_CO_DINH',dia_chi:'12 Nguyễn Huệ'},{id:'k2',ten_kiosk:'Kiosk Quận 7',ma_kiosk:'KSK-007',trang_thai:'TAM_NGUNG'}];
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/franchise/kiosk/cua-toi')?kiosks:String(url).includes('/wallet/info')?{so_du_vi:0,giao_dich:[]}:String(url).includes('/kiosk-shifts/active')?null:[]});
  try{const view=render(h(FranchiseePortal,{session:{token:'test-token',user:{id:'owner',hoTen:'Chủ kiosk',role:'FRANCHISEE'}},onLogout:()=>{}}));
    fireEvent.click(view.getByRole('button',{name:'Bán hàng POS'}));await waitFor(()=>assert.ok(view.getByRole('region',{name:'Chọn kiosk bán hàng'})));
    assert.ok(view.getByRole('navigation',{name:'Đường dẫn'}));assert.equal(view.queryByRole('combobox'),null);
    assert.equal(view.queryByText('Kiosk Chưa Hoạt Động'),null);
    fireEvent.click(view.getByRole('button',{name:'Vào bán hàng'}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Đổi kiosk'})));
    assert.ok(view.container.querySelector('.kiosk-context-summary'));assert.equal(view.queryByRole('region',{name:'Chọn kiosk bán hàng'}),null);assert.equal(view.queryByRole('heading',{name:'Chọn kiosk bán hàng'}),null);
    fireEvent.click(view.getByRole('button',{name:'Đổi kiosk'}));assert.ok(view.getByRole('region',{name:'Chọn kiosk bán hàng'}));
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('kiosk staff sees only the assigned kiosk and shares the sidebar and breadcrumb',async()=>{
  const originalFetch=globalThis.fetch;const calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));return{ok:true,json:async()=>String(url).includes('/users/me')?{co_so_ma:'KSK-005',co_so_ten:'Kiosk được gắn'}:String(url).includes('/franchise/kiosk/public')?[{ma_kiosk:'KSK-005',ten_kiosk:'Kiosk được gắn',loai_kiosk:'KIOSK_CO_DINH'}]:String(url).includes('/kiosk-shifts/active')?null:[]}};
  try{const view=render(h(FranchiseStaffPortal,{session:{token:'test-token',user:{tenDangNhap:'staff5',coSoMa:'KSK-005',coSoTen:'Kiosk được gắn',role:'KIOSK_STAFF'}},onLogout:()=>{}}));
    await waitFor(()=>assert.ok(view.getByText('Đang hoạt động')));assert.ok(view.getByRole('navigation',{name:'Đường dẫn'}));assert.ok(view.container.querySelector('.workspace-sidebar'));assert.equal(view.queryByText('Chọn kiosk bán hàng'),null);assert.equal(view.queryByRole('button',{name:'Đổi kiosk'}),null);
    assert.equal(calls.some(url=>url.includes('KSK-011')),false);assert.ok(view.getByRole('heading',{name:'Bán hàng POS Kiosk'}));
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('workspace login shows the complete franchise management role label',()=>{
  const view=render(h(LoginScreen,{loginForm:{username:'',password:''},setLoginForm:()=>{},loginStatus:{loading:false},onLogin:()=>{}}));
  assert.ok(view.getByRole('tab',{name:'Quản lý nhượng quyền'}));assert.equal(view.getAllByRole('tab').length,5);
});


test('staff kiosk loading and network failures do not misreport an inactive kiosk and can retry',async()=>{
  const originalFetch=globalThis.fetch;let rejectLoad;let failing=true;
  globalThis.fetch=async url=>{if(String(url).includes('/franchise/kiosk/public')){if(failing)return new Promise((resolve,reject)=>{rejectLoad=reject});return{ok:true,json:async()=>[{ma_kiosk:'KSK-005',ten_kiosk:'Kiosk được gắn',loai_kiosk:'KIOSK_CO_DINH'}]}}return{ok:true,json:async()=>String(url).includes('/users/me')?{}:String(url).includes('/kiosk-shifts/active')?null:[]}};
  try{const view=render(h(FranchiseStaffPortal,{session:{token:'test-token',user:{tenDangNhap:'staff5',coSoMa:'KSK-005',coSoTen:'Kiosk được gắn',role:'KIOSK_STAFF'}},onLogout:()=>{}}));assert.ok(view.getByText('Đang tải thông tin kiosk…'));assert.equal(view.queryByText('Kiosk Chưa Hoạt Động'),null);
    rejectLoad(new Error('offline'));const retry=await view.findByRole('button',{name:'Thử tải lại kiosk'});assert.equal(view.queryByText('Kiosk Chưa Hoạt Động'),null);failing=false;fireEvent.click(retry);assert.ok(await view.findByText('Đang hoạt động'));
  }finally{cleanup();globalThis.fetch=originalFetch}
});


test('kiosk selling switch persists branch scope and preserves stock; another kiosk keeps its own flag',async()=>{
  const originalFetch=globalThis.fetch;let written;
  globalThis.fetch=async(url,options)=>{if(options?.method==='PATCH'){written=JSON.parse(options.body);return{ok:true,json:async()=>written}}return{ok:true,json:async()=>String(url).includes('KSK-001')?[{ma_san_pham:7,so_luong_ton:17,muc_canh_bao:3,dang_kinh_doanh:true}]:[]}};
  try{const hook=renderHook(({branch})=>useKioskAvailability(branch,'test-token'),{initialProps:{branch:'KSK-001'}});await waitFor(()=>assert.equal(hook.result.current.ready,true));const product={ma_san_pham:7,trang_thai:true};
    await act(async()=>hook.result.current.toggle(product,false));assert.deepEqual(written,{branch_code:'KSK-001',dang_kinh_doanh:false});assert.equal(hook.result.current.isSelling(product),false);
    hook.rerender({branch:'KSK-002'});await waitFor(()=>assert.equal(hook.result.current.ready,true));assert.equal(hook.result.current.isSelling(product),true);assert.equal(hook.result.current.isSelling({...product,trang_thai:false}),false);
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('failed kiosk availability save keeps the previous flag and exposes a retryable error',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>options?.method==='PATCH'?{ok:false,json:async()=>({message:'Lưu thất bại'})}:{ok:true,json:async()=>[]};
  try{const hook=renderHook(()=>useKioskAvailability('KSK-001','test-token'));await waitFor(()=>assert.equal(hook.result.current.ready,true));const product={ma_san_pham:7,trang_thai:true};await act(async()=>hook.result.current.toggle(product,false));assert.equal(hook.result.current.isSelling(product),true);assert.equal(hook.result.current.error,'Lưu thất bại');assert.equal(hook.result.current.savingId,null)}finally{cleanup();globalThis.fetch=originalFetch}
});
test('kiosk page has one scope selector and menu uses the shared selling switch',async()=>{
  const originalFetch=globalThis.fetch;let saved;
  const kiosks=[{id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG',loai_kiosk:'KIOSK_CO_DINH'},{id:'k2',ten_kiosk:'Kiosk Quận 7',ma_kiosk:'KSK-007',trang_thai:'DANG_HOAT_DONG',loai_kiosk:'KIOSK_CO_DINH'}];
  globalThis.fetch=async(url,options)=>{const path=String(url);if(options?.method==='PATCH'){saved=JSON.parse(options.body);return{ok:true,json:async()=>saved}}return{ok:true,json:async()=>path.includes('/franchise/kiosk/cua-toi')?kiosks:path.includes('/wallet/info')?{so_du_vi:0,giao_dich:[]}:path.includes('/menu/san-pham')?[{ma_san_pham:7,ten_san_pham:'Phin sữa',gia_ban:45000,trang_thai:true,danh_muc:'Cà phê'}]:path.includes('/kiosk-shifts/active')?null:[]}};
  try{const view=render(h(FranchiseePortal,{session:{token:'test-token',user:{hoTen:'Chủ kiosk',role:'FRANCHISEE'}},onLogout:()=>{}}));fireEvent.click(view.getByRole('button',{name:'Thực đơn'}));const toggle=await view.findByRole('switch',{name:'Bán Phin sữa'});await waitFor(()=>assert.equal(toggle.disabled,false));assert.ok(toggle.classList.contains('workspace-switch'));assert.equal(view.container.querySelector('.console-context-bar'),null);assert.equal(view.getAllByRole('button',{name:/Kiosk áp dụng:/}).length,1);
    fireEvent.click(toggle);await waitFor(()=>assert.equal(saved.dang_kinh_doanh,false));assert.equal(saved.branch_code,'KSK-001');assert.equal(toggle.getAttribute('aria-checked'),'false');
    fireEvent.click(view.getByRole('button',{name:'Quản lý nhân viên'}));assert.equal(view.getAllByRole('button',{name:/Kiosk áp dụng:/}).length,1);assert.equal(view.queryByRole('combobox'),null);assert.ok(view.getByRole('button',{name:'Chia sẻ doanh thu'}));assert.equal(view.queryByRole('button',{name:'Royalty'}),null);
  }finally{cleanup();globalThis.fetch=originalFetch}
});


test('campaign editing normalizes decimal prices and saves against the admin selling price',async()=>{
  const originalFetch=globalThis.fetch;let saved;const reads=[];
  const campaign={id:2,title:'Giờ vàng cà phê',starts_at:'2026-10-24T00:00:00Z',ends_at:'2026-10-25T00:00:00Z',enabled:true,products:[{product_id:7,ten_san_pham:'Specialty Coffee Nóng',sale_price:'39000.00',original_price:'69000.00'}]};
  globalThis.fetch=async(url,options)=>{const path=String(url);reads.push(path);if(options?.method==='PUT'){saved=JSON.parse(options.body);return{ok:true,json:async()=>({item:campaign})}}return{ok:true,json:async()=>path.endsWith('/menu/items')?{items:[{id:'7',name:'Specialty Coffee Nóng',price:69000,original_price:99000,dang_ban:true}]}:{items:[campaign]}}};
  try{const view=render(h(AdminFlashSalePanel));fireEvent.click(await view.findByRole('button',{name:'Chỉnh sửa'}));
    const price=view.getByLabelText('Giá flash sale cho Specialty Coffee Nóng (VNĐ)');assert.equal(price.value,'39.000');
    fireEvent.change(view.getByLabelText('Tên chương trình'),{target:{value:'Trung thu ấm áp'}});
    fireEvent.change(price,{target:{value:'39.000'}});fireEvent.click(view.getByRole('button',{name:'Lưu chương trình'}));
    await waitFor(()=>assert.ok(saved));assert.equal(saved.title,'Trung thu ấm áp');assert.deepEqual(saved.products,[{product_id:7,sale_price:39000}]);assert.ok(reads.some(path=>path.endsWith('/menu/items')));assert.equal(reads.some(path=>path.endsWith('/menu/san-pham')),false);
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('flash sale rejects a price below retail but above the actual selling price before submitting',async()=>{
  const originalFetch=globalThis.fetch;let wrote=false;
  const campaign={id:3,title:'Ưu đãi',starts_at:'2026-10-24T00:00:00Z',ends_at:'2026-10-25T00:00:00Z',enabled:true,products:[{product_id:7,sale_price:30000}]};
  globalThis.fetch=async(url,options)=>{if(options?.method==='PUT')wrote=true;return{ok:true,json:async()=>String(url).endsWith('/menu/items')?{items:[{id:'7',name:'Phin sữa',price:45000,original_price:69000,dang_ban:true}]}:{items:[campaign]}}};
  try{const view=render(h(AdminFlashSalePanel));fireEvent.click(await view.findByRole('button',{name:'Chỉnh sửa'}));fireEvent.change(view.getByLabelText('Giá flash sale cho Phin sữa (VNĐ)'),{target:{value:'50000'}});fireEvent.click(view.getByRole('button',{name:'Lưu chương trình'}));assert.ok(view.getByRole('alert').textContent.includes('45.000'));assert.ok(view.getByRole('alert').textContent.includes('Phin sữa'));assert.equal(wrote,false)}finally{cleanup();globalThis.fetch=originalFetch}
});
test('header kiosk scope is shared across features, persists through wallet and filters staff',async()=>{
  const originalFetch=globalThis.fetch;const calls=[];
  const kiosks=[{id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG'},{id:'k2',ten_kiosk:'Kiosk Quận 7',ma_kiosk:'KSK-007',trang_thai:'DANG_HOAT_DONG'}];
  globalThis.fetch=async url=>{const path=String(url);calls.push(path);return{ok:true,json:async()=>path.includes('/franchise/kiosk/cua-toi')?kiosks:path.includes('/wallet/info')?{so_du_vi:0,giao_dich:[]}:path.includes('/kiosk-shifts/active')?null:[]}};
  try{const view=render(h(FranchiseePortal,{session:{token:'test-token',user:{hoTen:'Chủ kiosk',role:'FRANCHISEE'}},onLogout(){}}));
    const scope=await view.findByRole('button',{name:'Kiosk áp dụng: Kiosk Quận 1'});assert.ok(scope.closest('header.operational-header'));assert.equal(view.container.querySelector('.operational-page-heading .kiosk-scope-trigger'),null);
    fireEvent.click(scope);await waitFor(()=>assert.ok(document.querySelector('.kiosk-scope-popover')));fireEvent.click(Array.from(document.querySelectorAll('.kiosk-scope-options button')).find(button=>button.textContent.includes('KSK-007')));
    assert.ok(view.getByRole('button',{name:'Kiosk áp dụng: Kiosk Quận 7'}));
    fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes('Quản lý nhân viên')));await waitFor(()=>assert.ok(calls.some(path=>path.endsWith('/franchise/staff?kiosk_id=k2'))));assert.equal(view.queryByRole('combobox'),null);
    fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes('Ví điện tử')));assert.equal(view.queryByRole('button',{name:/Kiosk áp dụng:/}),null);
    fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes('Thực đơn')));assert.ok(view.getByRole('button',{name:'Kiosk áp dụng: Kiosk Quận 7'}));
    fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes('Bán hàng POS')));assert.equal(view.container.querySelector('.operational-page-heading h1')?.textContent,'Bán hàng POS');assert.equal(view.queryByRole('heading',{name:'Chọn kiosk bán hàng'}),null);
  }finally{cleanup();globalThis.fetch=originalFetch}
});


test('a pending reconciliation allows a new selling shift and reviewing a historical report keeps its id',()=>{
  let opened=false,reviewed
  const report={id:'old-shift',co_so_ma:'KSK-1',trang_thai:'CLOSE_PENDING',staff_name:'An',staff_username:'an',thoi_gian_mo_ca:'2026-10-24T01:00:00Z',close_requested_at:'2026-10-24T07:00:00Z',tien_dau_ca:100000,tien_mat_ky_vong:150000,tien_cuoi_ca:149000,chenh_lech:-1000}
  const props={active:{has_open_shift:false},history:[report],onOpen:()=>opened=true,onReview:(decision,shift)=>reviewed=[decision,shift.id]}
  const view=render(h(KioskShiftPanel,props));fireEvent.click(view.getByRole('button',{name:'Mở ca mới'}));assert.equal(opened,true)
  fireEvent.click(view.getByRole('button',{name:'Kiểm tra đối soát'}));fireEvent.click(view.getByRole('button',{name:'Xác nhận đối soát'}));assert.deepEqual(reviewed,['APPROVE','old-shift'])
  view.rerender(h(KioskShiftPanel,{...props,active:{has_open_shift:true,active_shift:{id:'new-shift',staff_name:'Bình',staff_username:'binh'},live_stats:{}}}));fireEvent.click(view.getByRole('button',{name:'Cần kiểm tra lại'}));assert.deepEqual(reviewed,['REJECT','old-shift']);assert.ok(view.getByRole('heading',{name:'Bình'}))
})
test('debt records preserve dates, distinguish debt types and filter before payment',async()=>{
  let paid
  const debts=[{id:'initial-1',loai_phat_sinh:'KHOI_TAO',ngay_tao:'2026-10-20',han_thanh_toan:'2026-10-30',so_tien:5000000,trang_thai:'DA_THANH_TOAN'},{id:'supply-1',loai_phat_sinh:'NGUYEN_LIEU',ngay_tao:'2026-10-21',han_thanh_toan:'2026-10-31',so_tien:100000,phi_phat_tre_han:1000,trang_thai:'CON_NO'}]
  const view=render(h(KioskDebtPanel,{debts,onWalletPay:debt=>paid=debt.id}));assert.ok(view.getByText('Tạo 21/10/2026'));assert.ok(view.getByText('101.000đ'));assert.ok(view.getByText('Phí nhượng quyền ban đầu'))
  fireEvent.change(view.getByRole('textbox',{name:'Tìm công nợ'}),{target:{value:'nguyên liệu'}});assert.equal(view.queryByText('Phí nhượng quyền ban đầu'),null);fireEvent.click(view.getByRole('button',{name:'Ví'}));await waitFor(()=>assert.equal(paid,'supply-1'))
})
test('revenue share calculation updates only its data without remounting the workspace',async()=>{
  const originalFetch=globalThis.fetch,calls=[];let computed=false,finish
  const gate=new Promise(resolve=>finish=resolve),kiosk={id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG'}
  globalThis.fetch=async(url,options={})=>{const path=String(url);calls.push(path);if(path.includes('/royalty/tinh-thang')){await gate;computed=true}return{ok:true,json:async()=>path.includes('/franchise/kiosk/cua-toi')?[kiosk]:path.includes('/wallet/info')?{so_du_vi:0,giao_dich:[]}:path.includes('/royalty/cua-toi')?(computed?[{id:'report',kiosk_id:'k1',thang:'2026-09',doanh_thu_thuc_te:1000000,ty_le_royalty:5,so_tien_royalty:50000,trang_thai:'CON_NO'}]:[]):[]}}
  try{const view=render(h(FranchiseePortal,{session:{token:'test',user:{hoTen:'Chủ kiosk',role:'FRANCHISEE'}},onLogout(){}}));await view.findAllByText('Kiosk Quận 1');fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes('Chia sẻ doanh thu')));fireEvent.click(view.getByRole('button',{name:'Tính chia sẻ doanh thu tháng trước'}));assert.equal(view.getByRole('button',{name:'Đang tính…'}).disabled,true);assert.ok(view.getByRole('heading',{name:'Chia sẻ doanh thu'}));await act(async()=>finish());await view.findByText('Tháng 2026-09');assert.equal(calls.filter(path=>path.includes('/franchise/kiosk/cua-toi')).length,1);assert.equal(view.queryByRole('status',{name:'Đang tải tổng quan'}),null)}finally{finish();cleanup();globalThis.fetch=originalFetch}
})

test('kiosk staff directory stays at five essential columns, POS categories resolve catalog objects and order refresh stays scoped',async()=>{
  const originalFetch=globalThis.fetch,calls=[]
  const kiosk={id:'k1',ten_kiosk:'Kiosk Quận 1',ma_kiosk:'KSK-001',trang_thai:'DANG_HOAT_DONG',loai_kiosk:'KIOSK_CO_DINH'}
  globalThis.fetch=async url=>{const path=String(url);calls.push(path);return{ok:true,json:async()=>path.includes('/franchise/kiosk/cua-toi')?[kiosk]:path.includes('/wallet/info')?{so_du_vi:0,giao_dich:[]}:path.includes('/franchise/staff')?[{id:'u1',ma_nguoi_dung:'u1',ho_ten:'Lê An',ten_dang_nhap:'lean',email:'lean@example.vn',kiosk_id:'k1',trang_thai:'ACTIVE',pos_permissions:['pos_allow_order']}]:path.includes('/menu/san-pham')?[{ma_san_pham:7,ten_san_pham:'Cà phê thử',gia_ban:69000,danhMuc:{ten_danh_muc:'Americano'}}]:path.includes('/kiosk-shifts/active')?{has_open_shift:true,active_shift:{id:'shift',staff_name:'An',staff_username:'an'},live_stats:{}}:path.includes('/staff/orders?')?{orders:[]}:[]}}
  try{const view=render(h(FranchiseePortal,{session:{token:'test',user:{hoTen:'Chủ kiosk',role:'FRANCHISEE'}},onLogout(){}}));await view.findAllByText('Kiosk Quận 1');const nav=name=>fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes(name)))
    nav('Quản lý nhân viên');await view.findByText('Lê An');assert.deepEqual(view.getAllByRole('columnheader').map(node=>node.textContent),['Nhân viên','Liên hệ','Kiosk','Trạng thái','Hành động']);assert.equal(view.getAllByRole('heading',{name:'Quản lý nhân viên'}).length,1);assert.equal(view.queryByText(/quyền POS$/),null);assert.ok(view.getByRole('button',{name:'Sửa nhân viên Lê An'}))
    nav('Bán hàng POS');fireEvent.click(await view.findByRole('button',{name:'Vào bán hàng'}));await view.findByText('Cà phê thử');assert.equal(view.container.querySelector('.kiosk-sale-product [data-ui="badge"]').textContent,'Americano');assert.ok(view.getByRole('button',{name:'Americano 1'}))
    nav('Đơn bán hàng');await view.findByText('Chưa có đơn bán hàng nào trong thời gian này.');assert.equal(calls.filter(path=>path.includes('/staff/orders?')).length,1);nav('Quản lý nhân viên');nav('Đơn bán hàng');await waitFor(()=>assert.ok(view.getByRole('button',{name:'Tải lại'})));assert.equal(calls.filter(path=>path.includes('/staff/orders?')).length,1);fireEvent.click(view.getByRole('button',{name:'Tải lại'}));await waitFor(()=>assert.equal(calls.filter(path=>path.includes('/staff/orders?')).length,2));assert.ok(calls.filter(path=>path.includes('/staff/orders?')).every(path=>path.includes('branch_code=KSK-001')))
  }finally{cleanup();globalThis.fetch=originalFetch}
})

test('kiosk receipt requires sufficient cash, keeps failures editable and replaces payment with confirmed success', async () => {
  let submits=0
  const product={ma_san_pham:7,ten_san_pham:'Cà phê thử',gia_ban:65000,danhMuc:{ten_danh_muc:'Americano'}}
  function Counter() {
    const [cart,setCart]=React.useState([]),[cash,setCash]=React.useState(''),[result,setResult]=React.useState(null),[busy,setBusy]=React.useState(false)
    return h(KioskPosTerminal,{ products:[product],cart,total:cart.reduce((sum,item)=>sum+item.price*item.quantity,0),payment:'TIEN_MAT',cash,result,submitting:busy,onCash:setCash,onResult:setResult,onAdd:()=>setCart([{id:7,productId:7,name:product.ten_san_pham,price:65000,quantity:1}]),onQuantity:(id,qty)=>setCart(qty>0?[{...cart[0],quantity:qty}]:[]),onRemove:()=>setCart([]),onClear:()=>setCart([]),onCheckout:async()=>{submits++;setBusy(true);await Promise.resolve();setBusy(false);setResult(submits===1?{success:false,error:'Mạng tạm gián đoạn'}:kioskCheckoutResult({order:{ma_don_hang:'receipt-7',tong_tien:65000,trang_thai_don_hang:'HOAN_THANH',trang_thai_thanh_toan:'DA_THANH_TOAN',tien_khach_dua:100000,tien_thoi:35000}},{total:65000,method:'TIEN_MAT',cash:100000}));if(submits>1)setCart([])}})
  }
  const view=render(h(Counter))
  fireEvent.click(view.getByRole('button',{name:'Thêm Cà phê thử'}));assert.equal(view.getByRole('button',{name:/Thu tiền & hoàn tất/}).disabled,true)
  fireEvent.change(view.getByLabelText('Tiền khách đưa'),{target:{value:'1000'}});fireEvent.blur(view.getByLabelText('Tiền khách đưa'));assert.ok(view.getByRole('alert').textContent.includes('64.000đ'))
  fireEvent.click(view.getByRole('button',{name:'100.000đ'}));fireEvent.click(view.getByRole('button',{name:/Thu tiền & hoàn tất/}));await view.findByText('Mạng tạm gián đoạn');assert.ok(view.getByRole('button',{name:'Tăng Cà phê thử'}))
  fireEvent.click(view.getByRole('button',{name:/Thu tiền & hoàn tất/}));await view.findByText('Thanh toán thành công');assert.ok(view.getByText('35.000đ'));assert.equal(view.queryByLabelText('Tiền khách đưa'),null)
  fireEvent.click(view.getByRole('button',{name:'Tạo đơn mới'}));assert.ok(view.getByText('Đơn hàng đang trống'));assert.equal(view.queryByText('Thanh toán thành công'),null)
})
test('QR receipt waits for verified payment and never shows premature success', async () => {
  const waiting=kioskCheckoutResult({order:{ma_don_hang:'qr-1',tong_tien:65000,trang_thai_don_hang:'MOI_TAO',trang_thai_thanh_toan:'CHO_XU_LY'},payment_details:{qr_img_url:'https://example.test/qr.png'}},{total:65000,method:'NGAN_HANG_QR'})
  function Counter(){const [result,setResult]=React.useState(waiting);return h(KioskPosTerminal,{result,onResult:setResult,cart:[],products:[],onCheckPayment:async()=>({...waiting.order,trang_thai_don_hang:'HOAN_THANH',trang_thai_thanh_toan:'DA_THANH_TOAN'})})}
  const view=render(h(Counter));assert.ok(view.getByText('Chờ thanh toán'));assert.ok(view.getByAltText('Mã QR thanh toán đơn hàng'));assert.equal(view.queryByText('Thanh toán thành công'),null)
  fireEvent.click(view.getByRole('button',{name:'Kiểm tra thanh toán'}));assert.ok(await view.findByText('Thanh toán thành công'))
  assert.equal(kioskSaleStatus({trang_thai_thanh_toan:'DA_HOAN_TIEN'}).label,'Đã hoàn tiền');assert.equal(kioskSaleStatus({trang_thai_don_hang:'DANG_CHUAN_BI'}).label,'Chờ thanh toán')
})


test('kiosk staff has one header location, compact account and a shared password modal', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/users/me')?{id:'staff-1',ten_dang_nhap:'lean',ho_ten:'Lê An',email:'an@example.vn',so_dien_thoai:'0901234567'}:String(url).includes('/franchise/kiosk/public')?[{ma_kiosk:'KSK-005',ten_kiosk:'Kiosk được gắn',loai_kiosk:'KIOSK_CO_DINH'}]:[]});
  try {
    const view=render(h(FranchiseStaffPortal,{session:{token:'test',user:{id:'staff-1',tenDangNhap:'lean',hoTen:'Lê An',coSoMa:'KSK-005',coSoTen:'Kiosk được gắn',role:'KIOSK_STAFF'}},onLogout(){}}));
    const header=await view.findByLabelText('Kiosk đang làm việc');assert.ok(header.closest('header.operational-header'));assert.ok(header.textContent.includes('Kiosk được gắn'));assert.equal(view.container.querySelector('.operational-page .kiosk-context-summary'),null);
    assert.ok(view.getByRole('button',{name:'Quản lý ca làm việc'}));assert.equal(view.queryByRole('button',{name:'Mở / Chốt ca Kiosk'}),null);
    fireEvent.click(view.getByRole('button',{name:'Tài khoản cá nhân'}));await view.findByText('an@example.vn',{selector:'dd'});assert.equal(view.container.querySelector('.operational-page input[type="password"]'),null);assert.equal(view.queryByText('Quyền hạn vận hành được cấp phép'),null);
    fireEvent.click(view.getByRole('button',{name:'Đổi mật khẩu'}));assert.ok(await view.findByRole('heading',{name:'Đổi mật khẩu'}));assert.ok(view.getByPlaceholderText('Nhập mật khẩu đang sử dụng'));
  } finally {cleanup();globalThis.fetch=originalFetch}
});
test('staff close form shows counted difference, protects another cashier and permits a new session after close submission', () => {
  const active={has_open_shift:true,active_shift:{id:'s1',staff_username:'an',staff_name:'An',tien_dau_ca:500000,thoi_gian_mo_ca:'2026-10-24T05:00:00Z'},live_stats:{total_revenue:65000,total_orders:1,expected_cash:565000}};
  let submitted=0;
  function Panel({current=active}) {const [cash,setCash]=React.useState('');return h(KioskStaffShiftManagement,{active:current,history:[],username:'an',cashClose:cash,onCashClose:setCash,cashOpen:'',onOpen(){},onClose:event=>{event.preventDefault();submitted++},onRefresh(){},onPos(){},onNote(){},note:''})}
  const view=render(h(Panel));assert.ok(view.getByRole('form',{name:'Kiểm đếm và chốt ca'}));assert.equal(view.getByRole('button',{name:'Chốt ca & gửi đối soát'}).disabled,true);
  fireEvent.change(view.getByLabelText('Tiền mặt thực tế cuối ca (VNĐ)'),{target:{value:'560000'}});assert.ok(view.getByText('Thiếu so với hệ thống'));assert.ok(view.getByText('5.000đ'));fireEvent.submit(view.getByRole('form',{name:'Kiểm đếm và chốt ca'}));assert.equal(submitted,1);
  view.rerender(h(Panel,{current:{has_open_shift:true,active_shift:{...active.active_shift,staff_username:'other'},live_stats:active.live_stats}}));assert.equal(view.queryByRole('form',{name:'Kiểm đếm và chốt ca'}),null);
  view.rerender(h(Panel,{current:{has_open_shift:false}}));assert.ok(view.getByRole('form',{name:'Mở ca mới'}));assert.equal(view.queryByText(/Quy trình kiểm/),null);
});
test('staff registration keeps a single date choice, submits the selected slot and prevents duplicate requests', () => {
  const templates=[{id:'SANG',name:'Ca Sáng',start:'06:00',end:'12:00',icon:()=>null},{id:'CHIEU',name:'Ca Chiều',start:'12:00',end:'18:00',icon:()=>null}];
  const nextWeek={nextMondayFmt:'26/10',nextSundayFmt:'01/11',nextMondayStr:'2026-10-26',nextSundayStr:'2026-11-01',isSunday:false,nextDays:[{dateKey:'2026-10-26',label:'Thứ 2',display:'26/10'},{dateKey:'2026-10-27',label:'Thứ 3',display:'27/10'}]};
  let submitted;
  function Panel({requests=[]}){const [form,setForm]=React.useState({shift_date:'2026-10-26',shift_code:'SANG',note:''});return h(KioskStaffSchedulePanel,{nextWeek,templates,form,onFormChange:setForm,onSubmit:event=>{event.preventDefault();submitted=form},requests,days:[],onDelete(){},onWeekChange(){},onRefresh(){}})}
  const view=render(h(Panel));fireEvent.click(view.getByRole('button',{name:'Thứ 3 27/10'}));fireEvent.click(view.getByRole('radio',{name:'Ca Chiều 12:00–18:00'}));fireEvent.change(view.getByLabelText('Ghi chú (không bắt buộc)'),{target:{value:'Đăng ký ca chiều'}});fireEvent.submit(view.getByRole('form',{name:'Đăng ký ca làm việc'}));assert.deepEqual(submitted,{shift_date:'2026-10-27',shift_code:'CHIEU',note:'Đăng ký ca chiều'});assert.equal(view.container.querySelector('input[type="date"]'),null);
  view.rerender(h(Panel,{requests:[{id:'r1',ngay_lam_viec:'2026-10-27',ma_khung_ca:'CHIEU',trang_thai_yeu_cau:'PENDING'}]}));assert.equal(view.getByRole('button',{name:'Gửi đăng ký'}).disabled,true);assert.ok(view.getByText(/Bạn đã đăng ký ca chiều/));
});

test('kiosk profile editor exposes only name and phone, validates contacts and saves the authenticated employee',async()=>{
  const originalFetch=globalThis.fetch;let written;
  globalThis.fetch=async(url,options={})=>{if(options.method==='PATCH'){written={url:String(url),body:JSON.parse(options.body),authorization:options.headers.Authorization};return{ok:true,json:async()=>({user:{ho_ten:'An mới',so_dien_thoai:'0901234567'}})}}return{ok:true,json:async()=>String(url).includes('/users/me')?{id:'staff-profile',ho_ten:'An',so_dien_thoai:'0999999',vai_tro:'FRANCHISE_STAFF'}:[]}};
  try{const view=render(h(FranchiseStaffPortal,{session:{token:'employee-token',user:{id:'staff-profile',hoTen:'An',vaiTro:'FRANCHISE_STAFF',tenDangNhap:'an',coSoMa:'KSK-1'}},onLogout(){}}));fireEvent.click(view.getByRole('button',{name:'Tài khoản cá nhân'}));await view.findByText('0999999');fireEvent.click(view.getByRole('button',{name:'Chỉnh sửa hồ sơ'}));const dialog=view.getByRole('dialog',{name:'Chỉnh sửa hồ sơ'});assert.equal(dialog.querySelectorAll('input').length,2);assert.equal(view.queryByText('Tên doanh nghiệp hoặc đơn vị'),null);
    fireEvent.blur(view.getByRole('textbox',{name:'Số điện thoại'}));assert.ok(view.getByText(/Vui lòng nhập số điện thoại Việt Nam/));fireEvent.submit(dialog.querySelector('form'));assert.equal(written,undefined);
    fireEvent.change(view.getByRole('textbox',{name:'Họ và tên *'}),{target:{value:'An mới'}});fireEvent.change(view.getByRole('textbox',{name:'Số điện thoại'}),{target:{value:'0901234567'}});fireEvent.click(view.getByRole('button',{name:'Lưu thay đổi'}));await waitFor(()=>assert.ok(!view.queryByRole('dialog',{name:'Chỉnh sửa hồ sơ'})));assert.deepEqual(written.body,{hoTen:'An mới',soDienThoai:'0901234567'});assert.ok(written.url.endsWith('/users/staff-profile/profile'));assert.equal(written.authorization,'Bearer employee-token');assert.ok(view.getByText('0901234567'));assert.ok(view.getByText('Đã cập nhật hồ sơ cá nhân.'));
  }finally{cleanup();globalThis.fetch=originalFetch}
});

test('reconciliation separates cash values and marks a shortage before the review action',()=>{
  let reviewed;
  const shift={id:'closed',staff_name:'An',staff_username:'an',trang_thai:'CLOSE_PENDING',tien_dau_ca:500000,tien_mat_ky_vong:748000,tien_cuoi_ca:740000,chenh_lech:-8000,thoi_gian_mo_ca:'2026-10-24T05:00:00Z',thoi_gian_dong_ca:'2026-10-24T09:00:00Z'};
  const view=render(h(KioskShiftPanel,{history:[shift],onReview:(decision,item)=>reviewed=[decision,item.id]}));fireEvent.click(view.getByRole('button',{name:'Kiểm tra đối soát'}));assert.ok(view.getByRole('region',{name:'Chi tiết đối soát ca'}));assert.equal(view.getAllByText('Thiếu 8.000đ').length,2);assert.ok(view.getByText('Tiền mặt thực đếm'));assert.equal(view.getByRole('button',{name:'Xác nhận đối soát'}).dataset.variant,'default');fireEvent.click(view.getByRole('button',{name:'Cần kiểm tra lại'}));assert.deepEqual(reviewed,['REJECT','closed']);
});
test('kiosk employee can revisit completed orders, see items and refund only after eligibility with a reason',async()=>{
  const originalFetch=globalThis.fetch,calls=[];let refunded=false;
  const order={ma_don_hang:'receipt-staff',co_so_ma:'KSK-052',ngay_tao:'2026-10-24T06:00:00Z',tong_tien:65000,phuong_thuc_thanh_toan:'TIEN_MAT',trang_thai_don_hang:'HOAN_THANH',trang_thai_thanh_toan:'DA_THANH_TOAN',chi_tiet:[{id:'line',ten_san_pham:'Americano',so_luong:1,gia_ban:65000}]};
  globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),...options});if(String(url).includes('/refund-void'))refunded=true;return{ok:true,json:async()=>String(url).includes('/refund-eligibility')?{hop_le:true}:String(url).includes('/refund-void')?{success:true}:{orders:[{...order,...(refunded?{trang_thai_thanh_toan:'DA_HOAN_TIEN',trang_thai_don_hang:'DA_HUY'}:{})}]}}};
  try{const view=render(h(KioskOrdersPanel,{branchCode:'KSK-052',token:'employee-token'}));await view.findByText('Hoàn tất');assert.ok(calls[0].url.includes('branch_code=KSK-052'));fireEvent.click(view.getByRole('button',{name:'Chi tiết'}));assert.ok(view.getByRole('dialog',{name:'Đơn #RECEIPT-'}));assert.ok(view.getByText('1 × Americano'));fireEvent.click(view.getByRole('button',{name:'Đóng'}));fireEvent.click(view.getByRole('button',{name:'Hoàn tiền'}));await view.findByRole('button',{name:'Xác nhận hoàn tiền'});fireEvent.change(view.getByLabelText('Lý do hoàn tiền *'),{target:{value:'Nhập nhầm món'}});fireEvent.submit(view.getByRole('dialog',{name:'Hoàn tiền đơn hàng'}).querySelector('form'));await view.findByText('Đã hoàn tiền');const mutation=calls.find(call=>call.method==='POST');assert.deepEqual(JSON.parse(mutation.body),{branch_code:'KSK-052',reason:'Nhập nhầm món'});assert.equal(view.queryByRole('button',{name:'Hoàn tiền'}),null);
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('kiosk orders keep a refused refund read-only and employee cancellation permission is respected',async()=>{
  const originalFetch=globalThis.fetch;
  const order={ma_don_hang:'old-order',ngay_tao:'2026-10-20T06:00:00Z',tong_tien:65000,trang_thai_thanh_toan:'DA_THANH_TOAN',chi_tiet:[]};
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('refund-eligibility')?{hop_le:false,ly_do:'Đơn thuộc ca đã chốt'}:{orders:[order]}});
  try{const view=render(h(KioskOrdersPanel,{branchCode:'KSK-052',canRefund:false}));await view.findByText('Hoàn tất');assert.equal(view.getByRole('button',{name:'Hoàn tiền'}).disabled,true);view.rerender(h(KioskOrdersPanel,{branchCode:'KSK-052',canRefund:true}));fireEvent.click(view.getByRole('button',{name:'Hoàn tiền'}));assert.ok(await view.findByText('Đơn thuộc ca đã chốt'));assert.equal(view.queryByRole('button',{name:'Xác nhận hoàn tiền'}),null)}finally{cleanup();globalThis.fetch=originalFetch}
});
test('franchise manager has one page title across all nine modules and uses an editable cashflow modal',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/dashboard/admin')?{success:true,data:{}}:String(url).includes('/thu-chi')?{data:[],tong_thu:0,tong_chi:0}:[]});
  try{const view=render(h(AccountantFranchiseShell,{session:{token:'accountant-token',user:{hoTen:'Quản lý thử',vaiTro:'ACCOUNTANT'}},onLogout(){}}));await view.findByRole('heading',{name:'Tổng quan',level:1});const names=['Hồ sơ đối tác','Mạng lưới Kiosk','Đơn mua Combo','Tổng quan','Thu chi Kiosk','Công nợ Kiosk','Chia sẻ doanh thu','Đối soát gian lận','Nhật ký Audit'];
    for(const name of names){fireEvent.click(Array.from(view.container.querySelectorAll('.workspace-sidebar nav button')).find(button=>button.textContent.includes(name)));await view.findByRole('heading',{name,level:1});await waitFor(()=>assert.equal(view.container.querySelectorAll('.operational-page h1').length,1));}
    fireEvent.click(view.getByRole('button',{name:'Thu chi Kiosk'}));fireEvent.click(await view.findByRole('button',{name:/Lập Phiếu Giao Dịch/}));assert.ok(view.getByRole('dialog',{name:/Lập Phiếu Giao Dịch/}));assert.ok(view.getByRole('button',{name:/Xác nhận tạo/}));
  }finally{cleanup();globalThis.fetch=originalFetch}
});
test('franchise action prompt cancellation never confirms delivery and audit accepts the real array response',async()=>{
  const originalFetch=globalThis.fetch;let mutated=false;
  globalThis.fetch=async(url,options={})=>{if(options.method)mutated=true;return{ok:true,json:async()=>String(url).includes('audit-logs')?[{id:'a1',hanh_dong:'GIAO_DON_COMBO',chi_tiet:'Đơn COMBO-1',thoi_gian:'2026-10-24T05:00:00Z'}]:[{id:'combo-1',kiosk_id:'k1',kiosk:{ten_kiosk:'Kiosk thử'},combo:{ten_combo:'Combo A'},trang_thai:'DA_XAC_NHAN',tong_tien:3500000}]}};
  try{const view=render(h(FranchiseActionProvider,null,h(DonMuaComboTab)));fireEvent.click(await view.findByRole('button',{name:'Xem đơn combo-1'}));fireEvent.click(view.getByRole('button',{name:'Xác nhận đã giao'}));assert.ok(view.getByRole('dialog',{name:'Bổ sung thông tin'}));fireEvent.click(view.getByRole('button',{name:'Hủy'}));assert.equal(mutated,false);view.unmount();const audit=render(h(AuditLogTab));assert.ok(await audit.findByText('Giao combo'));assert.ok(audit.getByText('Đơn COMBO-1'));fireEvent.change(audit.getByRole('textbox',{name:'Tìm nhật ký'}),{target:{value:'không tìm thấy'}});assert.ok(audit.getByText('Không có nhật ký phù hợp.'));
  }finally{cleanup();globalThis.fetch=originalFetch}
});


test('slow workspace imports expose a reload action instead of an endless skeleton',async()=>{
  let reloaded=false;const view=render(h(WorkspaceLoading,{delayMs:15,onReload:()=>reloaded=true}));assert.ok(view.getByRole('status',{name:'Đang tải tổng quan'}));await view.findByRole('alert');assert.equal(view.queryByRole('status',{name:'Đang tải tổng quan'}),null);fireEvent.click(view.getByRole('button',{name:'Tải lại giao diện'}));assert.equal(reloaded,true);
});
test('franchise reads time out cleanly, cancel on navigation and preserve successful responses',async()=>{
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))};
  try{await assert.rejects(franchiseApi('/franchise/ho-so',{},15),/Tải dữ liệu quá lâu/);assert.equal(calls,1);const controller=new AbortController();const loading=franchiseApi('/franchise/dashboard/admin',{signal:controller.signal});controller.abort();await assert.rejects(loading,{name:'AbortError'});globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'profile-1'}]});assert.deepEqual(await franchiseApi('/franchise/ho-so'),[{id:'profile-1'}]);}finally{globalThis.fetch=originalFetch}
});


test('combo documents expose PDF only after acceptance and a paid stamp only after verified settlement',()=>{
  const order={id:'combo-invoice-1',kiosk_id:'k1',kiosk:{ten_kiosk:'Kiosk thử',ma_kiosk:'KSK-052'},combo:{ten_combo:'Combo A'},so_luong:2,don_gia:3500000,tong_tien:7000000,trang_thai:'DA_DAT'};
  const view=render(h(ComboOrderDetail,{order,onClose(){}}));
  assert.equal(view.queryByRole('button',{name:'Tải PDF'}),null);
  assert.equal(view.container.ownerDocument.querySelector('.combo-paid-stamp'),null);
  view.rerender(h(ComboOrderDetail,{order:{...order,trang_thai:'DA_GIAO'},onClose(){}}));
  assert.ok(view.getByRole('button',{name:'Tải PDF'}));
  assert.equal(view.container.ownerDocument.querySelector('.combo-paid-stamp'),null);
  view.rerender(h(ComboOrderDetail,{order:{...order,trang_thai:'DA_GIAO',da_thanh_toan:true},onClose(){}}));
  assert.equal(view.container.ownerDocument.querySelector('.combo-paid-stamp').textContent,'Đã thanh toán');
});
test('combo acceptance stays in detail and cancellation never changes the order',async()=>{
  const originalFetch=globalThis.fetch;let mutated=false;
  globalThis.fetch=async(url,options={})=>{if(options.method)mutated=true;return{ok:true,json:async()=>[{id:'purchase-1',trang_thai:'DA_DAT',so_luong:1,tong_tien:3500000,kiosk:{ten_kiosk:'Kiosk thử'},combo:{ten_combo:'Combo A',mo_ta:'Nội dung đầy đủ chỉ ở chi tiết'}}]}};
  try{const view=render(h(FranchiseActionProvider,null,h(DonMuaComboTab)));await view.findByRole('button',{name:'Xem đơn purchase'});assert.equal(view.queryByText('Nội dung đầy đủ chỉ ở chi tiết'),null);fireEvent.click(view.getByRole('button',{name:'Xem đơn purchase'}));assert.ok(view.getByText('Nội dung đầy đủ chỉ ở chi tiết'));fireEvent.click(view.getByRole('button',{name:'Chấp nhận đơn'}));assert.ok(view.getByRole('dialog',{name:'Xác nhận thao tác'}));fireEvent.click(view.getByRole('button',{name:'Hủy'}));assert.equal(mutated,false)}finally{cleanup();globalThis.fetch=originalFetch}
});
test('kiosk debts exclude royalties and standalone penalties while preserving initial and combo debts',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'initial',loai_phat_sinh:'KHOI_TAO',trang_thai:'CON_NO',so_tien:1000000},{id:'combo',loai_phat_sinh:'NGUYEN_LIEU',trang_thai:'DA_THANH_TOAN',so_tien:2000000},{id:'royalty',loai_phat_sinh:'ROYALTY',trang_thai:'CON_NO',so_tien:999999},{id:'penalty',loai_phat_sinh:'PHAT_TRE_HAN',trang_thai:'CON_NO',so_tien:888888}]});
  try{const view=render(h(FranchiseActionProvider,null,h(CongNoTab)));await view.findByText('Phí nhượng quyền ban đầu');assert.equal(view.container.querySelectorAll('.franchise-record').length,2);assert.ok(!view.container.textContent.includes('999.999'));assert.ok(!view.container.textContent.includes('888.888'));fireEvent.click(view.getByRole('button',{name:'Đã thanh toán'}));await waitFor(()=>assert.equal(view.container.querySelectorAll('.franchise-record').length,1));assert.ok(view.getByRole('button',{name:'Đã thanh toán'}).getAttribute('data-filter-tone')==='success')}finally{cleanup();globalThis.fetch=originalFetch}
});
test('royalty state filters work independently from the API and do not hide full summary totals',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'r1',trang_thai:'DA_THANH_TOAN',so_tien_royalty:100000,thang:'2026-08'},{id:'r2',trang_thai:'DA_XAC_NHAN',so_tien_royalty:200000,thang:'2026-09'}]});
  try{const view=render(h(FranchiseActionProvider,null,h(RoyaltyTab)));await waitFor(()=>assert.equal(view.container.querySelectorAll('.franchise-record').length,2));fireEvent.click(view.getByRole('button',{name:'Đã thanh toán'}));await waitFor(()=>assert.equal(view.container.querySelectorAll('.franchise-record').length,1));assert.ok(view.container.querySelector('.franchise-module-summary').textContent.includes('200.000'))}finally{cleanup();globalThis.fetch=originalFetch}
});

test('returning to royalty refreshes verified settlement without replacing the page with a loader',async()=>{
  const originalFetch=globalThis.fetch;let paid=false;Object.defineProperty(document,'hidden',{configurable:true,value:false});
  globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'r-focus',trang_thai:paid?'DA_THANH_TOAN':'DA_XAC_NHAN',so_tien_royalty:200000,thang:'2026-09'}]});
  try{const view=render(h(FranchiseActionProvider,null,h(RoyaltyTab)));await view.findByRole('button',{name:'Ghi nhận đã thu'});paid=true;fireEvent(window,new window.Event('focus'));assert.equal(view.queryByRole('status',{name:'Đang tải dữ liệu'}),null);await waitFor(()=>assert.equal(Boolean(view.queryByRole('button',{name:'Ghi nhận đã thu'})),false))}finally{cleanup();delete document.hidden;globalThis.fetch=originalFetch}
});
