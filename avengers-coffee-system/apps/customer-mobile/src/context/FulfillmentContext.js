import React, { createContext, useContext, useState } from 'react'
const Context = createContext(null)
export const fulfillmentLabels = { GIAO_TAN_NOI: 'Giao tận nơi', LAY_TAI_QUAN: 'Mang đi', DUNG_TAI_CHO: 'Tại quán' }
export function FulfillmentProvider({ children }) {
  const [mode, setMode] = useState('GIAO_TAN_NOI'), [branch, setBranch] = useState('')
  return <Context.Provider value={{ mode, setMode, branch, setBranch }}>{children}</Context.Provider>
}
export const useFulfillment = () => useContext(Context)
