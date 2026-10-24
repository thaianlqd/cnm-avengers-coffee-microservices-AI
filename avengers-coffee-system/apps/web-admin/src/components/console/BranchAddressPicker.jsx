import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, ExternalLink } from './WorkspaceIcons'
import { API_BASE_URL } from '../../features/admin-dashboard/constants'
import { getAdminAccessToken } from '../../lib/adminFetch'

export default function BranchAddressPicker({ form, setForm }) {
  const id = useId(), request = useRef(0), input = useRef(null)
  const [items, setItems] = useState([]), [status, setStatus] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const selected = form.vi_do != null && form.kinh_do != null && Number.isFinite(form.vi_do) && Number.isFinite(form.kinh_do)
  const ready = Boolean(form.thanh_pho && form.phuong_xa)
  useEffect(() => {
    if (open) document.getElementById(id + '-' + active)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])
  useEffect(() => {
    const version = ++request.current, controller = new AbortController()
    setItems([]); setStatus(''); setActive(0)
    if (!ready || selected || String(form.dia_chi_chi_tiet || '').trim().length < 1) return () => controller.abort()
    setStatus('Đang tìm địa chỉ trên bản đồ…')
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: form.dia_chi_chi_tiet, city: form.thanh_pho, ward: form.phuong_xa })
        const token = getAdminAccessToken()
        const response = await fetch(`${API_BASE_URL}/users/admin/branch-addresses?${params}`, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!response.ok) throw new Error('Không tải được địa chỉ bản đồ. Vui lòng thử lại.')
        const data = await response.json()
        if (controller.signal.aborted || request.current !== version) return
        setItems(data.items || []); setOpen(true)
        setStatus(data.items?.length ? '' : 'Không tìm thấy địa chỉ trong khu vực đã chọn. Thử tên đường hoặc địa điểm khác.')
      } catch (error) {
        if (controller.signal.aborted || request.current !== version) return
        setStatus(error.message || 'Không tải được địa chỉ bản đồ. Vui lòng thử lại.')
      }
    }, 150)
    return () => { clearTimeout(timer); controller.abort() }
  }, [ready, selected, form.dia_chi_chi_tiet, form.thanh_pho, form.phuong_xa])
  const choose = place => {
    ++request.current
    setForm(previous => ({ ...previous, dia_chi_chi_tiet: place.title, dia_chi_ban_do: place.address, vi_do: place.vi_do, kinh_do: place.kinh_do, map_url: `https://www.google.com/maps/search/?api=1&query=${place.vi_do},${place.kinh_do}` }))
    setItems([]); setOpen(false); setStatus('')
  }
  return <div className="branch-address-picker">
    <Label htmlFor={id}>Địa chỉ trên bản đồ <span aria-hidden="true">*</span></Label>
    <Popover open={open && !!items.length} onOpenChange={setOpen}>
    <PopoverAnchor asChild><Input ref={input} id={id} className="ui-input" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open && !!items.length} aria-controls={open && items.length ? id + '-results' : undefined} aria-activedescendant={open && items[active] ? id + '-' + active : undefined} aria-describedby={status ? id + '-status' : undefined}
      disabled={!ready} autoComplete="off" value={form.dia_chi_chi_tiet || ''} placeholder={ready ? 'Nhập số nhà, tên đường hoặc địa điểm…' : 'Chọn tỉnh/thành phố và phường/xã trước'}
      onChange={e => { setForm(previous => ({ ...previous, dia_chi_chi_tiet: e.target.value, dia_chi_ban_do: '', vi_do: null, kinh_do: null, map_url: '' })); setOpen(true) }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={e => {
        if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.max(0, Math.min(active + 1, items.length - 1))) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)) }
        if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); choose(items[active]) }
      }} /></PopoverAnchor>
    <PopoverContent align="start" sideOffset={5} className="workspace-select-popover standard-select-popover branch-address-popover"
      style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: 'min(320px, var(--radix-popover-content-available-height))' }}
      onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}
      onInteractOutside={e => { if (input.current?.contains(e.target)) e.preventDefault() }}>
      <div id={id + '-results'} role="listbox" aria-label="Địa chỉ gợi ý">{items.map((place, index) => <Button key={place.id} variant="ghost" type="button" role="option" id={id + '-' + index} aria-selected={active === index} data-active={active === index} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(place)}><MapPin size={17} aria-hidden="true" /><span><strong>{place.title}</strong><small>{place.address}</small></span></Button>)}</div>
    </PopoverContent>
    </Popover>
    {status && <p id={id + '-status'} className="branch-address-status" role="status">{status}</p>}
    {selected && <div className="branch-address-point"><span>{form.vi_do.toFixed(6)}, {form.kinh_do.toFixed(6)}</span><a href={`https://www.google.com/maps/search/?api=1&query=${form.vi_do},${form.kinh_do}`} target="_blank" rel="noreferrer">Kiểm tra trên bản đồ <ExternalLink size={13} /></a></div>}
  </div>
}
