import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import apiClient, { clearAuthToken, setAuthToken } from '../lib/apiClient'
import { clearShipperSession, loadShipperSession, saveShipperSession } from '../lib/storage'

const ShipperContext = createContext(null)

export function ShipperProvider({ children }) {
  const [shipper, setShipper] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    ; (async () => {
      const session = await loadShipperSession()
      if (session.shipper && session.token) {
        setShipper(session.shipper)
        setToken(session.token)
        await setAuthToken(session.token)
      } else {
        await clearShipperSession()
        await clearAuthToken()
      }
      setHydrated(true)
    })()
  }, [])

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

    setShipper(nextShipper)
    setToken(nextToken)
    await setAuthToken(nextToken)
    await saveShipperSession(nextShipper, nextToken)

    return nextShipper
  }

  const updateStatus = async (status) => {
    if (!shipper) return
    await apiClient.patch(`/shippers/${shipper.id}/status`, { status })
    const updatedShipper = { ...shipper, status }
    setShipper(updatedShipper)
    await saveShipperSession(updatedShipper, token)
  }

  const refreshProfile = async () => {
    if (!shipper?.id) return null
    const profile = await apiClient.get(`/shippers/${shipper.id}/profile`)
    setShipper(profile)
    await saveShipperSession(profile, token)
    return profile
  }

  const logout = async () => {
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
