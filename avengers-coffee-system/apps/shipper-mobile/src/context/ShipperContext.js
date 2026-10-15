import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import apiClient, { clearAuthToken, setAuthToken } from '../lib/apiClient'
import { clearShipperSession, loadShipperSession, saveShipperSession } from '../lib/storage'

const ShipperContext = createContext(null)

export const globalState = {
  isSimulating: false
};

export function ShipperProvider({ children }) {
  const [shipper, setShipper] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const profileVersion = useRef(0), statusPending = useRef(false)
  const readProfile = useCallback(async (id, sessionToken) => {
    const version = profileVersion.current
    if (statusPending.current) return null
    const fresh = await apiClient.get(`/shippers/${id}/profile`)
    if (version !== profileVersion.current || statusPending.current || !(fresh?.id || fresh?.username)) return null
    setShipper(fresh)
    await saveShipperSession(fresh, sessionToken)
    return fresh
  }, [])

  useEffect(() => {
    ; (async () => {
      const session = await loadShipperSession()
      if (session.shipper && session.token) {
        setShipper(session.shipper)
        setToken(session.token)
        await setAuthToken(session.token)
        setHydrated(true)
        // Refresh fresh shipper profile in background to get latest branch_code
        try {
          await readProfile(session.shipper.id, session.token)
        } catch (e) {
          console.warn('Failed to sync latest profile:', e?.message || e)
        }
      } else {
        await clearShipperSession()
        await clearAuthToken()
        setHydrated(true)
      }
    })()
  }, [readProfile])

  const login = async ({ username, password }) => {
    const response = await apiClient.post('/shippers/login', {
      username: username.trim(),
      password: password.trim(),
    })

    const nextToken = response?.accessToken || response?.access_token || ''
    const nextShipper = response?.shipper

    if (!nextToken || !nextShipper) {
      throw new Error('Đăng nhập thất bại: Backend không trả về token hoặc thông tin shipper')
    }

    ++profileVersion.current
    setShipper(nextShipper)
    setToken(nextToken)
    await setAuthToken(nextToken)
    await saveShipperSession(nextShipper, nextToken)

    return nextShipper
  }

  const updateStatus = async (status) => {
    if (!shipper || statusPending.current) return
    const version = ++profileVersion.current
    statusPending.current = true
    try {
      await apiClient.patch(`/shippers/${shipper.id}/status`, { status })
      if (version !== profileVersion.current) return
      const updated = { ...shipper, status }
      setShipper(updated)
      await saveShipperSession(updated, token)
    } finally { statusPending.current = false }
  }

  const refreshProfile = useCallback(async () => {
    if (!shipper?.id) return null
    return readProfile(shipper.id, token)
  }, [shipper?.id, token, readProfile])

  const logout = async () => {
    ++profileVersion.current
    setShipper(null)
    setToken(null)
    await clearAuthToken()
    await clearShipperSession()
  }

  const value = useMemo(
    () => ({
      shipper,
      token,
      hydrated,
      login,
      updateStatus,
      refreshProfile,
      logout,
    }),
    [hydrated, shipper, token],
  )

  return <ShipperContext.Provider value={value}>{children}</ShipperContext.Provider>
}

export function useShipper() {
  const context = useContext(ShipperContext)
  if (!context) {
    throw new Error('useShipper must be used within ShipperProvider')
  }
  return context
}
