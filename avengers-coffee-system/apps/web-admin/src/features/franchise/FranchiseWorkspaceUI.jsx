import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { CheckCircle2, AlertCircle, X } from '../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'

import { ActionContext } from './franchiseActionContext'
export function FranchiseActionProvider({children}) {
  const [action,setAction]=useState(null),[value,setValue]=useState('')
  const pending=useRef(null)
  useEffect(()=>()=>pending.current?.(null),[])
  const ask=(message,input=false)=>new Promise(resolve=>{pending.current?.(null);pending.current=resolve;setValue('');setAction({message,input})})
  const finish=result=>{pending.current?.(result);pending.current=null;setAction(null)}
  return <ActionContext.Provider value={{confirm:message=>ask(message),prompt:message=>ask(message,true)}}>{children}{action && <WorkspaceDialog title={action.input?'Bổ sung thông tin':'Xác nhận thao tác'} subtitle={action.message} onClose={()=>finish(null)} className="franchise-action-dialog" footer={<><Button variant="outline" onClick={()=>finish(null)}>Hủy</Button><Button variant="default" type="submit" form="franchise-confirm-action">Xác nhận</Button></>}><form id="franchise-confirm-action" className="franchise-action-form" onSubmit={event=>{event.preventDefault();finish(action.input?value:true)}}>{action.input && <><label htmlFor="franchise-action-note">Ghi chú</label><Textarea id="franchise-action-note" value={value} onChange={event=>setValue(event.target.value)} maxLength={2000} rows={3}/></>}</form></WorkspaceDialog>}</ActionContext.Provider>
}
export function FranchiseFeedback({message,onClose}) {
  const close=useRef(onClose)
  useEffect(()=>{close.current=onClose},[onClose])
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>close.current?.(),3000);return()=>clearTimeout(timer)},[message])
  if(!message)return null
  const Icon=message.type==='error'?AlertCircle:CheckCircle2
  return <div className={`franchise-feedback ${message.type==='error'?'is-error':''}`} role={message.type==='error'?'alert':'status'}><Icon size={19}/><span>{message.text}</span><Button variant="ghost" size="icon" aria-label="Đóng thông báo" onClick={onClose}><X size={15}/></Button></div>
}
