import { useEffect, useId, useRef, useState } from 'react'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { User } from '../../../components/console/WorkspaceIcons'
import { readWorkspaceSession, saveWorkspaceSession } from '../../../lib/workspaceAuth'
import { validateVietnamesePhone } from '../../../utils/contactFieldValidation'
import { API_BASE_URL } from '../../admin-dashboard/constants'

export default function PersonalContactModal({ isOpen, onClose, session, onProfileUpdated }) {
  const id = useId()
  const lock = useRef(false)
  const user = session?.user || {}
  const [form, setForm] = useState({ name:'',phone:'' })
  const [touched, setTouched] = useState({})
  const [state, setState] = useState({ saving:false,error:'' })
  useEffect(() => {
    if (!isOpen) return
    setForm({ name:user.hoTen || user.ho_ten || '',phone:user.soDienThoai || user.so_dien_thoai || '' })
    setTouched({})
    setState({ saving:false,error:'' })
  }, [isOpen, user.hoTen, user.ho_ten, user.soDienThoai, user.so_dien_thoai])
  if (!isOpen) return null
  const errors = { name:form.name.trim() ? '' : 'Vui lòng nhập họ và tên.',phone:validateVietnamesePhone(form.phone) }
  const save = async event => {
    event.preventDefault()
    setTouched({ name:true,phone:true })
    if (lock.current || errors.name || errors.phone) return
    const userId = user.ma_nguoi_dung || user.maNguoiDung || user.id
    if (!userId) { setState({saving:false,error:'Không xác định được tài khoản. Vui lòng đăng nhập lại.'}); return }
    lock.current = true
    setState({saving:true,error:''})
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`, {
        method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token || session.accessToken}`},
        body:JSON.stringify({hoTen:form.name.trim(),soDienThoai:form.phone.trim()})
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || 'Chưa lưu được hồ sơ. Vui lòng thử lại.')
      const name = payload.user?.ho_ten ?? form.name.trim()
      const phone = payload.user?.so_dien_thoai ?? form.phone.trim()
      const updated = {...user,hoTen:name,ho_ten:name,soDienThoai:phone,so_dien_thoai:phone}
      saveWorkspaceSession({...readWorkspaceSession(),...session,user:updated})
      onProfileUpdated?.(updated)
      onClose()
    } catch(error) { setState({saving:false,error:error.message}) }
    finally { lock.current=false }
  }
  return <WorkspaceDialog title="Chỉnh sửa hồ sơ" subtitle="Cập nhật họ tên và số điện thoại của bạn." icon={User} onClose={onClose} busy={state.saving} className="personal-contact-dialog"
    footer={<><Button variant="outline" disabled={state.saving} onClick={onClose}>Hủy</Button><Button variant="default" type="submit" form={`${id}-form`} disabled={state.saving}>{state.saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></>}>
    <form id={`${id}-form`} onSubmit={save} className="personal-contact-form" noValidate>
      <div className="personal-contact-field"><label htmlFor={`${id}-name`}>Họ và tên <span>*</span></label><Input id={`${id}-name`} autoComplete="name" required maxLength={120} value={form.name} disabled={state.saving} aria-invalid={touched.name && !!errors.name} aria-describedby={touched.name && errors.name ? `${id}-name-error` : undefined} onBlur={() => setTouched(prev=>({...prev,name:true}))} onChange={event=>setForm(prev=>({...prev,name:event.target.value}))} />{touched.name && errors.name && <p id={`${id}-name-error`} className="workspace-form-error">{errors.name}</p>}</div>
      <div className="personal-contact-field"><label htmlFor={`${id}-phone`}>Số điện thoại</label><Input id={`${id}-phone`} type="tel" autoComplete="tel" maxLength={20} value={form.phone} disabled={state.saving} aria-invalid={touched.phone && !!errors.phone} aria-describedby={touched.phone && errors.phone ? `${id}-phone-error` : undefined} onBlur={()=>setTouched(prev=>({...prev,phone:true}))} onChange={event=>setForm(prev=>({...prev,phone:event.target.value}))} />{touched.phone && errors.phone && <p id={`${id}-phone-error`} className="workspace-form-error">{errors.phone}</p>}</div>
      {state.error && <p className="workspace-form-error" role="alert">{state.error}</p>}
    </form>
  </WorkspaceDialog>
}
