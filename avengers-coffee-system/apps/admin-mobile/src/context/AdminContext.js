import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { setAuthToken } from '../lib/apiClient'
import { clearAdminSession, loadAdminSession, saveAdminSession } from '../lib/storage'

const AdminContext = createContext(null)

const demoAdmin = {
  id: 'admin-demo-001',
  email: 'admin@avengers.local',
  full_name: 'Admin Demo',
  phone: '0987654321',
  avatar_url: null,
  role: 'ADMIN',
  branch_code: 'HN001',
}

export function AdminProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    ;(async () => {
      const session = await loadAdminSession()
      if (session.admin) {
        setAdmin(session.admin)
        setToken(session.token)
        setAuthToken(session.token)
      } else {
        // Demo mode
        const demoToken = `demo-token-${Date.now()}`
        setAdmin(demoAdmin)
        setToken(demoToken)
        setAuthToken(demoToken)
        await saveAdminSession(demoAdmin, demoToken)
      }
      setHydrated(true)
    })()
  }, [])

  const loginWithDemo = async () => {
    const demoToken = `demo-token-${Date.now()}`
    setAdmin(demoAdmin)
    setToken(demoToken)
    setAuthToken(demoToken)
    await saveAdminSession(demoAdmin, demoToken)
    return demoAdmin
  }

  const updateSession = async (nextAdmin, nextToken = token) => {
    setAdmin(nextAdmin)
    if (nextToken) {
      setToken(nextToken)
      setAuthToken(nextToken)
      await saveAdminSession(nextAdmin, nextToken)
      return
    }
    await saveAdminSession(nextAdmin, token)
  }

  const logout = async () => {
    setAdmin(null)
    setToken(null)
    await clearAdminSession()
  }

  const value = useMemo(
    () => ({
      admin,
      token,
      hydrated,
      loginWithDemo,
      updateSession,
      logout,
    }),
    [hydrated, admin, token],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider')
  }
  return context
}
