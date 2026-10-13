// Portal selection constrains login; authorization still comes from the API role guards.
export const WORKSPACE_ROLES = Object.freeze({
  admin: ['ADMIN'], manager: ['MANAGER'], staff: ['STAFF', 'KIOSK_STAFF', 'FRANCHISE_STAFF'],
  partner: ['FRANCHISEE'], accountant: ['ACCOUNTANT'],
})
export const WORKSPACE_LABELS = { admin: 'Admin', manager: 'Quản lý', staff: 'Nhân viên', partner: 'Đối tác kiosk', accountant: 'Kế toán' }
export function workspaceForUser(user) {
  const role = String(user?.vaiTro || user?.vai_tro || '').toUpperCase()
  return Object.keys(WORKSPACE_ROLES).find(key => WORKSPACE_ROLES[key].includes(role)) || null
}
export function acceptsWorkspace(workspace, user) {
  return Object.hasOwn(WORKSPACE_ROLES, workspace) && WORKSPACE_ROLES[workspace].includes(String(user?.vaiTro || user?.vai_tro || '').toUpperCase())
}
export function requestedWorkspace() {
  const value = new URLSearchParams(window.location.search).get('workspace')
  return Object.hasOwn(WORKSPACE_ROLES, value) ? value : null
}
export function readWorkspaceSession() {
  try {
    const raw = window.sessionStorage?.getItem('adminSession') || window.localStorage.getItem('adminSession')
    const session = raw ? JSON.parse(raw) : null
    const workspace = requestedWorkspace()
    return workspaceForUser(session?.user) && (!workspace || acceptsWorkspace(workspace, session.user)) ? session : null
  } catch { return null }
}
export function saveWorkspaceSession(session) {
  window.sessionStorage.setItem('adminSession', JSON.stringify(session))
  // Migrate the old shared session. A different browser tab must not inherit this login.
  window.localStorage.removeItem('adminSession')
}
export function clearWorkspaceSession() {
  window.sessionStorage?.removeItem('adminSession')
  window.localStorage.removeItem('adminSession')
}
