import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { setAuthToken } from '../lib/apiClient'
import { clearShipperSession, loadShipperSession, saveShipperSession } from '../lib/storage'

const ShipperContext = createContext(null)

const demoShipper = {
  id: 'f21b8e49-4fa5-4488-a225-27c363745e1c',
  username: 'shipper_demo',
  full_name: 'Phạm Văn A',
  phone: '0901234567',
  branch_code: 'HN001',
  status: 'ACTIVE',
  rating: 4.9,
  total_deliveries: 128,
  avatar_url: null,
  vehicle_type: 'MOTORBIKE',
}

export function ShipperProvider({ children }) {
  const [shipper, setShipper] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    ;(async () => {
      const session = await loadShipperSession()
      if (session.shipper) {
        setShipper(session.shipper)
        setToken(session.token)
        setAuthToken(session.token)
      } else {
        // Auto-login demo mode for testing on physical device
        const demoToken = `demo-token-${Date.now()}`
        setShipper(demoShipper)
        setToken(demoToken)
        setAuthToken(demoToken)
        await saveShipperSession(demoShipper, demoToken)
      }
      setHydrated(true)
    })()
  }, [])

  const loginWithDemo = async () => {
    const demoToken = `demo-token-${Date.now()}`
    setShipper(demoShipper)
    setToken(demoToken)
    setAuthToken(demoToken)
    await saveShipperSession(demoShipper, demoToken)
    return demoShipper
  }

  const updateSession = async (nextShipper, nextToken = token) => {
    setShipper(nextShipper)
    if (nextToken) {
      setToken(nextToken)
      setAuthToken(nextToken)
      await saveShipperSession(nextShipper, nextToken)
      return
    }
    await saveShipperSession(nextShipper, token)
  }

  const logout = async () => {
    setShipper(null)
    setToken(null)
    await clearShipperSession()
  }

  const value = useMemo(
    () => ({
      shipper,
      token,
      hydrated,
      loginWithDemo,
      updateSession,
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
