import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptsWorkspace, workspaceForUser, readWorkspaceSession, saveWorkspaceSession, clearWorkspaceSession } from '../src/lib/workspaceAuth.js'
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) }
}
test('role contrast matrix rejects every other portal, including kiosk staff versus franchise owner', () => {
  const roles = { admin: ['ADMIN'], manager: ['MANAGER'], staff: ['STAFF','KIOSK_STAFF','FRANCHISE_STAFF'], partner: ['FRANCHISEE'], accountant: ['ACCOUNTANT'] }
  for (const [workspace, members] of Object.entries(roles)) for (const vaiTro of members) {
    assert.equal(workspaceForUser({vaiTro}), workspace)
    for (const other of Object.keys(roles)) assert.equal(acceptsWorkspace(other, {vaiTro}), other === workspace)
  }
  assert.equal(acceptsWorkspace('toString', { vaiTro: 'ADMIN' }), false)
  assert.equal(workspaceForUser({vaiTro: 'CUSTOMER'}), null)
})
test('restore does not reuse another actor session and tab-local tokens survive refresh independently', () => {
  globalThis.window = { location: {search:'?workspace=partner'}, localStorage:storage(), sessionStorage:storage() }
  const manager = { token:'manager-fixture', user:{vaiTro:'MANAGER'} }
  window.localStorage.setItem('adminSession', JSON.stringify(manager))
  assert.equal(readWorkspaceSession(),null)
  window.location.search='?workspace=manager'
  assert.deepEqual(readWorkspaceSession(),manager)
  saveWorkspaceSession(manager)
  assert.equal(window.localStorage.getItem('adminSession'),null)
  const managerTab = window.sessionStorage
  window.sessionStorage=storage()
  assert.equal(readWorkspaceSession(),null)
  window.location.search='?workspace=partner'
  const partner = {token:'partner-fixture',user:{vaiTro:'FRANCHISEE'}}
  saveWorkspaceSession(partner)
  assert.equal(readWorkspaceSession().token,'partner-fixture')
  clearWorkspaceSession()
  window.sessionStorage=managerTab
  window.location.search='?workspace=manager'
  assert.equal(readWorkspaceSession().token,'manager-fixture')
  window.sessionStorage.setItem('adminSession','malformed')
  assert.equal(readWorkspaceSession(),null)
  delete globalThis.window
})
