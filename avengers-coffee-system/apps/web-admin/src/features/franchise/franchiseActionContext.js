import { createContext, useContext } from 'react'
export const ActionContext=createContext(null)
export function useFranchiseAction() {
  return useContext(ActionContext) || {confirm:async()=>false,prompt:async()=>null}
}
