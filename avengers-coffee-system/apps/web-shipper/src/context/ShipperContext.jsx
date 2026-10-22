import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearShipperSession, shipperSessionExpired, touchShipperSession } from '../lib/idleSession'

const ShipperContext = createContext(null)

export const ShipperProvider = ({ children }) => {
  const [shipper, setShipper] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()
  const logout = useCallback(() => {
    setShipper(null)
    clearShipperSession()
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    try {
      const data = localStorage.getItem('shipper_data')
      if (data && localStorage.getItem('shipper_token') && !shipperSessionExpired()) setShipper(JSON.parse(data))
      else clearShipperSession()
    } catch { clearShipperSession() }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const expire = () => { if (shipperSessionExpired()) logout() }
    const activity = () => {
      if (!shipper) return
      if (shipperSessionExpired()) logout()
      else touchShipperSession()
    }
    window.addEventListener('shipper:auth-expired', logout)
    if (!shipper) return () => window.removeEventListener('shipper:auth-expired', logout)
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => window.addEventListener(event, activity, { passive: true, capture: true }))
    window.addEventListener('focus', expire)
    document.addEventListener('visibilitychange', expire)
    window.addEventListener('storage', expire)
    const timer = setInterval(expire, 1000)
    return () => {
      clearInterval(timer)
      events.forEach(event => window.removeEventListener(event, activity, true))
      window.removeEventListener('focus', expire)
      window.removeEventListener('storage', expire)
      document.removeEventListener('visibilitychange', expire)
      window.removeEventListener('shipper:auth-expired', logout)
    }
  }, [shipper, logout])

  const updateShipper = (data) => {
    if (shipper && shipperSessionExpired()) { logout(); return }
    if (!shipper) touchShipperSession()
    setShipper(data)
    localStorage.setItem('shipper_data', JSON.stringify(data))
  }

  return <ShipperContext.Provider value={{ shipper, updateShipper, logout, isLoading }}>{children}</ShipperContext.Provider>
}

export const useShipper = () => {
  const context = useContext(ShipperContext)
  if (!context) throw new Error('useShipper must be used within ShipperProvider')
  return context
}
