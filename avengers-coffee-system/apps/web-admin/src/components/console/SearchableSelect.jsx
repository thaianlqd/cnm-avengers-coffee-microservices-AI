import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ChevronDown, Check, X, FolderOpen } from './WorkspaceIcons'

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
function readOptions(children, result = []) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment || child.type === 'optgroup') { readOptions(child.props.children, result); return }
    if (child.props.value === undefined) return
    const text = React.Children.toArray(child.props.children).filter(c => typeof c === 'string' || typeof c === 'number').join('')
    result.push({ ...child.props, label: child.props.children, rawLabel: text, displayLabel: child.props['data-display-label'], isParent: child.props['data-is-parent'], isChild: child.props['data-is-child'], badge: child.props['data-badge'] })
  })
  return result
}

/** Shared, keyboard accessible combobox. onChange retains the native select event shape. */
export default function SearchableSelect({ children, options, value, defaultValue = '', onChange, name, id, placeholder = 'Chọn một giá trị', className = '', style, disabled = false, required = false, autoFocus = false, prefixIcon, icon, clearable = false, onBlur, ...props }) {
  const generatedId = useId(), inputId = id || generatedId, listId = inputId + '-options'
  const root = useRef(null), input = useRef(null), list = useRef(null)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [highlight, setHighlight] = useState(0)
  const parsed = useMemo(() => Array.isArray(options) ? options.map(o => ({ ...o, rawLabel: o.rawLabel ?? (typeof o.label === 'string' ? o.label : String(o.value)), label: o.label ?? String(o.value) })) : readOptions(children), [options, children])
  const current = value !== undefined ? value : internalValue
  const selected = parsed.find(o => String(o.value) === String(current))
  const matches = useMemo(() => { const terms = normalize(query).split(/\s+/).filter(Boolean); return parsed.filter(o => terms.every(t => normalize(o.rawLabel + ' ' + o.value + ' ' + (o.keywords || '')).includes(t))) }, [parsed, query])
  const active = Math.max(0, Math.min(highlight, matches.length - 1))
  useEffect(() => { input.current?.setCustomValidity(required && (!selected || String(selected.value) === '') ? 'Vui lòng chọn một giá trị trong danh sách.' : '') }, [required, selected])
  useEffect(() => { if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, active])
  const show = () => { if (disabled) return; setQuery(''); setOpen(true); setHighlight(Math.max(0, parsed.findIndex(o => String(o.value) === String(current)))) }
  const choose = option => {
    if (!option || option.disabled) return
    setInternalValue(option.value)
    const target = { name, value: option.value, id: inputId }
    onChange?.({ target, currentTarget: target, value: option.value })
    setOpen(false); setQuery(''); input.current?.focus()
  }
  const move = direction => {
    let next = active + direction
    while (next >= 0 && next < matches.length && matches[next].disabled) next += direction
    if (next >= 0 && next < matches.length) setHighlight(next)
  }
  return <Popover open={open && !disabled} onOpenChange={next => { setOpen(next); if (!next) setQuery('') }}><PopoverAnchor asChild><div ref={root} className={('standard-searchable-select ' + className).trim()} style={style} data-open={open && !disabled} data-disabled={disabled || undefined}>
    {name && <input type="hidden" name={name} value={current ?? ''} disabled={disabled} />}
    {(prefixIcon || icon) && <span className="standard-select-prefix">{prefixIcon || icon}</span>}
    <Input {...props} ref={input} id={inputId} className="standard-select-input" type="text" role="combobox" autoComplete="off" autoFocus={autoFocus} disabled={disabled}
      aria-label={props['aria-label'] || (!id ? placeholder : undefined)} aria-required={required || undefined} aria-expanded={open && !disabled} aria-controls={open ? listId : undefined} aria-haspopup="listbox" aria-autocomplete="list"
      aria-activedescendant={open && matches[active] ? listId + '-' + active : undefined}
      value={open ? query : selected?.displayLabel || selected?.rawLabel || ''} placeholder={open ? 'Nhập từ khóa để lọc…' : placeholder}
      onClick={() => { if (!open) show() }}
      onBlur={event => { setOpen(false); setQuery(''); onBlur?.(event) }}
      onChange={event => { setQuery(event.target.value); setHighlight(0); setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery('') }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) show(); else move(event.key === 'ArrowDown' ? 1 : -1) }
        if (event.key === 'Enter') { event.preventDefault(); if (open) choose(matches[active]); else show() }
      }} />
    <div className="standard-select-actions">
      {clearable && selected && String(selected.value) !== '' && !disabled && <Button variant="ghost" type="button" className="standard-select-clear" aria-label="Xóa lựa chọn" onMouseDown={e => e.preventDefault()} onClick={() => choose({ value: '' })}><X size={14} /></Button>}
      <Button variant="ghost" type="button" className="standard-select-toggle" aria-label={open ? 'Đóng lựa chọn' : 'Mở lựa chọn'} disabled={disabled} tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => { if (open) setOpen(false); else { input.current?.focus(); show() } }}><ChevronDown size={16} /></Button>
    </div>
  </div></PopoverAnchor>
    <PopoverContent ref={list} id={listId} role="listbox" align="start" sideOffset={5} className="workspace-select-popover standard-select-popover"
      style={{ width: 'max(240px, var(--radix-popover-trigger-width))', maxWidth: 'calc(100vw - 16px)', maxHeight: 'min(300px, var(--radix-popover-content-available-height))' }}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (root.current?.contains(event.target)) event.preventDefault() }}>
      {matches.length ? matches.map((option, index) => <Button variant="ghost" id={listId + '-' + index} type="button" role="option" tabIndex={-1} key={String(option.value) + index} aria-selected={String(option.value) === String(current)} disabled={option.disabled}
        data-active={index === active} data-child={option.isChild || option.level === 2 || undefined} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => choose(option)}>
        {(option.isParent || option.level === 1) && <FolderOpen size={16} />}
        <span>{option.label}</span>{option.badge && <small>{option.badge}</small>}{String(option.value) === String(current) && <Check size={16} />}
      </Button>) : <p role="status">Không tìm thấy kết quả phù hợp.</p>}
    </PopoverContent>
  </Popover>
}
