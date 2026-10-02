import { createContext, useContext, useState, useEffect } from 'react'

const ShipperContext = createContext(null)

export const ShipperProvider = ({ children }) => {
  const [shipper, setShipper] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const shipperData = localStorage.getItem('shipper_data')
    if (shipperData) {
      try {
        setShipper(JSON.parse(shipperData))
      } catch (e) {
        console.error('Error parsing shipper data:', e)
      }
    }
    setIsLoading(false)
  }, [])

  const updateShipper = (data) => {
    setShipper(data)
    localStorage.setItem('shipper_data', JSON.stringify(data))
  }

  const logout = () => {
    setShipper(null)
    localStorage.removeItem('shipper_data')
    localStorage.removeItem('shipper_token')
  }

  return (
    <ShipperContext.Provider value={{ shipper, updateShipper, logout, isLoading }}>
      {children}
    </ShipperContext.Provider>
  )
}

export const useShipper = () => {
  const context = useContext(ShipperContext)
  if (!context) {
    throw new Error('useShipper must be used within ShipperProvider')
  }
  return context
}
